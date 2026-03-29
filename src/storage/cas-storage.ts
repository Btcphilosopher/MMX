import crypto from 'crypto';
import LRU from 'lru-cache';
import zlib from 'zlib';

class CASStorage {
    constructor(maxSize = 100, ttl = 60000) {
        this.cache = new LRU({
            max: maxSize,
            length: () => 1,
            dispose: (key, value) => this.remove(key),
            maxAge: ttl
        });
    }

    hashObject(object) {
        const jsonString = JSON.stringify(object);
        return crypto.createHash('sha256').update(jsonString).digest('hex');
    }

    compressData(data) {
        return zlib.deflateSync(data);
    }

    decompressData(data) {
        return zlib.inflateSync(data);
    }

    add(object) {
        const key = this.hashObject(object);
        const compressedData = this.compressData(JSON.stringify(object));
        this.cache.set(key, compressedData);
        return key;
    }

    get(key) {
        const compressedData = this.cache.get(key);
        if (!compressedData) return null;
        return JSON.parse(this.decompressData(compressedData));
    }

    remove(key) {
        this.cache.del(key);
    }

    garbageCollect() {
        const keys = this.cache.keys();
        // For simplicity, re-build the cache based on some criteria
        keys.forEach(key => {
            if (/* condition for garbage collection */) {
                this.remove(key);
            }
        });
    }
}

export default CASStorage;