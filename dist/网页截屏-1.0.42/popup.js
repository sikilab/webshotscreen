const form = document.getElementById("capture-form");
const scrollTargetField = document.getElementById("scroll-target");
const captureScopeField = document.getElementById("capture-scope");
const pageRangeField = document.getElementById("page-range-field");
const lineRangeField = document.getElementById("line-range-field");
const startPageField = document.getElementById("start-page");
const endPageField = document.getElementById("end-page");
const pageRangeHint = document.getElementById("page-range-hint");
const pickLineRangeButton = document.getElementById("pick-line-range-button");
const clearLineRangeButton = document.getElementById("clear-line-range-button");
const lineRangeStatus = document.getElementById("line-range-status");
const formatField = document.getElementById("format");
const resolutionPresetField = document.getElementById("resolution-preset");
const customWidthField = document.getElementById("custom-width");
const customWidthWrapper = document.getElementById("custom-width-field");
const maxSizeValueField = document.getElementById("max-size-value");
const maxSizeUnitField = document.getElementById("max-size-unit");
const hideFixedField = document.getElementById("hide-fixed");
const dedupeHeadersField = document.getElementById("dedupe-headers");
const saveAsField = document.getElementById("save-as");
const captureButton = document.getElementById("capture-button");
const pageTitle = document.getElementById("page-title");
const pageSize = document.getElementById("page-size");
const statusText = document.getElementById("status-text");
const resultText = document.getElementById("result-text");
const progressBar = document.getElementById("progress-bar");

const STORAGE_KEY = "fullpageScreenshotOptions";

let currentPageInfo = null;
let lastPageInfoKey = "";

document.addEventListener("DOMContentLoaded", async () => {
  bindEvents();
  await restoreOptions();
  await refreshPageInfo();
  await refreshCaptureState();
});

function bindEvents() {
  resolutionPresetField.addEventListener("change", () => {
    updateCustomWidthVisibility();
    persistOptions();
  });

  scrollTargetField.addEventListener("change", async () => {
    await persistOptions();
    await refreshPageInfo();
  });

  captureScopeField.addEventListener("change", () => {
    updateScopeVisibility();
    updatePageRangeHint();
    updateLineRangeStatus();
    persistOptions();
  });

  for (const field of [startPageField, endPageField]) {
    field.addEventListener("input", () => {
      updatePageRangeHint();
      persistOptions();
    });
    field.addEventListener("change", () => {
      clampPageRangeInputs();
      updatePageRangeHint();
      persistOptions();
    });
  }

  pickLineRangeButton.addEventListener("click", async () => {
    try {
      await persistOptions();
      setStatus("等待页面设置起止线", 0);
      resultText.textContent = "请回到页面，先点击开始线，再滚动到结束位置点击结束线；完成后会自动保存图片。";
      resultText.className = "hint";

      const captureOptions = {
        ...buildOptions(null),
        saveAs: true,
        deferDownloadForClipboard: false
      };
      const response = await sendMessage({
        type: "START_LINE_PICK",
        options: {
          scrollTarget: scrollTargetField.value,
          captureOptions
        }
      });

      if (!response?.ok) {
        throw new Error(response?.error || "无法进入起止线设置模式。");
      }

      window.setTimeout(() => {
        window.close();
      }, 180);
    } catch (error) {
      setStatus("起止线设置失败", 0, "warn");
      resultText.textContent = error.message || "无法进入页面起止线设置模式。";
      resultText.className = "hint warn";
    }
  });

  clearLineRangeButton.addEventListener("click", async () => {
    try {
      const response = await sendMessage({
        type: "CLEAR_LINE_RANGE"
      });

      if (!response?.ok) {
        throw new Error(response?.error || "清空起止线失败。");
      }

      await refreshPageInfo();
      setStatus("已清空起止线", 0, "ok");
      resultText.textContent = "当前滚动区域的起止线已清空。";
      resultText.className = "hint ok";
    } catch (error) {
      setStatus("清空失败", 0, "warn");
      resultText.textContent = error.message || "清空起止线失败。";
      resultText.className = "hint warn";
    }
  });

  for (const field of [
    formatField,
    customWidthField,
    maxSizeValueField,
    maxSizeUnitField,
    hideFixedField,
    dedupeHeadersField,
    saveAsField
  ]) {
    field.addEventListener("change", persistOptions);
    field.addEventListener("input", persistOptions);
  }

  chrome.runtime.onMessage.addListener((message) => {
    if (message?.type === "CAPTURE_PROGRESS") {
      renderProgress(message.payload);
    }
  });

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    await persistOptions();

    if (!currentPageInfo?.totalPages) {
      setStatus("页面信息未准备好", 0, "warn");
      resultText.textContent = "请先等待页面尺寸和总屏数读取完成。";
      resultText.className = "hint warn";
      return;
    }

    const validation = validateCaptureScope();
    if (!validation.ok) {
      setStatus("截图范围无效", 0, "warn");
      resultText.textContent = validation.error;
      resultText.className = "hint warn";
      validation.focusTarget?.focus();
      return;
    }

    const options = buildOptions(validation.pageRange);
    if (options.resolutionPreset === "custom" && !options.customWidth) {
      setStatus("请输入自定义宽度", 0, "warn");
      customWidthField.focus();
      return;
    }

    setBusy(true);
    setStatus("正在准备整页截图…", 4);

    try {
      const response = await sendMessage({
        type: "START_CAPTURE",
        options
      });

      if (!response?.ok) {
        throw new Error(response?.error || "整页截图失败。");
      }

      const { result } = response;
      const summary = [
        `${result.width} × ${result.height}px`,
        formatBytes(result.fileSizeBytes),
        result.format.toUpperCase()
      ];

      if (typeof result.quality === "number") {
        summary.push(`质量 ${Math.round(result.quality * 100)}%`);
      }

      if (result.captureMode === "line") {
        summary.push("起止线范围");
      } else if (Number.isInteger(result.startPage) && Number.isInteger(result.endPage)) {
        summary.push(formatPageRange(result.startPage, result.endPage));
      }

      if (!result.clipboardCopied) {
        setStatus("正在复制到剪贴板", 96);
        resultText.textContent = "图片已生成，正在同步写入系统剪贴板。";
      }

      await ensureClipboardResult(result);
      await ensureDeferredDownload(result, options);
      setStatus("导出完成", 100, "ok");
      resultText.textContent = buildResultMessage(summary, result);
      resultText.className = "hint ok";
    } catch (error) {
      setStatus("导出失败", 0, "warn");
      resultText.textContent = error.message || "发生未知错误。";
      resultText.className = "hint warn";
    } finally {
      setBusy(false);
    }
  });
}

