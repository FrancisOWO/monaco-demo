/**
 * BlockTrimmerRegistry
 * AST 裁剪注册中心
 * 支持 VerboseBlockTrimmer 和 TerseBlockTrimmer
 */

import {
    BlockPositionType,
    type FinishedCallback,
} from '../types.js';

/** BlockTrimmer 注册表接口 */
export interface IBlockTrimmerRegistry {
    /** 是否支持该语言的 AST 解析 */
    isSupported(languageId: string): boolean;

    /** 获取光标在块中的位置类型 */
    getBlockPositionType(
        document: string,
        position: { lineNumber: number; column: number },
    ): Promise<BlockPositionType>;

    /** 检查是否在空块起始 */
    isEmptyBlockStart(
        document: string,
        position: { lineNumber: number; column: number },
    ): Promise<boolean>;

    /** AST 解析块体完成判定回调 */
    parsingBlockFinished(
        document: string,
        position: { lineNumber: number; column: number },
    ): FinishedCallback;

    /** VerboseBlockTrimmer：获取最长合理补全 */
    verboseTrim(
        languageId: string,
        prefix: string,
        completion: string,
        lineLimit: number,
    ): Promise<number | undefined>;

    /** TerseBlockTrimmer：获取更简洁的补全 */
    terseTrim(
        languageId: string,
        prefix: string,
        completion: string,
        lineLimit: number,
        lookAhead: number,
    ): Promise<number | undefined>;
}

/** 块裁剪器接口 */
export interface IBlockTrimmer {
    /** 支持的语言 */
    supportedLanguages: string[];

    /** 获取块位置类型 */
    getBlockPositionType(
        document: string,
        position: { lineNumber: number; column: number },
    ): BlockPositionType;

    /** 检查空块起始 */
    isEmptyBlockStart(
        document: string,
        position: { lineNumber: number; column: number },
    ): boolean;

    /** 解析块体完成判定 */
    parsingBlockFinished(
        document: string,
        position: { lineNumber: number; column: number },
    ): FinishedCallback;

    /** Verbose 裁剪 */
    verboseTrim(
        prefix: string,
        completion: string,
        lineLimit: number,
    ): number | undefined;

    /** Terse 裁剪 */
    terseTrim(
        prefix: string,
        completion: string,
        lineLimit: number,
        lookAhead: number,
    ): number | undefined;
}

/**
 * 基于启发式的块裁剪器
 * 简化实现，不依赖 Tree-sitter
 */
export class HeuristicBlockTrimmer implements IBlockTrimmer {
    supportedLanguages = ['typescript', 'javascript', 'python', 'go', 'rust', 'cpp', 'c'];

    getBlockPositionType(
        document: string,
        position: { lineNumber: number; column: number },
    ): BlockPositionType {
        const lines = document.split('\n');
        const currentLine = lines[position.lineNumber - 1] ?? '';
        const beforeCursor = currentLine.slice(0, position.column - 1).trim();
        const afterCursor = currentLine.slice(position.column - 1).trim();

        // 检测是否在空块内
        if (beforeCursor.endsWith('{') || beforeCursor.endsWith(':') || beforeCursor.endsWith('(')) {
            if (afterCursor === '' || afterCursor.startsWith('}') || afterCursor.startsWith(')')) {
                return BlockPositionType.EmptyBlock;
            }
        }

        // 检测是否在块末尾
        if (afterCursor.startsWith('}') || afterCursor.startsWith(')')) {
            return BlockPositionType.BlockEnd;
        }

        // 检测是否在块中间
        if (this.isInsideBlock(lines, position.lineNumber)) {
            return BlockPositionType.MidBlock;
        }

        return BlockPositionType.NonBlock;
    }

