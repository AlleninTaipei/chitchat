"use client";

export interface SubtitleLine {
  speaker: "user" | "ai";
  text: string;
}

interface SubtitleOverlayProps {
  lines: SubtitleLine[];
  interimTranscript?: string;
}

export default function SubtitleOverlay({
  lines,
  interimTranscript,
}: SubtitleOverlayProps) {
  const visibleLines = lines.slice(-3);

  return (
    <div className="absolute bottom-0 left-0 right-0 p-4 pointer-events-none">
      <div className="flex flex-col gap-1">
        {visibleLines.map((line, i) => (
          <div
            key={i}
            className={`text-center text-white text-sm font-medium drop-shadow-lg ${
              line.speaker === "ai" ? "text-cyan-300" : "text-white"
            }`}
            style={{ textShadow: "0 1px 4px rgba(0,0,0,0.8)" }}
          >
            <span className="mr-1">
              {line.speaker === "user" ? "😊" : "💡"}
            </span>
            {line.text}
          </div>
        ))}
        {interimTranscript && (
          <div
            className="text-center text-white/60 text-sm italic"
            style={{ textShadow: "0 1px 4px rgba(0,0,0,0.8)" }}
          >
            😊 {interimTranscript}
          </div>
        )}
      </div>
    </div>
  );
}
