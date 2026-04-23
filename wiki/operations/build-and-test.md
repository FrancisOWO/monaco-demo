---
generated_by: repo-wiki-agent
baseline_commit: "5fdb7d8d18bc5433e3a2a3f6735e028c44ac1b4a"
last_updated: "2026-04-22"
managed_sections:
  - "## Build Process"
  - "## Testing"
  - "## CI/CD"
  - "## Troubleshooting"
---

# Build & Test

<!-- BEGIN:REPO_WIKI_MANAGED -->

## Build Process

**前端构建**:
```bash
npm run build
```
- Vite 生产模式构建
- 输出到 `dist/` 目录
- 代码压缩和优化

**后端构建**:
```bash
npm run server:build
```
- TypeScript 编译
- 输出到 `server/dist/` 目录

## Testing

**运行测试**:
```bash
npm test
```

**测试框架**: Jest 29

**测试配置**: `server/jest.config.js`

**测试目录**: `server/src/**/*.test.ts`

**测试类型**:
- 单元测试
- 集成测试
- LSP 消息测试

## CI/CD

**建议流程**:
```yaml
1. Checkout code
2. Install dependencies
3. Run tests
4. Build frontend
5. Build backend
6. Deploy
```

## Troubleshooting

**构建失败**:
- 检查 Node.js 版本 (>= 18)
- 清除 node_modules 重新安装
- 检查 TypeScript 错误

**测试失败**:
- 检查 LSP 是否安装
- 检查端口占用
- 查看测试日志

<!-- END:REPO_WIKI_MANAGED -->

## Team Notes

- 建议在提交前运行完整测试
- 可以使用 `npm run test:watch` 进行开发时测试
