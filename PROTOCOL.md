# MMX Protocol Specification

## Binary Format Overview

The .mmx file is a binary container that encapsulates multimedia content with embedded metadata, cryptographic signatures, and interaction wiring. It is designed for fast streaming (push-parse-render pipeline) and zero-trust verification.

## File Structure

```
┌─────────────────────────────┐
│  32-byte Fixed Header       │  Magic, version, flags, size
├─────────────────────────────┤
│  Block 1 (Metadata 0x01)    │  Identity, author, tags, CAS refs
├─────────────────────────────┤
│  Block 2 (Visual 0x02)      │  WebP/PNG/JPEG/WGSL/Spline3D
├─────────────────────────────┤
│  Block 3 (Audio 0x03)       │  Opus/AAC/FLAC/PCM + sync offset
├─────────────────────────────┤
│  Block 4 (Interactions 0x04)│  Triggers, event kinds, actions
├─────────────────────────────┤
│  Block 5 (Signature 0x05)   │  Ed25519/secp256k1 + verification
└─────────────────────────────┘
```

## Fixed Header (32 bytes)

| Offset | Size | Field | Format | Description |
|--------|------|-------|--------|-------------|
| 0-3 | 4 | Magic | [0x4D, 0x4D, 0x58, 0x21] | "MMX!" ASCII |
| 4-5 | 2 | Version | uint16 LE | Protocol version (current: 0x0001) |
| 6-7 | 2 | Flags | uint16 LE | Bit flags (see below) |
| 8-15 | 8 | Total Size | uint64 LE | File size in bytes |
| 16-17 | 2 | Block Count | uint16 LE | Number of blocks |
| 18-31 | 14 | Reserved | - | Must be 0x00 for future compatibility |

### Flags (uint16)

| Bit | Flag | Meaning |
|-----|------|---------|
| 0 | HAS_AUDIO | File contains audio block |
| 1 | HAS_INTERACTIONS | File contains interaction block |
| 2 | REQUIRES_POW | Publisher paid for PoW validation |
| 3 | IS_ENCRYPTED | Content is encrypted (key in metadata) |
| 4-15 | Reserved | Must be 0 |

## Block Schema

Every block after the header follows this structure:

| Offset | Size | Field | Format | Description |
|--------|------|-------|--------|-------------|
| 0 | 1 | Block Type | uint8 | 0x01-0x05 (see below) |
| 1-8 | 8 | Block Length | uint64 LE | Payload byte length |
| 9-12 | 4 | CRC32 | uint32 LE | Checksum of payload |
| 13+ | N | Payload | Bytes | Raw block data |

### Block Types

| Code | Name | Required | Purpose |
|------|------|----------|---------|
| 0x01 | Metadata | Yes | Content identity, authorship |
| 0x02 | Visual | Conditional | Images, video, shaders |
| 0x03 | Audio | Conditional | Audio stream, sync offset |
| 0x04 | Interactions | Optional | Trigger rules and actions |
| 0x05 | Signature | Yes | Cryptographic verification |

---

## Block 0x01: Metadata

Contains a UTF-8 JSON object with content identity and publishing metadata.

**Structure**:
- uint16 LE: JSON byte length
- N bytes: UTF-8 JSON object

**JSON Schema**:

```json
{
  "identity_hash": "sha256:a9f3e7b2c1d8e9f0a1b2c3d4e5f6a7b8",
  "author_pubkey": "ed25519:7f3a1c5e8b2d9a0f4c6e1b3a5d7f9e2c",
  "created_at": 1720000000,
  "title": "Untitled",
  "description": "Optional description",
  "tags": ["music", "ambient", "generative"],
  "duration_ms": 60000,
  "cas_refs": [
    "sha256:d1e2f3a4b5c6d7e8f9a0b1c2d3e4f5a6"
  ]
}
```

**Field Descriptions**:

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| identity_hash | string | Yes | SHA-256 of entire .mmx file (for deduplication) |
| author_pubkey | string | Yes | Ed25519 public key of publisher (ed25519:HEX) |
| created_at | int64 | Yes | Unix timestamp (seconds) |
| title | string | Optional | Display name for content |
| description | string | Optional | Long-form metadata |
| tags | array | Optional | String tags for indexing (["genre", "mood"]) |
| duration_ms | int64 | Optional | Total duration in milliseconds |
| cas_refs | array | Optional | Array of SHA-256 hashes stored in CAS layer |

