import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { hpkeServer } from '$lib/server/hpke-instance';

/**
 * GET /api/hpke — Returns the server's public key.
 * The client uses this to encrypt messages to the server.
 */
export const GET: RequestHandler = async () => {
  try {
    await hpkeServer.ready;
    const publicKey = hpkeServer.getPublicKeyBase64();
    return json({ publicKey });
  } catch (err: unknown) {
    const errorMessage = err instanceof Error ? err.message : String(err);
    return json(
      { error: 'Failed to get public key', details: errorMessage },
      { status: 500 }
    );
  }
};

/**
 * POST /api/hpke — Receives encrypted payload, decrypts, processes, re-encrypts response.
 */
export const POST: RequestHandler = async ({ request }) => {
  try {
    const { data } = await request.json();
    console.log('📦 Received sealed request');
    console.log('📊 data length:', data?.length);

    if (!data) {
      return json({ error: 'Missing data field' }, { status: 400 });
    }

    // Ensure server keys are ready before decrypting
    await hpkeServer.ready;

    // Decrypt client message using unseal
    console.log('🔓 Attempting to decrypt...');
    const decryptedMessage = await hpkeServer.decrypt(data);
    console.log('✓ Decrypted client message:', decryptedMessage);

    // Parse the decrypted message and extract clientPublicKey
    let requestPayload;
    let clientPublicKey;

    try {
      const parsed = JSON.parse(decryptedMessage);
      // Extract clientPublicKey from inside the encrypted payload
      clientPublicKey = parsed._clientPublicKey;
      // Remove the internal field before processing
      delete parsed._clientPublicKey;
      requestPayload = parsed;
    } catch {
      requestPayload = { title: decryptedMessage, body: '', userId: 1 };
    }

    if (!clientPublicKey) {
      return json(
        { error: 'Missing client public key in encrypted payload' },
        { status: 400 }
      );
    }

    console.log('🔑 Client public key extracted from encrypted payload');

    const res = await fetch('https://jsonplaceholder.typicode.com/posts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(requestPayload),
    });

    const apiResult = await res.json();
    console.log('✓ API Response received:', apiResult);

    // Encrypt response using seal
    const responseData = JSON.stringify({
      success: true,
      data: apiResult,
      serverMessage: 'Data has been encrypted on server',
    });

    const wrappedResponse = await hpkeServer.encrypt(responseData, clientPublicKey);

    return json({ data: wrappedResponse });
  } catch (err: unknown) {
    console.error('❌ Server error:', err);
    console.error('❌ Error stack:', err instanceof Error ? err.stack : 'No stack');
    const errorMessage = err instanceof Error ? err.message : String(err);

    return json(
      { error: 'Failed to process request', details: errorMessage },
      { status: 500 }
    );
  }
};
