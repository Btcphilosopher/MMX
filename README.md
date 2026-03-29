# MMX Protocol Documentation

## Overview

MMX is a decentralized multimedia streaming protocol combining content-addressable storage, relay mesh routing, cryptographic identity, and browser-native multimedia playback. This documentation guides protocol developers in building clients, relays, and publishing tools.

## Quick Navigation

- **[PROTOCOL.md](./PROTOCOL.md)** — Binary .mmx format specification (blocks, serialization, examples)
- **[RELAY_ARCHITECTURE.md](./RELAY_ARCHITECTURE.md)** — Relay mesh protocol, WebSocket/SSE, gossip routing
- **[API_REFERENCE.md](./API_REFERENCE.md)** — PHP backend HTTP endpoints, request/response schemas
- **[CLIENT_GUIDE.md](./CLIENT_GUIDE.md)** — Browser client implementation (WebGL, Web Audio, signature verification)
- **[RELAY_OPERATOR_GUIDE.md](./RELAY_OPERATOR_GUIDE.md)** — Running relay infrastructure (Docker, config, monitoring)
- **[PUBLISHING_GUIDE.md](./PUBLISHING_GUIDE.md)** — Creating and publishing .mmx content (signing, proof-of-work, CAS)

## Five-Layer Architecture

```
┌─────────────────────────────────────────────────────┐
│  Browser Experience Engine (WebGL + Web Audio)      │ ← Client
├─────────────────────────────────────────────────────┤
│  Relay Mesh (WebSocket/SSE + Gossip Protocol)       │ ← Network
├─────────────────────────────────────────────────────┤
│  PHP Backend (Signing, Identity, Publishing)        │ ← Authority
├─────────────────────────────────────────────────────┤
│  Content-Addressable Storage (SHA-256 hashing)      │ ← Storage
├─────────────────────────────────────────────────────┤
│  .MMX Format (Binary multimedia container)          │ ← Wire format
└───────────────────────────────────���─────────────────┘
```

## Core Concepts

### Push vs. Pull

**Traditional web**: Client **pulls** content (HTTP GET → full document)  
**MMX**: Client **subscribes** (WebSocket filter → stream of events)

Clients open persistent relay connections and send subscription filters. Relays push matching .mmx events the moment they arrive, whether published seconds or hours ago.

### Content Addressing

Every asset is stored and retrieved by **SHA-256 hash**, not URL.

- No "original server" concept
- Content replicated automatically across relay caches
- Local client cache keyed by hash (revisits are zero-latency)
- mmx://{sha256} URIs bypass relays for cache hits

### Cryptographic Identity

All content is **Ed25519-signed** by the publisher's public key before streaming.

- Relays verify signatures before indexing
- Clients verify before rendering
- No trust in individual servers required
- Identity registration maps public keys → display names/metadata

### Decentralization

Any operator runs a relay (no central authority):

- Relays gossip events through peer-to-peer propagation
- Clients connect to multiple relays for redundancy
- Spam control via proof-of-work and micropayments
- Relay-local policy (difficulty, rate limits, content filters)

## Getting Started

### 1. Understand the Protocol

Read [PROTOCOL.md](./PROTOCOL.md) to learn the .mmx binary format:
- Header structure (magic bytes, version, flags)
- Five block types (metadata, visual, audio, interactions, signature)
- CRC32 validation
- Complete serialization examples

### 2. Publish Content

Follow [PUBLISHING_GUIDE.md](./PUBLISHING_GUIDE.md):
1. Register Ed25519 identity
2. Create .mmx file (video + audio + interactions)
3. Sign with private key
4. Generate proof-of-work (if required)
5. POST to `/api/v1/publish`

### 3. Run a Relay

Follow [RELAY_OPERATOR_GUIDE.md](./RELAY_OPERATOR_GUIDE.md):
1. Install Node.js relay (Docker or manual)
2. Configure YAML (peers, CAS backend, PoW difficulty)
3. Start relay (systemd or Docker)
4. Monitor with Prometheus/Grafana

### 4. Build a Client

Follow [CLIENT_GUIDE.md](./CLIENT_GUIDE.md):
1. Initialize WebGL (visuals) and Web Audio (spatial sound)
2. Connect to relay via WebSocket
3. Parse .mmx binary format
4. Verify Ed25519 signature
5. Render with sub-millisecond A/V sync
6. Cache content locally

## Relay Event Object

```json
{
  "id": "sha256:b3d8f9...",
  "pubkey": "ed25519:7f3a1c...",
  "created_at": 1720000000,
  "kind": 1,
  "tags": [["t", "music"], ["ref", "sha256:..."]],
  "content": "sha256:a9f3e7...",
  "sig": "ed25519sig:2b4d8f...",
  "pow": "00003a9f...",
  "mmx_meta": {
    "has_audio": true,
    "has_interaction": true,
    "visual_format": "wgsl",
    "duration_ms": 12000,
    "cas_refs": ["sha256:d1e2f3..."]
  }
}
```

## Network Properties

| Property | Value |
|----------|-------|
| Content propagation | <1 second (relay gossip) |
| Audio/visual sync precision | <1 millisecond |
| Client cache hit latency | <10ms (IndexedDB) |
| Signature verification | Ed25519 = 1-2ms |
| Max relay peer count | 1000+ (tested) |
| Typical event size | 50KB-500KB |
| Large asset storage | CAS layer (unlimited) |

## References

- [Nostr Protocol](https://nostr.com/) — Relay gossip inspiration
- [IPFS Content Addressing](https://docs.ipfs.tech/concepts/content-addressing/) — Hash-based routing
- [Ed25519 Cryptography](https://en.wikipedia.org/wiki/EdDSA) — Signing algorithm
- [WebGL Specification](https://www.khronos.org/webgl/) — Hardware-accelerated rendering
- [Web Audio API](https://developer.mozilla.org/en-US/docs/Web/API/Web_Audio_API) — Spatial audio

**Last updated**: 2026-03-29  
**Protocol version**: 0.0001  
**Status**: Active development
