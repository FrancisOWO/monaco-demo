/**
 * @jest-environment node
 */

import type { TelemetryEvent } from '../types.js';

describe('ConsoleTelemetryEmitter', () => {
    let emitter: { emit(event: TelemetryEvent): void };
    let logger: { info: jest.Mock };

    beforeEach(() => {
        jest.resetModules();
        logger = { info: jest.fn() };
        jest.doMock('../../utils/logger.js', () => ({
            getLogger: () => logger,
        }));
        const { ConsoleTelemetryEmitter } = require('../telemetryEmitter.js');
        emitter = new ConsoleTelemetryEmitter();
    });

    it('should emit event to console', () => {
        const event: TelemetryEvent = {
            eventType: 'completion.issued',
            requestId: 'req-1',
            timestamp: 1234567890,
            properties: { languageId: 'javascript' },
        };

        emitter.emit(event);

        expect(logger.info).toHaveBeenCalledWith('completion.issued', event);
    });

    it('should handle events with empty properties', () => {
        const event: TelemetryEvent = {
            eventType: 'completion.received',
            requestId: 'req-2',
            timestamp: 1234567891,
            properties: {},
        };

        emitter.emit(event);

        expect(logger.info).toHaveBeenCalledWith('completion.received', event);
    });
});
