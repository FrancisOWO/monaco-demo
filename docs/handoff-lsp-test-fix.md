# LSP 服务器测试修复 - 交接文档

## 项目概述

Monaco Editor 示例项目，集成 Python LSP（基于 Pyright），实现代码补全、诊断等功能。

## 当前状态

### 构建状态
- `pnpm run server:build` -- 通过
- `pnpm test` -- **2/3 测试失败**，需要继续修复

### 测试结果
| 测试用例 | 状态 | 说明 |
|---------|------|------|
| should connect to WebSocket | 通过 | 基础 WebSocket 连接正常 |
| should respond to initialize request | **失败** | 超时，Pyright 未返回响应 |
| should handle textDocument/completion request | **失败** | 依赖上一个测试的修复 |

### 已修复的问题
1. **Pyright 模块路径错误** -- pyright 安装在根 `node_modules/` 下，但 `pyright-launcher.ts` 之前从 `server/node_modules/` 查找。已修复为从 `server/dist/` 向上两级找到项目根目录。
2. **express-ws 类型声明缺失** -- 创建了 `server/src/types.d.ts`。
3. **req 参数类型不匹配** -- WebSocket 回调中 `req` 改为 `any`。
4. **测试不跳过通知消息** -- Pyright 启动时会发送 `window/logMessage` 通知（无 id），测试现在会跳过这些通知。
5. **全局 Pyright 进程复用问题** -- 改为每个 WebSocket 连接创建独立 Pyright 进程。

## 核心问题（未解决）

### 第二个测试超时的根因

测试日志显示：
```
[Test Init] WebSocket opened
[Test Init] Sent initialize request
```
之后没有任何 `message` 事件触发，说明 Pyright 的响应没有通过 WebSocket 传回。

**可能原因分析：**

1. **server.ts 中 `stopPyright()` 调用签名不匹配** -- `server.ts:119` 调用 `stopPyright()` 无参数，但 `pyright-launcher.ts` 中 `stopPyright` 已改为需要传 `ChildProcess` 参数。这会导致 SIGINT 处理失败，但不影响测试。

2. **WebSocket 连接时序问题** -- 第一个测试关闭 WebSocket 时会 `pyright.kill()` 杀掉进程。第二个测试创建新连接时 `launchPyright()` 启动新进程，但新进程的 `stdout` data 事件可能因为前一个进程的事件监听器残留导致冲突。

3. **更可能的根因：express-ws 与多连接的兼容性** -- 当第一个 WebSocket 连接关闭后，服务器端创建的第二个 Pyright 进程的 stdout 数据可能无法正确转发到新的 WebSocket 连接。需要检查是否存在事件监听器泄漏或进程管理问题。

### 建议的修复方向

#### 方向 A：修复服务器端进程管理（推荐）

核心问题在 `server.ts` 中 WebSocket 关闭时的清理逻辑。当前代码直接 `pyright.kill()` 但没有清理 stdout 事件监听器。应改为：

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

#### 方向 B：重构为单 Pyright 进程 + 多客户端复用

当前架构是每个 WebSocket 连接创建独立 Pyright 进程，这在生产环境中不可行。应改为：
- 服务器启动时创建一个 Pyright 进程
- 多个 WebSocket 连接共享同一个进程
- 通过 LSP 的 rootUri 区分不同客户端

#### 方向 C：简化测试

先让基础测试通过，验证 WebSocket <-> Pyright 双向通信是否正常：
- 用一个测试完成 connect + initialize + completion 全流程
- 避免多个测试之间互相影响

## 关键文件

| 文件 | 说明 |
|------|------|
| `server/src/server.ts` | WebSocket 服务器，桥接 Monaco 和 Pyright |
| `server/src/pyright-launcher.ts` | Pyright 进程管理 |
| `server/src/config.ts` | 服务器配置（端口、路径） |
| `server/src/types.d.ts` | express-ws 类型声明 |
| `server/src/index.ts` | 服务器入口 |
| `server/test/server.test.js` | 自动化测试 |
| `package.json` | 项目依赖（根目录，使用 pnpm） |

## 项目命令

```bash
pnpm run server:build   # 编译 TypeScript 服务器
pnpm run server:dev     # 开发模式运行服务器
pnpm test               # 运行自动化测试
pnpm run dev            # 启动前端开发服务器
```

## 注意事项

- 使用 **pnpm** 而非 npm
- 依赖安装在**项目根目录**，不是 server 子目录
- `server/package.json` 已删除，所有依赖在根 `package.json` 中
- 修复完一个 bug 后应 git commit
- 编译输出在 `server/dist/` 目录（已 gitignore）
