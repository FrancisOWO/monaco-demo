# Plan C：简易版 — Monaco Editor NES (Next Edit Suggestion)

## 目标

跑通 NES 行中编辑建议的基本流程：用户编辑/移动光标 → 构建 NES prompt → 调用 LLM → 在编辑器中显示行中编辑建议（ghost text 形式） → 用户按 Tab 接受。不做缓存、不做 Rebase、不做投机请求、不做诊断竞速。

## 与 Ghost Text 的核心区别

| 维度 | Ghost Text | NES |
|------|-----------|-----|
| 触发位置 | 仅行尾 | 行中任意位置 |
| 编辑范围 | 只追加到光标后 | 可修改光标前后内容 |
| 触发时机 | 用户每次输入 | 用户编辑后/光标移动后 |
| Prompt | FIM prefix+suffix | Chat 模式，带编辑历史 |
| 转换 | 直接作为 insertText | 需 `toInlineSuggestion` 转换 |
| 冷却机制 | 无 | 拒绝后 5 秒冷却 |

## 架构总览

```
┌─────────────────────────────────────────────────┐
│                  Monaco Editor                   │
│  ┌───────────────────────────────────────────┐  │
│  │    InlineEditTriggerer                     │  │
│  │  (监听文档变更/选区变更 → 触发 NES 请求)     │  │
│  └──────────────────┬────────────────────────┘  │
│                     │ NesChangeHint              │
│  ┌──────────────────▼────────────────────────┐  │
│  │         NESController                      │  │
│  │  (编排：触发检查 → 构建 prompt → 调用模型   │  │
│  │   → toInlineSuggestion → 返回结果)         │  │
│  └──────────────────┬────────────────────────┘  │
│                     │                            │
│         ┌───────────┼───────────┐                │
│         │           │           │                │
│  ┌──────▼──┐  ┌─────▼─────┐  ┌─▼──────────┐    │
│  │ NES     │  │  LLM      │  │ toInline   │    │
│  │ Prompt  │  │  Client   │  │ Suggestion │    │
│  │ Builder │  │  (Chat)   │  │ (转换)      │    │
│  └─────────┘  └───────────┘  └─────────────┘    │
└─────────────────────────────────────────────────┘
```

## 模块划分与接口定义

### 1. 核心类型（与完整版兼容）

```typescript
// === types.ts ===

/** NES 编辑结果 */
export interface NextEditResult {
  /** 目标文档 ID */
  targetDocumentId: string;
  /** 编辑内容：行替换 */
  edit: LineReplacement;
  /** 请求 ID */
  requestId: string;
  /** 结果来源 */
  source: NextEditSource;
  /** 是否为光标跳转产生的编辑 */
  isFromCursorJump: boolean;
  /** 编辑窗口范围（offset） */
  editWindow?: { start: number; end: number };
  /** 原始编辑窗口（用于重定位） */
  originalEditWindow?: { start: number; end: number };
  /** 文档快照（编辑前内容，用于 Rebase） */
  documentBeforeEdits?: string;
}

export enum NextEditSource {
  Network = 'network',
  // 完整版扩展：
  // Cache = 'cache',
  // Rebase = 'rebase',
  // Speculative = 'speculative',
  // Diagnostics = 'diagnostics',
}

/** 行替换编辑 */
export interface LineReplacement {
  /** 替换范围（行号范围） */
  replaceRange: { startLineNumber: number; startColumn: number; endLineNumber: number; endColumn: number };
  /** 替换后的新文本 */
  newText: string;
}

/** NES 请求上下文 */
export interface NESRequestContext {
  requestId: string;
  uri: string;
  languageId: string;
  position: { lineNumber: number; column: number };
  triggerReason: NesTriggerReason;
  /** 当前文档内容 */
  documentContent: string;
  /** 光标所在行号（用于冷却检测） */
  cursorLineNumber: number;
  /** 文档版本 */
  versionId: number;
}

export enum NesTriggerReason {
  SelectionChange = 'selectionChange',
  ActiveDocumentSwitch = 'activeDocumentSwitch',
}

/** 转换后的内联建议（可直接显示为 ghost text） */
export interface InlineSuggestionEdit {
  /** 替换范围（调整到光标位置） */
  range: { startLineNumber: number; startColumn: number; endLineNumber: number; endColumn: number };
  /** 新文本（已去除共同前缀） */
  newText: string;
  /** 原始 NES 编辑结果 */
  originalEdit: NextEditResult;
}

/** NES 生命周期事件 */
export enum NesLifecycleKind {
  Shown = 'shown',
  Accepted = 'accepted',
  Rejected = 'rejected',
  Ignored = 'ignored',
}

/** 冷却配置 */
export interface NesCooldownConfig {
  /** 拒绝后冷却时间（ms） */
  rejectionCooldownMs: number;   // 默认 5000
  /** 同行冷却时间（ms） */
  sameLineCooldownMs: number;    // 默认 5000
  /** 连续变更上限（ms） */
  afterChangeLimitMs: number;    // 默认 10000
}

/** 遥测事件 */
export interface NesTelemetryEvent {
  eventType: string;
  requestId: string;
  timestamp: number;
  properties: Record<string, string | number>;
}
```

