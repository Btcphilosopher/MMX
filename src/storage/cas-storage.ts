import crypto from 'crypto';
import * as fs from 'fs';
import * as path from 'path';

interface StorageEntry {
    hash: string;
    size: number;
    createdAt: number;
    accessedAt: number;
    accessCount: number;
}

class CASStorage {
    private cache: Map<string, Buffer> = new Map();
    private index: Map<string, StorageEntry> = new Map();
    private basePath: string;
    private currentSize: number = 0;
    private maxSize: number;
    private stats = { hits: 0, misses: 0, writes: 0, deletes: 0 };

    constructor(basePath: string = './storage', maxSizeMB: number = 1000) {
        this.basePath = basePath;
        this.maxSize = maxSizeMB * 1024 * 1024;
        this.initializeStorage();
        this.loadIndex();
        this.startGarbageCollection();
    }

    private initializeStorage(): void {
        if (!fs.existsSync(this.basePath)) fs.mkdirSync(this.basePath, { recursive: true });
        if (!fs.existsSync(path.join(this.basePath, 'data'))) fs.mkdirSync(path.join(this.basePath, 'data'), { recursive: true });
    }

    private loadIndex(): void {
        const indexPath = path.join(this.basePath, 'index.json');
        if (fs.existsSync(indexPath)) {
            try {
                const data = JSON.parse(fs.readFileSync(indexPath, 'utf-8'));
                for (const [hash, entry] of Object.entries(data)) {
                    this.index.set(hash, entry as StorageEntry);
                }
                console.log(`[CAS] Loaded ${this.index.size} items from index`);
            } catch (err) {
                console.warn(`[CAS] Failed to load index: ${err}`);
            }
        }
    }

    private saveIndex(): void {
        const indexPath = path.join(this.basePath, 'index.json');
        try {
            fs.writeFileSync(indexPath, JSON.stringify(Object.fromEntries(this.index), null, 2));
        } catch (err) {
            console.error(`[CAS] Failed to save index: ${err}`);
        }
    }

    private getStoragePath(hash: string): string {
        const subdir = hash.substring(0, 4);
        return path.join(this.basePath, 'data', subdir, `${hash}.dat`);
    }

    async store(data: Buffer): Promise<string> {
        const hash = crypto.createHash('sha256').update(data).digest('hex');

        if (this.index.has(hash)) {
            const entry = this.index.get(hash)!;
            entry.accessedAt = Date.now();
            entry.accessCount++;
            return hash;
        }

        if (this.currentSize + data.length > this.maxSize) {
            await this.evictLRU(data.length);
        }

        const storagePath = this.getStoragePath(hash);
        const dir = path.dirname(storagePath);
        if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

        fs.writeFileSync(storagePath, data);

        const entry: StorageEntry = {
            hash,
            size: data.length,
            createdAt: Date.now(),
            accessedAt: Date.now(),
            accessCount: 1,
        };

        this.index.set(hash, entry);
        this.cache.set(hash, data);
        this.currentSize += data.length;
        this.stats.writes++;
        this.saveIndex();
        return hash;
    }

    async retrieve(hash: string): Promise<Buffer | null> {
        if (this.cache.has(hash)) {
            const entry = this.index.get(hash);
            if (entry) {
                entry.accessedAt = Date.now();
                entry.accessCount++;
                this.stats.hits++;
            }
            return this.cache.get(hash) || null;
        }

        const entry = this.index.get(hash);
        if (!entry) {
            this.stats.misses++;
            return null;
        }

        const storagePath = this.getStoragePath(hash);
        if (!fs.existsSync(storagePath)) {
            console.warn(`[CAS] Storage file missing for ${hash}`);
            this.index.delete(hash);
            this.saveIndex();
            return null;
        }

        try {
            const data = fs.readFileSync(storagePath);
            this.cache.set(hash, data);
            entry.accessedAt = Date.now();
            entry.accessCount++;
            this.stats.hits++;
            return data;
        } catch (err) {
            console.error(`[CAS] Failed to retrieve ${hash}: ${err}`);
            this.stats.misses++;
            return null;
        }
    }

    private async evictLRU(requiredBytes: number): Promise<void> {
        let freed = 0;
        const entries = Array.from(this.index.entries()).sort((a, b) => a[1].accessedAt - b[1].accessedAt);

        for (const [hash, entry] of entries) {
            if (freed >= requiredBytes) break;

            const storagePath = this.getStoragePath(hash);
            if (fs.existsSync(storagePath)) fs.unlinkSync(storagePath);

            this.cache.delete(hash);
            this.index.delete(hash);
            this.currentSize -= entry.size;
            freed += entry.size;
            this.stats.deletes++;
            console.log(`[CAS] Evicted ${hash.substring(0, 8)}...`);
        }

        this.saveIndex();
    }

    private startGarbageCollection(): void {
        setInterval(() => {
            const staleThreshold = 30 * 24 * 60 * 60 * 1000;
            const now = Date.now();
            let collected = 0;

            for (const [hash, entry] of this.index) {
                const age = now - entry.createdAt;
                if (age > staleThreshold && entry.accessCount === 0) {
                    const storagePath = this.getStoragePath(hash);
                    if (fs.existsSync(storagePath)) fs.unlinkSync(storagePath);
                    this.index.delete(hash);
                    this.cache.delete(hash);
                    collected++;
                }
            }

            if (collected > 0) {
                console.log(`[CAS] Garbage collection: removed ${collected} items`);
                this.saveIndex();
            }
        }, 24 * 60 * 60 * 1000);
    }

    getStats() {
        return {
            totalItems: this.index.size,
            currentSizeMB: (this.currentSize / 1024 / 1024).toFixed(2),
            maxSizeMB: (this.maxSize / 1024 / 1024).toFixed(2),
            hits: this.stats.hits,
            misses: this.stats.misses,
            hitRate: ((this.stats.hits / (this.stats.hits + this.stats.misses)) * 100).toFixed(2),
        };
    }
}

export { CASStorage, StorageEntry };
