# Plan B：完整版 — Monaco Editor Inline AI 补全

## 目标

基于 Copilot 的完整架构实现 Ghost Text inline 补全，涵盖上下文获取、FIM prompt 构建、多行补全策略、缓存优化、速度保障、后处理裁剪、遥测体系等所有核心功能。不包含 NES 行中编辑和 JointProvider 融合。

## 架构总览

```
┌─────────────────────────────────────────────────────────────────┐
│                        Monaco Editor                             │
│  ┌─────────────────────────────────────────────────────────┐    │
│  │            MonacoInlineCompletionsProvider                │    │
│  │  (registerInlineCompletions → 行尾触发 → 返回补全列表)     │    │
│  └──────────────────────────┬──────────────────────────────┘    │
│                             │                                    │
│  ┌──────────────────────────▼──────────────────────────────┐    │
│  │              GhostTextController                         │    │
│  │  ┌──────────────────────────────────────────────────┐   │    │
│  │  │ getCompletions():                                 │   │    │
│  │  │   ① TypingAsSuggested → 本地返回(0ms)            │   │    │
│  │  │   ② Cache (Radix Trie) → 本地返回(0ms)           │   │    │
│  │  │   ③ AsyncManager → 复用进行中请求(≤200ms)        │   │    │
│  │  │   ④ Debounce → 等待防抖                           │   │    │
│  │  │   ⑤ Network → 流式返回首个token                   │   │    │
│  │  └──────────────────────────────────────────────────┘   │    │
│  └──────────────────────────┬──────────────────────────────┘    │
│                             │                                    │
│    ┌────────────┬───────────┼───────────┬──────────────────┐    │
│    │            │           │           │                  │    │
│  ┌─▼──────┐ ┌──▼───────┐ ┌─▼────────┐ ┌▼──────────────┐ ┌─▼───────────┐
│  │Prompt  │ │  LLM     │ │ Post     │ │ Strategy      │ │ Telemetry   │
│  │Factory │ │  Client  │ │ Process  │ │ (multiline    │ │ (full       │
│  │(FIM+   │ │(stream+  │ │(dedup+   │ │  decision)    │ │  lifecycle) │
│  │ context│ │  cache)  │ │  trim)   │ │               │ │             │
│  └────────┘ └──────────┘ └──────────┘ └───────────────┘ └─────────────┘
│                                                                 │
│    ┌────────────┬───────────┐                                   │
│    │            │           │                                   │
│  ┌─▼──────┐ ┌──▼───────┐                                      │
│  │Cache   │ │ Current  │                                      │
│  │(LRU    │ │ GhostText│                                      │
│  │ Radix) │ │(typing)  │                                      │
│  └────────┘ └──────────┘                                      │
└─────────────────────────────────────────────────────────────────┘
```

## 模块划分与接口定义

接口沿用 Plan A 简易版的定义，在完整版中扩展已有接口而非修改。新增的接口和扩展如下。

### 1. 核心类型扩展

```typescript
// === types.ts ===（扩展 Plan A 的定义）

// CompletionSource 扩展
export enum CompletionSource {
  Network = 'network',
  Cache = 'cache',                     // ★ 新增
  TypingAsSuggested = 'typingAsSuggested', // ★ 新增
  Speculative = 'speculative',          // ★ 新增
  Async = 'async',                      // ★ 新增
}

// CompletionStrategy 扩展
export interface CompletionStrategy {
  requestMultiline: boolean;
  blockMode: BlockMode;                 // 简易版只有 Server，完整版有全部
  stopTokens: string[];
  maxTokens: number;
  finishedCb?: FinishedCallback;        // ★ 新增：流式终止回调
  lookAhead?: number;                   // ★ 新增：MoreMultiline 的前瞻行数
  blockPosition?: BlockPositionType;    // ★ 新增：光标在块中的位置类型
}

// BlockMode 扩展
export enum BlockMode {
  Server = 'server',
  Parsing = 'parsing',                  // ★ 新增
  ParsingAndServer = 'parsingandserver', // ★ 新增
  MoreMultiline = 'moremultiline',       // ★ 新增
}

// BlockPositionType ★ 新增
export enum BlockPositionType {
  NonBlock = 'non-block',
  EmptyBlock = 'empty-block',
  BlockEnd = 'block-end',
  MidBlock = 'mid-block',
}

// FinishedCallback ★ 新增
export type FinishedCallback = (text: string) => number | undefined;

// PromptInfo 扩展
export interface PromptInfo {
  prefix: string;
  suffix: string;                        // ★ 简易版为空，完整版启用
  context: string[];                     // ★ 简易版为空，完整版填充
  prefixTokens?: number;
  suffixTokens?: number;
  isFimEnabled: boolean;                 // ★ 简易版 false，完整版根据 suffix 判断
  trailingWs?: string;                   // ★ 新增：尾部空白用于位置调整
  neighborSource?: Map<NeighboringFileType, string[]>; // ★ 新增
}

// NeighboringFileType ★ 新增
export enum NeighboringFileType {
  None = 'none',
  OpenTabs = 'opentabs',
  CursorMostRecent = 'cursormostrecent',
  WorkspaceSharingSameFolder = 'workspacesharingsamefolder',
  WorkspaceSmallestPathDist = 'workspacesmallestpathdist',
}

// Token 预算分配 ★ 新增
export interface PromptAllocation {
  prefix: number;      // 默认 35%
  suffix: number;      // 默认 15%
  stableContext: number; // 默认 35%
  volatileContext: number; // 默认 15%
}

// 多行判定结果 ★ 新增
export interface MultilineDetermination {
  requestMultiline: boolean;
  blockPosition?: BlockPositionType;
}
```

