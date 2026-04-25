# Plan A：简易版 — Monaco Editor Inline AI 补全

## 目标

跑通 Ghost Text inline 补全的基本流程：用户输入 → 构建 prompt → 调用 LLM → 在编辑器中显示幽灵文本 → 用户按 Tab 接受。不做性能优化、不做多行补全、不做缓存。

## 架构总览

```
┌─────────────────────────────────────────────────┐
│                  Monaco Editor                   │
│  ┌───────────────────────────────────────────┐  │
│  │         InlineCompletionsProvider           │  │
│  │  (注册到 editor.registerInlineCompletions) │  │
│  └──────────────────┬────────────────────────┘  │
│                     │                            │
│  ┌──────────────────▼────────────────────────┐  │
│  │           GhostTextController              │  │
│  │  (编排：构建 prompt → 调用模型 → 返回结果)  │  │
│  └──────────────────┬────────────────────────┘  │
│                     │                            │
│         ┌───────────┼───────────┐                │
│         │           │           │                │
│  ┌──────▼──┐  ┌─────▼─────┐  ┌─▼──────────┐    │
│  │ Prompt  │  │  LLM      │  │ PostProcess │    │
│  │ Builder │  │  Client   │  │ (基础裁剪)   │    │
│  └─────────┘  └───────────┘  └─────────────┘    │
└─────────────────────────────────────────────────┘
```

## 模块划分与接口定义

### 1. 核心类型（与完整版兼容）

```typescript
// === types.ts ===

/** 补全结果 */
export interface CompletionResult {
  /** 插入文本 */
  insertText: string;
  /** 替换范围（当前简易版只用光标位置到行尾） */
  range: {
    startLineNumber: number;
    startColumn: number;
    endLineNumber: number;
    endColumn: number;
  };
  /** 唯一 ID（遥测与生命周期追踪） */
  completionId: string;
  /** 结果来源（简易版只有 network） */
  source: CompletionSource;
  /** 是否为多行补全（简易版固定 false） */
  isMultiline: boolean;
}

export enum CompletionSource {
  Network = 'network',
  // 完整版扩展：
  // Cache = 'cache',
  // TypingAsSuggested = 'typingAsSuggested',
  // Speculative = 'speculative',
}

/** 补全请求上下文 */
export interface CompletionRequestContext {
  /** 请求 ID */
  requestId: string;
  /** 文档 URI */
  uri: string;
  /** 语言 ID */
  languageId: string;
  /** 光标位置 */
  position: { lineNumber: number; column: number };
  /** 触发类型 */
  triggerKind: InlineCompletionTriggerKind;
  /** 补全策略（简易版固定 singleLine） */
  strategy: CompletionStrategy;
  /** Prompt 信息（简易版只用 prefix） */
  prompt: PromptInfo;
  /** 文档版本（用于过期检测） */
  versionId: number;
}

export enum InlineCompletionTriggerKind {
  Automatic = 0,   // 自动触发
  Invoke = 1,      // 手动触发
}

/** 补全策略 */
export interface CompletionStrategy {
  /** 是否请求多行（简易版固定 false） */
  requestMultiline: boolean;
  /** BlockMode（简易版固定 Server） */
  blockMode: BlockMode;
  /** stop tokens（简易版固定 ['\n']） */
  stopTokens: string[];
  /** 最大生成 token 数 */
  maxTokens: number;
  // 完整版扩展：
  // finishedCb?: FinishedCallback;
  // lookAhead?: number;
}

export enum BlockMode {
  Server = 'server',
  // 完整版扩展：
  // Parsing = 'parsing',
  // MoreMultiline = 'moremultiline',
}

/** Prompt 信息 */
export interface PromptInfo {
  /** 光标前内容 */
  prefix: string;
  /** 光标后内容（简易版为空字符串，完整版启用 FIM） */
  suffix: string;
  /** 额外上下文（简易版为空数组） */
  context: string[];
  /** prefix 的 token 估算数 */
  prefixTokens?: number;
  /** suffix 的 token 估算数 */
  suffixTokens?: number;
  /** 是否启用 FIM（简易版固定 false） */
  isFimEnabled: boolean;
}

/** 补全生命周期事件 */
export enum CompletionLifecycleKind {
  Shown = 'shown',
  Accepted = 'accepted',
  Rejected = 'rejected',
  Ignored = 'ignored',
}

/** 遥测事件（简易版只记录基础信息） */
export interface TelemetryEvent {
  eventType: string;
  requestId: string;
  timestamp: number;
  properties: Record<string, string | number>;
}
```

### 2. PromptBuilder — 构建 Prompt

