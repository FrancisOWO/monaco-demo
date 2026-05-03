/**
 * FIM (Fill-In-the-Middle) 格式适配器
 * 将 PromptInfo 转换为模型特定的 FIM prompt 字符串
 * 不同模型使用不同的标记格式，此模块提供统一接口
 */

import {
    FimFormat,
    type IFimAdapter,
    type PromptInfo,
    type CompletionStrategy,
} from '../types.js';

/**
 * Codex FIM 格式适配器
 * OpenAI Codex / GPT-Coder 系列
 * 格式: <|fim_prefix|>{prefix}<|fim_suffix|>{suffix}<|fim_middle|>
 */
export class CodexFimAdapter implements IFimAdapter {
    readonly formatType = FimFormat.Codex;

    format(prompt: PromptInfo, strategy: CompletionStrategy): string {
        const prefixText = this.buildPrefix(prompt);
        const suffixText = prompt.suffix;

        if (suffixText && prompt.isFimEnabled) {
            return `<|fim_prefix|>${prefixText}<|fim_suffix|>${suffixText}<|fim_middle|>`;
        }

        // 无 suffix 时做纯前缀补全
        return `${prefixText}`;
    }

    private buildPrefix(prompt: PromptInfo): string {
        const parts: string[] = [];

        // 添加上下文信息
        if (prompt.context.length > 0) {
            for (const ctx of prompt.context) {
                if (ctx) {
                    parts.push(ctx);
                }
            }
            parts.push(''); // 分隔空行
        }

        // 添加前缀
        parts.push(prompt.prefix);

        return parts.join('\n');
    }
}

/**
 * CodeLlama FIM 格式适配器
 * Meta CodeLlama 系列
 * 格式: <PRE>{prefix}<SUF>{suffix}<MID>
 */
export class CodeLlamaFimAdapter implements IFimAdapter {
    readonly formatType = FimFormat.CodeLlama;

    format(prompt: PromptInfo, strategy: CompletionStrategy): string {
        const prefixText = this.buildPrefix(prompt);
        const suffixText = prompt.suffix;

        if (suffixText && prompt.isFimEnabled) {
            return `<PRE> ${prefixText} <SUF>${suffixText} <MID>`;
        }

        return `${prefixText}`;
    }

    private buildPrefix(prompt: PromptInfo): string {
        const parts: string[] = [];

        if (prompt.context.length > 0) {
            for (const ctx of prompt.context) {
                if (ctx) {
                    parts.push(ctx);
                }
            }
            parts.push('');
        }

        parts.push(prompt.prefix);

        return parts.join('\n');
    }
}

/**
 * DeepSeek FIM 格式适配器
 * DeepSeek-Coder 系列
 * 格式: <|fim_prefix|>{prefix}<|fim_suffix|>{suffix}<|fim_middle|>
 * 与 Codex 格式类似，但上下文注入方式不同
 */
export class DeepSeekFimAdapter implements IFimAdapter {
    readonly formatType = FimFormat.DeepSeek;

    format(prompt: PromptInfo, strategy: CompletionStrategy): string {
        const prefixText = this.buildPrefix(prompt);
        const suffixText = prompt.suffix;

        if (suffixText && prompt.isFimEnabled) {
            return `<|fim_prefix|>${prefixText}<|fim_suffix|>${suffixText}<|fim_middle|>`;
        }

        return `${prefixText}`;
    }

    private buildPrefix(prompt: PromptInfo): string {
        const parts: string[] = [];

        // DeepSeek 将上下文放在 prefix 开头，用特殊标记分隔
        if (prompt.context.length > 0) {
            const contextStr = prompt.context.filter(Boolean).join('\n---\n');
            parts.push(`/* Context:\n${contextStr}\n*/`);
            parts.push('');
        }

        parts.push(prompt.prefix);

        return parts.join('\n');
    }
}

/**
 * StarCoder FIM 格式适配器
 * BigCode StarCoder 系列
 * 格式: <fim_prefix>{prefix}<fim_suffix>{suffix}<fim_middle>
 * 注意：标记不带 <|  |> 包裹
 */
export class StarCoderFimAdapter implements IFimAdapter {
    readonly formatType = FimFormat.StarCoder;

    format(prompt: PromptInfo, strategy: CompletionStrategy): string {
        const prefixText = this.buildPrefix(prompt);
        const suffixText = prompt.suffix;

        if (suffixText && prompt.isFimEnabled) {
            return `<fim_prefix>${prefixText}<fim_suffix>${suffixText}<fim_middle>`;
        }

        return `${prefixText}`;
    }

    private buildPrefix(prompt: PromptInfo): string {
        const parts: string[] = [];

        if (prompt.context.length > 0) {
            for (const ctx of prompt.context) {
                if (ctx) {
                    parts.push(ctx);
                }
            }
            parts.push('');
        }

        parts.push(prompt.prefix);

        return parts.join('\n');
    }
}

/**
 * Qwen FIM 格式适配器
 * Qwen-Coder 系列
 * 格式: <|fim_prefix|>{prefix}<|fim_suffix|>{suffix}<|fim_middle|>
 * 与 Codex 标记相同，但上下文以注释形式注入
 */
export class QwenFimAdapter implements IFimAdapter {
    readonly formatType = FimFormat.Qwen;

    format(prompt: PromptInfo, strategy: CompletionStrategy): string {
        const prefixText = this.buildPrefix(prompt);
        const suffixText = prompt.suffix;

        if (suffixText && prompt.isFimEnabled) {
            return `<|fim_prefix|>${prefixText}<|fim_suffix|>${suffixText}<|fim_middle|>`;
        }

        return `${prefixText}`;
    }

    private buildPrefix(prompt: PromptInfo): string {
        const parts: string[] = [];

        if (prompt.context.length > 0) {
            const contextStr = prompt.context.filter(Boolean).join('\n---\n');
            parts.push(`# Context:\n${contextStr}`);
            parts.push('');
        }

        parts.push(prompt.prefix);

        return parts.join('\n');
    }
}

/**
 * FIM 适配器工厂
 * 根据 FimFormat 创建对应的适配器实例
 */
export function createFimAdapter(format: FimFormat): IFimAdapter {
    switch (format) {
        case FimFormat.Codex:
            return new CodexFimAdapter();
        case FimFormat.CodeLlama:
            return new CodeLlamaFimAdapter();
        case FimFormat.DeepSeek:
            return new DeepSeekFimAdapter();
        case FimFormat.StarCoder:
            return new StarCoderFimAdapter();
        case FimFormat.Qwen:
            return new QwenFimAdapter();
        default:
            return new CodexFimAdapter();
    }
}

/** 所有 FIM 适配器实例映射 */
export const fimAdapterMap: Record<FimFormat, IFimAdapter> = {
    [FimFormat.Codex]: new CodexFimAdapter(),
    [FimFormat.CodeLlama]: new CodeLlamaFimAdapter(),
    [FimFormat.DeepSeek]: new DeepSeekFimAdapter(),
    [FimFormat.StarCoder]: new StarCoderFimAdapter(),
    [FimFormat.Qwen]: new QwenFimAdapter(),
};