"use client";

import { useState, useCallback, useMemo, useEffect } from "react";
import dynamic from "next/dynamic";
import AspectRatioPicker, { AspectRatio } from "@/components/AspectRatioPicker";
import PersonaPicker from "@/components/PersonaPicker";
import ApiKeyModal from "@/components/ApiKeyModal";
import CharacterPicker from "@/components/CharacterPicker";
import { useApiKey } from "@/hooks/useApiKey";
import type { AppState, AppMode, ScriptLine } from "@/types";
import { DEFAULT_APP_STATE } from "@/types";
import { assignRoles } from "@/lib/scriptParser";

// Recorder uses browser APIs — disable SSR
const Recorder = dynamic(() => import("@/components/Recorder"), { ssr: false });

export default function Home() {
  const { apiKey, isLoading, showModal, openModal, closeModal, saveKey, isUsingUserKey } = useApiKey();
  const [aspectRatio, setAspectRatio] = useState<AspectRatio>("16:9");
  const [videoBlob, setVideoBlob] = useState<Blob | null>(null);
  const [isRecording, setIsRecording] = useState(false);
  const [recorderKey, setRecorderKey] = useState(0);
  const [appState, setAppState] = useState<AppState>(DEFAULT_APP_STATE);

  // Script mode state
  const [pendingScriptLines, setPendingScriptLines] = useState<ScriptLine[] | null>(null);
  const [pendingCharacters, setPendingCharacters] = useState<string[]>([]);
  const [scriptLines, setScriptLines] = useState<ScriptLine[] | null>(null);

  const handleScriptParsed = useCallback((lines: ScriptLine[], characters: string[]) => {
    setPendingScriptLines(lines);
    setPendingCharacters(characters);
  }, []);

  const handleCharacterSelect = useCallback((character: string) => {
    if (!pendingScriptLines) return;
    setScriptLines(assignRoles(pendingScriptLines, character));
    setPendingScriptLines(null);
    setPendingCharacters([]);
  }, [pendingScriptLines]);

  const handleScriptClear = useCallback(() => {
    setScriptLines(null);
    setPendingScriptLines(null);
    setPendingCharacters([]);
  }, []);

  const setMode = useCallback((patch: Partial<AppMode>) => {
    setAppState((prev) => ({ ...prev, mode: { ...prev.mode, ...patch } }));
  }, []);

  const setPersona = useCallback((persona: AppState["persona"]) => {
    setAppState((prev) => ({ ...prev, persona }));
  }, []);

  const handleVideoReady = useCallback((blob: Blob) => {
    setVideoBlob(blob);
    setIsRecording(false);
  }, []);

  const handleStartRecording = useCallback(() => {
    setVideoBlob(null);
    setIsRecording(true);
  }, []);

  const videoUrl = useMemo(
    () => (videoBlob ? URL.createObjectURL(videoBlob) : null),
    [videoBlob]
  );

  useEffect(() => {
    return () => {
      if (videoUrl) URL.revokeObjectURL(videoUrl);
    };
  }, [videoUrl]);

  if (isLoading) {
    return (
      <div className="min-h-screen bg-zinc-950 flex items-center justify-center">
        <div className="text-white/40 text-sm">載入中...</div>
      </div>
    );
  }

  function downloadVideo() {
    if (!videoUrl) return;
    const a = document.createElement("a");
    a.href = videoUrl;
    a.download = `chitchat-${Date.now()}.webm`;
    a.click();
  }

  return (
    <main className="min-h-screen bg-zinc-950 text-white flex flex-col">
      {/* Character Picker Modal */}
      {pendingScriptLines && pendingCharacters.length > 0 && (
        <CharacterPicker
          characters={pendingCharacters}
          onSelect={handleCharacterSelect}
          onCancel={() => { setPendingScriptLines(null); setPendingCharacters([]); }}
        />
      )}

      {/* API Key Modal */}
      {showModal && (
        <ApiKeyModal
          onSave={saveKey}
          onClose={isUsingUserKey || apiKey === "__env__" ? closeModal : undefined}
          isUpdate={isUsingUserKey}
        />
      )}

      {/* Header */}
      <header className="border-b border-white/10 px-6 py-4 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold tracking-tight">Chitchat</h1>
          <p className="text-xs text-white/40 mt-0.5">AI 對談錄影工具</p>
        </div>
        <div className="flex items-center gap-3">
          {isUsingUserKey && (
            <button
              onClick={openModal}
              title="管理 API Key"
              className="text-white/40 hover:text-white/70 transition-colors text-lg"
            >
              ⚙️
            </button>
          )}
          <AspectRatioPicker
            value={aspectRatio}
            onChange={setAspectRatio}
            disabled={isRecording}
          />
        </div>
      </header>

      {/* Main content */}
      <div className="flex-1 flex flex-col items-center justify-center p-6 gap-6">
        <Recorder
          key={recorderKey}
          aspectRatio={aspectRatio}
          onVideoReady={handleVideoReady}
          onRecordingStart={handleStartRecording}
          mode={appState.mode}
          onModeChange={setMode}
          persona={appState.persona}
          apiKey={isUsingUserKey && typeof apiKey === "string" ? apiKey : undefined}
          onApiKeyMissing={openModal}
          scriptLines={scriptLines ?? undefined}
          onScriptLoad={handleScriptParsed}
          onScriptClear={handleScriptClear}
        />

        {/* Persona picker */}
        <div className="w-full max-w-sm">
          <PersonaPicker
            value={appState.persona}
            onChange={setPersona}
            disabled={isRecording}
          />
        </div>

        {/* Download section */}
        {videoBlob && (
          <div className="flex flex-col items-center gap-3 p-5 bg-white/5 border border-white/10 rounded-xl">
            <p className="text-sm text-white/70">影片已準備好，可以下載了</p>
            <div className="flex gap-3">
              <button
                onClick={downloadVideo}
                className="px-5 py-2 bg-white text-black font-semibold rounded-lg hover:bg-white/90 transition-colors"
              >
                下載影片
              </button>
              <button
                onClick={() => { setVideoBlob(null); setRecorderKey((k) => k + 1); }}
                className="px-5 py-2 bg-white/10 text-white rounded-lg hover:bg-white/20 transition-colors"
              >
                重新錄製
              </button>
            </div>
            {/* Preview */}
            {videoUrl && (
              <video
                src={videoUrl}
                controls
                className="mt-2 rounded-lg max-h-48"
              />
            )}
          </div>
        )}
      </div>

      {/* Footer */}
      <footer className="border-t border-white/10 px-6 py-3 text-center text-xs text-white/30">
        使用 Web Speech API 即時語音辨識 · Claude claude-sonnet-4-6 AI 回應
      </footer>
    </main>
  );
}
