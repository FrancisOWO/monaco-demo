/**
 * 补全模型选择器
 * 根据语言、上下文大小、策略等参数选择最佳补全模型配置
 */

import type {
    IModelSelector,
    FimModelConfig,
    CompletionRequestContext,
} from '../types.js';
import { aiCompletionConfig } from '../aiCompletionConfig.js';

/**
 * 默认模型选择器
 * 选择策略：
 * 1. 查语言优先映射表 (languageModelMap)
 * 2. 从 models 中找支持该语言且优先级最高的模型
 * 3. 回退到全局最低优先级模型
 */
export class DefaultModelSelector implements IModelSelector {
    private models: FimModelConfig[];

    constructor(models?: FimModelConfig[]) {
        this.models = models ?? [...aiCompletionConfig.models];
    }

    selectModel(context: CompletionRequestContext): FimModelConfig {
        const languageId = context.languageId;

        // 1. 查语言优先映射表
        const preferredList = aiCompletionConfig.languageModelMap[languageId];
        if (preferredList && preferredList.length > 0) {
            for (const modelId of preferredList) {
                const model = this.models.find(m => m.modelId === modelId);
                if (model) {
                    return model;
                }
            }
        }

        // 2. 找支持该语言且优先级最高的模型
        const languageModels = this.models
            .filter(m => m.supportedLanguages.length === 0 || m.supportedLanguages.includes(languageId))
            .sort((a, b) => a.priority - b.priority);

        if (languageModels.length > 0) {
            return languageModels[0];
        }

        // 3. 回退到全局最低优先级模型
        const sorted = [...this.models].sort((a, b) => a.priority - b.priority);
        return sorted[0] ?? this.models[0];
    }

    getAvailableModels(): FimModelConfig[] {
        return [...this.models];
    }

    addModel(config: FimModelConfig): void {
        // 不重复添加
        if (this.models.some(m => m.modelId === config.modelId)) {
            return;
        }
        this.models.push(config);
    }

    removeModel(modelId: string): void {
        this.models = this.models.filter(m => m.modelId !== modelId);
    }
}