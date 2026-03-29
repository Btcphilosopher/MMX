// src/crypto/signature-validator.ts

// Function to generate a new Ed25519 key pair
function generateKeyPair() {
    const { generateKeyPairSync } = require('crypto');
    return generateKeyPairSync('ed25519');
}

// Function to sign a message using Ed25519
function signMessage(privateKey, message) {
    const { sign } = require('crypto');
    return sign(null, Buffer.from(message), privateKey);
}

// Function to verify a signature
function verifySignature(publicKey, message, signature) {
    const { verify } = require('crypto');
    return verify(null, Buffer.from(message), publicKey, signature);
}

// Function to compute event ID
function computeEventId(event) {
    const { createHash } = require('crypto');
    return createHash('sha256').update(JSON.stringify(event)).digest('hex');
}

// Function to validate Proof-of-Work
function validateProofOfWork(event, target) {
    return computeHash(event) < target;
}

// Function to calculate Proof-of-Work
function calculateProofOfWork(event, difficulty) {
    let nonce = 0;
    let hash;
    do {
        event.nonce = nonce;
        hash = computeHash(event);
        nonce++;
    } while (hash >= difficulty);
    return { hash, nonce }; 
}

// Utility to compute hash
function computeHash(event) {
    const { createHash } = require('crypto');
    return createHash('sha256').update(JSON.stringify(event)).digest('hex');
}

// Function to validate MMX Event
function validateMMXEvent(event, target) {
    return validateProofOfWork(event, target) && verifySignature(event.publicKey, event.message, event.signature);
}

// Function to create a signed event
function createSignedEvent(privateKey, message, target) {
    const event = { message };
    const { hash, nonce } = calculateProofOfWork(event, target);
    event.signature = signMessage(privateKey, message);
    event.id = computeEventId(event);
    event.nonce = nonce;
    return event;
}

// Exporting functions
module.exports = { generateKeyPair, signMessage, verifySignature, computeEventId, validateProofOfWork, calculateProofOfWork, validateMMXEvent, createSignedEvent };