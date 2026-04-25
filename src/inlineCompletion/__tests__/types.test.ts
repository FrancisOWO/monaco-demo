/**
 * @jest-environment node
 */

import {
    CompletionSource,
    InlineCompletionTriggerKind,
    BlockMode,
    CompletionLifecycleKind,
} from '../types.js';

describe('Types', () => {
    describe('CompletionSource', () => {
        it('should have Network value', () => {
            expect(CompletionSource.Network).toBe('network');
        });
    });

    describe('InlineCompletionTriggerKind', () => {
        it('should have correct enum values', () => {
            expect(InlineCompletionTriggerKind.Automatic).toBe(0);
            expect(InlineCompletionTriggerKind.Invoke).toBe(1);
        });
    });

    describe('BlockMode', () => {
        it('should have Server value', () => {
            expect(BlockMode.Server).toBe('server');
        });
    });

    describe('CompletionLifecycleKind', () => {
        it('should have correct lifecycle values', () => {
            expect(CompletionLifecycleKind.Shown).toBe('shown');
            expect(CompletionLifecycleKind.Accepted).toBe('accepted');
            expect(CompletionLifecycleKind.Rejected).toBe('rejected');
            expect(CompletionLifecycleKind.Ignored).toBe('ignored');
        });
    });
});