---

## Block 0x02: Visual

Encodes visual content (static image or generative shader).

**Structure**:
- uint8: Format discriminator (0-4)
- uint16 LE: Width in pixels
- uint16 LE: Height in pixels
- uint8: Frame rate (0 = static, 1-60 = fps)
- N bytes: Compressed or shader data

### Format Discriminators

| Code | Format | Codec | Typical Size |
|------|--------|-------|--------------|
| 0 | WebP | WebP lossy/lossless | 50-500 KB |
| 1 | PNG | PNG lossless | 100-1000 KB |
| 2 | JPEG | JPEG lossy | 50-300 KB |
| 3 | WGSL Compute | WebGPU shader bundle | 10-100 KB |
| 4 | Spline3D | 3D mesh + animations | 100-5000 KB |

### Example: Static WebP Image

```
Offset | Value | Type
0      | 0x00  | WebP format
1-2    | 1920  | uint16 LE (width)
3-4    | 1080  | uint16 LE (height)
5      | 0x00  | Frame rate (static)
6+     | [...]| WebP binary data
```

### Example: WGSL Compute Shader

```
Offset | Value | Type
0      | 0x03  | WGSL format
1-2    | 1024  | uint16 LE (width)
3-4    | 512   | uint16 LE (height)
5      | 0x00  | Frame rate (static/procedural)
6+     | @compute fn main() { ... }
```

---

## Block 0x03: Audio

Encodes audio stream with sync offset for A/V synchronization.

**Structure**:
- uint8: Format discriminator (0-3)
- uint32 LE: Sample rate (Hz)
- uint8: Channel count (1=mono, 2=stereo, 6=5.1, etc.)
- int32 LE: Sync offset (milliseconds, relative to visual frame 0)
- N bytes: Compressed or raw audio data

### Format Discriminators

| Code | Format | Bitrate | Typical Size |
|------|--------|---------|--------------|
| 0 | Opus | 32-128 kbps | 240-960 KB (per minute) |
| 1 | AAC | 64-256 kbps | 480-1920 KB (per minute) |
| 2 | FLAC | 256-512 kbps | 1920-3840 KB (per minute) |
| 3 | PCM | Uncompressed | 5-10 MB (per minute) |

### Sync Offset

The sync offset aligns audio playback with visual timeline:

- **0**: Audio starts at visual frame 0 (synchronized)
- **+500**: Audio starts 500ms after visual (audio delayed)
- **-200**: Audio starts 200ms before visual (audio early)

The browser combines `AudioContext.currentTime` with the offset to keep A/V synchronized to sub-millisecond precision.

### Example: Opus Audio

```
Offset | Value | Type
0      | 0x00  | Opus format
1-4    | 48000 | uint32 LE (sample rate)
5      | 0x02  | uint8 (stereo)
6-9    | 0     | int32 LE (sync offset = 0)
10+    | [...]| Opus binary data
```

---

## Block 0x04: Interactions

Encodes interactive elements (clickable regions, hover states, timer-based actions).

**Structure**:
- uint16 LE: Trigger count
- Repeated N times:
  - uint8: Event kind
  - uint64 LE: Target element hash
  - uint8: Action kind
  - uint16 LE: Action payload length
  - N bytes: Action payload (JSON or binary)

### Event Kinds

| Code | Event | Trigger | Parameters |
|------|-------|---------|------------|
| 0 | Click | Mouse click | (x, y) |
| 1 | Hover | Mouse enter | (x, y) |
| 2 | Scroll | Scroll threshold | (scroll_y) |
| 3 | Audio Marker | Audio time | (time_ms) |
| 4 | Timer | Elapsed time | (time_ms) |

### Action Kinds

| Code | Action | Purpose | Payload |
|------|--------|---------|---------|
| 0 | Navigate | Jump to content hash | `{"target_hash": "sha256:..."}` |
| 1 | Play/Pause | Toggle playback | `{"action": "play"}` or `{"action": "pause"}` |
| 2 | Emit Event | Publish relay event | `{"kind": 1, "tags": [...]}` |
| 3 | Fetch Layer | Load additional .mmx | `{"mmx_hash": "sha256:..."}` |
| 4 | Execute WASM | Run embedded handler | `{"function": "onTrigger", "args": [...]}` |

