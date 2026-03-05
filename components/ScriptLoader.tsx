"use client";

import { useRef } from "react";
import type { ScriptLine } from "@/types";
import { parseTxt, parseHtml, extractCharacters } from "@/lib/scriptParser";

interface ScriptLoaderProps {
  onParsed: (lines: ScriptLine[], characters: string[]) => void;
  disabled?: boolean;
  hasScript?: boolean;
  onClear?: () => void;
}

export default function ScriptLoader({ onParsed, disabled, hasScript, onClear }: ScriptLoaderProps) {
  const inputRef = useRef<HTMLInputElement>(null);

  async function handleFile(file: File) {
    const content = await file.text();
    const isHtml = file.name.endsWith(".html") || file.name.endsWith(".htm");
    const lines = isHtml ? parseHtml(content) : parseTxt(content);
    if (lines.length === 0) {
      alert("無法解析劇本，請確認格式正確（每行需為「角色名稱: 台詞」格式）");
      return;
    }
    onParsed(lines, extractCharacters(lines));
  }

  if (hasScript) {
    return (
      <button
        onClick={onClear}
        disabled={disabled}
        title="移除劇本"
        className="px-3 py-2.5 bg-purple-800 ring-1 ring-purple-400/50 text-white text-lg rounded-lg transition-colors disabled:opacity-40 disabled:cursor-not-allowed hover:bg-purple-700"
      >
        📜
      </button>
    );
  }

  return (
    <>
      <input
        ref={inputRef}
        type="file"
        accept=".txt,.html,.htm"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) handleFile(file);
          e.target.value = "";
        }}
      />
      <button
        onClick={() => inputRef.current?.click()}
        disabled={disabled}
        title="上傳劇本"
        className="px-3 py-2.5 bg-gray-700 hover:bg-gray-600 text-white text-lg rounded-lg transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
      >
        📜
      </button>
    </>
  );
}
