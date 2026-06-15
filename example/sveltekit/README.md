# SvelteKit HPKE Example

End-to-end encryption demo using [HPKE (Hybrid Public Key Encryption)](https://www.rfc-editor.org/rfc/rfc9180) with SvelteKit.

## How it works

1. **Server** generates an HPKE key pair on startup (auto-persisted to `.hpke-server-keys.json`)
2. **Server hook** (`hooks.server.ts`) sets the server's public key as a cookie on first page load
3. **Client** reads the public key from the cookie (or fetches from `/api/hpke` as fallback)
4. **Client** generates its own key pair, encrypts the request payload using `seal()`, and sends it to the server
5. **Server** decrypts the payload using `unseal()`, processes it, then encrypts the response back using the client's public key
6. **Client** decrypts the server response using its private key

## Architecture

```
┌─────────────────────────────────────────────────────┐
│  Client (Browser)                                   │
│                                                     │
│  +page.svelte                                       │
│  ├── Reads server public key from cookie            │
│  ├── Generates client key pair                      │
│  ├── seal(payload, serverPublicKey)                  │
│  ├── POST /api/hpke { data: sealedPayload }         │
│  └── unseal(response, clientPrivateKey)              │
└─────────────────────────────────────────────────────┘
                        │
                        ▼
┌─────────────────────────────────────────────────────┐
│  Server                                             │
│                                                     │
│  hooks.server.ts (middleware equivalent)             │
│  ├── Sets hpke_server_public_key cookie              │
│                                                     │
│  api/hpke/+server.ts                                │
│  ├── GET  → Returns server public key               │
│  ├── POST → Decrypts request, processes,            │
│  │          encrypts response back to client         │
│                                                     │
│  lib/server/hpke-instance.ts                        │
│  └── Singleton HpkeServer with key persistence      │
└─────────────────────────────────────────────────────┘
```

## Getting Started

```bash
# Install dependencies
npm install

# Start development server
npm run dev

# Build for production
npm run build

# Preview production build
npm run preview
```

## Project Structure

```
src/
├── app.html                          # HTML template
├── app.css                           # Global styles
├── app.d.ts                          # Type declarations
├── hooks.server.ts                   # Server hook (sets HPKE cookie)
├── lib/
│   ├── server/
│   │   └── hpke-instance.ts          # HPKE server singleton
│   └── next-shim.ts                  # Shim for unused Next.js exports
└── routes/
    ├── +layout.svelte                # Root layout
    ├── +page.svelte                  # Main page (client-side encryption)
    └── api/
        └── hpke/
            └── +server.ts            # HPKE API endpoint (GET + POST)
```

## Mapping from Next.js to SvelteKit

| Next.js                 | SvelteKit                                   |
| ----------------------- | ------------------------------------------- |
| `middleware.ts`         | `hooks.server.ts`                           |
| `app/api/hpke/route.ts` | `routes/api/hpke/+server.ts`                |
| `app/page.tsx`          | `routes/+page.svelte`                       |
| `app/layout.tsx`        | `routes/+layout.svelte`                     |
| `app/globals.css`       | `app.css`                                   |
| `"use client"`          | Default (Svelte components are client-side) |
| `useState` / `useRef`   | `$state()` runes                            |
| `useEffect`             | `onMount()`                                 |
| `useCallback`           | Regular functions                           |
