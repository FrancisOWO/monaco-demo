# Monaco Editor 示例项目

基于 Monaco Editor 的代码编辑器示例，支持多种编程语言的语法高亮、主题切换、智能代码补全和 Python LSP 集成。

## 功能特性

- **代码编辑** - 完整的代码编辑功能，支持语法高亮、代码折叠、括号匹配
- **多语言支持** - Python、C++、Go 语法高亮
- **主题切换** - 深色/浅色主题
- **代码片段补全** - 常用代码片段模板
- **Python LSP 补全** - 基于 Pyright 的智能补全（诊断、跳转等）
- **AI 智能补全** - 单行/多行 AI 补全，支持自动触发和快捷键

## 项目结构

```
monaco-start/
├── src/                          # 前端源码
│   ├── index.html                # 主页面
│   ├── completions.js            # 代码片段补全配置
│   ├── ai-completion.js          # AI 智能补全
│   ├── lsp/                      # LSP 客户端
│   │   ├── python-client.js      # Python 语言客户端
│   │   └── document-sync.js      # 文档同步模块
│   ├── sample-code/              # 示例代码
│   │   ├── sample-code-python.js
│   │   ├── sample-code-cpp.js
│   │   └── sample-code-go.js
│   └── styles/                   # 样式文件
│
├── server/                       # 后端 LSP 服务器
│   ├── src/                      # 服务器源码
│   │   ├── index.ts              # 入口
│   │   ├── server.ts             # WebSocket 服务器
│   │   ├── ai-completion.ts      # AI 补全服务
│   │   └── pyright-launcher.ts   # Pyright 启动器
│   └── test/                     # 测试文件
│       └── server.test.js        # 自动化测试
│
├── docs/                         # 文档
│   ├── summary-lsp-test-fix.md   # LSP 测试修复总结
│   └── plan-ai-completion.md    # AI 补全实现规划
│
├── package.json                  # 项目依赖（pnpm）
└── webpack.config.js              # Webpack 配置
```

## 环境要求

- Node.js >= 18
- pnpm >= 8（项目使用 pnpm 管理依赖）

## 安装依赖

```bash
pnpm install
```

## 运行项目

### 1. 编译后端服务器

```bash
pnpm run server:build
```

### 2. 启动后端服务器

```bash
pnpm run server:start
```

后端服务器运行在 http://localhost:3000

### 3. 启动前端开发服务器

```bash
pnpm run dev
```

访问 http://localhost:8080 查看编辑器。

## 测试

### 运行所有测试

```bash
pnpm test
```

### 开发模式（热重载）

```bash
# 后端热重载
pnpm run server:dev

# 前端热重载
pnpm run dev
```

### 构建生产版本

```bash
pnpm run build
```

## 使用说明

### 语言切换

通过右上角下拉菜单切换编程语言（Python / C++ / Go）。

### 主题切换

通过右上角下拉菜单切换编辑器主题（浅色 / 深色）。

### 代码补全

| 类型 | 说明 | 触发方式 |
|------|------|----------|
| 代码片段 | 常用代码模板 | 输入触发词后按 Tab |
| LSP 补全 | Python 智能补全 | 自动触发（需启动 LSP 服务器） |
| AI 补全 | AI 智能补全 | 自动或快捷键触发 |

### AI 智能补全

#### 快捷键

| 快捷键 | 功能 |
|--------|------|
| `Ctrl+Space` | 触发单行补全 |
| `Alt+Enter` | 触发多行补全 |
| `Tab` | 接受当前内联补全 |
| `Escape` | 拒绝当前内联补全 |

#### 自动触发

AI 补全会在以下情况自动触发：
- 输入 `.` `:` `(` 等字符后（方法调用、属性访问）
- 输入 `def` `class` `function` `if` `for` `while` `try` `with` `import` 等关键字后

#### 测试模式

AI 补全默认使用测试模式（无需 API），可直接体验功能。如需切换到真实 AI API，修改 `server/src/ai-completion.ts` 中的 `TEST_MODE = false`。

### Python LSP

Python 语言支持完整的 LSP 功能：
- 智能代码补全
- 悬停文档
- 诊断信息
- 语法检查

启动后端服务器后自动启用。

## 技术栈

| 类别 | 技术 |
|------|------|
| 编辑器 | Monaco Editor 0.55.1 |
| 构建工具 | Webpack 5 |
| 后端框架 | Express + WebSocket |
| 语言服务器 | Pyright |
| 测试框架 | Jest |
| 包管理器 | pnpm |

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

## 相关文档

- [AI 智能补全实现规划](docs/plan-ai-completion.md)
- [LSP 测试修复总结](docs/summary-lsp-test-fix.md)

## License

MIT