### 2. PromptFactory — 级联预算 Prompt 构建

```typescript
// === promptFactory.ts ===

export interface IPromptFactory {
  /**
   * 构建 Prompt（包含 prefix + suffix + 上下文）
   * 按级联预算分配渲染各组件，溢出预算传递到下一组件
   */
  buildPrompt(context: CompletionRequestContext): Promise<PromptInfo>;

  /** 获取 token 预算分配比例 */
  getAllocation(): PromptAllocation;

  /** 最大 prompt 长度（token 数） */
  getMaxPromptLength(): number;
}

export class CascadingPromptFactory implements IPromptFactory {
  private allocation: PromptAllocation = {
    prefix: 35, suffix: 15, stableContext: 35, volatileContext: 15,
  };

  constructor(
    private components: Record<string, IPromptComponent>,
    private contextProviderRegistry: IContextProviderRegistry,
    private editor: monaco.editor.ICodeEditor,
  ) {}

  async buildPrompt(context: CompletionRequestContext): Promise<PromptInfo> {
    const maxPromptLength = this.getMaxPromptLength();
    const allocation = this.getAllocation();

    // 1. 解析外部上下文（traits, codeSnippets, diagnostics）
    const contextItems = await this.contextProviderRegistry.resolve(context);

    // 2. 确定级联顺序
    const suffixAllocation = (allocation.suffix / 100) * maxPromptLength;
    const estimatedMaxSuffixCost = this.components.suffix.estimatedCost?.(context);
    const cascadeOrder = suffixAllocation > 0.8 * (estimatedMaxSuffixCost ?? 0)
      ? ['stableContext', 'volatileContext', 'suffix', 'prefix']
      : ['stableContext', 'volatileContext', 'prefix', 'suffix'];

    // 3. 级联渲染
    let surplusBudget = 0;
    const rendered: Record<string, { text: string; cost: number }> = {};
    for (const id of cascadeOrder) {
      const componentBudget = surplusBudget + maxPromptLength * (allocation[id] / 100);
      const result = this.components[id].render(componentBudget, context, contextItems);
      surplusBudget = componentBudget - result.cost;
      rendered[id] = result;
    }

    // 4. 分离尾部空白
    const [prefix, trailingWs] = trimLastLine(rendered.prefix.text);

    return {
      prefix,
      suffix: rendered.suffix.text,
      context: [
        rendered.stableContext.text.trim(),
        rendered.volatileContext.text.trim(),
      ],
      prefixTokens: rendered.prefix.cost + rendered.stableContext.cost + rendered.volatileContext.cost,
      suffixTokens: rendered.suffix.cost,
      isFimEnabled: rendered.suffix.text.length > 0,
      trailingWs,
    };
  }
}
```

### 3. Prompt 组件接口