```typescript
// === promptBuilder.ts ===

export interface IPromptBuilder {
  /**
   * 从编辑器状态中提取 prompt
   * 简易版：只取 prefix（光标前内容），suffix 和 context 为空
   * 完整版：取 prefix + suffix + neighborFiles + diagnostics 等
   */
  buildPrompt(context: CompletionRequestContext): PromptInfo;
}

export class SimplePromptBuilder implements IPromptBuilder {
  constructor(private editor: monaco.editor.ICodeEditor) {}

  buildPrompt(context: CompletionRequestContext): PromptInfo {
    const model = this.editor.getModel();
    const position = context.position;

    // 只取光标前内容作为 prefix
    const prefix = model.getValueInRange({
      startLineNumber: 1,
      startColumn: 1,
      endLineNumber: position.lineNumber,
      endColumn: position.column,
    });

    // 简易版不取 suffix，不取额外上下文
    return {
      prefix,
      suffix: '',
      context: [],
      isFimEnabled: false,
    };
  }
}
```

### 3. LLMClient — 调用大模型

```typescript
// === llmClient.ts ===

export interface ILLMClient {
  /**
   * 向 LLM 发送补全请求
   * 简易版：同步等待完整响应，不流式
   * 完整版：流式返回首个 token，后台继续缓存
   */
  requestCompletion(
    prompt: PromptInfo,
    strategy: CompletionStrategy,
    context: CompletionRequestContext,
  ): Promise<CompletionResult[]>;

  /**
   * 取消进行中的请求
   * 简易版：直接 abort
   * 完整版：保留 1s 延迟以复用
   */
  cancelRequest(requestId: string): void;
}

export class SimpleLLMClient implements ILLMClient {
  private abortController: AbortController | null = null;

  constructor(private config: { endpoint: string; model: string; apiKey: string }) {}

  async requestCompletion(
    prompt: PromptInfo,
    strategy: CompletionStrategy,
    context: CompletionRequestContext,
  ): Promise<CompletionResult[]> {
    this.abortController = new AbortController();

    const response = await fetch(this.config.endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.config.apiKey}`,
      },
      body: JSON.stringify({
        model: this.config.model,
        prompt: prompt.prefix,  // 简易版只发 prefix
        max_tokens: strategy.maxTokens,
        stop: strategy.stopTokens,
        temperature: 0,
        n: context.triggerKind === InlineCompletionTriggerKind.Invoke ? 3 : 1,
      }),
      signal: this.abortController.signal,
    });

    const data = await response.json();
    return data.choices.map((choice: any, index: number) => ({
      insertText: choice.text,
      range: {
        startLineNumber: context.position.lineNumber,
        startColumn: context.position.column,
        endLineNumber: context.position.lineNumber,
        endColumn: context.position.column,
      },
      completionId: `${context.requestId}-${index}`,
      source: CompletionSource.Network,
      isMultiline: false,
    }));
  }

  cancelRequest(requestId: string): void {
    this.abortController?.abort();
  }
}
```

### 4. PostProcessor — 后处理

```typescript
// === postProcessor.ts ===

export interface IPostProcessor {
  /**
   * 对补全结果做基础质量过滤
   * 简易版：只做 trimEnd + 空结果过滤 + 下一行匹配检测
   * 完整版：重复检测、maybeSnip、BlockTrimmer、suffixCoverage 等
   */
  process(
    result: CompletionResult,
    documentContent: string,
    position: { lineNumber: number; column: number },
    strategy: CompletionStrategy,
  ): CompletionResult | undefined;
}

export class SimplePostProcessor implements IPostProcessor {
  process(
    result: CompletionResult,
    documentContent: string,
    position: { lineNumber: number; column: number },
    strategy: CompletionStrategy,
  ): CompletionResult | undefined {
    // 1. trimEnd
    const trimmed = result.insertText.trimEnd();
    if (!trimmed) return undefined;

    // 2. 下一行匹配检测（避免补全与下一行重复）
    const lines = documentContent.split('\n');
    const nextLine = lines[position.lineNumber]?.trim(); // lineNumber 是 0-based in split
    if (nextLine && trimmed.trim() === nextLine) {
      return undefined;
    }

    // 3. 单行强制（简易版不需要，因为 stop=['\n'] 已保证单行）
    return { ...result, insertText: trimmed };
  }
}
```

### 5. GhostTextController — 编排核心

```typescript
// === ghostTextController.ts ===

export interface IGhostTextController {
  /** 获取补全列表 */
  getCompletions(
    context: CompletionRequestContext,
  ): Promise<CompletionResult[]>;

  /** 处理补全生命周期事件 */
  handleLifecycle(
    completionId: string,
    kind: CompletionLifecycleKind,
  ): void;

  /** 取消当前请求 */
  cancelCurrentRequest(): void;
}

export class SimpleGhostTextController implements IGhostTextController {
  private currentRequestId: string = '';
  private versionId: number = 0;

