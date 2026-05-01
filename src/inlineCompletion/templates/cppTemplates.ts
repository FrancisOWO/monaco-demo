/**
 * C/C++ 补全模板
 */
export const cppTemplates: Record<string, string[]> = {
    'int': [
        ' main(int argc, char* argv[]) {\n    return 0;\n}',
    ],
    'void': [
        ' function() {\n    // TODO\n}',
    ],
    'if': [
        ' (condition) {\n    // TODO\n}',
        ' (err) {\n    std::cerr << err << std::endl;\n}',
    ],
    'for': [
        ' (int i = 0; i < n; i++) {\n    // TODO\n}',
        ' (const auto& item : items) {\n    // TODO\n}',
    ],
    'while': [
        ' (condition) {\n    // TODO\n}',
    ],
    'return': [
        ' 0;',
        ' true;',
        ' false;',
        ' result;',
    ],
    '#include': [
        ' <iostream>',
        ' <vector>',
        ' <string>',
        ' <map>',
        ' <algorithm>',
    ],
    'class': [
        ' {\npublic:\n    ClassName() {}\n    ~ClassName() {}\n};',
    ],
    'struct': [
        ' {\n    int id;\n    std::string name;\n};',
    ],
    'switch': [
        ' (value) {\n    case 0:\n        break;\n    default:\n        break;\n}',
    ],
    'try': [
        ' {\n    // TODO\n} catch (const std::exception& e) {\n    std::cerr << e.what() << std::endl;\n}',
    ],
    'namespace': [
        ' mynamespace {\n    // TODO\n}',
    ],
    'template': [
        ' <typename T>\n',
        ' <typename T, typename U>\n',
    ],
    'std::': [
        'cout << ',
        'vector<',
        'string ',
        'map<',
    ],
};
