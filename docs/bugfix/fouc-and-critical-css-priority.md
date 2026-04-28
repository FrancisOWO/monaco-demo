# FOUC 页面闪烁 + Critical CSS 优先级覆盖导致面板不显示

## 问题一：页面刷新闪烁

### 现象
刷新页面时，页面内容短暂变为未样式化的纯文本：菜单下拉项、弹窗、状态栏内容等全部裸露显示为一行行文字，然后才恢复为正常界面。

### 根因
项目使用 Vite + JS 模块注入 CSS（`import './styles/main.css'`），CSS 在 JS 模块加载后才生效。而 HTML 中的元素（`.menu-dropdown`、`.modal`、`#status-bar` 等）在 DOM 解析时就已可见，CSS 还未到达就先渲染了。

### 修复过程

**第一次尝试（失败）**：在 `<head>` 的 critical `<style>` 中写布局规则（`#menu-bar { display: flex; ... }` 等），只隐藏 `.menu-dropdown` 和 `.modal`。但状态栏等内容仍会闪烁，因为内联布局规则不够完整。

**第二次尝试（成功）**：`body { visibility: hidden }` + `document.body.style.visibility = 'visible'`。初始整个页面不可见，JS 初始化全部完成后才显示。这是最彻底的方案——不依赖部分 CSS 规则覆盖，直接从源头阻断渲染。

### 关键教训
- **Vite 项目中 CSS 通过 JS 模块注入**，不要假设 CSS 和 HTML 同步到达浏览器
- `visibility: hidden` 优于 `display: none`：前者不改变布局流，页面在 hidden 状态下已完成布局计算，切换为 visible 时无需重新布局，避免二次渲染抖动
- `opacity: 0` 也可用，但 `visibility: hidden` 还能阻止交互事件，更安全

### 相关 commit
- `117a5c7` fix: 修复页面刷新时菜单项文本闪烁（FOUC）
- `199a5cf` fix: 修复页面刷新闪烁与 Logger 面板定位

---

## 问题二：Critical CSS 优先级覆盖导致 Logger 面板不显示

### 现象
点击状态栏 Logger 按钮，面板的 `hidden` class 被移除，但面板仍然不可见。`getComputedStyle` 返回 `display: none`。

### 根因
为了防 FOUC，critical `<style>` 中写了：

```css
#log-panel { display: none; }
```

而模块 CSS 中隐藏规则是：

```css
#log-panel.hidden { display: none; }
```

这两个选择器的 **优先级相同**（都包含一个 ID 选择器）。但 critical style 的规则没有 `.hidden` 限制条件，它 **无条件地** 设 `display: none`。当 JS 移除 `hidden` class 后，模块 CSS 的 `#log-panel.hidden` 不再匹配，但 critical style 的 `#log-panel { display: none }` **仍然匹配且生效**，所以面板始终 `display: none`。

### 修复
从 critical `<style>` 中移除 `#log-panel`。面板初始 HTML 由 JS 动态创建时已自带 `hidden` class，模块 CSS 的 `#log-panel.hidden` 规则足以处理隐藏/显示切换。

```diff
- .menu-dropdown, .modal, #dialog-overlay, #log-panel { display: none; }
+ .menu-dropdown, .modal, #dialog-overlay { display: none; }
```

### 关键教训
- **Critical CSS 中只写需要无条件隐藏的规则**，不要与 JS 控制的 class 切换冲突
- ID 选择器优先级极高（0,1,0,0），在 critical style 中使用 ID 选择器时尤其要小心——它会覆盖模块 CSS 中任何 class 组合规则
- 当 `#foo { display: none }` 和 `#foo.hidden { display: none }` 优先级相同时，后者有 `.hidden` 条件限制，移除 class 后前者仍然无条件生效——这是一个容易被忽视的 CSS 层叠陷阱
- **JS 动态创建的元素不需要放在 critical CSS 中**，因为它们在 JS 执行后才加入 DOM，此时模块 CSS 已加载

### 相关 commit
- `572448a` fix: Logger 面板无法显示（critical CSS 覆盖了模块 CSS）