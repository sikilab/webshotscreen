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
const splitHeightThresholdField = document.getElementById("split-height-threshold");
const customWidthField = document.getElementById("custom-width");
const customWidthWrapper = document.getElementById("custom-width-field");
const maxSizeValueField = document.getElementById("max-size-value");
const maxSizeUnitField = document.getElementById("max-size-unit");
const hideFixedField = document.getElementById("hide-fixed");
const saveAsField = document.getElementById("save-as");
const captureButton = document.getElementById("capture-button");
const pageTitle = document.getElementById("page-title");
const pageSize = document.getElementById("page-size");
const statusText = document.getElementById("status-text");
const resultText = document.getElementById("result-text");
const progressBar = document.getElementById("progress-bar");
const languageField = document.getElementById("language-select");

const STORAGE_KEY = "fullpageScreenshotOptions";
const DEFAULT_LANG = "en";
const DEFAULT_SPLIT_HEIGHT_THRESHOLD = 18000;

const I18N = {
  "zh-CN": {
    panelTitle: "Full Page Capture",
    panelSubtitle: "把网页滚动拼接成一张图片，并按分辨率和目标文件大小上限导出。",
    languageLabel: "界面语言",
    currentPage: "当前页面",
    pageLoading: "正在读取…",
    pageLoadingHint: "准备获取页面尺寸和总屏数",
    labelScrollTarget: "滚动区域",
    labelCaptureScope: "截图范围",
    labelPageRange: "屏幕范围",
    labelLineRange: "起止线范围",
    labelExportFormat: "导出格式",
    labelResolution: "导出分辨率",
    labelSplitThreshold: "自动分段阈值高度（px）",
    labelCustomWidth: "自定义宽度（像素）",
    labelMaxFileSize: "目标文件大小上限",
    labelProgress: "进度",
    labelHideFixed: "截图前临时隐藏 fixed / sticky 悬浮元素",
    labelSaveAs: "导出时弹出另存为窗口",
    pickLineRange: "去页面设置起止线并自动截图",
    clearLineRange: "清空起止线",
    lineRangeTip: "点击后回到页面，先点开始线，再滚动到结束位置点结束线，可跨多屏；完成后会自动保存图片。",
    maxSizeTip: "设置后会优先压缩质量，必要时自动降低分辨率。",
    splitThresholdTip: "导出高度超过该值时自动分段导出，优先保持清晰度。",
    placeholderMaxSize: "留空表示不限",
    placeholderStartPage: "开始屏",
    placeholderEndPage: "结束屏",
    placeholderCustomWidth: "例如 1440",
    optRight: "右侧滚动区（默认）",
    optLeft: "左侧滚动区",
    optPage: "整页 / 主页面",
    optAll: "全部屏",
    optCustom: "自选屏数",
    optLine: "起止线截图",
    optPng: "PNG（无损，文件更大）",
    optWebp: "WebP（推荐）",
    optJpeg: "JPEG（兼容性高）",
    resOriginal: "原始尺寸",
    resCustom: "自定义宽度",
    captureButtonIdle: "开始整页截图",
    captureButtonBusy: "截图进行中…",
    statusIdle: "等待开始",
    resultIdle: "建议截图时保持标签页在前台，不要切换窗口。",
    waitLinePick: "等待页面设置起止线",
    linePickGuide: "请回到页面，先点击开始线，再滚动到结束位置点击结束线；完成后会自动保存图片。",
    linePickFailed: "起止线设置失败",
    exportDone: "导出完成",
    exportFailed: "导出失败",
    clipboardSync: "正在复制到剪贴板",
    clipboardSyncHint: "图片已生成，正在同步写入系统剪贴板。",
    downloading: "正在保存图片",
    downloadingHint: "剪贴板处理完成，正在启动图片保存。",
    invalidScope: "截图范围无效",
    clearSuccess: "已清空起止线",
    clearSuccessHint: "当前滚动区域的起止线已清空。",
    clearFailed: "清空失败",
    customWidthRequired: "请输入自定义宽度",
    waitPageMetrics: "请先等待页面尺寸和总屏数读取完成。",
    unknownError: "发生未知错误。",
    lineRangeMissing: "还没有设置起止线，请先点击“去页面设置起止线”。",
    pageTotalReadFailed: "页面总屏数读取失败，请刷新后重试。",
    pageStartInvalid: "开始屏必须是大于等于 1 的正整数。",
    pageEndInvalid: "结束屏必须是大于等于 1 的正整数。",
    pageRangeOverLimit: "屏号不能超过当前最大屏数 {total}。",
    pageHintAllWithTotal: "当前区域共 {total} 屏，将导出全部屏。",
    pageHintAllNoTotal: "当前将导出全部屏。",
    pageHintWaitingTotal: "等待读取当前区域的总屏数后再设置屏幕范围。",
    pageHintInputExample: "请输入 1-{total} 范围内的正整数屏号，例如 5 到 4 会导出第 4-5 屏。",
    pageHintOverLimit: "当前最大屏数为 {total}，请输入不超过该值的屏号。",
    pageHintSingle: "将导出第 {start} 屏，共 1 屏。",
    pageHintRange: "将导出第 {start}-{end} 屏，共 {count} 屏。",
    lineRangeNotSet: "还未设置起止线。",
    lineRangeSetSingle: "已设置起止线：第 {start} 屏，截取高度 {height}px。",
    lineRangeSetRange: "已设置起止线：第 {start}-{end} 屏，截取高度 {height}px。",
    pageTitleUnknown: "未命名页面",
    pageRegionDefault: "页面",
    pageInfoExpandedSuffix: "，已自动展开全文",
    pageInfoTemplate: "{region} {width} × {height}px，共 {total} 屏{expanded}",
    regionRight: "右侧滚动区",
    regionLeft: "左侧滚动区",
    regionPage: "整页 / 主页面",
    qualityLabel: "质量 {value}%",
    lineRangeSummary: "起止线范围",
    summaryPageSingle: "第 {start} 屏",
    summaryPageRange: "第 {start}-{end} 屏",
    splitParts: "自动分段 {count} 张",
    resultCopied: "已创建下载，并已复制图片到剪贴板",
    resultCopyFailed: "已创建下载，但复制到剪贴板失败",
    resultReason: "；原因：{reason}",
    resultTemplate: "{base}：{summary}{reason}",
    unsupportedPage: "当前页面暂不支持",
    unsupportedPageHint: "请切换到普通网页后重试。",
    footer: "copyright by sikilab"
  },
  en: {
    panelTitle: "Full Page Capture",
    panelSubtitle: "Stitch scrolling content into one image and export with resolution and file size limit options.",
    languageLabel: "Language",
    currentPage: "Current Page",
    pageLoading: "Loading…",
    pageLoadingHint: "Preparing page size and total screens",
    labelScrollTarget: "Scroll Region",
    labelCaptureScope: "Capture Scope",
    labelPageRange: "Screen Range",
    labelLineRange: "Line Range",
    labelExportFormat: "Export Format",
    labelResolution: "Export Resolution",
    labelSplitThreshold: "Auto Split Height Threshold (px)",
    labelCustomWidth: "Custom Width (px)",
    labelMaxFileSize: "Target File Size Limit",
    labelProgress: "Progress",
    labelHideFixed: "Temporarily hide fixed / sticky elements before capture",
    labelSaveAs: "Show Save As dialog when exporting",
    pickLineRange: "Set start/end lines on page and auto capture",
    clearLineRange: "Clear line range",
    lineRangeTip: "After clicking, return to the page, click start line then end line. Cross-screen is supported.",
    maxSizeTip: "Quality is reduced first, then resolution when needed.",
    splitThresholdTip: "When export height exceeds this value, image is auto-split to preserve clarity.",
    placeholderMaxSize: "Leave empty for unlimited",
    placeholderStartPage: "Start screen",
    placeholderEndPage: "End screen",
    placeholderCustomWidth: "e.g. 1440",
    optRight: "Right Scroll Area (Default)",
    optLeft: "Left Scroll Area",
    optPage: "Whole Page / Main Page",
    optAll: "All Screens",
    optCustom: "Custom Screen Range",
    optLine: "Start-End Line Capture",
    optPng: "PNG (Lossless, larger files)",
    optWebp: "WebP (Recommended)",
    optJpeg: "JPEG (Best compatibility)",
    resOriginal: "Original Size",
    resCustom: "Custom Width",
    captureButtonIdle: "Start Full Capture",
    captureButtonBusy: "Capturing…",
    statusIdle: "Ready",
    resultIdle: "Keep the tab in foreground during capture.",
    waitLinePick: "Waiting for line selection",
    linePickGuide: "Return to the page, click the start line, scroll, then click the end line. It will save automatically.",
    linePickFailed: "Line selection failed",
    exportDone: "Export completed",
    exportFailed: "Export failed",
    clipboardSync: "Copying to clipboard",
    clipboardSyncHint: "Image generated. Writing to system clipboard.",
    downloading: "Saving image",
    downloadingHint: "Clipboard finished. Starting download.",
    invalidScope: "Invalid capture range",
    clearSuccess: "Line range cleared",
    clearSuccessHint: "Line range for current region has been cleared.",
    clearFailed: "Clear failed",
    customWidthRequired: "Please enter a custom width",
    waitPageMetrics: "Wait until page size and total screens are ready.",
    unknownError: "Unknown error occurred.",
    lineRangeMissing: "No line range yet. Click \"Set start/end lines\" first.",
    pageTotalReadFailed: "Failed to read total screens. Refresh and try again.",
    pageStartInvalid: "Start screen must be an integer greater than or equal to 1.",
    pageEndInvalid: "End screen must be an integer greater than or equal to 1.",
    pageRangeOverLimit: "Screen number cannot exceed max {total}.",
    pageHintAllWithTotal: "Current region has {total} screens. All will be exported.",
    pageHintAllNoTotal: "All screens will be exported.",
    pageHintWaitingTotal: "Wait for total screens before setting range.",
    pageHintInputExample: "Enter integer screens in 1-{total}; 5 to 4 exports screens 4-5.",
    pageHintOverLimit: "Max screen is {total}. Enter a value not greater than this.",
    pageHintSingle: "Screen {start} will be exported, total 1 screen.",
    pageHintRange: "Screens {start}-{end} will be exported, total {count} screens.",
    lineRangeNotSet: "No line range is set.",
    lineRangeSetSingle: "Line range set: screen {start}, captured height {height}px.",
    lineRangeSetRange: "Line range set: screens {start}-{end}, captured height {height}px.",
    pageTitleUnknown: "Untitled page",
    pageRegionDefault: "Page",
    pageInfoExpandedSuffix: ", full text expanded",
    pageInfoTemplate: "{region} {width} × {height}px, total {total} screens{expanded}",
    regionRight: "Right Scroll Area",
    regionLeft: "Left Scroll Area",
    regionPage: "Whole Page / Main Page",
    qualityLabel: "Quality {value}%",
    lineRangeSummary: "Line range",
    summaryPageSingle: "Screen {start}",
    summaryPageRange: "Screens {start}-{end}",
    splitParts: "Auto split into {count} files",
    resultCopied: "Download created and image copied to clipboard",
    resultCopyFailed: "Download created but clipboard copy failed",
    resultReason: "; reason: {reason}",
    resultTemplate: "{base}: {summary}{reason}",
    unsupportedPage: "Unsupported page",
    unsupportedPageHint: "Switch to a normal webpage and try again.",
    footer: "copyright by sikilab"
  }
};

