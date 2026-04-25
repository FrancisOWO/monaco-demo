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

/** 遥测发射器接口 */
export interface ITelemetryEmitter {
    emit(event: TelemetryEvent): void;
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
