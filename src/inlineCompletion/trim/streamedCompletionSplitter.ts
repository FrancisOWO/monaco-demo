/**
 * StreamedCompletionSplitter
 * MoreMultiline 流式分割
 * 使用 TerseBlockTrimmer 实时判定块边界
 */

import type { CompletionResult, FinishedCallback } from '../types.js';
import type { IBlockTrimmerRegistry } from './blockTrimmerRegistry.js';
import { CompletionSource } from '../types.js';

/**
 * MoreMultiline 流式补全分割器
 */
export class StreamedCompletionSplitter {
    private cacheFunction: (prefixAddition: string, item: CompletionResult) => void;
    private blockTrimmerRegistry: IBlockTrimmerRegistry;
    private initialSingleLine: boolean;
    private trimmerLookahead: number;

    private firstSplit = true;
    private buffer = '';
    private firstResult: CompletionResult | undefined;

    constructor(
        prefix: string,
        languageId: string,
        initialSingleLine: boolean,
        trimmerLookahead: number,
        cacheFunction: (prefixAddition: string, item: CompletionResult) => void,
        blockTrimmerRegistry: IBlockTrimmerRegistry,
    ) {
        this.cacheFunction = cacheFunction;
        this.blockTrimmerRegistry = blockTrimmerRegistry;
        this.initialSingleLine = initialSingleLine;
        this.trimmerLookahead = trimmerLookahead;
    }

    /**
     * 返回流式分割回调
     */
    getFinishedCallback(): FinishedCallback {
        return (text: string): number | undefined => {
            // 接收流式文本，实时判定是否需要分割
            this.buffer += text;

            // 检查是否需要在当前位置分割
            const splitPosition = this.findSplitPosition();

            if (splitPosition !== undefined) {
                // 找到分割点
                if (this.firstSplit) {
                    // 首次分割作为单行返回
                    this.firstSplit = false;
                    const firstLine = this.buffer.slice(0, splitPosition);
                    this.firstResult = this.createCompletionResult(firstLine, true);

                    // 剩余部分缓存
                    const remaining = this.buffer.slice(splitPosition);
                    if (remaining) {
                        this.cacheCompletion(remaining, this.firstResult.completionId);
                    }

                    return splitPosition;
                } else {
                    // 后续分割缓存
                    const segment = this.buffer.slice(0, splitPosition);
                    this.cacheCompletion(segment, '');

                    return splitPosition;
                }
            }

            // 没有到达分割点，继续接收
            return undefined;
        };
    }

    /**
     * 查找分割位置
     */
    private findSplitPosition(): number | undefined {
        const lines = this.buffer.split('\n');

        if (lines.length <= 1) {
            return undefined; // 只有一行，不分割
        }

        if (this.initialSingleLine && this.firstSplit) {
            // 首次返回单行
            const firstLine = lines[0];
            return firstLine.length + 1; // +1 for newline
        }

        // 检查是否达到 lookAhead 行数
        if (lines.length >= this.trimmerLookahead) {
            // 尝试在 lookAhead 行处分割
            let pos = 0;
            for (let i = 0; i < this.trimmerLookahead && i < lines.length; i++) {
                pos += lines[i].length + 1; // +1 for newline
            }

            // 检查是否在完整的语句处
            const lastLine = lines[this.trimmerLookahead - 1]?.trim() ?? '';
            if (this.isStatementEnd(lastLine)) {
                return pos;
            }
        }

        // 检查是否检测到块边界
        for (let i = 1; i < lines.length; i++) {
            const line = lines[i].trim();
            if (this.isBlockBoundary(line)) {
                let pos = 0;
                for (let j = 0; j <= i && j < lines.length; j++) {
                    pos += lines[j].length + 1;
                }
                return pos;
            }
        }

        return undefined;
    }

    /**
     * 检查是否是语句结束
     */
    private isStatementEnd(line: string): boolean {
        // 检测常见的语句结束模式
        const patterns = [
            /;\s*$/,           // 分号结尾
            /}\s*$/,           // 闭合大括号
            /\)\s*;?\s*$/,     // 闭合小括号，可选分号
            /\)\s*=>\s*{?\s*$/, // 箭头函数
            /return\s+.+;?\s*$/, // return 语句
        ];

        for (const pattern of patterns) {
            if (pattern.test(line)) {
                return true;
            }
        }

        return false;
    }

    /**
     * 检查是否是块边界
     */
    private isBlockBoundary(line: string): boolean {
        // 检测块边界模式
        const patterns = [
            /^\s*}/,           // 闭合大括号
            /^\s*\)/,          // 闭合小括号
            /^\s*\]/,           // 闭合中括号
        ];

        for (const pattern of patterns) {
            if (pattern.test(line)) {
                return true;
            }
        }

        return false;
    }

    /**
     * 创建补全结果
     */
    private createCompletionResult(text: string, isFirst: boolean): CompletionResult {
        return {
            insertText: text,
            range: {
                startLineNumber: 1,
                startColumn: 1,
                endLineNumber: 1,
                endColumn: 1,
            },
            completionId: isFirst ? `completion-${Date.now()}` : '',
            source: CompletionSource.Network,
            isMultiline: text.includes('\n'),
        };
    }

    /**
     * 缓存补全
     */
    private cacheCompletion(text: string, parentId: string): void {
        if (!text) {
            return;
        }

        const item: CompletionResult = {
            insertText: text,
            range: {
                startLineNumber: 1,
                startColumn: 1,
                endLineNumber: 1,
                endColumn: 1,
            },
            completionId: parentId ? `${parentId}-cached` : `cached-${Date.now()}`,
            source: CompletionSource.Network,
            isMultiline: text.includes('\n'),
        };

        this.cacheFunction('', item);
    }

    /**
     * 获取第一个结果
     */
    getFirstResult(): CompletionResult | undefined {
        return this.firstResult;
    }

    /**
     * 获取剩余缓冲区
     */
    getBuffer(): string {
        return this.buffer;
    }
}
