"use client";

import { useRef, useState, useEffect, useCallback } from "react";
import { useSpeechRecognition } from "@/hooks/useSpeechRecognition";
import { useSpeechSynthesis } from "@/hooks/useSpeechSynthesis";
import { useMediaRecorder } from "@/hooks/useMediaRecorder";
import SubtitleOverlay, { SubtitleLine } from "./SubtitleOverlay";
import type { AspectRatio } from "./AspectRatioPicker";
import type { Message } from "@/app/api/chat/route";
import type { AppMode, AppState } from "@/types";
import { getSystemPrompt } from "@/lib/personas";

// Default background color for conversation-only mode
const CANVAS_BG = "#09090b";

interface CanvasDimensions {
  width: number;
  height: number;
}

function getDimensions(ratio: AspectRatio): CanvasDimensions {
  switch (ratio) {
    case "16:9":
      return { width: 1280, height: 720 };
    case "9:16":
      return { width: 720, height: 1280 };
    case "1:1":
      return { width: 720, height: 720 };
  }
}

type RecordingState = "idle" | "recording" | "stopped";

interface RecorderProps {
  aspectRatio: AspectRatio;
  onVideoReady: (blob: Blob) => void;
  onRecordingStart?: () => void;
  mode?: AppMode;
  onModeChange?: (patch: Partial<AppMode>) => void;
  persona?: AppState["persona"];
  apiKey?: string;
  onApiKeyMissing?: () => void;
}

