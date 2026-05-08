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
        prefix: 'for i in range(10):\n    ',
        suffix: '',
        context: [],
        isFimEnabled: true,
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
            buildPrompt: jest.fn().mockResolvedValue(prompt),
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

    it('does not start unsafe speculative requests when a completion is shown', async () => {
        await controller.getCompletions(context('req-1'));

        controller.handleLifecycle('req-1-0', CompletionLifecycleKind.Shown);

        expect(speculativeCache.set).not.toHaveBeenCalled();
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
});
