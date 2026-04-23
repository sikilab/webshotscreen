chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message?.type !== "OFFSCREEN_PROCESS") {
    return false;
  }

  handleTask(message.payload)
    .then((result) => {
      chrome.runtime.sendMessage({
        type: "OFFSCREEN_RESULT",
        requestId: message.requestId,
        ok: true,
        result
      }).catch(() => {});
    })
    .catch((error) => {
      chrome.runtime.sendMessage({
        type: "OFFSCREEN_RESULT",
        requestId: message.requestId,
        ok: false,
        error: error.message
      }).catch(() => {});
    });

  sendResponse({ ok: true });
  return false;
});

async function handleTask(payload) {
  if (payload?.type !== "STITCH_AND_DOWNLOAD") {
    throw new Error(`未知的离屏任务: ${payload?.type || "empty"}`);
  }

  return stitchAndDownload(payload);
}

async function stitchAndDownload(payload) {
  const { metrics, tiles, options, pageTitle, pageUrl } = payload;
  if (!tiles?.length) {
    throw new Error("没有可用的截图切片。");
  }

  const exportRect = normalizeExportRect(metrics);
  const firstImage = await loadImage(tiles[0].dataUrl);
  const pixelRatio = firstImage.width / metrics.viewportWidth || metrics.devicePixelRatio || 1;
  const rawWidth = Math.max(1, Math.round(exportRect.width * pixelRatio));
  const rawHeight = Math.max(1, Math.round(exportRect.height * pixelRatio));
  const clampScale = computeCanvasClampScale(rawWidth, rawHeight);
  const masterCanvas = document.createElement("canvas");

  masterCanvas.width = Math.max(1, Math.floor(rawWidth * clampScale));
  masterCanvas.height = Math.max(1, Math.floor(rawHeight * clampScale));

  const ctx = masterCanvas.getContext("2d", { alpha: false });
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";

  await drawTile(ctx, firstImage, tiles[0], metrics, exportRect, pixelRatio, clampScale, masterCanvas);

  for (let index = 1; index < tiles.length; index += 1) {
    const image = await loadImage(tiles[index].dataUrl);
    await drawTile(ctx, image, tiles[index], metrics, exportRect, pixelRatio, clampScale, masterCanvas);
  }

  const requestedOriginalScale = resolveRequestedScale(options, exportRect.width);
  const initialMasterScale = Math.min(1, requestedOriginalScale / clampScale);
  const encoded = await encodeForExport(masterCanvas, {
    format: options.format,
    maxFileSizeBytes: options.maxFileSizeBytes,
    initialMasterScale
  });
  const clipboard = await copyCanvasToClipboard(
    masterCanvas,
    encoded.masterScaleUsed,
    options.copyToClipboard !== false
  );

  const filename = `${buildBaseFilename(pageTitle, pageUrl)}.${mapExtension(options.format)}`;
  const downloadUrl = URL.createObjectURL(encoded.blob);
  window.setTimeout(() => URL.revokeObjectURL(downloadUrl), 120000);

  return {
    downloadUrl,
    filename,
    width: Math.max(1, Math.round(masterCanvas.width * encoded.masterScaleUsed)),
    height: Math.max(1, Math.round(masterCanvas.height * encoded.masterScaleUsed)),
    fileSizeBytes: encoded.blob.size,
    format: options.format,
    quality: encoded.quality,
    canvasClamped: clampScale < 1,
    finalScale: clampScale * encoded.masterScaleUsed,
    clipboardCopied: clipboard.copied,
    clipboardError: clipboard.error,
    clipboardUrl: clipboard.url,
    clipboardMimeType: clipboard.mimeType,
    clipboardSizeBytes: clipboard.sizeBytes
  };
}

async function copyCanvasToClipboard(sourceCanvas, scale, enabled) {
  if (!enabled) {
    return {
      copied: false,
      error: null,
      url: null,
      mimeType: null,
      sizeBytes: null
    };
  }

  let blob = null;
  try {
    const clipboardCanvas = scaleCanvas(sourceCanvas, clamp(scale, 0.05, 1));
    blob = await canvasToBlob(clipboardCanvas, "image/png");
  } catch (error) {
    return {
      copied: false,
      error: error?.message || "Failed to encode clipboard image.",
      url: null,
      mimeType: null,
      sizeBytes: null
    };
  }

  const url = URL.createObjectURL(blob);
  window.setTimeout(() => URL.revokeObjectURL(url), 120000);

  const clipboardResult = await writeBlobToClipboard(blob);
  if (clipboardResult.copied) {
    return {
      copied: true,
      error: null,
      url,
      mimeType: blob.type,
      sizeBytes: blob.size
    };
  }

  return {
    copied: false,
    error: clipboardResult.error,
    url,
    mimeType: blob.type,
    sizeBytes: blob.size
  };
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
      error: error?.message || "Copy selected image failed."
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
    reader.onerror = () => reject(new Error("Clipboard image data URL conversion failed."));
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
    image.onerror = () => reject(new Error("Clipboard image element decode failed."));
  });
}

