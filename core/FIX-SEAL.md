## Ringkasan Perbaikan Error `OpenError` pada HPKE Unseal di Next.js 15

Ditemukan **5 bug** yang menyebabkan error `OpenError: The operation failed for an operation-specific reason`. Berikut ringkasannya:

### Bug #1 (UTAMA): Parsing cookie memotong padding base64

Di [`page.tsx`](example/app/page.tsx:30), kode `cookie.split("=")[1]` memecah string berdasarkan SEMUA karakter `=`, termasuk padding base64 di akhir public key. Contoh: `CkkosA3vBR46...qV4=` menjadi `CkkosA3vBR46...qV4` (tanpa `=`). Akibatnya, client mengenkripsi ke **public key yang salah**, sehingga server gagal mendekripsi.

**Perbaikan:** Diganti dengan `cookie.substring(cookie.indexOf("=") + 1)` agar nilai base64 utuh.

### Bug #2: Tipe key salah saat decrypt di server

[`server.ts`](example/app/utils/server.ts) lama menyimpan objek `XCryptoKey` mentah dan hanya mengirim `privateKey` saja ke [`unseal()`](example/app/utils/operation.ts:106). Padahal `suite.open()` membutuhkan `CryptoKeyPair` (public + private key).

**Perbaikan:** Ditulis ulang — key disimpan sebagai string base64, lalu direkonstruksi menjadi `CryptoKeyPair` lengkap saat decrypt.

### Bug #3: Middleware dan API route pakai key berbeda

Next.js middleware berjalan di **Edge Runtime**, sedangkan API route di **Node.js runtime**. Keduanya membuat instance `hpkeServer` sendiri-sendiri → menghasilkan **key yang berbeda**.

**Perbaikan:** Middleware sekarang mengambil public key dari endpoint [`GET /api/hpke`](example/app/api/hpke/route.ts:7) (runtime Node.js yang sama dengan POST). Client juga punya fallback ke API jika cookie belum tersedia.

### Bug #4: `res.json()` dipanggil 2 kali di [`route.ts`](example/app/api/hpke/route.ts:71)

`Response.json()` mengkonsumsi body stream — memanggil 2 kali menyebabkan error.

**Perbaikan:** Hasil disimpan ke variabel: `const apiResult = await res.json()` lalu dipakai ulang.

### Bug #5: Race condition — tidak ada `ready` promise

Kode lama menggunakan `generateNewKeys().catch(...)` (fire-and-forget), sehingga middleware/API route bisa mengakses key sebelum key selesai di-generate.

**Perbaikan:** Ditambahkan [`ready`](example/app/utils/server.ts:148) promise yang di-`await` sebelum operasi encrypt/decrypt.

### File yang diubah:

- [`example/app/utils/server.ts`](example/app/utils/server.ts) — Ditulis ulang sesuai library `src/server.ts`
- [`example/app/api/hpke/route.ts`](example/app/api/hpke/route.ts) — Tambah GET endpoint, fix `res.json()`, tambah `await ready`
- [`example/middleware.ts`](example/middleware.ts) — Ambil key dari API route, bukan singleton terpisah
- [`example/app/page.tsx`](example/app/page.tsx) — Fix parsing cookie, tambah fallback API
- [`example/app/utils/operation.ts`](example/app/utils/operation.ts) — Bersihkan debug logging
