# AI 智能补全测试指南

本文档说明如何测试 AI 智能补全功能。

## 测试环境准备

### 1. 启动后端服务器

```bash
# 编译后端
pnpm run server:build

# 启动服务器（测试模式下运行）
pnpm run server:start
```

服务器启动后会显示：
```
[Server] Python LSP Server running at http://localhost:3000
[Server] WebSocket endpoint: ws://localhost:3000/pyright
```

### 2. 启动前端

```bash
pnpm run dev
```

访问 http://localhost:8080

---

## 测试用例

### 测试 1：快捷键触发单行补全

**步骤：**
1. 在编辑器中输入 `def `（注意空格）
2. 将光标放在行尾
3. 按 `Ctrl+Space`

**预期结果：**
- 控制台显示 `[AI] Hotkey Ctrl+Space: Single-line completion`
- 光标位置插入函数体补全文本

---

### 测试 2：快捷键触发多行补全

**步骤：**
1. 在编辑器中输入 `def calculate_area(radius):`
2. 将光标放在行尾
3. 按 `Alt+Enter`

**预期结果：**
- 控制台显示 `[AI] Hotkey Alt+Enter: Multi-line completion`
- 灰色半透明文字（Ghost Text）逐字显示多行补全内容
- 3 秒后自动接受补全

---

### 测试 3：自动触发单行补全

**步骤：**
1. 在编辑器中输入 `os.`
2. 等待 500ms

**预期结果：**
- 控制台显示 `[AI] Auto-triggered, last line: os.`
- 自动插入方法补全

**触发字符列表：**
- `.` — 方法调用
- `:` — 切片或类型标注
- `(` — 函数调用

---

### 测试 4：自动触发（关键字后）

**步骤：**
1. 在编辑器中新行输入 `def `
2. 等待 500ms

**预期结果：**
- 自动触发单行补全
- 插入函数定义模板

**触发关键字列表：**
- `def` — 函数定义
- `class` — 类定义
- `function` / `async function` — JS 函数
- `if` / `for` / `while` / `try` / `with` — 代码块
- `import` — 导入语句

---

### 测试 5：Tab 接受补全

**步骤：**
1. 按 `Alt+Enter` 触发多行补全
2. Ghost Text 显示后，按 `Tab`

**预期结果：**
- 控制台显示 `[AI] Tab: Accept inline completion`
- Ghost Text 变为正式文本并保留

---

### 测试 6：Escape 拒绝补全

**步骤：**
1. 按 `Alt+Enter` 触发多行补全
2. Ghost Text 显示后，按 `Escape`

**预期结果：**
- 控制台显示 `[AI] Escape: Reject inline completion`
- Ghost Text 消失

---

### 测试 7：输入时取消补全

**步骤：**
1. 按 `Alt+Enter` 触发多行补全
2. Ghost Text 显示后，开始输入任意字符

**预期结果：**
- Ghost Text 立即消失
- 用户的输入正常显示

---

## 自动化测试

### 运行所有测试

```bash
pnpm test
```

**预期输出：**
```
PASS server/test/server.test.js
  Python LSP Server
    √ should connect to WebSocket (25 ms)
    √ should respond to initialize request (156 ms)
    √ should handle textDocument/completion request (2269 ms)

Test Suites: 1 passed, 1 total
Tests:       3 passed, 3 total
```

### 测试说明

| 测试用例 | 说明 |
|---------|------|
| should connect to WebSocket | 验证 WebSocket 连接正常 |
| should respond to initialize request | 验证 LSP 初始化请求/响应 |
| should handle textDocument/completion request | 验证补全请求处理 |

---

## 测试模式说明

当前 AI 补全使用测试模式（`TEST_MODE = true`），无需 API Key 即可体验功能。

### 测试模式特点

- **无需网络请求** — 补全内容由本地模拟生成
- **即时响应** — 无 API 延迟
- **固定补全内容** — 根据光标前内容匹配固定模板

### 测试模式补全示例

| 语言 | 输入 | 补全内容 |
|------|------|----------|
| Python | `def ` | `:\n    """函数文档字符串"""\n    pass` |
| Python | `class ` | `:\n    def __init__(self):\n        pass` |
| Python | `os.` | `upper()` / `lower()` / `split()` |
| Python | `if __name__ == '__main__':` | `\n    main()` |
| JavaScript | `function ` | `() {\n    console.log("");\n}` |
| Go | `func ` | `() {\n    return\n}` |

---

## 切换到真实 API

如需使用真实 AI API 进行测试：

1. 修改 `server/src/ai-completion.ts`
2. 将 `TEST_MODE = true` 改为 `TEST_MODE = false`
3. 实现 `generateAICompletion` 和 `generateMultilineCompletion` 函数
4. 调用 OpenAI / Claude 等 API

```typescript
// 示例：使用 OpenAI API
import OpenAI from 'openai';

const openai = new OpenAI({ apiKey: 'your-api-key' });

function generateAICompletion(context: string, language: string) {
  const response = await openai.chat.completions.create({
    model: 'gpt-4',
    messages: [{
      role: 'user',
      content: `Complete this ${language} code: ${context}`
    }],
    max_tokens: 100,
  });

  return {
    suggestions: [{
      text: response.choices[0].message.content,
      confidence: 0.9,
    }]
  };
}
```

---

## 调试技巧

### 查看控制台日志

打开浏览器开发者工具（F12），查看 Console 面板：

```
[AI] Hotkey Ctrl+Space: Single-line completion
[AI] Requesting single-line completion...
[AI] Got suggestion: :
[AI] Auto-triggered, last line: os.
```

### 查看网络请求

在 Network 面板中查看 `/ai/completion` 请求：

- 请求体：`{ context, language, cursorLine, cursorColumn }`
- 响应：`{ suggestions: [{ text, confidence }] }`

### 测试模式切换

临时启用/禁用测试模式：

```javascript
// 在浏览器控制台中
aiCompletionState.enabled = false;  // 禁用 AI 补全
aiCompletionState.autoTrigger = false;  // 禁用自动触发
```

---

## 常见问题

### Q: 按快捷键没反应？

1. 检查后端服务器是否运行（http://localhost:3000）
2. 检查浏览器控制台是否有错误
3. 确认光标在编辑器内

### Q: 自动触发没反应？

1. 确认 `aiCompletionState.autoTrigger = true`
2. 检查触发条件（`.` `:` `(` 或关键字）
3. 确认输入后等待 500ms

### Q: Ghost Text 显示但不消失？

1. 按 `Escape` 手动拒绝
2. 开始输入新内容会自动取消