async function restoreOptions() {
  const { [STORAGE_KEY]: saved } = await chrome.storage.local.get(STORAGE_KEY);

  scrollTargetField.value = saved?.scrollTarget || "right";
  captureScopeField.value = saved?.captureScope || "all";
  formatField.value = saved?.format || "png";
  resolutionPresetField.value = saved?.resolutionPreset || "1";
  customWidthField.value = saved?.customWidth || "";
  maxSizeValueField.value = saved?.maxSizeValue || "";
  maxSizeUnitField.value = saved?.maxSizeUnit || "MB";
  hideFixedField.checked = saved?.hideFixed !== false;
  dedupeHeadersField.checked = saved?.dedupeHeaders !== false;
  saveAsField.checked = saved?.saveAs !== false;
  startPageField.value = saved?.startPage || "";
  endPageField.value = saved?.endPage || "";

  updateCustomWidthVisibility();
  updateScopeVisibility();
  updatePageRangeHint();
}

async function persistOptions() {
  const payload = {
    scrollTarget: scrollTargetField.value,
    captureScope: captureScopeField.value,
    startPage: startPageField.value,
    endPage: endPageField.value,
    format: formatField.value,
    resolutionPreset: resolutionPresetField.value,
    customWidth: customWidthField.value,
    maxSizeValue: maxSizeValueField.value,
    maxSizeUnit: maxSizeUnitField.value,
    hideFixed: hideFixedField.checked,
    dedupeHeaders: dedupeHeadersField.checked,
    saveAs: saveAsField.checked
  };

  await chrome.storage.local.set({ [STORAGE_KEY]: payload });
}