let currentPageInfo = null;
let lastPageInfoKey = "";

document.addEventListener("DOMContentLoaded", async () => {
  bindEvents();
  await restoreOptions();
  applyLocalizedTexts();
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
      setStatus(t("waitLinePick"), 0);
      resultText.textContent = t("linePickGuide");
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
        throw new Error(response?.error || t("linePickFailed"));
      }

      window.setTimeout(() => {
        window.close();
      }, 180);
    } catch (error) {
      setStatus(t("linePickFailed"), 0, "warn");
      resultText.textContent = error.message || t("linePickFailed");
      resultText.className = "hint warn";
    }
  });

  clearLineRangeButton.addEventListener("click", async () => {
    try {
      const response = await sendMessage({
        type: "CLEAR_LINE_RANGE"
      });

      if (!response?.ok) {
        throw new Error(response?.error || t("clearFailed"));
      }

      await refreshPageInfo();
      setStatus(t("clearSuccess"), 0, "ok");
      resultText.textContent = t("clearSuccessHint");
      resultText.className = "hint ok";
    } catch (error) {
      setStatus(t("clearFailed"), 0, "warn");
      resultText.textContent = error.message || t("clearFailed");
      resultText.className = "hint warn";
    }
  });

  for (const field of [
    formatField,
    splitHeightThresholdField,
    customWidthField,
    maxSizeValueField,
    maxSizeUnitField,
    hideFixedField,
    saveAsField
  ]) {
    field.addEventListener("change", persistOptions);
    field.addEventListener("input", persistOptions);
  }

  languageField.addEventListener("change", async () => {
    applyLocalizedTexts();
    updatePageRangeHint();
    updateLineRangeStatus();
    await persistOptions();
  });

  chrome.runtime.onMessage.addListener((message) => {
    if (message?.type === "CAPTURE_PROGRESS") {
      renderProgress(message.payload);
    }
  });

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    await persistOptions();

    if (!currentPageInfo?.totalPages) {
      setStatus(t("unsupportedPage"), 0, "warn");
      resultText.textContent = t("waitPageMetrics");
      resultText.className = "hint warn";
      return;
    }

    const validation = validateCaptureScope();
    if (!validation.ok) {
      setStatus(t("invalidScope"), 0, "warn");
      resultText.textContent = validation.error;
      resultText.className = "hint warn";
      validation.focusTarget?.focus();
      return;
    }

    const options = buildOptions(validation.pageRange);
    if (options.resolutionPreset === "custom" && !options.customWidth) {
      setStatus(t("customWidthRequired"), 0, "warn");
      customWidthField.focus();
      return;
    }

    setBusy(true);
      setStatus(t("captureButtonBusy"), 4);

    try {
      const response = await sendMessage({
        type: "START_CAPTURE",
        options
      });

      if (!response?.ok) {
        throw new Error(response?.error || t("exportFailed"));
      }

      const { result } = response;
      const summary = [
        `${result.width} × ${result.height}px`,
        formatBytes(result.fileSizeBytes),
        result.format.toUpperCase()
      ];

      if (typeof result.quality === "number") {
        summary.push(formatTemplate("qualityLabel", { value: Math.round(result.quality * 100) }));
      }

      if (result.captureMode === "line") {
        summary.push(t("lineRangeSummary"));
      } else if (Number.isInteger(result.startPage) && Number.isInteger(result.endPage)) {
        summary.push(formatPageRange(result.startPage, result.endPage));
      }
      if (Number.isInteger(result.splitCount) && result.splitCount > 1) {
        summary.push(formatTemplate("splitParts", { count: result.splitCount }));
      }

      if (!result.clipboardCopied) {
        setStatus(t("clipboardSync"), 96);
        resultText.textContent = t("clipboardSyncHint");
      }

      await ensureClipboardResult(result);
      await ensureDeferredDownload(result, options);
      setStatus(t("exportDone"), 100, "ok");
      resultText.textContent = buildResultMessage(summary, result);
      resultText.className = "hint ok";
    } catch (error) {
      setStatus(t("exportFailed"), 0, "warn");
      resultText.textContent = error.message || t("unknownError");
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
  splitHeightThresholdField.value = String(normalizeSplitThreshold(saved?.splitHeightThresholdPx));
  customWidthField.value = saved?.customWidth || "";
  maxSizeValueField.value = saved?.maxSizeValue || "";
  maxSizeUnitField.value = saved?.maxSizeUnit || "MB";
  hideFixedField.checked = saved?.hideFixed !== false;
  saveAsField.checked = saved?.saveAs !== false;
  startPageField.value = saved?.startPage || "";
  endPageField.value = saved?.endPage || "";
  languageField.value = resolveInitialLang(saved?.language);

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
    splitHeightThresholdPx: normalizeSplitThreshold(splitHeightThresholdField.value),
    customWidth: customWidthField.value,
    maxSizeValue: maxSizeValueField.value,
    maxSizeUnit: maxSizeUnitField.value,
    hideFixed: hideFixedField.checked,
    saveAs: saveAsField.checked,
    language: normalizeLang(languageField.value)
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
      throw new Error(response?.error || t("unsupportedPageHint"));
    }

    currentPageInfo = response.pageInfo;
    pageTitle.textContent = currentPageInfo.title || t("pageTitleUnknown");
    pageSize.textContent = formatTemplate("pageInfoTemplate", {
      region: mapRegionLabel(currentPageInfo.regionLabel || ""),
      width: currentPageInfo.fullWidth,
      height: currentPageInfo.fullHeight,
      total: currentPageInfo.totalPages,
      expanded: currentPageInfo.fullTextExpanded ? t("pageInfoExpandedSuffix") : ""
    });

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
    pageTitle.textContent = t("unsupportedPage");
    pageSize.textContent = t("unsupportedPageHint");
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
  const message = payload.message || t("statusIdle");

  statusText.textContent = message;
  progressBar.style.width = `${Math.max(0, Math.min(100, percent))}%`;

  if (payload.busy) {
    captureButton.textContent = t("captureButtonBusy");
    resultText.textContent = payload.detail || t("resultIdle");
    resultText.className = "hint";
    return;
  }

  captureButton.textContent = t("captureButtonIdle");
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
    splitHeightThresholdPx: normalizeSplitThreshold(splitHeightThresholdField.value),
    customWidth: Number.isFinite(customWidth) ? customWidth : null,
    maxFileSizeBytes: maxSizeBytes,
    hideFixedElements: hideFixedField.checked,
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
  result.clipboardError = errors.join("; ") || t("resultCopyFailed");
  return result;
}

