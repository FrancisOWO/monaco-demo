/**
 * StrategyManager
 * 多行补全策略管理器
 */

import type * as monaco from 'monaco-editor';
import {
    BlockMode,
    BlockPositionType,
    type CompletionStrategy,
    type CompletionRequestContext,
    type PromptInfo,
    type FinishedCallback,
    type IStrategyManager,
} from '../types.js';
import type { IBlockTrimmerRegistry } from '../trim/blockTrimmerRegistry.js';
import type { IMultilineModel } from '../trim/multilineModel.js';

/** 策略管理器配置 */
export interface StrategyManagerConfig {
    /** 文件长度限制，超过则强制单行 */
    maxFileLines: number;
    /** MoreMultiline 前瞻行数 - EmptyBlock 或 BlockEnd */
    lookAheadLarge: number;
    /** MoreMultiline 前瞻行数 - 其他情况 */
    lookAheadSmall: number;
    /** 接受后固定行数 */
    multilineAfterAcceptLines: number;
}

/** 策略管理器 */
export class StrategyManager implements IStrategyManager {
    private config: StrategyManagerConfig;

    constructor(
        private blockTrimmerRegistry: IBlockTrimmerRegistry,
        private multilineModel: IMultilineModel,
        private editor: monaco.editor.ICodeEditor,
        config?: Partial<StrategyManagerConfig>,
    ) {
        this.config = {
            maxFileLines: 8000,
            lookAheadLarge: 7,
            lookAheadSmall: 3,
            multilineAfterAcceptLines: 1,
            ...config,
        };
    }

    async determineStrategy(
        context: CompletionRequestContext,
        prompt: PromptInfo,
        hasAcceptedCurrent: boolean,
    ): Promise<CompletionStrategy> {
        const model = this.editor.getModel();
        if (!model) {
            return this.singleLineStrategy(BlockMode.Server);
        }

        const document = model.getValue();
        const lineCount = document.split('\n').length;
        const position = context.position;
        const languageId = context.languageId;
        const blockMode = this.getBlockModeForLanguage(languageId);

        // 1. 文件长度限制
        if (lineCount >= this.config.maxFileLines) {
            return this.singleLineStrategy(blockMode);
        }

        // 2. MoreMultiline 特殊规则：仅接受后触发
        if (blockMode === BlockMode.MoreMultiline && this.blockTrimmerRegistry.isSupported(languageId)) {
            if (!hasAcceptedCurrent) {
                return this.singleLineStrategy(blockMode);
            }
            const blockPosition = await this.blockTrimmerRegistry.getBlockPositionType(document, position);
            return this.multilineStrategy(blockMode, blockPosition);
        }

        // 3. 新行起始检测（TypeScript）
        if (['typescript', 'typescriptreact'].includes(languageId)) {
            const line = model.getLineContent(position.lineNumber);
            if (line.trim().length === 0) {
                return this.multilineStrategy(blockMode);
            }
        }

        // 4. AST 空块检测
        let requestMultiline = false;
        if (this.blockTrimmerRegistry.isSupported(languageId)) {
            requestMultiline = await this.blockTrimmerRegistry.isEmptyBlockStart(document, position);
        }

        // 5. ML 评分（JavaScript/Python）
        if (!requestMultiline && ['javascript', 'python'].includes(languageId)) {
            const score = this.multilineModel.score(prompt, languageId);
            requestMultiline = score > 0.5;
        }

        // 6. 接受后强制多行
        if (hasAcceptedCurrent && !requestMultiline) {
            return this.afterAcceptStrategy(blockMode);
        }

        if (requestMultiline) {
            return this.multilineStrategy(blockMode);
        }
        return this.singleLineStrategy(blockMode);
    }

    /**
     * 获取语言的 BlockMode
     */
    private getBlockModeForLanguage(languageId: string): BlockMode {
        // 根据语言配置决定 BlockMode
        // 简化实现：默认 Server
        const parsingLanguages = ['typescript', 'typescriptreact', 'javascript', 'python', 'go', 'rust'];
        const moreMultilineLanguages: string[] = []; // 可由配置决定

        if (moreMultilineLanguages.includes(languageId)) {
            return BlockMode.MoreMultiline;
        }
        if (parsingLanguages.includes(languageId)) {
            return BlockMode.Parsing;
        }
        return BlockMode.Server;
    }

