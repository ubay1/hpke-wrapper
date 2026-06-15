import { CipherSuite } from '@hpke/core';
import {
  concatUint8Arrays,
  uint8ArrayToBase64,
  base64ToUint8Array,
  stringToUint8Array,
  uint8ArrayToString,
} from 'uint8array-extras';

const WRAPPER_LENGTH = 5;

const isBase64String = (str: string) => {
  const notBase64 = /[^A-Z0-9+/=]/i;
  const len = str.length;

  if (len % 4 !== 0 || notBase64.test(str)) {
    return false;
  }

  const firstPaddingChar = str.indexOf('=');

  return (
    firstPaddingChar === -1 ||
    firstPaddingChar === len - 1 ||
    (firstPaddingChar === len - 2 && str[len - 1] === '=')
  );
};

const getRandomValues = (array: Uint32Array): Uint32Array => {
  const crypto =
    typeof globalThis.crypto !== 'undefined' && globalThis.crypto
      ? globalThis.crypto
      : (globalThis as any).require('crypto').webcrypto;

  crypto.getRandomValues(array as any);
  return array;
};

const secureMathRandom = () =>
  getRandomValues(new Uint32Array(1))[0] / 4294967295;

const generateWrapperString = () =>
  secureMathRandom()
    .toString(36)
    .substring(2, 2 + WRAPPER_LENGTH);

const wrapBase64 = (base64: string) => {
  const prefix = generateWrapperString();
  const suffix = prefix;

  const paddingMatch = base64.match(/=+$/);
  const paddingCount = paddingMatch ? paddingMatch[0].length : 0;

  const base64WithoutPadding = base64.replace(/=+$/, '');

  return `${prefix}${base64WithoutPadding}${suffix}${paddingCount}`;
};

const unwrapBase64 = (str: string) => {
  const strLength = str.length;

  const prefix = str.substring(0, WRAPPER_LENGTH);
  const suffix = str.substring(strLength - WRAPPER_LENGTH - 1, strLength - 1);
  const paddingCount = parseInt(str.substring(strLength - 1), 10);

  if (prefix === suffix) {
    const base64WithoutPadding = str.substring(
      WRAPPER_LENGTH,
      strLength - WRAPPER_LENGTH - 1,
    );

    const padding = '='.repeat(paddingCount);
    return base64WithoutPadding + padding;
  }

  return str;
};

export const seal = async (
  suite: CipherSuite,
  publicKeyB64: string,
  plainText: string,
) => {
  const publicKey = base64ToUint8Array(publicKeyB64).buffer;
  const { ct: cipherText, enc: encapsulatedKey } = await suite.seal(
    {
      recipientPublicKey: await suite.kem.importKey('raw', publicKey),
    },
    new TextEncoder().encode(plainText),
  );

  const header = stringToUint8Array(`${cipherText.byteLength}`);

  const base64Result = uint8ArrayToBase64(
    concatUint8Arrays([
      new Uint8Array([header.byteLength]),
      header,
      new Uint8Array(cipherText),
      new Uint8Array(encapsulatedKey),
    ]),
  );

  return wrapBase64(base64Result);
};

export const unseal = async (
  suite: CipherSuite,
  privateKey: CryptoKey | CryptoKeyPair,
  cipher: string,
) => {
  const unwrappedCipher = unwrapBase64(cipher);

  if (isBase64String(unwrappedCipher)) {
    try {
      const data = base64ToUint8Array(unwrappedCipher);

      const headerSize = data.at(0) ?? 0;
      const cipherSize = parseInt(
        uint8ArrayToString(data.subarray(1, headerSize + 1)),
        10,
      );
      const cipherStart = headerSize + 1;
      const cipherEnd = headerSize + 1 + cipherSize;
      const cipherText = data.subarray(cipherStart, cipherEnd);
      const encapsulatedKey = data.subarray(cipherEnd);

      return new TextDecoder().decode(
        await suite.open(
          {
            recipientKey: privateKey,
            enc: encapsulatedKey,
          },
          cipherText,
        ),
      );
    } catch (error) {
      console.error('unseal error:', error);
      throw error;
    }
  }

  return cipher;
};
