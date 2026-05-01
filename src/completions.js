import { registerCppCompletions } from './completions/completions-cpp.js';
import { registerGoCompletions } from './completions/completions-go.js';
import { registerPythonCompletions } from './completions/completions-python.js';

export function registerBasicCompletions() {
    // 注册特定语言补全（这会覆盖内置补全）
    // registerPythonCompletions();
    registerCppCompletions();
    registerGoCompletions();
}