const OFFSCREEN_URL = "offscreen.html";
const CONTENT_HELPER_FILE = "content-helper.js";
const MAX_CAPTURE_CALLS_PER_SECOND = chrome.tabs.MAX_CAPTURE_VISIBLE_TAB_CALLS_PER_SECOND || 2;
const CAPTURE_INTERVAL_MS = Math.ceil(1000 / MAX_CAPTURE_CALLS_PER_SECOND) + 150;
const CAPTURE_RETRY_LIMIT = 4;
const POST_SCROLL_CAPTURE_DELAY_MS = 160;

let captureStatus = {
  busy: false,
  percent: 0,
  message: "等待开始",
  detail: "建议截图时保持标签页在前台。",
  error: false
};

let offscreenCreationPromise = null;
const offscreenRequests = new Map();
let lastCaptureStartedAt = 0;

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  switch (message?.type) {
    case "GET_STATUS":
      sendResponse({ ok: true, status: captureStatus });
      return false;
    case "GET_PAGE_INFO":
      handleGetPageInfo(message.options)
        .then((pageInfo) => sendResponse({ ok: true, pageInfo }))
        .catch((error) => sendResponse({ ok: false, error: error.message }));
      return true;
    case "START_CAPTURE":
      handleCapture(message.options)
        .then((result) => sendResponse({ ok: true, result }))
        .catch((error) => sendResponse({ ok: false, error: error.message }));
      return true;
    case "DOWNLOAD_CAPTURE_RESULT":
      handleDeferredDownloadWithTabSync(message.payload)
        .then((result) => sendResponse({ ok: true, result }))
        .catch((error) => sendResponse({ ok: false, error: error.message }));
      return true;
    case "START_LINE_PICK":
      handleStartLinePick(message.options)
        .then((result) => sendResponse({ ok: true, result }))
        .catch((error) => sendResponse({ ok: false, error: error.message }));
      return true;
    case "LINE_PICK_CONFIRMED":
      handleLinePickConfirmed(sender.tab, message.options)
        .then((result) => sendResponse({ ok: true, result }))
        .catch((error) => sendResponse({ ok: false, error: error.message }));
      return true;
    case "CLEAR_LINE_RANGE":
      handleClearLineRange()
        .then((result) => sendResponse({ ok: true, result }))
        .catch((error) => sendResponse({ ok: false, error: error.message }));
      return true;
    case "OFFSCREEN_RESULT":
      resolveOffscreenRequest(message);
      sendResponse({ ok: true });
      return false;
    default:
      return false;
  }
});

async function handleGetPageInfo(options = {}) {
  const tab = await getActiveTab();
  assertSupportedUrl(tab.url);
  await injectContentHelper(tab.id);
  let prepared = false;

  try {
    await sendTabMessage(tab.id, {
      type: "FULLPAGE_PREPARE",
      options
    });
    prepared = true;

    const metrics = await sendTabMessage(tab.id, {
      type: "FULLPAGE_GET_METRICS",
      options
    });

    return {
      title: tab.title || "未命名页面",
      url: tab.url,
      fullWidth: metrics.fullWidth,
      fullHeight: metrics.fullHeight,
      regionLabel: metrics.regionLabel || "页面",
      totalPages: countTotalPages(metrics),
      lineRange: describeLineRange(metrics),
      fullTextExpanded: Boolean(metrics.fullTextExpanded)
    };
  } finally {
    if (prepared) {
      try {
        await sendTabMessage(tab.id, { type: "FULLPAGE_CLEANUP" });
      } catch (cleanupError) {
        console.warn("读取页面信息后的清理失败", cleanupError);
      }
    }
  }
}

