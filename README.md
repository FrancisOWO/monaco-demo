# Monaco Editor 示例项目

基于 Monaco Editor 的代码编辑器示例，支持多种编程语言的语法高亮、主题切换和智能代码补全。

## 功能特性

- **代码编辑** - 完整的代码编辑功能，支持语法高亮、代码折叠、括号匹配
- **多语言支持** - Python、C++、Go 语法高亮
- **主题切换** - 深色/浅色主题
- **智能补全** - 代码片段补全 + Python LSP 智能补全

## 项目结构

```
monaco-start/
├── src/                          # 前端源码
│   ├── index.html                # 主页面
│   ├── completions.js            # 代码片段补全配置
│   ├── lsp/                      # LSP 客户端
│   │   ├── python-client.js      # Python 语言客户端
│   │   └── document-sync.js      # 文档同步模块
│   ├── sample-code/              # 示例代码
│   │   ├── sample-code-python.js
│   │   ├── sample-code-cpp.js
│   │   └── sample-code-go.js
│   └── styles/                   # 样式文件
│       ├── main.css              # 基础样式
│       ├── theme-dark.css        # 深色主题
│       └── theme-light.css       # 浅色主题
│
├── server/                       # 后端 LSP 服务器
│   ├── src/                      # 服务器源码
│   │   ├── index.ts              # 入口
│   │   ├── server.ts             # WebSocket 服务器
│   │   └── pyright-launcher.ts   # Pyright 启动器
│   └── test/                     # 测试文件
│
├── .claude/                      # 规划文档
│   ├── plan.md                   # 基础示例规划
│   ├── plan-completion.md        # 代码补全方案
│   └── plan-python-lsp.md        # Python LSP 详细规划
│
├── package.json                  # 前端依赖
└── webpack.config.js             # Webpack 配置
```

## 快速开始

### 安装依赖

```bash
# 前端依赖
npm install

# 后端依赖（LSP 服务器）
cd server && npm install && cd ..
```

### 启动开发服务器

```bash
# 终端 1：启动后端 LSP 服务器
cd server && npm run dev

# 终端 2：启动前端开发服务器
npm run dev
```

访问 http://localhost:8080 查看编辑器。

### 构建生产版本

```bash
npm run build
```

## 使用说明

### 语言切换

通过右上角下拉菜单切换编程语言（Python / C++ / Go）。

### 主题切换

通过右上角下拉菜单切换编辑器主题（浅色 / 深色）。

### 代码补全

- **代码片段**：输入触发词（如 `defmain`、`forloop`）后按 Tab 插入
- **LSP 补全**：Python 语言支持智能补全（需启动后端服务器）

## 技术栈

| 类别 | 技术 |
|------|------|
| 编辑器 | Monaco Editor 0.55.1 |
| 构建工具 | Webpack 5 |
| 后端框架 | Express + WebSocket |
| 语言服务器 | Pyright |
| 协议 | Language Server Protocol (LSP) |

## 规划文档

- [基础示例规划](.claude/plan.md)
- [代码补全方案](.claude/plan-completion.md)
- [Python LSP 功能说明](docs/python-lsp.md)
- [Python LSP 详细规划](.claude/plan-python-lsp.md)

## 开发指南

### 添加新的代码片段

编辑 `src/completions.js`，在对应语言的数组中添加新的补全项：

```javascript
{
    label: 'trigger',           // 触发词
    kind: monaco.languages.CompletionItemKind.Snippet,
    insertText: 'code ${1:placeholder}',  // 插入内容，支持占位符
    documentation: '描述'        // 文档说明
}
```

### 添加新的示例代码

在 `src/sample-code/` 目录下创建新文件，然后在 `sample-code-index.js` 中导出。

## License

MIT
