/**
 * @jest-environment node
 */

import { FullGhostTextController } from '../fullGhostTextController.js';
import {
    BlockMode,
    CompletionLifecycleKind,
    CompletionSource,
    InlineCompletionTriggerKind,
} from '../types.js';
import type {
    CompletionRequestContext,
    CompletionResult,
    CompletionStrategy,
    IAICompletionClient,
    IAsyncCompletionsManager,
    ICompletionsCache,
    ICurrentGhostText,
    IPostProcessor,
    IPromptFactory,
    ISpeculativeRequestCache,
    IStrategyManager,
    ITelemetryEmitter,
    PromptInfo,
} from '../types.js';

describe('FullGhostTextController', () => {
    const singleLineStrategy: CompletionStrategy = {
        requestMultiline: false,
        blockMode: BlockMode.Parsing,
        stopTokens: ['\n'],
        maxTokens: 64,
    };

    const multilineStrategy: CompletionStrategy = {
        requestMultiline: true,
        blockMode: BlockMode.Parsing,
        stopTokens: ['\n\n'],
        maxTokens: 128,
    };

    let promptFactory: jest.Mocked<IPromptFactory>;
    let aiCompletionClient: jest.Mocked<IAICompletionClient>;
    let postProcessor: jest.Mocked<IPostProcessor>;
    let strategyManager: jest.Mocked<IStrategyManager>;
    let completionsCache: jest.Mocked<ICompletionsCache>;
    let currentGhostText: jest.Mocked<ICurrentGhostText>;
    let speculativeCache: jest.Mocked<ISpeculativeRequestCache>;
    let asyncManager: jest.Mocked<IAsyncCompletionsManager>;
    let telemetryEmitter: jest.Mocked<ITelemetryEmitter>;
    let editor: { getModel: jest.Mock; getPosition: jest.Mock };
    let model: { getValue: jest.Mock };
    let controller: FullGhostTextController;

    const prompt: PromptInfo = {
        prefix: 'for i in range(10):\n',
        suffix: '',
        context: [],
        isFimEnabled: true,
        trailingWs: '    ',
    };

    const completion: CompletionResult = {
        insertText: 'print(i)',
        range: {
            startLineNumber: 2,
            startColumn: 5,
            endLineNumber: 2,
            endColumn: 5,
        },
        completionId: 'req-1-0',
        source: CompletionSource.Network,
        isMultiline: false,
    };

    function context(requestId: string): CompletionRequestContext {
        return {
            requestId,
            uri: 'file:///test.py',
            languageId: 'python',
            position: { lineNumber: 2, column: 5 },
            triggerKind: InlineCompletionTriggerKind.Automatic,
            strategy: singleLineStrategy,
            prompt: {} as PromptInfo,
            versionId: 1,
        };
    }

    beforeEach(() => {
        promptFactory = {
            buildPrompt: jest.fn(async (requestContext: CompletionRequestContext) => {
                if (requestContext.prompt?.prefix) {
                    const match = requestContext.prompt.prefix.match(/([ \t]*)$/);
                    const trailingWs = match?.[1] ?? '';
                    return {
                        ...requestContext.prompt,
                        prefix: trailingWs ? requestContext.prompt.prefix.slice(0, -trailingWs.length) : requestContext.prompt.prefix,
                        trailingWs,
                    };
                }
                requestContext.prompt = {
                    ...prompt,
                    prefix: prompt.prefix + (prompt.trailingWs ?? ''),
                };
                return prompt;
            }),
            getAllocation: jest.fn(),
            getMaxPromptLength: jest.fn(),
        };

        aiCompletionClient = {
            requestCompletion: jest.fn().mockResolvedValue([completion]),
            cancelRequest: jest.fn(),
        };

        postProcessor = {
            process: jest.fn((result: CompletionResult) => result),
        };

        strategyManager = {
            determineStrategy: jest.fn(async (_context, _prompt, count) =>
                count >= 2 ? multilineStrategy : singleLineStrategy,
            ),
        };

        completionsCache = {
            findAll: jest.fn().mockReturnValue([]),
            append: jest.fn(),
            clear: jest.fn(),
        };

        currentGhostText = {
            setCurrent: jest.fn(),
            getCompletionsForUserTyping: jest.fn().mockReturnValue(undefined),
            clear: jest.fn(),
            hasAcceptedCurrentCompletion: jest.fn(),
            getCurrent: jest.fn().mockReturnValue({
                prefix: prompt.prefix,
                suffix: prompt.suffix,
                choices: [completion],
            }),
        };

        speculativeCache = {
            set: jest.fn(),
            request: jest.fn().mockResolvedValue(undefined),
            find: jest.fn().mockReturnValue(undefined),
            waitFor: jest.fn().mockResolvedValue(undefined),
            getResult: jest.fn().mockReturnValue(undefined),
            clear: jest.fn(),
        };

        asyncManager = {
            getFirstMatchingRequestWithTimeout: jest.fn().mockResolvedValue(undefined),
            registerRequest: jest.fn(),
            cancelRequest: jest.fn(),
        };

        telemetryEmitter = {
            emit: jest.fn(),
        };

        model = {
            getValue: jest.fn().mockReturnValue(prompt.prefix),
        };

        editor = {
            getModel: jest.fn().mockReturnValue(model),
            getPosition: jest.fn().mockReturnValue({ lineNumber: 2, column: 5 }),
        };

        controller = new FullGhostTextController(
            promptFactory,
            aiCompletionClient,
            postProcessor,
            strategyManager,
            completionsCache,
            currentGhostText,
            speculativeCache,
            asyncManager,
            telemetryEmitter,
            editor as any,
            { debounceMs: 0, asyncTimeout: 0 },
        );
    });

    it('starts a safe speculative request for the accepted next line when a completion is shown', async () => {
        await controller.getCompletions(context('req-1'));

        controller.handleLifecycle('req-1-0', CompletionLifecycleKind.Shown);
        await Promise.resolve();
        await Promise.resolve();

        expect(speculativeCache.set).toHaveBeenCalledWith(
            'req-1-0',
            'for i in range(10):\n    print(i)\n',
            '',
            expect.any(Function),
        );
        expect(aiCompletionClient.requestCompletion).toHaveBeenCalledTimes(1);
    });

    it('passes consecutive accept count into strategy selection after accepted completions', async () => {
        await controller.getCompletions(context('req-1'));

        controller.handleLifecycle('req-1-0', CompletionLifecycleKind.Accepted);
        controller.handleLifecycle('req-2-0', CompletionLifecycleKind.Accepted);

        await controller.getCompletions(context('req-2'));

        expect(strategyManager.determineStrategy).toHaveBeenLastCalledWith(
            expect.anything(),
            prompt,
            2,
        );
        expect(aiCompletionClient.requestCompletion).toHaveBeenLastCalledWith(
            prompt,
            multilineStrategy,
            expect.objectContaining({ requestId: 'req-2' }),
        );
    });

    it('keeps consecutive accept count when a network request returns no results', async () => {
        aiCompletionClient.requestCompletion
            .mockResolvedValueOnce([completion])
            .mockResolvedValueOnce([])
            .mockResolvedValueOnce([completion]);

        await controller.getCompletions(context('req-1'));

        controller.handleLifecycle('req-1-0', CompletionLifecycleKind.Accepted);
        controller.handleLifecycle('req-2-0', CompletionLifecycleKind.Accepted);

        await controller.getCompletions(context('req-2'));
        await controller.getCompletions(context('req-3'));

        expect(strategyManager.determineStrategy).toHaveBeenLastCalledWith(
            expect.anything(),
            prompt,
            2,
        );
        expect(aiCompletionClient.requestCompletion).toHaveBeenLastCalledWith(
            prompt,
            multilineStrategy,
            expect.objectContaining({ requestId: 'req-3' }),
        );
    });

    it('returns speculative cache results before making a network request', async () => {
        const speculativeCompletion: CompletionResult = {
            ...completion,
            insertText: 'print("next")',
            completionId: 'speculative-req-1-0',
            source: CompletionSource.Network,
        };

        speculativeCache.find
            .mockReturnValueOnce(undefined)
            .mockReturnValueOnce([speculativeCompletion]);

        await controller.getCompletions(context('req-1'));
        const results = await controller.getCompletions(context('req-2'));

        expect(results).toHaveLength(1);
        expect(results[0]).toMatchObject({
            insertText: 'print("next")',
            source: CompletionSource.Speculative,
            range: {
                startLineNumber: 2,
                startColumn: 5,
                endLineNumber: 2,
                endColumn: 5,
            },
        });
        expect(aiCompletionClient.requestCompletion).toHaveBeenCalledTimes(1);
    });

    it('waits briefly for a pending speculative cache result before making a network request', async () => {
        const speculativeCompletion: CompletionResult = {
            ...completion,
            insertText: 'print("prefetched")',
            completionId: 'speculative-req-1-0',
            source: CompletionSource.Network,
        };

        controller = new FullGhostTextController(
            promptFactory,
            aiCompletionClient,
            postProcessor,
            strategyManager,
            completionsCache,
            currentGhostText,
            speculativeCache,
            asyncManager,
            telemetryEmitter,
            editor as any,
            { debounceMs: 0, asyncTimeout: 25 },
        );

        speculativeCache.find.mockReturnValue(undefined);
        speculativeCache.waitFor.mockResolvedValue([speculativeCompletion]);

        const results = await controller.getCompletions(context('req-1'));

        expect(speculativeCache.waitFor).toHaveBeenCalledWith(prompt.prefix, prompt.suffix, 25);
        expect(results).toHaveLength(1);
        expect(results[0]).toMatchObject({
            insertText: 'print("prefetched")',
            source: CompletionSource.Speculative,
        });
        expect(aiCompletionClient.requestCompletion).not.toHaveBeenCalled();
    });
});
