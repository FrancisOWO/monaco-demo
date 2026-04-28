---
generated_by: repo-wiki-agent
baseline_commit: "5fdb7d8d18bc5433e3a2a3f6735e028c44ac1b4a"
last_updated: "2026-04-22"
managed_sections:
  - "## Overview"
  - "## Build for Production"
  - "## Deployment Options"
  - "## Environment Setup"
---

# Deployment

<!-- BEGIN:REPO_WIKI_MANAGED -->

## Overview

部署分为前端静态资源和后端服务器两部分。

## Build for Production

**前端**:
```bash
pnpm run build
```
输出目录: `dist/`

**后端**:
```bash
pnpm run server:build
```
输出目录: `server/dist/`

## Deployment Options

### Option 1: 静态托管 + 独立服务器

**前端**: 部署到静态托管服务
- Vercel
- Netlify
- GitHub Pages
- Nginx

**后端**: 部署到服务器
- VPS (DigitalOcean, AWS EC2, etc.)
- Docker 容器
- Heroku

### Option 2: Docker 容器

```dockerfile
# Dockerfile (示例)
FROM node:18-alpine

RUN corepack enable && corepack prepare pnpm@latest --activate

WORKDIR /app

COPY package.json pnpm-lock.yaml ./
RUN pnpm install --prod

COPY . .
RUN pnpm run build
RUN pnpm run server:build

EXPOSE 3000

CMD ["node", "server/dist/index.js"]
```

### Option 3: 一体化部署

将前端和后端部署在同一服务器：
```
server/
├── public/     # 前端静态文件
└── dist/       # 后端代码
```

Express 配置:
```javascript
app.use(express.static('public'));
```

## Environment Setup

**生产环境变量**:
```bash
NODE_ENV=production
PORT=3000
LSP_TIMEOUT=5000
```

**PM2 配置** (进程管理):
```javascript
// ecosystem.config.js
module.exports = {
  apps: [{
    name: 'monaco-lsp-server',
    script: './server/dist/index.js',
    instances: 1,
    autorestart: true,
    env: {
      NODE_ENV: 'production',
      PORT: 3000
    }
  }]
};
```

<!-- END:REPO_WIKI_MANAGED -->

## Team Notes

- 确保 Python 和 Pyright 在服务器上已安装
- WebSocket 可能需要特殊配置 (Nginx proxy)
- 考虑使用 PM2 管理 Node 进程
