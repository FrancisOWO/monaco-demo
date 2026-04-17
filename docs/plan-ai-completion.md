# AI 智能补全实现规划

## 目标

为 Monaco Editor 项目实现类似 GitHub Copilot 的 AI 智能代码补全功能，在用户编写代码时提供基于大语言模型的智能建议。

---

## GitHub Copilot 核心机制分析

### 1. 架构概览

```
┌─────────────┐     ┌──────────────┐     ┌─────────────┐
│   Monaco    │────▶│  LSP Server  │────▶│  AI Model   │
│   Editor    │◀────│  (Bridge)    │◀────│  (Backend)  │
└─────────────┘     └──────────────┘     └─────────────┘
```

- **前端**：Monaco Editor 负责渲染和用户交互
- **桥接层**：LSP 服务器转发补全请求到 AI 模型
- **后端**：AI 模型（云端如 OpenAI GPT-4 或本地如 CodeLlama）

### 2. 关键 LSP 方法

GitHub Copilot 使用 `textDocument/completion` 的扩展机制：

| 方法 | 说明 |
|------|------|
| `textDocument/completion` | 触发补全请求 |
| `cancelRequest` | 取消进行中的补全请求 |
| `inlineCompletion` | 内联补全（Streaming） |
| `getInlineCompletion` | 获取内联补全片段 |

### 3. Streaming 机制

Copilot 使用 Server-Sent Events (SSE) 或 WebSocket 流式传输补全片段，实现逐字显示效果：

```typescript
// 流式响应示例
{
  "id": "abc123",
  "completion": [
    {
      "text": "def my_function():",
      "range": { "start": { "line": 5, "character": 0 }, "end": { "line": 5, "character": 0 } }
    }
  ]
}
```

---

## 实现方案

### 方案 A：云端 API（推荐快速上线）

**技术栈：**
- OpenAI GPT-4 / Claude API
- Express.js WebSocket 服务器
- 流式响应处理

**优点：** 实现简单，效果好
**缺点：** 依赖外部服务，有成本

### 方案 B：本地模型（推荐隐私优先）

**技术栈：**
- CodeLlama / StarCoder 本地部署
- Ollama 服务
- 自建推理服务

**优点：** 隐私保护，无 API 成本
**缺点：** 需要本地 GPU，响应可能较慢

### 方案 C：混合方案

- 简单补全使用本地模型
- 复杂推理调用云端 API

---

## 分阶段实现计划

### Phase 1：基础架构

**目标：** 建立 AI 补全的最小可用原型

1. **创建 AI 补全服务器端点**
   ```
   POST /ai/completion
   Body: { context: string, language: string, cursor: position }
   Response: { suggestion: string, confidence: number }
   ```

2. **扩展 LSP Completion Provider**
   - 添加 `AICompletionItemProvider`
   - 实现 `provideCompletionItems` 方法
   - 支持 `resolveCompletionItem` 详情

3. **添加配置管理**
   ```typescript
   interface AIConfig {
     provider: 'openai' | 'claude' | 'local';
     apiKey?: string;
     model?: string;
     endpoint?: string;
     maxTokens: number;
     temperature: number;
   }
   ```

**文件变更：**
- `server/src/ai-completion.ts` — AI 补全核心逻辑
- `server/src/providers/ai-provider.ts` — LSP 补全提供者
- `server/src/config.ts` — 添加 AI 配置

---

### Phase 2：流式补全

**目标：** 实现类似 Copilot 的逐字显示效果

1. **集成 Server-Sent Events (SSE)**
   ```typescript
   // 流式补全端点
   app.get('/ai/inline-completion', (req, res) => {
     res.setHeader('Content-Type', 'text/event-stream');
     // 逐步发送补全片段
     res.write(`data: ${JSON.stringify({ text: "def " })}\n\n`);
     res.write(`data: ${JSON.stringify({ text: "my_func" })}\n\n`);
     res.write(`data: ${JSON.stringify({ done: true })}\n\n`);
   });
   ```

2. **Monaco 内联补全集成**
   - 使用 Monaco 的 `InlineCompletionsProvider` API
   - 实现 `handleItemDidShow` 回调

3. **取消机制**
   - 监听用户输入取消之前的补全请求
   - 使用 `AbortController` 管理请求

**文件变更：**
- `server/src/ai-stream.ts` — 流式处理逻辑
- `client/src/ai-inline-provider.ts` — Monaco 内联补全提供者

---

### Phase 3：上下文感知

**目标：** 提升补全质量，让 AI 理解更多上下文

