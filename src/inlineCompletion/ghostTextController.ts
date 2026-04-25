/**
 * Ghost Text 控制器
 * 编排补全流程：构建 prompt → 调用模型 → 后处理
 */

import type * as monaco from 'monaco-editor';
import type {
    IGhostTextController,
    CompletionResult,
    CompletionRequestContext,
    CompletionLifecycleKind,
    IPromptBuilder,
    ILLMClient,
    IPostProcessor,
    ITelemetryEmitter,
} from './types.js';

/** 简易 Ghost Text 控制器 */
export class SimpleGhostTextController implements IGhostTextController {
    private currentRequestId: string = '';

    constructor(
        private promptBuilder: IPromptBuilder,
        private llmClient: ILLMClient,
        private postProcessor: IPostProcessor,
        private telemetryEmitter: ITelemetryEmitter,
        private editor: monaco.editor.ICodeEditor,
    ) {}

    async getCompletions(
        context: CompletionRequestContext,
    ): Promise<CompletionResult[]> {
        this.currentRequestId = context.requestId;

        // 1. 构建 Prompt
        const prompt = this.promptBuilder.buildPrompt(context);

        // 2. 检查最小字符数
        if (prompt.prefix.length < 10) {
            return [];
        }

        // 3. 调用 LLM
        this.telemetryEmitter.emit({
            eventType: 'completion.issued',
            requestId: context.requestId,
            timestamp: Date.now(),
            properties: { languageId: context.languageId, source: 'network' },
        });

        let results: CompletionResult[];
        try {
            results = await this.llmClient.requestCompletion(
                prompt,
                context.strategy,
                context,
            );
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

        // 4. 后处理
        const model = this.editor.getModel();
        const documentContent = model ? model.getValue() : '';
        const processed = results
            .map(r => this.postProcessor.process(
                r,
                documentContent,
                context.position,
                context.strategy,
            ))
            .filter((r): r is CompletionResult => r !== undefined);

        // 5. 遥测
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
