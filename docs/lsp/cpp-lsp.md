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

```bash
# 方式 1：LLVM 安装包
# 下载 https://github.com/llvm/llvm-project/releases
# 安装时勾选 "Add to PATH"

# 方式 2：scoop
scoop install llvm

# 方式 3：choco
choco install llvm

# 验证
clangd --version
```

### 自定义路径

环境变量：`CLANGD_PATH=C:\Tools\LLVM\bin\clangd.exe`

API：
```bash
curl -X POST http://localhost:3000/lsp/config \
  -H "Content-Type: application/json" \
  -d '{"languages": {"cpp": {"path": "C:\\Tools\\LLVM\\bin\\clangd.exe"}}}'
```

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