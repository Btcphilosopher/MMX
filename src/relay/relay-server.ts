import WebSocket from 'ws';
import express from 'express';
import cors from 'cors';
import { v4 as uuidv4 } from 'uuid';

interface RelayEvent {
    id: string;
    pubkey: string;
    created_at: number;
    kind: number;
    tags: string[][];
    content: string;
    sig: string;
}

interface ClientConnection {
    id: string;
    subscriptions: Map<string, any[]>;
    ws: WebSocket;
}

class RelayServer {
    private wss: WebSocket.Server;
    private clients: Map<string, ClientConnection> = new Map();
    private events: Map<string, RelayEvent> = new Map();
    private stats = { startTime: Date.now(), totalConnections: 0, totalMessages: 0, totalEvents: 0 };

    constructor(port: number = 8080) {
        this.wss = new WebSocket.Server({ port });
        this.setupServer();
        console.log(`[Relay] WebSocket server started on ws://localhost:${port}`);
    }

    private setupServer(): void {
        this.wss.on('connection', (ws: WebSocket) => {
            const clientId = uuidv4();
            const client: ClientConnection = { id: clientId, subscriptions: new Map(), ws };
            this.clients.set(clientId, client);
            this.stats.totalConnections++;
            console.log(`[Relay] Client connected: ${clientId}`);

            ws.on('message', (data: Buffer) => this.handleMessage(clientId, data));
            ws.on('close', () => { this.clients.delete(clientId); console.log(`[Relay] Client disconnected: ${clientId}`); });
            ws.on('error', (error: Error) => console.error(`[Relay] Error: ${error.message}`));
        });

        setInterval(() => {
            const uptime = Math.floor((Date.now() - this.stats.startTime) / 1000);
            console.log(`[Relay] Stats - Clients: ${this.clients.size}, Events: ${this.events.size}`);
        }, 30000);
    }

    private handleMessage(clientId: string, data: Buffer): void {
        try {
            const message = JSON.parse(data.toString());
            const client = this.clients.get(clientId);
            if (!client || !Array.isArray(message) || message.length < 2) return;

            const [type, ...params] = message;
            this.stats.totalMessages++;

            switch (type) {
                case 'EVENT': this.handleEvent(clientId, params[0]); break;
                case 'REQ': this.handleREQ(clientId, params[0], params.slice(1)); break;
                case 'CLOSE': this.handleCLOSE(clientId, params[0]); break;
            }
        } catch (error) {
            console.error(`[Relay] Parse error: ${error}`);
        }
    }

    private handleEvent(clientId: string, event: RelayEvent): void {
        const client = this.clients.get(clientId);
        if (!client || !event.id || !event.pubkey || !event.sig) {
            if (client) this.send(client.ws, ['OK', event?.id || '', false, 'Invalid event']);
            return;
        }

        this.events.set(event.id, event);
        this.stats.totalEvents++;
        this.send(client.ws, ['OK', event.id, true, '']);
        this.broadcastEvent(event);
    }

    private handleREQ(clientId: string, subId: string, filters: any[]): void {
        const client = this.clients.get(clientId);
        if (!client) return;

        client.subscriptions.set(subId, filters);
        for (const event of this.events.values()) {
            if (this.matchesFilters(event, filters)) {
                this.send(client.ws, ['EVENT', subId, event]);
            }
        }
        this.send(client.ws, ['EOSE', subId]);
    }

    private handleCLOSE(clientId: string, subId: string): void {
        const client = this.clients.get(clientId);
        if (client) client.subscriptions.delete(subId);
    }

    private matchesFilters(event: RelayEvent, filters: any[]): boolean {
        return filters.some((filter) => {
            if (filter.ids && !filter.ids.includes(event.id)) return false;
            if (filter.kinds && !filter.kinds.includes(event.kind)) return false;
            if (filter.authors && !filter.authors.includes(event.pubkey)) return false;
            if (filter.since && event.created_at < filter.since) return false;
            if (filter.until && event.created_at > filter.until) return false;
            return true;
        });
    }

    private broadcastEvent(event: RelayEvent): void {
        this.clients.forEach((client) => {
            client.subscriptions.forEach((filters, subId) => {
                if (this.matchesFilters(event, filters)) {
                    this.send(client.ws, ['EVENT', subId, event]);
                }
            });
        });
    }

    private send(ws: WebSocket, message: any[]): void {
        if (ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify(message));
        }
    }

    getStats() {
        return {
            uptime: Math.floor((Date.now() - this.stats.startTime) / 1000),
            clients: this.clients.size,
            events: this.events.size,
        };
    }
}

const relayPort = parseInt(process.env.RELAY_PORT || '8080');
const relay = new RelayServer(relayPort);

const app = express();
app.use(cors());
app.get('/health', (req, res) => res.json({ status: 'ok' }));
app.get('/stats', (req, res) => res.json(relay.getStats()));
app.listen(parseInt(process.env.HTTP_PORT || '8081'));

export default RelayServer;
