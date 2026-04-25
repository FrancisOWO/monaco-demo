/**
 * @jest-environment node
 */

import { ConsoleTelemetryEmitter } from '../telemetryEmitter.js';
import type { TelemetryEvent } from '../types.js';

describe('ConsoleTelemetryEmitter', () => {
    let emitter: ConsoleTelemetryEmitter;
    let consoleSpy: jest.SpyInstance;

    beforeEach(() => {
        emitter = new ConsoleTelemetryEmitter();
        consoleSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
    });

    afterEach(() => {
        consoleSpy.mockRestore();
    });

    it('should emit event to console', () => {
        const event: TelemetryEvent = {
            eventType: 'completion.issued',
            requestId: 'req-1',
            timestamp: 1234567890,
            properties: { languageId: 'javascript' },
        };

        emitter.emit(event);

        expect(consoleSpy).toHaveBeenCalledWith(
            '[Telemetry] completion.issued',
            event,
        );
    });

    it('should handle events with empty properties', () => {
        const event: TelemetryEvent = {
            eventType: 'completion.received',
            requestId: 'req-2',
            timestamp: 1234567891,
            properties: {},
        };

        emitter.emit(event);

        expect(consoleSpy).toHaveBeenCalledWith(
            '[Telemetry] completion.received',
            event,
        );
    });
});
