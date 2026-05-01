# LSP 集成踩坑记录

Monaco Editor + WebSocket + Pyright 语言服务器集成过程中遇到的问题与解决方案。

---

## 1. 工作区路径不匹配导致补全超时

### 现象

```
Completion error: LSP request timed out: textDocument/completion
```

服务端日志：

```
File or directory "\workspace" does not exist.
No source files found.
```

### 原因

客户端 `initialize` 时设置 `rootUri: 'file:///workspace'`，但 Pyright 的实际工作目录是 `process.cwd()`（如 `D:\Users\Lenovo\_Demo\_Projects\monaco-start`）。Pyright 在 Windows 上把 `file:///workspace` 解析成 `\workspace`，这个目录不存在，导致 Pyright 认为工作区内没有源文件，所有补全请求无响应。

### 解决

- 服务端新增 `GET /workspace-root` 接口，返回 Pyright 实际工作区的 `file://` URI
- 客户端连接时先调用该接口获取真实路径，用于 `initialize` 的 `rootUri` 和 `workspaceFolders`

```js
// 服务端 server.ts
app.get('/workspace-root', (_req, res) => {
    const workspaceRoot = config.pyright.workspaceRoot;
    const normalized = workspaceRoot.replace(/\\/g, '/');
    const uri = normalized.startsWith('/') ? `file://${normalized}` : `file:///${normalized}`;
    res.json({ path: workspaceRoot, uri });
});

// 客户端 python-client.js
async fetchWorkspaceRoot() {
    const response = await fetch('http://localhost:3000/workspace-root');
    const data = await response.json();
    workspaceRootUri = data.uri;
}
```

---

## 2. LSP 错误响应误判为有效错误

### 现象

```
[LSP Client ERROR] Completion error: {}
```

### 原因

LSP 服务器有时返回 `error: {}`（空对象）。在 JS 中 `{}` 是 truthy，`if (message.error)` 为 true，导致空对象被当作错误 reject，而 `message.result` 里的有效数据被丢弃。

### 解决

判断 `message.error.message` 是否存在，而不是 `message.error` 本身：

```js
// 修改前
if (message.error) {
    callback.reject(message.error);
}

// 修改后
if (message.error && message.error.message) {
    callback.reject(new Error(message.error.message));
}
```

---

## 3. 补全列表闪烁（triggerSuggest 问题）

### 现象

LSP 补全结果回来后，用 `editor.trigger('lsp-cache', 'editor.action.triggerSuggest', {})` 刷新补全列表，导致列表关闭再重新弹出，用户体验闪烁。

### 原因

原方案是异步请求 LSP，结果回来后缓存，再 `triggerSuggest` 重新触发补全。这会关闭当前列表再重新弹出，且缓存的是上一次位置的结果。

### 解决

改为 `provideCompletionItems` 返回 Promise，LSP 结果回来后直接 resolve 追加到列表，无需重新触发：

```js
provideCompletionItems(model, position) {
    const allSuggestions = [...cachedSuggestions];

    // 异步请求 LSP
    lspClient.getCompletions(uri, line, character).then(result => {
        if (activeCompletionResolve) {
            activeCompletionResolve({ suggestions: [...allSuggestions, ...lspSuggestions] });
        }
    });

    // 返回 Promise 等待 LSP 结果
    return new Promise(resolve => {
        activeCompletionResolve = resolve;
        // 超时兜底
        setTimeout(() => {
            if (activeCompletionResolve === resolve) {
                resolve({ suggestions: allSuggestions });
            }
        }, 3000);
    });
}
```

---

## 4. 请求超时时间设置不合理

### 现象

默认超时 200ms，补全请求频繁超时。

### 原因

LSP 请求需要经过 WebSocket 传输 → Pyright 解析 → 执行分析 → 返回结果，链路在本地也需要几十到几百毫秒。Pyright 初始化或索引项目时更慢。200ms 过短，有效结果还没回来就被丢弃了。

### 要点

- **超时时间 ≠ 用户感知延迟**。超时是兜底值，表示"等多久放弃"
- **用户感知延迟**应该通过 `triggerKind` 取消旧请求来优化，而非缩短超时
- 建议：普通补全请求超时 3000-10000ms，initialize 请求可更长

---

## 5. LSP 消息格式与 WebSocket 传输

### 要点

LSP over stdio 使用 `Content-Length` 头 + `\r\n\r\n` + JSON body 的格式。WebSocket 传输时：

- **客户端→服务端**：原样转发 `Content-Length: xxx\r\n\r\n{...}` 给 Pyright stdin
- **服务端→客户端**：Pyright stdout 输出需要 buffer 拼接 + 按 `Content-Length` 解析，因为一次 `data` 事件可能包含不完整的消息或多条消息

```js
// 服务端 Pyright stdout 解析
let buffer = '';
let contentLength = -1;

pyright.stdout.on('data', (data) => {
    buffer += data.toString();
    while (true) {
        if (contentLength === -1) {
            const headerEnd = buffer.indexOf('\r\n\r\n');
            if (headerEnd === -1) break;
            const match = buffer.substring(0, headerEnd).match(/Content-Length:\s*(\d+)/i);
            contentLength = parseInt(match[1], 10);
            buffer = buffer.substring(headerEnd + 4);
        }
        if (buffer.length >= contentLength) {
            const content = buffer.substring(0, contentLength);
            buffer = buffer.substring(contentLength);
            contentLength = -1;
            ws.send(`Content-Length: ${content.length}\r\n\r\n${content}`);
        } else {
            break;
        }
    }
});
```

---

## 6. LSP CompletionItemKind 映射

### 要点

LSP 和 Monaco 各自定义了 `CompletionItemKind` 枚举，数值含义不同。LSP 通过 JSON-RPC 传输时枚举名丢失，只剩数值。需要映射表将 LSP 数值转换为 Monaco 的枚举值，这样补全项才能显示正确的图标。

LSP 定义了 25 种类型（1-25），包含 Text、Method、Function、Constructor、Field、Variable、Class、Interface、Module、Property、Unit、Value、Enum、Keyword、Snippet、Color、File、Reference、Folder、EnumMember、Constant、Struct、Event、Operator、TypeParameter。

未匹配的类型默认返回 `Property`。

---

## 7. JavaScript 单线程不需要加锁

### 要点

WebSocket 的 `onopen`、`onclose`、`onerror`、`onmessage` 回调在浏览器单线程事件循环中依次执行，不存在并发问题。`isConnected` 等状态变量不需要加锁。

唯一需要注意的是 `onerror` 和 `onclose` 可能连续触发（出错后通常会触发 close），这是事件顺序问题而非并发问题，靠状态判断处理即可。

---

## 8. WebSocket 是浏览器内置全局 API

### 要点

`WebSocket` 和 `document`、`window`、`fetch` 一样是浏览器内置 API，不需要 import。`@types/node` 的 `web-globals/` 目录也提供了 TypeScript 类型声明，使得 TypeScript 能识别 `WebSocket` 的类型。

如果代码需要在 Node.js 环境运行（Node 22 之前），则需要 `npm install ws` 并手动导入。