  constructor(
    private promptBuilder: IPromptBuilder,
    private llmClient: ILLMClient,
    private postProcessor: IPostProcessor,
    private telemetryEmitter: ITelemetryEmitter,
  ) {}

  async getCompletions(
    context: CompletionRequestContext,
  ): Promise<CompletionResult[]> {
    // 1. 检查文档版本是否过期
    if (context.versionId !== this.versionId) {
      return [];
    }
    this.currentRequestId = context.requestId;

    // 2. 构建 Prompt
    const prompt = this.promptBuilder.buildPrompt(context);

    // 3. 检查最小字符数
    if (prompt.prefix.length < 10) {
      return [];
    }

    // 4. 调用 LLM
    this.telemetryEmitter.emit({
      eventType: 'completion.issued',
      requestId: context.requestId,
      timestamp: Date.now(),
      properties: { languageId: context.languageId, source: 'network' },
    });

    let results: CompletionResult[];
    try {
      results = await this.llmClient.requestCompletion(prompt, context.strategy, context);
    } catch (e) {
      if (e instanceof DOMException && e.name === 'AbortError') {
        return [];
      }
      this.telemetryEmitter.emit({
        eventType: 'completion.failed',
        requestId: context.requestId,
        timestamp: Date.now(),
        properties: { error: String(e) },
      });
      return [];
    }

    // 5. 后处理
    const model = this.editor.getModel();
    const documentContent = model.getValue();
    const processed = results
      .map(r => this.postProcessor.process(r, documentContent, context.position, context.strategy))
      .filter((r): r is CompletionResult => r !== undefined);

    // 6. 遥测
    this.telemetryEmitter.emit({
      eventType: 'completion.received',
      requestId: context.requestId,
      timestamp: Date.now(),
      properties: { count: processed.length },
    });

    return processed;
  }

  handleLifecycle(completionId: string, kind: CompletionLifecycleKind): void {
    this.telemetryEmitter.emit({
      eventType: `completion.${kind}`,
      requestId: completionId.split('-')[0],
      timestamp: Date.now(),
      properties: {},
    });
  }

  cancelCurrentRequest(): void {
    this.llmClient.cancelRequest(this.currentRequestId);
  }
}
```

### 6. MonacoInlineCompletionsProvider — VS Code API 适配

```typescript
// === monacoInlineCompletionsProvider.ts ===

import * as monaco from 'monaco-editor';

export class MonacoInlineCompletionsProvider implements monaco.languages.InlineCompletionsProvider {
  private idCounter = 0;

  constructor(
    private controller: IGhostTextController,
    private editor: monaco.editor.ICodeEditor,
  ) {}

  async provideInlineCompletions(
    model: monaco.editor.ITextModel,
    position: monaco.Position,
    context: monaco.languages.InlineCompletionContext,
    token: monaco.CancellationToken,
  ): Promise<monaco.languages.InlineCompletionList> {
    // 构建请求上下文
    const requestContext: CompletionRequestContext = {
      requestId: `req-${++this.idCounter}-${Date.now()}`,
      uri: model.uri.toString(),
      languageId: model.getLanguageId(),
      position: { lineNumber: position.lineNumber, column: position.column },
      triggerKind: context.triggerKind as InlineCompletionTriggerKind,
      strategy: {
        requestMultiline: false,
        blockMode: BlockMode.Server,
        stopTokens: ['\n'],
        maxTokens: 20,
      },
      prompt: { prefix: '', suffix: '', context: [], isFimEnabled: false },
      versionId: model.getVersionId(),
    };

    // 检查是否在行尾（Ghost Text 只在行尾触发）
    const line = model.getLineContent(position.lineNumber);
    const textAfterCursor = line.substring(position.column - 1);
    if (textAfterCursor.trim() !== '') {
      return { items: [] };
    }

    // 获取补全
    const completions = await this.controller.getCompletions(requestContext);

    // 转换为 Monaco 格式
    const items: monaco.languages.InlineCompletionItem[] = completions.map(c => ({
      insertText: c.insertText,
      range: new monaco.Range(
        c.range.startLineNumber,
        c.range.startColumn,
        c.range.endLineNumber,
        c.range.endColumn,
      ),
    }));

    return {
      items,
      dispose: () => {},
    };
  }

  handleDidShowCompletionItem(item: monaco.languages.InlineCompletionItem): void {
    // 简易版不做投机请求
  }

  handleDidPartiallyAcceptCompletionItem(item: monaco.languages.InlineCompletionItem): void {
    // 简易版不做 partial accept 追踪
  }
}
```

### 7. TelemetryEmitter — 遥测

```typescript
// === telemetryEmitter.ts ===