async function refreshPageInfo() {
  try {
    const response = await sendMessage({
      type: "GET_PAGE_INFO",
      options: {
        scrollTarget: scrollTargetField.value
      }
    });

    if (!response?.ok) {
      throw new Error(response?.error || "无法读取当前页面信息。");
    }

    currentPageInfo = response.pageInfo;
    pageTitle.textContent = currentPageInfo.title || "未命名页面";
    pageSize.textContent = `${currentPageInfo.regionLabel || "页面"} ${currentPageInfo.fullWidth} × ${currentPageInfo.fullHeight}px，共 ${currentPageInfo.totalPages} 屏${currentPageInfo.fullTextExpanded ? "，已自动展开全文" : ""}`;

    const pageInfoKey = buildPageInfoKey(currentPageInfo);
    const rangeChanged = clampPageRangeInputs(pageInfoKey !== lastPageInfoKey);
    lastPageInfoKey = pageInfoKey;
    if (rangeChanged) {
      await persistOptions();
    }
    updatePageRangeHint();
    updateLineRangeStatus();
  } catch (error) {
    currentPageInfo = null;
    lastPageInfoKey = "";
    pageTitle.textContent = "当前页面暂不支持";
    pageSize.textContent = error.message || "请切换到普通网页后重试。";
    updatePageRangeHint();
    updateLineRangeStatus();
  }
}

async function refreshCaptureState() {
  try {
    const response = await sendMessage({ type: "GET_STATUS" });
    if (!response?.ok || !response.status) {
      return;
    }

    renderProgress(response.status);
    setBusy(Boolean(response.status.busy));
  } catch (error) {
    console.warn("读取后台状态失败", error);
  }
}

function renderProgress(payload = {}) {
  const percent = Number.isFinite(payload.percent) ? payload.percent : 0;
  const message = payload.message || "等待开始";

  statusText.textContent = message;
  progressBar.style.width = `${Math.max(0, Math.min(100, percent))}%`;

  if (payload.busy) {
    captureButton.textContent = "截图进行中…";
    resultText.textContent = payload.detail || "请保持标签页在前台，避免滚动页面。";
    resultText.className = "hint";
    return;
  }

  captureButton.textContent = "开始整页截图";
}

function buildOptions(pageRange) {
  const maxSizeValue = Number.parseFloat(maxSizeValueField.value);
  const maxSizeBytes = Number.isFinite(maxSizeValue) && maxSizeValue > 0
    ? convertToBytes(maxSizeValue, maxSizeUnitField.value)
    : null;
  const customWidth = Number.parseInt(customWidthField.value, 10);

  return {
    scrollTarget: scrollTargetField.value,
    captureScope: captureScopeField.value,
    startPage: pageRange?.startPage ?? 1,
    endPage: pageRange?.endPage ?? currentPageInfo?.totalPages ?? 1,
    format: formatField.value,
    resolutionPreset: resolutionPresetField.value,
    customWidth: Number.isFinite(customWidth) ? customWidth : null,
    maxFileSizeBytes: maxSizeBytes,
    hideFixedElements: hideFixedField.checked,
    suppressRepeatedHeaders: dedupeHeadersField.checked,
    saveAs: saveAsField.checked,
    copyToClipboard: true,
    deferDownloadForClipboard: true
  };
}

async function ensureClipboardResult(result) {
  if (result.clipboardCopied) {
    return result;
  }

  const imageUrl = result.clipboardUrl || result.downloadUrl;
  const fallback = await copyImageUrlToClipboard(imageUrl);

  if (fallback.copied) {
    result.clipboardCopied = true;
    result.clipboardError = null;
    return result;
  }

  const errors = [result.clipboardError, fallback.error].filter(Boolean);
  result.clipboardCopied = false;
  result.clipboardError = errors.join("; ") || "剪贴板复制失败";
  return result;
}

function buildResultMessage(summary, result) {
  const baseMessage = result.clipboardCopied
    ? "已创建下载，并已复制图片到剪贴板"
    : "已创建下载，但复制到剪贴板失败";
  const errorMessage = result.clipboardCopied || !result.clipboardError
    ? ""
    : `；原因：${result.clipboardError}`;

  return `${baseMessage}：${summary.join(" / ")}${errorMessage}`;
}