async function copyBlobWithNavigator(blob) {
  if (!globalThis.ClipboardItem) {
    return {
      copied: false,
      error: "ClipboardItem is not available."
    };
  }

  if (!navigator.clipboard?.write) {
    return {
      copied: false,
      error: "Clipboard write is not available."
    };
  }

  try {
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
      error: error?.message || "Failed to copy image to clipboard."
    };
  }
}

async function drawTile(ctx, image, tile, metrics, exportRect, pixelRatio, clampScale, masterCanvas) {
  const tileWidth = Math.min(metrics.captureWidth, Math.max(0, metrics.fullWidth - tile.x));
  const tileHeight = Math.min(metrics.captureHeight, Math.max(0, metrics.fullHeight - tile.y));
  const tileRect = {
    left: tile.x,
    top: tile.y,
    right: tile.x + tileWidth,
    bottom: tile.y + tileHeight,
    width: tileWidth,
    height: tileHeight
  };
  const intersection = intersectRects(tileRect, exportRect);

  if (!intersection) {
    return;
  }

  const sourceX = (metrics.captureRect.left + (intersection.left - tileRect.left)) * pixelRatio;
  const sourceY = (metrics.captureRect.top + (intersection.top - tileRect.top)) * pixelRatio;
  const cropWidth = Math.max(1, Math.min(
    intersection.width * pixelRatio,
    image.width - sourceX
  ));
  const cropHeight = Math.max(1, Math.min(
    intersection.height * pixelRatio,
    image.height - sourceY
  ));
  const destinationX = (intersection.left - exportRect.left) * pixelRatio * clampScale;
  const destinationY = (intersection.top - exportRect.top) * pixelRatio * clampScale;
  const destinationWidth = Math.min(
    cropWidth * clampScale,
    masterCanvas.width - destinationX
  );
  const destinationHeight = Math.min(
    cropHeight * clampScale,
    masterCanvas.height - destinationY
  );

  if (destinationWidth <= 0 || destinationHeight <= 0) {
    return;
  }

  ctx.drawImage(
    image,
    sourceX,
    sourceY,
    cropWidth,
    cropHeight,
    destinationX,
    destinationY,
    destinationWidth,
    destinationHeight
  );
}

function normalizeExportRect(metrics) {
  const exportRect = metrics.exportRect || {
    left: 0,
    top: 0,
    right: metrics.fullWidth,
    bottom: metrics.fullHeight,
    width: metrics.fullWidth,
    height: metrics.fullHeight
  };

  return {
    left: Math.max(0, exportRect.left),
    top: Math.max(0, exportRect.top),
    right: Math.max(exportRect.left + 1, exportRect.right),
    bottom: Math.max(exportRect.top + 1, exportRect.bottom),
    width: Math.max(1, exportRect.width || (exportRect.right - exportRect.left)),
    height: Math.max(1, exportRect.height || (exportRect.bottom - exportRect.top))
  };
}

function computeCanvasClampScale(width, height) {
  const MAX_EDGE = 32767;
  const MAX_AREA = 268435456;
  const edgeScale = Math.min(MAX_EDGE / width, MAX_EDGE / height, 1);
  const areaScale = Math.min(Math.sqrt(MAX_AREA / (width * height)), 1);
  const scale = Math.min(edgeScale, areaScale);
  return Number.isFinite(scale) && scale > 0 ? scale : 1;
}

function resolveRequestedScale(options, exportWidth) {
  if (options.resolutionPreset === "custom" && Number.isFinite(options.customWidth) && options.customWidth > 0) {
    return Math.min(1, options.customWidth / exportWidth);
  }

  const preset = Number.parseFloat(options.resolutionPreset);
  if (Number.isFinite(preset) && preset > 0) {
    return Math.min(1, preset);
  }

  return 1;
}

async function encodeForExport(sourceCanvas, options) {
  const format = normalizeFormat(options.format);
  const maxBytes = Number.isFinite(options.maxFileSizeBytes) && options.maxFileSizeBytes > 0
    ? options.maxFileSizeBytes
    : null;
  const initialScale = clamp(options.initialMasterScale, 0.05, 1);

  if (!maxBytes) {
    const workingCanvas = scaleCanvas(sourceCanvas, initialScale);
    const quality = usesQuality(format) ? 0.92 : null;
    const blob = await canvasToBlob(workingCanvas, format, quality ?? undefined);
    return {
      blob,
      quality,
      masterScaleUsed: initialScale
    };
  }

  if (format === "image/png") {
    return optimizePng(sourceCanvas, maxBytes, initialScale);
  }

  return optimizeLossy(sourceCanvas, format, maxBytes, initialScale);
}

