/**
 * Python 补全模板
 */
export const pythonTemplates: Record<string, string[]> = {
    'def': [
        '():\n    pass',
        '(self):\n    pass',
        '(param):\n    # TODO: implement\n    pass',
    ],
    'class': [
        ':\n    def __init__(self):\n        pass',
        ':\n    def __repr__(self):\n        return ""',
    ],
    'if': [
        ' condition:\n    pass',
        ' err:\n    print(err)',
    ],
    'for': [
        ' i in range(len(items)):\n    pass',
        ' item in items:\n    print(item)',
    ],
    'while': [
        ' True:\n    break',
        ' condition:\n    pass',
    ],
    'return': [
        ' None',
        ' True',
        ' False',
        ' result',
    ],
    'import': [
        ' os',
        ' sys',
        ' from typing import List, Dict',
    ],
    'try': [
        ':\n    pass\nexcept Exception as e:\n    print(e)',
    ],
    'with': [
        ' open("file.txt", "r") as f:\n    content = f.read()',
    ],
    'lambda': [
        ' x: x',
        ' x, y: x + y',
    ],
    'print': [
        '("debug")',
        '(variable)',
    ],
    'raise': [
        ' ValueError("invalid input")',
        ' NotImplementedError',
    ],
    'assert': [
        ' condition, "Assertion failed"',
    ],
    'yield': [
        ' item',
        ' from generator()',
    ],
};