async function ensureDeferredDownload(result, options) {
  if (!result.downloadDeferred) {
    return result;
  }

  setStatus("正在保存图片", 98);
  resultText.textContent = "剪贴板处理完成，正在启动图片保存。";

  const response = await sendMessage({
    type: "DOWNLOAD_CAPTURE_RESULT",
    payload: {
      downloadUrl: result.downloadUrl,
      filename: result.filename,
      saveAs: options.saveAs !== false,
      width: result.width,
      height: result.height,
      fileSizeBytes: result.fileSizeBytes,
      clipboardCopied: result.clipboardCopied,
      clipboardError: result.clipboardError
    }
  });

  if (!response?.ok) {
    throw new Error(response?.error || "保存图片失败。");
  }

  result.downloadDeferred = false;
  return result;
}

async function copyImageUrlToClipboard(imageUrl) {
  if (!imageUrl) {
    return {
      copied: false,
      error: "没有可复制的图片地址"
    };
  }

  if (!globalThis.ClipboardItem) {
    return {
      copied: false,
      error: "当前 Chrome 不支持 ClipboardItem"
    };
  }

  if (!navigator.clipboard?.write) {
    return {
      copied: false,
      error: "当前环境无法写入剪贴板"
    };
  }

  try {
    const response = await fetch(imageUrl);
    if (!response.ok) {
      throw new Error(`读取剪贴板图片失败：HTTP ${response.status}`);
    }

    const sourceBlob = await response.blob();
    const pngBlob = sourceBlob.type === "image/png"
      ? sourceBlob
      : await convertBlobToPng(sourceBlob);

    const clipboardResult = await writeBlobToClipboard(pngBlob);
    if (!clipboardResult.copied) {
      throw new Error(clipboardResult.error || "写入剪贴板失败");
    }

    return {
      copied: true,
      error: null
    };
  } catch (error) {
    return {
      copied: false,
      error: error?.message || "写入剪贴板失败"
    };
  }
}

async function writeBlobToClipboard(blob) {
  const imageSelectionResult = await copyBlobWithImageSelection(blob);
  if (imageSelectionResult.copied) {
    return imageSelectionResult;
  }

  const navigatorResult = await copyBlobWithNavigator(blob);
  if (navigatorResult.copied) {
    return navigatorResult;
  }

  return {
    copied: false,
    error: [imageSelectionResult.error, navigatorResult.error].filter(Boolean).join("; ")
  };
}

async function copyBlobWithImageSelection(blob) {
  const selection = document.getSelection();
  const previousRanges = [];
  let copyTarget = null;

  try {
    const dataUrl = await blobToDataUrl(blob);

    if (selection) {
      for (let index = 0; index < selection.rangeCount; index += 1) {
        previousRanges.push(selection.getRangeAt(index).cloneRange());
      }
    }

    copyTarget = document.createElement("div");
    copyTarget.contentEditable = "true";
    copyTarget.style.cssText = "position:fixed;left:0;top:0;width:1px;height:1px;opacity:0;overflow:hidden;pointer-events:none;";

    const image = document.createElement("img");
    image.alt = "screenshot";
    image.src = dataUrl;
    copyTarget.append(image);
    document.body.append(copyTarget);
    await waitForImageLoad(image);

    const range = document.createRange();
    range.selectNode(image);
    selection?.removeAllRanges();
    selection?.addRange(range);
    copyTarget.focus();

    if (!document.execCommand("copy")) {
      throw new Error("document.execCommand('copy') returned false.");
    }

    return {
      copied: true,
      error: null
    };
  } catch (error) {
    return {
      copied: false,
      error: error?.message || "复制选中图片失败"
    };
  } finally {
    selection?.removeAllRanges();
    for (const range of previousRanges) {
      selection?.addRange(range);
    }
    copyTarget?.remove();
  }
}

function blobToDataUrl(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(new Error("剪贴板图片转 Data URL 失败"));
    reader.readAsDataURL(blob);
  });
}

function waitForImageLoad(image) {
  return new Promise((resolve, reject) => {
    if (image.complete && image.naturalWidth > 0) {
      resolve();
      return;
    }

    image.onload = () => resolve();
    image.onerror = () => reject(new Error("剪贴板图片元素解码失败"));
  });
}

