# Plan D：完整版 — Monaco Editor NES (Next Edit Suggestion)

## 目标

基于 Copilot NES 架构实现完整的行中编辑建议功能，涵盖触发机制（防抖+冷却）、NES 专用 Chat prompt 构建、编辑转换、缓存与 Rebase、投机请求、诊断竞速、遥测体系等核心功能。

## 架构总览

```
┌─────────────────────────────────────────────────────────────────────┐
│                          Monaco Editor                               │
│                                                                      │
│  ┌──────────────────────────────────────────────────────────────┐   │
│  │              InlineEditTriggerer                               │   │
│  │  (监听文档变更/选区变更 → 防抖 → 冷却检查 → NesChangeHint)      │   │
│  └────────────────────────────┬──────────────────────────────────┘   │
│                               │ NesChangeHint                        │
│  ┌────────────────────────────▼──────────────────────────────────┐   │
│  │                 NESController                                  │   │
│  │  ┌──────────────────────────────────────────────────────┐     │   │
│  │  │ getNextEdit():                                        │     │   │
│  │  │   ① NextEditCache → 本地返回(0ms)                     │     │   │
│  │  │   ② Rebase → 平移旧缓存(0ms)                         │     │   │
│  │  │   ③ Pending request reuse → 等待进行中请求(≤200ms)   │     │   │
│  │  │   ④ Speculative request → 命中投机缓存(0ms)         │     │   │
│  │  │   ⑤ Network → 流式返回                               │     │   │
│  │  └──────────────────────────────────────────────────────┘     │   │
│  └────────────────────────────┬──────────────────────────────────┘   │
│                               │                                      │
│    ┌────────────┬─────────────┼──────────┬────────────────────┐      │
│    │            │             │          │                    │      │
│  ┌─▼───────┐ ┌─▼─────────┐ ┌─▼───────┐ ┌▼───────────────┐ ┌─▼──────┐
│  │NES      │ │  LLM      │ │ toInline│ │ NextEditCache  │ │Diagnos-│
│  │Prompt   │ │  Client   │ │ Sugges- │ │ (per-doc +     │ │tics NES│
│  │Builder  │ │(stream+   │ │ tion    │ │  shared LRU +  │ │(竞速)  │
│  │(Chat +  │ │  cancel)  │ │(prefix  │ │  Rebase)       │ │        │
│  │ context │ │           │ │ strip)  │ │                │ │        │
│  └─────────┘ └───────────┘ └─────────┘ └────────────────┘ └────────┘
│                                                                      │
│  ┌──────────────────────────────────────────────────────────────┐   │
│  │              Speculative Request Cache                        │   │
│  │  (显示时预计算接受后的下一轮 NES，接受时立即命中)               │   │
│  └──────────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────────┘
```

## 模块划分与接口定义

接口沿用 Plan C 简易版的定义，在完整版中扩展。

### 1. 核心类型扩展

```typescript
// === types.ts ===（扩展 Plan C）

// NextEditSource 扩展
export enum NextEditSource {
  Network = 'network',
  Cache = 'cache',                // ★ 新增：缓存命中
  Rebase = 'rebase',              // ★ 新增：重定位命中
  Speculative = 'speculative',     // ★ 新增：投机请求命中
  Diagnostics = 'diagnostics',     // ★ 新增：诊断修复
}

// NextEditResult 扩展（已包含 documentBeforeEdits/editWindow/originalEditWindow）

// NesTriggerReason 无需扩展

// NesCooldownConfig 扩展
export interface NesCooldownConfig {
  rejectionCooldownMs: number;     // 默认 5000
  sameLineCooldownMs: number;      // 默认 5000
  afterChangeLimitMs: number;      // 默认 10000
  /** ★ 新增：选区变更防抖（ms） */
  selectionDebounceMs: number;     // 默认由实验配置决定
}

// ★ 新增：文档快照类型
export interface DocumentSnapshot {
  uri: string;
  content: string;
  languageId: string;
  versionId: number;
}

// ★ 新增：用户编辑记录
export interface UserEditRecord {
  /** 编辑前的文档版本 */
  beforeVersionId: number;
  /** 编辑操作（用于 Rebase） */
  edits: StringEdit[];
  /** 编辑发生时间 */
  timestamp: number;
}

// ★ 新增：StringEdit（用于 Rebase 计算）
export interface StringEdit {
  /** 替换范围（offset） */
  replaceRange: { start: number; end: number };
  /** 新文本 */
  newText: string;
}

// ★ 新增：Rebase 配置
export interface NesRebaseConfig {
  /** 是否吸收子序列输入（如自动补全括号） */
  absorbSubsequenceTyping: boolean;  // 默认 true
  /** Rebase 精度模式 */
  resolution: 'strict' | 'lenient';  // 默认 strict
}

// ★ 新增：诊断 NES 结果
export interface DiagnosticsNextEditResult {
  /** 修复的编辑 */
  edit: NextEditResult | undefined;
  /** 相关的诊断信息 */
  diagnostic: { message: string; severity: number; range: any };
}

// NesResponseFormat 扩展
export enum NesResponseFormat {
  RawText = 'rawText',
  Tagged = 'tagged',              // ★ 新增：<EDIT>/<NO_CHANGE> 标签格式
}

// ★ 新增：NES PromptingStrategy
export enum NesPromptingStrategy {
  Default = 'default',
  Unified = 'unified',
  MiniV3 = 'miniv3',
}

// ★ 新增：缓存编辑条目
export interface CachedEdit {
  /** 缓存的 NES 编辑结果 */
  edit: NextEditResult | undefined;
  /** 编辑前文档内容 */
  documentBeforeEdits: string;
  /** 用户自缓存以来的编辑 */
  userEditSince: StringEdit[];
  /** 是否已被拒绝 */
  rejected: boolean;
  /** 请求 ID */
  headerRequestId: string;
}
```

