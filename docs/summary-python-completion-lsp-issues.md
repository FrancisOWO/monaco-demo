# Python 补全与 LSP 问题分析

## 问题描述

1. **LSP 关闭时**：编辑器有 Python 下拉菜单补全（基础补全）
2. **LSP 连接时**：下拉菜单显示不出来

---

## 根本原因分析

### 代码结构

- `completions.js` 中定义了 `getBasePythonCompletions()`（17 个 Python 代码片段），但 `registerCompletions()` 只注册了 C++ 和 Go 的补全 provider，**没有注册 Python 的**。
- Python 补全 provider 的注册在 `python-client.js` 的 `registerLSPCompletionProvider()` 中。

### LSP 关闭时有 Python 补全的原因

LSP 连接成功后关闭开关时：
1. `registerLSPCompletionProvider()` 在连接成功时被调用（第 102 行），注册了 Python 补全 provider
2. 关闭 LSP 时只是 `lspClient.disconnect()`，provider 仍处于注册状态
3. `is_connected()` 返回 false，只返回基础补全

### LSP 连接时补全下拉菜单不显示的原因

`sendRequest()` 没有超时机制。当 LSP 服务器连接但响应慢或无响应时，`await lspClient.getCompletions()` 会一直挂起，Monaco 补全会话超时后就不显示下拉菜单了。

---

## 修复方案

在 `sendRequest()` 中添加超时机制（200ms）：

```javascript
sendRequest(method, params, timeoutMs = 200) {
    return new Promise((resolve, reject) => {
        // ...
        const timer = setTimeout(() => {
            messageCallbacks.delete(id);
            reject(new Error(`LSP request timed out: ${method}`));
        }, timeoutMs);

        messageCallbacks.set(id, {
            resolve: (result) => { clearTimeout(timer); resolve(result); },
            reject: (err) => { clearTimeout(timer); reject(err); }
        });
        // ...
    });
}
```

超时后 `getCompletions` 的 catch 块会返回基础补全，下拉菜单最多延迟 200ms 显示。

---

## 相关文件

- `src/lsp/python-client.js:70` - `sendRequest` 方法（带超时）
- `src/lsp/python-client.js:336` - `registerLSPCompletionProvider` 方法
- `src/index.html:86` - `initLSP()` 函数
- `src/completions/completions-python.js` - Python 基础补全配置（`getBasePythonCompletions`）
- `src/completions/completions-cpp.js` - C++ 补全配置
- `src/completions/completions-go.js` - Go 补全配置
- `src/completions.js` - 补全注册调度器（调用各语言注册函数）

---

## 待优化（后续改进方向）

- LSP 补全请求发出后，**先立即返回基础补全**，再异步追加 LSP 结果，这样下拉菜单可以更快显示
- `registerLSPCompletionProvider` 可以重构为边接收边合并，而非等待全部结果
