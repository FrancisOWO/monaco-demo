/**
 * Debounce 工具
 * 防抖延迟处理
 */

/**
 * 创建防抖函数
 * @param fn 要防抖的函数
 * @param delay 延迟时间（ms）
 * @returns 防抖后的函数
 */
export function debounce<T extends (...args: any[]) => any>(
    fn: T,
    delay: number,
): (...args: Parameters<T>) => Promise<ReturnType<T>> {
    let timeoutId: ReturnType<typeof setTimeout> | null = null;

    return (...args: Parameters<T>): Promise<ReturnType<T>> => {
        return new Promise((resolve) => {
            if (timeoutId) {
                clearTimeout(timeoutId);
            }

            timeoutId = setTimeout(() => {
                timeoutId = null;
                resolve(fn(...args));
            }, delay);
        });
    };
}

/**
 * 创建可取消的防抖函数
 */
export interface CancellableDebounce<T extends (...args: any[]) => any> {
    (...args: Parameters<T>): Promise<ReturnType<T>>;
    cancel(): void;
    flush(): ReturnType<T> | undefined;
}

export function debounceCancellable<T extends (...args: any[]) => any>(
    fn: T,
    delay: number,
): CancellableDebounce<T> {
    let timeoutId: ReturnType<typeof setTimeout> | null = null;
    let lastArgs: Parameters<T> | null = null;

    const debouncedFn = (...args: Parameters<T>): Promise<ReturnType<T>> => {
        lastArgs = args;

        return new Promise((resolve) => {
            if (timeoutId) {
                clearTimeout(timeoutId);
            }

            timeoutId = setTimeout(() => {
                timeoutId = null;
                lastArgs = null;
                resolve(fn(...args));
            }, delay);
        });
    };

    debouncedFn.cancel = () => {
        if (timeoutId) {
            clearTimeout(timeoutId);
            timeoutId = null;
        }
        lastArgs = null;
    };

    debouncedFn.flush = () => {
        if (timeoutId && lastArgs) {
            clearTimeout(timeoutId);
            timeoutId = null;
            const result = fn(...lastArgs);
            lastArgs = null;
            return result;
        }
        return undefined;
    };

    return debouncedFn;
}
