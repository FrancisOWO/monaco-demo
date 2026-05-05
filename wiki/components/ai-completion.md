---
generated_by: repo-wiki-agent
baseline_commit: "5fdb7d8d18bc5433e3a2a3f6735e028c44ac1b4a"
last_updated: "2026-05-05"
managed_sections:
  - "## Overview"
  - "## Architecture"
  - "## Frontend Modules"
  - "## Backend API"
  - "## Pipeline Modes"
---

# AI Completion Component

<!-- BEGIN:REPO_WIKI_MANAGED -->

## Overview

AI 补全组件提供基于 LLM 的代码补全能力，支持 Ghost Text 内联补全（单行/多行），通过 SSE 流式响应实时显示补全结果。

## Architecture

```
Monaco Editor
    ↓ (provideInlineCompletions)
MonacoInlineCompletionsProvider (debounced 500ms)
    ↓
GhostTextController (Simple / Full)
    ↓
PromptBuilder → LLMClient → PostProcessor
    ↓ (HTTP POST /ai/completion, SSE)
Express Server (ai-completion.ts)
    ↓
OpenAI API (FIM format)
```

## Frontend Modules

### 入口

`src/inlineCompletion/setup.ts` — `setupInlineCompletion(monaco, editor)` 创建 provider 和管线

**关键导出**:
- `setupInlineCompletion()` (`setup.ts:44`) — 初始化内联补全
- `switchPipelineMode(mode)` (`setup.ts:307`) — 切换管线模式
- `dispose()` (`setup.ts:315`) — 清理资源

### Monaco 集成

`src/inlineCompletion/monacoInlineCompletionsProvider.ts` — Monaco InlineCompletionsProvider 实现

- `MonacoInlineCompletionsProvider` (`monacoInlineCompletionsProvider.ts:46`) — Monaco API 入口
- `provideInlineCompletions()` (`monacoInlineCompletionsProvider.ts:66`) — 手动触发直接调用，自动触发防抖
- `debouncedFetch()` (`monacoInlineCompletionsProvider.ts:98`) — 500ms 防抖后获取补全

### Prompt 构建

- `src/inlineCompletion/prompt/cascadingPromptFactory.ts` — 级联 prompt 工厂
- `src/inlineCompletion/prompt/fimAdapter.ts` — FIM 格式适配器
- `src/inlineCompletion/prompt/trimLastLine.ts` — 末行裁剪
- `src/inlineCompletion/promptBuilder.ts` — 简单管线 prompt 构建器

### LLM 客户端

- `src/inlineCompletion/llm/aiCompletionClient.ts` — 统一 AI 补全客户端（合并 Simple/Standard）
- `src/inlineCompletion/llm/mockAICompletionClient.ts` — Mock 客户端
- `src/inlineCompletion/llm/modelSelector.ts` — 模型选择器

### 缓存层 (Full 管线)

- `src/inlineCompletion/cache/completionsCache.ts` — RadixTrie 前缀缓存
- `src/inlineCompletion/cache/currentGhostText.ts` — 当前 Ghost Text 追踪
- `src/inlineCompletion/cache/speculativeRequestCache.ts` — 投机请求缓存
- `src/inlineCompletion/cache/asyncCompletionsManager.ts` — 异步补全管理
- `src/inlineCompletion/cache/debounce.ts` — 防抖机制

### 后处理

- `src/inlineCompletion/postProcessor.ts` — 简单后处理器
- `src/inlineCompletion/postProcess/fullPostProcessor.ts` — 完整后处理器

### 控制器

- `src/inlineCompletion/ghostTextController.ts` — 简单 Ghost Text 控制器
- `src/inlineCompletion/fullGhostTextController.ts` — 完整 Ghost Text 控制器
- `src/inlineCompletion/strategy/strategyManager.ts` — 策略管理器（singleLine/multiLine）

### 配置

- `src/inlineCompletion/aiCompletionConfig.ts` — 补全配置管理（管线模式、API 配置）
- `src/inlineCompletion/registerHotkeys.ts` — 热键注册

## Backend API

**端点**: `POST /ai/completion`

**请求体** (`server/src/ai-completion.ts:47`):
```typescript
interface CompletionRequestBody {
  prefix: string;      // 光标前代码
  suffix: string;      // 光标后代码
  language: string;    // 编程语言
  stream?: boolean;    // 是否流式
  strategy?: string;   // singleLine / multiLine
  position?: { line: number; character: number };
}
```

**响应**: SSE 流式（`text/event-stream`）或 JSON

**Mock 模式**: 当 API 未配置时，使用语言模板生成模拟补全

**冷却期**: `COOLDOWN_MS = 2000` (`server/src/ai-completion.ts:22`) — 同一位置短时间内不重复请求

## Pipeline Modes

| 模式 | 说明 | 组件 |
|------|------|------|
| Mock | 模拟测试，不调用 API | `MockAICompletionClient` |
| Simple | 简单管线：PromptBuilder + AICompletionClient + PostProcessor | `GhostTextController` |
| Full | 完整管线：缓存 + 多策略 + 遥测 + 投机请求 | `FullGhostTextController` |

**自动触发** (`setup.ts:224`): 防抖 500ms + 冷却期 + IME 组合检测

<!-- END:REPO_WIKI_MANAGED -->

## Team Notes

- 缓存使用精确 prefix 匹配（RadixTrie），删除字符时抑制补全请求
- 投机请求在用户继续输入时预取可能的补全结果
- IME 输入法组字期间不触发 AI 补全
