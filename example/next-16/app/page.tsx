"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  base64ToUint8Array,
  createHpkeSuite,
  generateKeyPair,
  uint8ArrayToBase64,
} from "@ubay182/hpke-wrapper";
import { seal, unseal } from "@ubay182/hpke-wrapper";

interface HpkeKeys {
  serverPubKey: CryptoKey;
  serverPubKeyB64: string;
  clientPrivKey: CryptoKey;
  clientPubKeyB64: string;
}

async function initKeys(): Promise<HpkeKeys> {
  // Try cookie first, then fall back to API endpoint
  let publicKeyB64: string | null = null;

  const cookie = document.cookie
    .split("; ")
    .find((row) => row.startsWith("hpke_server_public_key="));

  if (cookie) {
    publicKeyB64 = decodeURIComponent(
      cookie.substring(cookie.indexOf("=") + 1),
    );
  }

  // Fallback: fetch from API if cookie not available
  if (!publicKeyB64) {
    const res = await fetch("/api/hpke", { method: "GET" });

    if (!res.ok) throw new Error("Failed to fetch server public key from API");

    const json = await res.json();
    publicKeyB64 = json.publicKey;
  }

  if (!publicKeyB64) {
    throw new Error("No server public key available");
  }

  const keyBytes = base64ToUint8Array(publicKeyB64);
  const suite = createHpkeSuite();
  const serverPubKey = await suite.kem.importKey(
    "raw",
    keyBytes.buffer as ArrayBuffer,
    true,
  );

  // Generate client key pair
  const clientKeys = await generateKeyPair();

  return {
    serverPubKey,
    serverPubKeyB64: publicKeyB64,
    clientPrivKey: clientKeys.privateKey,
    clientPubKeyB64: uint8ArrayToBase64(clientKeys.publicKeyRaw),
  };
}