### 2. FullInlineEditTriggerer — 完整版触发器

```typescript
// === trigger.ts ===（扩展 Plan C）

export class FullInlineEditTriggerer implements IInlineEditTriggerer {
  private consecutiveChangeCount = 0;
  private lastTriggerTime = 0;
  private lastRejectionTime = 0;
  private lastSelectionLine = -1;

  // 完整版增加：
  // - 连续变更计数器（前 2 次立即触发，之后防抖）
  // - 同行冷却检测
  // - 文档切换触发
  // - 防抖延迟

  private _handleSelectionChange(e: any): void {
    const position = e.position;

    // 1. 多选区或非空选区 → 忽略
    if (e.selections.length > 1 || !e.selections[0].isEmpty) return;

    // 2. 拒绝冷却检查
    if (this._isWithinRejectionCooldown()) return;

    // 3. 同行冷却检查
    if (position.lineNumber === this.lastSelectionLine &&
        this._isSameLineCooldownActive()) return;

    // 4. 防抖触发
    this._triggerWithDebounce(NesTriggerReason.SelectionChange);
  }

  private _triggerWithDebounce(reason: NesTriggerReason): void {
    this.consecutiveChangeCount++;
    if (this.consecutiveChangeCount <= 2) {
      // 前 2 次变更立即触发
      this._trigger(reason);
    } else {
      // 后续变更防抖
      const debounceMs = this.config.selectionDebounceMs;
      setTimeout(() => {
        this._trigger(reason);
      }, debounceMs);
    }
  }

  private _isSameLineCooldownActive(): boolean {
    return Date.now() - this.lastTriggerTime < this.config.sameLineCooldownMs;
  }

  // ★ 新增：文档切换触发
  private _maybeTriggerOnDocumentSwitch(): void {
    if (Date.now() - this.lastTriggerTime > this.config.afterChangeLimitMs) return;
    this._trigger(NesTriggerReason.ActiveDocumentSwitch);
  }
}
```

### 3. FullNESPromptBuilder — 完整版 NES Prompt

NES 使用 **Chat 模式**（不同于 Ghost Text 的 Completion 模式），prompt 包含系统提示、编辑历史、多文档上下文等。

```typescript
// === nesPromptBuilder.ts ===（扩展 Plan C）

export class FullNESPromptBuilder implements INESPromptBuilder {
  constructor(
    private strategyRegistry: INesPromptingStrategyRegistry,
    private editHistoryTracker: IEditHistoryTracker,
    private contextProviderRegistry: IContextProviderRegistry,
    private editor: monaco.editor.ICodeEditor,
  ) {}

  buildPrompt(context: NESRequestContext): NESPrompt {
    const strategy = this.strategyRegistry.getStrategy(context.languageId);
    const editHistory = this.editHistoryTracker.getRecentEdits(context.uri);
    const contextItems = this.contextProviderRegistry.resolve(context);

    // 构建编辑上下文
    const promptPieces = this.constructPromptPieces(context, editHistory, contextItems);

    // 选择系统提示
    const systemPrompt = strategy.systemPrompt;

    // 构建用户提示（带标签）
    const userPrompt = this.getUserPrompt(promptPieces, strategy);

    return {
      systemPrompt,
      userPrompt,
      model: strategy.model,
      maxTokens: strategy.maxTokens,
      responseFormat: strategy.responseFormat,
    };
  }

  private constructPromptPieces(
    context: NESRequestContext,
    editHistory: UserEditRecord[],
    contextItems: any,
  ): PromptPieces {
    const model = this.editor.getModel();
    const position = context.position;
    const documentContent = context.documentContent;

    // 计算编辑窗口：光标前后若干行
    const editWindowLines = 30; // 光标前后各 15 行
    const lines = documentContent.split('\n');
    const cursorLine = position.lineNumber - 1;
    const startLine = Math.max(0, cursorLine - editWindowLines / 2);
    const endLine = Math.min(lines.length - 1, cursorLine + editWindowLines / 2);

    // 代码片段（带光标标记）
    const codeSnippet = lines.slice(startLine, endLine + 1).map((line, i) => {
      const lineNo = startLine + i;
      if (lineNo === cursorLine) {
        return line.substring(0, position.column - 1) + '<|cursor|>' + line.substring(position.column - 1);
      }
      return line;
    }).join('\n');

    // 编辑历史 diff
    const editDiff = editHistory.map(edit => {
      return `Edit: replaced [${edit.replaceRange.start}:${edit.replaceRange.end}] with "${edit.newText}"`;
    }).join('\n');

    return {
      codeSnippet,
      editDiff,
      languageId: context.languageId,
      cursorPosition: position,
      contextItems,
    };
  }

  private getUserPrompt(pieces: PromptPieces, strategy: INesPromptingStrategy): string {
    switch (strategy.responseFormat) {
      case NesResponseFormat.Tagged:
        return `<|code_to_edit|>
