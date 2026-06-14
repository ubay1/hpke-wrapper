import { CipherSuite } from '@hpke/core';
import { DhkemX25519HkdfSha256 } from '@hpke/dhkem-x25519';
import { HkdfSha256, Aes128Gcm } from '@hpke/core';
import { Chacha20Poly1305 } from '@hpke/chacha20poly1305';

/**
 * HPKE Key Pair type (using HPKE library's XCryptoKey)
 */
export interface HpkeKeyPair {
	publicKey: any;    // XCryptoKey
	privateKey: any;   // XCryptoKey
	publicKeyRaw: Uint8Array;
}

/**
 * Encrypted message structure
 */
export interface HpkeEncryptedMessage {
	ciphertext: ArrayBuffer;
	enc: ArrayBuffer;
}

/**
 * HPKE Suite configuration
 */
export interface HpkeSuiteConfig {
	kem?: 'X25519';
	kdf?: 'HKDF-SHA256';
	aead?: 'AES-128-GCM' | 'ChaCha20-Poly1305';
}

/**
 * Create HPKE Suite with AES-128-GCM
 *
 * @returns Configured CipherSuite instance
 *
 * @example
 * ```typescript
 * const suite = createHpkeSuite();
 * const keyPair = await suite.kem.generateKeyPair();
 * ```
 */
export function createHpkeSuite() {
	return new CipherSuite({
		kem: new DhkemX25519HkdfSha256(),
		kdf: new HkdfSha256(),
		aead: new Aes128Gcm(),
	});
}

/**
 * Create HPKE Suite with ChaCha20-Poly1305
 *
 * @returns Configured CipherSuite instance
 *
 * @example
 * ```typescript
 * const suite = createHpkeSuiteChaCha20();
 * ```
 */
export function createHpkeSuiteChaCha20() {
	return new CipherSuite({
		kem: new DhkemX25519HkdfSha256(),
		kdf: new HkdfSha256(),
		aead: new Chacha20Poly1305(),
	});
}

/**
 * Generate a new HPKE key pair
 *
 * @returns Key pair with XCryptoKey objects and raw public key bytes
 *
 * @example
 * ```typescript
 * const { publicKey, privateKey, publicKeyRaw } = await generateKeyPair();
 * ```
 */
export async function generateKeyPair(): Promise<HpkeKeyPair> {
	const suite = createHpkeSuite();
	const keyPair = await suite.kem.generateKeyPair() as { publicKey: any; privateKey: any };

	// Export public key as raw bytes for transmission
	const publicKeyRaw = new Uint8Array(Object.values(keyPair.publicKey.key));

	return {
		publicKey: keyPair.publicKey,
		privateKey: keyPair.privateKey,
		publicKeyRaw,
	};
}

/**
 * Export HPKE public key to base64 string
 *
 * @param publicKey - HPKE public key (XCryptoKey)
 * @returns Base64 encoded public key
 *
 * @example
 * ```typescript
 * const base64 = exportKeyToBase64(publicKey);
 * ```
 */
export function exportKeyToBase64(publicKey: any): string {
	const publicKeyRaw = new Uint8Array(Object.values(publicKey.key));
	return uint8ArrayToBase64(publicKeyRaw);
}

/**
 * Import HPKE public key from base64 string
 *
 * @param base64 - Base64 encoded public key
 * @returns HPKE public key (XCryptoKey)
 *
 * @example
 * ```typescript
 * const publicKey = await importKeyFromBase64(base64String);
 * ```
 */
export async function importKeyFromBase64(base64: string): Promise<any> {
	const keyBytes = base64ToUint8Array(base64);
	const suite = createHpkeSuite();
	return await suite.kem.importKey('raw', keyBytes.buffer as ArrayBuffer, true);
}

/**
 * Encrypt a message using HPKE
 *
 * @param message - Plaintext message to encrypt
 * @param recipientPublicKey - Recipient's public key (XCryptoKey)
 * @returns Encrypted message with ciphertext and encapsulated key
 *
 * @example
 * ```typescript
 * const { ciphertext, enc } = await hpkeEncrypt('Secret message', publicKey);
 * ```
 */
export async function hpkeEncrypt(
	message: string,
	recipientPublicKey: any
): Promise<HpkeEncryptedMessage> {
	const suite = createHpkeSuite();

	const sender = await suite.createSenderContext({
		recipientPublicKey,
	});

	const encoded = new TextEncoder().encode(message);
	const ciphertext = await sender.seal(encoded);

	return {
		ciphertext,
		enc: sender.enc,
	};
}

/**
 * Decrypt a message using HPKE
 *
 * @param ciphertext - Encrypted ciphertext (ArrayBuffer)
 * @param enc - Encapsulated key (Uint8Array or ArrayBuffer)
 * @param recipientPrivateKey - Recipient's private key (XCryptoKey)
 * @returns Decrypted plaintext message
 *
 * @example
 * ```typescript
 * const decrypted = await hpkeDecrypt(ciphertext, enc, privateKey);
 * ```
 */
export async function hpkeDecrypt(
	ciphertext: ArrayBuffer,
	enc: Uint8Array | ArrayBuffer,
	recipientPrivateKey: any
): Promise<string> {
	const suite = createHpkeSuite();

	// Convert enc to Uint8Array if it's ArrayBuffer
	const encBytes = enc instanceof Uint8Array ? enc : new Uint8Array(enc);
	const ciphertextBytes = new Uint8Array(ciphertext);

	const recipient = await suite.createRecipientContext({
		recipientKey: recipientPrivateKey,
		enc: encBytes,
	});

	const plaintext = await recipient.open(ciphertextBytes.buffer);
	return new TextDecoder().decode(plaintext);
}

/**
 * Complete encryption/decryption demo
 *
 * @returns Demo result with original and decrypted messages
 *
 * @example
 * ```typescript
 * const result = await hpkeDemo();
 * console.log(result.match); // true
 * ```
 */
export async function hpkeDemo() {
	const { publicKey, privateKey } = await generateKeyPair();

	const message = 'Hello HPKE!';
	const { ciphertext, enc } = await hpkeEncrypt(message, publicKey);
	const decrypted = await hpkeDecrypt(ciphertext, enc, privateKey);

	return {
		original: message,
		decrypted,
		match: message === decrypted,
	};
}

/**
 * Convert Uint8Array to base64 string
 *
 * @param data - Uint8Array to convert
 * @returns Base64 encoded string
 */
export function uint8ArrayToBase64(data: Uint8Array): string {
	let binary = '';
	data.forEach((byte) => {
		binary += String.fromCharCode(byte);
	});
	return btoa(binary);
}

/**
 * Convert base64 string to Uint8Array
 *
 * @param base64 - Base64 encoded string
 * @returns Uint8Array
 */
export function base64ToUint8Array(base64: string): Uint8Array {
	const binary = atob(base64);
	const bytes = new Uint8Array(binary.length);
	for (let i = 0; i < binary.length; i++) {
		bytes[i] = binary.charCodeAt(i);
	}
	return bytes;
}
