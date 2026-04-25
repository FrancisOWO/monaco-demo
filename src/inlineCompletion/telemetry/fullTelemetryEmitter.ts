/**
 * FullTelemetryEmitter
 * 完整版遥测发射器
 * 支持批量发送和 idle 检测
 */

import type {
    ITelemetryEmitter,
    TelemetryEvent,
} from '../types.js';

/**
 * 完整版遥测发射器配置
 */
export interface FullTelemetryEmitterConfig {
    /** 批量发送阈值 */
    batchSize: number;
    /** 初始延迟（ms） */
    initialDelay: number;
    /** idle 超时（ms） */
    idleTimeout: number;
    /** 最大队列大小 */
    maxQueueSize: number;
    /** 自定义发送函数 */
    sendFn?: (events: TelemetryEvent[]) => Promise<void>;
}

/**
 * 完整版遥测发射器
 */
export class FullTelemetryEmitter implements ITelemetryEmitter {
    private queue: TelemetryEvent[] = [];
    private config: FullTelemetryEmitterConfig;
    private idleTimer: ReturnType<typeof setTimeout> | null = null;
    private initialTimer: ReturnType<typeof setTimeout> | null = null;
    private isIdleDetectionStarted = false;

    constructor(config?: Partial<FullTelemetryEmitterConfig>) {
        this.config = {
            batchSize: 10,
            initialDelay: 5000, // 5秒初始延迟
            idleTimeout: 30000, // 30秒idle检测
            maxQueueSize: 100,
            ...config,
        };
    }

    /**
     * 发射遥测事件
     */
    emit(event: TelemetryEvent): void {
        // 添加到队列
        this.queue.push(event);

        // 限制队列大小
        if (this.queue.length > this.config.maxQueueSize) {
            // 移除最旧的事件
            this.queue.shift();
        }

        // 检查是否达到批量发送阈值
        if (this.queue.length >= this.config.batchSize) {
            this.flush();
        }

        // 启动 idle 检测
        if (!this.isIdleDetectionStarted) {
            this.startIdleDetection({
                initialDelay: this.config.initialDelay,
                idleTimeout: this.config.idleTimeout,
            });
        }
    }

    /**
     * 批量发送队列中的事件
     */
    flush(): void {
        if (this.queue.length === 0) {
            return;
        }

        const eventsToSend = [...this.queue];
        this.queue = [];

        // 使用自定义发送函数或默认行为
        if (this.config.sendFn) {
            this.config.sendFn(eventsToSend).catch(error => {
                // eslint-disable-next-line no-console
                console.error('[Telemetry] Failed to send events:', error);
                // 重新加入队列
                this.queue.unshift(...eventsToSend);
            });
        } else {
            // 默认行为：输出到控制台
            this.sendToConsole(eventsToSend);
        }
    }

    /**
     * 启动 idle 检测
     */
    startIdleDetection(config: { initialDelay: number; idleTimeout: number }): void {
        if (this.isIdleDetectionStarted) {
            return;
        }

        this.isIdleDetectionStarted = true;

        // 初始延迟后发送
        this.initialTimer = setTimeout(() => {
            this.flush();
            this.startIdleTimer(config.idleTimeout);
        }, config.initialDelay);
    }

    /**
     * 停止 idle 检测
     */
    stopIdleDetection(): void {
        this.isIdleDetectionStarted = false;

        if (this.idleTimer) {
            clearTimeout(this.idleTimer);
            this.idleTimer = null;
        }

        if (this.initialTimer) {
            clearTimeout(this.initialTimer);
            this.initialTimer = null;
        }
    }

    /**
     * 获取队列大小
     */
    getQueueSize(): number {
        return this.queue.length;
    }

    /**
     * 清空队列
     */
    clearQueue(): void {
        this.queue = [];
    }

    /**
     * 销毁发射器
     */
    dispose(): void {
        this.stopIdleDetection();
        this.flush();
    }

    /**
     * 启动 idle 定时器
     */
    private startIdleTimer(timeout: number): void {
        this.idleTimer = setTimeout(() => {
            this.flush();
            // 继续检测
            if (this.isIdleDetectionStarted) {
                this.startIdleTimer(timeout);
            }
        }, timeout);
    }

    /**
     * 发送事件到控制台
     */
    private sendToConsole(events: TelemetryEvent[]): void {
        for (const event of events) {
            // eslint-disable-next-line no-console
            console.log(`[Telemetry] ${event.eventType}`, {
                requestId: event.requestId,
                timestamp: event.timestamp,
                properties: event.properties,
                measurements: event.measurements,
            });
        }
    }
}

/**
 * 带计数的遥测发射器
 */
export class CountingTelemetryEmitter implements ITelemetryEmitter {
    private events: TelemetryEvent[] = [];

    emit(event: TelemetryEvent): void {
        this.events.push(event);
    }

    getEvents(): TelemetryEvent[] {
        return [...this.events];
    }

    getEventCount(): number {
        return this.events.length;
    }

    getEventCountByType(eventType: string): number {
        return this.events.filter(e => e.eventType === eventType).length;
    }

    clear(): void {
        this.events = [];
    }
}