function buildResultMessage(summary, result) {
  const baseMessage = result.clipboardCopied ? t("resultCopied") : t("resultCopyFailed");
  const errorMessage = result.clipboardCopied || !result.clipboardError
    ? ""
    : formatTemplate("resultReason", { reason: result.clipboardError });
  return formatTemplate("resultTemplate", {
    base: baseMessage,
    summary: summary.join(" / "),
    reason: errorMessage
  });
}

async function ensureDeferredDownload(result, options) {
  if (!result.downloadDeferred) {
    return result;
  }

  setStatus(t("downloading"), 98);
  resultText.textContent = t("downloadingHint");

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
    throw new Error(response?.error || t("exportFailed"));
  }

  result.downloadDeferred = false;
  return result;
}

async function copyImageUrlToClipboard(imageUrl) {
  if (!imageUrl) {
    return {
      copied: false,
      error: t("resultCopyFailed")
    };
  }

  if (!globalThis.ClipboardItem) {
    return {
      copied: false,
      error: t("resultCopyFailed")
    };
  }

  if (!navigator.clipboard?.write) {
    return {
      copied: false,
      error: t("resultCopyFailed")
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
      throw new Error(clipboardResult.error || t("resultCopyFailed"));
    }

    return {
      copied: true,
      error: null
    };
  } catch (error) {
    return {
      copied: false,
      error: error?.message || t("resultCopyFailed")
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
      error: error?.message || t("resultCopyFailed")
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
    reader.onerror = () => reject(new Error(t("resultCopyFailed")));
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
    image.onerror = () => reject(new Error(t("resultCopyFailed")));
  });
}

