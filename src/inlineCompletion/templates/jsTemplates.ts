/**
 * JavaScript/TypeScript 补全模板
 */
export const jsTemplates: Record<string, string[]> = {
    'function': [
        '() {\n    // TODO: implement\n}',
        '() {\n    return null;\n}',
        '(param) {\n    console.log(param);\n}',
    ],
    'const': [
        ' = null;',
        ' = undefined;',
        ' = [];',
        ' = {};',
    ],
    'let': [
        ' = null;',
        ' = 0;',
        ' = "";',
    ],
    'if': [
        ' (condition) {\n    // TODO\n}',
        ' (err) {\n    console.error(err);\n}',
    ],
    'for': [
        ' (let i = 0; i < length; i++) {\n    // TODO\n}',
        ' (const item of items) {\n    console.log(item);\n}',
    ],
    'return': [
        ' null;',
        ' true;',
        ' false;',
        ' result;',
    ],
    'console.log': [
        '("debug");',
        '(variable);',
    ],
    'import': [
        ' { } from "./module";',
        ' * as module from "./module";',
    ],
    'class': [
        ' {\n    constructor() {\n        // TODO\n    }\n}',
    ],
    'async': [
        ' function fetchData() {\n    const response = await fetch(url);\n    return response.json();\n}',
    ],
    'await': [
        ' promise;',
        ' fetch(url);',
    ],
};