```typescript
// === promptComponents.ts ===

export interface IPromptComponent {
  /** 渲染组件文本，受 token 预算限制 */
  render(budget: number, context: CompletionRequestContext, items?: ResolvedContextItems): { text: string; cost: number };

  /** 估算该组件在给定上下文下的 token 成本 */
  estimatedCost?(context: CompletionRequestContext, items?: ResolvedContextItems): number;
}

// 具体组件实现类：
// - DocumentPrefixComponent   → 光标前内容
// - DocumentSuffixComponent   → 光标后内容（带 suffix 缓存匹配）
// - DocumentMarkerComponent   → 文件路径/语言标记
// - TraitsComponent           → key-value 元数据
// - DiagnosticsComponent      → 文件诊断信息
// - CodeSnippetsComponent     → Context Provider 代码片段
// - SimilarFilesComponent     → 邻近文件相似片段
// - RecentEditsComponent      → 最近编辑 diff 摘要
```

### 4. StrategyManager — 多行判定

```typescript
// === strategyManager.ts ===

export interface IStrategyManager {
  /**
   * 根据上下文判定是否请求多行补全，返回策略
   * 决策链：文件长度 → BlockMode → 新行检测 → AST空块 → ML评分
   */
  determineStrategy(
    context: CompletionRequestContext,
    prompt: PromptInfo,
    hasAcceptedCurrent: boolean,
  ): Promise<CompletionStrategy>;
}

export class FullStrategyManager implements IStrategyManager {
  constructor(
    private blockTrimmerRegistry: IBlockTrimmerRegistry,
    private multilineModel: IMultilineModel,
    private editor: monaco.editor.ICodeEditor,
  ) {}

  async determineStrategy(
    context: CompletionRequestContext,
    prompt: PromptInfo,
    hasAcceptedCurrent: boolean,
  ): Promise<CompletionStrategy> {
    const model = this.editor.getModel();
    const document = model.getValue();
    const lineCount = document.split('\n').length;
    const position = context.position;
    const languageId = context.languageId;
    const blockMode = this.getBlockModeForLanguage(languageId);

    // 1. 文件长度限制
    if (lineCount >= 8000) {
      return this.singleLineStrategy(blockMode);
    }

    // 2. MoreMultiline 特殊规则：仅接受后触发
    if (blockMode === BlockMode.MoreMultiline && this.blockTrimmerRegistry.isSupported(languageId)) {
      if (!hasAcceptedCurrent) {
        return this.singleLineStrategy(blockMode);
      }
      const blockPosition = await this.blockTrimmerRegistry.getBlockPositionType(document, position);
      return this.multilineStrategy(blockMode, blockPosition);
    }

    // 3. 新行起始检测（TypeScript）
    if (['typescript', 'typescriptreact'].includes(languageId)) {
      const line = model.getLineContent(position.lineNumber);
      if (line.trim().length === 0) {
        return this.multilineStrategy(blockMode);
      }
    }

    // 4. AST 空块检测
    let requestMultiline = false;
    if (this.blockTrimmerRegistry.isSupported(languageId)) {
      requestMultiline = await this.blockTrimmerRegistry.isEmptyBlockStart(document, position);
    }

    // 5. ML 评分（JavaScript/Python）
    if (!requestMultiline && ['javascript', 'python'].includes(languageId)) {
      const score = this.multilineModel.score(prompt, languageId);
      requestMultiline = score > 0.5;
    }

    // 6. 接受后强制多行
    if (hasAcceptedCurrent && !requestMultiline) {
      return this.afterAcceptStrategy(blockMode);
    }

    if (requestMultiline) {
      return this.multilineStrategy(blockMode);
    }
    return this.singleLineStrategy(blockMode);
  }

  private singleLineStrategy(blockMode: BlockMode): CompletionStrategy {
    return {
      requestMultiline: false,
      blockMode,
      stopTokens: ['\n'],
      maxTokens: 20,
    };
  }

  private multilineStrategy(blockMode: BlockMode, blockPosition?: BlockPositionType): CompletionStrategy {
    let finishedCb: FinishedCallback | undefined;
    let lookAhead: number | undefined;

    if (blockMode === BlockMode.MoreMultiline) {
      lookAhead = blockPosition === BlockPositionType.EmptyBlock || blockPosition === BlockPositionType.BlockEnd
        ? 7 : 3;
      // finishedCb 由 StreamedCompletionSplitter 在请求时创建
    } else if (blockMode === BlockMode.Parsing || blockMode === BlockMode.ParsingAndServer) {
      finishedCb = this.blockTrimmerRegistry.parsingBlockFinished;
    }

    return {
      requestMultiline: true,
      blockMode,
      stopTokens: [],
      maxTokens: blockMode === BlockMode.MoreMultiline ? 150 : undefined,
      finishedCb,
      lookAhead,
      blockPosition,
    };
  }

  private afterAcceptStrategy(blockMode: BlockMode): CompletionStrategy {
    const multilineAfterAcceptLines = 1;
    return {
      requestMultiline: true,
      blockMode: BlockMode.Parsing,
      stopTokens: ['\n\n'],
      maxTokens: 20 * multilineAfterAcceptLines,
      finishedCb: takeNLines(multilineAfterAcceptLines),
    };
  }
}

function takeNLines(n: number): FinishedCallback {
  return (text: string): number | undefined => {
    const lines = text.split('\n');
    if (lines.length > n + 1) {
      return lines.slice(0, n + 1).join('\n').length;
    }
  };
}
```

