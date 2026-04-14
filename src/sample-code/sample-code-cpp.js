/**
 * C++ 示例代码
 */
const sampleCodeCpp = `// C++ 示例代码
#include <iostream>
#include <vector>

int fibonacci(int n) {
    if (n <= 1) return n;
    return fibonacci(n - 1) + fibonacci(n - 2);
}

int main() {
    std::cout << "Fibonacci sequence:" << std::endl;
    for (int i = 0; i < 10; ++i) {
        std::cout << "fib(" << i << ") = " << fibonacci(i) << std::endl;
    }
    return 0;
}
`;
