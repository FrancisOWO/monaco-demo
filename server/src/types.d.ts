declare module 'express-ws' {
    import { Express, RequestHandler } from 'express';
    import { WebSocket } from 'ws';

    interface WebSocketInstance {
        app: Express;
        applyTo: (router: any) => void;
        getWss: () => any;
    }

    interface WebSocketRequest {
        url: string;
        method: string;
        headers: any;
    }

    function expressWs(app: Express, server?: any, options?: any): WebSocketInstance;

    export = expressWs;

    declare global {
        namespace Express {
            interface Application {
                ws(route: string, callback: (ws: WebSocket, req: WebSocketRequest) => void): void;
            }
        }
    }
}