### 5. StreamedLLMClient — 流式 LLM 调用

```typescript
// === llmClient.ts ===（扩展 Plan A）

export interface ILLMClient {
  requestCompletion(
    prompt: PromptInfo,
    strategy: CompletionStrategy,
    context: CompletionRequestContext,
  ): Promise<CompletionResult[]>;

  /**
   * ★ 新增：流式请求，只等首个 token 就返回
   * 后续 choices 在后台缓存
   */
  requestCompletionStreaming(
    prompt: PromptInfo,
    strategy: CompletionStrategy,
    context: CompletionRequestContext,
  ): Promise<{ firstResult: CompletionResult; backgroundCache: Promise<void> }>;

  cancelRequest(requestId: string): void;
}

export class StreamedLLMClient implements ILLMClient {
  // ... 流式实现
  // 等待第一个 SSE chunk 后立即返回
  // 后续 chunks 在后台处理并缓存
}
```

### 6. CompletionsCache — LRU Radix Trie 缓存

```typescript
// === completionsCache.ts ===

export interface ICompletionsCache {
  /** 前缀匹配查找缓存 */
  findAll(prefix: string, suffix: string): CompletionResult[];

  /** 添加到缓存 */
  append(prefix: string, suffix: string, result: CompletionResult): void;

  /** 清空缓存 */
  clear(): void;
}

export class LRURadixTrieCache implements ICompletionsCache {
  private cache = new LRURadixTrie<CacheEntry>(100);

  findAll(prefix: string, suffix: string): CompletionResult[] {
    return this.cache.findAll(prefix).flatMap(({ remainingKey, value }) =>
      value.entries
        .filter(e => e.suffix === suffix && e.insertText.startsWith(remainingKey) && e.insertText.length > remainingKey.length)
        .map(e => ({
          ...e,
          insertText: e.insertText.slice(remainingKey.length),
        }))
    );
  }
}
```

### 7. CurrentGhostText — Typing-as-Suggested

```typescript
// === currentGhostText.ts ===

export interface ICurrentGhostText {
  /** 设置当前显示的补全 */
  setCurrent(prefix: string, suffix: string, choices: CompletionResult[]): void;

  /** 检查用户输入是否与补全匹配，返回调整后的补全 */
  getCompletionsForUserTyping(prefix: string, suffix: string): CompletionResult[] | undefined;

  /** 清除当前补全 */
  clear(): void;

  /** 检查当前补全是否已被完整接受 */
  hasAcceptedCurrentCompletion(prefix: string, suffix: string): boolean;
}
```

### 8. SpeculativeRequestCache — 投机请求

```typescript
// === speculativeRequestCache.ts ===

export interface ISpeculativeRequestCache {
  /** 在补全显示时缓存投机请求函数 */
  set(completionId: string, requestFn: () => Promise<CompletionResult[]>): void;

  /** 在用户接受时执行投机请求 */
  request(completionId: string): Promise<void>;

  /** 清空 */
  clear(): void;
}
```

### 9. PostProcessor — 完整版后处理

