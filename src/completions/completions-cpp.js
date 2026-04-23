/**
 * C++ 代码补全配置
 */
import * as monaco from 'monaco-editor';
import { registerLanguageCompletions } from './completion-utils.js';

export const cppCompletions = [
	{
		label: 'main',
		kind: monaco.languages.CompletionItemKind.Snippet,
		insertText: 'int main(int argc, char* argv[]) {\n    ${1:return 0;}\n}',
		insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
		documentation: '创建 main 函数入口',
		detail: 'C++ main 函数'
	},
	{
		label: 'forloop',
		kind: monaco.languages.CompletionItemKind.Snippet,
		insertText: 'for (int ${1:i} = 0; ${1:i} < ${2:n}; ++${1:i}) {\n    ${3:pass}\n}',
		insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
		documentation: '创建 for 循环',
		detail: 'C++ for 循环'
	},
	{
		label: 'foreach',
		kind: monaco.languages.CompletionItemKind.Snippet,
		insertText: 'for (auto& ${1:item} : ${2:container}) {\n    ${3:pass}\n}',
		insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
		documentation: '创建范围 for 循环',
		detail: 'C++ range-based for'
	},
	{
		label: 'whileloop',
		kind: monaco.languages.CompletionItemKind.Snippet,
		insertText: 'while (${1:condition}) {\n    ${2:pass}\n}',
		insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
		documentation: '创建 while 循环',
		detail: 'C++ while 循环'
	},
	{
		label: 'cout',
		kind: monaco.languages.CompletionItemKind.Snippet,
		insertText: 'std::cout << ${1:value} << std::endl;',
		insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
		documentation: '标准输出',
		detail: 'C++ std::cout'
	},
	{
		label: 'cin',
		kind: monaco.languages.CompletionItemKind.Snippet,
		insertText: 'std::cin >> ${1:variable};',
		insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
		documentation: '标准输入',
		detail: 'C++ std::cin'
	},
	{
		label: 'struct',
		kind: monaco.languages.CompletionItemKind.Snippet,
		insertText: 'struct ${1:StructName} {\n    ${2:int x;}\n};',
		insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
		documentation: '创建结构体',
		detail: 'C++ struct'
	},
	{
		label: 'classdef',
		kind: monaco.languages.CompletionItemKind.Snippet,
		insertText: 'class ${1:ClassName} {\npublic:\n    ${2:pass}\nprivate:\n    ${3:pass}\n};',
		insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
		documentation: '创建类定义',
		detail: 'C++ class'
	},
	{
		label: 'vector',
		kind: monaco.languages.CompletionItemKind.Snippet,
		insertText: 'std::vector<${1:int}> ${2:vec};',
		insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
		documentation: '创建动态数组',
		detail: 'C++ std::vector'
	},
	{
		label: 'map',
		kind: monaco.languages.CompletionItemKind.Snippet,
		insertText: 'std::map<${1:std::string}, ${2:int}> ${3:map};',
		insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
		documentation: '创建映射容器',
		detail: 'C++ std::map'
	},
	{
		label: 'include',
		kind: monaco.languages.CompletionItemKind.Snippet,
		insertText: '#include <${1:header}>',
		insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
		documentation: '包含头文件',
		detail: 'C++ #include'
	},
	{
		label: 'trycatch',
		kind: monaco.languages.CompletionItemKind.Snippet,
		insertText: 'try {\n    ${1:pass}\n} catch (${2:const std::exception& e}) {\n    ${3:std::cerr << e.what() << std::endl;}\n}',
		insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
		documentation: '创建异常处理',
		detail: 'C++ try-catch'
	}
];

export function registerCppCompletions() {
	registerLanguageCompletions('cpp', cppCompletions);
}