/**
 * FullGhostTextController
 * 完整版 Ghost Text 控制器
 * 整合所有 Phase 1-3 的组件
 */

import type * as monaco from 'monaco-editor';
import {
    CompletionSource,
    InlineCompletionTriggerKind,
    CompletionLifecycleKind,
    type CompletionResult,
    type CompletionRequestContext,
    type CompletionStrategy,
    type IGhostTextController,
    type IPromptFactory,
    type IAICompletionClient,
    type IPostProcessor,
    type IStrategyManager,
    type ICompletionsCache,
    type ICurrentGhostText,
    type ISpeculativeRequestCache,
    type IAsyncCompletionsManager,
    type ITelemetryEmitter,
} from './types.js';
import { debounceCancellable } from './cache/debounce.js';
import { getLogger } from '../utils/logger.js';

const logger = getLogger('GhostTextCtrl');

/**
 * 完整版 Ghost Text 控制器配置
 */
export interface FullGhostTextControllerConfig {
    /** 防抖延迟（ms） */
    debounceMs: number;
    /** 异步请求超时（ms） */
    asyncTimeout: number;
}

/**
 * 完整版 Ghost Text 控制器
 */
export class FullGhostTextController implements IGhostTextController {
    private config: FullGhostTextControllerConfig;
    private currentRequestId: string = '';
    private cancelledRequests = new Set<string>();
    private debouncedGetCompletions: ReturnType<typeof debounceCancellable>;
    private lastPrefix: string = '';
    private isDeletionMode: boolean = false;
    /** 连续接受补全次数，独立于 currentGhostText 生命周期 */
    private consecutiveAcceptCount: number = 0;

    constructor(
        private promptFactory: IPromptFactory,
        private aiCompletionClient: IAICompletionClient,
        private postProcessor: IPostProcessor,
        private strategyManager: IStrategyManager,
        private completionsCache: ICompletionsCache,
        private currentGhostText: ICurrentGhostText,
        private speculativeCache: ISpeculativeRequestCache,
        private asyncManager: IAsyncCompletionsManager,
        private telemetryEmitter: ITelemetryEmitter,
        private editor: monaco.editor.ICodeEditor,
        config?: Partial<FullGhostTextControllerConfig>,
    ) {
        this.config = {
            debounceMs: 75,
            asyncTimeout: 200,
            ...config,
        };

        // 创建防抖函数
        this.debouncedGetCompletions = debounceCancellable(
            this.doGetCompletions.bind(this),
            this.config.debounceMs,
        );
    }

    /**
     * 获取补全列表
     */
    async getCompletions(
        context: CompletionRequestContext,
    ): Promise<CompletionResult[]> {
        this.currentRequestId = context.requestId;

        // 使用防抖
        try {
            return await this.debouncedGetCompletions(context);
        } catch {
            return [];
        }
    }

    /**
     * 实际获取补全（防抖后）
     */
    private async doGetCompletions(
        context: CompletionRequestContext,
    ): Promise<CompletionResult[]> {
        // 1. 构建 Prompt
        const prompt = await this.promptFactory.buildPrompt(context);

        // 2. 删除检测：prefix 缩短 → 删除模式（跳过缓存和请求）
        //    prefix 恢复到删除前长度或增长 → 清除删除模式
        if (this.lastPrefix && prompt.prefix.length < this.lastPrefix.length) {
            this.isDeletionMode = true;
        }
        if (this.isDeletionMode && prompt.prefix.length >= this.lastPrefix.length) {
            this.isDeletionMode = false;
        }
        this.lastPrefix = prompt.prefix;

        // 删除模式：不使用缓存、不发送请求（手动触发除外）
        if (this.isDeletionMode && context.triggerKind === InlineCompletionTriggerKind.Automatic) {
            return [];
        }

        // 3. 判定策略 — 连续接受计数由控制器自行追踪，
        //    不依赖 currentGhostText（它会被 cancelCurrentRequest 清零）
        const strategy = await this.strategyManager.determineStrategy(
            context,
            prompt,
            this.consecutiveAcceptCount,
        );

        // 3. Typing-as-Suggested → 0ms
        const typingChoices = this.currentGhostText.getCompletionsForUserTyping(
            prompt.prefix,
            prompt.suffix,
        );
        if (typingChoices && typingChoices.length > 0) {
            const result = this.processAndReturn(
                typingChoices,
                context,
                strategy,
                CompletionSource.TypingAsSuggested,
            );
            if (result.length > 0) {
                return result;
            }
            // typing-as-suggested 结果被过滤 → fallthrough 到网络请求
            logger.info(`typingAsSuggested filtered, falling through to network request`);
        }

        // 4. Cache → 0ms
        const cacheChoices = this.completionsCache.findAll(prompt.prefix, prompt.suffix);
        if (cacheChoices && cacheChoices.length > 0) {
            const result = this.processAndReturn(
                cacheChoices,
                context,
                strategy,
                CompletionSource.Cache,
            );
            if (result.length > 0) {
                return result;
            }
            // cache 结果被过滤 → fallthrough 到网络请求
            logger.info(`cache filtered, falling through to network request`);
        }

        // 5. Async Manager → 复用进行中请求
        const asyncChoices = await this.asyncManager.getFirstMatchingRequestWithTimeout(
            context.requestId,
            prompt.prefix,
            prompt,
            this.config.asyncTimeout,
        );
        if (asyncChoices) {
            const result = this.processAndReturn(
                asyncChoices,
                context,
                strategy,
                CompletionSource.Async,
            );
            if (result.length > 0) {
                return result;
            }
            // async 结果被过滤 → fallthrough 到网络请求
            logger.info(`async filtered, falling through to network request`);
        }

        // 6. 网络请求（流式）
        if (this.aiCompletionClient.requestCompletionStreaming) {
            const { firstResult, backgroundCache } =
                await this.aiCompletionClient.requestCompletionStreaming(prompt, strategy, context);

            // 后台缓存
            backgroundCache.then(choices => {
                choices.forEach(c => this.completionsCache.append(prompt.prefix, prompt.suffix, c));
            });

            const processed = this.postProcessor.process(
                firstResult,
                this.editor.getModel()?.getValue() ?? '',
                context.position,
                strategy,
            );

            if (processed === undefined) {
                // 网络空结果不等于用户拒绝。保持连续接受计数，等显式 rejected 再归零。
                logger.info(`streaming: postProcess filtered all, keep acceptCount=${this.consecutiveAcceptCount}`);
                return [];
            }

            // 记录当前补全
            this.currentGhostText.setCurrent(prompt.prefix, prompt.suffix, [processed]);

            return [processed];
        } else {
            // 回退到标准请求
            const results = await this.aiCompletionClient.requestCompletion(prompt, strategy, context);

            const model = this.editor.getModel();
            const documentContent = model?.getValue() ?? '';

            const processed = results
                .map(r => this.postProcessor.process(r, documentContent, context.position, strategy))
                .filter((r): r is CompletionResult => r !== undefined);

            // 缓存结果
            processed.forEach(c => this.completionsCache.append(prompt.prefix, prompt.suffix, c));

            // 记录当前补全
            if (processed.length > 0) {
                this.currentGhostText.setCurrent(prompt.prefix, prompt.suffix, processed);
            } else {
                // 网络空结果不等于用户拒绝。保持连续接受计数，等显式 rejected 再归零。
                logger.info(`non-stream: postProcess filtered all, keep acceptCount=${this.consecutiveAcceptCount}`);
            }

            return processed;
        }
    }

