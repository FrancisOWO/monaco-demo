# LSP 服务器测试修复总结

## 问题概述

Monaco Editor 示例项目中的 Python LSP（基于 Pyright）服务器自动化测试存在多个问题，导致测试超时或编译失败。

---

## 问题列表

### P0：编译错误 — `stopPyright()` 签名不匹配

**错误信息：**
```
server/src/server.ts(120,3): error TS2554: Expected 1 arguments, but got 0.
```

**原因：** `pyright-launcher.ts` 中 `stopPyright` 函数签名已改为 `stopPyright(process: ChildProcess)`，但 `server.ts:120` 在 SIGINT 处理器中仍以无参方式调用 `stopPyright()`。

**修复方案：**
- 移除未使用的 `stopPyright` 导入
- 简化 SIGINT 处理器，直接调用 `process.exit(0)`

```typescript
// 修复前
process.on('SIGINT', () => {
  stopPyright();  // 编译错误
  process.exit(0);
});

// 修复后
process.on('SIGINT', () => {
  process.exit(0);
});
```

---

### P1：WebSocket 进程管理问题

**现象：** 服务器在处理多个 WebSocket 连接时可能出现时序问题，导致消息丢失或连接异常关闭。

**原因分析：**
1. 当 WebSocket 关闭时，`pyright.kill()` 被调用，但事件监听器未正确清理
2. 缓冲区状态在连接关闭后可能仍被访问
3. 服务器发送给已关闭 WebSocket 的消息可能引发错误

**修复方案：**
- 添加 `closed` 标志，在 WebSocket 关闭后阻止进一步的消息处理
- 在 close 处理器中正确清理所有事件监听器

```typescript
let closed = false;

// 在各个处理器中检查
if (closed) return;

// close 处理器中清理
ws.on('close', () => {
  closed = true;
  pyright.stdout?.removeAllListeners();
  pyright.stdin?.removeAllListeners();
  pyright.stderr?.removeAllListeners();
  pyright.kill();
});
```

---

### P2：测试超时 — `textDocument/completion` 测试

**现象：**
- 单独运行测试时失败（1006 关闭码 — 异常关闭）
- 只收到 `window/logMessage` 通知，未收到 `initialize` 响应
- WebSocket 在发送初始化请求后立即关闭

**原因分析：**
1. **时序问题**：Pyright 进程刚启动还未准备好就收到了请求
2. **消息处理时序**：服务器端日志输出改变了消息处理的时间顺序
3. **多次发送初始化**：当收到带有 `id` 属性的通知时，可能误触发了初始化流程

**修复方案：**
- 添加 `initialized` 标志，防止重复发送 `initialized` 通知
- 添加更详细的日志来观察消息流
- 清理测试中的调试代码

```javascript
// 测试中防止重复初始化
let initialized = false;

if (response.id === 1 && response.result && !initialized) {
  initialized = true;
  // 发送 initialized 通知...
}
```

---

## 关键发现

### 1. WebSocket 关闭码 1006 vs 1005

- **1006**：异常关闭（无关闭帧）— 通常表示连接出错或被服务器重置
- **1005**：正常关闭（无关闭帧）— 表示连接正常关闭但没有收到关闭帧

通过日志分析，发现添加 `console.log` 竟然能"修复"问题，这说明消息处理的时序敏感性很高。

### 2. 事件监听器泄漏

当一个 WebSocket 连接关闭时，如果事件监听器没有被正确移除，可能影响后续连接的消息处理。

### 3. `closed` 标志的重要性

在异步消息处理中，即使调用了 `ws.close()`，在此之前已在处理的消息仍可能触发回调。使用 `closed` 标志可以防止这种情况。

---

## 测试结果

```
PASS server/test/server.test.js
  Python LSP Server
    √ should connect to WebSocket (25 ms)
    √ should respond to initialize request (156 ms)
    √ should handle textDocument/completion request (2269 ms)

Test Suites: 1 passed, 1 total
Tests:       3 passed, 3 total
```

---

## 心得体会

1. **时序问题最难调试**：添加日志改变了执行时序，使得问题消失或出现。这是典型的"Heisenbug"（观察者效应）。

2. **状态管理至关重要**：在处理多个并发连接时，每个连接应该维护独立的状态，而不是依赖共享的全局状态。

3. **资源清理不能遗漏**：事件监听器、进程、子线程等资源必须在连接关闭时正确释放，否则会导致资源泄漏或状态污染。

4. **测试隔离**：每个测试用例应该尽可能独立，避免前一个测试的状态影响后一个测试。

5. **日志的价值**：详细的日志不仅帮助调试，还能通过改变时序来"意外"暴露或隐藏问题。

---

## 相关文件

| 文件 | 修改内容 |
|------|----------|
| `server/src/server.ts` | 添加 closed 标志、事件监听器清理、详细日志 |
| `server/src/pyright-launcher.ts` | 添加 close 事件监听 |
| `server/test/server.test.js` | 添加 initialized 标志、跳过通知逻辑 |

---

## Git 提交记录

- `7315408` — fix: 修复服务器编译错误和WebSocket进程管理
- `5788c78` — fix: 修复 LSP 服务器测试超时问题
