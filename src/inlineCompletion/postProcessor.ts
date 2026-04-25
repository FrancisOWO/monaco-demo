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
        // position.lineNumber 是 1-based，所以下一行索引是 lineNumber（0-based）
        const nextLine = lines[position.lineNumber]?.trim();
        if (nextLine && trimmed.trim() === nextLine) {
            return undefined;
        }

        // 3. 单行强制（简易版不需要，因为 stop=['\n'] 已保证单行）
        // 但为了安全，还是检查一下
        const singleLine = trimmed.split('\n')[0] || '';
        if (!singleLine) {
            return undefined;
        }

        return { ...result, insertText: singleLine };
    }
}