```typescript
// === postProcessor.ts ===（扩展 Plan A）

export class FullPostProcessor implements IPostProcessor {
  constructor(private blockTrimmerRegistry: IBlockTrimmerRegistry) {}

  process(
    result: CompletionResult,
    documentContent: string,
    position: { lineNumber: number; column: number },
    strategy: CompletionStrategy,
  ): CompletionResult | undefined {
    // 1. trimEnd
    const trimmed = result.insertText.trimEnd();
    if (!trimmed) return undefined;

    // 2. 重复检测（isRepetitive）
    if (this.isRepetitive(result)) return undefined;

    // 3. 下一行匹配检测（MoreMultiline 时不过 trim）
    if (this.matchesNextLine(documentContent, position, trimmed,
        strategy.blockMode !== BlockMode.MoreMultiline)) {
      return undefined;
    }

    // 4. MaybeSnip — 移除重复闭合行
    const snipped = this.maybeSnipCompletion(documentContent, position, trimmed);

    // 5. 单行强制裁剪
    if (!strategy.requestMultiline) {
      return this.forceSingleLine(result, snipped);
    }

    return { ...result, insertText: snipped };
  }

  private forceSingleLine(original: CompletionResult, text: string): CompletionResult {
    const initialLineBreak = text.match(/^\r?\n/);
    if (initialLineBreak) {
      return { ...original, insertText: initialLineBreak[0] + text.split('\n')[1] };
    }
    return { ...original, insertText: text.split('\n')[0] };
  }

  // isRepetitive, matchesNextLine, maybeSnipCompletion 的具体实现 ...
}
```

### 10. BlockTrimmerRegistry — AST 裁剪

```typescript
// === blockTrimmer.ts ===

export interface IBlockTrimmerRegistry {
  /** 是否支持该语言的 AST 解析 */
  isSupported(languageId: string): boolean;

  /** 获取光标在块中的位置类型 */
  getBlockPositionType(document: string, position: { lineNumber: number; column: number }): Promise<BlockPositionType>;

  /** 检查是否在空块起始 */
  isEmptyBlockStart(document: string, position: { lineNumber: number; column: number }): Promise<boolean>;

  /** 获取 AST 块体完成判定回调 */
  parsingBlockFinished(document: string, position: { lineNumber: number; column: number }): FinishedCallback;

  /** VerboseBlockTrimmer：获取最长合理补全 */
  verboseTrim(languageId: string, prefix: string, completion: string, lineLimit: number): Promise<number | undefined>;

  /** TerseBlockTrimmer：获取更简洁的补全 */
  terseTrim(languageId: string, prefix: string, completion: string, lineLimit: number, lookAhead: number): Promise<number | undefined>;
}
```

### 11. StreamedCompletionSplitter — MoreMultiline 流式分割

```typescript
// === streamedCompletionSplitter.ts ===

export class StreamedCompletionSplitter {
  constructor(
    prefix: string,
    languageId: string,
    initialSingleLine: boolean,
    trimmerLookahead: number,
    cacheFunction: (prefixAddition: string, item: CompletionResult) => void,
    blockTrimmerRegistry: IBlockTrimmerRegistry,
  ) {}

  getFinishedCallback(): FinishedCallback {
    // 返回流式分割回调
    // 使用 TerseBlockTrimmer 实时判定块边界
    // 首次分割作为单行返回，后续分割缓存
  }
}
```

### 12. ContextProviderRegistry — 上下文提供者

```typescript
// === contextProviderRegistry.ts ===

export interface IContextProviderRegistry {
  /** 解析所有注册的上下文提供者 */
  resolve(context: CompletionRequestContext): Promise<ResolvedContextItems>;

  /** 注册上下文提供者 */
  register(provider: IContextProvider): void;
}

export interface IContextProvider {
  readonly id: string;
  resolve(context: CompletionRequestContext): Promise<ContextItem[]>;
  /** 时间预算（ms），默认 150 */
  timeBudget: number;
}

// 具体提供者：
// - SimilarFilesProvider     → 邻近文件相似片段
// - DiagnosticsProvider      → 文件诊断信息
// - RecentEditsProvider      → 最近编辑 diff
// - CodeSnippetsProvider     → Context Provider API 代码片段
// - TraitsProvider           → 元数据特征
```

### 13. FullTelemetryEmitter — 完整遥测

```typescript
// === telemetryEmitter.ts ===（扩展 Plan A）

export interface ITelemetryEmitter {
  emit(event: TelemetryEvent): void;

  /** ★ 新增：批量发送（补全列表销毁时） */
  flush(): void;

  /** ★ 新增：idle 检测延迟发送 */
  startIdleDetection(config: { initialDelay: number; idleTimeout: number }): void;
}

export interface TelemetryEvent {
  eventType: string;
  requestId: string;
  timestamp: number;
  properties: Record<string, string | number>;
  measurements?: Record<string, number>;
}
```

