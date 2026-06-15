# @ubay182/hpke-wrapper

HPKE (Hybrid Public Key Encryption) wrapper for **Next.js** applications with end-to-end encryption and **seal/unseal** obfuscation. RFC 9180 compliant.

## Demo

Lihat contoh implementasi lengkap di folder [`example/`](./example):

```bash
cd example
npm install
npm run dev
```

Buka `http://localhost:3000` — form encrypt端-to-end dengan HPKE.

## Installation

```bash
npm install @ubay182/hpke-wrapper
```

## Quick Start

### 1. Create HPKE API Route

`app/api/hpke/route.ts`:

```typescript
import { createHpkeHandlers } from "@ubay182/hpke-wrapper";

const { GET, POST } = createHpkeHandlers({
  persistKeys: true,
  rotateKeys: true,
  onRequest: async (decrypted) => {
    const res = await fetch("https://jsonplaceholder.typicode.com/posts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(decrypted),
    });
    return res.json();
  },
});

export { GET, POST };
```

### 2. Middleware (deliver public key via cookie)

`middleware.ts`:

```typescript
import { createHpkeServer, createHpkeMiddleware } from "@ubay182/hpke-wrapper";

const server = createHpkeServer({ autoGenerateKeys: true });
server.init().catch(() => {});

export default createHpkeMiddleware(server);

export const config = {
  matcher: "/",
};
```

> **Note**: Middleware runs on Edge Runtime where `fs` is unavailable. For full key persistence, use the Route Handler approach instead.

### 3. Client Component

```tsx
"use client";

import { useEffect, useState } from "react";
import {
  seal,
  unseal,
  createHpkeSuite,
  exportKeyToBase64,
  generateKeyPair,
} from "@ubay182/hpke-wrapper";

export function EncryptedForm() {
  const [serverPubKey, setServerPubKey] = useState("");
  const [clientKeys, setClientKeys] = useState<any>(null);
  const suite = createHpkeSuite();

  useEffect(() => {
    // Read public key from cookie (set by middleware)
    const match = document.cookie.match(/hpke_server_public_key=([^;]+)/);
    if (match) setServerPubKey(decodeURIComponent(match[1]));

    // Generate client key pair
    generateKeyPair().then(setClientKeys);
  }, []);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!serverPubKey || !clientKeys) return;

    const formData = new FormData(e.currentTarget);
    const payload = {
      title: formData.get("title"),
      body: formData.get("body"),
      _clientPublicKey: exportKeyToBase64(clientKeys.publicKey),
    };

    const sealed = await seal(suite, serverPubKey, JSON.stringify(payload));

    const res = await fetch("/api/hpke", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ data: sealed }),
    });

    const { data: encryptedResponse } = await res.json();
    const decrypted = await unseal(
      suite,
      clientKeys.privateKey,
      encryptedResponse,
    );
    console.log("Server response:", JSON.parse(decrypted));
  }

  return (
    <form onSubmit={handleSubmit}>
      <input name="title" placeholder="Title" />
      <textarea name="body" placeholder="Body" />
      <button type="submit">Send Encrypted</button>
    </form>
  );
}
```

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

The sealed format wraps HPKE ciphertext with a random prefix/suffix, hiding the encryption structure:

```
"x7k2mSGVsbG8gV29ybG...x7k2m0"
```

### Server Instance

```typescript
import { createHpkeServer } from "@ubay182/hpke-wrapper";

const server = createHpkeServer({
  persistKeys: true, // Save keys to .hpke-server-keys.json
  rotateKeys: true, // Auto-rotate every 24h
  keysFilePath: "./.keys", // Custom path (optional)
  rotationIntervalMs: 24 * 60 * 60 * 1000,
});

await server.init();
const pubKey = server.getPublicKeyBase64();
const decrypted = await server.decrypt(wrappedCiphertext);
const encrypted = await server.encrypt(message, clientPubKeyB64);
```

### Next.js Route Handlers

```typescript
import { createHpkeHandlers } from "@ubay182/hpke-wrapper";

const { GET, POST } = createHpkeHandlers({
  // Same options as createHpkeServer +
  onRequest: async (decrypted, request) => {
    // decrypted: parsed JSON from client (without _clientPublicKey)
    // Return value is encrypted and sent back to client
    return { result: "success", data: decrypted };
  },
  onError: async (error, request) => {
    return NextResponse.json({ error: error.message }, { status: 500 });
  },
});

export { GET, POST };
```

### Middleware Helper

```typescript
// middleware.ts
import { createHpkeServer, createHpkeMiddleware } from "@ubay182/hpke-wrapper";

const server = createHpkeServer({ autoGenerateKeys: true });
server.init().catch(() => {});

export default createHpkeMiddleware(server);

export const config = { matcher: "/:path*" };
```

## Encryption Flow

```
CLIENT (Browser)                          SERVER (Next.js)
─────────────────                        ─────────────────
1. Page loads                             Middleware sets cookie:
   Reads cookie:                          hpke_server_public_key=<b64>
   hpke_server_public_key

2. Generates client X25519 key pair

3. seal(suite, serverPubKey, payload)
   → "x7k2m<encrypted>...x7k2m0"

4. POST /api/hpke { data: "..." }
                                          5. server.decrypt(data)
                                             → unseal → plaintext

                                          6. Extract _clientPublicKey

                                          7. Call external API

                                          8. server.encrypt(response, clientPubKey)
                                             → seal → "..."

                                          9. Return { data: "..." }

10. unseal(suite, clientPrivKey, response)
    → plaintext
```

## Key Persistence

When `persistKeys: true`, keys are saved to `.hpke-server-keys.json`. This allows keys to survive server restarts. **Note**: This uses `fs` (Node.js only) — not available on Edge Runtime.

## Key Rotation

When `rotateKeys: true`, new keys are generated every `rotationIntervalMs`. The old key is kept for a grace period so in-flight encrypted messages can still be decrypted.

## Security

- RFC 9180 compliant (X25519 + HKDF-SHA256 + AES-128-GCM)
- Seal/Unseal obfuscation hides encryption structure
- Automatic key rotation with grace period
- Cookie-based public key delivery (no extra API call)

For production with sensitive data:

1. Use **KMS/HSM** instead of file-based key storage
2. Always use **HTTPS**
3. Add **rate limiting** and **request validation**
4. Use **Redis** for multi-instance deployments
5. Consider **ChaCha20-Poly1305** for mobile clients

## License

MIT