async function copyBlobWithNavigator(blob) {
  if (!globalThis.ClipboardItem) {
    return {
      copied: false,
      error: t("resultCopyFailed")
    };
  }

  if (!navigator.clipboard?.write) {
    return {
      copied: false,
      error: t("resultCopyFailed")
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
      error: error?.message || t("resultCopyFailed")
    };
  }
}

function focusDocumentForClipboard() {
  return new Promise((resolve, reject) => {
    window.focus();
    captureButton?.focus?.({ preventScroll: true });

    requestAnimationFrame(() => {
      if (!document.hasFocus()) {
        reject(new Error(t("resultCopyFailed")));
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
            reject(new Error(t("resultCopyFailed")));
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
      reject(new Error(t("resultCopyFailed")));
    };

    image.src = objectUrl;
  });
}

function validateCaptureScope() {
  if (captureScopeField.value === "line") {
    if (!currentPageInfo?.lineRange?.exists) {
      return {
        ok: false,
        error: t("lineRangeMissing"),
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
      error: t("pageTotalReadFailed")
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
      error: t("pageStartInvalid"),
      focusTarget: startPageField
    };
  }

  const endPage = parsePageInput(endPageField.value);
  if (!endPage.ok) {
    return {
      ok: false,
      error: t("pageEndInvalid"),
      focusTarget: endPageField
    };
  }

  if (startPage.value > totalPages || endPage.value > totalPages) {
    return {
      ok: false,
      error: formatTemplate("pageRangeOverLimit", { total: totalPages }),
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
      ? formatTemplate("pageHintAllWithTotal", { total: totalPages })
      : t("pageHintAllNoTotal");
    return;
  }

  if (!totalPages) {
    pageRangeHint.textContent = t("pageHintWaitingTotal");
    return;
  }

  const startPage = parsePageInput(startPageField.value);
  const endPage = parsePageInput(endPageField.value);

  if (!startPage.ok || !endPage.ok) {
    pageRangeHint.textContent = formatTemplate("pageHintInputExample", { total: totalPages });
    return;
  }

  if (startPage.value > totalPages || endPage.value > totalPages) {
    pageRangeHint.textContent = formatTemplate("pageHintOverLimit", { total: totalPages });
    return;
  }

  const normalizedStart = Math.min(startPage.value, endPage.value);
  const normalizedEnd = Math.max(startPage.value, endPage.value);
  pageRangeHint.textContent = normalizedStart === normalizedEnd
    ? formatTemplate("pageHintSingle", { start: normalizedStart })
    : formatTemplate("pageHintRange", { start: normalizedStart, end: normalizedEnd, count: normalizedEnd - normalizedStart + 1 });
}

function updateLineRangeStatus() {
  const lineRange = currentPageInfo?.lineRange;

  if (!lineRange?.exists) {
    lineRangeStatus.textContent = t("lineRangeNotSet");
    clearLineRangeButton.disabled = true;
    return;
  }

  clearLineRangeButton.disabled = false;
  lineRangeStatus.textContent = lineRange.startPage === lineRange.endPage
    ? formatTemplate("lineRangeSetSingle", { start: lineRange.startPage, height: lineRange.height })
    : formatTemplate("lineRangeSetRange", { start: lineRange.startPage, end: lineRange.endPage, height: lineRange.height });
}

function setBusy(isBusy) {
  for (const element of form.elements) {
    element.disabled = isBusy;
  }

  clearLineRangeButton.disabled = isBusy || !currentPageInfo?.lineRange?.exists;
  captureButton.disabled = isBusy;
  captureButton.textContent = isBusy ? t("captureButtonBusy") : t("captureButtonIdle");
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
    ? formatTemplate("summaryPageSingle", { start: startPage })
    : formatTemplate("summaryPageRange", { start: startPage, end: endPage });
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

function normalizeLang(rawLang) {
  const lang = String(rawLang || "").trim().toLowerCase();
  if (lang.startsWith("zh")) {
    return "zh-CN";
  }
  if (lang.startsWith("en")) {
    return "en";
  }
  return DEFAULT_LANG;
}

function resolveInitialLang(savedLang) {
  if (savedLang) {
    return normalizeLang(savedLang);
  }

  const browserLang = chrome.i18n?.getUILanguage?.() || navigator.language || navigator.languages?.[0] || "";
  return normalizeLang(browserLang);
}

function currentLang() {
  return normalizeLang(languageField?.value || DEFAULT_LANG);
}

function t(key) {
  const lang = currentLang();
  return I18N[lang]?.[key] ?? I18N[DEFAULT_LANG]?.[key] ?? key;
}

function applyLocalizedTexts() {
  document.title = t("panelTitle");
  document.documentElement.lang = currentLang();
  const titleEl = document.querySelector(".hero h1");
  const subtitleEl = document.querySelector(".hero .subtitle");
  const langLabelEl = document.getElementById("lang-label");
  const footerEl = document.getElementById("footer-note");

  if (titleEl) titleEl.textContent = t("panelTitle");
  if (subtitleEl) subtitleEl.textContent = t("panelSubtitle");
  if (langLabelEl) langLabelEl.textContent = t("languageLabel");
  if (footerEl) footerEl.textContent = t("footer");
  if (captureButton) captureButton.textContent = t("captureButtonIdle");
  if (statusText) statusText.textContent = t("statusIdle");
  if (resultText && resultText.className === "hint") {
    resultText.textContent = t("resultIdle");
  }

  setTextContentById("label-scroll-target", t("labelScrollTarget"));
  setTextContentById("label-capture-scope", t("labelCaptureScope"));
  setTextContentById("label-export-format", t("labelExportFormat"));
  setTextContentById("label-max-size", t("labelMaxFileSize"));
  const checkText = document.querySelectorAll(".checkline span");
  if (checkText[0]) checkText[0].textContent = t("labelHideFixed");
  if (checkText[1]) checkText[1].textContent = t("labelSaveAs");
  setTextContentById("label-current-page", t("currentPage"));
  setTextContentById("label-page-range", t("labelPageRange"));
  setTextContentById("label-line-range", t("labelLineRange"));
  setTextContentById("label-custom-width", t("labelCustomWidth"));
  setTextContentById("label-resolution", t("labelResolution"));
  setTextContentById("label-split-threshold", t("labelSplitThreshold"));
  setTextContentById("label-progress", t("labelProgress"));
  setTextContentById("line-range-tip", t("lineRangeTip"));
  setTextContentById("max-size-tip", t("maxSizeTip"));
  setTextContentById("split-threshold-tip", t("splitThresholdTip"));
  if (!currentPageInfo) {
    setTextContentById("page-title", t("pageLoading"));
    setTextContentById("page-size", t("pageLoadingHint"));
  } else {
    pageTitle.textContent = currentPageInfo.title || t("pageTitleUnknown");
    pageSize.textContent = formatTemplate("pageInfoTemplate", {
      region: mapRegionLabel(currentPageInfo.regionLabel || ""),
      width: currentPageInfo.fullWidth,
      height: currentPageInfo.fullHeight,
      total: currentPageInfo.totalPages,
      expanded: currentPageInfo.fullTextExpanded ? t("pageInfoExpandedSuffix") : ""
    });
  }
  setTextContentById("pick-line-range-button", t("pickLineRange"));
  setTextContentById("clear-line-range-button", t("clearLineRange"));
  startPageField.placeholder = t("placeholderStartPage");
  endPageField.placeholder = t("placeholderEndPage");
  maxSizeValueField.placeholder = t("placeholderMaxSize");
  splitHeightThresholdField.placeholder = String(DEFAULT_SPLIT_HEIGHT_THRESHOLD);
  customWidthField.placeholder = t("placeholderCustomWidth");
  setSelectOptionText(scrollTargetField, "right", t("optRight"));
  setSelectOptionText(scrollTargetField, "left", t("optLeft"));
  setSelectOptionText(scrollTargetField, "page", t("optPage"));
  setSelectOptionText(captureScopeField, "all", t("optAll"));
  setSelectOptionText(captureScopeField, "custom", t("optCustom"));
  setSelectOptionText(captureScopeField, "line", t("optLine"));
  setSelectOptionText(formatField, "png", t("optPng"));
  setSelectOptionText(formatField, "webp", t("optWebp"));
  setSelectOptionText(formatField, "jpeg", t("optJpeg"));
  setSelectOptionText(resolutionPresetField, "1", t("resOriginal"));
  setSelectOptionText(resolutionPresetField, "custom", t("resCustom"));
}

function setSelectOptionText(select, value, label) {
  const option = select?.querySelector(`option[value="${value}"]`);
  if (option) {
    option.textContent = label;
  }
}

function setTextContentById(id, value) {
  const element = document.getElementById(id);
  if (element) {
    element.textContent = value;
  }
}

function formatTemplate(key, values = {}) {
  return String(t(key)).replace(/\{(\w+)\}/g, (_, token) => {
    return Object.hasOwn(values, token) ? String(values[token]) : "";
  });
}

function normalizeSplitThreshold(rawValue) {
  const parsed = Number.parseInt(String(rawValue ?? "").trim(), 10);
  if (!Number.isInteger(parsed) || parsed < 2000) {
    return DEFAULT_SPLIT_HEIGHT_THRESHOLD;
  }
  return parsed;
}

function mapRegionLabel(rawLabel) {
  const label = String(rawLabel || "").trim().toLowerCase();
  if (label.includes("left") || label.includes("左")) {
    return t("regionLeft");
  }
  if (label.includes("right") || label.includes("右")) {
    return t("regionRight");
  }
  if (label.includes("page") || label.includes("整页") || label.includes("主页面")) {
    return t("regionPage");
  }
  return rawLabel || t("pageRegionDefault");
}
