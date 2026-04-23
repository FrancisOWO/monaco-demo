/**
 * Go 代码补全配置
 */
import * as monaco from 'monaco-editor';
import { getMatchRange, collectDocumentSymbols } from './completion-utils.js';

export const goCompletions = [
	{
		label: 'main',
		kind: monaco.languages.CompletionItemKind.Snippet,
		insertText: 'package main\n\nimport "fmt"\n\nfunc main() {\n    ${1:fmt.Println("Hello")}\n}',
		insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
		documentation: '创建 main 包和函数',
		detail: 'Go main 模板'
	},
	{
		label: 'func',
		kind: monaco.languages.CompletionItemKind.Snippet,
		insertText: 'func ${1:functionName}(${2:params}) ${3:returnType} {\n    ${4:pass}\n}',
		insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
		documentation: '创建函数定义',
		detail: 'Go function'
	},
	{
		label: 'method',
		kind: monaco.languages.CompletionItemKind.Snippet,
		insertText: 'func (${1:receiver} ${2:*Type}) ${3:methodName}(${4:params}) ${5:returnType} {\n    ${6:pass}\n}',
		insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
		documentation: '创建方法定义',
		detail: 'Go method'
	},
	{
		label: 'forloop',
		kind: monaco.languages.CompletionItemKind.Snippet,
		insertText: 'for ${1:i} := 0; ${1:i} < ${2:n}; ${1:i}++ {\n    ${3:pass}\n}',
		insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
		documentation: '创建 for 循环',
		detail: 'Go for 循环'
	},
	{
		label: 'forrange',
		kind: monaco.languages.CompletionItemKind.Snippet,
		insertText: 'for ${1:index}, ${2:value} := range ${3:collection} {\n    ${4:pass}\n}',
		insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
		documentation: '创建 range 循环',
		detail: 'Go for-range'
	},
	{
		label: 'iferr',
		kind: monaco.languages.CompletionItemKind.Snippet,
		insertText: 'if err != nil {\n    return ${1:nil, err}\n}',
		insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
		documentation: '创建错误处理',
		detail: 'Go error handling'
	},
	{
		label: 'struct',
		kind: monaco.languages.CompletionItemKind.Snippet,
		insertText: 'type ${1:StructName} struct {\n    ${2:Field string}\n}',
		insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
		documentation: '创建结构体',
		detail: 'Go struct'
	},
	{
		label: 'interface',
		kind: monaco.languages.CompletionItemKind.Snippet,
		insertText: 'type ${1:InterfaceName} interface {\n    ${2:MethodName()}\n}',
		insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
		documentation: '创建接口',
		detail: 'Go interface'
	},
	{
		label: 'gofunc',
		kind: monaco.languages.CompletionItemKind.Snippet,
		insertText: 'go func() {\n    ${1:pass}\n}()',
		insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
		documentation: '创建 goroutine',
		detail: 'Go goroutine'
	},
	{
		label: 'defer',
		kind: monaco.languages.CompletionItemKind.Snippet,
		insertText: 'defer ${1:func()}',
		insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
		documentation: '创建 defer 语句',
		detail: 'Go defer'
	},
	{
		label: 'fmt.Println',
		kind: monaco.languages.CompletionItemKind.Function,
		insertText: 'fmt.Println(${1:value})',
		insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
		documentation: '打印输出并换行',
		detail: 'fmt package'
	},
	{
		label: 'fmt.Printf',
		kind: monaco.languages.CompletionItemKind.Function,
		insertText: 'fmt.Printf("${1:%v}", ${2:value})',
		insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
		documentation: '格式化打印',
		detail: 'fmt package'
	},
	{
		label: 'fmt.Sprintf',
		kind: monaco.languages.CompletionItemKind.Function,
		insertText: 'fmt.Sprintf("${1:%v}", ${2:value})',
		insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
		documentation: '格式化字符串',
		detail: 'fmt package'
	},
	{
		label: 'make',
		kind: monaco.languages.CompletionItemKind.Function,
		insertText: 'make(${1:[]int}, ${2:0}, ${3:capacity})',
		insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
		documentation: '创建 slice/map/channel',
		detail: '内置函数'
	},
	{
		label: 'append',
		kind: monaco.languages.CompletionItemKind.Function,
		insertText: 'append(${1:slice}, ${2:value})',
		insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
		documentation: '追加元素到 slice',
		detail: '内置函数'
	}
];

/**
 * 注册 Go 补全提供者
 */
export function registerGoCompletions() {
	monaco.languages.registerCompletionItemProvider('go', {
		provideCompletionItems: function(model, position) {
			const matchRange = getMatchRange(model, position);
			const allSuggestions = goCompletions.map(item => ({
				...item,
				range: matchRange
			}));

			// 上下文补全：文档中已有的符号
			const seenLabels = new Set(allSuggestions.map(s => s.label));
			const { suggestions } = collectDocumentSymbols(model, position, seenLabels);
			allSuggestions.push(...suggestions);

			return { suggestions: allSuggestions };
		}
	});
}