async function handleCapture(options = {}, explicitTab = null) {
  if (captureStatus.busy) {
    throw new Error("已有截图任务正在进行，请稍后再试。");
  }

  const tab = explicitTab?.id ? explicitTab : await getActiveTab();
  assertSupportedUrl(tab.url);

  updateStatus({
    busy: true,
    percent: 2,
    message: "准备页面",
    detail: "正在注入页面辅助脚本并读取尺寸信息。"
  });

  let prepared = false;

  try {
    await injectContentHelper(tab.id);
    syncStatusToTab(tab.id);
    await sendTabMessage(tab.id, {
      type: "FULLPAGE_PREPARE",
      options
    });
    prepared = true;

    const metrics = await sendTabMessage(tab.id, { type: "FULLPAGE_GET_METRICS" });
    const positions = buildCapturePositions(metrics);
    const capturePlan = buildCapturePlan(metrics, positions, options);
    const tiles = [];

    updateStatus({
      busy: true,
      percent: 8,
      message: "开始截图",
      detail: `${metrics.regionLabel || "目标区域"}，${capturePlan.label}，共需采集 ${capturePlan.selectedPositions.length} 个切片。${options.suppressRepeatedHeaders !== false ? "表头去重已开启，仅保留第一屏表头。" : ""}`
    }, tab.id);

    for (let index = 0; index < capturePlan.selectedPositions.length; index += 1) {
      const target = capturePlan.selectedPositions[index];
      const settled = await sendTabMessage(tab.id, {
        type: "FULLPAGE_SCROLL_TO",
        x: target.x,
        y: target.y,
        keepRepeatingHeaders: index === 0
      });
      const settledX = Number.isFinite(settled?.x) ? settled.x : settled?.scrollX;
      const settledY = Number.isFinite(settled?.y) ? settled.y : settled?.scrollY;

      if (!Number.isFinite(settledX) || !Number.isFinite(settledY)) {
        throw new Error("截图坐标读取失败，页面滚动位置不可用。");
      }

      await sleep(POST_SCROLL_CAPTURE_DELAY_MS);
      await setTabExtensionUiVisible(tab.id, false);
      let dataUrl = null;
      try {
        const captured = await captureVisibleTabWithQuota(tab.windowId);
        dataUrl = captured;
        await sendTabMessage(tab.id, { type: "FULLPAGE_MARK_TILE_CAPTURED" });
      } finally {
        await setTabExtensionUiVisible(tab.id, true);
      }

      tiles.push({
        x: settledX,
        y: settledY,
        duplicateHeaderCropTop: index === 0 ? 0 : Math.max(
          capturePlan.exportMetrics.tileOverlapTop || 0,
          settled?.duplicateHeaderCropTop || 0
        ),
        dataUrl
      });

      const percent = 8 + Math.round(((index + 1) / capturePlan.selectedPositions.length) * 72);
      updateStatus({
        busy: true,
        percent,
        message: `截图中 ${index + 1} / ${capturePlan.selectedPositions.length}`,
        detail: `正在导出 ${capturePlan.label}`
      }, tab.id);
    }

    updateStatus({
      busy: true,
      percent: 84,
      message: "拼接图片",
      detail: "正在离屏合成截图。"
    }, tab.id);

    const result = await runOffscreenTask({
      type: "STITCH_AND_DOWNLOAD",
      metrics: capturePlan.exportMetrics,
      tiles,
      options,
      pageTitle: tab.title || "网页截图",
      pageUrl: tab.url
    });

    if (options.deferDownloadForClipboard) {
      updateStatus({
        busy: true,
        percent: 92,
        message: "等待复制到剪贴板",
        detail: "图片已合成，正在复制到剪贴板后再保存。"
      }, tab.id);

      return {
        ...result,
        downloadDeferred: true,
        captureMode: capturePlan.captureMode,
        startPage: capturePlan.startPage,
        endPage: capturePlan.endPage,
        totalPages: positions.length
      };
    }

    updateStatus({
      busy: true,
      percent: 92,
      message: "启动下载",
      detail: "正在调用 Chrome 下载接口。"
    }, tab.id);

    await downloadWithFallback(result.downloadUrl, result.filename, options.saveAs !== false);

    updateStatus({
      busy: false,
      percent: 100,
      message: "导出完成",
      detail: [
        `${result.width} × ${result.height}px / ${formatBytes(result.fileSizeBytes)}`,
        result.clipboardCopied
          ? "已同步复制到系统剪贴板"
          : (result.clipboardError ? `剪贴板复制失败：${result.clipboardError}` : "")
      ].filter(Boolean).join(" / ")
    }, tab.id);

    return {
      ...result,
      captureMode: capturePlan.captureMode,
      startPage: capturePlan.startPage,
      endPage: capturePlan.endPage,
      totalPages: positions.length
    };
  } catch (error) {
    updateStatus({
      busy: false,
      percent: 0,
      message: "导出失败",
      detail: error.message,
      error: true
    }, tab.id);
    throw error;
  } finally {
    if (prepared) {
      try {
        await sendTabMessage(tab.id, { type: "FULLPAGE_CLEANUP" });
      } catch (cleanupError) {
        console.warn("清理页面状态失败", cleanupError);
      }
    }
  }
}

