"use client";

import { useRef, useState, useCallback } from "react";

interface UseMediaRecorderOptions {
  canvasRef: React.RefObject<HTMLCanvasElement | null>;
  micStream: MediaStream | null;
}

interface UseMediaRecorderReturn {
  isRecording: boolean;
  videoBlob: Blob | null;
  startRecording: () => void;
  stopRecording: () => void;
}

export function useMediaRecorder({
  canvasRef,
  micStream,
}: UseMediaRecorderOptions): UseMediaRecorderReturn {
  const [isRecording, setIsRecording] = useState(false);
  const [videoBlob, setVideoBlob] = useState<Blob | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);

  const startRecording = useCallback(() => {
    if (!canvasRef.current) return;

    const canvas = canvasRef.current;
    const canvasStream = canvas.captureStream(30);

    const tracks = [...canvasStream.getVideoTracks()];
    if (micStream) {
      micStream.getAudioTracks().forEach((track) => tracks.push(track));
    }

    const combinedStream = new MediaStream(tracks);

    const mimeType = MediaRecorder.isTypeSupported("video/webm;codecs=vp9,opus")
      ? "video/webm;codecs=vp9,opus"
      : MediaRecorder.isTypeSupported("video/webm")
        ? "video/webm"
        : "video/mp4";

    const mediaRecorder = new MediaRecorder(combinedStream, { mimeType });
    chunksRef.current = [];

    mediaRecorder.ondataavailable = (e) => {
      if (e.data.size > 0) chunksRef.current.push(e.data);
    };

    mediaRecorder.onstop = () => {
      const blob = new Blob(chunksRef.current, { type: mimeType });
      setVideoBlob(blob);
    };

    mediaRecorderRef.current = mediaRecorder;
    mediaRecorder.start(100);
    setIsRecording(true);
    setVideoBlob(null);
  }, [canvasRef, micStream]);

  const stopRecording = useCallback(() => {
    mediaRecorderRef.current?.stop();
    mediaRecorderRef.current = null;
    setIsRecording(false);
  }, []);

  return { isRecording, videoBlob, startRecording, stopRecording };
}
