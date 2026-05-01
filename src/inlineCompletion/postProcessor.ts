/**
 * 后处理器
 * 对补全结果做基础质量过滤
 */

import type { IPostProcessor, CompletionResult, CompletionStrategy } from './types.js';

/** 简易后处理器 */
export class SimplePostProcessor implements IPostProcessor {
    process(
        result: CompletionResult,
        documentContent: string,
        position: { lineNumber: number; column: number },
        _strategy: CompletionStrategy,
    ): CompletionResult | undefined {
        // 1. trimEnd
        const trimmed = result.insertText.trimEnd();
        if (!trimmed) {
            return undefined;
        }

        // 2. 下一行匹配检测（避免补全与下一行重复）
        const lines = documentContent.split('\n');
        const nextLine = lines[position.lineNumber]?.trim();
        if (nextLine && trimmed.trim() === nextLine) {
            return undefined;
        }

        // 3. 多行补全保留完整内容，单行补全截取第一行
        if (result.isMultiline) {
            return { ...result, insertText: trimmed };
        }

        const singleLine = trimmed.split('\n')[0] || '';
        if (!singleLine) {
            return undefined;
        }

        return { ...result, insertText: singleLine };
    }
}