export default function Recorder({
  aspectRatio,
  onVideoReady,
  onRecordingStart,
  mode,
  onModeChange,
  persona,
  apiKey,
  onApiKeyMissing,
}: RecorderProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const animFrameRef = useRef<number>(0);
  const cameraStreamRef = useRef<MediaStream | null>(null);
  const [micStream, setMicStream] = useState<MediaStream | null>(null);

  const [recordingState, setRecordingState] = useState<RecordingState>("idle");
  const [voiceEnabled, setVoiceEnabled] = useState(true);
  const [history, setHistory] = useState<Message[]>([]);
  const [subtitleLines, setSubtitleLines] = useState<SubtitleLine[]>([]);
  const [aiText, setAiText] = useState("");
  const [isAiResponding, setIsAiResponding] = useState(false);
  const aiTextRef = useRef("");
  const subtitleLinesRef = useRef<SubtitleLine[]>([]);
  const voiceEnabledRef = useRef(true);
  const cameraEnabledRef = useRef(mode?.cameraEnabled ?? true);
  const teleprompterRef = useRef(mode?.teleprompter ?? false);

  const dims = getDimensions(aspectRatio);

  // Keep refs in sync
  useEffect(() => {
    voiceEnabledRef.current = voiceEnabled;
  }, [voiceEnabled]);

  useEffect(() => {
    aiTextRef.current = aiText;
  }, [aiText]);

  useEffect(() => {
    subtitleLinesRef.current = subtitleLines;
  }, [subtitleLines]);

  useEffect(() => {
    cameraEnabledRef.current = mode?.cameraEnabled ?? true;
  }, [mode?.cameraEnabled]);

  useEffect(() => {
    teleprompterRef.current = mode?.teleprompter ?? false;
  }, [mode?.teleprompter]);

  // Camera setup — always try video+audio; gracefully fall back to audio-only
  useEffect(() => {
    let cancelled = false;
    async function setup() {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: "user", width: { ideal: 1280 }, height: { ideal: 720 } },
          audio: true,
        });
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        cameraStreamRef.current = stream;

        // Separate audio for recording
        const audioStream = new MediaStream(stream.getAudioTracks());
        setMicStream(audioStream);

        if (videoRef.current) {
          videoRef.current.srcObject = new MediaStream(stream.getVideoTracks());
          await videoRef.current.play();
        }
      } catch {
        // Camera not available — try audio only
        try {
          const audioOnly = await navigator.mediaDevices.getUserMedia({ audio: true });
          if (!cancelled) {
            setMicStream(audioOnly);
            // Notify parent that camera is unavailable
            onModeChange?.({ cameraEnabled: false });
          }
        } catch (err) {
          console.error("Mic access error:", err);
        }
      }
    }
    setup();
    return () => {
      cancelled = true;
      cameraStreamRef.current?.getTracks().forEach((t) => t.stop());
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Canvas draw loop
  useEffect(() => {
    const canvas = canvasRef.current;
    const video = videoRef.current;
    if (!canvas || !video) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    function wrapText(
      ctx: CanvasRenderingContext2D,
      text: string,
      maxWidth: number
    ): string[] {
      const words = text.split(" ");
      const lines: string[] = [];
      let current = "";
      for (const word of words) {
        const test = current ? `${current} ${word}` : word;
        if (ctx.measureText(test).width > maxWidth && current) {
          lines.push(current);
          current = word;
        } else {
          current = test;
        }
      }
      if (current) lines.push(current);
      return lines;
    }

    function draw() {
      if (!canvas || !video || !ctx) return;

      const { width, height } = dims;
      canvas.width = width;
      canvas.height = height;

      if (cameraEnabledRef.current && video.readyState >= 2) {
        // Draw camera feed (cover fill, mirrored)
        const vAspect = video.videoWidth / (video.videoHeight || 1);
        const cAspect = width / height;
        let sx = 0, sy = 0, sw = video.videoWidth, sh = video.videoHeight;

        if (vAspect > cAspect) {
          sw = video.videoHeight * cAspect;
          sx = (video.videoWidth - sw) / 2;
        } else {
          sh = video.videoWidth / cAspect;
          sy = (video.videoHeight - sh) / 2;
        }

        ctx.save();
        ctx.translate(width, 0);
        ctx.scale(-1, 1);
        ctx.drawImage(video, sx, sy, sw, sh, 0, 0, width, height);
        ctx.restore();
      } else {
        // Conversation-only mode: solid background
        ctx.fillStyle = CANVAS_BG;
        ctx.fillRect(0, 0, width, height);
      }

      // Subtitles
      const lines = subtitleLinesRef.current.slice(-3);
      const currentAi = aiTextRef.current;

      const allLines: { speaker: "user" | "ai"; text: string }[] = [
        ...lines,
        ...(currentAi ? [{ speaker: "ai" as const, text: currentAi }] : []),
      ];

      if (allLines.length > 0) {
        const fontSize = Math.round(width * 0.028);
        ctx.font = `bold ${fontSize}px sans-serif`;
        const lineH = fontSize * 1.5;
        const padding = fontSize * 0.6;
        const maxW = width * 0.85;

        const wrappedGroups = allLines.map((line) => ({
          ...line,
          wrapped: wrapText(ctx, `${line.speaker === "user" ? "😊" : "💡"} ${line.text}`, maxW),
        }));

        const totalRows = wrappedGroups.reduce((sum, g) => sum + g.wrapped.length, 0);
        const boxH = totalRows * lineH + padding * 2;
        const boxY = height - boxH - height * 0.04;

        ctx.fillStyle = "rgba(0,0,0,0.55)";
        ctx.beginPath();
        ctx.roundRect(width * 0.075, boxY, width * 0.85, boxH, 10);
        ctx.fill();

        let y = boxY + padding + fontSize;
        for (const group of wrappedGroups) {
          ctx.fillStyle = group.speaker === "ai" ? "#67e8f9" : "#ffffff";
          ctx.textAlign = "center";
          for (const row of group.wrapped) {
            ctx.fillText(row, width / 2, y);
            y += lineH;
          }
        }
      }

      animFrameRef.current = requestAnimationFrame(draw);
    }

    animFrameRef.current = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(animFrameRef.current);
  }, [dims, aspectRatio]);

  const { speak, stop: stopSpeech2, isSpeaking } = useSpeechSynthesis();

  const sendToAI = useCallback(
    async (userMessage: string) => {
      if (teleprompterRef.current) {
        setSubtitleLines([{ speaker: "user", text: userMessage }]);
        return;
      }

      if (isAiResponding) return;

      const newHistory: Message[] = [
        ...history,
        { role: "user", content: userMessage },
      ];
      setHistory(newHistory);
      setSubtitleLines([{ speaker: "user", text: userMessage }]);
      setAiText("");
      aiTextRef.current = "";
      setIsAiResponding(true);

      try {
        const headers: Record<string, string> = { "Content-Type": "application/json" };
        if (apiKey) headers["x-api-key"] = apiKey;

        const res = await fetch("/api/chat", {
          method: "POST",
          headers,
          body: JSON.stringify({
            message: userMessage,
            history,
            systemPrompt: persona ? getSystemPrompt(persona) : undefined,
          }),
        });

        if (res.status === 401) {
          onApiKeyMissing?.();
          return;
        }

        if (!res.body) throw new Error("No response body");

        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let full = "";

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          full += decoder.decode(value, { stream: true });
          setAiText(full);
          aiTextRef.current = full;
        }

        setHistory([
          ...newHistory,
          { role: "assistant", content: full },
        ]);
        setSubtitleLines([{ speaker: "ai", text: full }]);
        setAiText("");
        aiTextRef.current = "";
        if (voiceEnabledRef.current) speak(full);
      } catch (err) {
        console.error("AI response error:", err);
      } finally {
        setIsAiResponding(false);
      }
    },
    [history, isAiResponding, speak, apiKey, onApiKeyMissing]
  );

  const { transcript, isListening, start: startSpeech, stop: stopSpeech } =
    useSpeechRecognition({ onTranscript: sendToAI });

  const { isRecording, videoBlob, startRecording, stopRecording } =
    useMediaRecorder({ canvasRef, micStream });

  // Notify parent when video is ready
  useEffect(() => {
    if (videoBlob) onVideoReady(videoBlob);
  }, [videoBlob, onVideoReady]);

  function handleStart() {
    setRecordingState("recording");
    setSubtitleLines([]);
    setHistory([]);
    setAiText("");
    aiTextRef.current = "";
    startRecording();
    startSpeech();
    onRecordingStart?.();
  }

  function handleStop() {
    stopSpeech();
    stopSpeech2();
    stopRecording();
    setRecordingState("stopped");
  }

  function handleCameraToggle() {
    onModeChange?.({ cameraEnabled: !(mode?.cameraEnabled ?? true) });
  }

  // Container style for aspect ratio
  const containerStyle: React.CSSProperties =
    aspectRatio === "9:16"
      ? { maxWidth: "min(360px, 45vw)", width: "100%" }
      : aspectRatio === "1:1"
        ? { maxWidth: "min(540px, 60vw)", width: "100%" }
        : { maxWidth: "min(854px, 90vw)", width: "100%" };

  const cameraEnabled = mode?.cameraEnabled ?? true;
  const teleprompterMode = mode?.teleprompter ?? false;

  return (
    <div className="flex flex-col items-center gap-4">
      {/* Canvas container */}
      <div className="relative rounded-xl overflow-hidden shadow-2xl" style={containerStyle}>
        <canvas
          ref={canvasRef}
          className="w-full h-full block"
          style={{ aspectRatio: aspectRatio.replace(":", "/") }}
        />
        {/* Hidden video for camera feed */}
        <video ref={videoRef} className="hidden" muted playsInline />

        {/* UI subtitle overlay (non-recorded) */}
        {recordingState !== "idle" && (
          <SubtitleOverlay
            lines={subtitleLines}
            interimTranscript={transcript}
          />
        )}

        {/* Status badges */}
        <div className="absolute top-3 left-3 flex gap-2">
          {isRecording && (
            <span className="flex items-center gap-1.5 bg-red-600 text-white text-xs font-bold px-2.5 py-1 rounded-full">
              <span className="w-2 h-2 rounded-full bg-white animate-pulse" />
              REC
            </span>
          )}
          {isListening && (
            <span className="flex items-center gap-1.5 bg-green-600 text-white text-xs font-bold px-2.5 py-1 rounded-full">
              <span className="w-2 h-2 rounded-full bg-white animate-pulse" />
              LIVE
            </span>
          )}
          {isAiResponding && (
            <span className="bg-cyan-600 text-white text-xs font-bold px-2.5 py-1 rounded-full">
              AI...
            </span>
          )}
          {teleprompterMode && (
            <span className="bg-amber-600 text-white text-xs font-bold px-2.5 py-1 rounded-full">
              TELE
            </span>
          )}
          {isSpeaking && (
            <span className="flex items-center gap-1.5 bg-blue-600 text-white text-xs font-bold px-2.5 py-1 rounded-full">
              <span className="w-2 h-2 rounded-full bg-white animate-pulse" />
              SPK
            </span>
          )}
        </div>

        {/* Camera-off indicator */}
        {!cameraEnabled && (
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <span className="text-white/20 text-4xl select-none">&#128247;&#824;</span>
          </div>
        )}
      </div>

      {/* Controls */}
      <div className="flex gap-3">
        {recordingState === "idle" && (
          <button
            onClick={handleStart}
            className="px-6 py-2.5 bg-red-600 hover:bg-red-700 text-white font-semibold rounded-lg transition-colors"
          >
            開始錄影
          </button>
        )}
        {recordingState === "recording" && (
          <button
            onClick={handleStop}
            className="px-6 py-2.5 bg-gray-700 hover:bg-gray-600 text-white font-semibold rounded-lg transition-colors"
          >
            停止錄影
          </button>
        )}
        {/* Camera toggle */}
        <button
          onClick={handleCameraToggle}
          disabled={recordingState === "recording"}
          title={cameraEnabled ? "關閉鏡頭" : "開啟鏡頭"}
          className={`px-3 py-2.5 text-white text-lg rounded-lg transition-colors disabled:opacity-40 disabled:cursor-not-allowed ${
            cameraEnabled
              ? "bg-gray-700 hover:bg-gray-600"
              : "bg-gray-900 ring-1 ring-white/30 hover:bg-gray-800"
          }`}
        >
          {cameraEnabled ? "📷" : "🚫"}
        </button>
        {/* Teleprompter toggle */}
        <button
          onClick={() => onModeChange?.({ teleprompter: !teleprompterMode })}
          disabled={recordingState === "recording"}
          title={teleprompterMode ? "切換到對話模式" : "切換到提詞機模式"}
          className={`px-3 py-2.5 text-white text-lg rounded-lg transition-colors disabled:opacity-40 disabled:cursor-not-allowed ${
            teleprompterMode ? "bg-amber-700 ring-1 ring-amber-400/50" : "bg-gray-700 hover:bg-gray-600"
          }`}
        >
          {teleprompterMode ? "📺" : "💬"}
        </button>
        {/* Voice toggle */}
        <button
          onClick={() => setVoiceEnabled((v) => !v)}
          title={voiceEnabled ? "靜音" : "開啟語音"}
          className="px-3 py-2.5 bg-gray-700 hover:bg-gray-600 text-white text-lg rounded-lg transition-colors"
        >
          {voiceEnabled ? "🔊" : "🔇"}
        </button>
      </div>
    </div>
  );
}
