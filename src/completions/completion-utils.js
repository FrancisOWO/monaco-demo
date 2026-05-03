/**
 * 补全工具函数
 */
import * as monaco from 'monaco-editor';

import { StandaloneServices } from 'monaco-editor/esm/vs/editor/standalone/browser/standaloneServices.js';
import { ILanguageFeaturesService } from 'monaco-editor/esm/vs/editor/common/services/languageFeatures.js';


/**
 * 获取 Monaco 默认补全列表
 */
export async function getDefaultSuggestions(model, position) {
    const languageFeaturesService = StandaloneServices.get(ILanguageFeaturesService);
    const providers = languageFeaturesService.completionProvider.all(model);

    const wordBasedProvider = providers.find(
        p => p._debugDisplayName === 'wordbasedCompletions'
    );

    if (!wordBasedProvider) return [];

    const result = await wordBasedProvider.provideCompletionItems(model, position);
    return result?.suggestions ?? [];
}

/**
 * 计算当前单词的替换范围，用于前缀匹配
 */
export function getCurrentWordRange(model, position) {
    const word = model.getWordUntilPosition(position);
    return new monaco.Range(
        position.lineNumber,
        word.startColumn,
        position.lineNumber,
        word.endColumn
    );
}

/**
 * 获取自定义补全列表
 */
export function getCustomSuggestions(completions, model, position) {
    const wordRange = getCurrentWordRange(model, position);
    return completions.map(item => ({
        ...item,
        range: wordRange
    }));
}

/**
 * 注册 Monaco 内置补全
 */
export function registerDefaultCompletionItem(languageId) {
    monaco.languages.registerCompletionItemProvider(languageId, {
        async provideCompletionItems(model, position) {
            return { suggestions: await getDefaultSuggestions(model, position) };
        }
    });
}

/**
 * 注册自定义补全
 */
export function registerCustomCompletionItem(languageId, completions) {
    monaco.languages.registerCompletionItemProvider(languageId, {
        provideCompletionItems(model, position) {
            return { suggestions: getCustomSuggestions(completions, model, position) };
        }
    });
}

/**
 * 注册语言补全 provider（自定义补全 + Monaco 内置词频补全）
 */


export function registerCompletionItem(languageId, completions, custom=false) {
    monaco.languages.registerCompletionItemProvider(languageId, {
        async provideCompletionItems(model, position) {
            const allSuggestions = await getDefaultSuggestions(model, position);
            if (custom && completions.length > 0) {
                allSuggestions.push(...getCustomSuggestions(completions, model, position));
            }
            return { suggestions: allSuggestions };
        }
    });
}

export function registerInlineCompletions(languageId) {
    monaco.languages.registerInlineCompletionsProvider(languageId, {
        provideInlineCompletions: function (model, position, context, token) {
            return {
                items: [
                    {
                        insertText: 'hello world'
                    },
                    {
                        insertText: 'goodbye world'
                    }
                ]
            };
        },
        disposeInlineCompletions: function (completions, reason) {
            // 简易版无需特殊处理
        }
    });
}