### Example: Click Region

```json
{
  "event_kind": 0,           // Click
  "target_element_hash": "0x1234567890abcdef",
  "action_kind": 0,          // Navigate
  "action_payload": {
    "target_hash": "sha256:new_content..."
  }
}
```

---

## Block 0x05: Signature

Contains cryptographic proof of authenticity and integrity.

**Structure**:
- uint8: Algorithm (0 = Ed25519, 1 = secp256k1)
- 32 bytes: Public key
- 64 bytes: Signature
- 32 bytes: SHA-256 hash of all preceding file bytes

### Verification Workflow

1. Read all bytes from file start to end of last non-signature block
2. Compute SHA-256 of those bytes
3. Extract public key and signature from signature block
4. Verify: `Ed25519.verify(public_key, signature, sha256_hash)`
5. If valid, content is authentic and unmodified

### Example Verification (JavaScript)

```javascript
// Assume: fileBytes = entire .mmx file, sigBlock = Block 0x05
const nacl = require('tweetnacl');

// Extract signature block fields
const algorithm = sigBlock[0];
const publicKey = new Uint8Array(sigBlock.slice(1, 33));
const signature = new Uint8Array(sigBlock.slice(33, 97));
const fileHash = new Uint8Array(sigBlock.slice(97, 129));

// Get data to verify (all bytes before signature block)
const dataToVerify = fileBytes.slice(0, dataToVerify_length);
const computedHash = await crypto.subtle.digest('SHA-256', dataToVerify);

// Verify
const isValid = nacl.sign.detached.verify(
  new Uint8Array(computedHash),
  signature,
  publicKey
);
```

---

## CRC32 Validation

Every block includes a CRC32 checksum. Validation:

```javascript
function verifyCRC32(payload, expectedCRC) {
  let crc = 0xFFFFFFFF;
  
  for (let i = 0; i < payload.length; i++) {
    crc ^= payload[i];
    for (let j = 0; j < 8; j++) {
      crc = (crc >>> 1) ^ ((crc & 1) ? 0xEDB88320 : 0);
    }
  }
  
  const computedCRC = (crc ^ 0xFFFFFFFF) >>> 0;
  return computedCRC === expectedCRC;
}
```

---

## Parsing Implementation Notes

### Streaming-Safe Design

The metadata block (0x01) is always first after the header. Clients can:
1. Read 32-byte header
2. Read first block (metadata)
3. Begin rendering while remaining blocks stream in

This enables **pipelined playback**: visual and audio decoding happen during transmission, not after.

### Endianness

All multi-byte integers use **little-endian (LE)** byte order. This matches x86/x64 native byte order.

### Block Count

The header specifies block count. Use this to:
- Allocate memory for block array upfront
- Skip forward if searching for specific block type
- Validate file integrity (count mismatch = truncation)

### Backward Compatibility

Reserved fields (header bytes 18-31, flags 4-15) must be zero. Clients ignore them. This allows future versions to add fields without breaking old parsers.

---

## Complete Minimal Example

A valid .mmx file with static image + audio:

```
Offset | Value | Description
0-3    | 4D4D 5821 | Magic "MMX!"
4-5    | 0100 | Version 1
6-7    | 0300 | Flags: HAS_AUDIO | HAS_INTERACTIONS
8-15   | c802 0000 0000 0000 | File size = 712 bytes
16-17  | 0300 | Block count = 3
18-31  | 0000...0000 | Reserved

--- Block 1: Metadata (0x01) ---
32     | 01 | Block type
33-40  | 8500 0000 0000 0000 | Payload length = 133 bytes
41-44  | 12345678 | CRC32
45+    | {"identity_hash":"sha256:...", ...}

--- Block 2: Visual (0x02) ---
...    | 02 | Block type
...    | WebP image binary...

--- Block 3: Signature (0x05) ---
...    | 05 | Block type
...    | Ed25519 public key, signature, file hash
```

---

## References

- [CRC32 Algorithm](https://en.wikipedia.org/wiki/Cyclic_redundancy_check)
- [Ed25519 Signatures](https://en.wikipedia.org/wiki/EdDSA)
- [WebP Format](https://developers.google.com/speed/webp)
- [Opus Audio Codec](https://en.wikipedia.org/wiki/Opus_(audio_codec))
- [WGSL Specification](https://www.w3.org/TR/wgsl/)
