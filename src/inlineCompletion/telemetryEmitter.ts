/**
 * 遥测发射器
 * 用于记录和输出补全生命周期事件
 */

import type { ITelemetryEmitter, TelemetryEvent } from './types.js';

/** 控制台遥测发射器 */
export class ConsoleTelemetryEmitter implements ITelemetryEmitter {
    emit(event: TelemetryEvent): void {
        // eslint-disable-next-line no-console
        console.log(`[Telemetry] ${event.eventType}`, event);
    }
}