    /**
     * 单行策略
     */
    private singleLineStrategy(blockMode: BlockMode): CompletionStrategy {
        return {
            requestMultiline: false,
            blockMode,
            stopTokens: ['\n'],
            maxTokens: 20,
        };
    }

    /**
     * 多行策略
     */
    private multilineStrategy(blockMode: BlockMode, blockPosition?: BlockPositionType): CompletionStrategy {
        let finishedCb: FinishedCallback | undefined;
        let lookAhead: number | undefined;

        if (blockMode === BlockMode.MoreMultiline) {
            lookAhead = blockPosition === BlockPositionType.EmptyBlock || blockPosition === BlockPositionType.BlockEnd
                ? this.config.lookAheadLarge
                : this.config.lookAheadSmall;
            // finishedCb 由 StreamedCompletionSplitter 在请求时创建
        } else if (blockMode === BlockMode.Parsing || blockMode === BlockMode.ParsingAndServer) {
            const document = this.editor.getModel()?.getValue() ?? '';
            const position = this.editor.getPosition();
            if (position) {
                finishedCb = this.blockTrimmerRegistry.parsingBlockFinished(document, {
                    lineNumber: position.lineNumber,
                    column: position.column,
                });
            }
        }

        return {
            requestMultiline: true,
            blockMode,
            stopTokens: [],
            maxTokens: blockMode === BlockMode.MoreMultiline ? 150 : 100,
            finishedCb,
            lookAhead,
            blockPosition,
        };
    }

    /**
     * 接受后策略：接受当前补全后强制多行
     */
    private afterAcceptStrategy(blockMode: BlockMode): CompletionStrategy {
        const multilineAfterAcceptLines = this.config.multilineAfterAcceptLines;
        return {
            requestMultiline: true,
            blockMode: BlockMode.Parsing,
            stopTokens: ['\n\n'],
            maxTokens: 20 * multilineAfterAcceptLines,
            finishedCb: takeNLines(multilineAfterAcceptLines),
        };
    }
}

/**
 * 取前 N 行的回调函数
 */
export function takeNLines(n: number): FinishedCallback {
    return (text: string): number | undefined => {
        const lines = text.split('\n');
        if (lines.length > n + 1) {
            return lines.slice(0, n + 1).join('\n').length;
        }
        return undefined;
    };
}

/** 默认的多行评分模型（简化实现） */
export class DefaultMultilineModel implements IMultilineModel {
    score(prompt: PromptInfo, languageId: string): number {
        // 简化实现：基于启发式规则
        const prefix = prompt.prefix;

        // 检测函数定义、类定义等模式
        const patterns: Record<string, RegExp[]> = {
            javascript: [/function\s*\w*\s*\([^)]*\)\s*{$/, /class\s+\w+\s*{$/, /if\s*\([^)]*\)\s*{$/, /for\s*\([^)]*\)\s*{$/],
            python: [/def\s+\w+\s*\([^)]*\):$/, /class\s+\w+.*:$/, /if\s+.*:$/, /for\s+.*:$/, /while\s+.*:$/],
        };

        const languagePatterns = patterns[languageId];
        if (!languagePatterns) {
            return 0.3; // 默认分数
        }

        // 获取 prefix 的最后一行
        const lines = prefix.split('\n');
        const lastLine = lines[lines.length - 1] ?? '';

        // 检测模式匹配
        for (const pattern of languagePatterns) {
            if (pattern.test(lastLine.trim())) {
                return 0.8; // 高概率应该多行
            }
        }

        // 检测是否在开括号后
        const openBrackets = (lastLine.match(/[{([]/g) ?? []);
        const closeBrackets = (lastLine.match(/[)}\]]/g) ?? []);
        if (openBrackets.length > closeBrackets.length) {
            return 0.6; // 中等概率
        }

        return 0.3; // 低概率
    }
}
