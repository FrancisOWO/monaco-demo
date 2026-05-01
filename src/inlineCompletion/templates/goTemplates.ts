/**
 * Go 补全模板
 */
export const goTemplates: Record<string, string[]> = {
    'func': [
        '() {\n    // TODO\n}',
        '(err error) {\n    if err != nil {\n        return err\n    }\n}',
        ' main() {\n    fmt.Println("Hello")\n}',
    ],
    'if': [
        ' condition {\n    // TODO\n}',
        ' err != nil {\n    return err\n}',
    ],
    'for': [
        ' i := 0; i < n; i++ {\n    // TODO\n}',
        ' _, item := range items {\n    // TODO\n}',
    ],
    'return': [
        ' nil',
        ' err',
        ' result, nil',
    ],
    'switch': [
        ' value {\ncase 1:\n    // TODO\ndefault:\n    // TODO\n}',
    ],
    'type': [
        ' struct {\n    // TODO\n}',
        ' interface {\n    // TODO\n}',
    ],
    'var': [
        ' err error',
        ' result string',
    ],
    'const': [
        ' (\n    // TODO\n)',
    ],
    'import': [
        ' (\n    "fmt"\n)',
        ' "encoding/json"',
        ' "net/http"',
    ],
    'go': [
        ' func() {\n    // TODO\n}()',
    ],
    'defer': [
        ' close()',
        ' func() {\n    // cleanup\n}()',
    ],
    'fmt.': [
        'Println(',
        'Printf(',
        'Sprintf(',
    ],
    'err': [
        ' != nil {\n    return err\n}',
    ],
    'make': [
        '(chan int)',
        '([]string, 0)',
        '(map[string]int)',
    ],
};
