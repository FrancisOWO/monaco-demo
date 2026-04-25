# S03: 多行检测与策略踩坑记录

## 问题 1: 文件长度检查不准确导致大文件卡顿

### 现象
大文件（>10000 行）编辑时，补全功能卡顿，响应缓慢。

### 分析
早期使用 `document.split('\n').length` 计算行数，每次都要分割整个文档，O(n) 复杂度。大文件时频繁调用导致性能问题。

### 解决方案
优化行数计算，缓存结果：

```typescript
// 使用正则匹配换行符，避免创建数组
function countLines(text: string): number {
    let count = 0;
    let index = 0;
    while ((index = text.indexOf('\n', index)) !== -1) {
        count++;
        index++;
    }
    return count + 1; // 最后一行没有换行符
}

// 或者使用 Monaco 的模型方法
const lineCount = model.getLineCount();
```

在 StrategyManager 中缓存行数，监听文档变化时更新：

```typescript
export class StrategyManager implements IStrategyManager {
    private cachedLineCount: number = 0;
    private lastDocumentLength: number = 0;

    async determineStrategy(
        context: CompletionRequestContext,
        prompt: PromptInfo,
        hasAcceptedCurrent: boolean,
    ): Promise<CompletionStrategy> {
        const model = this.editor.getModel();
        if (!model) {
            return this.singleLineStrategy(BlockMode.Server);
        }

        // 使用 Monaco 内置方法获取行数
        const lineCount = model.getLineCount();

        // 1. 文件长度限制
        if (lineCount >= this.config.maxFileLines) {
            return this.singleLineStrategy(BlockMode.Server);
        }
        // ...
    }
}
```

### 经验
- 大文件性能要注意 O(n) 操作
- 利用编辑器提供的 API 获取元数据
- 缓存频繁使用的计算结果

---

## 问题 2: AST 空块检测误判率高

### 现象
空块检测经常误判，把非空块也识别为空块，导致不必要的多行请求。

### 分析
早期实现使用简单正则匹配：
```typescript
/[{\[(]\s*$/.test(line)
```

这会导致：
- 字符串中的 `{` 被误判
- 注释中的 `{` 被误判
- 已闭合的块被误判

### 解决方案
使用启发式规则 + 上下文判断：

```typescript
isEmptyBlockStart(document: string, position: { lineNumber: number; column: number }): boolean {
    const lines = document.split('\n');
    const currentLine = lines[position.lineNumber - 1] ?? '';
    const beforeCursor = currentLine.slice(0, position.column - 1).trim();

    // 检测常见的空块起始模式（排除字符串和注释）
    const emptyBlockPatterns = [
        // 函数定义
        /function\s*\w*\s*\([^)]*\)\s*\{\s*$/,
        // 箭头函数
        /=>\s*\{\s*$/,
        // 类定义
        /class\s+\w+.*\{\s*$/,
        // if/for/while 语句
        /(?:if|for|while)\s*\([^)]*\)\s*\{\s*$/,
        // try/catch
        /try\s*\{\s*$/,
        // Python def/class
        /def\s+\w+\s*\([^)]*\):\s*$/,
        /class\s+\w+.*:\s*$/,
    ];

    // 检查是否在字符串或注释中
    if (this.isInStringOrComment(currentLine, position.column - 1)) {
        return false;
    }

    for (const pattern of emptyBlockPatterns) {
        if (pattern.test(beforeCursor)) {
            return true;
        }
    }

    return false;
}

private isInStringOrComment(line: string, column: number): boolean {
    // 简化实现：检查是否在引号内或 // 之后
    let inString = false;
    let stringChar = '';
    
    for (let i = 0; i < column && i < line.length; i++) {
        const char = line[i];
        const prevChar = i > 0 ? line[i - 1] : '';
        
        // 检查注释
        if (char === '/' && line[i + 1] === '/') {
            return true;
        }
        
        // 检查字符串
        if (!inString && (char === '"' || char === "'" || char === '`')) {
            inString = true;
            stringChar = char;
        } else if (inString && char === stringChar && prevChar !== '\\') {
            inString = false;
        }
    }
    
    return inString;
}
```

### 经验
- 正则匹配要考虑上下文（字符串、注释）
- 启发式规则需要覆盖常见模式
- 误判比漏判更好（避免不必要的请求）

---

## 问题 3: ML 评分模型过于简单导致误判

### 现象
某些明显应该单行的场景触发了多行补全（如变量赋值），某些应该多行的场景触发了单行（如函数定义后）。

### 分析
早期 ML 模型只基于最后一行做判断，没有考虑上下文。

### 解决方案
增强启发式模型，考虑更多上下文：

```typescript
export class MultilineModel implements IMultilineModel {
    score(prompt: PromptInfo, languageId: string): number {
        const patterns = this.languagePatterns[languageId];
        if (!patterns) {
            return 0.3;
        }

        const prefix = prompt.prefix;
        const lines = prefix.split('\n');
        const lastLine = lines[lines.length - 1]?.trim() ?? '';
        const secondLastLine = lines[lines.length - 2]?.trim() ?? '';

        let score = 0.3; // 基础分数

        // 评估每条模式
        for (const pattern of patterns) {
            if (pattern.test(lastLine, secondLastLine)) {
                score += pattern.weight;
            }
        }

        // 检查缩进变化
        if (this.detectIndentIncrease(lines)) {
            score += 0.2;
        }

        // 检查未闭合的括号
        if (this.hasUnclosedBrackets(prefix)) {
            score += 0.3;
        }

        // 检查是否在类/函数定义后
        if (this.isAfterDefinition(lastLine)) {
            score += 0.2;
        }

        // 检查下一行是否为空（新块开始）
        if (secondLastLine === '' && lastLine.endsWith('{')) {
            score += 0.3;
        }

        return Math.min(1, Math.max(0, score));
    }