async function handleDeferredDownload(payload = {}) {
  if (!payload.downloadUrl || !payload.filename) {
    throw new Error("下载信息不完整，无法保存图片。");
  }

  updateStatus({
    busy: true,
    percent: 98,
    message: "启动下载",
    detail: "剪贴板处理完成，正在保存图片。"
  });

  await downloadWithFallback(payload.downloadUrl, payload.filename, payload.saveAs !== false);

  updateStatus({
    busy: false,
    percent: 100,
    message: "导出完成",
    detail: [
      `${payload.width || 0} × ${payload.height || 0}px / ${formatBytes(payload.fileSizeBytes)}`,
      payload.clipboardCopied
        ? "已同步复制到系统剪贴板"
        : (payload.clipboardError ? `剪贴板复制失败：${payload.clipboardError}` : "")
    ].filter(Boolean).join(" / ")
  });

  return {
    downloaded: true
  };
}

async function handleDeferredDownloadWithTabSync(payload = {}) {
  const tab = await getActiveTab().catch(() => null);
  const tabId = tab?.id || null;

  if (!payload.downloadUrl || !payload.filename) {
    const error = new Error("下载信息不完整，无法保存图片。");
    updateStatus({
      busy: false,
      percent: 0,
      message: "导出失败",
      detail: error.message,
      error: true
    }, tabId);
    throw error;
  }

  try {
    updateStatus({
      busy: true,
      percent: 98,
      message: "启动下载",
      detail: "剪贴板处理完成，正在保存图片。"
    }, tabId);

    await downloadWithFallback(payload.downloadUrl, payload.filename, payload.saveAs !== false);

    updateStatus({
      busy: false,
      percent: 100,
      message: "导出完成",
      detail: [
        `${payload.width || 0} × ${payload.height || 0}px / ${formatBytes(payload.fileSizeBytes)}`,
        payload.clipboardCopied
          ? "已同步复制到系统剪贴板"
          : (payload.clipboardError ? `剪贴板复制失败：${payload.clipboardError}` : "")
      ].filter(Boolean).join(" / ")
    }, tabId);

    return {
      downloaded: true
    };
  } catch (error) {
    updateStatus({
      busy: false,
      percent: 0,
      message: "导出失败",
      detail: error.message,
      error: true
    }, tabId);
    throw error;
  }
}

async function handleStartLinePick(options = {}) {
  const tab = await getActiveTab();
  assertSupportedUrl(tab.url);
  await injectContentHelper(tab.id);
  await sendTabMessage(tab.id, {
    type: "FULLPAGE_START_LINE_PICK",
    options
  });
  return { active: true };
}

async function handleLinePickConfirmed(tab, options = {}) {
  if (!tab?.id) {
    return { queued: false };
  }

  handleCapture(options, tab).catch((error) => {
    console.error("起止线自动截图失败", error);
  });

  return { queued: true };
}

async function handleClearLineRange() {
  const tab = await getActiveTab();
  assertSupportedUrl(tab.url);
  await injectContentHelper(tab.id);
  await sendTabMessage(tab.id, {
    type: "FULLPAGE_CLEAR_LINE_RANGE"
  });
  return { cleared: true };
}

async function getActiveTab() {
  const [tab] = await chrome.tabs.query({
    active: true,
    currentWindow: true
  });

  if (!tab?.id) {
    throw new Error("未找到当前活动标签页。");
  }

  return tab;
}

function assertSupportedUrl(url = "") {
  if (!/^https?:|^file:/i.test(url)) {
    throw new Error("当前页面不支持截图。请切换到普通网页或文件页后重试。");
  }
}

async function injectContentHelper(tabId) {
  await chrome.scripting.executeScript({
    target: { tabId },
    files: [CONTENT_HELPER_FILE]
  });
}

function sendTabMessage(tabId, message) {
  return new Promise((resolve, reject) => {
    chrome.tabs.sendMessage(tabId, message, (response) => {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message));
        return;
      }

      if (!response?.ok) {
        reject(new Error(response?.error || "页面消息返回异常。"));
        return;
      }

      resolve(response.data);
    });
  });
}

