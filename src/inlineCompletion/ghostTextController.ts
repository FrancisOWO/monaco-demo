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
    IAICompletionClient,
    IPostProcessor,
    ITelemetryEmitter,
} from './types.js';
import { getLogger } from '../utils/logger.js';

const logger = getLogger('GhostText');

/** 简易 Ghost Text 控制器 */
export class SimpleGhostTextController implements IGhostTextController {
    private currentRequestId: string = '';

    constructor(
        private promptBuilder: IPromptBuilder,
        private aiCompletionClient: IAICompletionClient,
        private postProcessor: IPostProcessor,
        private telemetryEmitter: ITelemetryEmitter,
        private editor: monaco.editor.ICodeEditor,
    ) { }

    async getCompletions(
        context: CompletionRequestContext,
    ): Promise<CompletionResult[]> {
        this.currentRequestId = context.requestId;

        // 1. 构建 Prompt
        const prompt = await this.promptBuilder.buildPrompt(context);

        // 2. 检查最小字符数（空文件也需要能触发模板补全）
        if (prompt.prefix.trim().length === 0) {
            return [];
        }

        logger.info(`Request: lang=${context.languageId}, prefix=${prompt.prefix.substring(0, 50).replace(/\n/g, '\\n')}...`);

        // 3. 调用 LLM
        this.telemetryEmitter.emit({
            eventType: 'completion.issued',
            requestId: context.requestId,
            timestamp: Date.now(),
            properties: { languageId: context.languageId, source: 'network' },
        });

        let results: CompletionResult[];
        try {
            results = await this.aiCompletionClient.requestCompletion(
                prompt,
                context.strategy,
                context,
            ) ?? [];
        } catch (e) {
            if (e instanceof DOMException && e.name === 'AbortError') {
                return [];
            }
            logger.error('Completion failed:', e);
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
        logger.info(`Result: ${processed.length} item(s)${processed.length > 0 ? `, text=${processed[0].insertText.substring(0, 60).replace(/\n/g, '\\n')}...` : ''}`);
        this.telemetryEmitter.emit({
            eventType: 'completion.received',
            requestId: context.requestId,
            timestamp: Date.now(),
            properties: { count: processed.length },
        });

        return processed;
    }

    handleLifecycle(completionId: string, kind: CompletionLifecycleKind): void {
        if (kind === CompletionLifecycleKind.Accepted) {
            this.aiCompletionClient.notifyAccept?.();
        }

        this.telemetryEmitter.emit({
            eventType: `completion.${kind}`,
            requestId: completionId.split('-')[0],
            timestamp: Date.now(),
            properties: {},
        });
    }

    cancelCurrentRequest(): void {
        this.aiCompletionClient.cancelRequest(this.currentRequestId);
    }
}
