/**
 * 补全模板索引
 * 根据语言类型选择对应的模板
 */

import { jsTemplates } from './jsTemplates.js';
import { pythonTemplates } from './pythonTemplates.js';
import { cppTemplates } from './cppTemplates.js';
import { goTemplates } from './goTemplates.js';

/** 默认补全模板（无语言匹配时使用） */
const defaultTemplates: Record<string, string[]> = {
    'default': [';', '()', '{}', '[]', 'null', 'true', 'false'],
};

/** 语言 ID 到模板的映射 */
const languageTemplateMap: Record<string, Record<string, string[]>> = {
    'javascript': jsTemplates,
    'typescript': jsTemplates,
    'javascriptreact': jsTemplates,
    'typescriptreact': jsTemplates,
    'python': pythonTemplates,
    'c': cppTemplates,
    'cpp': cppTemplates,
    'csharp': cppTemplates,
    'go': goTemplates,
};

/**
 * 获取指定语言的补全模板
 */
export function getTemplatesForLanguage(languageId: string): Record<string, string[]> {
    return languageTemplateMap[languageId] ?? defaultTemplates;
}