function buildCapturePositions(metrics) {
  const xs = buildAxisPositions(metrics.fullWidth, metrics.captureWidth, metrics.stepWidth);
  const ys = buildAxisPositions(metrics.fullHeight, metrics.captureHeight, metrics.stepHeight);
  const positions = [];
  const seen = new Set();

  for (const y of ys) {
    for (const x of xs) {
      const key = `${x}:${y}`;
      if (seen.has(key)) {
        continue;
      }

      seen.add(key);
      positions.push({ x, y });
    }
  }

  return positions;
}

function buildAxisPositions(fullSize, viewportSize, stepSize = viewportSize) {
  if (!Number.isFinite(fullSize) || !Number.isFinite(viewportSize) || viewportSize <= 0) {
    return [0];
  }

  const increment = Number.isFinite(stepSize) && stepSize > 0 ? stepSize : viewportSize;
  const visibleSpan = Math.min(viewportSize, increment);

  if (fullSize <= visibleSpan) {
    return [0];
  }

  const positions = [];
  const lastStart = Math.max(0, fullSize - visibleSpan);

  for (let offset = 0; offset < fullSize; offset += increment) {
    positions.push(Math.min(offset, lastStart));
  }

  if (positions[positions.length - 1] !== lastStart) {
    positions.push(lastStart);
  }

  return [...new Set(positions)];
}

function buildCapturePlan(metrics, positions, options = {}) {
  const totalPages = countTotalPages(metrics);
  if (!positions.length || totalPages < 1) {
    throw new Error("当前区域没有可截图的屏数。");
  }

  if (options.captureScope === "line") {
    return buildLineCapturePlan(metrics, positions);
  }

  const pageRange = resolvePageCaptureRange(totalPages, options);
  const selectedRows = buildVerticalPages(metrics).filter((page) => page.page >= pageRange.startPage && page.page <= pageRange.endPage);
  const selectedRowOffsets = new Set(selectedRows.map((page) => page.top));
  const selectedPositions = positions.filter((position) => selectedRowOffsets.has(position.y));
  const exportRect = buildExportRect(metrics, selectedPositions);

  return {
    captureMode: pageRange.startPage === 1 && pageRange.endPage === totalPages ? "all" : "custom",
    label: formatPageRangeLabel(pageRange.startPage, pageRange.endPage),
    startPage: pageRange.startPage,
    endPage: pageRange.endPage,
    selectedPositions,
    exportMetrics: buildExportMetrics(metrics, exportRect)
  };
}

function buildLineCapturePlan(metrics, positions) {
  const lineRange = normalizeLineRange(metrics);
  const verticalPages = buildVerticalPages(metrics);
  const selectedPageRows = verticalPages.filter((page) => rangesOverlap(page.top, page.bottom, lineRange.startOffset, lineRange.endOffset));

  if (!selectedPageRows.length) {
    throw new Error("起止线之间没有可截图内容，请重新设置。");
  }

  const selectedRowOffsets = new Set(selectedPageRows.map((page) => page.top));
  const selectedPositions = positions.filter((position) => selectedRowOffsets.has(position.y));
  const exportRect = buildExportRect(metrics, selectedPositions, {
    top: lineRange.startOffset,
    bottom: lineRange.endOffset
  });

  return {
    captureMode: "line",
    label: `起止线范围（${formatPageRangeLabel(selectedPageRows[0].page, selectedPageRows[selectedPageRows.length - 1].page)}）`,
    startPage: selectedPageRows[0].page,
    endPage: selectedPageRows[selectedPageRows.length - 1].page,
    selectedPositions,
    exportMetrics: buildExportMetrics(metrics, exportRect)
  };
}

function resolvePageCaptureRange(totalPages, options = {}) {
  if (options.captureScope !== "custom") {
    return {
      startPage: 1,
      endPage: totalPages
    };
  }

  const rawStartPage = parsePositivePageNumber(options.startPage, "开始屏");
  const rawEndPage = parsePositivePageNumber(options.endPage, "结束屏");

  if (rawStartPage > totalPages || rawEndPage > totalPages) {
    throw new Error(`屏号不能超过当前最大屏数 ${totalPages}。`);
  }

  return {
    startPage: Math.min(rawStartPage, rawEndPage),
    endPage: Math.max(rawStartPage, rawEndPage)
  };
}

function parsePositivePageNumber(value, label) {
  const text = String(value ?? "").trim();
  if (!/^\d+$/.test(text)) {
    throw new Error(`${label}必须是大于等于 1 的正整数。`);
  }

  const pageNumber = Number.parseInt(text, 10);
  if (!Number.isInteger(pageNumber) || pageNumber < 1) {
    throw new Error(`${label}必须是大于等于 1 的正整数。`);
  }

  return pageNumber;
}

