/**
 * 服务端 FIM (Fill-In-the-Middle) 格式适配器
 * 根据 CompletionApiConfig.fimFormat 组装 FIM prompt
 *
 * 两种模式：
 * - 手动 FIM（fimFormat 有值）：组装 FIM 模板字符串传入 prompt，suffix 为 undefined
 * - 原生 FIM（fimFormat 为空）：直接传入 prefix + suffix，由 OpenAI SDK 的 suffix 参数处理
 */

/** FIM 格式类型 */
export enum FimFormat {
    Codex = 'codex',
    CodeLlama = 'codellama',
    DeepSeek = 'deepseek',
    StarCoder = 'starcoder',
    Qwen = 'qwen',
}

/** FIM 组装输入 */
export interface FimPromptInput {
    prefix: string;
    suffix: string;
    context: string[];
}

/** FIM 组装输出 — 直接用于 OpenAI completions.create 的 prompt 和 suffix 参数 */
export interface FimPromptOutput {
    /** 传入 prompt 参数的值 */
    prompt: string;
    /** 传入 suffix 参数的值 — 手动 FIM 时为 undefined，原生 FIM 时为原始 suffix */
    suffix: string | undefined;
}

/** UI 下拉选项 */
export const FIM_FORMAT_OPTIONS = [
    { value: '', label: 'Native (OpenAI suffix 参数)' },
    { value: 'qwen', label: 'Qwen' },
    { value: 'deepseek', label: 'DeepSeek' },
    { value: 'codellama', label: 'CodeLlama' },
    { value: 'codex', label: 'Codex' },
    { value: 'starcoder', label: 'StarCoder' },
];

// ============ 各格式适配器 ============

function buildSimplePrefix(prefix: string, context: string[]): string {
    const parts: string[] = [];
    if (context.length > 0) {
        for (const ctx of context) {
            if (ctx) parts.push(ctx);
        }
        parts.push('');
    }
    parts.push(prefix);
    return parts.join('\n');
}

function buildCommentPrefix(prefix: string, context: string[], commentStyle: 'c' | 'python'): string {
    const parts: string[] = [];
    if (context.length > 0) {
        const contextStr = context.filter(Boolean).join('\n---\n');
        if (commentStyle === 'python') {
            parts.push(`# Context:\n${contextStr}`);
        } else {
            parts.push(`/* Context:\n${contextStr}\n*/`);
        }
        parts.push('');
    }
    parts.push(prefix);
    return parts.join('\n');
}

/**
 * 组装 FIM prompt
 * fimFormat 为空/null/undefined → 原生 FIM（prefix + suffix）
 * fimFormat 有值 → 手动组装 FIM 模板
 */
export function formatFimPrompt(
    fimFormat: string | null | undefined,
    input: FimPromptInput,
): FimPromptOutput {
    // 原生 FIM：直接传 prefix 和 suffix
    if (!fimFormat) {
        return {
            prompt: input.prefix,
            suffix: input.suffix || undefined,
        };
    }

    const format = fimFormat as FimFormat;
    const prefixText = buildFimPrefix(format, input);
    const suffixText = input.suffix;

    // 无 suffix 时做纯前缀补全，不包裹 FIM 标记
    if (!suffixText) {
        return { prompt: prefixText, suffix: undefined };
    }

    // 手动组装 FIM 模板
    const template = wrapFimTemplate(format, prefixText, suffixText);
    return { prompt: template, suffix: undefined };
}

function buildFimPrefix(format: FimFormat, input: FimPromptInput): string {
    switch (format) {
        case FimFormat.DeepSeek:
            return buildCommentPrefix(input.prefix, input.context, 'c');
        case FimFormat.Qwen:
            return buildCommentPrefix(input.prefix, input.context, 'python');
        default:
            return buildSimplePrefix(input.prefix, input.context);
    }
}

function wrapFimTemplate(format: FimFormat, prefix: string, suffix: string): string {
    switch (format) {
        case FimFormat.Codex:
            return `<|fim_prefix|>${prefix}<|fim_suffix|>${suffix}<|fim_middle|>`;
        case FimFormat.CodeLlama:
            return `<PRE> ${prefix} <SUF>${suffix} <MID>`;
        case FimFormat.DeepSeek:
            return `<|fim_prefix|>${prefix}<|fim_suffix|>${suffix}<|fim_middle|>`;
        case FimFormat.StarCoder:
            return `<fim_prefix>${prefix}<fim_suffix>${suffix}<fim_middle>`;
        case FimFormat.Qwen:
            return `<|fim_prefix|>${prefix}<|fim_suffix|>${suffix}<|fim_middle|>`;
        default:
            // 未知格式回退到 Codex
            return `<|fim_prefix|>${prefix}<|fim_suffix|>${suffix}<|fim_middle|>`;
    }
}