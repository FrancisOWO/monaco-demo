/**
 * FullPostProcessor
 * 完整版后处理器，添加重复检测、maybeSnip、forceSingleLine 等
 */

import {
    BlockMode,
    type CompletionResult,
    type CompletionStrategy,
} from '../types.js';
import type { IPostProcessor } from '../types.js';
import type { IBlockTrimmerRegistry } from '../trim/blockTrimmerRegistry.js';

/** 后处理器配置 */
export interface PostProcessorConfig {
    /** 重复检测的最小重复长度 */
    minRepetitionLength: number;
    /** 重复检测的最大行数 */
    maxRepetitionLines: number;
    /** maybeSnip 的行数限制 */
    maybeSnipLineLimit: number;
}

/** 完整版后处理器 */
export class FullPostProcessor implements IPostProcessor {
    private config: PostProcessorConfig;

    constructor(
        private blockTrimmerRegistry: IBlockTrimmerRegistry,
        config?: Partial<PostProcessorConfig>,
    ) {
        this.config = {
            minRepetitionLength: 10,
            maxRepetitionLines: 5,
            maybeSnipLineLimit: 50,
            ...config,
        };
    }

    process(
        result: CompletionResult,
        documentContent: string,
        position: { lineNumber: number; column: number },
        strategy: CompletionStrategy,
    ): CompletionResult | undefined {
        // 1. trimEnd
        const trimmed = result.insertText.trimEnd();
        if (!trimmed) {
            return undefined;
        }

        // 2. 重复检测
        if (this.isRepetitive(trimmed)) {
            return undefined;
        }

        // 3. 下一行匹配检测（MoreMultiline 时不过 trim）
        const shouldTrimNextLine = strategy.blockMode !== BlockMode.MoreMultiline;
        if (this.matchesNextLine(documentContent, position, trimmed, shouldTrimNextLine)) {
            return undefined;
        }

        // 4. MaybeSnip — 移除重复闭合行
        const snipped = this.maybeSnipCompletion(documentContent, position, trimmed);

        // 5. 单行强制裁剪
        if (!strategy.requestMultiline) {
            return this.forceSingleLine(result, snipped);
        }

        return { ...result, insertText: snipped };
    }

    /**
     * 检测文本是否重复
     */
    private isRepetitive(text: string): boolean {
        const lines = text.split('\n');
        if (lines.length < 2) {
            return false;
        }

        // 检测重复行模式
        const seenPatterns = new Set<string>();

        for (let i = 0; i < lines.length; i++) {
            const line = lines[i].trim();
            if (line.length < this.config.minRepetitionLength) {
                continue;
            }

            // 检测行重复
            if (seenPatterns.has(line)) {
                return true;
            }
            seenPatterns.add(line);
        }

        // 检测整体文本重复（如果文本太长）
        if (text.length > this.config.minRepetitionLength * 3) {
            const mid = Math.floor(text.length / 2);
            const firstHalf = text.slice(0, mid);
            const secondHalf = text.slice(mid);
            if (firstHalf.includes(secondHalf.slice(0, this.config.minRepetitionLength)) ||
                secondHalf.includes(firstHalf.slice(-this.config.minRepetitionLength))) {
                return true;
            }
        }

        return false;
    }

    /**
     * 检测是否与下一行匹配
     */
    private matchesNextLine(
        documentContent: string,
        position: { lineNumber: number; column: number },
        completion: string,
        trim: boolean,
    ): boolean {
        const lines = documentContent.split('\n');
        const nextLine = lines[position.lineNumber]?.trim();

        if (!nextLine) {
            return false;
        }

        const completionToCheck = trim ? completion.trim() : completion;
        return completionToCheck === nextLine;
    }

    /**
     * MaybeSnip：移除重复闭合行
     */
    private maybeSnipCompletion(
        documentContent: string,
        position: { lineNumber: number; column: number },
        completion: string,
    ): string {
        const lines = completion.split('\n');

        // 如果行数太多，可能需要裁剪
        if (lines.length > this.config.maybeSnipLineLimit) {
            // 查找可能的闭合行模式
            const documentLines = documentContent.split('\n');
            const currentLine = documentLines[position.lineNumber - 1] ?? '';

            // 检测常见的闭合模式
            const openPattern = currentLine.match(/^(\s*)[{(\[]/);
            if (openPattern) {
                const indent = openPattern[1].length;
                const closeIndent = indent;

                // 查找与开头匹配的闭合行
                for (let i = lines.length - 1; i >= 0; i--) {
                    const line = lines[i];
                    const lineIndent = line.match(/^(\s*)/)?.[1]?.length ?? 0;

                    if (lineIndent === closeIndent && /^\s*[})\]]/.test(line)) {
                        // 检查闭合行是否与文档中的下一行匹配
                        const nextDocLine = documentLines[position.lineNumber]?.trim();
                        if (nextDocLine && line.trim() === nextDocLine) {
                            // 移除这个闭合行
                            return lines.slice(0, i).join('\n');
                        }
                    }
                }
            }
        }

        return completion;
    }

    /**
     * 强制单行裁剪
     */
    private forceSingleLine(original: CompletionResult, text: string): CompletionResult | undefined {
        // 检查是否有初始换行符
        const initialLineBreak = text.match(/^(\r?\n)/);
        const lines = text.split('\n');

        if (initialLineBreak && lines.length > 1) {
            // 保留换行符 + 第二行
            return {
                ...original,
                insertText: initialLineBreak[0] + lines[1],
            };
        }

        // 只取第一行
        const firstLine = lines[0] ?? '';
        if (!firstLine) {
            return undefined;
        }

        return { ...original, insertText: firstLine };
    }
}