    isEmptyBlockStart(
        document: string,
        position: { lineNumber: number; column: number },
    ): boolean {
        const lines = document.split('\n');
        const currentLine = lines[position.lineNumber - 1] ?? '';
        const beforeCursor = currentLine.slice(0, position.column - 1).trim();

        // 检测常见的空块起始模式
        const emptyBlockPatterns = [
            /\{\s*$/,           // {
            /\(\s*$/,           // (
            /\[\s*$/,           // [
            /:\s*$/,            // :
            /=>\s*\{\s*$/,      // => {
            /function\s*\w*\s*\([^)]*\)\s*\{\s*$/, // function() {
            /if\s*\([^)]*\)\s*\{\s*$/, // if() {
            /for\s*\([^)]*\)\s*\{\s*$/, // for() {
            /while\s*\([^)]*\)\s*\{\s*$/, // while() {
            /def\s+\w+\s*\([^)]*\):\s*$/, // Python def
            /class\s+\w+.*:\s*$/, // Python class
        ];

        for (const pattern of emptyBlockPatterns) {
            if (pattern.test(beforeCursor)) {
                return true;
            }
        }

        return false;
    }

    parsingBlockFinished(
        _document: string,
        _position: { lineNumber: number; column: number },
    ): FinishedCallback {
        return (text: string): number | undefined => {
            // 检测块是否完整（括号匹配）
            const lines = text.split('\n');
            let openBrackets = 0;
            let closeBrackets = 0;

            for (const line of lines) {
                for (const char of line) {
                    if (char === '{' || char === '(' || char === '[') {
                        openBrackets++;
                    } else if (char === '}' || char === ')' || char === ']') {
                        closeBrackets++;
                    }
                }
            }

            // 如果闭合括号不少于开启括号，认为块已完成
            if (closeBrackets >= openBrackets && openBrackets > 0) {
                // 找到最后一个闭合括号的位置
                let pos = 0;
                for (let i = 0; i < lines.length; i++) {
                    const line = lines[i];
                    if (i === lines.length - 1) {
                        // 最后一行，找到最后一个闭合括号
                        for (let j = line.length - 1; j >= 0; j--) {
                            if (['}', ')', ']'].includes(line[j])) {
                                return pos + j + 1;
                            }
                        }
                    }
                    pos += line.length + 1; // +1 for newline
                }
            }

            return undefined;
        };
    }

    verboseTrim(
        _prefix: string,
        completion: string,
        lineLimit: number,
    ): number | undefined {
        const lines = completion.split('\n');

        if (lines.length <= lineLimit) {
            return undefined; // 不需要裁剪
        }

        // 在限制行数处裁剪
        let pos = 0;
        for (let i = 0; i < Math.min(lineLimit, lines.length); i++) {
            pos += lines[i].length + 1; // +1 for newline
        }

        // 尝试在完整的语句处结束
        for (let i = Math.min(lineLimit, lines.length) - 1; i >= 0; i--) {
            const line = lines[i].trim();
            // 检测语句结束
            if (line.endsWith(';') || line.endsWith('}') || line.endsWith(')')) {
                let endPos = 0;
                for (let j = 0; j <= i; j++) {
                    endPos += lines[j].length + 1;
                }
                return endPos;
            }
        }

        return pos;
    }

    terseTrim(
        _prefix: string,
        completion: string,
        lineLimit: number,
        lookAhead: number,
    ): number | undefined {
        // Terse 裁剪更激进，使用 lookAhead 来决定裁剪位置
        const lines = completion.split('\n');
        const effectiveLimit = Math.max(lineLimit, lookAhead);

        if (lines.length <= effectiveLimit) {
            return undefined;
        }

        // 在更短的位置裁剪
        let pos = 0;
        for (let i = 0; i < Math.min(effectiveLimit, lines.length); i++) {
            pos += lines[i].length + 1;
        }

        return pos;
    }

    /**
     * 检查是否在块内
     */
    private isInsideBlock(lines: string[], lineNumber: number): boolean {
        let indentLevel = 0;

        for (let i = 0; i < lineNumber && i < lines.length; i++) {
            const line = lines[i];
            const trimmed = line.trim();

            // 检测块开始
            if (trimmed.endsWith('{') || trimmed.endsWith(':')) {
                indentLevel++;
            }

            // 检测块结束
            if (trimmed.startsWith('}') || trimmed.startsWith('return')) {
                indentLevel--;
            }
        }

        return indentLevel > 0;
    }
}

/**
 * BlockTrimmer 注册表
 */
export class BlockTrimmerRegistry implements IBlockTrimmerRegistry {
    private trimmers: Map<string, IBlockTrimmer> = new Map();
    private defaultTrimmer: IBlockTrimmer;

    constructor() {
        this.defaultTrimmer = new HeuristicBlockTrimmer();
    }

    /**
     * 注册裁剪器
     */
    register(languageId: string, trimmer: IBlockTrimmer): void {
        this.trimmers.set(languageId, trimmer);
    }

    /**
     * 获取裁剪器
     */
    getTrimmer(languageId: string): IBlockTrimmer {
        return this.trimmers.get(languageId) ?? this.defaultTrimmer;
    }

    isSupported(languageId: string): boolean {
        const trimmer = this.getTrimmer(languageId);
        return trimmer.supportedLanguages.includes(languageId);
    }

    async getBlockPositionType(
        document: string,
        position: { lineNumber: number; column: number },
    ): Promise<BlockPositionType> {
        // 简化实现：使用默认裁剪器
        return this.defaultTrimmer.getBlockPositionType(document, position);
    }

    async isEmptyBlockStart(
        document: string,
        position: { lineNumber: number; column: number },
    ): Promise<boolean> {
        return this.defaultTrimmer.isEmptyBlockStart(document, position);
    }

    parsingBlockFinished(
        document: string,
        position: { lineNumber: number; column: number },
    ): FinishedCallback {
        return this.defaultTrimmer.parsingBlockFinished(document, position);
    }

    async verboseTrim(
        languageId: string,
        prefix: string,
        completion: string,
        lineLimit: number,
    ): Promise<number | undefined> {
        const trimmer = this.getTrimmer(languageId);
        return trimmer.verboseTrim(prefix, completion, lineLimit);
    }

    async terseTrim(
        languageId: string,
        prefix: string,
        completion: string,
        lineLimit: number,
        lookAhead: number,
    ): Promise<number | undefined> {
        const trimmer = this.getTrimmer(languageId);
        return trimmer.terseTrim(prefix, completion, lineLimit, lookAhead);
    }
}