${pieces.codeSnippet}
<|/code_to_edit|>

Edit history:
${pieces.editDiff || 'No recent edits'}

Predict the next edit. Use <EDIT>old_code</EDIT> <INSERT>new_code</INSERT> or <NO_CHANGE> format.`;

      case NesResponseFormat.RawText:
        return `Current file (${pieces.languageId}):
${pieces.codeSnippet}

Edit history:
${pieces.editDiff || 'No recent edits'}

Predict the next edit. Return the replacement text, or NO_CHANGE.`;
    }
  }
}

interface PromptPieces {
  codeSnippet: string;
  editDiff: string;
  languageId: string;
  cursorPosition: { lineNumber: number; column: number };
  contextItems: any;
}
```

### 4. NESPromptingStrategyRegistry — Prompting 策略

```typescript
// === nesPromptingStrategy.ts ===

export interface INesPromptingStrategy {
  /** 系统提示模板 */
  systemPrompt: string;
  /** 使用的模型 */
  model: string;
  /** 最大输出 token */
  maxTokens: number;
  /** 响应格式 */
  responseFormat: NesResponseFormat;
  /** Prompting 策略 ID */
  strategyId: NesPromptingStrategy;
}

export interface INesPromptingStrategyRegistry {
  /** 获取指定语言的 Prompting 策略 */
  getStrategy(languageId: string): INesPromptingStrategy;
}

export class NesPromptingStrategyRegistry implements INesPromptingStrategyRegistry {
  private strategies: Map<string, INesPromptingStrategy> = new Map();

  constructor() {
    // 默认策略
    this.strategies.set('default', {
      systemPrompt: `You are a code editing assistant. Predict the next edit the user will make.
You receive recently viewed code snippets, the current file content, edit diff history, and the area around the code to edit with a cursor marker.
Respond with <EDIT>old_code</EDIT><INSERT>new_code</INSERT> to suggest an edit, or <NO_CHANGE> if no edit is predicted.`,
      model: 'default',
      maxTokens: 100,
      responseFormat: NesResponseFormat.Tagged,
      strategyId: NesPromptingStrategy.Default,
    });
  }

  getStrategy(languageId: string): INesPromptingStrategy {
    return this.strategies.get(languageId) ?? this.strategies.get('default')!;
  }
}
```

### 5. TaggedResponseParser — 解析标签格式响应

```typescript
// === taggedResponseParser.ts === ★ 新增

export interface INESResponseParser {
  parse(content: string, context: NESRequestContext, documentContent: string): NextEditResult | undefined;
}

export class TaggedResponseParser implements INESResponseParser {
  parse(content: string, context: NESRequestContext, documentContent: string): NextEditResult | undefined {
    // 1. 检查 NO_CHANGE
    if (content.includes('<NO_CHANGE>') || content.trim() === 'NO_CHANGE') {
      return undefined;
    }

    // 2. 解析 <EDIT>old</EDIT> <INSERT>new</INSERT> 格式
    const editMatch = content.match(/<EDIT>([\s\S]*?)<\/EDIT>/);
    const insertMatch = content.match(/<INSERT>([\s\S]*?)<\/INSERT>/);

    if (!insertMatch) {
      // 3. fallback：纯文本模式
      return this.parseRawText(content, context, documentContent);
    }

    const oldCode = editMatch?.[1] ?? '';
    const newCode = insertMatch[1];

    // 4. 在文档中查找 oldCode 的位置
    const position = this.findCodeInDocument(oldCode, documentContent, context.position);
    if (!position) return undefined;

    return {
      targetDocumentId: context.uri,
      edit: {
        replaceRange: position.range,
        newText: newCode,
      },
      requestId: context.requestId,
      source: NextEditSource.Network,
      isFromCursorJump: false,
      editWindow: position.window,
      documentBeforeEdits: documentContent,
    };
  }

  private findCodeInDocument(
    code: string,
    documentContent: string,
    cursorPosition: { lineNumber: number; column: number },
  ): { range: any; window?: { start: number; end: number } } | undefined {
    // 在文档中搜索匹配的代码片段，优先在光标附近查找
    const lines = documentContent.split('\n');
    const cursorLine = cursorPosition.lineNumber - 1;

    // 尝试从光标行附近开始匹配
    for (let offset = 0; offset < Math.min(lines.length, 30); offset++) {
      for (const direction of [0, 1, -1]) {
        const lineIdx = cursorLine + offset * direction;
        if (lineIdx < 0 || lineIdx >= lines.length) continue;

        // 检查从该行开始是否能匹配 oldCode
        // ...具体匹配逻辑
      }
    }
    return undefined;
  }

  private parseRawText(content: string, context: NESRequestContext, documentContent: string): NextEditResult | undefined {
    // 简易版的 fallback 解析逻辑
    // ...
  }
}
```