### 2. InlineEditTriggerer — 触发器

```typescript
// === trigger.ts ===

export interface IInlineEditTriggerer {
  /** NES 触发事件 */
  onDidChange: IEvent<NesChangeHint>;

  /** 启动/停止监听 */
  start(editor: monaco.editor.ICodeEditor): void;
  stop(): void;

  /** 手动触发（用于快捷键） */
  triggerManually(): void;

  /** 处理拒绝冷却 */
  handleRejection(): void;
}

export class SimpleInlineEditTriggerer implements IInlineEditTriggerer {
  private emitter = new Emitter<NesChangeHint>();
  private editor: monaco.editor.ICodeEditor | null = null;
  private lastRejectionTime: number = 0;
  private lastEditTimestamp: number = 0;
  private config: NesCooldownConfig = {
    rejectionCooldownMs: 5000,
    sameLineCooldownMs: 5000,
    afterChangeLimitMs: 10000,
  };

  readonly onDidChange = this.emitter.event;

  start(editor: monaco.editor.ICodeEditor): void {
    this.editor = editor;

    // 监听文档变更
    editor.onDidChangeModelContent((e) => {
      this.lastEditTimestamp = Date.now();
      // 简易版：每次编辑都触发（不做复杂防抖）
      this._trigger(NesTriggerReason.SelectionChange);
    });

    // 监听选区变更（光标移动）
    editor.onDidChangeCursorPosition((e) => {
      // 检查拒绝冷却
      if (this._isWithinRejectionCooldown()) return;
      this._trigger(NesTriggerReason.SelectionChange);
    });
  }

  private _trigger(reason: NesTriggerReason): void {
    const hint: NesChangeHint = {
      data: { uuid: generateUuid(), reason },
    };
    this.emitter.fire(hint);
  }

  private _isWithinRejectionCooldown(): boolean {
    return Date.now() - this.lastRejectionTime < this.config.rejectionCooldownMs;
  }

  handleRejection(): void {
    this.lastRejectionTime = Date.now();
  }

  triggerManually(): void {
    this._trigger(NesTriggerReason.SelectionChange);
  }

  stop(): void {
    // 清理监听
  }
}

interface NesChangeHint {
  data: { uuid: string; reason: NesTriggerReason };
}
```

### 3. NESPromptBuilder — 构建 NES Prompt

NES 使用 Chat 模式（而非 Ghost Text 的 Completion 模式），因为需要理解编辑历史和上下文。

```typescript
// === nesPromptBuilder.ts ===

export interface INESPromptBuilder {
  /**
   * 构建 NES 的 Chat prompt
   * 简易版：当前文件内容 + 光标位置标记 + 最近几行编辑历史
   * 完整版：多文档上下文 + 详细编辑历史 + lint 错误 + 模型特定标签
   */
  buildPrompt(context: NESRequestContext): NESPrompt;
}

export interface NESPrompt {
  /** System prompt */
  systemPrompt: string;
  /** User prompt（包含文件内容、编辑历史、光标位置） */
  userPrompt: string;
  /** 模型名称 */
  model: string;
  /** 最大输出 token 数 */
  maxTokens: number;
  /** 期望的响应格式 */
  responseFormat: NesResponseFormat;
}

export enum NesResponseFormat {
  /** 简易版：返回纯文本替换内容 */
  RawText = 'rawText',
  /** 完整版：返回 <EDIT>...</EDIT> 或 <NO_CHANGE> 标签格式 */
  Tagged = 'tagged',
}

export class SimpleNESPromptBuilder implements INESPromptBuilder {
  constructor(private editor: monaco.editor.ICodeEditor) {}

  buildPrompt(context: NESRequestContext): NESPrompt {
    const model = this.editor.getModel();
    const position = context.position;
    const documentContent = context.documentContent;

    // 简易版 system prompt
    const systemPrompt = `You are a code editing assistant. Predict the next edit the user will make.
