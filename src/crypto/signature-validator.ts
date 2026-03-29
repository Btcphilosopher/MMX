import crypto from 'crypto';

export function generateKeyPair() {
    const { publicKey, privateKey } = crypto.generateKeyPairSync('ed25519', {
        publicKeyEncoding: { format: 'spki', type: 'spki' },
        privateKeyEncoding: { format: 'pkcs8', type: 'pkcs8' }
    });
    return { publicKey, privateKey };
}

export function signMessage(privateKey: string | Buffer, message: string): string {
    const sign = crypto.createSign('sha256');
    sign.update(message);
    return sign.sign(privateKey, 'hex');
}

export function verifySignature(publicKey: string | Buffer, message: string, signature: string): boolean {
    try {
        const verify = crypto.createVerify('sha256');
        verify.update(message);
        return verify.verify(publicKey, signature, 'hex');
    } catch (err) {
        console.error(`Signature verification failed: ${err}`);
        return false;
    }
}

export function hashContent(data: Buffer | string): string {
    const buffer = typeof data === 'string' ? Buffer.from(data) : data;
    return crypto.createHash('sha256').update(buffer).digest('hex');
}

export function computeEventId(event: {
    pubkey: string;
    created_at: number;
    kind: number;
    tags: string[][];
    content: string;
}): string {
    const eventString = JSON.stringify([0, event.pubkey, event.created_at, event.kind, event.tags, event.content]);
    return hashContent(eventString);
}

// FIXED: Proper PoW validation using leading zeros
export function validateProofOfWork(eventId: string, difficulty: number = 0): boolean {
    if (difficulty === 0) return true;
    const target = '0'.repeat(difficulty);
    return eventId.startsWith(target);
}

// FIXED: Proper PoW calculation with leading zeros
export function calculateProofOfWork(
    event: { pubkey: string; created_at: number; kind: number; tags: string[][]; content: string },
    difficulty: number = 0,
    timeout: number = 30000
): { eventId: string; nonce: number } | null {
    if (difficulty === 0) {
        const eventId = computeEventId(event);
        return { eventId, nonce: 0 };
    }

    const targetLeadingZeros = '0'.repeat(difficulty);
    const startTime = Date.now();
    let nonce = 0;

    while (Date.now() - startTime < timeout) {
        const eventWithNonce = { ...event, tags: [...event.tags, ['nonce', nonce.toString()]] };
        const eventId = computeEventId(eventWithNonce);

        if (eventId.startsWith(targetLeadingZeros)) {
            console.log(`[PoW] Found nonce ${nonce} after ${Date.now() - startTime}ms`);
            return { eventId, nonce };
        }
        nonce++;
    }

    console.warn(`[PoW] Calculation timed out after difficulty ${difficulty}`);
    return null;
}

// FIXED: Complete event validation
export async function validateMMXEvent(event: {
    id: string;
    pubkey: string;
    created_at: number;
    kind: number;
    tags: string[][];
    content: string;
    sig: string;
}): Promise<{ valid: boolean; errors: string[] }> {
    const errors: string[] = [];

    if (!event.id) errors.push('Missing event ID');
    if (!event.pubkey) errors.push('Missing public key');
    if (typeof event.created_at !== 'number') errors.push('Invalid created_at');
    if (typeof event.kind !== 'number') errors.push('Invalid kind');
    if (!Array.isArray(event.tags)) errors.push('Invalid tags');
    if (typeof event.content !== 'string') errors.push('Invalid content');
    if (!event.sig) errors.push('Missing signature');

    if (errors.length > 0) return { valid: false, errors };

    const computedId = computeEventId(event);
    if (computedId !== event.id) errors.push(`Event ID mismatch`);

    const messageToVerify = JSON.stringify([0, event.pubkey, event.created_at, event.kind, event.tags, event.content]);
    const sigValid = verifySignature(event.pubkey, messageToVerify, event.sig);
    if (!sigValid) errors.push('Invalid signature');

    return { valid: errors.length === 0, errors };
}

export async function createSignedEvent(
    content: string,
    kind: number,
    privateKey: string | Buffer,
    publicKey: string,
    tags: string[][] = [],
    powDifficulty: number = 0
) {
    try {
        const created_at = Math.floor(Date.now() / 1000);
        let finalTags = tags;

        if (powDifficulty > 0) {
            const tempEvent = { pubkey: publicKey, created_at, kind, tags: finalTags, content };
            const powResult = calculateProofOfWork(tempEvent, powDifficulty);
            if (!powResult) return null;
            finalTags = [...tags, ['nonce', powResult.nonce.toString()]];
        }

        const baseEvent = { pubkey: publicKey, created_at, kind, tags: finalTags, content };
        const id = computeEventId(baseEvent);
        const messageToSign = JSON.stringify([0, baseEvent.pubkey, baseEvent.created_at, baseEvent.kind, baseEvent.tags, baseEvent.content]);
        const sig = signMessage(privateKey, messageToSign);

        return { id, pubkey: publicKey, created_at, kind, tags: finalTags, content, sig };
    } catch (err) {
        console.error(`Failed to create signed event: ${err}`);
        return null;
    }
}
