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
 * 注册语言补全 provider（自定义补全 + Monaco 内置词频补全）
 */
export function registerCompletionItem(languageId, completions) {
    monaco.languages.registerCompletionItemProvider(languageId, {
        async provideCompletionItems(model, position) {
            const allSuggestions = getCustomSuggestions(completions, model, position);
            const defaultSuggestions = await getDefaultSuggestions(model, position);
            allSuggestions.push(...defaultSuggestions);
            return { suggestions: allSuggestions };
        }
    });
}

export function registerInlineCompletions(languageId) {
    monaco.languages.registerInlineCompletionsProvider(languageId, {
        provideInlineCompletions: function (model, position, context, token) {
            console.log('Provide inline completion', position, context, token)
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
        freeInlineCompletions: function (completions) {
            console.log('Free inline completions', completions);
        }
    });
}