### 14. FullGhostTextController — 完整编排

```typescript
// === ghostTextController.ts ===（扩展 Plan A）

export class FullGhostTextController implements IGhostTextController {
  private debounceMs: number = 75;    // 默认防抖
  private currentRequestId: string = '';

  constructor(
    private promptFactory: IPromptFactory,
    private llmClient: ILLMClient,
    private postProcessor: IPostProcessor,
    private strategyManager: IStrategyManager,
    private completionsCache: ICompletionsCache,
    private currentGhostText: ICurrentGhostText,
    private speculativeCache: ISpeculativeRequestCache,
    private asyncManager: IAsyncCompletionsManager,
    private telemetryEmitter: ITelemetryEmitter,
    private editor: monaco.editor.ICodeEditor,
  ) {}

  async getCompletions(context: CompletionRequestContext): Promise<CompletionResult[]> {
    // 1. 构建 Prompt
    const prompt = await this.promptFactory.buildPrompt(context);

    // 2. 判定策略（单行/多行）
    const hasAccepted = this.currentGhostText.hasAcceptedCurrentCompletion(prompt.prefix, prompt.suffix);
    const strategy = await this.strategyManager.determineStrategy(context, prompt, hasAccepted);

    // 3. Typing-as-Suggested → 0ms
    const typingChoices = this.currentGhostText.getCompletionsForUserTyping(prompt.prefix, prompt.suffix);
    if (typingChoices && typingChoices.length > 0) {
      return this.processAndReturn(typingChoices, context, strategy, CompletionSource.TypingAsSuggested);
    }

    // 4. Cache → 0ms
    const cacheChoices = this.completionsCache.findAll(prompt.prefix, prompt.suffix);
    if (cacheChoices && cacheChoices.length > 0) {
      return this.processAndReturn(cacheChoices, context, strategy, CompletionSource.Cache);
    }

    // 5. Async Manager → 复用进行中请求 ≤200ms
    const asyncChoices = await this.asyncManager.getFirstMatchingRequestWithTimeout(
      context.requestId, prompt.prefix, prompt, 200,
    );
    if (asyncChoices) {
      return this.processAndReturn(asyncChoices, context, strategy, CompletionSource.Async);
    }

    // 6. Debounce
    const remainingDebounce = Math.max(0, this.debounceMs - (Date.now() - context.timestamp));
    if (remainingDebounce > 0) {
      await delay(remainingDebounce);
      // 检查是否已取消
      if (this.isCancelled(context.requestId)) return [];
    }

    // 7. 网络请求（流式）
    const strategyWithContext = { ...strategy, ...context.strategy };
    const { firstResult, backgroundCache } = await this.llmClient.requestCompletionStreaming(
      prompt, strategyWithContext, context,
    );

    // 后台缓存
    backgroundCache.then(choices => {
      choices.forEach(c => this.completionsCache.append(prompt.prefix, prompt.suffix, c));
    });

    const processed = this.postProcessor.process(firstResult, this.editor.getModel()!.getValue(), context.position, strategyWithContext);
    if (processed === undefined) return [];

    // 记录当前补全（用于 typing-as-suggested）
    this.currentGhostText.setCurrent(prompt.prefix, prompt.suffix, [processed]);

    return [processed];
  }

  handleLifecycle(completionId: string, kind: CompletionLifecycleKind): void {
    switch (kind) {
      case CompletionLifecycleKind.Shown:
        // 触发投机请求
        this.triggerSpeculativeRequest(completionId);
        break;
      case CompletionLifecycleKind.Accepted:
        this.speculativeCache.request(completionId); // 执行投机请求
        this.telemetryEmitter.emit({ eventType: 'completion.accepted', ... });
        break;
      case CompletionLifecycleKind.Rejected:
        this.telemetryEmitter.emit({ eventType: 'completion.rejected', ... });
        break;
    }
  }

  private triggerSpeculativeRequest(completionId: string): void {
    // 模拟接受后的文档状态
    const current = this.currentGhostText.getCurrent();
    if (!current) return;

    // 模拟文档变更
    const simulatedPrefix = current.prefix + current.choices[0].insertText;
    const simulatedSuffix = current.suffix;

    const fn = () => this.getCompletions({
      ...this.createRequestContext(),
      strategy: { requestMultiline: false, blockMode: BlockMode.Server, stopTokens: ['\n'], maxTokens: 20 },
    });
    this.speculativeCache.set(completionId, fn);
  }
}
```

