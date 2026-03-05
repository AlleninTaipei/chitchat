"use client";

import { useRef, useState, useCallback } from "react";

interface UseSpeechRecognitionOptions {
  onTranscript: (transcript: string) => void;
}

interface UseSpeechRecognitionReturn {
  transcript: string;
  isListening: boolean;
  start: () => void;
  stop: () => void;
}

export function useSpeechRecognition({
  onTranscript,
}: UseSpeechRecognitionOptions): UseSpeechRecognitionReturn {
  const [transcript, setTranscript] = useState("");
  const [isListening, setIsListening] = useState(false);
  const recognitionRef = useRef<SpeechRecognition | null>(null);
  const isRunningRef = useRef(false);

  const start = useCallback(() => {
    const SpeechRecognitionAPI =
      window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognitionAPI) {
      console.error("SpeechRecognition not supported in this browser");
      return;
    }

    isRunningRef.current = true;

    function createRecognition() {
      const recognition = new SpeechRecognitionAPI();
      recognition.continuous = true;
      recognition.interimResults = true;
      recognition.lang = "zh-TW";

      recognition.onstart = () => setIsListening(true);

      recognition.onend = () => {
        // Auto-restart unless stop() was called
        if (isRunningRef.current) {
          try { recognition.start(); } catch { /* ignore */ }
        } else {
          setIsListening(false);
        }
      };

      recognition.onresult = (event: SpeechRecognitionEvent) => {
        let finalTranscript = "";
        let interimTranscript = "";

        for (let i = event.resultIndex; i < event.results.length; i++) {
          const result = event.results[i];
          if (result.isFinal) {
            finalTranscript += result[0].transcript;
          } else {
            interimTranscript += result[0].transcript;
          }
        }

        const current = finalTranscript || interimTranscript;
        setTranscript(current);

        if (finalTranscript) {
          onTranscript(finalTranscript.trim());
          setTranscript("");
        }
      };

      recognition.onerror = (event: SpeechRecognitionErrorEvent) => {
        // no-speech is non-fatal — onend will auto-restart
        if (event.error === "no-speech") return;
        console.error("SpeechRecognition error:", event.error);
        isRunningRef.current = false;
        setIsListening(false);
      };

      return recognition;
    }

    const recognition = createRecognition();
    recognitionRef.current = recognition;
    recognition.start();
  }, [onTranscript]);

  const stop = useCallback(() => {
    isRunningRef.current = false;
    recognitionRef.current?.stop();
    recognitionRef.current = null;
    setIsListening(false);
    setTranscript("");
  }, []);

  return { transcript, isListening, start, stop };
}
