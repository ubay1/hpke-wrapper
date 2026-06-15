"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  base64ToUint8Array,
  createHpkeSuite,
  generateKeyPair,
  uint8ArrayToBase64,
} from "@ubay182/hpke-wrapper";
import { seal, unseal } from "@ubay182/hpke-wrapper";

export default function main() {
  const formRef = useRef<HTMLFormElement>(null);
  const [status, setStatus] = useState("Initializing...");
  const [response, setResponse] = useState("");
  const [serverPubKey, setServerPubKey] = useState<any>("");
  const [clientPubKeyB64, setClientPubKeyB64] = useState("");
  const [serverPubKeyB64, setServerPubKeyB64] = useState("");
  const [clientPrivKey, setClientPrivKey] = useState<any>("");

  async function initKeys() {
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

      if (!res.ok)
        throw new Error("Failed to fetch server public key from API");

      const json = await res.json();
      publicKeyB64 = json.publicKey;
    } else {
      setServerPubKeyB64(publicKeyB64);
      const keyBytes = base64ToUint8Array(publicKeyB64);
      const suite = createHpkeSuite();
      const key = await suite.kem.importKey(
        "raw",
        keyBytes.buffer as ArrayBuffer,
        true,
      );
      setServerPubKey(key);

      // Generate client key pair
      const keys = await generateKeyPair();
      setClientPrivKey(keys.privateKey);
      setClientPubKeyB64(uint8ArrayToBase64(keys.publicKeyRaw));
      setStatus("Ready");
    }
  }

  useEffect(() => {
    initKeys();
  }, []);

  const handleSubmit = useCallback(
    async (e: React.FormEvent<HTMLFormElement>) => {
      e.preventDefault();
      if (!serverPubKey) return;

      setStatus("Encrypting...");

      const form = new FormData(formRef.current!);
      const payload = JSON.stringify({
        title: form.get("title") || "(empty)",
        body: form.get("body") || "(empty)",
        userId: 1,
        _clientPublicKey: clientPubKeyB64,
      });

      const suite = createHpkeSuite();
      const sealed = await seal(suite, serverPubKeyB64, payload);

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
      const decrypted = await unseal(suite, clientPrivKey, json.data);
      const parsed = JSON.parse(decrypted);
      setResponse(JSON.stringify(parsed, null, 2));
      setStatus("Done");
    },
    [serverPubKey, clientPrivKey],
  );

  return (
    <main className="container">
      <div className="header">
        <h1 className="title">
          <svg className="icon" viewBox="0 0 24 24">
            <path d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
          </svg>
          HPKE E2E Encryption
        </h1>
        <div className="status-badge">
          <span
            className={`status-indicator ${status === "Ready" || status === "Done" ? "ready" : status.startsWith("Error") ? "error" : ""}`}
          ></span>
          {status}
        </div>
      </div>

      <div className="key-info">
        <span className="key-label">Server Public Key</span>
        <span className="key-value">
          {serverPubKeyB64
            ? `${serverPubKeyB64.slice(0, 48)}...`
            : "Loading..."}
        </span>
      </div>

      <form ref={formRef} onSubmit={handleSubmit} className="form-group">
        <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
          <label htmlFor="title">Title</label>
          <input
            name="title"
            className="input"
            placeholder="Title"
            defaultValue="Hello HPKE"
          />
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
          <label htmlFor="title">Message</label>
          <textarea
            name="body"
            className="textarea"
            placeholder="Body"
            defaultValue="This message is encrypted end-to-end!"
            rows={4}
          />
        </div>
        <button
          type="submit"
          className="button"
          disabled={
            !serverPubKey ||
            status === "Encrypting..." ||
            status === "Sending encrypted payload..."
          }
        >
          {status === "Encrypting..." ||
          status === "Sending encrypted payload..." ? (
            <>
              <svg
                className="icon"
                style={{ animation: "spin 1s linear infinite" }}
                viewBox="0 0 24 24"
              >
                <circle
                  cx="12"
                  cy="12"
                  r="10"
                  stroke="currentColor"
                  strokeWidth="4"
                  strokeDasharray="32"
                  strokeDashoffset="0"
                  style={{ opacity: 0.2 }}
                ></circle>
                <path
                  d="M12 2v4m0 12v4m10-10h-4M6 12H2"
                  stroke="currentColor"
                  strokeWidth="4"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                ></path>
              </svg>
              Processing...
            </>
          ) : (
            <>
              <svg className="icon" viewBox="0 0 24 24">
                <path d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
              </svg>
              Send Encrypted Request
            </>
          )}
        </button>
      </form>

      {response && (
        <div className="response-card">
          <div className="response-header">
            <svg className="icon" viewBox="0 0 24 24">
              <path d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            Decrypted Server Response:
          </div>
          <pre className="response-content">{response}</pre>
        </div>
      )}
    </main>
  );
}
