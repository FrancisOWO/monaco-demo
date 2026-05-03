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

```bash
# 标准 Go 安装（自带 gopls）
go install golang.org/x/tools/gopls@latest

# 验证
gopls --version
```

### 自定义路径

环境变量：`GOPLS_PATH=/custom/path/gopls`

API：
```bash
curl -X POST http://localhost:3000/lsp/config \
  -H "Content-Type: application/json" \
  -d '{"languages": {"go": {"path": "/custom/gopls"}}}'
```

## gopls 特殊注意事项

- gopls 需要 Go 模块支持（`go.mod` 文件）。在无 `go.mod` 的目录中工作会降级为 GOPATH 模式
- gopls 启动时会扫描整个工作区，首次启动可能较慢（取决于项目大小）
- gopls 的诊断范围可能较大（整个包而非单个文件），编辑器需正确处理多文件诊断