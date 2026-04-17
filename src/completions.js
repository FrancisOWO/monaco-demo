/**
 * Monaco Editor 智能代码补全配置
 * 为 Python、C++、Go 提供代码片段和常用补全
 */

/**
 * 注册所有语言的补全提供者
 */
function registerCompletions() {
	// Python 补全配置
	const pythonCompletions = [
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

	// C++ 补全配置
	const cppCompletions = [
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

	// Go 补全配置
	const goCompletions = [
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

	// 注册 Python 补全
	monaco.languages.registerCompletionItemProvider('python', {
		provideCompletionItems: function(model, position) {
			return {
				suggestions: pythonCompletions.map(item => ({
					...item,
					range: new monaco.Range(
						position.lineNumber,
						position.column,
						position.lineNumber,
						position.column
					)
				}))
			};
		}
	});

	// 注册 C++ 补全
	monaco.languages.registerCompletionItemProvider('cpp', {
		provideCompletionItems: function(model, position) {
			return {
				suggestions: cppCompletions.map(item => ({
					...item,
					range: new monaco.Range(
						position.lineNumber,
						position.column,
						position.lineNumber,
						position.column
					)
				}))
			};
		}
	});

	// 注册 Go 补全
	monaco.languages.registerCompletionItemProvider('go', {
		provideCompletionItems: function(model, position) {
			return {
				suggestions: goCompletions.map(item => ({
					...item,
					range: new monaco.Range(
						position.lineNumber,
						position.column,
						position.lineNumber,
						position.column
					)
				}))
			};
		}
	});
}
