/**
 * Python 代码补全配置
 */
import * as monaco from 'monaco-editor';
import { registerLanguageCompletions } from './completion-utils.js';

export const pythonCompletions = [
	{
		label: 'defmain',
		kind: monaco.languages.CompletionItemKind.Snippet,
		insertText: "def main():\n    ${1:pass}\n\nif __name__ == '__main__':\n    main()",
		insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
		documentation: '创建 main 函数入口',
		detail: 'Python main 函数模板'
	},
	{
		label: 'ifmain',
		kind: monaco.languages.CompletionItemKind.Snippet,
		insertText: "if __name__ == '__main__':\n    ${1:main()}",
		insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
		documentation: '创建 main 入口判断',
		detail: 'Python main 入口'
	},
	{
		label: 'deffunc',
		kind: monaco.languages.CompletionItemKind.Snippet,
		insertText: 'def ${1:function_name}(${2:params}):\n    ${3:pass}',
		insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
		documentation: '创建函数定义',
		detail: 'Python 函数模板'
	},
	{
		label: 'forloop',
		kind: monaco.languages.CompletionItemKind.Snippet,
		insertText: 'for ${1:i} in ${2:range(n)}:\n    ${3:pass}',
		insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
		documentation: '创建 for 循环',
		detail: 'Python for 循环'
	},
	{
		label: 'whileloop',
		kind: monaco.languages.CompletionItemKind.Snippet,
		insertText: 'while ${1:condition}:\n    ${2:pass}',
		insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
		documentation: '创建 while 循环',
		detail: 'Python while 循环'
	},
	{
		label: 'tryexcept',
		kind: monaco.languages.CompletionItemKind.Snippet,
		insertText: 'try:\n    ${1:pass}\nexcept ${2:Exception} as e:\n    ${3:print(e)}',
		insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
		documentation: '创建 try-except 异常处理',
		detail: 'Python 异常处理'
	},
	{
		label: 'classdef',
		kind: monaco.languages.CompletionItemKind.Snippet,
		insertText: 'class ${1:ClassName}:\n    def __init__(self, ${2:params}):\n        ${3:pass}',
		insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
		documentation: '创建类定义',
		detail: 'Python 类模板'
	},
	{
		label: 'lambda',
		kind: monaco.languages.CompletionItemKind.Snippet,
		insertText: 'lambda ${1:params}: ${2:expression}',
		insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
		documentation: '创建 lambda 表达式',
		detail: 'Python lambda'
	},
	{
		label: 'withopen',
		kind: monaco.languages.CompletionItemKind.Snippet,
		insertText: "with open('${1:file}', '${2:r}') as ${3:f}:\n    ${4:pass}",
		insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
		documentation: '创建文件操作上下文',
		detail: 'Python 文件操作'
	},
	{
		label: 'print',
		kind: monaco.languages.CompletionItemKind.Function,
		insertText: 'print(${1:value})',
		insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
		documentation: '打印输出到控制台',
		detail: '内置函数'
	},
	{
		label: 'range',
		kind: monaco.languages.CompletionItemKind.Function,
		insertText: 'range(${1:start}, ${2:stop}, ${3:step})',
		insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
		documentation: '生成数字序列',
		detail: '内置函数'
	},
	{
		label: 'len',
		kind: monaco.languages.CompletionItemKind.Function,
		insertText: 'len(${1:object})',
		insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
		documentation: '返回对象长度',
		detail: '内置函数'
	},
	{
		label: 'input',
		kind: monaco.languages.CompletionItemKind.Function,
		insertText: "input('${1:prompt}')",
		insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
		documentation: '获取用户输入',
		detail: '内置函数'
	},
	{
		label: 'import os',
		kind: monaco.languages.CompletionItemKind.Module,
		insertText: 'import os',
		documentation: '导入操作系统接口模块',
		detail: '标准库'
	},
	{
		label: 'import sys',
		kind: monaco.languages.CompletionItemKind.Module,
		insertText: 'import sys',
		documentation: '导入系统相关参数模块',
		detail: '标准库'
	},
	{
		label: 'import json',
		kind: monaco.languages.CompletionItemKind.Module,
		insertText: 'import json',
		documentation: '导入 JSON 处理模块',
		detail: '标准库'
	},
	{
		label: 'import re',
		kind: monaco.languages.CompletionItemKind.Module,
		insertText: 'import re',
		documentation: '导入正则表达式模块',
		detail: '标准库'
	}
];

export function registerPythonCompletions() {
	registerLanguageCompletions('python', pythonCompletions);
}