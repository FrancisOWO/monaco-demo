# 浮动面板定位跑到编辑器外部

### 现象
Logger 面板浮动出现，但位置在编辑器区域之外（可能在视窗边缘或被遮挡），看不到或只能看到一部分。

### 根因
初始定位代码使用 `logBtn.getBoundingClientRect()` 计算位置：

```js
panel.style.left = (rect.left - 220 + rect.width) + 'px';
panel.style.top = (rect.top - 10) + 'px';
```

Logger 按钮在状态栏右下角，`rect.top` 接近视窗底部。面板高度约 330px，`rect.top - 10` 会让面板顶部在视窗底部附近，大部分面板内容超出视窗上界。而且面板 `position: fixed` 的坐标系是视窗而非编辑器区域。

### 修复
改为基于 `#editor-container` 的 `getBoundingClientRect` 计算，确保面板完全在编辑器区域内：

```js
const editorEl = document.getElementById('editor-container');
const rect = editorEl.getBoundingClientRect();
let left = rect.right - 220 - 8;
let top = rect.bottom - panelH - 8;
left = Math.max(rect.left + 4, left);
top = Math.max(rect.top + 4, top);
```

同时使用 `requestAnimationFrame` 确保面板已渲染后才计算 `offsetHeight`，避免高度为 0 的时序问题。

### 关键教训
- `position: fixed` 元素的定位坐标系是视窗（viewport），不是父元素
- 用按钮位置定位浮动面板时，按钮可能在视窗边缘，导致面板溢出
- **始终基于内容区域（编辑器区域）而非按钮来定位浮动面板**
- `offsetHeight` 在元素 `display: none` 时为 0，需要先让元素可见再读取尺寸，`requestAnimationFrame` 可保证 DOM 更新后读取

### 相关 commit
- `199a5cf` fix: 修复页面刷新闪烁与 Logger 面板定位