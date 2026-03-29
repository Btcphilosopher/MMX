// Complete WebSocket event mesh implementation

import WebSocket from 'ws';

class WebSocketEventMesh {
    constructor() {
        this.clients = new Set();
    }

    addClient(client) {
        this.clients.add(client);
        client.on('close', () => this.clients.delete(client));
    }

    broadcast(event, data) {
        this.clients.forEach(client => {
            if (client.readyState === WebSocket.OPEN) {
                client.send(JSON.stringify({ event, data }));
            }
        });
    }
}

// Gossip protocol implementation

class GossipProtocol {
    constructor() {
        this.peers = new Set();
    }

    addPeer(peer) {
        this.peers.add(peer);
    }

    gossip(data) {
        this.peers.forEach(peer => {
            peer.send(data);
        });
    }
}

// Peer management

class PeerManager {
    constructor() {
        this.peers = new Set();
    }

    addPeer(peer) {
        this.peers.add(peer);
    }

    removePeer(peer) {
        this.peers.delete(peer);
    }
}

// Event filtering

function filterEvents(events, criteria) {
    return events.filter(event => event.type === criteria);
}

export { WebSocketEventMesh, GossipProtocol, PeerManager, filterEvents };