Return ONLY the replacement text for the area around the cursor, or respond with NO_CHANGE if no edit is predicted.
The replacement should be a complete, valid code fragment that replaces the content around the cursor position.`;

    // 构建用户 prompt
    const lines = documentContent.split('\n');
    const cursorLine = position.lineNumber - 1; // 0-based
    const startLine = Math.max(0, cursorLine - 15);
    const endLine = Math.min(lines.length - 1, cursorLine + 15);
    const snippetLines = lines.slice(startLine, endLine + 1);

    // 在光标位置插入标记
    const markedSnippet = snippetLines.map((line, i) => {
      const lineNo = startLine + i;
      if (lineNo === cursorLine) {
        return line.substring(0, position.column - 1) + '<|cursor|>' + line.substring(position.column - 1);
      }
      return line;
    }).join('\n');

    const userPrompt = `Current file (${context.languageId}):
${markedSnippet}

Predict the next edit. Return the replacement text for the code area around <|cursor|>, or NO_CHANGE.`;

    return {
      systemPrompt,
      userPrompt,
      model: 'default',
      maxTokens: 100,
      responseFormat: NesResponseFormat.RawText,
    };
  }
}
```

### 4. NESAICompletionClient — 调用大模型（Chat 模式）

```typescript
// === nesLlmClient.ts ===

export interface INESAICompletionClient {
  /**
   * 向 LLM 发送 NES Chat 请求
   * 简易版：同步等待完整响应
   * 完整版：流式返回，支持 AsyncGenerator
   */
  requestNextEdit(
    prompt: NESPrompt,
    context: NESRequestContext,
  ): Promise<NextEditResult | undefined>;

  cancelRequest(requestId: string): void;
}

export class SimpleNESAICompletionClient implements INESAICompletionClient {
  private abortController: AbortController | null = null;

  constructor(private config: { endpoint: string; model: string; apiKey: string }) {}

  async requestNextEdit(
    prompt: NESPrompt,
    context: NESRequestContext,
  ): Promise<NextEditResult | undefined> {
    this.abortController = new AbortController();

    const response = await fetch(this.config.endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.config.apiKey}`,
      },
      body: JSON.stringify({
        model: this.config.model,
        messages: [
          { role: 'system', content: prompt.systemPrompt },
          { role: 'user', content: prompt.userPrompt },
        ],
        max_tokens: prompt.maxTokens,
        temperature: 0,
      }),
      signal: this.abortController.signal,
    });

    const data = await response.json();
    const content = data.choices[0]?.message?.content ?? '';

    // 解析响应
    if (content.trim() === 'NO_CHANGE' || content.trim() === '') {
      return undefined; // 无编辑建议
    }

    // 简易版：将 LLM 返回的文本作为光标位置的行替换
    // 计算编辑范围：光标所在行的光标位置到行尾
    return this.parseEditResponse(content, context);
  }

  private parseEditResponse(content: string, context: NESRequestContext): NextEditResult | undefined {
    const lines = context.documentContent.split('\n');
    const cursorLineIdx = context.position.lineNumber - 1;
    const currentLine = lines[cursorLineIdx];

    // 简易版：假设 LLM 返回的是光标位置到行尾的替换
    // 编辑范围：从光标列到当前行末尾
    const edit: LineReplacement = {
      replaceRange: {
        startLineNumber: context.position.lineNumber,
        startColumn: context.position.column,
        endLineNumber: context.position.lineNumber,
        endColumn: currentLine.length + 1,
      },
      newText: content,
    };

    return {
      targetDocumentId: context.uri,
      edit,
      requestId: context.requestId,
      source: NextEditSource.Network,
      isFromCursorJump: false,
    };
  }

  cancelRequest(requestId: string): void {
    this.abortController?.abort();
  }
}
```

### 5. toInlineSuggestion — 编辑转换

NES 的编辑可能是行中任意位置的修改，需要转换为 Monaco 能显示的 inline completion 格式。

```typescript
// === toInlineSuggestion.ts ===

