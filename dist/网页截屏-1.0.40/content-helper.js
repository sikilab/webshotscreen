(() => {
  if (window.__FULLPAGE_CAPTURE_HELPER_READY__) return;
  window.__FULLPAGE_CAPTURE_HELPER_READY__ = true;

  const state = {
    prepared: false,
    options: { scrollTarget: "right", hideFixedElements: true, suppressRepeatedHeaders: true },
    windowScrollX: 0,
    windowScrollY: 0,
    elementScrollLeft: 0,
    elementScrollTop: 0,
    target: null,
    hiddenElements: [],
    repeatingHeaderElements: [],
    styleElement: null,
    lineSelection: null,
    linePicker: null,
    progressOverlay: null,
    progressHideTimer: null,
    fullTextExpanded: false,
    extensionUiHidden: false,
    keepRepeatingHeadersForCurrentTile: true
  };

  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    const ok = (data) => sendResponse({ ok: true, data });
    const fail = (error) => sendResponse({ ok: false, error: error.message });
    switch (message?.type) {
      case "FULLPAGE_GET_METRICS":
        handleGetMetrics(message.options).then(ok).catch(fail);
        return true;
      case "FULLPAGE_PREPARE":
        prepareForCapture(message.options).then(ok).catch(fail);
        return true;
      case "FULLPAGE_SCROLL_TO":
        scrollToPosition(message.x, message.y, message.keepRepeatingHeaders).then(ok).catch(fail);
        return true;
      case "FULLPAGE_CLEANUP":
        cleanupCapture().then(ok).catch(fail);
        return true;
      case "FULLPAGE_MARK_TILE_CAPTURED":
        markCurrentTileHeadersCaptured().then(ok).catch(fail);
        return true;
      case "FULLPAGE_START_LINE_PICK":
        startLinePick(message.options).then(ok).catch(fail);
        return true;
      case "FULLPAGE_CLEAR_LINE_RANGE":
        clearLineRange().then(ok).catch(fail);
        return true;
      case "FULLPAGE_PROGRESS":
        updatePageProgress(message.payload).then(ok).catch(fail);
        return true;
      case "FULLPAGE_SET_EXTENSION_UI_VISIBLE":
        setExtensionUiVisible(message.visible !== false).then(ok).catch(fail);
        return true;
      default:
        return false;
    }
  });

  async function handleGetMetrics(options = {}) {
    const resolvedOptions = resolveOptions(options);
    await ensureExpandedFullTextIfNeeded();
    return buildMetrics(getCurrentSelection(resolvedOptions));
  }

  async function prepareForCapture(options = {}) {
    if (state.linePicker) teardownLinePicker();
    if (state.prepared) await cleanupCapture();
    const resolvedOptions = resolveOptions(options);
    await ensureExpandedFullTextIfNeeded();
    const selection = selectCaptureTarget(resolvedOptions);
    state.options = resolvedOptions;
    state.windowScrollX = Math.round(window.scrollX);
    state.windowScrollY = Math.round(window.scrollY);
    state.hiddenElements = [];
    state.repeatingHeaderElements = [];
    state.styleElement = createCaptureStyle();
    state.target = freezeSelection(selection);
    state.keepRepeatingHeadersForCurrentTile = true;
    if (selection.kind === "element") {
      state.elementScrollLeft = Math.round(selection.element.scrollLeft);
      state.elementScrollTop = Math.round(selection.element.scrollTop);
    } else {
      state.elementScrollLeft = 0;
      state.elementScrollTop = 0;
    }
    if (resolvedOptions.suppressRepeatedHeaders) {
      state.repeatingHeaderElements = collectRepeatingHeaderElements(selection);
      applyRepeatingHeaderVisibility(true);
    }
    if (resolvedOptions.hideFixedElements) {
      state.hiddenElements = hideFixedAndStickyElements(selection.element || null);
    }
    state.prepared = true;
    await waitForSettledFrameWithDelay(260);
    return handleGetMetrics(resolvedOptions);
  }

  async function scrollToPosition(x = 0, y = 0, keepRepeatingHeaders = Math.max(0, y) === 0) {
    const selection = getPreparedSelection();
    if (!selection) throw new Error("截图区域还未准备完成。");
    if (selection.kind === "page") {
      window.scrollTo(Math.max(0, x), Math.max(0, y));
    } else if (selection.kind === "element") {
      selection.element.scrollLeft = Math.max(0, x);
      selection.element.scrollTop = Math.max(0, y);
    }
    await waitForSettledFrameWithDelay(260);
    await waitForSettledFrameWithDelay(160);
    state.keepRepeatingHeadersForCurrentTile = Boolean(keepRepeatingHeaders);
    updateRepeatingHeaderElements(selection);
    applyRepeatingHeaderVisibility(state.keepRepeatingHeadersForCurrentTile);
    const metrics = await handleGetMetrics(state.options);
    return {
      ...metrics,
      x: metrics.scrollX,
      y: metrics.scrollY,
      duplicateHeaderCropTop: keepRepeatingHeaders ? 0 : getDuplicateHeaderCropTop(selection)
    };
  }

  async function cleanupCapture() {
    for (const item of state.hiddenElements) {
      restoreInlineStyle(item.element, "visibility", item.value, item.priority);
    }
    restoreRepeatingHeaderElements();
    if (state.styleElement?.isConnected) state.styleElement.remove();
    if (state.target?.kind === "element" && state.target.element && document.contains(state.target.element)) {
      state.target.element.scrollLeft = state.elementScrollLeft;
      state.target.element.scrollTop = state.elementScrollTop;
    }
    window.scrollTo(state.windowScrollX, state.windowScrollY);
    state.prepared = false;
    state.target = null;
    state.hiddenElements = [];
    state.repeatingHeaderElements = [];
    state.styleElement = null;
    state.extensionUiHidden = false;
    state.keepRepeatingHeadersForCurrentTile = true;
    applyExtensionUiVisibility();
    await waitForSettledFrameWithDelay(180);
    return { restored: true };
  }

  async function startLinePick(options = {}) {
    if (state.prepared) await cleanupCapture();
    teardownLinePicker();
    const resolvedOptions = resolveOptions(options);
    await ensureExpandedFullTextIfNeeded();
    const selection = selectCaptureTarget(resolvedOptions);

    const overlay = document.createElement("div");
    overlay.id = "__fullpage_line_picker__";
    overlay.style.cssText = "position:fixed;inset:0;z-index:2147483647;pointer-events:none;";
    const frame = document.createElement("div");
    frame.style.cssText = "position:fixed;border:2px solid rgba(255,145,85,.96);border-radius:16px;box-shadow:0 0 0 9999px rgba(7,10,14,.18);pointer-events:none;";
    const band = document.createElement("div");
    band.style.cssText = "position:fixed;display:none;background:rgba(255,145,85,.18);pointer-events:none;";
    const previewLine = createLineMarker("#ffe8d7", "预览线");
    const startLine = createLineMarker("#47cba5", "开始线");
    const endLine = createLineMarker("#ff9155", "结束线");
    const badge = document.createElement("div");
    badge.style.cssText = "position:fixed;top:18px;left:50%;transform:translateX(-50%);width:min(760px,calc(100vw - 32px));padding:12px 16px;border-radius:16px;background:rgba(18,16,14,.92);color:#fff7ef;box-shadow:0 16px 36px rgba(0,0,0,.24);pointer-events:none;";
    const badgeTitle = document.createElement("div");
    badgeTitle.style.cssText = "font:700 14px/1.35 'Segoe UI','PingFang SC','Microsoft YaHei',sans-serif;";
    const badgeDetail = document.createElement("div");
    badgeDetail.style.cssText = "margin-top:4px;font:600 13px/1.45 'Segoe UI','PingFang SC','Microsoft YaHei',sans-serif;color:#fff1e3;";
    const badgeTrack = document.createElement("div");
    badgeTrack.style.cssText = "margin-top:10px;height:8px;border-radius:999px;background:rgba(255,255,255,.14);overflow:hidden;";
    const badgeBar = document.createElement("div");
    badgeBar.style.cssText = "height:100%;width:0;border-radius:999px;background:linear-gradient(90deg,#47cba5 0%,#ff9155 100%);transition:width .18s ease;";
    badgeTrack.appendChild(badgeBar);
    badge.append(badgeTitle, badgeDetail, badgeTrack);
    const actions = document.createElement("div");
    actions.dataset.linePickerControl = "true";
    actions.style.cssText = "position:fixed;top:78px;right:18px;display:flex;gap:8px;pointer-events:auto;";
    const resetButton = createActionButton("重置", false);
    const cancelButton = createActionButton("取消", true);
    actions.appendChild(resetButton);
    actions.appendChild(cancelButton);
    overlay.append(frame, band, previewLine.root, startLine.root, endLine.root, badge, actions);
    document.documentElement.appendChild(overlay);

    state.linePicker = {
      overlay, frame, band, previewLine, startLine, endLine, badge, badgeTitle, badgeDetail, badgeBar, actions,
      resetButton, cancelButton, cleanupFns: [], closeTimer: null,
      targetKind: selection.kind, targetElement: selection.element || null, regionLabel: selection.regionLabel,
      currentStep: "start", startOffset: null, endOffset: null, hoverClientY: null,
      captureOptions: options.captureOptions || null,
      message: "请在线框内点击开始线，然后滚动到结束位置点击结束线。"
    };
    applyExtensionUiVisibility();

    resetButton.addEventListener("click", (event) => { stopPickerEvent(event); resetLinePickerSelection(); });
    cancelButton.addEventListener("click", (event) => { stopPickerEvent(event); teardownLinePicker(); });
    bindLinePickerListener(document, "mousemove", handleLinePickerMouseMove, true);
    bindLinePickerListener(document, "click", handleLinePickerClick, true);
    bindLinePickerListener(window, "keydown", handleLinePickerKeyDown, true);
    bindLinePickerListener(window, "resize", renderLinePicker, true);
    bindLinePickerListener(window, "scroll", renderLinePicker, true);
    if (selection.kind === "element" && selection.element) {
      bindLinePickerListener(selection.element, "scroll", renderLinePicker, true);
    }
    renderLinePicker();
    return { active: true };
  }

  async function clearLineRange() {
    state.lineSelection = null;
    teardownLinePicker();
    return { cleared: true };
  }

  function resolveOptions(options = {}) {
    const allowedTargets = new Set(["right", "left", "page"]);
    const scrollTarget = allowedTargets.has(options.scrollTarget)
      ? options.scrollTarget
      : (allowedTargets.has(state.options.scrollTarget) ? state.options.scrollTarget : "right");
    return {
      scrollTarget,
      hideFixedElements: options.hideFixedElements !== false,
      suppressRepeatedHeaders: options.suppressRepeatedHeaders !== false
    };
  }

  function getCurrentSelection(options) {
    return state.prepared ? (getPreparedSelection() || selectCaptureTarget(options)) : selectCaptureTarget(options);
  }

  function getPreparedSelection() {
    if (!state.target) return null;
    const storedRect = cloneRect(state.target.captureRect);
    if (state.target.kind === "page") {
      const fallback = buildPageTarget(state.target.regionLabel);
      return { ...fallback, captureRect: storedRect || fallback.captureRect, fullWidth: Math.max(1, state.target.fullWidth || fallback.fullWidth), fullHeight: Math.max(1, state.target.fullHeight || fallback.fullHeight) };
    }
    if (!state.target.element || !document.contains(state.target.element)) return null;
    if (state.target.kind === "static") {
      const liveRect = clipRectToViewport(state.target.element.getBoundingClientRect());
      return {
        kind: "static",
        element: state.target.element,
        regionLabel: state.target.regionLabel,
        fullWidth: Math.max(1, state.target.fullWidth || liveRect.width || 1),
        fullHeight: Math.max(1, state.target.fullHeight || liveRect.height || 1),
        captureRect: storedRect || liveRect,
        currentScrollX: 0,
        currentScrollY: 0
      };
    }
    return {
      kind: "element",
      element: state.target.element,
      regionLabel: state.target.regionLabel,
      fullWidth: Math.max(state.target.element.scrollWidth, state.target.element.clientWidth, state.target.fullWidth || 1),
      fullHeight: Math.max(state.target.element.scrollHeight, state.target.element.clientHeight, state.target.fullHeight || 1),
      captureRect: storedRect || clipRectToViewport(state.target.element.getBoundingClientRect()),
      currentScrollX: Math.round(state.target.element.scrollLeft),
      currentScrollY: Math.round(state.target.element.scrollTop)
    };
  }

  function selectCaptureTarget(options) {
    const overlayShell = findDominantOverlayShell();
    if (options.scrollTarget === "page") {
      if (overlayShell) {
        return isElementActuallyScrollable(overlayShell)
          ? buildElementTarget(overlayShell, "整页 / 主页面")
          : buildStaticElementTarget(overlayShell, "整页 / 主页面");
      }
      const candidates = collectScrollableElementCandidates();
      const pageLikeCandidate = pickPageLikeCandidate(candidates);
      return pageLikeCandidate?.element
        ? buildElementTarget(pageLikeCandidate.element, "整页 / 主页面")
        : buildPageTarget("整页 / 主页面");
    }
    const candidates = collectScrollableElementCandidates(overlayShell);
    const preferred = pickBestCandidate(candidates, options.scrollTarget);
    if (preferred?.element) {
      return buildElementTarget(preferred.element, describeTargetLabel(options.scrollTarget));
    }
    if (overlayShell) {
      const visibleRegion = pickBestVisibleRegion(overlayShell, options.scrollTarget);
      if (visibleRegion?.element) {
        return buildStaticElementTarget(visibleRegion.element, describeTargetLabel(options.scrollTarget));
      }
      return buildStaticElementTarget(overlayShell, describeTargetLabel(options.scrollTarget));
    }
    return buildPageTarget("整页 / 主页面");
  }

  function buildPageTarget(regionLabel) {
    return {
      kind: "page",
      regionLabel,
      fullWidth: getDocumentFullWidth(),
      fullHeight: getDocumentFullHeight(),
      captureRect: { left: 0, top: 0, right: window.innerWidth, bottom: window.innerHeight, width: window.innerWidth, height: window.innerHeight },
      currentScrollX: Math.round(window.scrollX),
      currentScrollY: Math.round(window.scrollY)
    };
  }

  function buildElementTarget(element, regionLabel) {
    const captureRect = clipRectToViewport(element.getBoundingClientRect());
    if (captureRect.width < 24 || captureRect.height < 24) throw new Error("选中的滚动区域当前不可见，请先把目标区域显示在视口内。");
    return {
      kind: "element",
      element,
      regionLabel,
      fullWidth: Math.max(element.scrollWidth, element.clientWidth, captureRect.width),
      fullHeight: Math.max(element.scrollHeight, element.clientHeight, captureRect.height),
      captureRect,
      currentScrollX: Math.round(element.scrollLeft),
      currentScrollY: Math.round(element.scrollTop)
    };
  }

  function buildStaticElementTarget(element, regionLabel) {
    const captureRect = clipRectToViewport(element.getBoundingClientRect());
    if (captureRect.width < 24 || captureRect.height < 24) throw new Error("选中的区域当前不可见，请先把目标区域显示在视口内。");
    return {
      kind: "static",
      element,
      regionLabel,
      fullWidth: Math.max(captureRect.width, element.clientWidth || 0, 1),
      fullHeight: Math.max(captureRect.height, element.clientHeight || 0, 1),
      captureRect,
      currentScrollX: 0,
      currentScrollY: 0
    };
  }

  function collectScrollableElementCandidates(root = null) {
    const candidates = [];
    const elements = root instanceof HTMLElement
      ? [root, ...root.querySelectorAll("*")]
      : [...document.querySelectorAll("body *")];
    for (const element of elements) {
      if (!(element instanceof HTMLElement)) continue;
      if (element.id?.startsWith?.("__fullpage_")) continue;
      const style = window.getComputedStyle(element);
      if (!isVisible(style)) continue;
      const rect = clipRectToViewport(element.getBoundingClientRect());
      if (rect.width < 180 || rect.height < 140) continue;
      const verticalRange = element.scrollHeight - element.clientHeight;
      const horizontalRange = element.scrollWidth - element.clientWidth;
      if (verticalRange < 32 && horizontalRange < 32) continue;
      if (!isScrollable(style, verticalRange, horizontalRange)) continue;
      candidates.push({ element, rect, verticalRange, horizontalRange });
    }
    return candidates;
  }

  function pickBestVisibleRegion(root, preferredSide) {
    if (!(root instanceof HTMLElement)) return null;
    const candidates = [];
    const elements = [root, ...root.querySelectorAll("*")];
    for (const element of elements) {
      if (!(element instanceof HTMLElement)) continue;
      if (element.id?.startsWith?.("__fullpage_")) continue;
      const style = window.getComputedStyle(element);
      if (!isVisible(style)) continue;
      const rect = clipRectToViewport(element.getBoundingClientRect());
      if (rect.width < window.innerWidth * 0.18 || rect.height < window.innerHeight * 0.4) continue;
      if (preferredSide !== "page" && rect.width > window.innerWidth * 0.92) continue;
      candidates.push({ element, rect, score: scoreVisibleRegion(rect, preferredSide) });
    }
    candidates.sort((a, b) => b.score - a.score);
    return candidates[0] || null;
  }

  function findDominantOverlayShell() {
    const centerNode = document.elementFromPoint(window.innerWidth / 2, window.innerHeight / 2);
    const candidates = [];

    for (const element of document.querySelectorAll("body *")) {
      if (!(element instanceof HTMLElement)) continue;
      if (element.id?.startsWith?.("__fullpage_")) continue;
      const style = window.getComputedStyle(element);
      if (!isVisible(style)) continue;
      if (!/(fixed|absolute|sticky)/i.test(style.position || "")) continue;
      const rect = clipRectToViewport(element.getBoundingClientRect());
      if (rect.width < window.innerWidth * 0.55 || rect.height < window.innerHeight * 0.55) continue;
      if (centerNode && element !== centerNode && !element.contains(centerNode)) continue;

      const area = rect.width * rect.height;
      const zIndex = Number.parseFloat(style.zIndex || "0");
      let score = area;
      if (style.position === "fixed") score += area * 0.24;
      if (rect.left <= window.innerWidth * 0.08 && rect.right >= window.innerWidth * 0.92) score += area * 0.1;
      if (rect.top <= window.innerHeight * 0.08 && rect.bottom >= window.innerHeight * 0.92) score += area * 0.1;
      if (Number.isFinite(zIndex) && zIndex > 0) score += zIndex * 48;
      candidates.push({ element, rect, score });
    }

    candidates.sort((a, b) => b.score - a.score);
    return candidates[0]?.element || null;
  }

  function isElementActuallyScrollable(element) {
    if (!(element instanceof HTMLElement)) {
      return false;
    }

    const style = window.getComputedStyle(element);
    const verticalRange = element.scrollHeight - element.clientHeight;
    const horizontalRange = element.scrollWidth - element.clientWidth;
    return isScrollable(style, verticalRange, horizontalRange);
  }

  function isVisible(style) {
    return style.display !== "none" && style.visibility !== "hidden" && Number.parseFloat(style.opacity || "1") > 0;
  }

  function isScrollable(style, verticalRange, horizontalRange) {
    const overflowY = style.overflowY || style.overflow;
    const overflowX = style.overflowX || style.overflow;
    const allowPattern = /(auto|scroll|overlay)/i;
    return (verticalRange >= 32 && allowPattern.test(overflowY)) || (horizontalRange >= 32 && allowPattern.test(overflowX));
  }

  function pickBestCandidate(candidates, preferredSide) {
    if (!candidates.length) return null;
    const strict = candidates.filter((candidate) => candidateMatchesPreferredSide(candidate, preferredSide));
    const pool = strict.length ? strict : candidates;
    return pool.map((candidate) => ({ ...candidate, score: scoreCandidate(candidate, preferredSide) })).sort((a, b) => b.score - a.score)[0];
  }

  function pickPageLikeCandidate(candidates) {
    const best = pickBestCandidate(candidates, "page");
    if (!best?.element) return null;

    const windowScrollRange = Math.max(0, getDocumentFullHeight() - window.innerHeight);
    const bodyStyle = window.getComputedStyle(document.body);
    const docStyle = window.getComputedStyle(document.documentElement);
    const pageLocked = /(hidden|clip)/i.test([
      bodyStyle.overflowY || bodyStyle.overflow || "",
      docStyle.overflowY || docStyle.overflow || ""
    ].join(" "));
    const candidateIsDominant = best.rect.width >= window.innerWidth * 0.42
      && best.rect.height >= window.innerHeight * 0.55
      && best.verticalRange >= Math.max(160, window.innerHeight * 0.6);

    if (!candidateIsDominant) {
      return null;
    }

    if (windowScrollRange <= 32 || pageLocked || hasLargeFixedShellAncestor(best.element)) {
      return best;
    }

    return best.verticalRange > windowScrollRange * 1.5 && best.rect.width >= window.innerWidth * 0.5
      ? best
      : null;
  }

  function hasLargeFixedShellAncestor(element) {
    let current = element;
    while (current && current !== document.body) {
      if (!(current instanceof HTMLElement)) {
        break;
      }

      const style = window.getComputedStyle(current);
      if (style.position === "fixed" || style.position === "sticky") {
        const rect = clipRectToViewport(current.getBoundingClientRect());
        if (rect.width >= window.innerWidth * 0.55 && rect.height >= window.innerHeight * 0.55) {
          return true;
        }
      }

      current = current.parentElement;
    }

    return false;
  }

  function candidateMatchesPreferredSide(candidate, preferredSide) {
    if (preferredSide === "right") return candidate.rect.right > window.innerWidth * 0.55;
    if (preferredSide === "left") return candidate.rect.left < window.innerWidth * 0.45;
    return true;
  }

  function scoreCandidate(candidate, preferredSide) {
    const area = candidate.rect.width * candidate.rect.height;
    const centerX = candidate.rect.left + (candidate.rect.width / 2);
    const viewportMid = window.innerWidth / 2;
    const widthRatio = candidate.rect.width / Math.max(1, window.innerWidth);
    const centerOffset = Math.abs(centerX - viewportMid) / Math.max(1, viewportMid);
    let score = area + (candidate.verticalRange * 1.8) + (candidate.horizontalRange * 0.75);
    if (preferredSide === "right") {
      score += centerX >= viewportMid ? area * 0.7 : -area * 0.8;
      score += candidate.rect.left >= window.innerWidth * 0.28 ? area * 0.12 : 0;
    } else if (preferredSide === "left") {
      score += centerX <= viewportMid ? area * 0.7 : -area * 0.8;
      score += candidate.rect.right <= window.innerWidth * 0.72 ? area * 0.12 : 0;
    } else {
      score += area * Math.max(0, 0.22 - (centerOffset * 0.16));
      if (candidate.rect.width >= window.innerWidth * 0.45) score += area * 0.28;
      if (candidate.rect.height >= window.innerHeight * 0.75) score += area * 0.15;
      if (candidate.rect.left <= window.innerWidth * 0.15 && candidate.rect.right >= window.innerWidth * 0.85) score += area * 0.12;
    }
    if (widthRatio > 0.92) score -= area * 0.35;
    if (candidate.rect.height >= window.innerHeight * 0.65) score += area * 0.12;
    if (candidate.verticalRange >= candidate.horizontalRange) score += candidate.verticalRange * 0.3;
    return score;
  }

  function scoreVisibleRegion(rect, preferredSide) {
    const area = rect.width * rect.height;
    const centerX = rect.left + (rect.width / 2);
    const viewportMid = window.innerWidth / 2;
    let score = area;

    if (preferredSide === "right") {
      score += centerX >= viewportMid ? area * 0.45 : -area * 0.35;
      score += rect.left >= window.innerWidth * 0.45 ? area * 0.18 : 0;
    } else if (preferredSide === "left") {
      score += centerX <= viewportMid ? area * 0.45 : -area * 0.35;
      score += rect.right <= window.innerWidth * 0.62 ? area * 0.18 : 0;
    }

    if (rect.height >= window.innerHeight * 0.72) score += area * 0.12;
    return score;
  }

  function describeTargetLabel(scrollTarget) {
    if (scrollTarget === "left") return "左侧滚动区";
    if (scrollTarget === "page") return "整页 / 主页面";
    return "右侧滚动区";
  }

  function buildMetrics(selection) {
    const captureRect = serializeRect(selection.captureRect);
    const tileOverlapTop = getCaptureTileOverlapTop(selection);
    const metrics = {
      regionLabel: selection.regionLabel,
      targetKind: selection.kind,
      fullTextExpanded: state.fullTextExpanded,
      fullWidth: Math.max(1, Math.round(selection.fullWidth)),
      fullHeight: Math.max(1, Math.round(selection.fullHeight)),
      captureWidth: captureRect.width,
      captureHeight: captureRect.height,
      stepWidth: captureRect.width,
      stepHeight: Math.max(1, captureRect.height - tileOverlapTop),
      tileOverlapTop,
      viewportWidth: window.innerWidth,
      viewportHeight: window.innerHeight,
      devicePixelRatio: window.devicePixelRatio || 1,
      scrollX: Math.round(selection.currentScrollX),
      scrollY: Math.round(selection.currentScrollY),
      captureRect,
      repeatingTopOverlayHeight: getRepeatingTopOverlayHeight(selection)
    };
    const lineRange = getLineRangeForSelection(selection);
    if (lineRange) metrics.lineRange = lineRange;
    return metrics;
  }

  async function ensureExpandedFullTextIfNeeded() {
    if (state.fullTextExpanded) {
      return { expanded: true };
    }

    const context = findExpandableFullTextContext();
    if (!context) {
      return { expanded: false };
    }

    const previousScrollX = Math.round(window.scrollX);
    const previousScrollY = Math.round(window.scrollY);
    context.trigger.click();
    await waitForSettledFrameWithDelay(260);
    window.scrollTo(previousScrollX, previousScrollY);
    await waitForSettledFrameWithDelay(180);
    state.fullTextExpanded = true;
    return { expanded: true };
  }

  function findExpandableFullTextContext() {
    const paginationRoot = document.querySelector("#pagination");
    const contentRoot = document.querySelector("#UCAP-CONTENT .trs_paper_default");
    const trigger = paginationRoot?.querySelector?.(".alls");

    if (!(paginationRoot instanceof HTMLElement) || !(contentRoot instanceof HTMLElement) || !(trigger instanceof HTMLElement)) {
      return null;
    }

    if (!contentRoot.innerHTML || paginationRoot.style.display === "none" || paginationRoot.hidden) {
      return null;
    }

    return { paginationRoot, contentRoot, trigger };
  }

  function getLineRangeForSelection(selection) {
    if (!sameTargetSelection(selection, state.lineSelection)) return null;
    const startOffset = clamp(Math.round(Math.min(state.lineSelection.startOffset, state.lineSelection.endOffset)), 0, selection.fullHeight - 1);
    const endOffset = clamp(Math.round(Math.max(state.lineSelection.startOffset, state.lineSelection.endOffset)), startOffset + 1, selection.fullHeight);
    return { startOffset, endOffset, height: endOffset - startOffset };
  }

  function hideFixedAndStickyElements(targetElement) {
    const hidden = [];
    for (const element of document.querySelectorAll("body *")) {
      if (!(element instanceof HTMLElement)) continue;
      const style = window.getComputedStyle(element);
      if (style.position !== "fixed" && style.position !== "sticky") continue;
      if (!isVisible(style)) continue;
      const rect = clipRectToViewport(element.getBoundingClientRect());
      if (rect.width < 2 || rect.height < 2) continue;
      if (isNativeTableHeaderElement(element)) continue;
      if (isRepeatingHeaderElement(element)) continue;
      if (isTargetInternalStickyHeader(element, targetElement, rect)) continue;
      if (shouldPreserveFixedElement(element, targetElement, rect)) continue;
      hidden.push({ element, value: element.style.getPropertyValue("visibility"), priority: element.style.getPropertyPriority("visibility") });
      element.style.setProperty("visibility", "hidden", "important");
    }
    return hidden;
  }

  function shouldPreserveFixedElement(element, targetElement, rect) {
    if (targetElement && (element === targetElement || element.contains(targetElement))) return true;
    return rect.width >= window.innerWidth * 0.95 && rect.height >= window.innerHeight * 0.95;
  }

  function getRepeatingTopOverlayHeight(selection) {
    if (!state.options.suppressRepeatedHeaders) return 0;

    const targetElement = selection?.element || null;
    const captureRect = selection?.captureRect;
    if (!captureRect) return 0;

    let height = 0;
    const seen = new Set();
    for (const element of document.querySelectorAll("body *")) {
      if (!(element instanceof HTMLElement)) continue;
      const style = window.getComputedStyle(element);
      if (style.position !== "sticky" && style.position !== "fixed") continue;
      if (!isVisible(style)) continue;

      const headerRoot = getRepeatingHeaderRoot(element);
      if (!headerRoot || seen.has(headerRoot)) continue;
      const rect = clipRectToViewport(headerRoot.getBoundingClientRect());
      if (!isCandidateRepeatingHeader(headerRoot, targetElement, rect, captureRect)) continue;
      seen.add(headerRoot);
      height = Math.max(height, Math.min(rect.height, captureRect.height * 0.35));
    }

    return Math.round(height);
  }

  function getCaptureTileOverlapTop(selection) {
    if (!state.options.suppressRepeatedHeaders) return 0;
    const captureHeight = Math.max(1, Math.round(selection?.captureRect?.height || window.innerHeight || 1));
    const measuredHeader = getRepeatingTopOverlayHeight(selection);
    const safeDefault = Math.min(64, Math.max(32, Math.round(captureHeight * 0.07)));
    return Math.min(Math.round(captureHeight * 0.25), Math.max(measuredHeader, safeDefault));
  }

  function getDuplicateHeaderCropTop(selection) {
    if (!state.options.suppressRepeatedHeaders) return 0;
    const captureRect = selection?.captureRect;
    if (!captureRect) return 0;

    let cropTop = 0;
    for (const item of state.repeatingHeaderElements) {
      const element = item.element;
      if (!element || !document.contains(element) || !item.capturedOnce) continue;
      const style = window.getComputedStyle(element);
      if (!isVisible(style)) continue;
      const rect = clipRectToViewport(element.getBoundingClientRect());
      if (rect.width < 2 || rect.height < 2) continue;
      if (rect.bottom <= captureRect.top || rect.top >= captureRect.bottom) continue;
      if (rect.top > captureRect.top + Math.min(180, captureRect.height * 0.35)) continue;
      cropTop = Math.max(cropTop, Math.min(rect.bottom - captureRect.top, Math.min(180, captureRect.height * 0.35)));
    }

    return Math.max(0, Math.round(cropTop));
  }

  function isTargetInternalStickyHeader(element, targetElement, rect, captureRect = null) {
    if (!targetElement || !targetElement.contains(element)) return false;

    const area = captureRect || clipRectToViewport(targetElement.getBoundingClientRect());
    if (!area || area.width < 24 || area.height < 24) return false;
    if (rect.height < 12 || rect.height > area.height * 0.35) return false;
    if (rect.width < area.width * 0.55) return false;
    if (Math.abs(rect.top - area.top) > 10) return false;
    if (rect.bottom > area.bottom) return false;

    return true;
  }

  function collectRepeatingHeaderElements(selection) {
    const targetElement = selection?.element || null;
    const captureRect = selection?.captureRect;
    if (!captureRect) return [];

    const headers = [];
    const seen = new Set();
    for (const element of document.querySelectorAll("body *")) {
      if (!(element instanceof HTMLElement)) continue;
      const style = window.getComputedStyle(element);
      if (style.position !== "sticky" && style.position !== "fixed") continue;
      if (!isVisible(style)) continue;

      const headerRoot = getRepeatingHeaderRoot(element);
      if (!headerRoot || seen.has(headerRoot)) continue;
      const rect = clipRectToViewport(headerRoot.getBoundingClientRect());
      if (!isCandidateRepeatingHeader(headerRoot, targetElement, rect, captureRect)) continue;
      seen.add(headerRoot);
      headers.push(createRepeatingHeaderRecord(headerRoot, selection));
    }

    return headers;
  }

  function updateRepeatingHeaderElements(selection) {
    if (!state.options.suppressRepeatedHeaders) return;

    const targetElement = selection?.element || null;
    const captureRect = selection?.captureRect;
    if (!captureRect) return;

    for (const element of document.querySelectorAll("body *")) {
      if (!(element instanceof HTMLElement)) continue;
      const headerRoot = getRepeatingHeaderRoot(element);
      if (!headerRoot || isRepeatingHeaderElement(headerRoot)) continue;

      const style = window.getComputedStyle(element);
      if (style.position !== "sticky" && style.position !== "fixed") continue;
      if (!isVisible(style)) continue;

      const rect = clipRectToViewport(headerRoot.getBoundingClientRect());
      if (!isCandidateRepeatingHeader(headerRoot, targetElement, rect, captureRect)) continue;
      state.repeatingHeaderElements.push(createRepeatingHeaderRecord(headerRoot, selection));
    }
  }

  function getRepeatingHeaderRoot(element) {
    if (!(element instanceof HTMLElement)) {
      return null;
    }

    const nativeTableHead = element.closest("thead");
    if (nativeTableHead instanceof HTMLElement) {
      return nativeTableHead;
    }

    return element;
  }

  function isCandidateRepeatingHeader(element, targetElement, rect, captureRect) {
    if (targetElement && !targetElement.contains(element)) return false;
    if (!captureRect || captureRect.width < 24 || captureRect.height < 24) return false;
    if (rect.height < 12 || rect.height > Math.min(160, captureRect.height * 0.35)) return false;
    if (rect.bottom <= captureRect.top || rect.top >= captureRect.bottom) return false;
    if (rect.top > captureRect.top + captureRect.height * 0.45) return false;
    if (rect.width >= captureRect.width * 0.45) return true;
    if (isHeaderLikeRepeatingElement(element, targetElement, rect, captureRect)) return true;
    return false;
  }

  function isHeaderLikeRepeatingElement(element, targetElement, rect, captureRect) {
    if (targetElement && !targetElement.contains(element)) return false;
    if (rect.width < 24 || rect.height < 12) return false;
    if (rect.left < captureRect.left - 2 || rect.right > captureRect.right + 2) return false;

    const tagName = element.tagName.toLowerCase();
    const role = (element.getAttribute("role") || "").toLowerCase();
    if (tagName === "thead" || tagName === "th" || role === "rowheader" || role === "columnheader") return true;

    const text = (element.innerText || element.textContent || "").replace(/\s+/g, "");
    if (!text || text.length > 40) return false;
    return isCompactHeaderRowMember(element, rect, captureRect);
  }

  function isCompactHeaderRowMember(element, rect, captureRect) {
    const parent = element.parentElement;
    if (!(parent instanceof HTMLElement)) return false;

    const siblings = Array.from(parent.children).filter((child) => {
      if (!(child instanceof HTMLElement)) return false;
      const childStyle = window.getComputedStyle(child);
      if (!isVisible(childStyle)) return false;
      const childRect = clipRectToViewport(child.getBoundingClientRect());
      if (childRect.height < 10 || childRect.height > Math.min(160, captureRect.height * 0.35)) return false;
      if (Math.abs(childRect.top - rect.top) > 8) return false;
      if (childRect.left < captureRect.left - 2 || childRect.right > captureRect.right + 2) return false;
      const childText = (child.innerText || child.textContent || "").replace(/\s+/g, "");
      return childText.length > 0 && childText.length <= 40;
    });

    return siblings.length >= 3;
  }

  function hasRepeatingHeaderRelationship(element) {
    return state.repeatingHeaderElements.some((item) => {
      const header = item.element;
      return header && (header === element || header.contains(element) || element.contains(header));
    });
  }

  function isRepeatingHeaderElement(element) {
    return hasRepeatingHeaderRelationship(element);
  }

  function createRepeatingHeaderRecord(element, selection = null) {
    return {
      element,
      value: element.style.getPropertyValue("visibility"),
      priority: element.style.getPropertyPriority("visibility"),
      naturalTop: getElementNaturalTopInSelection(element, selection),
      height: Math.max(1, Math.round(element.getBoundingClientRect().height || 0)),
      capturedOnce: false
    };
  }

  function getElementNaturalTopInSelection(element, selection = null) {
    const activeSelection = selection || getPreparedSelection();
    const rect = element.getBoundingClientRect();
    const captureRect = activeSelection?.captureRect || { top: 0 };
    const scrollY = Number.isFinite(activeSelection?.currentScrollY)
      ? activeSelection.currentScrollY
      : (activeSelection?.kind === "element" ? activeSelection.element?.scrollTop || 0 : window.scrollY);
    return Math.max(0, Math.round(scrollY + rect.top - captureRect.top));
  }

  function applyRepeatingHeaderVisibility(visible) {
    const selection = getPreparedSelection();
    const currentScrollY = Number.isFinite(selection?.currentScrollY)
      ? selection.currentScrollY
      : (selection?.kind === "element" ? selection.element?.scrollTop || 0 : window.scrollY);

    for (const item of state.repeatingHeaderElements) {
      if (!item.element || !document.contains(item.element)) continue;

      const hasScrolledPastNaturalHeader = Number.isFinite(item.naturalTop)
        ? currentScrollY > item.naturalTop + (item.height || 1)
        : true;

      if (visible || !item.capturedOnce || !hasScrolledPastNaturalHeader) {
        restoreInlineStyle(item.element, "visibility", item.value, item.priority);
      } else {
        item.element.style.setProperty("visibility", "hidden", "important");
      }
    }
  }

  async function markCurrentTileHeadersCaptured() {
    const selection = getPreparedSelection();
    updateRepeatingHeaderElements(selection);

    for (const item of state.repeatingHeaderElements) {
      if (!item.element || !document.contains(item.element)) continue;
      const style = window.getComputedStyle(item.element);
      if (!isVisible(style)) continue;
      const rect = clipRectToViewport(item.element.getBoundingClientRect());
      if (rect.width < 2 || rect.height < 2) continue;
      item.capturedOnce = true;
    }

    return { marked: true };
  }

  function restoreRepeatingHeaderElements() {
    for (const item of state.repeatingHeaderElements) {
      if (!item.element || !document.contains(item.element)) continue;
      restoreInlineStyle(item.element, "visibility", item.value, item.priority);
    }
  }

  function isNativeTableHeaderElement(element) {
    const tagName = element.tagName.toLowerCase();
    return tagName === "thead" || tagName === "th" || Boolean(element.closest("thead"));
  }

  function createCaptureStyle() {
    const style = document.createElement("style");
    style.id = "__fullpage_capture_style__";
    style.textContent = "html{scroll-behavior:auto!important}*,*::before,*::after{transition-property:none!important;animation:none!important;caret-color:transparent!important;scroll-snap-type:none!important}";
    document.documentElement.appendChild(style);
    return style;
  }

  async function updatePageProgress(payload = {}) {
    renderProgressOverlay(payload);
    return { visible: true };
  }

  async function setExtensionUiVisible(visible = true) {
    state.extensionUiHidden = !visible;
    if (!visible && state.prepared) {
      const selection = getPreparedSelection();
      updateRepeatingHeaderElements(selection);
      applyRepeatingHeaderVisibility(state.keepRepeatingHeadersForCurrentTile);
    }
    applyExtensionUiVisibility();

    if (visible) {
      await waitForSettledFrameWithDelay(20);
    } else {
      await waitForSettledFrameWithDelay(40);
    }

    return { visible };
  }

  function applyExtensionUiVisibility() {
    applyOverlayVisibility(state.progressOverlay?.root);
    applyOverlayVisibility(state.linePicker?.overlay);
  }

  function applyOverlayVisibility(element) {
    if (!(element instanceof HTMLElement)) {
      return;
    }

    if (state.extensionUiHidden) {
      if (!Object.hasOwn(element.dataset, "fullpagePrevDisplay")) {
        element.dataset.fullpagePrevDisplay = element.style.display || "";
      }
      element.style.display = "none";
      element.style.visibility = "hidden";
      element.style.opacity = "0";
      return;
    }

    if (Object.hasOwn(element.dataset, "fullpagePrevDisplay")) {
      element.style.display = element.dataset.fullpagePrevDisplay;
      delete element.dataset.fullpagePrevDisplay;
    }
    element.style.visibility = "visible";
    element.style.opacity = "1";
  }

  function ensureProgressOverlay() {
    if (state.progressOverlay?.root?.isConnected) {
      return state.progressOverlay;
    }

    const root = document.createElement("div");
    root.id = "__fullpage_capture_progress__";
    root.style.cssText = "position:fixed;top:18px;left:50%;transform:translateX(-50%);width:min(460px,calc(100vw - 32px));padding:14px 16px;border-radius:18px;background:rgba(16,18,24,.94);box-shadow:0 18px 40px rgba(0,0,0,.28);z-index:2147483647;pointer-events:none;color:#fff;";
    const head = document.createElement("div");
    head.style.cssText = "display:flex;align-items:center;justify-content:space-between;gap:12px;";
    const title = document.createElement("strong");
    title.style.cssText = "font:700 14px/1.35 'Segoe UI','PingFang SC','Microsoft YaHei',sans-serif;";
    const percent = document.createElement("span");
    percent.style.cssText = "font:700 13px/1 'Segoe UI','PingFang SC','Microsoft YaHei',sans-serif;color:#ffd7bf;";
    const detail = document.createElement("div");
    detail.style.cssText = "margin-top:6px;font:600 12px/1.45 'Segoe UI','PingFang SC','Microsoft YaHei',sans-serif;color:#ffe8d7;";
    const track = document.createElement("div");
    track.style.cssText = "margin-top:10px;height:8px;border-radius:999px;background:rgba(255,255,255,.12);overflow:hidden;";
    const bar = document.createElement("div");
    bar.style.cssText = "height:100%;width:0;border-radius:999px;background:linear-gradient(90deg,#47cba5 0%,#ff9155 100%);transition:width .18s ease;";
    track.appendChild(bar);
    head.append(title, percent);
    root.append(head, detail, track);
    document.documentElement.appendChild(root);
    state.progressOverlay = { root, title, percent, detail, bar };
    applyExtensionUiVisibility();
    return state.progressOverlay;
  }

  function renderProgressOverlay(payload = {}) {
    const overlay = ensureProgressOverlay();
    const busy = Boolean(payload.busy);
    const error = Boolean(payload.error);
    const percent = clamp(Number.isFinite(payload.percent) ? payload.percent : 0, 0, 100);

    if (state.progressHideTimer) {
      clearTimeout(state.progressHideTimer);
      state.progressHideTimer = null;
    }

    overlay.root.style.display = "block";
    overlay.title.textContent = payload.message || "正在截图";
    overlay.percent.textContent = `${Math.round(percent)}%`;
    overlay.detail.textContent = payload.detail || "请保持标签页在前台，避免手动滚动页面。";
    overlay.bar.style.width = `${percent}%`;
    overlay.bar.style.background = error
      ? "linear-gradient(90deg,#ff8d6b 0%,#ff5c5c 100%)"
      : (busy ? "linear-gradient(90deg,#47cba5 0%,#ff9155 100%)" : "linear-gradient(90deg,#47cba5 0%,#67d7ba 100%)");
    applyExtensionUiVisibility();

    if (!busy) {
      state.progressHideTimer = window.setTimeout(() => {
        if (state.progressOverlay?.root) {
          state.progressOverlay.root.style.display = "none";
        }
      }, error ? 3200 : 2200);
    }
  }

  function createLineMarker(color, label) {
    const root = document.createElement("div");
    root.style.cssText = `position:fixed;display:none;height:0;border-top:2px solid ${color};pointer-events:none;z-index:2147483647;`;
    const badge = document.createElement("span");
    badge.textContent = label;
    badge.style.cssText = `position:absolute;top:-18px;right:0;padding:2px 8px;border-radius:999px;background:rgba(18,16,14,.9);color:${color};font:600 11px/1.4 'Segoe UI','PingFang SC','Microsoft YaHei',sans-serif;white-space:nowrap;`;
    root.appendChild(badge);
    return { root, badge };
  }

  function createActionButton(label, warn) {
    const button = document.createElement("button");
    button.type = "button";
    button.dataset.linePickerControl = "true";
    button.textContent = label;
    button.style.cssText = `border:1px solid ${warn ? "rgba(255,145,85,.35)" : "rgba(255,255,255,.16)"};padding:10px 14px;border-radius:999px;background:${warn ? "rgba(255,145,85,.12)" : "rgba(255,255,255,.08)"};color:#fff8f1;font:600 13px/1 'Segoe UI','PingFang SC','Microsoft YaHei',sans-serif;cursor:pointer;`;
    return button;
  }

  function bindLinePickerListener(target, type, handler, capture) {
    target.addEventListener(type, handler, capture);
    state.linePicker.cleanupFns.push(() => target.removeEventListener(type, handler, capture));
  }

  function handleLinePickerMouseMove(event) {
    if (!state.linePicker || isLinePickerControlNode(event.target)) return;
    const selection = getLinePickerSelection();
    if (!selection) return;
    state.linePicker.hoverClientY = pointInRect(event.clientX, event.clientY, selection.captureRect) ? clamp(event.clientY, selection.captureRect.top, selection.captureRect.bottom) : null;
    renderLinePicker();
  }

  function handleLinePickerClick(event) {
    if (!state.linePicker || isLinePickerControlNode(event.target)) return;
    const selection = getLinePickerSelection();
    stopPickerEvent(event);
    if (!selection) {
      teardownLinePicker();
      return;
    }
    if (!pointInRect(event.clientX, event.clientY, selection.captureRect)) {
      state.linePicker.message = "请在线框区域内点击起止线。";
      renderLinePicker();
      return;
    }
    const offset = resolveLineOffset(selection, event.clientY);
    if (state.linePicker.currentStep === "start") {
      state.linePicker.startOffset = offset;
      state.linePicker.endOffset = null;
      state.linePicker.currentStep = "end";
      state.linePicker.message = "开始线已设置，可继续滚动后点击结束线。";
      renderLinePicker();
      return;
    }
    if (!Number.isFinite(state.linePicker.startOffset) || Math.abs(offset - state.linePicker.startOffset) < 2) {
      state.linePicker.message = "开始线和结束线不能重合，请重新点击结束线。";
      renderLinePicker();
      return;
    }
    state.linePicker.endOffset = offset;
    state.linePicker.currentStep = "done";
    state.lineSelection = normalizeLineSelection(selection, state.linePicker.startOffset, state.linePicker.endOffset);
    state.linePicker.message = "起止线已设置完成，即将保存图片，并自动另存为图片。";
    renderLinePicker();
    scheduleLinePickerFinalize(2700);
  }

  function handleLinePickerKeyDown(event) {
    if (!state.linePicker || event.key !== "Escape") return;
    stopPickerEvent(event);
    teardownLinePicker();
  }

  function resetLinePickerSelection() {
    if (!state.linePicker) return;
    state.linePicker.currentStep = "start";
    state.linePicker.startOffset = null;
    state.linePicker.endOffset = null;
    state.linePicker.message = "请重新点击开始线，然后滚动到结束位置点击结束线。";
    renderLinePicker();
  }

  function renderLinePicker() {
    if (!state.linePicker) return;
    const selection = getLinePickerSelection();
    if (!selection) {
      teardownLinePicker();
      return;
    }
    const rect = selection.captureRect;
    state.linePicker.frame.style.left = `${rect.left}px`;
    state.linePicker.frame.style.top = `${rect.top}px`;
    state.linePicker.frame.style.width = `${rect.width}px`;
    state.linePicker.frame.style.height = `${rect.height}px`;
    state.linePicker.badgeTitle.textContent = `${selection.regionLabel} · 起止线截图`;
    state.linePicker.badgeDetail.textContent = state.linePicker.message;
    state.linePicker.badgeBar.style.width = `${getLinePickerProgressPercent()}%`;
    const previewY = Number.isFinite(state.linePicker.hoverClientY) && state.linePicker.currentStep !== "done" ? state.linePicker.hoverClientY : null;
    renderLineMarker(state.linePicker.previewLine, rect, previewY);
    renderLineMarker(state.linePicker.startLine, rect, offsetToClientY(selection, state.linePicker.startOffset));
    renderLineMarker(state.linePicker.endLine, rect, offsetToClientY(selection, state.linePicker.endOffset));
    renderLineBand(selection, state.linePicker.startOffset, state.linePicker.endOffset);
    applyExtensionUiVisibility();
  }

  function getLinePickerProgressPercent() {
    if (!state.linePicker) {
      return 0;
    }

    if (state.linePicker.currentStep === "done") {
      return 100;
    }

    if (state.linePicker.currentStep === "end") {
      return 56;
    }

    return 18;
  }

  function renderLineMarker(marker, rect, clientY) {
    if (!Number.isFinite(clientY) || clientY < rect.top || clientY > rect.bottom) {
      marker.root.style.display = "none";
      return;
    }
    marker.root.style.display = "block";
    marker.root.style.left = `${rect.left}px`;
    marker.root.style.top = `${clientY}px`;
    marker.root.style.width = `${rect.width}px`;
  }

  function renderLineBand(selection, startOffset, endOffset) {
    const band = state.linePicker.band;
    if (!Number.isFinite(startOffset) || !Number.isFinite(endOffset)) {
      band.style.display = "none";
      return;
    }
    const rect = selection.captureRect;
    const startY = offsetToClientY(selection, startOffset);
    const endY = offsetToClientY(selection, endOffset);
    if (!Number.isFinite(startY) || !Number.isFinite(endY)) {
      band.style.display = "none";
      return;
    }
    const top = clamp(Math.min(startY, endY), rect.top, rect.bottom);
    const bottom = clamp(Math.max(startY, endY), rect.top, rect.bottom);
    if (bottom <= top) {
      band.style.display = "none";
      return;
    }
    band.style.display = "block";
    band.style.left = `${rect.left}px`;
    band.style.top = `${top}px`;
    band.style.width = `${rect.width}px`;
    band.style.height = `${bottom - top}px`;
  }

  function getLinePickerSelection() {
    if (!state.linePicker) return null;
    if (state.linePicker.targetKind === "page") return buildPageTarget(state.linePicker.regionLabel);
    if (state.linePicker.targetKind === "static") {
      if (!state.linePicker.targetElement || !document.contains(state.linePicker.targetElement)) return null;
      try {
        return buildStaticElementTarget(state.linePicker.targetElement, state.linePicker.regionLabel);
      } catch {
        return null;
      }
    }
    if (!state.linePicker.targetElement || !document.contains(state.linePicker.targetElement)) return null;
    try {
      return buildElementTarget(state.linePicker.targetElement, state.linePicker.regionLabel);
    } catch {
      return null;
    }
  }

  function resolveLineOffset(selection, clientY) {
    const relativeY = clamp(clientY - selection.captureRect.top, 0, selection.captureRect.height);
    const scrollY = selection.kind === "page" ? window.scrollY : (selection.kind === "element" ? selection.element.scrollTop : 0);
    return clamp(Math.round(scrollY + relativeY), 0, selection.fullHeight);
  }

  function offsetToClientY(selection, offset) {
    if (!Number.isFinite(offset)) return null;
    const scrollY = selection.kind === "page" ? window.scrollY : (selection.kind === "element" ? selection.element.scrollTop : 0);
    return selection.captureRect.top + (offset - scrollY);
  }

  function normalizeLineSelection(selection, startOffset, endOffset) {
    const normalizedStart = clamp(Math.round(Math.min(startOffset, endOffset)), 0, selection.fullHeight - 1);
    const normalizedEnd = clamp(Math.round(Math.max(startOffset, endOffset)), normalizedStart + 1, selection.fullHeight);
    return { kind: selection.kind, element: selection.element || null, regionLabel: selection.regionLabel, startOffset: normalizedStart, endOffset: normalizedEnd };
  }

  function sameTargetSelection(selection, storedSelection) {
    if (!selection || !storedSelection || selection.kind !== storedSelection.kind) return false;
    return selection.kind === "page" ? true : selection.element === storedSelection.element;
  }

  function scheduleLinePickerFinalize(delayMs = 2700) {
    if (!state.linePicker) return;
    if (state.linePicker.closeTimer) clearTimeout(state.linePicker.closeTimer);
    state.linePicker.closeTimer = window.setTimeout(() => {
      const captureOptions = state.linePicker?.captureOptions ? { ...state.linePicker.captureOptions } : null;
      teardownLinePicker();
      if (captureOptions) {
        chrome.runtime.sendMessage({
          type: "LINE_PICK_CONFIRMED",
          options: captureOptions
        }).catch((error) => {
          console.error("起止线自动截图消息发送失败", error);
        });
      }
    }, delayMs);
  }

  function teardownLinePicker() {
    if (!state.linePicker) return;
    if (state.linePicker.closeTimer) clearTimeout(state.linePicker.closeTimer);
    for (const cleanup of state.linePicker.cleanupFns) cleanup();
    if (state.linePicker.overlay?.isConnected) state.linePicker.overlay.remove();
    state.linePicker = null;
  }

  function isLinePickerControlNode(node) {
    return Boolean(node?.closest?.("[data-line-picker-control='true']"));
  }

  function stopPickerEvent(event) {
    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation();
  }

  function pointInRect(x, y, rect) {
    return x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom;
  }

  function clipRectToViewport(rect) {
    const left = clamp(rect.left, 0, window.innerWidth);
    const top = clamp(rect.top, 0, window.innerHeight);
    const right = clamp(rect.right, 0, window.innerWidth);
    const bottom = clamp(rect.bottom, 0, window.innerHeight);
    return { left, top, right, bottom, width: Math.max(0, right - left), height: Math.max(0, bottom - top) };
  }

  function serializeRect(rect) {
    return { left: Math.round(rect.left), top: Math.round(rect.top), right: Math.round(rect.right), bottom: Math.round(rect.bottom), width: Math.max(0, Math.round(rect.width)), height: Math.max(0, Math.round(rect.height)) };
  }

  function restoreInlineStyle(element, propertyName, previousValue, previousPriority) {
    if (!previousValue) {
      element.style.removeProperty(propertyName);
      return;
    }
    element.style.setProperty(propertyName, previousValue, previousPriority || "");
  }

  function waitForSettledFrameWithDelay(delayMs = 220) {
    return new Promise((resolve) => {
      requestAnimationFrame(() => requestAnimationFrame(() => window.setTimeout(resolve, delayMs)));
    });
  }

  function clamp(value, min, max) {
    return Math.min(max, Math.max(min, value));
  }

  function freezeSelection(selection) {
    return { kind: selection.kind, regionLabel: selection.regionLabel, element: selection.element || null, captureRect: serializeRect(selection.captureRect), fullWidth: Math.max(1, Math.round(selection.fullWidth)), fullHeight: Math.max(1, Math.round(selection.fullHeight)) };
  }

  function cloneRect(rect) {
    return rect ? { left: rect.left, top: rect.top, right: rect.right, bottom: rect.bottom, width: rect.width, height: rect.height } : null;
  }

  function getDocumentFullHeight() {
    const body = document.body;
    const docEl = document.documentElement;
    const scrollingElement = document.scrollingElement || docEl;
    return Math.max(scrollingElement?.scrollHeight || 0, docEl?.scrollHeight || 0, body?.scrollHeight || 0, window.innerHeight);
  }

  function getDocumentFullWidth() {
    const body = document.body;
    const docEl = document.documentElement;
    const scrollingElement = document.scrollingElement || docEl;
    return Math.max(scrollingElement?.scrollWidth || 0, docEl?.scrollWidth || 0, body?.scrollWidth || 0, window.innerWidth);
  }
})();