async function copyBlobWithNavigator(blob) {
  if (!globalThis.ClipboardItem) {
    return {
      copied: false,
      error: "当前 Chrome 不支持 ClipboardItem"
    };
  }

  if (!navigator.clipboard?.write) {
    return {
      copied: false,
      error: "当前环境无法写入剪贴板"
    };
  }

  try {
    await focusDocumentForClipboard();
    await navigator.clipboard.write([
      new ClipboardItem({
        "image/png": blob
      })
    ]);

    return {
      copied: true,
      error: null
    };
  } catch (error) {
    return {
      copied: false,
      error: error?.message || "写入剪贴板失败"
    };
  }
}

function focusDocumentForClipboard() {
  return new Promise((resolve, reject) => {
    window.focus();
    captureButton?.focus?.({ preventScroll: true });

    requestAnimationFrame(() => {
      if (!document.hasFocus()) {
        reject(new Error("扩展弹窗未获得焦点，请保持弹窗打开，不要先打开保存窗口或切换页面"));
        return;
      }

      resolve();
    });
  });
}

function convertBlobToPng(blob) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    const objectUrl = URL.createObjectURL(blob);

    image.onload = () => {
      try {
        const canvas = document.createElement("canvas");
        canvas.width = Math.max(1, image.naturalWidth || image.width);
        canvas.height = Math.max(1, image.naturalHeight || image.height);

        const ctx = canvas.getContext("2d", { alpha: false });
        ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
        canvas.toBlob((pngBlob) => {
          URL.revokeObjectURL(objectUrl);

          if (!pngBlob) {
            reject(new Error("剪贴板图片转 PNG 失败"));
            return;
          }

          resolve(pngBlob);
        }, "image/png");
      } catch (error) {
        URL.revokeObjectURL(objectUrl);
        reject(error);
      }
    };

    image.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      reject(new Error("剪贴板图片解码失败"));
    };

    image.src = objectUrl;
  });
}

function validateCaptureScope() {
  if (captureScopeField.value === "line") {
    if (!currentPageInfo?.lineRange?.exists) {
      return {
        ok: false,
        error: "还没有设置起止线，请先点击“去页面设置起止线”。",
        focusTarget: pickLineRangeButton
      };
    }

    return {
      ok: true,
      pageRange: null
    };
  }

  return validatePageRange();
}

function validatePageRange() {
  const totalPages = currentPageInfo?.totalPages || 0;
  if (!totalPages) {
    return {
      ok: false,
      error: "页面总屏数读取失败，请刷新后重试。"
    };
  }

  if (captureScopeField.value !== "custom") {
    return {
      ok: true,
      pageRange: {
        startPage: 1,
        endPage: totalPages
      }
    };
  }

  const startPage = parsePageInput(startPageField.value);
  if (!startPage.ok) {
    return {
      ok: false,
      error: "开始屏必须是大于等于 1 的正整数。",
      focusTarget: startPageField
    };
  }

  const endPage = parsePageInput(endPageField.value);
  if (!endPage.ok) {
    return {
      ok: false,
      error: "结束屏必须是大于等于 1 的正整数。",
      focusTarget: endPageField
    };
  }

  if (startPage.value > totalPages || endPage.value > totalPages) {
    return {
      ok: false,
      error: `屏号不能超过当前最大屏数 ${totalPages}。`,
      focusTarget: startPage.value > totalPages ? startPageField : endPageField
    };
  }

  return {
    ok: true,
    pageRange: {
      startPage: Math.min(startPage.value, endPage.value),
      endPage: Math.max(startPage.value, endPage.value)
    }
  };
}

function parsePageInput(value) {
  const text = String(value || "").trim();
  if (!/^\d+$/.test(text)) {
    return { ok: false };
  }

  const page = Number.parseInt(text, 10);
  if (!Number.isInteger(page) || page < 1) {
    return { ok: false };
  }

  return { ok: true, value: page };
}

function clampPageRangeInputs(forceDefaults = false) {
  const totalPages = currentPageInfo?.totalPages;
  if (!Number.isInteger(totalPages) || totalPages < 1) {
    return false;
  }

  startPageField.max = String(totalPages);
  endPageField.max = String(totalPages);

  const defaultStart = "1";
  const defaultEnd = String(totalPages);
  const previousStart = startPageField.value;
  const previousEnd = endPageField.value;

  startPageField.value = normalizePageInputValue(startPageField.value, totalPages, defaultStart, forceDefaults);
  endPageField.value = normalizePageInputValue(endPageField.value, totalPages, defaultEnd, forceDefaults);
  return previousStart !== startPageField.value || previousEnd !== endPageField.value;
}

