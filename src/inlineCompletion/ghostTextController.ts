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
import { InlineCompletionTriggerKind } from './types.js';
import { getLogger } from '../utils/logger.js';

const logger = getLogger('GhostText');

/** 自动触发冷却间隔（ms），补全成功后短时间内不再请求 */
const COOLDOWN_MS = 2000;

/** 简易 Ghost Text 控制器 */
export class SimpleGhostTextController implements IGhostTextController {
    private currentRequestId: string = '';
    private lastCompletionTime = 0;

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
        // 自动触发冷却：补全成功后 2s 内不再发请求，无论位置是否变化
        if (context.triggerKind === InlineCompletionTriggerKind.Automatic) {
            const now = Date.now();
            if (now - this.lastCompletionTime < COOLDOWN_MS) {
                logger.info(`Cooldown: ${Math.round(COOLDOWN_MS - (now - this.lastCompletionTime))}ms left`);
                return [];
            }
        }

        this.currentRequestId = context.requestId;

        // 1. 构建 Prompt
        const prompt = this.promptBuilder.buildPrompt(context);

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

        // 记录补全成功的时间（用于冷却期）
        if (processed.length > 0) {
            this.lastCompletionTime = Date.now();
        }
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
        this.aiCompletionClient.cancelRequest(this.currentRequestId);
    }
}
