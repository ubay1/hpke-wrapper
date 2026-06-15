import { hpkeServer } from '../../utils/hpke-instance';

/**
 * GET /api/hpke — Returns the server's public key.
 * The client uses this to encrypt messages to the server.
 */
export const GET = async () => {
  try {
    await hpkeServer.ready;
    const publicKey = hpkeServer.getPublicKeyBase64();
    return new Response(
      JSON.stringify({ publicKey }),
      { headers: { 'Content-Type': 'application/json' } }
    );
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    return new Response(
      JSON.stringify({ error: 'Failed to get public key', details: errorMessage }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
};

export const POST = async (request: Request) => {
  try {

    const { data } = await request.json();
    console.log('📦 Received sealed request');
    console.log('📊 data length:', data?.length)
    console.log('📊 data :', data)

    if (!data) {
      return new Response(
        JSON.stringify({ error: 'Missing data field' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
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
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
    } catch (e) {
      requestPayload = { title: decryptedMessage, body: '', userId: 1 };
    }

    if (!clientPublicKey) {
      return new Response(
        JSON.stringify({ error: 'Missing client public key in encrypted payload' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
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
      serverMessage: 'Data has been encrypted on server'
    });

    const wrappedResponse = await hpkeServer.encrypt(responseData, clientPublicKey);

    return new Response(
      JSON.stringify({
        data: wrappedResponse
      }),
      {
        headers: { 'Content-Type': 'application/json' }
      }
    );
  } catch (error: unknown) {
    console.error('❌ Server error:', error);
    console.error('❌ Error stack:', error instanceof Error ? error.stack : 'No stack');
    const errorMessage = error instanceof Error ? error.message : String(error);

    return new Response(
      JSON.stringify({
        error: 'Failed to process request',
        details: errorMessage
      }),
      {
        status: 500,
        headers: { 'Content-Type': 'application/json' }
      }
    );
  }
}