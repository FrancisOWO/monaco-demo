# LSP 服务器测试修复 - 交接文档

## 项目概述

Monaco Editor 示例项目，集成 Python LSP（基于 Pyright），实现代码补全、诊断等功能。

## 当前状态

### 构建状态
- `pnpm run server:build` -- **编译失败**，`server.ts:120` 调用 `stopPyright()` 未传参数
- `pnpm test` -- **无法运行**（依赖编译通过）

### 编译错误
```
server/src/server.ts(120,3): error TS2554: Expected 1 arguments, but got 0.
```
原因：`pyright-launcher.ts` 中 `stopPyright` 签名已改为 `stopPyright(process: ChildProcess)`，但 `server.ts:120` 仍以 `stopPyright()` 无参调用（在 SIGINT 处理中）。

### 测试结果（上次编译通过时）
| 测试用例 | 状态 | 说明 |
|---------|------|------|
| should connect to WebSocket | 通过 | 基础 WebSocket 连接正常 |
| should respond to initialize request | **失败** | 超时，Pyright 未返回响应 |
| should handle textDocument/completion request | **失败** | 依赖上一个测试的修复 |

### 已修复的问题（历史）
1. **Pyright 模块路径错误** -- 已修复，从项目根目录 `node_modules/` 查找
2. **express-ws 类型声明缺失** -- 已创建 `server/src/types.d.ts`
3. **req 参数类型不匹配** -- WebSocket 回调中 `req` 改为 `any`
4. **测试不跳过通知消息** -- 已处理，跳过 `window/logMessage` 等通知
5. **全局 Pyright 进程复用问题** -- 改为每个 WebSocket 连接创建独立进程

## 待修复问题（按优先级排序）

### P0：编译错误 - stopPyright() 签名不匹配

**文件：** `server/src/server.ts:118-121`
**问题：** SIGINT 处理中调用 `stopPyright()` 无参数，但函数签名已改为需要 `ChildProcess` 参数。
**修复方案：** 此处是服务器关闭时清理所有进程，可以改为直接 `process.exit(0)`，或者维护一个当前活跃 Pyright 进程的引用。

```typescript
// 当前代码（编译失败）
process.on('SIGINT', () => {
  console.log('\n[Server] Shutting down...');
  stopPyright();       // ← 错误：缺少参数
  process.exit(0);
});
```

### P1：第二个测试超时 - Pyright 响应未通过 WebSocket 传回

测试日志显示发送 `initialize` 请求后，没有收到任何 `message` 事件。

**可能原因：**
1. **第一个测试关闭 WebSocket 后，Pyright 进程被 kill，第二个测试的新连接需要启动新 Pyright 进程** -- 但之前日志显示旧进程中 `launchPyright()` 确实被调用并返回了新进程
2. **新 Pyright 进程的 stdout 事件监听器可能被前一个进程残留的监听器干扰**
3. **express-ws 对同一端点的多次连接处理可能有问题**

**建议修复方案 A（推荐）：修复事件监听器清理**
```typescript
// server.ts 中的 WebSocket close 处理
ws.on('close', () => {
  console.log('[WebSocket] Client disconnected');
  pyright.kill();
  pyright.stdout?.removeAllListeners();
  pyright.stdin?.removeAllListeners();
  pyright.stderr?.removeAllListeners();
});
```

**建议修复方案 B：简化测试为单测试全流程**
- 把 connect + initialize + completion 合并到一个测试中
- 避免多个测试之间互相影响

**建议修复方案 C：重构为单 Pyright 进程架构**
- 服务器启动时创建一个 Pyright 进程
- 多个 WebSocket 连接共享同一个进程
- 更符合生产环境架构

### P2：第三个测试 - 依赖 P1 修复

补全测试在 `initialize` 响应后才发送 `initialized` 通知和文档打开请求。需要先修复 P1。

## 关键文件

| 文件 | 说明 | 当前问题 |
|------|------|----------|
| `server/src/server.ts` | WebSocket 服务器，桥接 Monaco 和 Pyright | P0 编译错误 + P1 响应丢失 |
| `server/src/pyright-launcher.ts` | Pyright 进程管理 | stopPyright 签名已改 |
| `server/src/config.ts` | 服务器配置（端口、路径） | 无 |
| `server/src/types.d.ts` | express-ws 类型声明 | 无 |
| `server/src/index.ts` | 服务器入口 | 无 |
| `server/test/server.test.js` | 自动化测试 | P1/P2 测试超时 |
| `package.json` | 项目依赖（根目录，使用 pnpm） | 无 |

## 项目命令

```bash
pnpm run server:build   # 编译 TypeScript 服务器
pnpm run server:dev     # 开发模式运行服务器（ts-node）
pnpm run server:start   # 运行编译后的服务器
pnpm test               # 运行自动化测试
pnpm run dev            # 启动前端开发服务器
```

## 注意事项

- 使用 **pnpm** 而非 npm
- 依赖安装在**项目根目录**，不是 server 子目录
- `server/package.json` 已删除，所有依赖在根 `package.json` 中
- 修复完一个 bug 后应 git commit
- 编译输出在 `server/dist/` 目录（已 gitignore）
- 最近两次 commit：
  - `8df9d98` docs: 添加 LSP 测试修复交接文档
  - `8510c27` fix: 修复 LSP 服务器构建和测试问题