### 6. NextEditCache — NES 缓存与 Rebase

```typescript
// === nextEditCache.ts === ★ 新增

export interface INextEditCache {
  /** 查找缓存（优先精确匹配，其次 Rebase） */
  lookupNextEdit(
    uri: string,
    documentContent: string,
    position: { lineNumber: number; column: number },
  ): CachedOrRebasedEdit | undefined;

  /** 存缓存 */
  setNextEdit(uri: string, documentContent: string, edit: NextEditResult): void;

  /** 存"无编辑"缓存 */
  setNoNextEdit(uri: string, documentContent: string, requestId: string): void;

  /** 处理用户编辑（组合到 userEditSince） */
  handleEdit(uri: string, edit: StringEdit): void;

  /** 标记拒绝 */
  rejectedNextEdit(headerRequestId: string): void;

  /** 清空 */
  clear(): void;
}

export interface CachedOrRebasedEdit {
  edit: NextEditResult | undefined;
  source: 'cache' | 'rebase';
}

export class NextEditCacheImpl implements INextEditCache {
  /** 每文档缓存 */
  private documentCaches = new Map<string, DocumentEditCache>();
  /** 共享 LRU 缓存 */
  private sharedCache = new LRUCache<CachedEdit>(50);

  lookupNextEdit(
    uri: string,
    documentContent: string,
    position: { lineNumber: number; column: number },
  ): CachedOrRebasedEdit | undefined {
    // 1. 精确匹配：sharedCache 中查找相同文档内容
    //    + 光标在 editWindow 内

    // 2. Rebase：遍历 documentCaches 中 trackedCachedEdits
    //    + 尝试 tryRebase 将旧编辑平移到新位置
    //    + 检查是否曾被拒绝
  }

  handleEdit(uri: string, edit: StringEdit): void {
    const docCache = this.documentCaches.get(uri);
    if (docCache) {
      docCache.handleEdit(edit);
    }
  }
}

class DocumentEditCache {
  private trackedCachedEdits: CachedEdit[] = [];
  private rebaseFailed = false;

  handleEdit(edit: StringEdit): void {
    // 将用户编辑组合到每个 trackedCachedEdit 的 userEditSince 中
    // 检查一致性：不一致则标记 rebaseFailed
  }
}
```

### 7. EditRebase — 编辑重定位

```typescript
// === editRebase.ts === ★ 新增

export interface IEditRebase {
  /**
   * 尝试将缓存的 NES 编辑重定位到当前文档
   * 步骤：
   * 1. 检查编辑一致性（应用 AI 编辑到原始文档 = 当前文档内容）
   * 2. 尝试将编辑平移到新位置
   * 3. 严格模式下二次验证
   */
  tryRebase(
    originalDocument: string,
    editWindow: { start: number; end: number },
    originalEdits: LineReplacement[],
    userEditSince: StringEdit[],
    currentDocumentContent: string,
    currentSelection: { lineNumber: number; column: number },
    config: NesRebaseConfig,
  ): RebaseResult;
}

export type RebaseResult =
  | { status: 'success'; edits: LineReplacement[] }
  | { status: 'inconsistentEdits' }
  | { status: 'outsideEditWindow' }
  | { status: 'rebaseFailed' }
  | { status: 'error'; message: string };

export class EditRebaseImpl implements IEditRebase {
  tryRebase(
    originalDocument: string,
    editWindow: { start: number; end: number },
    originalEdits: LineReplacement[],
    userEditSince: StringEdit[],
    currentDocumentContent: string,
    currentSelection: { lineNumber: number; column: number },
    config: NesRebaseConfig,
  ): RebaseResult {
    try {
      // 1. 一致性检查
      const composedEdit = composeStringEdits(userEditSince);
      const resultAfterUserEdit = composedEdit.apply(originalDocument);
      if (resultAfterUserEdit !== currentDocumentContent) {
        return { status: 'inconsistentEdits' };
      }

      // 2. 光标在编辑窗口外
      const cursorOffset = this.lineColToOffset(currentDocumentContent, currentSelection);
      if (cursorOffset < editWindow.start || cursorOffset > editWindow.end) {
        return { status: 'outsideEditWindow' };
      }

      // 3. 尝试交织用户编辑和 AI 编辑
      const rebasedEdits = tryRebaseEdits(
        composedEdit, originalEdits, config.absorbSubsequenceTyping,
      );
      if (!rebasedEdits) {
        return { status: 'rebaseFailed' };
      }

      // 4. 严格模式验证
      if (config.resolution === 'strict') {
        const originalResult = applyEdits(originalEdits, originalDocument);
        const rebasedResult = applyEdits(rebasedEdits, currentDocumentContent);
        if (originalResult !== rebasedResult) {
          return { status: 'inconsistentEdits' };
        }
      }

      return { status: 'success', edits: rebasedEdits };
    } catch (e) {
      return { status: 'error', message: String(e) };
    }
  }
}

/**
 * agreementIndexOf — 判断用户输入是否与 AI 建议一致
 * 返回匹配字符数，用于决定是否"吸收"用户输入
 */
function agreementIndexOf(
  suggestion: string,
  typed: string,
  offset: number,
  maxOffset: number = 10,
): number | undefined {
  const strictIdx = suggestion.indexOf(typed, offset);
  if (strictIdx !== -1 && strictIdx - offset <= maxOffset) {
    return strictIdx;
  }
  // fallback: subword 匹配（自动补全括号等）
  // ...
  return undefined;
}
```

