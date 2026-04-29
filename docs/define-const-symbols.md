# 提取 Chat 符号常量文件

## Context

Chat 模块中大量 emoji、unicode 字符、按钮标签、状态文本分散在 JS、CSS、HTML 中硬编码。同一符号在不同位置重复出现（如 ⚡ 出现 3 次，🔌 出现 5 次），修改时需要多处同步。提取到常量文件后，一处定义多处引用，统一维护。

## 方案

新建 `src/chat/chat-icons.js`，导出所有符号常量。JS 文件导入使用，CSS `::before` content 通过 JS 设置（或保留 CSS 但注释标记常量名），HTML unicode 字符通过 JS 动态渲染。

### 常量分组

```js
// 图标 emoji
export const ICON = {
    THINKING: '💡',
    TOOL: '🔧',
    SKILL: '⚡',
    MCP: '🔌',
    CODE: '💻',
    USER: '👤',
    ASSISTANT: '🤖',
    FILE: '📄',
    SELECTION: '📝',
    SUCCESS: '✓',
    ERROR: '✗',
    SPARKLE: '✨',
    FOLD_TOGGLE: '∇',
    FOLD_EXPAND: '▼',
    FOLD_COLLAPSED: '＋',
    FOLD_EXPANDED: '－',
};

// 按钮 unicode 字符
export const SYMBOL = {
    CLOSE: '✕',    // ✕
    SEND: '➤',     // ➤
    STOP: '■',     // ■
    PREV: '◀',     // ◀
    NEXT: '▶',     // ▶
};

// 标签文本
export const LABEL = {
    COPY: '复制',
    COPIED: '已复制',
    THINKING: '思考中...',
    TASK_COMPLETE: '任务完成',
    FOLD: '折叠',
    EXPAND: '展开',
    EXPAND_ALL: '展开全部',
    FOLD_ALL: '折叠全部',
};

// 文件类型图标映射
export const FILE_ICON_MAP = { ... };

// 提示文本
export const TITLE = {
    CLOSE: '关闭',
    SEND: '发送',
    STOP: '停止生成',
    PREV: '上一条',
    NEXT: '下一条',
    GOTO: '跳转到指定消息',
    FOLD_ALL: '折叠全部',
    EXPAND_ALL: '展开全部',
    ...
};
```

### 文件修改清单

| 文件 | 改动 |
|------|------|
| `src/chat/chat-icons.js` | **新建** — 所有常量定义 |
| `src/chat/chat-message-renderer.js` | 导入 ICON/LABEL，替换硬编码 emoji 和文本字符串 |
| `src/chat/chat-fold-controller.js` | 导入 ICON/SYMBOL/LABEL/TITLE，替换硬编码 |
| `src/chat/chat-input.js` | 导入 ICON/FILE_ICON_MAP，替换 emoji 和图标映射 |
| `src/chat/chat-panel.js` | 导入 LABEL/SYMBOL，替换 "思考中..." 等 |
| `src/index.html` | chat 部分的 unicode 按钮（✕ ➤ ■ ◀ ▶ ＋ － ▼）改为由 JS 动态设置，或用 `<span data-icon>` 占位让 JS 填充 |
| `src/styles/chat-panel.css` | CSS `::before` content 暂保留（CSS 无法导入 JS 变量），但添加注释标记对应常量名 |

### HTML unicode 处理方式

两种方案：

**方案 A（推荐）：HTML 保留 unicode 字符，JS 常量文件同时定义相同常量用于 JS 逻辑中的动态文本**

- HTML 中 `&#x2715;` 等保留，因为 HTML 是静态结构
- JS 中需要动态创建元素时（如 `chat-fold-controller.js` 的 goto input、renderer 的 fold toggle button），从常量导入
- 优点：改动最小，HTML 结构不破坏，CSS `::before` 不受影响

**方案 B：HTML 用空占位符，JS 初始化时填充**

- HTML 按钮 `<button id="chat-close-btn" title="关闭"></button>`（无内容）
- JS 初始化时 `closeBtn.textContent = SYMBOL.CLOSE`
- 优点：完全消除硬编码，但改动大、HTML 结构不直观

选方案 A，因为 HTML 中的 unicode 是模板结构的一部分，与 JS 动态生成的文本性质不同。

### CSS `::before` 处理

CSS 无法导入 JS 常量，保留现有 `content` 声明不变，但在每行 `content` 前添加注释标记：

```css
.thinking-icon::before {
    content: "💡"; /* ICON.THINKING */
}
```

这样开发者看到注释就知道对应 `chat-icons.js` 中的哪个常量，如果需要修改，一处改常量 + 一处改 CSS 注释标记处。

## 验证

1. 运行 `npx jest` 确保所有测试通过
2. 启动 dev server，打开 AI 对话面板
3. 检查所有图标显示正常（思考💡、工具🔧、技能⚡、MCP🔌、折叠∇、展开▼）
4. 检查按钮文本正常（复制/已复制、折叠/展开）
5. 检查导航工具栏符号正常（◀▶≡⊕✕）
6. 切换深色主题验证