### 15. MonacoInlineCompletionsProvider — 完整版适配

```typescript
// === monacoInlineCompletionsProvider.ts ===（扩展 Plan A）

export class FullMonacoInlineCompletionsProvider implements monaco.languages.InlineCompletionsProvider {
  // 与简易版相同的 provideInlineCompletions 基础逻辑
  // ★ 新增：handleDidShow → 触发投机请求
  // ★ 新增：handleDidPartiallyAccept → 记录 partial accept 长度
  // ★ 新增：freeInlineCompletions → 发送批量遥测
}
```

## 完整版新增功能对照

| Plan A 简易版 | Plan B 完整版 | 对应文档 |
|---------------|--------------|----------|
| `SimplePromptBuilder` → 只取 prefix | `CascadingPromptFactory` → prefix + suffix + context，级联预算 | S01 |
| `suffix: ''` | FIM suffix（光标后内容，默认 15% 预算） | S01 |
| `context: []` | SimilarFiles + Diagnostics + CodeSnippets + RecentEdits + Traits + DocumentMarker | S01 |
| `SimpleLLMClient` → 同步等待 | `StreamedLLMClient` → 流式首个 token，后台缓存 | S02 |
| 无缓存 | `LRURadixTrieCache` → 100 条前缀匹配缓存 | 07-caching |
| 无 Typing-as-Suggested | `CurrentGhostText` → 0ms 本地返回 | S02 |
| 无投机请求 | `SpeculativeRequestCache` → 显示时预计算 | S02 |
| 无 Async Manager | 复用进行中请求 ≤200ms | S02 |
| 无 Debounce | 防抖减少无效请求 | S02 |
| 固定单行 | `StrategyManager` → 5 层多行判定 | S03 |
| `stop: ['\n']` | 按策略动态选择 stop tokens | S03 |
| 无 BlockTrimmer | `BlockTrimmerRegistry` → AST 裁剪 | S03 |
| 无 StreamedCompletionSplitter | MoreMultiline 流式分割 | S03 |
| 基础后处理 | 重复检测 + maybeSnip + 块闭合裁剪 | 04 |
| Console 遥测 | 批量 + idle 检测 + 生命周期追踪 | 08 |

## 实现步骤

### Phase 1：核心骨架（从简易版升级）

1. **扩展 types.ts** — 添加所有新增枚举和接口
2. **升级 PromptFactory** — 替换 SimplePromptBuilder 为级联预算构建
   - 实现 DocumentPrefix/Suffix 组件
   - 实现 trimLastLine
   - 实现级联预算分配逻辑
   - suffix 缓存匹配（Levenshtein 编辑距离）
3. **升级 StrategyManager** — 替换固定单行策略为多行判定
   - 文件长度限制（8000 行）
   - BlockMode 配置
   - 新行检测 / 空块检测
   - takeNLines 接受后策略
4. **升级 PostProcessor** — 添加重复检测、maybeSnip、forceSingleLine

### Phase 2：缓存与速度优化

5. **实现 CompletionsCache** — LRU Radix Trie
6. **实现 CurrentGhostText** — Typing-as-Suggested
7. **实现 SpeculativeRequestCache** — 投机请求
8. **实现 Debounce** — 防抖延迟
9. **升级 LLMClient** — 流式返回首个 token
10. **实现 AsyncCompletionsManager** — 复用进行中请求

### Phase 3：上下文增强

11. **实现 ContextProviderRegistry** — 注册与解析框架
12. **实现 SimilarFilesProvider** — 邻近文件片段提取
13. **实现 DiagnosticsProvider** — 诊断信息收集
14. **实现 RecentEditsProvider** — 最近编辑 diff 摘要
15. **实现 CodeSnippetsProvider** — 代码片段
16. **实现 TraitsProvider** — 元数据特征
17. **实现 DocumentMarkerComponent** — 文件路径标记

### Phase 4：多行补全完整支持

18. **实现 BlockTrimmerRegistry** — Tree-sitter AST 支持
19. **实现 StreamedCompletionSplitter** — MoreMultiline 流式分割
20. **实现 MultilineModel** — ML 评分（JavaScript/Python）
21. **升级 StrategyManager** — MoreMultiline + blockPosition + lookAhead

### Phase 5：遥测与调试

