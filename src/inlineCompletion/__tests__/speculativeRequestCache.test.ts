/**
 * @jest-environment node
 */

import { SpeculativeRequestCache } from '../cache/speculativeRequestCache.js';
import { CompletionSource } from '../types.js';
import type { CompletionResult } from '../types.js';

describe('SpeculativeRequestCache', () => {
    const completion: CompletionResult = {
        insertText: 'print("next")',
        range: {
            startLineNumber: 2,
            startColumn: 5,
            endLineNumber: 2,
            endColumn: 5,
        },
        completionId: 'speculative-1',
        source: CompletionSource.Network,
        isMultiline: false,
    };

    it('waits for a matching pending request and then exposes it via find', async () => {
        const cache = new SpeculativeRequestCache();
        let resolveRequest!: (value: CompletionResult[]) => void;

        cache.set('shown-1', 'for i in range(10):\n', '', () => new Promise(resolve => {
            resolveRequest = resolve;
        }));

        const waiting = cache.waitFor('for i in range(10):\n', '', 100);
        resolveRequest([completion]);

        await expect(waiting).resolves.toEqual([completion]);
        expect(cache.find('for i in range(10):\n', '')).toEqual([completion]);
    });

    it('does not wait for a different target prefix', async () => {
        const cache = new SpeculativeRequestCache();

        cache.set('shown-1', 'expected\n', '', () => new Promise(() => {}));

        await expect(cache.waitFor('actual\n', '', 100)).resolves.toBeUndefined();
    });
});
