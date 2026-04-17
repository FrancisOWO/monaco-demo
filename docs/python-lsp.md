# Python LSP 功能说明

## 概述

本项目集成了 Python 语言服务器协议（LSP），为 Monaco Editor 提供类似 VS Code 的智能代码编辑体验。

## 架构

```
┌─────────────────────────────────────────────────────────────┐
│                    Browser (Frontend)                       │
│  ┌───────────────────────────────────────────────────────┐  │
│  │                 Monaco Editor                          │  │
│  │  ┌─────────────────────────────────────────────────┐  │  │
│  │  │  LSP Client (python-client.js)                  │  │  │
│  │  │  - 代码补全                                      │  │  │
│  │  │  - 悬停文档                                      │  │  │
│  │  │  - 错误诊断                                      │  │  │
│  │  └─────────────────────────────────────────────────┘  │  │
│  └───────────────────────────────────────────────────────┘  │
│                          │ WebSocket                        │
└──────────────────────────┼──────────────────────────────────┘
                           │ ws://localhost:3000/pyright
                           ▼
┌─────────────────────────────────────────────────────────────┐
│                 Node.js Server (Backend)                    │
│  ┌───────────────────────────────────────────────────────┐  │
│  │              WebSocket Server (server.ts)              │  │
│  │              - 消息转发                                 │  │
│  │              - LSP 协议解析                             │  │
│  └───────────────────────────────────────────────────────┘  │
│                          │ stdio                            │
│  ┌───────────────────────────────────────────────────────┐  │
│  │              Pyright Language Server                   │  │
│  │              - 类型检查                                 │  │
│  │              - 智能补全                                 │  │
│  │              - 定义跳转                                 │  │
│  └───────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────┘
```

## 功能特性

### 1. 智能代码补全

基于 Pyright 的类型推断，提供上下文感知的代码补全：

- 变量和函数补全
- 模块和包补全
- 方法补全（带类型提示）
- 参数提示

**示例**：
```python
import os
os.  # 自动列出 os 模块的所有方法
```

### 2. 悬停文档

将鼠标悬停在代码元素上，显示：

- 类型信息
- 函数签名
- 文档字符串

**示例**：
```python
def greet(name: str) -> str:
    """返回问候语"""
    return f"Hello, {name}"

greet  # 悬停显示: def greet(name: str) -> str
```

### 3. 实时错误诊断

编辑代码时实时显示语法错误和类型错误：

- 语法错误（红色波浪线）
- 类型错误（红色波浪线）
- 警告信息（黄色波浪线）

**示例**：
```python
def add(a: int, b: int) -> int:
    return a + b

add("hello", "world")  # 类型错误：str 不能赋值给 int
```

### 4. 代码片段补全

内置常用代码片段，作为 LSP 补全的补充：

| 触发词 | 描述 |
|--------|------|
| `defmain` | main 函数入口 |
| `deffunc` | 函数定义 |
| `forloop` | for 循环 |
| `tryexcept` | 异常处理 |
| `classdef` | 类定义 |

## 使用方法

### 启动 LSP 服务器

```bash
# 1. 安装后端依赖
cd server && npm install

# 2. 启动服务器
npm run dev
```

服务器启动后，前端编辑器会自动连接。状态栏显示"LSP: 已连接"表示连接成功。

### 连接状态

编辑器右上角显示 LSP 连接状态：

| 状态 | 颜色 | 说明 |
|------|------|------|
| 已连接 | 绿色 | LSP 服务正常 |
| 连接中 | 黄色 | 正在建立连接 |
| 未连接 | 灰色 | LSP 服务未启动 |
| 连接失败 | 红色 | 连接出错，自动重试 |

## 配置

### 服务器配置

编辑 `server/src/config.ts`：

```typescript
export const config = {
  port: 3000,                    // 服务器端口
  pyrightPath: '/pyright',       // WebSocket 路径
  pyright: {
    executable: 'node_modules/pyright/dist/pyright-langserver.js',
    workspaceRoot: process.cwd(),
  },
  logLevel: 'debug',             // 日志级别
};
```

### 前端配置

编辑 `src/lsp/python-client.js`：

```javascript
const LSP_SERVER_URL = 'ws://localhost:3000/pyright';
```

## API

### LSP 客户端 API

```javascript
// 创建客户端
const lspClient = createPythonLSPClient(monaco, editor);

// 连接到服务器
await lspClient.connect();

// 发送文档变更
lspClient.didChangeDocument(uri, content, version);

// 获取补全
const completions = await lspClient.getCompletions(uri, line, character);

// 获取悬停信息
const hover = await lspClient.getHover(uri, line, character);

// 断开连接
lspClient.disconnect();
```

## 测试

### 运行测试

```bash
cd server
npm test
```

### 测试用例

- WebSocket 连接测试
- LSP 初始化测试
- 代码补全测试

## 故障排除

### 问题：LSP 连接失败

**解决方案**：
1. 确认后端服务器已启动
2. 检查端口 3000 是否被占用
3. 查看浏览器控制台和服务器日志

### 问题：补全无响应

**解决方案**：
1. 等待 Pyright 初始化完成（首次启动需要几秒）
2. 检查文件是否正确同步到服务器
3. 查看服务器日志中的错误信息

### 问题：诊断信息不准确

**解决方案**：
1. 确保 Python 环境正确配置
2. 检查 `workspace/` 目录下的文件
3. 重启 LSP 服务器

## 扩展开发

### 添加新的 LSP 功能

1. 在 `python-client.js` 中添加请求方法
2. 在 `server.ts` 中处理消息转发
3. 注册 Monaco 提供者

**示例 - 添加跳转定义**：

```javascript
// python-client.js
async getDefinition(uri, line, character) {
    return await this.sendRequest('textDocument/definition', {
        textDocument: { uri },
        position: { line, character }
    });
}

// 注册提供者
monaco.languages.registerDefinitionProvider('python', {
    provideDefinition: async (model, position) => {
        const result = await lspClient.getDefinition(
            model.uri.toString(),
            position.lineNumber - 1,
            position.column - 1
        );
        // 处理结果...
    }
});
```

## 参考

- [Language Server Protocol](https://microsoft.github.io/language-server-protocol/)
- [Pyright](https://github.com/microsoft/pyright)
- [Monaco Editor](https://microsoft.github.io/monaco-editor/)
