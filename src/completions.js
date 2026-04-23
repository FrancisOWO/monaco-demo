import { registerCppCompletions } from './completions/completions-cpp.js';
import { registerGoCompletions } from './completions/completions-go.js';

export function registerCompletions() {
	registerCppCompletions();
	registerGoCompletions();
}