/**
 * 将 NES 编辑转换为 Monaco inline suggestion 格式
 * 关键步骤：
 * 1. 确保编辑范围在光标所在行
 * 2. 去除共同前缀（光标前与 newText 相同的部分）
 * 3. 验证光标前文本匹配
 * 4. 确保旧文本是新文本的 subword
 */
export function toInlineSuggestion(
  cursorPos: { lineNumber: number; column: number },
  documentContent: string,
  edit: LineReplacement,
): InlineSuggestionEdit | undefined {
  const lines = documentContent.split('\n');
  const cursorLineIdx = cursorPos.lineNumber - 1;

  // 1. 编辑必须与光标在同一行
  if (edit.replaceRange.startLineNumber !== cursorPos.lineNumber) {
    return undefined;
  }

  // 2. 获取被替换的旧文本
  const currentLine = lines[cursorLineIdx];
  const replacedText = currentLine.substring(
    edit.replaceRange.startColumn - 1,
    edit.replaceRange.endColumn - 1,
  );

  // 3. 验证光标前文本匹配
  const textBeforeCursor = currentLine.substring(0, cursorPos.column - 1);
  const textBeforeEditInNew = edit.newText.substring(0, cursorPos.column - edit.replaceRange.startColumn);
  if (textBeforeCursor !== textBeforeEditInNew) {
    return undefined;
  }

  // 4. 确保旧文本是新文本的 subword
  if (!isSubword(replacedText, edit.newText)) {
    return undefined;
  }

  // 5. 转换范围：从编辑范围到调整后的范围
  return {
    range: {
      startLineNumber: edit.replaceRange.startLineNumber,
      startColumn: edit.replaceRange.startColumn,
      endLineNumber: edit.replaceRange.endLineNumber,
      endColumn: edit.replaceRange.endColumn,
    },
    newText: edit.newText,
    originalEdit: {} as NextEditResult, // 简易版不保留原始编辑
  };
}

/** 检查 a 是否是 b 的 subword（子序列） */
function isSubword(a: string, b: string): boolean {
  let ai = 0;
  for (let bi = 0; bi < b.length && ai < a.length; bi++) {
    if (a[ai] === b[bi]) ai++;
  }
  return ai === a.length;
}
```

### 6. NESController — 编排核心

```typescript
// === nesController.ts ===

export interface INESController {
  /** 获取 NES 编辑建议 */
  getNextEdit(context: NESRequestContext): Promise<InlineSuggestionEdit | undefined>;

  /** 处理生命周期事件 */
  handleLifecycle(editId: string, kind: NesLifecycleKind): void;

  /** 取消当前请求 */
  cancelCurrentRequest(): void;
}

export class SimpleNESController implements INESController {
  private currentRequestId: string = '';

  constructor(
    private promptBuilder: INESPromptBuilder,
    private aiCompletionClient: INESAICompletionClient,
    private triggerer: IInlineEditTriggerer,
    private telemetryEmitter: INesTelemetryEmitter,
    private editor: monaco.editor.ICodeEditor,
  ) {}

  async getNextEdit(context: NESRequestContext): Promise<InlineSuggestionEdit | undefined> {
    this.currentRequestId = context.requestId;

    // 1. 构建 Prompt
    const prompt = this.promptBuilder.buildPrompt(context);

    // 2. 调用 LLM
    this.telemetryEmitter.emit({
      eventType: 'nes.issued',
      requestId: context.requestId,
      timestamp: Date.now(),
      properties: { languageId: context.languageId, triggerReason: context.triggerReason },
    });

    let result: NextEditResult | undefined;
    try {
      result = await this.aiCompletionClient.requestNextEdit(prompt, context);
    } catch (e) {
      if (e instanceof DOMException && e.name === 'AbortError') return undefined;
      this.telemetryEmitter.emit({
        eventType: 'nes.failed',
        requestId: context.requestId,
        timestamp: Date.now(),
        properties: { error: String(e) },
      });
      return undefined;
    }

    if (!result) return undefined; // NO_CHANGE

    // 3. 转换为 inline suggestion
    const model = this.editor.getModel();
    const documentContent = model.getValue();
    const suggestion = toInlineSuggestion(context.position, documentContent, result.edit);
    if (!suggestion) return undefined;

    // 4. 遥测
    this.telemetryEmitter.emit({
      eventType: 'nes.received',
      requestId: context.requestId,
      timestamp: Date.now(),
      properties: { hasEdit: true },
    });

    return suggestion;
  }