export interface ITelemetryEmitter {
  emit(event: TelemetryEvent): void;
}

export class ConsoleTelemetryEmitter implements ITelemetryEmitter {
  emit(event: TelemetryEvent): void {
    console.log(`[Telemetry] ${event.eventType}`, event);
  }
}
```

### 8. 注册与初始化

```typescript
// === main.ts ===

export function setupInlineCompletion(
  editor: monaco.editor.ICodeEditor,
  llmConfig: { endpoint: string; model: string; apiKey: string },
) {
  const telemetryEmitter = new ConsoleTelemetryEmitter();
  const promptBuilder = new SimplePromptBuilder(editor);
  const llmClient = new SimpleLLMClient(llmConfig);
  const postProcessor = new SimplePostProcessor();
  const controller = new SimpleGhostTextController(
    promptBuilder, llmClient, postProcessor, telemetryEmitter,
  );
  const provider = new MonacoInlineCompletionsProvider(controller, editor);

  // 注册到 Monaco
  monaco.languages.registerInlineCompletionsProvider(
    { pattern: '**/*' },
    provider,
  );

  // 用户编辑时取消进行中的请求
  editor.onDidChangeModelContent(() => {
    controller.cancelCurrentRequest();
  });
}
```

## 实现步骤

### Step 1：定义核心类型（types.ts）

- 定义 `CompletionResult`, `CompletionRequestContext`, `CompletionStrategy`, `PromptInfo` 等接口
- 所有接口预留完整版扩展的注释标记
- 确保枚举值包含完整版需要的所有选项（即使简易版只用到部分）

### Step 2：实现 SimplePromptBuilder

- 从 Monaco editor model 取光标前全部内容作为 prefix
- suffix / context / FIM 全部为空或 false
- 最小字符数检查（< 10 返回空）

### Step 3：实现 SimpleLLMClient

- 使用 fetch 调用 OpenAI-compatible completion API
- 传入 `prompt` + `stop: ['\n']` + `max_tokens: 20`
- 支持 AbortController 取消
- 返回 `CompletionResult[]`

### Step 4：实现 SimplePostProcessor

- trimEnd 空白
- 过滤空结果
- 下一行重复检测
- 单行裁剪（虽然 stop=['\n'] 已保证，但以防万一）

### Step 5：实现 SimpleGhostTextController

- 编排 prompt → LLM → postProcess 流程
- 文档版本过期检测
- 发出基础遥测事件

### Step 6：实现 MonacoInlineCompletionsProvider

- 实现 Monaco 的 `InlineCompletionsProvider` 接口
- 行尾位置检查（`textAfterCursor.trim() === ''`）
- 将 `CompletionResult[]` 转换为 Monaco `InlineCompletionItem[]`

### Step 7：实现 TelemetryEmitter

- console.log 输出，不做真实遥测上报

### Step 8：注册与集成测试

- `setupInlineCompletion()` 函数初始化所有组件
- `editor.onDidChangeModelContent` 取消旧请求
- 测试基本流程：输入 → 等待 → 看到幽灵文本 → Tab 接受

## 文件结构

```
src/
  inlineCompletion/
    types.ts                      核心类型定义
    promptBuilder.ts              IPromptBuilder + SimplePromptBuilder
    llmClient.ts                  ILLMClient + SimpleLLMClient
    postProcessor.ts              IPostProcessor + SimplePostProcessor
    ghostTextController.ts        IGhostTextController + SimpleGhostTextController
    monacoInlineCompletionsProvider.ts  Monaco API 适配
    telemetryEmitter.ts           ITelemetryEmitter + ConsoleTelemetryEmitter
    setup.ts                      setupInlineComposition() 入口
```

## 简易版不做的事情

| 功能 | 简易版状态 | 完整版计划位置 |
|------|-----------|--------------|
| 多行补全 | 固定单行 | S03 |
| Prompt 上下文（neighborFiles, diagnostics 等） | 只取 prefix | S01 |
| FIM（prefix + suffix） | 不启用 | S01 |
| LRU Radix Trie 缓存 | 不实现 | 07-caching |
| Typing-as-Suggested | 不实现 | S02 |
| 投机请求 | 不实现 | S02 |
| Debounce | 不实现 | S02 |
| 流式返回首个 token | 不实现 | S02 |
| BlockTrimmer AST 裁剪 | 不实现 | S03 |
| StreamedCompletionSplitter | 不实现 | S03 |
| ML 多行评分模型 | 不实现 | S03 |
| NES（行中编辑） | 不实现 | 05-nes |
| JointProvider 融合 | 不实现 | 06-joint |
| 编辑重定位 Rebase | 不实现 | 07-caching |
| 遥测上报 | 只 console.log | 08-telemetry |
| ExP 实验参数 | 不实现 | 08-telemetry |