# 快捷键冲突问题说明

本文档记录 `Ctrl+N` 新建文件快捷键触发浏览器新建窗口的问题、原因、修复过程和验证方式。

## 问题现象

编辑器实现了 `Ctrl+N` 作为“新建文件”快捷键，但实际使用时浏览器仍会响应该组合键，打开新窗口或新标签页，而不是在编辑器内创建 untitled 文件。

受影响的不只是 `Ctrl+N`。同类风险也存在于：

- `Ctrl+O`：浏览器打开本地文件。
- `Ctrl+S`：浏览器保存网页。
- `Ctrl+F`：浏览器查找页面。
- `Ctrl+H`：浏览器历史或浏览器级功能。
- `Ctrl+W`：浏览器关闭标签页。

## 原因分析

快捷键处理逻辑位于 `src/ui/toolbar.js` 的 `setupGlobalShortcuts(editor)`。

修复前监听方式是：

```js
document.addEventListener('keydown', (e) => {
    // 匹配 action
    e.preventDefault();
    handleAction(action, editor);
});
```

这里存在两个问题：

1. 监听器运行在默认冒泡阶段，浏览器或其他处理器可能先于应用处理系统级快捷键。
2. 只调用 `preventDefault()`，没有调用 `stopPropagation()`，事件仍可能继续传播给其他监听器。

对 `Ctrl+N`、`Ctrl+W` 这类浏览器保留快捷键来说，处理时机需要尽可能靠前，并且需要明确阻断继续传播。实际验证中 `Ctrl+N` 仍会触发浏览器新建窗口，因此最终将它替换为 `Alt+N`。

## 修复方案

修复点在 `src/ui/toolbar.js`。

改动包括：

1. 将 `Ctrl+N` 替换为 `Alt+N`。
2. 将高风险的 `Ctrl+W` 替换为 `Alt+W`，避免触发浏览器关闭标签页。
3. 将 `keydown` 监听器注册到 capture 阶段。
4. 识别到编辑器快捷键后，同时调用 `preventDefault()` 和 `stopPropagation()`。
5. 继续统一走 `handleAction(action, editor)`，避免快捷键逻辑和菜单逻辑分叉。

修复后的关键逻辑：

```js
if (!action) return;

e.preventDefault();
e.stopPropagation();
handleAction(action, editor);
}, true);
```

最后一个参数 `true` 表示使用 capture 阶段监听。

## 自动化测试

测试文件：

- `src/ui/__tests__/toolbar.test.ts`

新增/加强的断言包括：

- `setupGlobalShortcuts` 注册 `keydown` 时使用 capture。
- 所有 `SHORTCUT_DEFINITIONS` 中的快捷键都会映射到对应编辑器 action。
- 所有快捷键都会调用 `preventDefault()` 和 `stopPropagation()`。
- `Alt+N` 会进入 `createNewFile`。
- `Ctrl+N` 不再映射到任何编辑器 action，避免触发浏览器新建窗口。
- `Ctrl+W` 不再映射到任何编辑器 action，避免触发浏览器关闭标签页。
- `Ctrl+O`、`Ctrl+F`、`Alt+Down` 等快捷键仍正常路由到对应 editor action。

测试覆盖的核心断言：

```ts
expect(keydownOptions).toBe(true);
expect(altN.preventDefault).toHaveBeenCalled();
expect(altN.stopPropagation).toHaveBeenCalled();
expect(fileStore.createNewFile).toHaveBeenCalled();
```

## 验证结果

已运行相关测试：

```bash
pnpm test -- --runInBand src/ui/__tests__/toolbar.test.ts
```

结果：通过。

已运行完整测试：

```bash
pnpm test -- --runInBand
```

结果：

```text
Test Suites: 18 passed, 18 total
Tests:       100 passed, 100 total
Snapshots:   0 total
```

## 后续注意事项

- 后续新增全局快捷键时，应继续走 `setupGlobalShortcuts` 和 `handleAction`。
- 对会和浏览器冲突的组合键，必须确认测试覆盖 `preventDefault()` 和 `stopPropagation()`。
- 不要在 `main.js` 或其他模块再新增独立快捷键分支，避免菜单和快捷键行为不一致。
