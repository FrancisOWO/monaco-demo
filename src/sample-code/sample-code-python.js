/**
 * Python 示例代码
 */
export const sampleCodePython = `# Python 示例代码
def fibonacci(n):
    """计算斐波那契数列"""
    if n <= 1:
        return n
    return fibonacci(n - 1) + fibonacci(n - 2)

# 打印前 10 个斐波那契数
for i in range(10):
    print(f"fib({i}) = {fibonacci(i)}")
`;