22. **升级 TelemetryEmitter** — 批量发送 + idle 检测
23. **实现 LogContext** — 请求级日志上下文
24. **实现 RequestLogger** — 调用前后记录

## 文件结构

```
src/
  inlineCompletion/
    types.ts                                核心类型定义（全部枚举和接口）
    prompt/
      promptFactory.ts                      CascadingPromptFactory
      allocation.ts                         Token 预算分配计算
      trimLastLine.ts                       尾部空白分离
      suffixCache.ts                        Suffix 编辑距离缓存匹配
      components/
        documentPrefix.ts                   光标前内容组件
        documentSuffix.ts                   光标后内容组件（带缓存匹配）
        documentMarker.ts                   文件路径/语言标记
        traits.ts                           元数据特征
        diagnostics.ts                      诊断信息
        codeSnippets.ts                     代码片段
        similarFiles.ts                     邻近文件相似片段
        recentEdits.ts                      最近编辑 diff
    strategy/
      strategyManager.ts                   多行判定与策略生成
      takeNLines.ts                        接受后固定行数裁剪
    llm/
      llmClient.ts                         ILLMClient + StreamedLLMClient
    cache/
      completionsCache.ts                  LRU Radix Trie 缓存
      radixTrie.ts                         Radix Trie 数据结构
      currentGhostText.ts                  Typing-as-Suggested
      speculativeRequestCache.ts           投机请求缓存
      asyncCompletionsManager.ts           复用进行中请求
    postProcess/
      postProcessor.ts                     FullPostProcessor
      repetitionDetector.ts                重复模式检测
      maybeSnip.ts                         块闭合裁剪
      matchesNextLine.ts                   下一行匹配检测
    trim/
      blockTrimmerRegistry.ts              AST 裁剪注册中心
      blockTrimmer.ts                      VerboseBlockTrimmer + TerseBlockTrimmer
      blockPositionType.ts                 BlockPositionType 判定
      streamedCompletionSplitter.ts         MoreMultiline 流式分割
    context/
      contextProviderRegistry.ts           上下文提供者注册与解析
      similarFilesProvider.ts              邻近文件上下文
      diagnosticsProvider.ts               诊断上下文
      recentEditsProvider.ts               最近编辑上下文
      codeSnippetsProvider.ts              代码片段上下文
      traitsProvider.ts                    元数据特征上下文
    telemetry/
      telemetryEmitter.ts                  FullTelemetryEmitter
      logContext.ts                        请求级日志
    monacoInlineCompletionsProvider.ts       Monaco API 适配（完整版）
    ghostTextController.ts                 FullGhostTextController
    setup.ts                               setupInlineCompletion() 入口
```

## 从简易版到完整版的升级路径

简易版的所有接口定义在完整版中**直接兼容**——不修改已有接口，只通过枚举扩展和可选属性添加新功能：

| 升级点 | 简易版状态 | 完整版如何扩展 |
|--------|-----------|--------------|
| `CompletionSource` | 只有 `Network` | 新增 `Cache`, `TypingAsSuggested`, `Speculative`, `Async` |
| `CompletionStrategy` | `requestMultiline: false`, `blockMode: Server` | 添加可选 `finishedCb`, `lookAhead`, `blockPosition` |
| `BlockMode` | 只有 `Server` | 新增 `Parsing`, `ParsingAndServer`, `MoreMultiline` |
| `PromptInfo` | `suffix: ''`, `context: []`, `isFimEnabled: false` | 填充 suffix/context，添加 `trailingWs`, `neighborSource` |
| `IPromptBuilder` | `SimplePromptBuilder` | 替换为 `CascadingPromptFactory`（接口签名兼容） |
| `ILLMClient` | `SimpleLLMClient.requestCompletion()` | 新增 `requestCompletionStreaming()` 方法 |
| `IPostProcessor` | 基础 trimEnd + 下一行匹配 | 扩展 `process()` 内部逻辑（接口签名不变） |
| `IGhostTextController` | 简单编排 | 扩展 `getCompletions()` 内部加入缓存/防抖/投机（接口签名不变） |
| `ITelemetryEmitter` | console.log | 新增 `flush()`, `startIdleDetection()` |

关键原则：**所有新增功能通过新增类和新增接口方法实现，不修改已有接口的方法签名**。简易版的实现类可以直接替换为完整版的实现类，无需修改调用方代码。