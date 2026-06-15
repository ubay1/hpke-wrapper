# @ubay182/hpke-wrapper

HPKE (Hybrid Public Key Encryption) wrapper untuk aplikasi web modern (Next.js, SvelteKit, dll.) dengan enkripsi end-to-end (E2E) dan obfuskasi **seal/unseal**. Sesuai standar RFC 9180.

## Demo

Lihat contoh implementasi lengkap di dalam folder [`example/`](./example):
- [Contoh Next.js](./example/next-16)
- [Contoh SvelteKit](./example/sveltekit)

```bash
cd example/next-16 # atau example/sveltekit
npm install
npm run dev
```

Buka `http://localhost:3000` (atau `http://localhost:5173` untuk SvelteKit) — untuk melihat form enkripsi end-to-end menggunakan HPKE.

## Instalasi

```bash
npm install @ubay182/hpke-wrapper
```

## Mulai Cepat (Agnostik)

### 1. Inisialisasi Sisi Server (Server-side)

Anda dapat membuat instance server HPKE singleton yang menyimpan kunci (persist) dan merotasinya secara otomatis:

```typescript
import { createHpkeServer } from "@ubay182/hpke-wrapper";

const server = createHpkeServer({
  persistKeys: true, // Simpan kunci ke .hpke-server-keys.json
  rotateKeys: true, // Rotasi otomatis setiap 24 jam
  keysFilePath: "./.keys", // Path kustom (opsional)
  rotationIntervalMs: 24 * 60 * 60 * 1000,
});

await server.init();

// Gunakan fungsi-fungsi ini pada API routes/endpoints Anda:
const pubKey = server.getPublicKeyBase64();
const decryptedText = await server.decrypt(wrappedCiphertext);
const encryptedResponse = await server.encrypt(message, clientPubKeyB64);
```

### 2. Enkripsi Sisi Klien (Client-side)

```typescript
import { createHpkeSuite, generateKeyPair, seal, unseal } from "@ubay182/hpke-wrapper";

const suite = createHpkeSuite();
const clientKeys = await generateKeyPair();

// 1. Enkripsi data untuk dikirim ke server
const sealedPayload = await seal(suite, serverPubKeyB64, JSON.stringify({
  data: "rahasia saya",
  _clientPublicKey: clientKeys.publicKey
}));

// ... kirim sealedPayload ke server via POST, terima respons terenkripsi ...

// 2. Dekripsi respons server
const decrypted = await unseal(suite, clientKeys.privateKey, encryptedResponse);
```

## Bantuan Integrasi Next.js (Helpers)

Package ini menyediakan fungsi bantuan khusus untuk Next.js agar setup menjadi lebih mudah.

### Route Handlers

`app/api/hpke/route.ts`:

```typescript
import { createHpkeHandlers } from "@ubay182/hpke-wrapper";

const { GET, POST } = createHpkeHandlers({
  persistKeys: true,
  rotateKeys: true,
  onRequest: async (decrypted) => {
    // decrypted: JSON dari klien yang telah diurai (tanpa _clientPublicKey)
    // Nilai return akan dienkripsi dan dikirim kembali ke klien
    return { result: "success", data: decrypted };
  },
});

export { GET, POST };
```

### Middleware Helper (Kirim public key melalui cookie)

`middleware.ts`:

```typescript
import { createHpkeServer, createHpkeMiddleware } from "@ubay182/hpke-wrapper";

const server = createHpkeServer({ autoGenerateKeys: true });
server.init().catch(() => {});

export default createHpkeMiddleware(server);

export const config = { matcher: "/:path*" };
```

> **Catatan**: Middleware berjalan di Edge Runtime yang mana fungsi `fs` tidak tersedia. Untuk penyimpanan kunci yang sepenuhnya persisten, gunakan pendekatan Route Handler.

## API

### HPKE Utama