function buildExportRect(metrics, positions, overrides = {}) {
  if (!positions.length) {
    throw new Error("当前范围没有可用切片。");
  }

  let left = Number.POSITIVE_INFINITY;
  let top = Number.POSITIVE_INFINITY;
  let right = 0;
  let bottom = 0;

  for (const position of positions) {
    const tileWidth = Math.min(metrics.captureWidth, Math.max(0, metrics.fullWidth - position.x));
    const tileHeight = Math.min(metrics.captureHeight, Math.max(0, metrics.fullHeight - position.y));
    left = Math.min(left, position.x);
    top = Math.min(top, position.y);
    right = Math.max(right, position.x + tileWidth);
    bottom = Math.max(bottom, position.y + tileHeight);
  }

  const exportLeft = clamp(Number.isFinite(overrides.left) ? overrides.left : left, left, right);
  const exportTop = clamp(Number.isFinite(overrides.top) ? overrides.top : top, top, bottom);
  const exportRight = clamp(Number.isFinite(overrides.right) ? overrides.right : right, exportLeft + 1, right);
  const exportBottom = clamp(Number.isFinite(overrides.bottom) ? overrides.bottom : bottom, exportTop + 1, bottom);

  return {
    left: exportLeft,
    top: exportTop,
    right: exportRight,
    bottom: exportBottom,
    width: Math.max(1, exportRight - exportLeft),
    height: Math.max(1, exportBottom - exportTop)
  };
}

function buildExportMetrics(metrics, exportRect) {
  return {
    ...metrics,
    exportRect,
    exportWidth: exportRect.width,
    exportHeight: exportRect.height
  };
}

function countTotalPages(metrics) {
  return buildVerticalPages(metrics).length;
}

function buildVerticalPages(metrics) {
  const ys = buildAxisPositions(metrics.fullHeight, metrics.captureHeight, metrics.stepHeight);
  return ys.map((top, index) => ({
    page: index + 1,
    top,
    bottom: Math.min(metrics.fullHeight, top + metrics.captureHeight)
  }));
}

function describeLineRange(metrics) {
  if (!metrics?.lineRange) {
    return {
      exists: false
    };
  }

  const lineRange = normalizeLineRange(metrics);
  const overlappingPages = buildVerticalPages(metrics).filter((page) => rangesOverlap(page.top, page.bottom, lineRange.startOffset, lineRange.endOffset));

  if (!overlappingPages.length) {
    return {
      exists: false
    };
  }

  return {
    exists: true,
    startOffset: lineRange.startOffset,
    endOffset: lineRange.endOffset,
    height: lineRange.height,
    startPage: overlappingPages[0].page,
    endPage: overlappingPages[overlappingPages.length - 1].page
  };
}

function normalizeLineRange(metrics) {
  const rawStartOffset = Number(metrics?.lineRange?.startOffset);
  const rawEndOffset = Number(metrics?.lineRange?.endOffset);

  if (!Number.isFinite(rawStartOffset) || !Number.isFinite(rawEndOffset)) {
    throw new Error("还没有设置起止线，请先去页面设置。");
  }

  const minOffset = Math.min(rawStartOffset, rawEndOffset);
  const maxOffset = Math.max(rawStartOffset, rawEndOffset);
  const maxHeight = Math.max(1, metrics.fullHeight);
  const startOffset = clamp(Math.round(minOffset), 0, maxHeight - 1);
  const endOffset = clamp(Math.round(maxOffset), startOffset + 1, maxHeight);

  return {
    startOffset,
    endOffset,
    height: endOffset - startOffset
  };
}

function rangesOverlap(aStart, aEnd, bStart, bEnd) {
  return aEnd > bStart && aStart < bEnd;
}

function formatPageRangeLabel(startPage, endPage) {
  return startPage === endPage
    ? `第 ${startPage} 屏`
    : `第 ${startPage}-${endPage} 屏`;
}

function updateStatus(next, tabId = null) {
  captureStatus = {
    ...captureStatus,
    ...next,
    error: Boolean(next.error)
  };

  chrome.runtime.sendMessage({
    type: "CAPTURE_PROGRESS",
    payload: captureStatus
  }).catch(() => {});

  if (tabId) {
    syncStatusToTab(tabId);
  }
}

