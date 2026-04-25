/**
 * Radix Trie 数据结构
 * 用于前缀匹配的高效存储
 */

export interface TrieNode<T> {
    /** 节点存储的键片段 */
    key: string;
    /** 子节点 */
    children: Map<string, TrieNode<T>>;
    /** 存储的值 */
    value?: T;
}

/**
 * Radix Trie 实现
 */
export class RadixTrie<T> {
    private root: TrieNode<T>;

    constructor() {
        this.root = { key: '', children: new Map() };
    }

    /**
     * 插入键值对
     */
    insert(key: string, value: T): void {
        this.insertNode(this.root, key, value);
    }

    private insertNode(node: TrieNode<T>, key: string, value: T): void {
        if (key === '') {
            node.value = value;
            return;
        }

        // 查找匹配的子节点
        for (const [childKey, childNode] of node.children) {
            const commonPrefix = this.getCommonPrefix(key, childKey);

            if (commonPrefix.length > 0) {
                if (commonPrefix.length === childKey.length) {
                    // 完全匹配子节点，递归插入
                    this.insertNode(childNode, key.slice(commonPrefix.length), value);
                } else {
                    // 部分匹配，需要分裂节点
                    const newNode: TrieNode<T> = {
                        key: childKey.slice(commonPrefix.length),
                        children: childNode.children,
                        value: childNode.value,
                    };

                    const middleNode: TrieNode<T> = {
                        key: commonPrefix,
                        children: new Map([[newNode.key, newNode]]),
                    };

                    node.children.delete(childKey);
                    node.children.set(commonPrefix, middleNode);

                    const remainingKey = key.slice(commonPrefix.length);
                    if (remainingKey === '') {
                        middleNode.value = value;
                    } else {
                        const leafNode: TrieNode<T> = {
                            key: remainingKey,
                            children: new Map(),
                            value,
                        };
                        middleNode.children.set(remainingKey, leafNode);
                    }
                }
                return;
            }
        }

        // 没有匹配的子节点，创建新节点
        const newNode: TrieNode<T> = {
            key,
            children: new Map(),
            value,
        };
        node.children.set(key, newNode);
    }

    /**
     * 查找所有匹配前缀的节点
     */
    findAll(prefix: string): Array<{ remainingKey: string; value: T }> {
        const results: Array<{ remainingKey: string; value: T }> = [];
        this.findAllNodes(this.root, prefix, '', results);
        return results;
    }

    private findAllNodes(
        node: TrieNode<T>,
        prefix: string,
        accumulatedKey: string,
        results: Array<{ remainingKey: string; value: T }>,
    ): void {
        if (prefix === '') {
            // 找到匹配节点，收集所有子节点的值
            this.collectValues(node, accumulatedKey, results);
            return;
        }

        // 查找匹配的子节点
        for (const [childKey, childNode] of node.children) {
            if (prefix.startsWith(childKey)) {
                // 当前子节点完全匹配前缀的一部分
                this.findAllNodes(
                    childNode,
                    prefix.slice(childKey.length),
                    accumulatedKey + childKey,
                    results,
                );
            } else if (childKey.startsWith(prefix)) {
                // 前缀是当前子节点的一部分，收集该节点下所有值
                this.collectValues(childNode, accumulatedKey + childKey, results);
            }
            // 否则不匹配，跳过
        }
    }

    /**
     * 收集节点下所有值
     */
    private collectValues(
        node: TrieNode<T>,
        accumulatedKey: string,
        results: Array<{ remainingKey: string; value: T }>,
    ): void {
        if (node.value !== undefined) {
            results.push({
                remainingKey: accumulatedKey,
                value: node.value,
            });
        }

        for (const [childKey, childNode] of node.children) {
            this.collectValues(childNode, accumulatedKey + childKey, results);
        }
    }

    /**
     * 获取两个字符串的公共前缀
     */
    private getCommonPrefix(a: string, b: string): string {
        let i = 0;
        while (i < a.length && i < b.length && a[i] === b[i]) {
            i++;
        }
        return a.slice(0, i);
    }

    /**
     * 清空 Trie
     */
    clear(): void {
        this.root = { key: '', children: new Map() };
    }
}
