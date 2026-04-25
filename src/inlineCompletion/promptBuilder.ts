/**
 * Prompt 构建器
 * 从编辑器状态中提取 prompt 信息
 */

import type * as monaco from 'monaco-editor';
import type { IPromptBuilder, PromptInfo, CompletionRequestContext } from './types.js';

/** 简易 Prompt 构建器 */
export class SimplePromptBuilder implements IPromptBuilder {
    constructor(private editor: monaco.editor.ICodeEditor) {}

    buildPrompt(context: CompletionRequestContext): PromptInfo {
        const model = this.editor.getModel();
        if (!model) {
            return {
                prefix: '',
                suffix: '',
                context: [],
                isFimEnabled: false,
            };
        }

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