    /**
     * 处理并返回结果
     */
    private processAndReturn(
        choices: CompletionResult[],
        context: CompletionRequestContext,
        strategy: CompletionStrategy,
        source: CompletionSource,
    ): CompletionResult[] {
        // 更新来源
        const updatedChoices = choices.map(c => ({
            ...c,
            source,
        }));

        // 后处理
        const model = this.editor.getModel();
        const documentContent = model?.getValue() ?? '';

        const processed = updatedChoices
            .map(c => this.postProcessor.process(c, documentContent, context.position, strategy))
            .filter((c): c is CompletionResult => c !== undefined);

        // typing-as-suggested / cache 路径的结果被过滤不应重置 consecutiveAcceptCount，
        // 因为这只是缓存未命中，不是"隐式拒绝"。
        // 只有网络请求的结果被过滤才意味着 AI 返回了无效内容。

        // 记录当前补全
        this.currentGhostText.setCurrent(
            context.prompt.prefix,
            context.prompt.suffix,
            processed,
        );

        // 遥测
        this.telemetryEmitter.emit({
            eventType: 'completion.returned',
            requestId: context.requestId,
            timestamp: Date.now(),
            properties: {
                source,
                count: processed.length,
                languageId: context.languageId,
            },
        });

        return processed;
    }

    /**
     * 处理补全生命周期事件
     */
    handleLifecycle(completionId: string, kind: CompletionLifecycleKind): void {
        switch (kind) {
            case CompletionLifecycleKind.Shown:
                this.triggerSpeculativeRequest(completionId);
                break;
            case CompletionLifecycleKind.Accepted:
                this.consecutiveAcceptCount++;
                logger.info(`handleLifecycle accepted: acceptCount=${this.consecutiveAcceptCount}, id=${completionId}`);
                this.speculativeCache.request(completionId);
                break;
            case CompletionLifecycleKind.Rejected:
                logger.info(`handleLifecycle rejected: reset acceptCount from ${this.consecutiveAcceptCount} to 0, id=${completionId}`);
                this.consecutiveAcceptCount = 0;
                this.currentGhostText.clear();
                break;
        }

        // 遥测
        this.telemetryEmitter.emit({
            eventType: `completion.${kind}`,
            requestId: completionId.split('-')[0],
            timestamp: Date.now(),
            properties: {},
        });
    }

    /**
     * 取消当前请求
     */
    cancelCurrentRequest(): void {
        this.debouncedGetCompletions.cancel();
        this.aiCompletionClient.cancelRequest(this.currentRequestId);
        this.cancelledRequests.add(this.currentRequestId);
        this.currentGhostText.clear();
    }

    /**
     * 检查请求是否已取消
     */
    private isCancelled(requestId: string): boolean {
        return this.cancelledRequests.has(requestId);
    }

    /**
     * 触发投机请求
     */
    private triggerSpeculativeRequest(completionId: string): void {
        // 当前投机请求复用 getCompletions，但缺少真实的语言、位置和策略上下文。
        // 它会发出 languageId 为空的单行请求，并且空响应会重置 consecutiveAcceptCount，
        // 导致连续接受阈值永远无法触发多行策略。先停用，等有无副作用的投机链路后再启用。
        logger.info(`speculative request skipped: unsafe context, id=${completionId}`);
    }

    /**
     * 销毁控制器
     */
    dispose(): void {
        this.debouncedGetCompletions.cancel();
        this.currentGhostText.clear();
        this.speculativeCache.clear();
        this.completionsCache.clear();
    }
}
