# C++ LSP 实现（clangd）

## 语言配置

```javascript
// src/lsp/language-configs.js
cpp: {
    languageId: 'cpp',
    wsEndpoint: '/clangd',
    diagnosticOwner: 'cpp-lsp',
    hoverDefaultLanguage: 'cpp',
    triggerCharacters: ['.', ':', '>'],
    async getInitOptions(_httpUrl) { return {}; },
}
```

| 字段 | 值 | 说明 |
|------|---|------|
| `languageId` | `'cpp'` | Monaco 语言 ID，覆盖 `.cpp`/`.c`/`.h`/`.hpp` 文件 |
| `wsEndpoint` | `/clangd` | WebSocket 端点 |
| `diagnosticOwner` | `'cpp-lsp'` | 诊断标记 owner，与 Python 的 `'python-lsp'` 区分 |
| `hoverDefaultLanguage` | `'cpp'` | 悬停代码块默认语言标记 |
| `triggerCharacters` | `['.', ':', '>']` | 补全触发字符：`.`（成员访问）、`:`（命名空间/继承）、`>`（模板参数） |
| `getInitOptions` | 返回 `{}` | clangd 无特殊初始化选项 |

### 触发字符说明

- `.`：成员访问（`obj.`、`ptr->`）
- `:`：命名空间（`std::`）、继承声明（`class Foo : public Bar`）
- `>`：模板参数（`vector<int>`）

## 后端配置

```typescript
// server/src/config.ts
clangd: {
    executable: process.env.CLANGD_PATH || 'clangd',
    args: [],
    workspaceRoot: process.cwd(),
}
```

clangd 直接作为二进制执行，需要在 PATH 中可用。可通过 `CLANGD_PATH` 环境变量覆盖。

## 服务器注册

```typescript
// server/src/language-servers.ts
{
    languageId: 'cpp',
    wsPath: '/clangd',
    command: config.clangd.executable,
    args: config.clangd.args,
    cwd: config.clangd.workspaceRoot,
    displayName: 'clangd',
}
```

## 安装要求

### Linux

```bash
# Ubuntu/Debian
sudo apt install clangd

# Fedora
sudo dnf install clang-tools-extra

# Arch
sudo pacman -S clang
```

### macOS

```bash
brew install llvm
# 或安装 Xcode Command Line Tools 后自带
```

### Windows

**方式 1 — LLVM 安装包（推荐）**：
1. 从 [LLVM Releases](https://github.com/llvm/llvm-project/releases) 下载 Windows installer（如 `LLVM-19.1.0-win64.exe`）
2. 安装时勾选 **"Add LLVM to the system PATH for all users"**
3. 验证：`clangd --version`

**方式 2 — Scoop**：
```bash
scoop install llvm
```

**方式 3 — Chocolatey**：
```bash
choco install llvm
```

**方式 4 — VS Code C/C++ 扩展自带**：
安装 VS Code 的 [C/C++ 扩展](https://marketplace.visualstudio.com/items?itemName=ms-vscode.cpptools) 后，clangd 位于：
```
%USERPROFILE%\.vscode\extensions\ms-vscode.cpptools-*\LLVM\bin\clangd.exe
```
需通过环境变量指定：
```bash
set CLANGD_PATH=%USERPROFILE%\.vscode\extensions\ms-vscode.cpptools-1.23.2\LLVM\bin\clangd.exe
```

**验证**：
```bash
clangd --version
```

### 自定义路径

环境变量：
```bash
# Windows
set CLANGD_PATH=C:\Tools\LLVM\bin\clangd.exe

# Linux/macOS
export CLANGD_PATH=/custom/path/clangd
```

API：
```bash
curl -X POST http://localhost:3000/lsp/config \
  -H "Content-Type: application/json" \
  -d '{"languages": {"cpp": {"path": "C:\\Tools\\LLVM\\bin\\clangd.exe"}}}'
```

### 不可用时的行为

若 clangd 未安装或不在 PATH 中：
- 后端启动时检测到不可用，关闭 WebSocket 并发送错误通知
- 前端标记该语言为 `unavailable`，状态标签显示红色 "不可用"，开关禁用
- 状态栏在 C/C++ 文件中显示红色 `LSP: cpp 不可用`
- 不会无限重试连接

## clangd 特殊注意事项

### 编译数据库

clangd 依赖 `compile_commands.json`（编译数据库）来正确解析项目结构。没有编译数据库时，clangd 会尝试"猜测"编译选项，但可能不准确。

生成 `compile_commands.json`：

```bash
# CMake
cmake -DCMAKE_EXPORT_COMPILE_COMMANDS=ON ..

# Make (使用 Bear)
bear -- make

# Meson
meson setup builddir
```

将生成的 `compile_commands.json` 放在项目根目录（即 `workspaceRoot`）下即可。

### .clangd 配置文件

可在项目根目录创建 `.clangd` 文件覆盖默认行为：

```yaml
# .clangd
CompileFlags:
  Add: [-std=c++17]
  Remove: [-Werror]
Diagnostics:
  UnusedIncludes: Strict
```

### 文件扩展名映射

`language-utils.js` 中定义的映射：

```javascript
'.cpp': 'cpp',
'.c': 'cpp',
'.h': 'cpp',
'.hpp': 'cpp',
```

所有 C/C++ 头文件和源文件统一映射到 `'cpp'` 语言 ID，由同一个 clangd 进程处理。

## 测试

| 测试文件 | 覆盖范围 |
|---------|---------|
| `src/lsp/__tests__/lsp-client.test.ts` | C++ 配置下的连接、初始化选项为 `{}` |
| `src/lsp/__tests__/document-sync-multi.test.ts` | C++ 文档路由到 C++ 客户端 |
| `server/test/lang-detector.test.js` | clangd PATH 检测 |
| `server/test/language-servers.test.js` | C++ 服务器注册配置 |