import React, { useState, useEffect } from "react";

interface ApiKeyModalProps {
  onApiKeySet: (apiKey: string) => void;
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

const STORAGE_KEY = "together_api_key_enc";
const ENCRYPTION_KEY = "together-demo";

export default function ApiKeyModal({ onApiKeySet }: ApiKeyModalProps) {
  const [apiInput, setApiInput] = useState("");
  const [show, setShow] = useState(false);

  useEffect(() => {
    // Always check for a valid API key on mount
    const encrypted = localStorage.getItem(STORAGE_KEY);
    let valid = false;
    if (encrypted) {
      try {
        const decrypted = xorDecrypt(encrypted, ENCRYPTION_KEY);
        if (decrypted && decrypted.length > 10) {
          onApiKeySet(decrypted);
          valid = true;
        }
      } catch {
        // ignore
      }
    }
    setShow(!valid);
  }, [onApiKeySet]);

  const handleApiKeySubmit = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!apiInput.trim()) return;
    const encrypted = xorEncrypt(apiInput.trim(), ENCRYPTION_KEY);
    localStorage.setItem(STORAGE_KEY, encrypted);
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
          Enter Together API Key
        </h2>
        <input
          type="password"
          value={apiInput}
          onChange={(e) => setApiInput(e.target.value)}
          placeholder="Paste your Together API key"
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
          Your API key is encrypted and stored locally.
          <br />
          You must enter it to use the app.
        </div>
      </form>
    </div>
  );
}
