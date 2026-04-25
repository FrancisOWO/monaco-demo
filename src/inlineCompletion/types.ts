/**
 * 核心类型定义
 * 为 Inline Completion 功能提供类型支持
 */

import type * as monaco from 'monaco-editor';

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
    Cache = 'cache',
    TypingAsSuggested = 'typingAsSuggested',
    Speculative = 'speculative',
    Async = 'async',
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

/** 光标在块中的位置类型 */
export enum BlockPositionType {
    NonBlock = 'non-block',
    EmptyBlock = 'empty-block',
    BlockEnd = 'block-end',
    MidBlock = 'mid-block',
}

/** 流式终止回调：返回应截断的位置 */
export type FinishedCallback = (text: string) => number | undefined;

/** 补全策略 */
export interface CompletionStrategy {
    /** 是否请求多行 */
    requestMultiline: boolean;
    /** BlockMode */
    blockMode: BlockMode;
    /** stop tokens */
    stopTokens: string[];
    /** 最大生成 token 数 */
    maxTokens: number;
    /** 流式终止回调（完整版） */
    finishedCb?: FinishedCallback;
    /** MoreMultiline 的前瞻行数（完整版） */
    lookAhead?: number;
    /** 光标在块中的位置类型（完整版） */
    blockPosition?: BlockPositionType;
}

export enum BlockMode {
    Server = 'server',
    Parsing = 'parsing',
    ParsingAndServer = 'parsingandserver',
    MoreMultiline = 'moremultiline',
}

/** Prompt 信息 */
export interface PromptInfo {
    /** 光标前内容 */
    prefix: string;
    /** 光标后内容 */
    suffix: string;
    /** 额外上下文 */
    context: string[];
    /** prefix 的 token 估算数 */
    prefixTokens?: number;
    /** suffix 的 token 估算数 */
    suffixTokens?: number;
    /** 是否启用 FIM */
    isFimEnabled: boolean;
    /** 尾部空白用于位置调整（完整版） */
    trailingWs?: string;
    /** 邻近文件来源映射（完整版） */
    neighborSource?: Map<NeighboringFileType, string[]>;
}

/** 邻近文件类型 */
export enum NeighboringFileType {
    None = 'none',
    OpenTabs = 'opentabs',
    CursorMostRecent = 'cursormostrecent',
    WorkspaceSharingSameFolder = 'workspacesharingsamefolder',
    WorkspaceSmallestPathDist = 'workspacesmallestpathdist',
}

/** Token 预算分配 */
export interface PromptAllocation {
    /** prefix 预算百分比，默认 35% */
    prefix: number;
    /** suffix 预算百分比，默认 15% */
    suffix: number;
    /** 稳定上下文预算百分比，默认 35% */
    stableContext: number;
    /** 易变上下文预算百分比，默认 15% */
    volatileContext: number;
}

/** 多行判定结果 */
export interface MultilineDetermination {
    requestMultiline: boolean;
    blockPosition?: BlockPositionType;
}

/** 补全生命周期事件 */
export enum CompletionLifecycleKind {
    Shown = 'shown',
    Accepted = 'accepted',
    Rejected = 'rejected',
    Ignored = 'ignored',
}

/** 遥测事件 */
export interface TelemetryEvent {
    eventType: string;
    requestId: string;
    timestamp: number;
    properties: Record<string, string | number>;
    /** 测量值（完整版） */
    measurements?: Record<string, number>;
}

/** 遥测发射器接口 */
export interface ITelemetryEmitter {
    emit(event: TelemetryEvent): void;
    /** 批量发送（完整版） */
    flush?(): void;
    /** idle 检测延迟发送（完整版） */
    startIdleDetection?(config: { initialDelay: number; idleTimeout: number }): void;
}

/** Prompt 构建器接口 */
export interface IPromptBuilder {
    /**
     * 从编辑器状态中提取 prompt
     * 简易版：只取 prefix（光标前内容），suffix 和 context 为空
     * 完整版：取 prefix + suffix + neighborFiles + diagnostics 等
     */
    buildPrompt(context: CompletionRequestContext): PromptInfo;
}

/** LLM 客户端接口 */
export interface ILLMClient {
    /**
     * 向 LLM 发送补全请求
     */
    requestCompletion(
        prompt: PromptInfo,
        strategy: CompletionStrategy,
        context: CompletionRequestContext,
    ): Promise<CompletionResult[]>;

    /**
     * 流式请求，只等首个 token 就返回（完整版）
     */
    requestCompletionStreaming?(
        prompt: PromptInfo,
        strategy: CompletionStrategy,
        context: CompletionRequestContext,
    ): Promise<{ firstResult: CompletionResult; backgroundCache: Promise<CompletionResult[]> }>;

    /**
     * 取消进行中的请求
     */
    cancelRequest(requestId: string): void;
}

/** 后处理器接口 */
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

/** Ghost Text 控制器接口 */
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

// ==================== 完整版新增接口 ====================

/** Prompt 工厂接口（完整版） */
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

/** 策略管理器接口（完整版） */
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

/** 补全缓存接口（完整版） */
export interface ICompletionsCache {
    /** 前缀匹配查找缓存 */
    findAll(prefix: string, suffix: string): CompletionResult[];

    /** 添加到缓存 */
    append(prefix: string, suffix: string, result: CompletionResult): void;

    /** 清空缓存 */
    clear(): void;
}

/** 当前 Ghost Text 接口（完整版 Typing-as-Suggested） */
export interface ICurrentGhostText {
    /** 设置当前显示的补全 */
    setCurrent(prefix: string, suffix: string, choices: CompletionResult[]): void;

    /** 检查用户输入是否与补全匹配，返回调整后的补全 */
    getCompletionsForUserTyping(prefix: string, suffix: string): CompletionResult[] | undefined;

    /** 清除当前补全 */
    clear(): void;

    /** 检查当前补全是否已被完整接受 */
    hasAcceptedCurrentCompletion(prefix: string, suffix: string): boolean;

    /** 获取当前补全（完整版） */
    getCurrent?(): { prefix: string; suffix: string; choices: CompletionResult[] } | undefined;
}

/** 投机请求缓存接口（完整版） */
export interface ISpeculativeRequestCache {
    /** 在补全显示时缓存投机请求函数 */
    set(completionId: string, requestFn: () => Promise<CompletionResult[]>): void;

    /** 在用户接受时执行投机请求 */
    request(completionId: string): Promise<void>;

    /** 清空 */
    clear(): void;
}

/** 异步补全管理器接口（完整版） */
export interface IAsyncCompletionsManager {
    /**
     * 获取第一个匹配的进行中请求
     * @param requestId 当前请求ID
     * @param prefix 当前prefix
     * @param prompt 当前prompt
     * @param timeout 超时时间（ms）
     */
    getFirstMatchingRequestWithTimeout(
        requestId: string,
        prefix: string,
        prompt: PromptInfo,
        timeout: number,
    ): Promise<CompletionResult[] | undefined>;

    /** 注册进行中的请求 */
    registerRequest(requestId: string, promise: Promise<CompletionResult[]>): void;

    /** 取消请求 */
    cancelRequest(requestId: string): void;
}
