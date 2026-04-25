/**
 * ContextProviderRegistry
 * 上下文提供者注册与解析框架
 */

import type { CompletionRequestContext, ResolvedContextItems } from '../types.js';

/** 上下文项 */
export interface ContextItem {
    /** 内容文本 */
    text: string;
    /** 来源标识 */
    source: string;
    /** 相关性分数 (0-1) */
    relevance?: number;
}

/** 上下文提供者接口 */
export interface IContextProvider {
    /** 提供者 ID */
    readonly id: string;
    /** 解析上下文 */
    resolve(context: CompletionRequestContext): Promise<ContextItem[]>;
    /** 时间预算（ms），默认 150 */
    timeBudget: number;
}

/** 上下文提供者注册表 */
export class ContextProviderRegistry {
    private providers: IContextProvider[] = [];

    /**
     * 注册上下文提供者
     */
    register(provider: IContextProvider): void {
        this.providers.push(provider);
    }

    /**
     * 注销上下文提供者
     */
    unregister(providerId: string): void {
        this.providers = this.providers.filter(p => p.id !== providerId);
    }

    /**
     * 解析所有注册的上下文提供者
     */
    async resolve(context: CompletionRequestContext): Promise<ResolvedContextItems> {
        const results: ResolvedContextItems = {
            traits: [],
            codeSnippets: [],
            diagnostics: [],
            similarFiles: [],
            recentEdits: [],
        };

        const promises = this.providers.map(async provider => {
            const startTime = Date.now();
            const timeout = provider.timeBudget ?? 150;

            try {
                // 带超时的解析
                const items = await Promise.race([
                    provider.resolve(context),
                    new Promise<ContextItem[]>((_, reject) =>
                        setTimeout(() => reject(new Error('Timeout')), timeout),
                    ),
                ]);

                // 根据提供者 ID 分类结果
                this.categorizeItems(provider.id, items, results);
            } catch (error) {
                // 超时或错误，忽略此提供者
                // eslint-disable-next-line no-console
                console.warn(`[ContextProvider] ${provider.id} failed:`, error);
            }
        });

        await Promise.all(promises);

        return results;
    }

    /**
     * 分类上下文项
     */
    private categorizeItems(
        providerId: string,
        items: ContextItem[],
        results: ResolvedContextItems,
    ): void {
        for (const item of items) {
            switch (providerId) {
            case 'traits':
                results.traits?.push({ key: item.source, value: item.text });
                break;
            case 'codeSnippets':
                results.codeSnippets?.push(item.text);
                break;
            case 'diagnostics':
                results.diagnostics?.push(item.text);
                break;
            case 'similarFiles':
                results.similarFiles?.push(item.text);
                break;
            case 'recentEdits':
                results.recentEdits?.push(item.text);
                break;
            default:
                // 未知提供者，根据 source 推断
                if (item.source === 'diagnostic') {
                    results.diagnostics?.push(item.text);
                } else if (item.source === 'similarFile') {
                    results.similarFiles?.push(item.text);
                } else if (item.source === 'recentEdit') {
                    results.recentEdits?.push(item.text);
                }
            }
        }
    }

    /**
     * 清空所有提供者
     */
    clear(): void {
        this.providers = [];
    }

    /**
     * 获取所有注册的提供者
     */
    getProviders(): IContextProvider[] {
        return [...this.providers];
    }
}

/**
 * Traits 提供者
 * 元数据特征
 */
export class TraitsProvider implements IContextProvider {
    readonly id = 'traits';
    timeBudget = 50;

    private traits: Map<string, string> = new Map();

    /**
     * 设置特征
     */
    setTrait(key: string, value: string): void {
        this.traits.set(key, value);
    }

    /**
     * 获取特征
     */
    getTrait(key: string): string | undefined {
        return this.traits.get(key);
    }

    async resolve(): Promise<ContextItem[]> {
        const items: ContextItem[] = [];

        for (const [key, value] of this.traits) {
            items.push({
                text: value,
                source: key,
                relevance: 1.0,
            });
        }

        return items;
    }
}

/**
 * 代码片段提供者
 */
export class CodeSnippetsProvider implements IContextProvider {
    readonly id = 'codeSnippets';
    timeBudget = 100;

    private snippets: string[] = [];

    /**
     * 添加代码片段
     */
    addSnippet(snippet: string): void {
        this.snippets.push(snippet);
        // 限制数量
        if (this.snippets.length > 10) {
            this.snippets.shift();
        }
    }

    async resolve(): Promise<ContextItem[]> {
        return this.snippets.map((text, index) => ({
            text,
            source: `snippet-${index}`,
            relevance: 0.8 - index * 0.05,
        }));
    }
}

/**
 * 诊断信息提供者
 */
export class DiagnosticsProvider implements IContextProvider {
    readonly id = 'diagnostics';
    timeBudget = 100;

    private diagnostics: Array<{ message: string; severity: string; line: number }> = [];

    /**
     * 添加诊断信息
     */
    addDiagnostic(diagnostic: { message: string; severity: string; line: number }): void {
        this.diagnostics.push(diagnostic);
        // 限制数量
        if (this.diagnostics.length > 20) {
            this.diagnostics.shift();
        }
    }

    async resolve(): Promise<ContextItem[]> {
        return this.diagnostics.map(d => ({
            text: `[${d.severity}] Line ${d.line}: ${d.message}`,
            source: 'diagnostic',
            relevance: d.severity === 'error' ? 1.0 : 0.7,
        }));
    }
}

/**
 * 邻近文件提供者
 */
export class SimilarFilesProvider implements IContextProvider {
    readonly id = 'similarFiles';
    timeBudget = 150;

    private files: Map<string, { content: string; similarity: number }> = new Map();

    /**
     * 添加邻近文件
     */
    addFile(uri: string, content: string, similarity: number): void {
        this.files.set(uri, { content, similarity });
    }

    async resolve(): Promise<ContextItem[]> {
        const items: ContextItem[] = [];

        // 按相似度排序
        const sorted = Array.from(this.files.entries())
            .sort((a, b) => b[1].similarity - a[1].similarity);

        for (const [uri, { content, similarity }] of sorted.slice(0, 5)) {
            items.push({
                text: `// File: ${uri}\n${content.slice(0, 1000)}`, // 限制长度
                source: 'similarFile',
                relevance: similarity,
            });
        }

        return items;
    }
}

/**
 * 最近编辑提供者
 */
export class RecentEditsProvider implements IContextProvider {
    readonly id = 'recentEdits';
    timeBudget = 50;

    private edits: Array<{ text: string; timestamp: number }> = [];

    /**
     * 添加编辑
     */
    addEdit(text: string): void {
        this.edits.push({ text, timestamp: Date.now() });
        // 限制数量，保留最近的 10 个
        if (this.edits.length > 10) {
            this.edits.shift();
        }
    }

    async resolve(): Promise<ContextItem[]> {
        // 按时间排序（最新的在前）
        const sorted = [...this.edits].sort((a, b) => b.timestamp - a.timestamp);

        return sorted.slice(0, 5).map((edit, index) => ({
            text: edit.text,
            source: 'recentEdit',
            relevance: 1.0 - index * 0.1,
        }));
    }
}
