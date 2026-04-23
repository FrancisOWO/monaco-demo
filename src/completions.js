import { registerCppCompletions } from './completions/completions-cpp.js';
import { registerGoCompletions } from './completions/completions-go.js';
import { registerPythonCompletions } from './completions/completions-python.js';

export function registerCompletions() {
	registerCppCompletions();
	registerGoCompletions();
	registerPythonCompletions();
}