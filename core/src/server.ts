import { CipherSuite } from '@hpke/core';
import { DhkemX25519HkdfSha256 } from '@hpke/dhkem-x25519';
import { HkdfSha256, Aes128Gcm } from '@hpke/core';
import { generateKeyPair, base64ToUint8Array, uint8ArrayToBase64 } from './hpke';
import { seal, unseal } from './operation';

export interface HpkeServerInstance {
  /** Initialize server keys (call this first) */
  init: () => Promise<string>;
  /** Get server public key as base64 */
  getPublicKeyBase64: () => string;
  /** Decrypt message from client (wrapped with seal) */
  decrypt: (wrappedCiphertext: string) => Promise<string>;
  /** Encrypt message to client (wrapped with seal) */
  encrypt: (message: string, clientPublicKey: string) => Promise<string>;
  /** Resolves when server keys are ready */
  ready: Promise<void>;
}

export interface HpkeServerConfig {
  /** Auto-generate keys on initialization (default: true) */
  autoGenerateKeys?: boolean;
  /** Persist keys to file for survival across restarts (default: false) */
  persistKeys?: boolean;
  /** Path to store keys file (default: process.cwd() + '/.hpke-server-keys.json') */
  keysFilePath?: string;
  /** Enable automatic key rotation (default: false) */
  rotateKeys?: boolean;
  /** Key rotation interval in milliseconds (default: 24 hours) */
  rotationIntervalMs?: number;
}

interface StoredKeyPair {
  publicKeyB64: string;
  privateKeyB64: string;
  createdAt: number;
}

interface StoredKeys {
  current: StoredKeyPair;
  previous?: StoredKeyPair;
}

function createSuite() {
  return new CipherSuite({
    kem: new DhkemX25519HkdfSha256(),
    kdf: new HkdfSha256(),
    aead: new Aes128Gcm(),
  });
}

function isNode(): boolean {
  return (
    typeof process !== 'undefined' &&
    process.versions != null &&
    process.versions.node != null
  );
}

function readFile(path: string): string | null {
  try {
    const fs = require('fs') as typeof import('fs');
    if (fs.existsSync(path)) {
      return fs.readFileSync(path, 'utf-8');
    }
  } catch { }
  return null;
}

function writeFile(path: string, data: string): void {
  try {
    const fs = require('fs') as typeof import('fs');
    fs.writeFileSync(path, data);
  } catch { }
}

export function createHpkeServer(config: HpkeServerConfig = {}): HpkeServerInstance {
  const {
    autoGenerateKeys = true,
    persistKeys = false,
    keysFilePath,
    rotateKeys = false,
    rotationIntervalMs = 24 * 60 * 60 * 1000,
  } = config;

  let serverKeyPair: StoredKeyPair | null = null;
  let previousKeyPair: StoredKeyPair | null = null;

  const resolvedPath =
    keysFilePath ||
    (isNode() ? process.cwd() + '/.hpke-server-keys.json' : '.hpke-server-keys.json');

  function saveKeys() {
    if (!serverKeyPair || !isNode() || !persistKeys) return;
    try {
      const data: StoredKeys = {
        current: serverKeyPair,
      };
      if (previousKeyPair) {
        data.previous = previousKeyPair;
      }
      writeFile(resolvedPath, JSON.stringify(data, null, 2));
    } catch (err) {
      console.error('Failed to save server keys:', err);
    }
  }

  async function loadKeys(): Promise<boolean> {
    if (!isNode() || !persistKeys) return false;
    try {
      const content = readFile(resolvedPath);
      if (!content) return false;

      const data: StoredKeys = JSON.parse(content);
      serverKeyPair = data.current;

      if (data.previous) {
        previousKeyPair = data.previous;
      }

      return true;
    } catch {
      return false;
    }
  }

  async function generateNewKeys() {
    const keys = await generateKeyPair();

    if (serverKeyPair) {
      previousKeyPair = serverKeyPair;
    }

    const publicKeyRaw = new Uint8Array(Object.values(keys.publicKey.key));
    const privateKeyRaw = new Uint8Array(Object.values(keys.privateKey.key));

    serverKeyPair = {
      publicKeyB64: uint8ArrayToBase64(publicKeyRaw),
      privateKeyB64: uint8ArrayToBase64(privateKeyRaw),
      createdAt: Date.now(),
    };

    if (persistKeys) {
      saveKeys();
    }
  }

  // Ready promise ensures keys are initialized before any operation
  const readyPromise: Promise<void> = (async () => {
    if (persistKeys) {
      const loaded = await loadKeys();
      if (!loaded && autoGenerateKeys) {
        await generateNewKeys();
      }
    } else if (autoGenerateKeys) {
      await generateNewKeys();
    }
  })();

  const instance: HpkeServerInstance = {
    ready: readyPromise,

    async init(): Promise<string> {
      await readyPromise;
      await generateNewKeys();
      return instance.getPublicKeyBase64();
    },

    getPublicKeyBase64(): string {
      if (!serverKeyPair) {
        throw new Error('Server keys not initialized. Call init() first.');
      }
      return serverKeyPair.publicKeyB64;
    },

    async decrypt(wrappedCiphertext: string): Promise<string> {
      await readyPromise;

      if (!serverKeyPair) {
        throw new Error('Server keys not initialized.');
      }

      const suite = createSuite();

      // Try current key — reconstruct CryptoKeyPair from stored base64
      try {
        const pubBytes = base64ToUint8Array(serverKeyPair.publicKeyB64);
        const privBytes = base64ToUint8Array(serverKeyPair.privateKeyB64);
        const keyPair = {
          publicKey: await suite.kem.importKey('raw', pubBytes.buffer as ArrayBuffer, true),
          privateKey: await suite.kem.importKey('raw', privBytes.buffer as ArrayBuffer, false),
        };
        return await unseal(suite, keyPair, wrappedCiphertext);
      } catch {
        // Try previous key (grace period for rotated keys)
        if (previousKeyPair) {
          try {
            const pubBytes = base64ToUint8Array(previousKeyPair.publicKeyB64);
            const privBytes = base64ToUint8Array(previousKeyPair.privateKeyB64);
            const prevKeyPair = {
              publicKey: await suite.kem.importKey('raw', pubBytes.buffer as ArrayBuffer, true),
              privateKey: await suite.kem.importKey('raw', privBytes.buffer as ArrayBuffer, false),
            };
            return await unseal(suite, prevKeyPair, wrappedCiphertext);
          } catch { }
        }
        throw new Error('Failed to decrypt with any available key');
      }
    },

    async encrypt(message: string, clientPublicKeyBase64: string): Promise<string> {
      await readyPromise;
      const suite = createSuite();
      return await seal(suite, clientPublicKeyBase64, message);
    },
  };

  // Schedule key rotation
  if (rotateKeys) {
    setInterval(() => {
      generateNewKeys().catch((err) => {
        console.error('Key rotation failed:', err);
      });
    }, rotationIntervalMs);
  }

  return instance;
}