  handleLifecycle(editId: string, kind: NesLifecycleKind): void {
    if (kind === NesLifecycleKind.Rejected) {
      this.triggerer.handleRejection(); // 触发冷却
    }
    this.telemetryEmitter.emit({
      eventType: `nes.${kind}`,
      requestId: editId,
      timestamp: Date.now(),
      properties: {},
    });
  }

  cancelCurrentRequest(): void {
    this.aiCompletionClient.cancelRequest(this.currentRequestId);
  }
}
```

### 7. NESMonacoAdapter — Monaco API 适配

```typescript
// === nesMonacoAdapter.ts ===

export class NESMonacoInlineCompletionsProvider implements monaco.languages.InlineCompletionsProvider {
  private idCounter = 0;
  private currentSuggestion: InlineSuggestionEdit | undefined;

  constructor(
    private controller: INESController,
    private triggerer: IInlineEditTriggerer,
    private editor: monaco.editor.ICodeEditor,
  ) {
    // 监听 NES 触发事件
    this.triggerer.onDidChange((hint) => {
      this._onNesTrigger(hint);
    });
  }

  async provideInlineCompletions(
    model: monaco.editor.ITextModel,
    position: monaco.Position,
    context: monaco.languages.InlineCompletionContext,
    token: monaco.CancellationToken,
  ): Promise<monaco.languages.InlineCompletionList> {
    const requestContext: NESRequestContext = {
      requestId: `nes-${++this.idCounter}-${Date.now()}`,
      uri: model.uri.toString(),
      languageId: model.getLanguageId(),
      position: { lineNumber: position.lineNumber, column: position.column },
      triggerReason: context.triggerKind === 0
        ? NesTriggerReason.SelectionChange
        : NesTriggerReason.SelectionChange,
      documentContent: model.getValue(),
      cursorLineNumber: position.lineNumber,
      versionId: model.getVersionId(),
    };

    // 获取 NES 建议
    const suggestion = await this.controller.getNextEdit(requestContext);
    this.currentSuggestion = suggestion;

    if (!suggestion) return { items: [] };

    // 转换为 Monaco 格式
    const items: monaco.languages.InlineCompletionItem[] = [{
      insertText: suggestion.newText,
      range: new monaco.Range(
        suggestion.range.startLineNumber,
        suggestion.range.startColumn,
        suggestion.range.endLineNumber,
        suggestion.range.endColumn,
      ),
    }];

    return { items, dispose: () => {} };
  }

  handleDidShowCompletionItem(item: monaco.languages.InlineCompletionItem): void {
    // 简易版不做投机请求
  }

  handleDidPartiallyAcceptCompletionItem(item: monaco.languages.InlineCompletionItem): void {
    // 简易版不做 partial accept 追踪
  }

  private _onNesTrigger(hint: NesChangeHint): void {
    // 触发重新请求补全
    // 简易版：直接调用 editor.trigger 来重新触发 inline completions
    this.editor.trigger('nes.trigger', 'editor.action.inlineSuggest.trigger', {});
  }
}
```

### 8. 注册与初始化

```typescript
// === setup.ts ===

