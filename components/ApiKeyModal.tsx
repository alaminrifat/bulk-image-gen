import React, { useState, useEffect } from "react";

interface ApiKeyModalProps {
  onApiKeySet: (apiKey: string) => void;
  service: "together" | "imagen";
}

// Simple XOR encryption for demo (not secure for real secrets)
const xorEncrypt = (str: string, key: string) => {
  return btoa(
    Array.from(str)
      .map((c, i) =>
        String.fromCharCode(c.charCodeAt(0) ^ key.charCodeAt(i % key.length))
      )
      .join("")
  );
};
const xorDecrypt = (data: string, key: string) => {
  return Array.from(atob(data))
    .map((c, i) =>
      String.fromCharCode(c.charCodeAt(0) ^ key.charCodeAt(i % key.length))
    )
    .join("");
};

const STORAGE_KEYS = {
  together: "together_api_key_enc",
  imagen: "imagen_api_key_enc",
};
const ENCRYPTION_KEYS = {
  together: "together-demo",
  imagen: "imagen-demo",
};

export default function ApiKeyModal({
  onApiKeySet,
  service,
}: ApiKeyModalProps) {
  const [apiInput, setApiInput] = useState("");
  const [show, setShow] = useState(false);

  useEffect(() => {
    // Always check for a valid API key on mount for the given service
    const storageKey = STORAGE_KEYS[service];
    const encryptionKey = ENCRYPTION_KEYS[service];
    const encrypted = localStorage.getItem(storageKey);
    let valid = false;
    if (encrypted) {
      try {
        const decrypted = xorDecrypt(encrypted, encryptionKey);
        if (decrypted && decrypted.length > 10) {
          onApiKeySet(decrypted);
          valid = true;
        }
      } catch {
        // ignore
      }
    }
    setShow(!valid);
    // Only run on service change
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [onApiKeySet, service]);

  const handleApiKeySubmit = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!apiInput.trim()) return;
    const storageKey = STORAGE_KEYS[service];
    const encryptionKey = ENCRYPTION_KEYS[service];
    const encrypted = xorEncrypt(apiInput.trim(), encryptionKey);
    localStorage.setItem(storageKey, encrypted);
    onApiKeySet(apiInput.trim());
    setShow(false);
  };

  if (!show) return null;

  return (
    <div
      style={{
        position: "fixed",
        top: 0,
        left: 0,
        width: "100vw",
        height: "100vh",
        background: "rgba(0,0,0,0.7)",
        zIndex: 10000,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <form
        onSubmit={handleApiKeySubmit}
        style={{
          background: "#fff",
          padding: 32,
          borderRadius: 12,
          minWidth: 340,
          boxShadow: "0 2px 24px #0002",
          display: "flex",
          flexDirection: "column",
          gap: 16,
          alignItems: "center",
        }}
      >
        <h2 style={{ fontWeight: 700, fontSize: 22 }}>
          {service === "together"
            ? "Enter Together API Key"
            : "Enter Imagen API Key"}
        </h2>
        <input
          type="password"
          value={apiInput}
          onChange={(e) => setApiInput(e.target.value)}
          placeholder={
            service === "together"
              ? "Paste your Together API key"
              : "Paste your Imagen (Gemini) API key"
          }
          style={{
            padding: 8,
            fontSize: 16,
            width: 260,
            borderRadius: 6,
            border: "1px solid #ccc",
          }}
          required
        />
        <button
          type="submit"
          style={{
            background: "#111827",
            color: "#fff",
            border: 0,
            borderRadius: 6,
            padding: "8px 24px",
            fontWeight: 600,
            fontSize: 16,
            cursor: "pointer",
            marginTop: 8,
          }}
        >
          Save API Key
        </button>
        <div
          style={{
            color: "#888",
            fontSize: 13,
            marginTop: 8,
            textAlign: "center",
          }}
        >
          Your {service === "together" ? "Together" : "Imagen (Gemini)"} API key
          is encrypted and stored locally.
          <br />
          You must enter it to use this part of the app.
        </div>
      </form>
    </div>
  );
}
