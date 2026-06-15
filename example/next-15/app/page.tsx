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
      // Use substring instead of split("=")[1] to preserve base64 padding (trailing '=')
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
    }

    if (!publicKeyB64)
      throw new Error(
        "No server public key available. Server may not be ready.",
      );

    setServerPubKeyB64(publicKeyB64);
    const keyBytes = base64ToUint8Array(publicKeyB64);
    const suite = createHpkeSuite();
    const key = await suite.kem.importKey(
      "raw",
      keyBytes.buffer as ArrayBuffer,
      true,
    );
    console.log("Server pub key:", key);
    setServerPubKey(key);

    // Generate client key pair
    const keys = await generateKeyPair();
    setClientPrivKey(keys.privateKey);
    setClientPubKeyB64(uint8ArrayToBase64(keys.publicKeyRaw));
    setStatus("Ready");
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
      console.log("payload = ", payload);
      console.log("sealed = ", sealed);
      // const clientKeys = await generateKeyPair();
      // const clientPubKeyB64 = exportKeyToBase64(clientKeys.publicKey);

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
    <div>
      <h1>🔐 Next.js HPKE E2E Encryption</h1>
      <p>
        Status: <strong>{status}</strong>
      </p>
      <p>
        Server key:{" "}
        <code style={{ fontSize: 12, wordBreak: "break-all" }}>
          {serverPubKeyB64.slice(0, 48)}...
        </code>
      </p>

      <form
        ref={formRef}
        onSubmit={handleSubmit}
        style={{
          marginTop: 24,
          display: "flex",
          flexDirection: "column",
          gap: 12,
          maxWidth: 400,
        }}
      >
        <input
          name="title"
          placeholder="Title"
          defaultValue="Hello HPKE"
          style={{ padding: 8 }}
        />
        <textarea
          name="body"
          placeholder="Body"
          defaultValue="This message is encrypted end-to-end!"
          rows={4}
          style={{ padding: 8 }}
        />
        <button
          type="submit"
          disabled={!serverPubKey}
          style={{
            padding: "10px 20px",
            background: serverPubKey ? "#0070f3" : "#999",
            color: "#fff",
            border: "none",
            borderRadius: 6,
            cursor: serverPubKey ? "pointer" : "not-allowed",
          }}
        >
          Send Encrypted Request
        </button>
      </form>

      {response && (
        <div style={{ marginTop: 24 }}>
          <h3>Decrypted Server Response:</h3>
          <pre
            style={{
              background: "#f5f5f5",
              padding: 16,
              borderRadius: 8,
              overflow: "auto",
            }}
          >
            {response}
          </pre>
        </div>
      )}
    </div>
  );
}