### 8. SpeculativeRequestManager — NES 投机请求

```typescript
// === speculativeRequest.ts === ★ 新增

export interface ISpeculativeRequestManager {
  /** 在建议显示时触发投机请求 */
  handleShown(suggestion: NextEditResult): void;

  /** 在用户接受时检查投机请求是否命中 */
  checkSpeculativeMatch(
    uri: string,
    documentContent: string,
    position: { lineNumber: number; column: number },
  ): NextEditResult | undefined;

  /** 取消投机请求 */
  cancelSpeculativeRequest(): void;
}

export class SpeculativeRequestManager implements ISpeculativeRequestManager {
  private pendingSpeculativeRequest: NextEditResult | undefined;
  private postEditDocumentContent: string | undefined;
  private postEditPosition: { lineNumber: number; column: number } | undefined;

  handleShown(suggestion: NextEditResult): void {
    // 1. 计算假设接受后的文档状态
    const postEditContent = this.applyEdit(suggestion);
    const postEditCursor = this.computePostEditCursor(suggestion);

    // 2. 检查缓存是否已有该状态的编辑
    const cached = this.cache.lookupNextEdit(
      suggestion.targetDocumentId, postEditContent, postEditCursor,
    );
    if (cached) return; // 已有缓存

    // 3. 缓存投机请求结果位置
    this.postEditDocumentContent = postEditContent;
    this.postEditPosition = postEditCursor;

    // 4. 后台发起投机请求
    this._triggerSpeculativeRequest(suggestion, postEditContent, postEditCursor);
  }

  private applyEdit(suggestion: NextEditResult): string {
    // 将 suggestion.edit 应用到当前文档，得到接受后的文档内容
    // ...
  }

  private computePostEditCursor(suggestion: NextEditResult): { lineNumber: number; column: number } {
    // 计算接受后的光标位置（在插入文本末尾）
    // ...
  }
}
```

### 9. DiagnosticsNextEditProvider — 诊断修复 NES

```typescript
// === diagnosticsNesProvider.ts === ★ 新增

export interface IDiagnosticsNextEditProvider {
  /**
   * 阻塞等待直到有诊断修复可用
   * 不支持 getNextEdit()，只支持 runUntilNextEdit()
   */
  runUntilNextEdit(
    uri: string,
    languageId: string,
    delayStart: number,
    cancellationToken: CancellationToken,
  ): Promise<DiagnosticsNextEditResult | undefined>;

  handleAcceptance(item: any): void;
  handleRejection(item: any): void;
}

export class DiagnosticsNextEditProviderImpl implements IDiagnosticsNextEditProvider {
  constructor(
    private diagnosticSource: IDiagnosticSource,
  ) {}

  async runUntilNextEdit(
    uri: string,
    languageId: string,
    delayStart: number,
    cancellationToken: CancellationToken,
  ): Promise<DiagnosticsNextEditResult | undefined> {
    // 1. 延迟启动
    await delay(delayStart);

    // 2. 获取当前诊断
    const diagnostics = this.diagnosticSource.getDiagnostics(uri, languageId);
    if (diagnostics.length === 0) return undefined;

    // 3. 按严重程度排序（Error > Warning > Info）
    const sorted = diagnostics.sort((a, b) => a.severity - b.severity);

    // 4. 对最高优先级的诊断生成修复建议
    const fix = this.generateFix(sorted[0]);
    if (!fix) return undefined;

    return {
      edit: fix,
      diagnostic: sorted[0],
    };
  }

  private generateFix(diagnostic: any): NextEditResult | undefined {
    // 根据诊断类型生成修复（如 import 错误 → 添加 import 语句）
    // 简化版：只处理最常见的几种模式
    // ...
  }
}
```

