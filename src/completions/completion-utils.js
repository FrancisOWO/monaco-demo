/**
 * 补全工具函数
 * 提取文档符号 + 正确的 range 计算
 */
import * as monaco from 'monaco-editor';

/**
 * 计算当前单词的替换范围，用于前缀匹配
 */
export function getMatchRange(model, position) {
    const word = model.getWordUntilPosition(position);
    return new monaco.Range(
        position.lineNumber,
        word.startColumn,
        position.lineNumber,
        word.endColumn
    );
}

/**
 * 从文档内容中提取已有符号作为上下文补全
 */
export function collectDocumentSymbols(model, position, existingLabels) {
    const seenLabels = existingLabels || new Set();
    const matchRange = getMatchRange(model, position);
    const text = model.getValue();
    const wordPattern = /[a-zA-Z_]\w*/g;
    const suggestions = [];
    let match;

    while ((match = wordPattern.exec(text)) !== null) {
        const label = match[0];
        if (!seenLabels.has(label) && label.length > 2) {
            seenLabels.add(label);
            suggestions.push({
                label,
                kind: monaco.languages.CompletionItemKind.Text,
                insertText: label,
                range: matchRange,
                sortText: 'zzz' + label
            });
        }
    }

    return { suggestions, seenLabels };
}