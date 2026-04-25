/**
 * CascadingPromptFactory
 * 级联预算 Prompt 构建工厂
 */

import type * as monaco from 'monaco-editor';
import type {
    IPromptFactory,
    PromptInfo,
    CompletionRequestContext,
    PromptAllocation,
    ResolvedContextItems,
} from '../types.js';
import { trimLastLine } from './trimLastLine.js';
import type { IPromptComponent } from './components.js';
import {
    DocumentPrefixComponent,
    DocumentSuffixComponent,
    DocumentMarkerComponent,
    TraitsComponent,
    DiagnosticsComponent,
    CodeSnippetsComponent,
    SimilarFilesComponent,
    RecentEditsComponent,
} from './components.js';

/** 上下文提供者注册表接口 */
export interface IContextProviderRegistry {
    /** 解析所有注册的上下文提供者 */
    resolve(context: CompletionRequestContext): Promise<ResolvedContextItems>;
}

/** 级联预算 Prompt 工厂 */
export class CascadingPromptFactory implements IPromptFactory {
    private allocation: PromptAllocation = {
        prefix: 35,
        suffix: 15,
        stableContext: 35,
        volatileContext: 15,
    };

    private maxPromptLength = 2048; // 默认最大 token 数
    private components: Map<string, IPromptComponent> = new Map();

    constructor(
        private editor: monaco.editor.ICodeEditor,
        private contextProviderRegistry: IContextProviderRegistry,
    ) {
        // 初始化默认组件
        this.registerComponent(new DocumentPrefixComponent());
        this.registerComponent(new DocumentSuffixComponent());
        this.registerComponent(new DocumentMarkerComponent());
        this.registerComponent(new TraitsComponent());
        this.registerComponent(new DiagnosticsComponent());
        this.registerComponent(new CodeSnippetsComponent());
        this.registerComponent(new SimilarFilesComponent());
        this.registerComponent(new RecentEditsComponent());
    }

    /**
     * 注册 Prompt 组件
     */
    registerComponent(component: IPromptComponent): void {
        this.components.set(component.id, component);
    }

    /**
     * 获取组件
     */
    getComponent(id: string): IPromptComponent | undefined {
        return this.components.get(id);
    }

    getAllocation(): PromptAllocation {
        return { ...this.allocation };
    }

    getMaxPromptLength(): number {
        return this.maxPromptLength;
    }

    /**
     * 设置预算分配
     */
    setAllocation(allocation: PromptAllocation): void {
        this.allocation = allocation;
    }

    /**
     * 设置最大 Prompt 长度
     */
    setMaxPromptLength(length: number): void {
        this.maxPromptLength = length;
    }

    async buildPrompt(context: CompletionRequestContext): Promise<PromptInfo> {
        const maxPromptLength = this.getMaxPromptLength();
        const allocation = this.getAllocation();

        // 1. 解析外部上下文
        const contextItems = await this.contextProviderRegistry.resolve(context);

        // 2. 确定级联顺序
        const suffixComponent = this.getComponent('suffix') as DocumentSuffixComponent;
        const suffixAllocation = (allocation.suffix / 100) * maxPromptLength;
        const estimatedMaxSuffixCost = suffixComponent?.estimatedCost?.(context) ?? 0;

        // 决定级联顺序：如果 suffix 预算足够，先处理 suffix
        const cascadeOrder = suffixAllocation > 0.8 * estimatedMaxSuffixCost
            ? ['stableContext', 'volatileContext', 'suffix', 'prefix']
            : ['stableContext', 'volatileContext', 'prefix', 'suffix'];

        // 3. 级联渲染
        let surplusBudget = 0;
        const rendered: Map<string, { text: string; cost: number }> = new Map();

        for (const id of cascadeOrder) {
            const componentBudget = surplusBudget + maxPromptLength * (allocation[id as keyof PromptAllocation] / 100);
            const component = this.getComponent(id);

            if (component) {
                const result = component.render(componentBudget, context, contextItems);
                surplusBudget = componentBudget - result.cost;
                rendered.set(id, result);
            } else {
                // 处理组合组件（stableContext, volatileContext）
                const result = this.renderCompositeComponent(
                    id,
                    componentBudget,
                    context,
                    contextItems,
                );
                surplusBudget = componentBudget - result.cost;
                rendered.set(id, result);
            }
        }

        // 4. 分离尾部空白
        const prefixResult = rendered.get('prefix') ?? { text: '', cost: 0 };
        const [prefix, trailingWs] = trimLastLine(prefixResult.text);

        const suffixResult = rendered.get('suffix') ?? { text: '', cost: 0 };

        // 计算 token 数
        const prefixTokens = Math.ceil(prefix.length / 4);
        const suffixTokens = Math.ceil(suffixResult.text.length / 4);

        return {
            prefix,
            suffix: suffixResult.text,
            context: [
                rendered.get('stableContext')?.text ?? '',
                rendered.get('volatileContext')?.text ?? '',
            ].filter(Boolean),
            prefixTokens,
            suffixTokens,
            isFimEnabled: suffixResult.text.length > 0,
            trailingWs,
        };
    }

    /**
     * 渲染组合组件
     */
    private renderCompositeComponent(
        id: string,
        budget: number,
        context: CompletionRequestContext,
        items: ResolvedContextItems,
    ): { text: string; cost: number } {
        if (id === 'stableContext') {
            // 稳定上下文：SimilarFiles + CodeSnippets
            return this.renderStableContext(budget, context, items);
        }

        if (id === 'volatileContext') {
            // 易变上下文：Diagnostics + RecentEdits + Traits
            return this.renderVolatileContext(budget, context, items);
        }

        return { text: '', cost: 0 };
    }

    /**
     * 渲染稳定上下文
     */
    private renderStableContext(
        budget: number,
        context: CompletionRequestContext,
        items: ResolvedContextItems,
    ): { text: string; cost: number } {
        const similarFiles = this.getComponent('similarFiles')?.render(budget, context, items) ?? { text: '', cost: 0 };
        const remainingBudget = budget - similarFiles.cost;

        const codeSnippets = this.getComponent('codeSnippets')?.render(remainingBudget, context, items) ?? { text: '', cost: 0 };

        const combined = [similarFiles.text, codeSnippets.text].filter(Boolean).join('\n---\n');

        return {
            text: combined,
            cost: similarFiles.cost + codeSnippets.cost,
        };
    }

    /**
     * 渲染易变上下文
     */
    private renderVolatileContext(
        budget: number,
        context: CompletionRequestContext,
        items: ResolvedContextItems,
    ): { text: string; cost: number } {
        const diagnostics = this.getComponent('diagnostics')?.render(budget, context, items) ?? { text: '', cost: 0 };
        let remainingBudget = budget - diagnostics.cost;

        const recentEdits = this.getComponent('recentEdits')?.render(remainingBudget, context, items) ?? { text: '', cost: 0 };
        remainingBudget -= recentEdits.cost;

        const traits = this.getComponent('traits')?.render(remainingBudget, context, items) ?? { text: '', cost: 0 };

        const combined = [
            diagnostics.text,
            recentEdits.text,
            traits.text,
        ].filter(Boolean).join('\n');

        return {
            text: combined,
            cost: diagnostics.cost + recentEdits.cost + traits.cost,
        };
    }
}

// 导出所有组件
export * from './components.js';
export * from './trimLastLine.js';
