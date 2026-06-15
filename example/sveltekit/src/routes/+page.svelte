<script lang="ts">
  import {
    base64ToUint8Array,
    createHpkeSuite,
    generateKeyPair,
    uint8ArrayToBase64,
    seal,
    unseal,
  } from '@ubay182/hpke-wrapper';
  import { onMount } from 'svelte';

  let status = $state('Initializing...');
  let response = $state('');
  let serverPubKey = $state<any>(null);
  let clientPubKeyB64 = $state('');
  let serverPubKeyB64 = $state('');
  let clientPrivKey = $state<any>(null);

  let titleValue = $state('Hello HPKE');
  let bodyValue = $state('This message is encrypted end-to-end!');

  async function initKeys() {
    // Try cookie first, then fall back to API endpoint
    let publicKeyB64: string | null = null;

    const cookie = document.cookie
      .split('; ')
      .find((row) => row.startsWith('hpke_server_public_key='));

    if (cookie) {
      publicKeyB64 = decodeURIComponent(
        cookie.substring(cookie.indexOf('=') + 1)
      );
    }

    // Fallback: fetch from API if cookie not available
    if (!publicKeyB64) {
      const res = await fetch('/api/hpke', { method: 'GET' });

      if (!res.ok) throw new Error('Failed to fetch server public key from API');

      const json = await res.json();
      publicKeyB64 = json.publicKey;
    }

    if (publicKeyB64) {
      serverPubKeyB64 = publicKeyB64;
      const keyBytes = base64ToUint8Array(publicKeyB64);
      const suite = createHpkeSuite();
      const key = await suite.kem.importKey(
        'raw',
        keyBytes.buffer as ArrayBuffer,
        true
      );
      serverPubKey = key;

      // Generate client key pair
      const keys = await generateKeyPair();
      clientPrivKey = keys.privateKey;
      clientPubKeyB64 = uint8ArrayToBase64(keys.publicKeyRaw);
      status = 'Ready';
    }
  }

  onMount(() => {
    initKeys();
  });

  async function handleSubmit(e: SubmitEvent) {
    e.preventDefault();
    if (!serverPubKey) return;

    status = 'Encrypting...';

    const payload = JSON.stringify({
      title: titleValue || '(empty)',
      body: bodyValue || '(empty)',
      userId: 1,
      _clientPublicKey: clientPubKeyB64,
    });

    const suite = createHpkeSuite();
    const sealed = await seal(suite, serverPubKeyB64, payload);

    status = 'Sending encrypted payload...';

    const res = await fetch('/api/hpke', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ data: sealed }),
    });

    const json = await res.json();
    if (!json.data) {
      status = 'Error: ' + JSON.stringify(json);
      return;
    }

    status = 'Decrypting response...';
    const decrypted = await unseal(suite, clientPrivKey, json.data);
    const parsed = JSON.parse(decrypted);
    response = JSON.stringify(parsed, null, 2);
    status = 'Done';
  }

</script>

<main class="container">
  <div class="header">
    <h1 class="title">
      <svg class="icon" viewBox="0 0 24 24">
        <path d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
      </svg>
      HPKE E2E Encryption
    </h1>
    <div class="status-badge">
      <span
        class="status-indicator"
        class:ready={status === 'Ready' || status === 'Done'}
        class:error={status.startsWith('Error')}
      ></span>
      {status}
    </div>
  </div>

  <div class="key-info">
    <span class="key-label">Server Public Key</span>
    <span class="key-value">
      {serverPubKeyB64 ? `${serverPubKeyB64.slice(0, 48)}...` : 'Loading...'}
    </span>
  </div>

  <form onsubmit={handleSubmit} class="form-group">
    <div style="display: flex; flex-direction: column; gap: 2px;">
      <label for="title">Title</label>
      <input
        id="title"
        name="title"
        class="input"
        placeholder="Title"
        bind:value={titleValue}
      />
    </div>
    <div style="display: flex; flex-direction: column; gap: 2px;">
      <label for="body">Message</label>
      <textarea
        id="body"
        name="body"
        class="textarea"
        placeholder="Body"
        bind:value={bodyValue}
        rows={4}
      ></textarea>
    </div>
    <button
      type="submit"
      class="button"
      disabled={!serverPubKey || status === 'Encrypting...' || status === 'Sending encrypted payload...'}
    >
      {#if status === 'Encrypting...' || status === 'Sending encrypted payload...'}
        <svg class="icon" style="animation: spin 1s linear infinite;" viewBox="0 0 24 24">
          <circle
            cx="12"
            cy="12"
            r="10"
            stroke="currentColor"
            stroke-width="4"
            stroke-dasharray="32"
            stroke-dashoffset="0"
            style="opacity: 0.2;"
          ></circle>
          <path
            d="M12 2v4m0 12v4m10-10h-4M6 12H2"
            stroke="currentColor"
            stroke-width="4"
            stroke-linecap="round"
            stroke-linejoin="round"
          ></path>
        </svg>
        Processing...
      {:else}
        <svg class="icon" viewBox="0 0 24 24">
          <path d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
        </svg>
        Send Encrypted Request
      {/if}
    </button>
  </form>

  {#if response}
    <div class="response-card">
      <div class="response-header">
        <svg class="icon" viewBox="0 0 24 24">
          <path d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
        Decrypted Server Response:
      </div>
      <pre class="response-content">{response}</pre>
    </div>
  {/if}
</main>
