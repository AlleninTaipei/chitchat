"use client";

import { useState, useRef, useEffect } from "react";
import { useLocale } from "@/contexts/LocaleContext";

interface ApiKeyModalProps {
  onSave: (key: string) => void;
  onClose?: () => void; // undefined = forced mode (first setup, cannot cancel)
  isUpdate?: boolean;
}

export default function ApiKeyModal({ onSave, onClose, isUpdate }: ApiKeyModalProps) {
  const [value, setValue] = useState("");
  const [error, setError] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const { t } = useLocale();

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  function handleSave() {
    const trimmed = value.trim();
    if (!trimmed.startsWith("sk-ant-")) {
      setError(t.apiKeyError);
      return;
    }
    setError("");
    onSave(trimmed);
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Enter") handleSave();
    if (e.key === "Escape" && onClose) onClose();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm">
      <div className="w-full max-w-md mx-4 bg-zinc-950 border border-white/10 rounded-2xl p-6 shadow-2xl">
        <h2 className="text-lg font-bold text-white mb-1">
          {isUpdate ? t.apiKeyTitleUpdate : t.apiKeyTitle}
        </h2>
        <p className="text-sm text-white/50 mb-5">
          {isUpdate ? t.apiKeyDescUpdate : t.apiKeyDescSet}
        </p>

        <input
          ref={inputRef}
          type="password"
          value={value}
          onChange={(e) => { setValue(e.target.value); setError(""); }}
          onKeyDown={handleKeyDown}
          placeholder="sk-ant-..."
          className="w-full bg-white/5 border border-white/10 rounded-lg px-4 py-2.5 text-white placeholder-white/30 text-sm focus:outline-none focus:border-cyan-500/50 focus:ring-1 focus:ring-cyan-500/30 transition-colors mb-2"
        />

        {error && (
          <p className="text-red-400 text-xs mb-3">{error}</p>
        )}

        <p className="text-xs text-white/30 mb-5">
          {t.apiKeyNote}{" "}
          {t.apiKeyLinkPrefix}
          <a
            href="https://console.anthropic.com"
            target="_blank"
            rel="noopener noreferrer"
            className="text-cyan-500/70 hover:text-cyan-400 underline"
          >
            console.anthropic.com
          </a>
          {t.apiKeyLinkSuffix}
        </p>

        <div className="flex gap-3 justify-end">
          {onClose && (
            <button
              onClick={onClose}
              className="px-4 py-2 text-sm text-white/50 hover:text-white transition-colors rounded-lg hover:bg-white/5"
            >
              {t.cancel}
            </button>
          )}
          <button
            onClick={handleSave}
            disabled={!value.trim()}
            className="px-5 py-2 text-sm font-semibold bg-cyan-600 hover:bg-cyan-500 disabled:opacity-40 disabled:cursor-not-allowed text-white rounded-lg transition-colors"
          >
            {t.save}
          </button>
        </div>
      </div>
    </div>
  );
}
