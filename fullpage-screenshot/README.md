# Full Page Capture

![网页截屏 Icon](icons/scissor-crop-128.png)


一个适用于 Chrome 116+ 的网页截图扩展，支持整页截图、指定滚动区域截图、自选屏幕范围截图、起止线截图，以及按分辨率和目标文件大小上限导出。

A Chrome 116+ extension for capturing full-page screenshots with support for specific scroll regions, custom screen ranges, line-range capture, and export options for resolution and target file size limit.

## 功能特性 / Features

- 支持整页滚动拼接截图。
- Capture a full page by scrolling and stitching multiple frames.

- 支持右侧滚动区、左侧滚动区、整页三种截图目标。
- Capture the right scroll area, left scroll area, or the whole page.

- 支持按“屏”计算总截图范围，并可自定义起始屏和结束屏。
- Count total capture screens and export a custom screen range.

- 支持起止线截图，可跨多屏截取开始线与结束线之间的内容。
- Capture content between a start line and an end line across multiple screens.

- 支持 `PNG`、`WebP`、`JPEG` 导出。
- Export as `PNG`, `WebP`, or `JPEG`.

- 支持原始尺寸、75%、50%、25% 及自定义宽度导出。
- Export at original size, 75%, 50%, 25%, or a custom width.

- 支持目标文件大小上限，必要时自动压缩质量和降低分辨率。
- Enforce a target maximum file size with automatic quality and resolution reduction when needed.

- 支持保存图片的同时复制图片到系统剪贴板。
- Copy the exported image to the system clipboard while saving it.

- 支持在弹窗中一键切换中文 / English。
- Support one-click Chinese / English language switching in the popup.

- 支持超长页面自动分段导出，默认阈值为导出高度 `18000px`，并可在弹窗中调整。
- Support auto split export for very long pages, with a default export-height threshold of `18000px` configurable in popup settings.

- 默认可在截图前临时隐藏 `fixed / sticky` 悬浮元素，减少重复头部和浮层干扰。
- Optionally hide `fixed / sticky` elements before capture to reduce duplicated headers and overlays.

## 安装方式 / Installation

### 方式一：加载已解压扩展 / Option 1: Load as an unpacked extension

1. 下载或克隆本仓库。
2. 打开 Chrome，访问 `chrome://extensions/`。
3. 打开右上角“开发者模式 / Developer mode”。
4. 点击“加载已解压的扩展程序 / Load unpacked”。
5. 选择当前目录：`chrome-extension/fullpage-screenshot`

1. Download or clone this repository.
2. Open Chrome and go to `chrome://extensions/`.
3. Enable `Developer mode`.
4. Click `Load unpacked`.
5. Select the folder: `chrome-extension/fullpage-screenshot`

### 方式二：从 Releases 安装 / Option 2: Install from Releases

1. 在 GitHub Releases 中下载最新的 zip 发布包。
2. 解压后得到扩展目录。
3. 按上面的“加载已解压扩展”步骤安装。

1. Download the latest zip package from GitHub Releases.
2. Extract the archive.
3. Install it using the same `Load unpacked` steps above.

## 使用说明 / Usage

1. 打开你要截图的网页。
2. 点击工具栏中的“Full Page Capture”图标。
3. 选择截图目标区域：右侧滚动区、左侧滚动区，或整页。
4. 选择截图范围：
   - 全部屏
   - 自选屏数
   - 起止线截图
5. 选择导出格式、分辨率和目标文件大小上限。
6. 点击“开始整页截图”。

1. Open the page you want to capture.
2. Click the `Full Page Capture` extension icon.
3. Choose the target capture region: right scroll area, left scroll area, or full page.
4. Choose the capture scope:
   - All screens
   - Custom screen range
   - Line-range capture
5. Select export format, resolution, and target file size limit.
6. Click `开始整页截图 / Start Capture`.

## 起止线截图 / Line-Range Capture

- 点击“去页面设置起止线并自动截图”后，回到网页先点击开始线。
- 然后滚动到结束位置，再点击结束线。
- 扩展会自动截取两条线之间的内容，并自动进入保存流程。

- Click `Go to page to set start/end lines and auto capture`.
- Back on the page, click once to place the start line.
- Scroll to the ending position and click again to place the end line.
- The extension will capture the content between the two lines and start the save flow automatically.

## 导出说明 / Export Notes

- `PNG` 更适合高保真截图，但文件通常更大。
- `PNG` is best for highest fidelity, but files are usually larger.

- `WebP` 通常在清晰度和体积之间更平衡。
- `WebP` usually offers a better balance between clarity and file size.

- `JPEG` 兼容性最好，适合普通分享场景。
- `JPEG` has the best compatibility for general sharing.

- 设置“目标文件大小上限”后，扩展会优先压缩质量，必要时再缩小分辨率。
- When a target file size limit is set, the extension reduces quality first and resolution if needed.

- 当导出高度超过“自动分段阈值”时，扩展会自动按段导出多张图片以保持清晰度。
- When export height exceeds the auto split threshold, the extension exports multiple parts to preserve image clarity.

- 图片保存时会同时尝试复制到系统剪贴板，便于直接粘贴到聊天工具或文档中。
- The extension also tries to copy the exported image to the system clipboard for direct pasting into chat tools or documents.

## 权限说明 / Permissions

- `activeTab`: 获取当前活动标签页内容。
- `activeTab`: Access the currently active tab.

- `downloads`: 保存截图文件。
- `downloads`: Save screenshot files.

- `offscreen`: 在离屏文档中拼接图片和处理导出。
- `offscreen`: Stitch images and process exports in an offscreen document.

- `scripting`: 注入页面辅助脚本。
- `scripting`: Inject helper scripts into the page.

- `storage`: 保存用户设置。
- `storage`: Store user settings.

- `tabs`: 获取标签页和窗口信息。
- `tabs`: Read tab and window information.

- `clipboardWrite`: 将导出的图片写入系统剪贴板。
- `clipboardWrite`: Write exported images to the system clipboard.

## 隐私说明 / Privacy

- 所有截图、拼接、压缩、导出过程都在本地浏览器中完成。
- All capture, stitching, compression, and export steps run locally in the browser.

- 扩展不会主动上传截图内容到服务器。
- The extension does not upload captured content to a remote server.

- 扩展不会要求登录账号。
- The extension does not require sign-in.

### Privacy Policy URL

- https://github.com/sikilab/webshotscreen/blob/main/PRIVACY.md

## 适用场景 / Recommended Use Cases

- ChatGPT、Claude、Gemini 等左右分栏页面截图
- 双栏内容站点截图
- 长文、政策公告、帮助文档截图
- 聊天记录、评论流、搜索结果页截图

- ChatGPT, Claude, Gemini, and similar split-pane pages
- Dual-column content sites
- Long articles, policy pages, and documentation
- Chat logs, comment feeds, and search result pages

## 发布建议 / Release Notes for Maintainers

- 每次发布前请递增 `manifest.json` 中的版本号。
- Bump the version in `manifest.json` before every release.

- 建议将可安装 zip 包上传到 GitHub Releases。
- It is recommended to upload an installable zip package to GitHub Releases.

- 如果更新了图标、权限或导出逻辑，请在 Releases 说明中明确列出。
- If icons, permissions, or export behavior changed, mention them clearly in the release notes.

## 当前版本 / Current Version

`1.0.29`

## 作者 / Author

`sikilab`