async function optimizePng(sourceCanvas, maxBytes, initialScale) {
  let masterScaleUsed = initialScale;
  let bestBlob = null;

  while (masterScaleUsed >= 0.05) {
    const workingCanvas = scaleCanvas(sourceCanvas, masterScaleUsed);
    const blob = await canvasToBlob(workingCanvas, "image/png");
    bestBlob = blob;

    if (blob.size <= maxBytes) {
      return {
        blob,
        quality: null,
        masterScaleUsed
      };
    }

    const ratio = Math.sqrt(maxBytes / blob.size);
    masterScaleUsed *= clamp(ratio * 0.92, 0.55, 0.88);
  }

  return {
    blob: bestBlob,
    quality: null,
    masterScaleUsed
  };
}

async function optimizeLossy(sourceCanvas, format, maxBytes, initialScale) {
  let masterScaleUsed = initialScale;
  let fallback = null;

  while (masterScaleUsed >= 0.05) {
    const workingCanvas = scaleCanvas(sourceCanvas, masterScaleUsed);
    const bestAtScale = await findBestBlobAtScale(workingCanvas, format, maxBytes);

    if (bestAtScale) {
      return {
        blob: bestAtScale.blob,
        quality: bestAtScale.quality,
        masterScaleUsed
      };
    }

    const lowest = await canvasToBlob(workingCanvas, format, 0.35);
    fallback = {
      blob: lowest,
      quality: 0.35,
      masterScaleUsed
    };

    if (lowest.size <= maxBytes) {
      return fallback;
    }

    const ratio = Math.sqrt(maxBytes / lowest.size);
    masterScaleUsed *= clamp(ratio * 0.94, 0.55, 0.88);
  }

  return fallback;
}

async function findBestBlobAtScale(canvas, format, maxBytes) {
  let low = 0.35;
  let high = 0.95;
  let best = null;

  for (let index = 0; index < 7; index += 1) {
    const quality = (low + high) / 2;
    const blob = await canvasToBlob(canvas, format, quality);

    if (blob.size <= maxBytes) {
      best = { blob, quality };
      low = quality;
    } else {
      high = quality;
    }
  }

  return best;
}

function scaleCanvas(sourceCanvas, scale) {
  if (Math.abs(scale - 1) < 0.001) {
    return sourceCanvas;
  }

  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(sourceCanvas.width * scale));
  canvas.height = Math.max(1, Math.round(sourceCanvas.height * scale));

  const ctx = canvas.getContext("2d", { alpha: false });
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(sourceCanvas, 0, 0, canvas.width, canvas.height);
  return canvas;
}

function canvasToBlob(canvas, format, quality) {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (!blob) {
        reject(new Error("图片编码失败。"));
        return;
      }

      resolve(blob);
    }, format, quality);
  });
}

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("截图切片解码失败。"));
    image.src = src;
  });
}

function normalizeFormat(format) {
  switch (format) {
    case "jpeg":
      return "image/jpeg";
    case "webp":
      return "image/webp";
    case "png":
    default:
      return "image/png";
  }
}

function mapExtension(format) {
  if (format === "jpeg") {
    return "jpg";
  }

  return format || "png";
}

function usesQuality(format) {
  return format !== "image/png";
}

function buildBaseFilename(title, pageUrl) {
  const safeTitle = sanitizeFilename(title) || extractHost(pageUrl) || "page-capture";
  const now = new Date();
  const timestamp = [
    now.getFullYear(),
    String(now.getMonth() + 1).padStart(2, "0"),
    String(now.getDate()).padStart(2, "0")
  ].join("") + "_" + [
    String(now.getHours()).padStart(2, "0"),
    String(now.getMinutes()).padStart(2, "0"),
    String(now.getSeconds()).padStart(2, "0")
  ].join("");

  return `${safeTitle}_${timestamp}`.slice(0, 120);
}

function sanitizeFilename(value = "") {
  return String(value)
    .replace(/[<>:"/\\|?*\u0000-\u001f]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function extractHost(pageUrl = "") {
  try {
    return new URL(pageUrl).hostname;
  } catch (error) {
    return "";
  }
}

function intersectRects(a, b) {
  const left = Math.max(a.left, b.left);
  const top = Math.max(a.top, b.top);
  const right = Math.min(a.right, b.right);
  const bottom = Math.min(a.bottom, b.bottom);

  if (right <= left || bottom <= top) {
    return null;
  }

  return {
    left,
    top,
    right,
    bottom,
    width: right - left,
    height: bottom - top
  };
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}