    private detectIndentIncrease(lines: string[]): boolean {
        if (lines.length < 2) return false;

        const lastLine = lines[lines.length - 1];
        const prevLine = lines[lines.length - 2];

        const lastIndent = lastLine.match(/^(\s*)/)?.[1]?.length ?? 0;
        const prevIndent = prevLine.match(/^(\s*)/)?.[1]?.length ?? 0;

        return lastIndent > prevIndent;
    }
}
```

### 经验
- 启发式规则要考虑多维度特征
- 基础分数 + 加权累加是简单有效的评分方式
- 分数要归一化到 [0, 1]

---

## 问题 4: BlockMode 切换导致策略不一致

### 现象
用户编辑时，BlockMode 在不同请求间切换，导致补全行为不一致（有时单行有时多行）。

### 分析
早期实现根据语言动态选择 BlockMode，但没有考虑上下文状态。

### 解决方案
在策略判定中考虑更多上下文：

```typescript
private getBlockModeForLanguage(languageId: string): BlockMode {
    // 根据语言配置决定 BlockMode
    const parsingLanguages = ['typescript', 'typescriptreact', 'javascript', 'python', 'go', 'rust'];
    
    // 如果用户刚刚接受了补全，使用 Parsing 模式继续多行
    if (this.hasAcceptedCurrent && parsingLanguages.includes(languageId)) {
        return BlockMode.Parsing;
    }

    return BlockMode.Server;
}

async determineStrategy(
    context: CompletionRequestContext,
    prompt: PromptInfo,
    hasAcceptedCurrent: boolean,
): Promise<CompletionStrategy> {
    // ...
    
    // 6. 接受后强制多行（保持一致性）
    if (hasAcceptedCurrent && !requestMultiline) {
        return this.afterAcceptStrategy(blockMode);
    }
    // ...
}
```

### 经验
- 策略判定要考虑用户行为（是否刚接受）
- 一致性比每次都最优更重要
- 状态传递要清晰

---

## 问题 5: finishedCb 回调时机不当导致截断错误

### 现象
多行补全在不应该截断的地方被截断，或应该截断的地方没有截断。

### 分析
`finishedCb` 回调的实现有问题：
1. 返回的截断位置计算错误
2. 在流式接收时没有正确调用
3. 不同 BlockMode 的回调逻辑混淆

### 解决方案
完善各类 finishedCb 实现：

```typescript
// Parsing BlockMode 的回调
parsingBlockFinished(document: string, position: { lineNumber: number; column: number }): FinishedCallback {
    return (text: string): number | undefined => {
        // 检测块是否完整（括号匹配）
        let openBrackets = 0;
        let closeBrackets = 0;

        for (const char of text) {
            if (char === '{' || char === '(' || char === '[') {
                openBrackets++;
            } else if (char === '}' || char === ')' || char === ']') {
                closeBrackets++;
            }
        }

        // 如果闭合括号不少于开启括号，认为块已完成
        if (closeBrackets >= openBrackets && openBrackets > 0) {
            // 找到最后一个闭合括号的位置
            for (let i = text.length - 1; i >= 0; i--) {
                if (['}', ')', ']'].includes(text[i])) {
                    return i + 1;
                }
            }
        }

        return undefined;
    };
}

// takeNLines 回调（接受后固定行数）
export function takeNLines(n: number): FinishedCallback {
    return (text: string): number | undefined => {
        const lines = text.split('\n');
        if (lines.length > n + 1) {
            return lines.slice(0, n + 1).join('\n').length;
        }
        return undefined;
    };
}
```

### 经验
- 回调函数要返回正确的字符位置（不是行号）
- 括号匹配要考虑嵌套
- 返回 undefined 表示不截断

---

## 最佳实践总结

1. **性能优化**: 使用编辑器 API 获取行数，避免 O(n) 操作
2. **AST 检测**: 考虑字符串和注释上下文
3. **ML 评分**: 多维度特征，归一化分数
4. **策略一致性**: 考虑用户行为状态
5. **截断回调**: 正确计算字符位置，处理嵌套