function syncStatusToTab(tabId) {
  if (!tabId) {
    return;
  }

  chrome.tabs.sendMessage(tabId, {
    type: "FULLPAGE_PROGRESS",
    payload: captureStatus
  }, () => {
    void chrome.runtime.lastError;
  });
}

async function setTabExtensionUiVisible(tabId, visible) {
  if (!tabId) {
    return;
  }

  try {
    await sendTabMessage(tabId, {
      type: "FULLPAGE_SET_EXTENSION_UI_VISIBLE",
      visible
    });
  } catch (error) {
    console.warn("切换页面状态层可见性失败", error);
  }
}

async function ensureOffscreenDocument() {
  const offscreenUrl = chrome.runtime.getURL(OFFSCREEN_URL);
  const existing = await chrome.runtime.getContexts({
    contextTypes: ["OFFSCREEN_DOCUMENT"],
    documentUrls: [offscreenUrl]
  });

  if (existing.length > 0) {
    return;
  }

  if (!offscreenCreationPromise) {
    offscreenCreationPromise = chrome.offscreen.createDocument({
      url: OFFSCREEN_URL,
      reasons: ["BLOBS", "CLIPBOARD"],
      justification: "Compose full-page screenshot tiles, export an image blob, and copy the final image to the clipboard."
    }).finally(() => {
      offscreenCreationPromise = null;
    });
  }

  await offscreenCreationPromise;
}

async function runOffscreenTask(payload) {
  await ensureOffscreenDocument();
  const requestId = crypto.randomUUID();

  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      offscreenRequests.delete(requestId);
      reject(new Error("图片离屏处理超时，请重试。"));
    }, 180000);

    offscreenRequests.set(requestId, {
      resolve,
      reject,
      timeout
    });

    chrome.runtime.sendMessage({
      type: "OFFSCREEN_PROCESS",
      requestId,
      payload
    }).catch((error) => {
      clearTimeout(timeout);
      offscreenRequests.delete(requestId);
      reject(error);
    });
  });
}

function resolveOffscreenRequest(message) {
  const pending = offscreenRequests.get(message.requestId);
  if (!pending) {
    return;
  }

  clearTimeout(pending.timeout);
  offscreenRequests.delete(message.requestId);

  if (message.ok) {
    pending.resolve(message.result);
    return;
  }

  pending.reject(new Error(message.error || "离屏处理失败。"));
}

function formatBytes(bytes) {
  if (!Number.isFinite(bytes) || bytes <= 0) {
    return "0 B";
  }

  if (bytes < 1024) {
    return `${bytes} B`;
  }

  if (bytes < 1024 * 1024) {
    return `${(bytes / 1024).toFixed(1)} KB`;
  }

  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

async function captureVisibleTabWithQuota(windowId) {
  let lastError = null;

  for (let attempt = 1; attempt <= CAPTURE_RETRY_LIMIT; attempt += 1) {
    await waitForCaptureQuotaWindow();
    lastCaptureStartedAt = Date.now();

    try {
      return await chrome.tabs.captureVisibleTab(windowId, { format: "png" });
    } catch (error) {
      lastError = error;

      if (!isCaptureQuotaError(error) || attempt === CAPTURE_RETRY_LIMIT) {
        throw error;
      }

      await sleep(CAPTURE_INTERVAL_MS * attempt);
    }
  }

  throw lastError || new Error("截图失败。");
}

async function waitForCaptureQuotaWindow() {
  const elapsed = Date.now() - lastCaptureStartedAt;
  const waitMs = CAPTURE_INTERVAL_MS - elapsed;

  if (waitMs > 0) {
    await sleep(waitMs);
  }
}

function isCaptureQuotaError(error) {
  return /MAX_CAPTURE_VISIBLE_TAB_CALLS_PER_SECOND/i.test(error?.message || "");
}

function sleep(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

async function downloadWithFallback(url, filename, saveAs) {
  if (!chrome.downloads?.download) {
    throw new Error("Chrome 下载接口不可用，请重新加载扩展后重试。");
  }

  try {
    await chrome.downloads.download({
      url,
      filename,
      saveAs,
      conflictAction: "uniquify"
    });
  } catch (error) {
    if (!saveAs) {
      throw error;
    }

    await chrome.downloads.download({
      url,
      filename,
      saveAs: false,
      conflictAction: "uniquify"
    });
  }
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}
