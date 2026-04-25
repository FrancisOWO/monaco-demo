/**
 * 尾部空白处理工具
 * 用于分离文本最后一行的尾部空白
 */

/**
 * 分离文本最后一行的尾部空白
 * @param text 输入文本
 * @returns [去除尾部空白的文本, 尾部空白]
 */
export function trimLastLine(text: string): [string, string] {
    if (!text) {
        return ['', ''];
    }

    // 找到最后一个换行符
    const lastNewlineIndex = text.lastIndexOf('\n');

    if (lastNewlineIndex === -1) {
        // 没有换行符，处理整个文本
        return splitTrailingWs(text);
    }

    // 获取最后一行
    const lastLine = text.slice(lastNewlineIndex + 1);
    const [trimmedLine, trailingWs] = splitTrailingWs(lastLine);

    return [
        text.slice(0, lastNewlineIndex + 1) + trimmedLine,
        trailingWs,
    ];
}

/**
 * 分离字符串的尾部空白
 */
function splitTrailingWs(str: string): [string, string] {
    const match = str.match(/^(.*?)(\s*)$/);
    if (match) {
        return [match[1], match[2]];
    }
    return [str, ''];
}