function normalizePageInputValue(rawValue, totalPages, fallbackValue, forceDefaults) {
  if (forceDefaults) {
    return fallbackValue;
  }

  const parsed = parsePageInput(rawValue);
  if (!parsed.ok) {
    return rawValue;
  }

  return String(Math.min(totalPages, parsed.value));
}

function buildPageInfoKey(pageInfo) {
  if (!pageInfo) {
    return "";
  }

  return [
    scrollTargetField.value,
    pageInfo.regionLabel || "",
    pageInfo.fullWidth || 0,
    pageInfo.fullHeight || 0,
    pageInfo.totalPages || 0,
    pageInfo.fullTextExpanded ? 1 : 0
  ].join("|");
}

function updateCustomWidthVisibility() {
  const showCustom = resolutionPresetField.value === "custom";
  customWidthWrapper.classList.toggle("hidden", !showCustom);
}

function updateScopeVisibility() {
  const scope = captureScopeField.value;
  pageRangeField.classList.toggle("hidden", scope !== "custom");
  lineRangeField.classList.toggle("hidden", scope !== "line");
}

function updatePageRangeHint() {
  const totalPages = currentPageInfo?.totalPages;

  if (captureScopeField.value !== "custom") {
    pageRangeHint.textContent = totalPages
      ? `当前区域共 ${totalPages} 屏，将导出全部屏。`
      : "当前将导出全部屏。";
    return;
  }

  if (!totalPages) {
    pageRangeHint.textContent = "等待读取当前区域的总屏数后再设置屏幕范围。";
    return;
  }

  const startPage = parsePageInput(startPageField.value);
  const endPage = parsePageInput(endPageField.value);

  if (!startPage.ok || !endPage.ok) {
    pageRangeHint.textContent = `请输入 1-${totalPages} 范围内的正整数屏号，例如 5 到 4 会导出第 4-5 屏。`;
    return;
  }

  if (startPage.value > totalPages || endPage.value > totalPages) {
    pageRangeHint.textContent = `当前最大屏数为 ${totalPages}，请输入不超过该值的屏号。`;
    return;
  }

  const normalizedStart = Math.min(startPage.value, endPage.value);
  const normalizedEnd = Math.max(startPage.value, endPage.value);
  pageRangeHint.textContent = normalizedStart === normalizedEnd
    ? `将导出第 ${normalizedStart} 屏，共 1 屏。`
    : `将导出第 ${normalizedStart}-${normalizedEnd} 屏，共 ${normalizedEnd - normalizedStart + 1} 屏。`;
}

function updateLineRangeStatus() {
  const lineRange = currentPageInfo?.lineRange;

  if (!lineRange?.exists) {
    lineRangeStatus.textContent = "还未设置起止线。";
    clearLineRangeButton.disabled = true;
    return;
  }

  clearLineRangeButton.disabled = false;
  const pageLabel = lineRange.startPage === lineRange.endPage
    ? `第 ${lineRange.startPage} 屏`
    : `第 ${lineRange.startPage}-${lineRange.endPage} 屏`;
  lineRangeStatus.textContent = `已设置起止线：${pageLabel}，截取高度 ${lineRange.height}px。`;
}

function setBusy(isBusy) {
  for (const element of form.elements) {
    element.disabled = isBusy;
  }

  clearLineRangeButton.disabled = isBusy || !currentPageInfo?.lineRange?.exists;
  captureButton.disabled = isBusy;
  captureButton.textContent = isBusy ? "截图进行中…" : "开始整页截图";
}

function setStatus(message, percent = 0, tone = "") {
  statusText.textContent = message;
  progressBar.style.width = `${Math.max(0, Math.min(100, percent))}%`;
  resultText.className = tone ? `hint ${tone}` : "hint";
}

function convertToBytes(value, unit) {
  return unit === "KB"
    ? Math.round(value * 1024)
    : Math.round(value * 1024 * 1024);
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

function formatPageRange(startPage, endPage) {
  return startPage === endPage
    ? `第 ${startPage} 屏`
    : `第 ${startPage}-${endPage} 屏`;
}

function sendMessage(message) {
  return new Promise((resolve, reject) => {
    chrome.runtime.sendMessage(message, (response) => {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message));
        return;
      }

      resolve(response);
    });
  });
}
