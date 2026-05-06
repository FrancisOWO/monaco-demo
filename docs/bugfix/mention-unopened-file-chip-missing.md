# @mention 未打开文件 context-chip 不出现

### 现象
在 Chat 输入框用 `@` 选择文件时，已在编辑器中打开的文件能立即出现 context-chip；未打开的文件选择后 chip 完全不出现（或长时间延迟后才出现），视觉上就像没被添加一样。

### 根因
`insertMention` 中处理文件 mention 的逻辑分两条路径：

```js
// 已打开文件 — 同步添加 chip ✓
const openFile = openFiles.get(item.path);
if (openFile) {
    chatStore.addFileContext(item.path, openFile.name, openFile.model.getValue());
} else {
    // 未打开文件 — 异步 fetch 后才添加 chip ✗
    fetchFileContext(item.path).then(fileData => {
        chatStore.addFileContext(fileData.path, fileData.name, fileData.content);
    }).catch(e => console.warn(...));
}
```

问题链路：

1. **异步才添加**：`fetchFileContext` 是网络请求，只有 `.then` 回调成功后才调用 `addFileContext`。如果 fetch 失败（服务端未实现该接口、路径格式不匹配等），chip 永远不会出现，`.catch` 仅静默打 warn 日志。
2. **已有数据未利用**：`showMentionPopup` 构建的弹窗列表中每项已经携带了 `item.path` 和 `item.name`，这些信息足以立即渲染 chip，但代码没有利用它们——非要等 fetch 拿到完整数据后才添加。
3. **发送消息时的隐患**：如果用户在 async fetch 未完成时就点发送，`streamChatMessage` 会把 `contextItems`（含空 content）直接发给 AI 服务端，导致 AI 看不到文件内容。

### 修复

**核心思路**：先用弹窗已有数据即时添加 chip（保证视觉同步），再异步补充 content（保证功能完整）。

#### 1. `chat-store.js` — 新增 `updateFileContent`

```js
/**
 * 更新已有文件上下文的 content（用于异步补充未打开文件的内容）
 */
export function updateFileContent(path, content) {
    const item = chatState.contextItems.find(i => i.path === path && i.type === 'file');
    if (item) {
        item.content = content;
    }
}
```

只就地修改 content，不重新 emit `onContextChanged`（chip 已渲染，无需重绘）。也不触发 dedup——因为 `addFileContext` 的 dedup 判断基于 `path`，`updateFileContent` 是对已存在项的更新，不冲突。

#### 2. `chat-input.js` — `insertMention` 立即添加 chip

```js
if (item.category === 'file') {
    const openFile = openFiles.get(item.path);
    if (openFile) {
        chatStore.addFileContext(item.path, openFile.name, openFile.model.getValue());
    } else {
        // 未打开的文件：先用弹窗数据即时添加 chip，再异步补充内容
        chatStore.addFileContext(item.path, item.name, '');
        fetchFileContext(item.path).then(fileData => {
            chatStore.updateFileContent(fileData.path, fileData.content);
        }).catch(e => console.warn('[ChatInput] Failed to fetch file content:', e));
    }
}
```

#### 3. `chat-input.js` — `sendMessage` 发送前兜底填充 content

防止用户在 async fetch 未完成时就发送消息，导致 AI 收到空文件内容：

```js
// 确保所有文件上下文都有内容（未打开文件可能 content 为空）
for (const ctx of chatStore.getContextItems()) {
    if (ctx.type === 'file' && !ctx.content) {
        try {
            const openFile = openFiles.get(ctx.path);
            if (openFile) {
                chatStore.updateFileContent(ctx.path, openFile.model.getValue());
            } else {
                const fileData = await fetchFileContext(ctx.path);
                chatStore.updateFileContent(fileData.path, fileData.content);
            }
        } catch (e) {
            console.warn('[ChatInput] Failed to fill file content for:', ctx.path, e);
        }
    }
}
```

### 关键教训

1. **UI 先行，数据后补**：当用户做出选择操作时，应该用已有的 UI 数据立即反馈（添加 chip），再异步补全功能所需的数据（content）。不要让网络请求阻塞 UI 反馈。
2. **异步 `.catch` 不是"处理了"**：只打 warn 日志的 catch 让错误静默吞掉，用户永远不知道失败了。关键操作失败时应有用户可见的反馈（toast、chip 状态变化等）。
3. **发送前的兜底检查**：涉及将数据发送到外部服务（AI 服务端）的场景，发送前要校验数据完整性。content 为空就发出去 = 传了一个"幽灵文件"给 AI。
4. **`addFileContext` 的 dedup 机制是双刃剑**：它防止重复添加是对的，但也意味着一旦添加了空 content 的项，后续正常路径（`sendMessage` 的 mention 解析）会被 dedup 跳过，永远无法补上 content。所以必须有独立的 `updateFileContent` 方法来绕过 dedup。