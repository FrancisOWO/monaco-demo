/**
 * Monaco Editor 智能代码补全配置
 * 调度各语言补全的注册
 */

/**
 * 注册所有非 Python 语言的补全提供者
 * Python 的补全由 LSP provider 统一管理（合并基础补全和 LSP 补全）
 */
function registerCompletions() {
	// registerPythonCompletions();
	registerCppCompletions();
	registerGoCompletions();
}