### 10. NESAICompletionClient — 流式 LLM 调用

```typescript
// === nesLlmClient.ts ===（扩展 Plan C）

export interface INESAICompletionClient {
  requestNextEdit(prompt: NESPrompt, context: NESRequestContext): Promise<NextEditResult | undefined>;
  /** ★ 新增：流式请求 */
  requestNextEditStreaming(
    prompt: NESPrompt,
    context: NESRequestContext,
  ): Promise<{ firstEdit: NextEditResult | undefined; backgroundDone: Promise<void> }>;
  cancelRequest(requestId: string): void;
}

export class StreamedNESAICompletionClient implements INESAICompletionClient {
  // Chat API 流式实现
  // 等待第一个 SSE chunk 解析出 <EDIT> 或 <NO_CHANGE>
  // 后续 chunks 在后台处理
}
```

### 11. EditHistoryTracker — 编辑历史追踪

```typescript
// === editHistoryTracker.ts === ★ 新增

export interface IEditHistoryTracker {
  /** 记录用户编辑 */
  recordEdit(uri: string, edit: StringEdit): void;

  /** 获取指定文档的最近编辑历史 */
  getRecentEdits(uri: string): UserEditRecord[];

  /** 清空 */
  clear(): void;
}

export class EditHistoryTracker implements IEditHistoryTracker {
  private history = new Map<string, UserEditRecord[]>();
  private maxRecordsPerDoc = 20;  // 最多保留 20 条编辑记录

  recordEdit(uri: string, edit: StringEdit): void {
    let records = this.history.get(uri);
    if (!records) {
      records = [];
      this.history.set(uri, records);
    }
    records.push({
      beforeVersionId: 0,
      edits: [edit],
      timestamp: Date.now(),
    });
    if (records.length > this.maxRecordsPerDoc) {
      records.shift();
    }
  }
}
```

### 12. FullNESController — 完整版编排

```typescript
// === nesController.ts ===（扩展 Plan C）

export class FullNESController implements INESController {
  private pendingRequest: any | undefined;
  private lastRejectionTime = 0;

  constructor(
    private promptBuilder: INESPromptBuilder,
    private aiCompletionClient: INESAICompletionClient,
    private responseParser: INESResponseParser,
    private triggerer: IInlineEditTriggerer,
    private cache: INextEditCache,
    private rebase: IEditRebase,
    private speculativeManager: ISpeculativeRequestManager,
    private diagnosticsProvider: IDiagnosticsNextEditProvider,
    private editHistoryTracker: IEditHistoryTracker,
    private telemetryEmitter: INesTelemetryEmitter,
    private editor: monaco.editor.ICodeEditor,
  ) {}

  async getNextEdit(context: NESRequestContext): Promise<InlineSuggestionEdit | undefined> {
    const model = this.editor.getModel();
    const documentContent = model.getValue();
    const position = context.position;

    // ① Cache → 0ms
    const cached = this.cache.lookupNextEdit(context.uri, documentContent, position);
    if (cached && cached.edit && !this._isRejected(cached.edit.requestId)) {
      return this.convertToInlineSuggestion(cached.edit, context, documentContent,
        cached.source === 'rebase' ? NextEditSource.Rebase : NextEditSource.Cache);
    }

    // ② Speculative match → 0ms
    const speculative = this.speculativeManager.checkSpeculativeMatch(
      context.uri, documentContent, position);
    if (speculative) {
      return this.convertToInlineSuggestion(speculative, context, documentContent,
        NextEditSource.Speculative);
    }

    // ③ Pending request reuse → ≤200ms
    if (this.pendingRequest && this._canReusePendingRequest(context)) {
      const result = await this._waitForPendingRequest(200);
      if (result) return this.convertToInlineSuggestion(result, context, documentContent, NextEditSource.Network);
    }

    // ④ Network request（与 Diagnostics 竞速）
    const [llmResult, diagResult] = await this._raceWithDiagnostics(context, documentContent);

    // 优先使用 LLM 结果
    const edit = llmResult ?? diagResult?.edit;
    if (!edit) return undefined;

    // ⑤ 缓存结果
    this.cache.setNextEdit(context.uri, documentContent, edit);

    // ⑥ 转换为 inline suggestion
    return this.convertToInlineSuggestion(edit, context, documentContent, edit.source);
  }

  private async _raceWithDiagnostics(
    context: NESRequestContext,
    documentContent: string,
  ): Promise<[NextEditResult | undefined, DiagnosticsNextEditResult | undefined]> {
    const prompt = this.promptBuilder.buildPrompt(context);
    const llmPromise = this.aiCompletionClient.requestNextEdit(prompt, context);
    const diagPromise = this.diagnosticsProvider.runUntilNextEdit(
      context.uri, context.languageId, 50, undefined,
    );

    // raceAndAll：两个都完成才返回
    const [llmResult, diagResult] = await raceAndAll(llmPromise, diagPromise);
    return [llmResult ?? undefined, diagResult ?? undefined];
  }

  handleLifecycle(editId: string, kind: NesLifecycleKind): void {
    switch (kind) {
      case NesLifecycleKind.Shown:
        this.speculativeManager.handleShown(this._getLastSuggestion());
        break;
      case NesLifecycleKind.Accepted:
        this.speculativeManager.checkSpeculativeMatch('', '', { lineNumber: 0, column: 0 });
        this.telemetryEmitter.emit({ eventType: 'nes.accepted', ... });
        break;
      case NesLifecycleKind.Rejected:
        this.lastRejectionTime = Date.now();
        this.triggerer.handleRejection();
        this.cache.rejectedNextEdit(editId);
        this.speculativeManager.cancelSpeculativeRequest();
        this.telemetryEmitter.emit({ eventType: 'nes.rejected', ... });
        break;
    }
  }
}
```