export default function Page() {
  const formRef = useRef<HTMLFormElement>(null);
  const [status, setStatus] = useState("Initializing...");
  const [response, setResponse] = useState("");
  const keysRef = useRef<HpkeKeys | null>(null);
  const [ready, setReady] = useState(false);
  const [serverPubKeyB64, setServerPubKeyB64] = useState("");

  useEffect(() => {
    let cancelled = false;

    initKeys()
      .then((keys) => {
        if (cancelled) return;
        keysRef.current = keys;
        setServerPubKeyB64(keys.serverPubKeyB64);
        setReady(true);
        setStatus("Ready");
      })
      .catch((err) => {
        if (cancelled) return;
        setStatus("Error: " + (err as Error).message);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  const handleSubmit = useCallback(
    async (e: React.FormEvent<HTMLFormElement>) => {
      e.preventDefault();
      const keys = keysRef.current;
      if (!keys) return;

      setStatus("Encrypting...");

      const form = new FormData(formRef.current!);
      const payload = JSON.stringify({
        title: form.get("title") || "(empty)",
        body: form.get("body") || "(empty)",
        userId: 1,
        _clientPublicKey: keys.clientPubKeyB64,
      });

      const suite = createHpkeSuite();
      const sealed = await seal(suite, keys.serverPubKeyB64, payload);

      setStatus("Sending encrypted payload...");

      const res = await fetch("/api/hpke", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ data: sealed }),
      });

      const json = await res.json();
      if (!json.data) {
        setStatus("Error: " + JSON.stringify(json));
        return;
      }

      setStatus("Decrypting response...");
      const decrypted = await unseal(suite, keys.clientPrivKey, json.data);
      const parsed = JSON.parse(decrypted);
      setResponse(JSON.stringify(parsed, null, 2));
      setStatus("Done");
    },
    [],
  );

  return (
    <main className="w-full sm:max-w-2xl mx-auto p-6 space-y-8 bg-white dark:bg-zinc-900 rounded-xl shadow-sm mt-10 border border-zinc-200 dark:border-zinc-800">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 border-b border-zinc-100 dark:border-zinc-800 pb-5">
        <h1 className="text-2xl font-bold flex items-center gap-2 text-zinc-800 dark:text-zinc-100">
          HPKE E2E Encryption
        </h1>
        <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-zinc-100 dark:bg-zinc-800 text-sm font-medium border border-zinc-200 dark:border-zinc-700">
          <span
            className={`w-2.5 h-2.5 rounded-full ${status === "Ready" || status === "Done" ? "bg-green-500" : status.startsWith("Error") ? "bg-red-500" : "bg-yellow-500 animate-pulse"}`}
          ></span>
          <span className="text-zinc-700 dark:text-zinc-300">{status}</span>
        </div>
      </div>

      <div className="bg-zinc-50 dark:bg-zinc-800/50 p-4 rounded-lg border border-zinc-200 dark:border-zinc-700 flex flex-col gap-1 ">
        <span className="text-xs font-semibold text-zinc-500 dark:text-zinc-400 uppercase tracking-wider">
          Server Public Key
        </span>
        <span className="font-mono text-sm text-zinc-700 dark:text-zinc-300 break-all">
          {serverPubKeyB64 ? serverPubKeyB64 : "Loading..."}
        </span>
      </div>

      <form ref={formRef} onSubmit={handleSubmit} className="space-y-5">
        <div className="flex flex-col gap-1.5">
          <label
            htmlFor="title"
            className="text-sm font-medium text-zinc-700 dark:text-zinc-300"
          >
            Title
          </label>
          <input
            id="title"
            name="title"
            className="w-full px-4 py-2 bg-white dark:bg-zinc-900 border border-zinc-300 dark:border-zinc-700 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition-colors outline-none text-zinc-800 dark:text-zinc-100 placeholder:text-zinc-400"
            placeholder="Title"
            defaultValue="Hello HPKE"
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <label
            htmlFor="body"
            className="text-sm font-medium text-zinc-700 dark:text-zinc-300"
          >
            Message
          </label>
          <textarea
            id="body"
            name="body"
            className="w-full px-4 py-2 bg-white dark:bg-zinc-900 border border-zinc-300 dark:border-zinc-700 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition-colors outline-none resize-y text-zinc-800 dark:text-zinc-100 placeholder:text-zinc-400"
            placeholder="Body"
            defaultValue="This message is encrypted end-to-end!"
            rows={4}
          />
        </div>
        <button
          type="submit"
          className="w-full flex items-center justify-center gap-2 py-2.5 px-4 bg-indigo-600 hover:bg-indigo-700 text-white font-medium rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 dark:focus:ring-offset-zinc-900"
          disabled={
            !ready ||
            status === "Encrypting..." ||
            status === "Sending encrypted payload..."
          }
        >
          {status === "Encrypting..." ||
          status === "Sending encrypted payload..." ? (
            <>
              <svg
                className="w-5 h-5 animate-spin"
                viewBox="0 0 24 24"
                fill="none"
              >
                <circle
                  cx="12"
                  cy="12"
                  r="10"
                  stroke="currentColor"
                  strokeWidth="4"
                  strokeDasharray="32"
                  strokeDashoffset="0"
                  className="opacity-25"
                ></circle>
                <path
                  d="M12 2v4m0 12v4m10-10h-4M6 12H2"
                  stroke="currentColor"
                  strokeWidth="4"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  className="opacity-75"
                ></path>
              </svg>
              Processing...
            </>
          ) : (
            <>
              <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor">
                <path d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
              </svg>
              Send Encrypted Request
            </>
          )}
        </button>
      </form>

      {response && (
        <div className="mt-8 bg-zinc-900 dark:bg-black rounded-lg border border-zinc-800 overflow-hidden shadow-inner">
          <div className="flex items-center gap-2 px-4 py-3 bg-zinc-800/50 border-b border-zinc-800 text-zinc-300 font-medium text-sm">
            <svg
              className="w-4 h-4 text-emerald-400"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              <path d="M9 12l2 2 4-4" />
            </svg>
            Decrypted Server Response
          </div>
          <pre className="p-4 text-sm font-mono text-emerald-400 overflow-x-auto">
            {response}
          </pre>
        </div>
      )}
    </main>
  );
}
