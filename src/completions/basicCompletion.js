import { registerCppCompletions } from './completions-cpp.js';
import { registerGoCompletions } from './completions-go.js';
import { registerPythonCompletions } from './completions-python.js';

export function registerBasicCompletions() {
    // 注册特定语言补全（这会覆盖内置补全）
    // registerPythonCompletions();
    registerCppCompletions();
    registerGoCompletions();
}