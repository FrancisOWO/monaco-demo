/**
 * Prompt 组件接口
 * 用于构建级联预算的 Prompt
 */

import type {
    CompletionRequestContext,
    PromptInfo,
} from '../types.js';

/** 已解析的上下文项 */
export interface ResolvedContextItems {
    traits?: Array<{ key: string; value: string }>;
    codeSnippets?: string[];
    diagnostics?: string[];
    similarFiles?: string[];
    recentEdits?: string[];
}

/** Prompt 组件接口 */
export interface IPromptComponent {
    /** 组件 ID */
    readonly id: string;

    /** 渲染组件文本，受 token 预算限制 */
    render(
        budget: number,
        context: CompletionRequestContext,
        items?: ResolvedContextItems,
    ): { text: string; cost: number };

    /** 估算该组件在给定上下文下的 token 成本 */
    estimatedCost?(
        context: CompletionRequestContext,
        items?: ResolvedContextItems,
    ): number;
}

/** 文档前缀组件：光标前内容 */
export class DocumentPrefixComponent implements IPromptComponent {
    readonly id = 'prefix';

    render(budget: number, context: CompletionRequestContext): { text: string; cost: number } {
        const prefix = context.prompt.prefix;
        // 简单估算：每 4 个字符约 1 个 token
        const estimatedTokens = Math.ceil(prefix.length / 4);

        if (estimatedTokens <= budget) {
            return { text: prefix, cost: estimatedTokens };
        }

        // 截断到预算内
        const truncatedLength = Math.floor(budget * 4);
        const truncated = prefix.slice(-truncatedLength);
        return { text: truncated, cost: budget };
    }

    estimatedCost(context: CompletionRequestContext): number {
        return Math.ceil(context.prompt.prefix.length / 4);
    }
}

/** 文档后缀组件：光标后内容 */
export class DocumentSuffixComponent implements IPromptComponent {
    readonly id = 'suffix';
    private cache = new Map<string, string>();

    render(budget: number, context: CompletionRequestContext): { text: string; cost: number } {
        const suffix = context.prompt.suffix;
        if (!suffix) {
            return { text: '', cost: 0 };
        }

        const estimatedTokens = Math.ceil(suffix.length / 4);

        if (estimatedTokens <= budget) {
            return { text: suffix, cost: estimatedTokens };
        }

        // 截断到预算内
        const truncatedLength = Math.floor(budget * 4);
        const truncated = suffix.slice(0, truncatedLength);
        return { text: truncated, cost: budget };
    }

    estimatedCost(context: CompletionRequestContext): number {
        return Math.ceil(context.prompt.suffix.length / 4);
    }

    /** 基于编辑距离的 suffix 缓存匹配 */
    findSimilarSuffix(suffix: string): string | undefined {
        // 简化实现：直接返回缓存中的第一个匹配
        for (const [key, value] of this.cache) {
            if (this.calculateLevenshteinDistance(suffix, key) < suffix.length * 0.2) {
                return value;
            }
        }
        return undefined;
    }

    /** 添加到缓存 */
    cacheSuffix(original: string, processed: string): void {
        this.cache.set(original, processed);
        // 限制缓存大小
        if (this.cache.size > 100) {
            const firstKey = this.cache.keys().next().value;
            if (firstKey !== undefined) {
                this.cache.delete(firstKey);
            }
        }
    }

    /** 计算 Levenshtein 编辑距离 */
    private calculateLevenshteinDistance(a: string, b: string): number {
        const matrix: number[][] = [];

        for (let i = 0; i <= b.length; i++) {
            matrix[i] = [i];
        }

        for (let j = 0; j <= a.length; j++) {
            matrix[0][j] = j;
        }

        for (let i = 1; i <= b.length; i++) {
            for (let j = 1; j <= a.length; j++) {
                if (b.charAt(i - 1) === a.charAt(j - 1)) {
                    matrix[i][j] = matrix[i - 1][j - 1];
                } else {
                    matrix[i][j] = Math.min(
                        matrix[i - 1][j - 1] + 1,
                        matrix[i][j - 1] + 1,
                        matrix[i - 1][j] + 1,
                    );
                }
            }
        }

        return matrix[b.length][a.length];
    }
}

