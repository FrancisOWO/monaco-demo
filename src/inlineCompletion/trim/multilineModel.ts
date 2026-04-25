/**
 * MultilineModel
 * ML 多行评分模型
 * 用于 JavaScript/Python 等语言的多行补全判定
 */

import type { PromptInfo } from '../types.js';

/**
 * 多行评分模型接口
 */
export interface IMultilineModel {
    /**
     * 评分 prompt 是否应该生成多行补全
     * @returns 0-1 的分数，>0.5 表示应该多行
     */
    score(prompt: PromptInfo, languageId: string): number;
}

/**
 * 基于启发式的多行评分模型
 * 简化实现，基于代码模式匹配
 */
export class MultilineModel implements IMultilineModel {
    private languagePatterns: Record<string, MultilinePattern[]>;

    constructor() {
        this.languagePatterns = {
            javascript: this.getJavaScriptPatterns(),
            typescript: this.getJavaScriptPatterns(),
            python: this.getPythonPatterns(),
        };
    }

    score(prompt: PromptInfo, languageId: string): number {
        const patterns = this.languagePatterns[languageId];
        if (!patterns) {
            return 0.3; // 默认分数
        }

        const prefix = prompt.prefix;
        const lines = prefix.split('\n');
        const lastLine = lines[lines.length - 1]?.trim() ?? '';
        const secondLastLine = lines[lines.length - 2]?.trim() ?? '';

        let score = 0.3; // 基础分数

        // 评估每条模式
        for (const pattern of patterns) {
            if (pattern.test(lastLine, secondLastLine)) {
                score += pattern.weight;
            }
        }

        // 检查缩进变化
        if (this.detectIndentIncrease(lines)) {
            score += 0.2;
        }

        // 检查未闭合的括号
        if (this.hasUnclosedBrackets(prefix)) {
            score += 0.3;
        }

        // 检查是否在类/函数定义后
        if (this.isAfterDefinition(lastLine)) {
            score += 0.2;
        }

        // 归一化到 0-1
        return Math.min(1, Math.max(0, score));
    }

    /**
     * 获取 JavaScript/TypeScript 模式
     */
    private getJavaScriptPatterns(): MultilinePattern[] {
        return [
            // 函数定义
            { test: (line) => /function\s*\w*\s*\([^)]*\)\s*{$/.test(line), weight: 0.5 },
            // 箭头函数
            { test: (line) => /=>\s*\{\s*$/.test(line), weight: 0.4 },
            // 类定义
            { test: (line) => /class\s+\w+.*\{\s*$/.test(line), weight: 0.5 },
            // 方法定义
            { test: (line) => /\w+\s*\([^)]*\)\s*\{\s*$/.test(line), weight: 0.4 },
            // if 语句
            { test: (line) => /if\s*\([^)]*\)\s*\{\s*$/.test(line), weight: 0.3 },
            // for 循环
            { test: (line) => /for\s*\([^)]*\)\s*\{\s*$/.test(line), weight: 0.3 },
            // while 循环
            { test: (line) => /while\s*\([^)]*\)\s*\{\s*$/.test(line), weight: 0.3 },
            // try/catch
            { test: (line) => /try\s*\{\s*$/.test(line), weight: 0.4 },
            // 对象字面量开始
            { test: (line) => /=\s*\{\s*$/.test(line), weight: 0.2 },
            // 数组字面量开始
            { test: (line) => /=\s*\[\s*$/.test(line), weight: 0.15 },
            // 回调函数开始
            { test: (line) => /\([^)]*function\s*\([^)]*\)\s*\{\s*$/.test(line), weight: 0.3 },
            // Promise then
            { test: (line) => /\.then\s*\([^)]*=>\s*\{\s*$/.test(line), weight: 0.3 },
            // switch 语句
            { test: (line) => /switch\s*\([^)]*\)\s*\{\s*$/.test(line), weight: 0.4 },
            // 空行后缩进
            { test: (line, prev) => line === '' && /^\s+/.test(prev), weight: 0.15 },
        ];
    }

    /**
     * 获取 Python 模式
     */
    private getPythonPatterns(): MultilinePattern[] {
        return [
            // 函数定义
            { test: (line) => /def\s+\w+\s*\([^)]*\):\s*$/.test(line), weight: 0.5 },
            // 类定义
            { test: (line) => /class\s+\w+.*:\s*$/.test(line), weight: 0.5 },
            // if 语句
            { test: (line) => /if\s+.*:\s*$/.test(line), weight: 0.3 },
            // for 循环
            { test: (line) => /for\s+.*:\s*$/.test(line), weight: 0.3 },
            // while 循环
            { test: (line) => /while\s+.*:\s*$/.test(line), weight: 0.3 },
            // try 语句
            { test: (line) => /try:\s*$/.test(line), weight: 0.4 },
            // with 语句
            { test: (line) => /with\s+.*:\s*$/.test(line), weight: 0.3 },
            // 列表推导式开始
            { test: (line) => /\[\s*\w+\s+for\s+.*$/.test(line), weight: 0.2 },
            // 函数参数换行
            { test: (line) => /def\s+\w+\s*\([^)]*$/.test(line), weight: 0.2 },
            // 装饰器
            { test: (line) => /^\s*@\w+/.test(line), weight: 0.3 },
            // 空行后缩进
            { test: (line, prev) => line === '' && /^\s+/.test(prev), weight: 0.15 },
        ];
    }

    /**
     * 检测缩进增加
     */
    private detectIndentIncrease(lines: string[]): boolean {
        if (lines.length < 2) {
            return false;
        }

        const lastLine = lines[lines.length - 1];
        const prevLine = lines[lines.length - 2];

        const lastIndent = lastLine.match(/^(\s*)/)?.[1]?.length ?? 0;
        const prevIndent = prevLine.match(/^(\s*)/)?.[1]?.length ?? 0;

        return lastIndent > prevIndent;
    }

    /**
     * 检查是否有未闭合的括号
     */
    private hasUnclosedBrackets(text: string): boolean {
        const openBrackets = (text.match(/[{(\[]/g) ?? []).length;
        const closeBrackets = (text.match(/[)}\]]/g) ?? []).length;
        return openBrackets > closeBrackets;
    }

    /**
     * 检查是否在定义之后
     */
    private isAfterDefinition(line: string): boolean {
        const patterns = [
            /function\s+\w+/, // JavaScript function
            /class\s+\w+/,    // JavaScript/TypeScript class
            /def\s+\w+/,      // Python def
            /const\s+\w+\s*=/, // const declaration
            /let\s+\w+\s*=/,  // let declaration
            /var\s+\w+\s*=/,  // var declaration
        ];

        for (const pattern of patterns) {
            if (pattern.test(line)) {
                return true;
            }
        }

        return false;
    }
}

/**
 * 多行模式
 */
interface MultilinePattern {
    /**
     * 测试是否匹配
     * @param line 最后一行
     * @param prevLine 倒数第二行
     */
    test(line: string, prevLine: string): boolean;
    /**
     * 权重
     */
    weight: number;
}