export function setupNES(
  editor: monaco.editor.ICodeEditor,
  llmConfig: { endpoint: string; model: string; apiKey: string },
) {
  const telemetryEmitter = new ConsoleNesTelemetryEmitter();
  const promptBuilder = new SimpleNESPromptBuilder(editor);
  const aiCompletionClient = new SimpleNESAICompletionClient(llmConfig);
  const triggerer = new SimpleInlineEditTriggerer();
  const controller = new SimpleNESController(
    promptBuilder, aiCompletionClient, triggerer, telemetryEmitter, editor,
  );
  const provider = new NESMonacoInlineCompletionsProvider(controller, triggerer, editor);

  // 注册到 Monaco
  monaco.languages.registerInlineCompletionsProvider(
    { pattern: '**/*' },
    provider,
  );

  // 启动触发器
  triggerer.start(editor);

  // 用户编辑时取消进行中的请求
  editor.onDidChangeModelContent(() => {
    controller.cancelCurrentRequest();
  });

  return { triggerer, controller, provider };
}
```

## 实现步骤

### Step 1：定义核心类型（types.ts）

- 定义 `NextEditResult`, `LineReplacement`, `NESRequestContext`, `InlineSuggestionEdit`
- 定义枚举：`NextEditSource`, `NesTriggerReason`, `NesLifecycleKind`, `NesResponseFormat`
- 定义 `NesCooldownConfig`
- 预留完整版扩展注释

### Step 2：实现 InlineEditTriggerer

- 监听 Monaco 的 `onDidChangeModelContent` 和 `onDidChangeCursorPosition`
- 实现拒绝冷却（5 秒）
- 通过 `Emitter<NesChangeHint>` 触发事件

### Step 3：实现 NESPromptBuilder

- 构建简易版 system prompt + user prompt
- user prompt 包含：当前文件片段（光标前后 15 行）+ `<|cursor|>` 标记
- 简易版使用 `NesResponseFormat.RawText`

### Step 4：实现 NESAICompletionClient

- 使用 Chat API 格式（`messages` 数组）而非 Completion API
- 解析 LLM 返回的文本为 `LineReplacement`
- 简易版假设 LLM 返回光标位置到行尾的替换文本
- 支持 AbortController 取消

### Step 5：实现 toInlineSuggestion

- 行内编辑范围验证（必须在光标所在行）
- 光标前文本匹配验证
- Subword 检查（旧文本是新文本的子序列）
- 转换为 `InlineSuggestionEdit` 格式

### Step 6：实现 NESController

- 编排 prompt → LLM → toInlineSuggestion 流程
- 拒绝时触发冷却
- 发出基础遥测

### Step 7：实现 NESMonacoAdapter

- 实现 Monaco 的 `InlineCompletionsProvider` 接口
- 监听 `NesChangeHint` 事件触发重新请求
- 将 `InlineSuggestionEdit` 转换为 Monaco `InlineCompletionItem`

### Step 8：注册与集成测试

- `setupNES()` 函数初始化所有组件
- 测试基本流程：编辑代码 → 触发 NES → 看到行中编辑建议 → Tab 接受

## 文件结构

```
src/
  nes/
    types.ts                         核心类型定义
    trigger.ts                       IInlineEditTriggerer + SimpleInlineEditTriggerer
    nesPromptBuilder.ts              INESPromptBuilder + SimpleNESPromptBuilder
    nesLlmClient.ts                  INESAICompletionClient + SimpleNESAICompletionClient
    toInlineSuggestion.ts            toInlineSuggestion() 转换函数 + isSubword
    nesController.ts                 INESController + SimpleNESController
    nesMonacoAdapter.ts              NESMonacoInlineCompletionsProvider
    telemetryEmitter.ts              INesTelemetryEmitter + ConsoleNesTelemetryEmitter
    setup.ts                         setupNES() 入口
```

## 简易版不做的事情

| 功能 | 简易版状态 | 完整版计划位置 |
|------|-----------|--------------|
| NextEditCache + Rebase | 不实现 | 07-caching |
| 投机请求 | 不实现 | S02 |
| 请求复用 | 不实现 | S02 |
| 流式返回 | 不实现 | S02 |
| Diagnostics NES 竞速 | 不实现 | 05-nes |
| 同行冷却/防抖 | 只做拒绝冷却 | 05-nes |
| 文档切换触发 | 不实现 | 05-nes |
| 多文档上下文 | 不实现 | S01 |
| 编辑历史 diff | 不实现 | S01 |
| Tagged 响应格式解析 | 不实现 | NES prompt |
| Survival Rate 追踪 | 不实现 | 08-telemetry |
| Cross-document 编辑 | 不实现 | 05-nes |
| expandEditWindow | 不实现 | 05-nes |

## 与 Ghost Text 简易版的共存

简易版 NES 和 Ghost Text 可以分别注册为独立的 `InlineCompletionsProvider`。Monaco 会依次调用各 provider 并合并结果。但如果需要像 Copilot 的 `JointCompletionsProvider` 一样融合两者（行尾走 Ghost Text，行中走 NES），则需要实现联合提供者——这属于更高级的话题，简易版暂不考虑。