/** 文档标记组件：文件路径/语言标记 */
export class DocumentMarkerComponent implements IPromptComponent {
    readonly id = 'marker';

    render(_budget: number, context: CompletionRequestContext): { text: string; cost: number } {
        const uri = context.uri;
        const languageId = context.languageId;
        const text = `<|file|>${uri}<|language|>${languageId}\n`;
        return { text, cost: Math.ceil(text.length / 4) };
    }

    estimatedCost(context: CompletionRequestContext): number {
        const text = `<|file|>${context.uri}<|language|>${context.languageId}\n`;
        return Math.ceil(text.length / 4);
    }
}

/** Traits 组件：元数据特征 */
export class TraitsComponent implements IPromptComponent {
    readonly id = 'traits';

    render(budget: number, _context: CompletionRequestContext, items?: ResolvedContextItems): { text: string; cost: number } {
        if (!items?.traits || items.traits.length === 0) {
            return { text: '', cost: 0 };
        }

        const traits = items.traits
            .map(t => `${t.key}: ${t.value}`)
            .join('\n');

        const estimatedTokens = Math.ceil(traits.length / 4);
        if (estimatedTokens <= budget) {
            return { text: traits, cost: estimatedTokens };
        }

        // 截断
        const truncatedLength = Math.floor(budget * 4);
        return { text: traits.slice(0, truncatedLength), cost: budget };
    }
}

/** 诊断信息组件 */
export class DiagnosticsComponent implements IPromptComponent {
    readonly id = 'diagnostics';

    render(budget: number, _context: CompletionRequestContext, items?: ResolvedContextItems): { text: string; cost: number } {
        if (!items?.diagnostics || items.diagnostics.length === 0) {
            return { text: '', cost: 0 };
        }

        const diagnostics = items.diagnostics.join('\n');
        const estimatedTokens = Math.ceil(diagnostics.length / 4);

        if (estimatedTokens <= budget) {
            return { text: diagnostics, cost: estimatedTokens };
        }

        const truncatedLength = Math.floor(budget * 4);
        return { text: diagnostics.slice(0, truncatedLength), cost: budget };
    }
}

/** 代码片段组件 */
export class CodeSnippetsComponent implements IPromptComponent {
    readonly id = 'codeSnippets';

    render(budget: number, _context: CompletionRequestContext, items?: ResolvedContextItems): { text: string; cost: number } {
        if (!items?.codeSnippets || items.codeSnippets.length === 0) {
            return { text: '', cost: 0 };
        }

        const snippets = items.codeSnippets.join('\n---\n');
        const estimatedTokens = Math.ceil(snippets.length / 4);

        if (estimatedTokens <= budget) {
            return { text: snippets, cost: estimatedTokens };
        }

        const truncatedLength = Math.floor(budget * 4);
        return { text: snippets.slice(0, truncatedLength), cost: budget };
    }
}

/** 相似文件组件 */
export class SimilarFilesComponent implements IPromptComponent {
    readonly id = 'similarFiles';

    render(budget: number, _context: CompletionRequestContext, items?: ResolvedContextItems): { text: string; cost: number } {
        if (!items?.similarFiles || items.similarFiles.length === 0) {
            return { text: '', cost: 0 };
        }

        const files = items.similarFiles.join('\n---\n');
        const estimatedTokens = Math.ceil(files.length / 4);

        if (estimatedTokens <= budget) {
            return { text: files, cost: estimatedTokens };
        }

        const truncatedLength = Math.floor(budget * 4);
        return { text: files.slice(0, truncatedLength), cost: budget };
    }
}

/** 最近编辑组件 */
export class RecentEditsComponent implements IPromptComponent {
    readonly id = 'recentEdits';

    render(budget: number, _context: CompletionRequestContext, items?: ResolvedContextItems): { text: string; cost: number } {
        if (!items?.recentEdits || items.recentEdits.length === 0) {
            return { text: '', cost: 0 };
        }

        const edits = items.recentEdits.join('\n');
        const estimatedTokens = Math.ceil(edits.length / 4);

        if (estimatedTokens <= budget) {
            return { text: edits, cost: estimatedTokens };
        }

        const truncatedLength = Math.floor(budget * 4);
        return { text: edits.slice(0, truncatedLength), cost: budget };
    }
}
