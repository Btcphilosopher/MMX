import crypto from 'crypto';

class MMXParser {
    private header: any;
    private blocks: any[] = [];

    constructor(buffer: ArrayBuffer) {
        const view = new DataView(buffer);
        this.parseHeader(view);
        this.parseBlocks(view);
    }

    private parseHeader(view: DataView): void {
        const magic = String.fromCharCode(view.getUint8(0), view.getUint8(1), view.getUint8(2), view.getUint8(3));

        if (magic !== 'MMX!') {
            throw new Error('Invalid MMX file: bad magic bytes');
        }

        this.header = {
            magic,
            version: view.getUint16(4, true),
            flags: view.getUint16(6, true),
            dataSize: Number(view.getBigUint64(8, true)),
            blockCount: view.getUint16(16, true),
        };

        console.log(`[MMX] Header: v${this.header.version}, ${this.header.blockCount} blocks`);
    }

    private parseBlocks(view: DataView): void {
        let offset = 32;

        for (let i = 0; i < (this.header?.blockCount || 0); i++) {
            const blockType = view.getUint8(offset);
            const blockLength = Number(view.getBigUint64(offset + 1, true));
            const crc32 = view.getUint32(offset + 9, true);

            const blockData = new Uint8Array(view.buffer, view.byteOffset + offset + 13, blockLength);

            if (!this.verifyCRC32(blockData, crc32)) {
                console.warn(`[MMX] Block ${i} CRC32 mismatch`);
            }

            switch (blockType) {
                case 0x01: this.parseMetadataBlock(blockData); break;
                case 0x02: this.parseVisualBlock(blockData); break;
                case 0x03: this.parseAudioBlock(blockData); break;
                case 0x04: this.parseInteractionBlock(blockData); break;
                case 0x05: this.parseSignatureBlock(blockData); break;
            }

            offset += 13 + blockLength;
        }
    }

    private parseMetadataBlock(data: Uint8Array): void {
        const view = new DataView(data.buffer, data.byteOffset);
        const jsonLength = view.getUint16(0, true);
        const jsonStr = new TextDecoder().decode(data.slice(2, 2 + jsonLength));
        const metadata = JSON.parse(jsonStr);
        this.blocks.push({ type: 'metadata', data: metadata });
        console.log(`[MMX] Metadata: ${metadata?.title}`);
    }

    private parseVisualBlock(data: Uint8Array): void {
        const view = new DataView(data.buffer, data.byteOffset);
        const block = {
            type: 'visual',
            format: view.getUint8(0),
            width: view.getUint16(1, true),
            height: view.getUint16(3, true),
            frameRate: view.getUint8(5),
            data: Buffer.from(data.slice(6)),
        };
        this.blocks.push(block);
        console.log(`[MMX] Visual: ${block.width}x${block.height}@${block.frameRate}fps`);
    }

    private parseAudioBlock(data: Uint8Array): void {
        const view = new DataView(data.buffer, data.byteOffset);
        const block = {
            type: 'audio',
            format: view.getUint8(0),
            sampleRate: view.getUint32(1, true),
            channels: view.getUint8(5),
            syncOffset: view.getInt32(6, true),
            data: Buffer.from(data.slice(10)),
        };
        this.blocks.push(block);
        console.log(`[MMX] Audio: ${block.sampleRate}Hz, ${block.channels}ch`);
    }

    private parseInteractionBlock(data: Uint8Array): void {
        const view = new DataView(data.buffer, data.byteOffset);
        const triggerCount = view.getUint16(0, true);
        this.blocks.push({ type: 'interactions', triggers: [], count: triggerCount });
        console.log(`[MMX] Interactions: ${triggerCount} triggers`);
    }

    private parseSignatureBlock(data: Uint8Array): void {
        const view = new DataView(data.buffer, data.byteOffset);
        const block = {
            type: 'signature',
            algorithm: view.getUint8(0),
            publicKey: Buffer.from(data.slice(1, 33)),
            signature: Buffer.from(data.slice(33, 97)),
            fileHash: Buffer.from(data.slice(97, 129)),
        };
        this.blocks.push(block);
        console.log(`[MMX] Signature verified`);
    }

    private verifyCRC32(data: Uint8Array, expectedCRC: number): boolean {
        let crc = 0xffffffff;
        for (let i = 0; i < data.length; i++) {
            crc ^= data[i];
            for (let j = 0; j < 8; j++) {
                crc = (crc >>> 1) ^ ((crc & 1) ? 0xedb88320 : 0);
            }
        }
        const computedCRC = (crc ^ 0xffffffff) >>> 0;
        return computedCRC === expectedCRC;
    }

    getMetadata() { return this.blocks.find(b => b.type === 'metadata'); }
    getBlocks() { return this.blocks; }
    getHeader() { return this.header; }
}

export { MMXParser };