### 13. raceAndAll — 竞速工具

```typescript
// === raceAndAll.ts === ★ 新增

async function raceAndAll<T1, T2>(
  p1: Promise<T1>,
  p2: Promise<T2>,
): Promise<[T1 | undefined, T2 | undefined]> {
  const results: [T1 | undefined, T2 | undefined] = [undefined, undefined];
  let settled = 0;

  return new Promise(resolve => {
    p1.then(r => { results[0] = r; settled++; if (settled === 2) resolve(results); })
      .catch(() => { settled++; if (settled === 2) resolve(results); });
    p2.then(r => { results[1] = r; settled++; if (settled === 2) resolve(results); })
      .catch(() => { settled++; if (settled === 2) resolve(results); });
  });
}
```

### 14. FullNESMonacoAdapter — Monaco 适配

```typescript
// === nesMonacoAdapter.ts ===（扩展 Plan C）

export class FullNESMonacoInlineCompletionsProvider implements monaco.languages.InlineCompletionsProvider {
  // 与简易版相同的基础逻辑
  // ★ 新增：
  // - handleDidShow → 触发投机请求
  // - handleEndOfLifetime → 区分 accept/reject/ignore → 冷却/缓存/遥测
  // - freeInlineCompletions → 批量遥测发送
  // - 用户编辑时更新 editHistoryTracker + cache.handleEdit
}
```

## 完整版新增功能对照

| Plan C 简易版 | Plan D 完整版 | 对应文档 |
|---------------|--------------|----------|
| 简易触发器（拒绝冷却） | 完整版触发器（防抖+同行冷却+文档切换+连续计数器） | 05-nes |
| `SimpleNESPromptBuilder` → 基础 Chat prompt | `FullNESPromptBuilder` → Tagged 格式+编辑历史+上下文 | S01 |
| `NesResponseFormat.RawText` | `NesResponseFormat.Tagged` + `TaggedResponseParser` | 05-nes |
| `SimpleNESAICompletionClient` → 同步 Chat | `StreamedNESAICompletionClient` → 流式 SSE | S02 |
| 无缓存 | `NextEditCacheImpl` → per-doc + shared LRU(50) | 07-caching |
| 无 Rebase | `EditRebaseImpl` → tryRebase + agreementIndexOf | 07-caching |
| 无投机请求 | `SpeculativeRequestManager` → 显示时预计算 | 07-caching |
| 无请求复用 | pendingRequest reuse + 光标在 editWindow 内 | 07-caching |
| 无诊断 NES | `DiagnosticsNextEditProviderImpl` → raceAndAll 竞速 | 05-nes |
| 无编辑历史 | `EditHistoryTracker` → 最多 20 条/文档 | S01 |
| Console 遥测 | 批量 + idle + Survival Rate | 08-telemetry |

## 实现步骤

### Phase 1：核心骨架（从简易版升级）

1. **扩展 types.ts** — 添加所有新增类型（CachedEdit, StringEdit, UserEditRecord, RebaseResult 等）
2. **升级 Triggerer** — 添加防抖、同行冷却、连续变更计数器、文档切换触发
3. **升级 NESPromptBuilder** — 支持 Tagged 格式、编辑历史、多文档上下文
4. **实现 TaggedResponseParser** — 解析 `<EDIT>/<INSERT>/<NO_CHANGE>` 标签
5. **升级 NESAICompletionClient** — Chat API 流式返回

### Phase 2：缓存与速度优化

