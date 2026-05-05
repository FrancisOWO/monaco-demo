/**
 * CurrentGhostText
 * Typing-as-Suggested 实现
 * 当用户输入与当前显示的补全匹配时，本地返回调整后的补全
 */

import type {
    CompletionResult,
    ICurrentGhostText,
} from '../types.js';

interface GhostTextEntry {
    prefix: string;
    suffix: string;
    choices: CompletionResult[];
    /** 原始补全文本 */
    originalTexts: string[];
}

/**
 * 当前 Ghost Text 管理器
 */
export class CurrentGhostText implements ICurrentGhostText {
    private current: GhostTextEntry | undefined;
    /** 连续接受补全的次数 */
    private consecutiveAcceptCount: number = 0;

    /**
     * 设置当前显示的补全
     */
    setCurrent(prefix: string, suffix: string, choices: CompletionResult[]): void {
        this.current = {
            prefix,
            suffix,
            choices: [...choices],
            originalTexts: choices.map(c => c.insertText),
        };
    }

    /**
     * 检查用户输入是否与补全匹配，返回调整后的补全
     */
    getCompletionsForUserTyping(prefix: string, suffix: string): CompletionResult[] | undefined {
        if (!this.current) {
            return undefined;
        }

        // 检查 suffix 是否匹配
        if (this.current.suffix !== suffix) {
            return undefined;
        }

        // 检查 prefix 是否以当前 prefix 开头
        if (!prefix.startsWith(this.current.prefix)) {
            return undefined;
        }

        // 计算用户新增的输入
        const addedText = prefix.slice(this.current.prefix.length);

        // 检查新增输入是否与补全开头匹配
        const adjustedChoices: CompletionResult[] = [];

        for (let i = 0; i < this.current.choices.length; i++) {
            const choice = this.current.choices[i];
            const originalText = this.current.originalTexts[i];

            if (originalText.startsWith(addedText)) {
                // 用户输入匹配补全开头，返回调整后的补全
                const adjustedText = originalText.slice(addedText.length);

                adjustedChoices.push({
                    ...choice,
                    insertText: adjustedText,
                    completionId: `${choice.completionId}-typing`,
                });
            }
        }

        if (adjustedChoices.length === 0) {
            return undefined;
        }

        // 更新当前状态
        this.current = {
            prefix,
            suffix,
            choices: adjustedChoices,
            originalTexts: this.current.originalTexts,
        };

        return adjustedChoices;
    }

    /**
     * 清除当前补全
     */
    clear(): void {
        this.current = undefined;
        this.consecutiveAcceptCount = 0;
    }

    /**
     * 检查当前补全是否已被完整接受
     * 返回连续接受补全的次数（0 表示未接受）
     */
    hasAcceptedCurrentCompletion(prefix: string, suffix: string): number {
        if (!this.current) {
            // 没有当前补全 → 重置计数
            this.consecutiveAcceptCount = 0;
            return 0;
        }

        // 如果用户输入超过了原始补全的范围，说明已接受
        const originalPrefix = this.current.prefix;
        const originalText = this.current.originalTexts[0] ?? '';

        // 检查是否完全匹配（用户输入包含了整个补全）
        const accepted = prefix === originalPrefix + originalText && suffix === this.current.suffix;
        if (accepted) {
            this.consecutiveAcceptCount++;
        } else {
            this.consecutiveAcceptCount = 0;
        }
        return this.consecutiveAcceptCount;
    }

    /**
     * 获取当前补全
     */
    getCurrent(): { prefix: string; suffix: string; choices: CompletionResult[] } | undefined {
        if (!this.current) {
            return undefined;
        }

        return {
            prefix: this.current.prefix,
            suffix: this.current.suffix,
            choices: [...this.current.choices],
        };
    }

    /**
     * 检查是否有当前补全
     */
    hasCurrent(): boolean {
        return this.current !== undefined;
    }
}
