# Go LSP 实现（gopls）

## 语言配置

```javascript
// src/lsp/language-configs.js
go: {
    languageId: 'go',
    wsEndpoint: '/gopls',
    diagnosticOwner: 'go-lsp',
    hoverDefaultLanguage: 'go',
    triggerCharacters: ['.', '('],
    async getInitOptions(_httpUrl) { return {}; },
}
```

| 字段 | 值 | 说明 |
|------|---|------|
| `languageId` | `'go'` | Monaco 语言 ID |
| `wsEndpoint` | `/gopls` | WebSocket 端点 |
| `diagnosticOwner` | `'go-lsp'` | 诊断标记 owner |
| `hoverDefaultLanguage` | `'go'` | 悬停代码块语言 |
| `triggerCharacters` | `['.', '(']` | 补全触发字符 |
| `getInitOptions` | 返回 `{}` | gopls 无特殊初始化选项 |

## 后端配置

```typescript
// server/src/config.ts
gopls: {
    executable: process.env.GOPLS_PATH || 'gopls',
    args: [],
    workspaceRoot: process.cwd(),
}
```

gopls 直接作为二进制执行，无需 `node` 包裹。需要 gopls 在 PATH 中可用。

## 服务器注册

```typescript
// server/src/language-servers.ts
{
    languageId: 'go',
    wsPath: '/gopls',
    command: config.gopls.executable,
    args: config.gopls.args,
    cwd: config.gopls.workspaceRoot,
    displayName: 'gopls',
}
```

## 安装要求

### Linux/macOS

```bash
# 安装 Go SDK（自动包含 gopls）
# 从 https://go.dev/dl/ 下载并安装

# 或手动安装 gopls
go install golang.org/x/tools/gopls@latest

# 验证
gopls version
```

### Windows

**方式 1 — Go SDK 安装（推荐）**：
1. 从 [Go Downloads](https://go.dev/dl/) 下载 Windows MSI 安装包（如 `go1.23.4.windows-amd64.msi`）
2. 安装后 Go 自动配置 PATH，`%USERPROFILE%\go\bin` 包含 gopls
3. 安装 gopls：
```bash
go install golang.org/x/tools/gopls@latest
```
4. 确保 `%USERPROFILE%\go\bin` 在系统 PATH 中（Go 安装程序通常已添加）
5. 验证：`gopls version`

**方式 2 — Scoop**：
```bash
scoop install go
go install golang.org/x/tools/gopls@latest
```

**方式 3 — Chocolatey**：
```bash
choco install golang
go install golang.org/x/tools/gopls@latest
```

**验证**：
```bash
gopls version
```

### 自定义路径

环境变量：
```bash
# Windows
set GOPLS_PATH=C:\Users\你\go\bin\gopls.exe

# Linux/macOS
export GOPLS_PATH=/custom/path/gopls
```

API：
```bash
curl -X POST http://localhost:3000/lsp/config \
  -H "Content-Type: application/json" \
  -d '{"languages": {"go": {"path": "/custom/gopls"}}}'
```

### 不可用时的行为

若 gopls 未安装或不在 PATH 中：
- 后端启动时检测到不可用，关闭 WebSocket 并发送错误通知
- 前端标记该语言为 `unavailable`，状态标签显示红色 "不可用"，开关禁用
- 状态栏在 Go 文件中显示红色 `LSP: go 不可用`
- 不会无限重试连接

## gopls 特殊注意事项

- gopls 需要 Go 模块支持（`go.mod` 文件）。在无 `go.mod` 的目录中工作会降级为 GOPATH 模式
- gopls 启动时会扫描整个工作区，首次启动可能较慢（取决于项目大小）
- gopls 的诊断范围可能较大（整个包而非单个文件），编辑器需正确处理多文件诊断