6. **实现 NextEditCache** — per-doc cache + shared LRU(50)
7. **实现 EditRebase** — tryRebase + tryRebaseEdits + agreementIndexOf
8. **实现 SpeculativeRequestManager** — 显示时预计算接受后状态
9. **实现 EditHistoryTracker** — 记录并查询最近编辑
10. **升级 NESController** — 缓存/Rebase/投机/请求复用优先级链

### Phase 3：诊断 NES 竞速

11. **实现 DiagnosticsNextEditProvider** — 获取诊断、生成修复
12. **实现 raceAndAll** — 竞速工具函数
13. **升级 NESController** — LLM vs Diagnostics 竞速逻辑

### Phase 4：遥测与质量评估

14. **升级 TelemetryEmitter** — 批量发送 + idle 检测
15. **实现 Survival Rate Tracker** — 接受后延迟测量编辑保留率

### Phase 5：集成与生命周期

16. **升级 NESMonacoAdapter** — handleDidShow(投机)、handleEndOfLifetime(冷却+缓存+遥测)
17. **注册编辑变更处理** — editHistoryTracker.recordEdit + cache.handleEdit

## 文件结构

```
src/
  nes/
    types.ts                              核心类型定义（全部扩展）
    trigger/
      triggerer.ts                        IInlineEditTriggerer + FullInlineEditTriggerer
      nesTriggerHint.ts                   NesChangeHint / NesTriggerReason 定义
    prompt/
      nesPromptBuilder.ts                 INESPromptBuilder + FullNESPromptBuilder
      nesPromptingStrategy.ts             INesPromptingStrategy + Registry
      promptPieces.ts                     PromptPieces 构造
      systemMessages.ts                   各策略的 system prompt 模板
    response/
      taggedResponseParser.ts             INESResponseParser + TaggedResponseParser
    llm/
      nesLlmClient.ts                     INESAICompletionClient + StreamedNESAICompletionClient
    cache/
      nextEditCache.ts                    INextEditCache + NextEditCacheImpl
      documentEditCache.ts                DocumentEditCache
      editRebase.ts                       IEditRebase + EditRebaseImpl
      agreementIndexOf.ts                 agreementIndexOf 函数
      raceAndAll.ts                       raceAndAll 竞速工具
    speculative/
      speculativeRequestManager.ts        ISpeculativeRequestManager + SpeculativeRequestManager
    diagnostics/
      diagnosticsNesProvider.ts           IDiagnosticsNextEditProvider + DiagnosticsNextEditProviderImpl
      diagnosticSource.ts                 IDiagnosticSource
    history/
      editHistoryTracker.ts               IEditHistoryTracker + EditHistoryTracker
    convert/
      toInlineSuggestion.ts              toInlineSuggestion() + isSubword
    controller/
      nesController.ts                    INESController + FullNESController
    adapter/
      nesMonacoAdapter.ts                FullNESMonacoInlineCompletionsProvider
    telemetry/
      telemetryEmitter.ts                INesTelemetryEmitter + FullNesTelemetryEmitter
      survivalRateTracker.ts             Survival Rate 追踪
    setup.ts                              setupNES() 入口
```

## 从简易版到完整版的升级路径

与 Ghost Text 相同原则：**不修改已有接口的方法签名，通过枚举扩展和新增接口/方法添加功能**。

| 升级点 | 简易版状态 | 完整版如何扩展 |
|--------|-----------|--------------|
| `NextEditSource` | 只有 `Network` | 新增 `Cache`, `Rebase`, `Speculative`, `Diagnostics` |
| `NesCooldownConfig` | 只有冷却时间 | 新增 `selectionDebounceMs` |
| `NesResponseFormat` | 只有 `RawText` | 新增 `Tagged` |
| `INESPromptBuilder.buildPrompt()` | 简易 Chat prompt | 返回类型兼容，内部扩展 |
| `INESAICompletionClient` | `requestNextEdit()` | 新增 `requestNextEditStreaming()` 方法 |
| `INESController.getNextEdit()` | 简易版编排 | 内部增加缓存/Rebase/投机链（签名不变） |
| `IInlineEditTriggerer` | 拒绝冷却 | 内部增加防抖+同行冷却（签名不变） |

## 与 Ghost Text 完整版的关系

NES 和 Ghost Text 是**两个独立系统**，各自有自己的：
- Prompt 构建逻辑（NES 用 Chat 模式，Ghost Text 用 Completion/FIM 模式）
- 缓存体系（NES 用 per-doc cache + Rebase，Ghost Text 用 Radix Trie）
- 触发机制（NES 由 InlineEditTriggerer 驱动，Ghost Text 由 VS Code 自动触发）
- 后处理（NES 用 toInlineSuggestion 转换，Ghost Text 用 makeGhostAPIChoice 裁剪）

如果需要融合两者（像 Copilot 的 JointCompletionsProvider），需要在上层实现联合提供者——根据光标位置决定走 Ghost Text 还是 NES 路径。这是后续扩展方向。