1. **多文件上下文收集**
   ```typescript
   interface CompletionContext {
     currentFile: string;           // 当前文件内容
     openFiles: string[];           // 打开的标签页
     cursorHistory: Position[];     // 光标位置历史
     recentEdits: TextEdit[];       // 最近编辑
     projectStructure?: ProjectInfo; // 项目结构
   }
   ```

2. **语义选择器**
   - 分析函数/类边界
   - 选择相关上下文片段
   - 限制上下文长度（token 限制）

3. **学习用户习惯**
   - 记录接受的补全
   - 优化推荐权重
   - 本地存储偏好

**文件变更：**
- `server/src/context-collector.ts` — 上下文收集器
- `server/src/context-selector.ts` — 语义选择器

---

### Phase 4：UX 优化

**目标：** 提供接近 Copilot 的用户体验

1. **Ghost Text 显示**
   - 灰色半透明文字显示补全建议
   - Tab 键接受补全
   - Esc 键拒绝

2. **补全菜单增强**
   - 显示 AI 置信度
   - 代码片段预览
   - 快捷键提示

3. **性能优化**
   - 预取下一个可能的补全
   - 智能触发时机（不要每次击键都请求）
   - 缓存常见模式

---

## 技术细节

### LSP 扩展方法

```typescript
// 扩展 CompletionItem
interface AICompletionItem extends CompletionItem {
  aiConfidence?: number;
  aiModel?: string;
  isInline?: boolean;
}

// 补全请求参数
interface AICompletionParams extends TextDocumentPositionParams {
  context?: {
    triggerKind: CompletionTriggerKind;
    triggerCharacter?: string;
    includeContext?: boolean;
  };
}
```

### API 设计

#### POST `/ai/completion`

```json
// Request
{
  "context": {
    "content": "def calculate_area(radius):\n    return 3.14 * radius *",
    "language": "python",
    "cursor": { "line": 2, "character": 35 },
    "openTabs": ["main.py", "utils.py"]
  },
  "config": {
    "maxTokens": 150,
    "temperature": 0.7
  }
}

// Response
{
  "suggestions": [
    {
      "text": "radius ** 2",
      "confidence": 0.95,
      "range": { "start": 35, "end": 35 }
    },
    {
      "text": "pow(radius, 2)",
      "confidence": 0.8,
      "range": { "start": 35, "end": 35 }
    }
  ]
}
```

#### GET `/ai/inline-completion` (SSE)

```json
// Stream events
event: chunk
data: {"text": "radius ** 2", "done": false}

event: chunk
data: {"text": "\n    return result", "done": false}

event: done
data: {"fullText": "radius ** 2\n    return result", "confidence": 0.95}
```

### 依赖项

```json
{
  "dependencies": {
    "express": "^4.18.2",
    "ws": "^8.14.2",
    "openai": "^4.0.0",
    "@anthropic-ai/sdk": "^0.14.0"
  }
}
```

---

## 里程碑

| 阶段 | 目标 | 交付物 |
|------|------|--------|
| Phase 1 | 基础 AI 补全 | `POST /ai/completion` 工作，基础补全显示 |
| Phase 2 | 流式补全 | 内联补全，逐字显示，Tab 接受 |
| Phase 3 | 上下文感知 | 多文件上下文，智能触发 |
| Phase 4 | UX 打磨 | Ghost text，菜单增强，性能优化 |

---

## 风险与挑战

| 风险 | 影响 | 缓解措施 |
|------|------|----------|
| API 成本 | 云端 API 费用不可控 | 本地模型备用，限流机制 |
| 响应延迟 | 补全慢影响体验 | 流式输出，逐步显示 |
| 上下文超限 | token 超出模型限制 | 智能截断，优先级选择 |
| 隐私问题 | 代码上传到第三方 | 本地模型优先，明确告知用户 |

---

## 下一步行动

1. **立即执行**：创建 `ai-completion.ts` 基础架构
2. **短期**：集成 OpenAI API 实现 Phase 1
3. **中期**：实现流式补全和内联显示
4. **长期**：优化上下文感知和用户体验

---

## 参考资源

- [GitHub Copilot LSP Extension Protocol](https://github.com/github/copilot-ls)
- [Monaco Inline Completions API](https://microsoft.github.io/monaco-editor/api/interfaces/monaco.languages.IInlineCompletionsProvider.html)
- [LSP Completion Extension](https://microsoft.github.io/language-server-protocol/specifications/lsp/ specification/)
- [OpenAI Completions API](https://platform.openai.com/docs/api-reference/completions)