| Fungsi                          | Deskripsi                         |
| ------------------------------- | --------------------------------- |
| `createHpkeSuite()`             | HPKE suite dengan AES-128-GCM       |
| `createHpkeSuiteChaCha20()`     | HPKE suite dengan ChaCha20-Poly1305 |
| `generateKeyPair()`             | Generate pasangan kunci X25519      |
| `exportKeyToBase64(key)`        | Ekspor public key ke base64         |
| `importKeyFromBase64(b64)`      | Impor public key dari base64        |
| `hpkeEncrypt(msg, pubKey)`      | Enkripsi pesan                      |
| `hpkeDecrypt(ct, enc, privKey)` | Dekripsi pesan                      |
| `uint8ArrayToBase64(buf)`       | Encode Uint8Array ke base64         |
| `base64ToUint8Array(b64)`       | Decode base64 ke Uint8Array         |

### Seal / Unseal (Direkomendasikan)

| Fungsi                              | Deskripsi                             |
| ----------------------------------- | ------------------------------------- |
| `seal(suite, pubKeyB64, plainText)` | Enkripsi + obfuskasi → string tunggal |
| `unseal(suite, privKey, cipher)`    | Dekripsi string obfuskasi → plaintext |

Format `sealed` membungkus ciphertext HPKE dengan awalan/akhiran (prefix/suffix) acak, yang bertujuan menyembunyikan struktur enkripsi:

```
"x7k2mSGVsbG8gV29ybG...x7k2m0"
```

## Alur Enkripsi (Encryption Flow)

```
KLIEN (Browser)                           SERVER (Node/Next.js/SvelteKit)
─────────────────                        ─────────────────
1. Halaman dimuat                         Hook/Middleware setel cookie:
   Membaca cookie:                        hpke_server_public_key=<b64>
   hpke_server_public_key

2. Generate pasangan kunci X25519 klien

3. seal(suite, serverPubKey, payload)
   → "x7k2m<encrypted>...x7k2m0"

4. POST /api/hpke { data: "..." }
                                          5. server.decrypt(data)
                                             → unseal → plaintext

                                          6. Ekstrak _clientPublicKey

                                          7. Proses Request / Panggil API eksternal

                                          8. server.encrypt(response, clientPubKey)
                                             → seal → "..."

                                          9. Kembalikan { data: "..." }

10. unseal(suite, clientPrivKey, response)
    → plaintext
```

## Penyimpanan Kunci (Key Persistence)

Jika menggunakan `persistKeys: true`, kunci akan disimpan pada file `.hpke-server-keys.json`. Hal ini membuat kunci tetap bertahan saat server restart. **Catatan**: Fitur ini menggunakan modul `fs` (Hanya di Node.js) — tidak tersedia pada Edge Runtime.

## Rotasi Kunci (Key Rotation)

Jika menggunakan `rotateKeys: true`, kunci baru akan dibuat setiap interval `rotationIntervalMs`. Kunci lama akan tetap disimpan selama masa tenggang (grace period) agar pesan terenkripsi yang sedang dalam perjalanan (in-flight) masih bisa didekripsi.

## Keamanan

- Sesuai standar RFC 9180 (X25519 + HKDF-SHA256 + AES-128-GCM)
- Obfuskasi Seal/Unseal menyembunyikan struktur metadata enkripsi
- Rotasi kunci otomatis dengan masa tenggang (grace period)
- Pengiriman public key via cookie (tidak butuh panggilan API tambahan)

Untuk *production* dengan data sensitif:

1. Gunakan **KMS/HSM** ketimbang penyimpanan kunci berbasis file
2. Selalu gunakan **HTTPS**
3. Tambahkan **rate limiting** dan **request validation**
4. Gunakan **Redis** untuk server dengan sistem *multi-instance*
5. Pertimbangkan **ChaCha20-Poly1305** jika banyak klien dari aplikasi seluler (mobile)

## Lisensi

MIT
