# @ubay182/hpke-wrapper

HPKE (Hybrid Public Key Encryption) wrapper for modern web applications (Next.js, SvelteKit, etc.) with end-to-end (E2E) encryption and **seal/unseal** obfuscation. RFC 9180 compliant.

## Demo

Check out the complete implementation examples in the [`example/`](https://github.com/ubay1/hpke-wrapper/example) folder:

- [Next.js Example](https://github.com/ubay1/hpke-wrapper/example/next-16)
- [SvelteKit Example](https://github.com/ubay1/hpke-wrapper/example/sveltekit)

```bash
cd example/next-16 # or example/sveltekit
npm install
npm run dev
```

Open `http://localhost:3000` (or `http://localhost:5173` for SvelteKit) — to see the end-to-end encryption form using HPKE.

## Installation

```bash
npm install @ubay182/hpke-wrapper
```

## Quick Start (Agnostic)

### 1. Server-side Initialization

You can create a singleton HPKE server instance that persists keys and rotates them automatically:

```typescript
import { createHpkeServer } from "@ubay182/hpke-wrapper";

const server = createHpkeServer({
  persistKeys: true, // Save keys to .hpke-server-keys.json
  rotateKeys: true, // Auto rotate every 24 hours
  keysFilePath: "./.keys", // Custom path (optional)
  rotationIntervalMs: 24 * 60 * 60 * 1000,
});

await server.init();

// Use these functions in your API routes/endpoints:
const pubKey = server.getPublicKeyBase64();
const decryptedText = await server.decrypt(wrappedCiphertext);
const encryptedResponse = await server.encrypt(message, clientPubKeyB64);
```

### 2. Client-side Encryption

```typescript
import {
  createHpkeSuite,
  generateKeyPair,
  seal,
  unseal,
} from "@ubay182/hpke-wrapper";

const suite = createHpkeSuite();
const clientKeys = await generateKeyPair();

// 1. Encrypt data to send to the server
const sealedPayload = await seal(
  suite,
  serverPubKeyB64,
  JSON.stringify({
    data: "my secret",
    _clientPublicKey: clientKeys.publicKey,
  }),
);

// ... send sealedPayload to the server via POST, receive encrypted response ...

// 2. Decrypt server response
const decrypted = await unseal(suite, clientKeys.privateKey, encryptedResponse);
```

## Next.js Integration Helpers

This package provides specific helper functions for Next.js to make setup easier.

### Route Handlers

`app/api/hpke/route.ts`:

```typescript
import { createHpkeHandlers } from "@ubay182/hpke-wrapper";

const { GET, POST } = createHpkeHandlers({
  persistKeys: true,
  rotateKeys: true,
  onRequest: async (decrypted) => {
    // decrypted: parsed JSON from client (without _clientPublicKey)
    // The return value will be encrypted and sent back to the client
    return { result: "success", data: decrypted };
  },
});

export { GET, POST };
```

### Middleware Helper (Send public key via cookie)

`middleware.ts`:

```typescript
import { createHpkeServer, createHpkeMiddleware } from "@ubay182/hpke-wrapper";

const server = createHpkeServer({ autoGenerateKeys: true });
server.init().catch(() => {});

export default createHpkeMiddleware(server);

export const config = { matcher: "/:path*" };
```

> **Note**: Middleware runs on Edge Runtime where the `fs` module is not available. For fully persistent key storage, use the Route Handler approach.

## API

### Core HPKE

| Function                        | Description                       |
| ------------------------------- | --------------------------------- |
| `createHpkeSuite()`             | HPKE suite with AES-128-GCM       |
| `createHpkeSuiteChaCha20()`     | HPKE suite with ChaCha20-Poly1305 |
| `generateKeyPair()`             | Generate X25519 key pair          |
| `exportKeyToBase64(key)`        | Export public key to base64       |
| `importKeyFromBase64(b64)`      | Import public key from base64     |
| `hpkeEncrypt(msg, pubKey)`      | Encrypt message                   |
| `hpkeDecrypt(ct, enc, privKey)` | Decrypt message                   |
| `uint8ArrayToBase64(buf)`       | Encode Uint8Array to base64       |
| `base64ToUint8Array(b64)`       | Decode base64 to Uint8Array       |

### Seal / Unseal (Recommended)

| Function                            | Description                           |
| ----------------------------------- | ------------------------------------- |
| `seal(suite, pubKeyB64, plainText)` | Encrypt + obfuscate → single string   |
| `unseal(suite, privKey, cipher)`    | Decrypt obfuscated string → plaintext |

The `sealed` format wraps the HPKE ciphertext with random prefix/suffix, which aims to hide the encryption structure:

```
"x7k2mSGVsbG8gV29ybG...x7k2m0"
```

## Encryption Flow

```
CLIENT (Browser)                          SERVER (Node/Next.js/SvelteKit)
─────────────────                        ─────────────────
1. Page loads                             Hook/Middleware sets cookie:
   Reads cookie:                          hpke_server_public_key=<b64>
   hpke_server_public_key

2. Generate client X25519 key pair

3. seal(suite, serverPubKey, payload)
   → "x7k2m<encrypted>...x7k2m0"

4. POST /api/hpke { data: "..." }
                                          5. server.decrypt(data)
                                             → unseal → plaintext

                                          6. Extract _clientPublicKey

                                          7. Process Request / Call external API

                                          8. server.encrypt(response, clientPubKey)
                                             → seal → "..."

                                          9. Return { data: "..." }

10. unseal(suite, clientPrivKey, response)
    → plaintext
```

## Key Persistence

If using `persistKeys: true`, keys will be saved to the `.hpke-server-keys.json` file. This ensures keys persist across server restarts. **Note**: This feature uses the `fs` module (Node.js only) — it is not available on Edge Runtime.

## Key Rotation

If using `rotateKeys: true`, new keys will be generated every `rotationIntervalMs` interval. Old keys will be kept for a grace period so in-flight encrypted messages can still be decrypted.

## Security

- RFC 9180 compliant (X25519 + HKDF-SHA256 + AES-128-GCM)
- Seal/Unseal obfuscation hides encryption metadata structure
- Auto key rotation with grace period
- Public key delivery via cookie (no additional API call required)

For _production_ with sensitive data:

1. Use **KMS/HSM** instead of file-based key storage
2. Always use **HTTPS**
3. Add **rate limiting** and **request validation**
4. Use **Redis** for servers with _multi-instance_ setups
5. Consider **ChaCha20-Poly1305** if you have many mobile app clients

## License

MIT
