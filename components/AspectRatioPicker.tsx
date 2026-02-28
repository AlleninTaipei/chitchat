"use client";

export type AspectRatio = "16:9" | "9:16" | "1:1";

interface AspectRatioPickerProps {
  value: AspectRatio;
  onChange: (ratio: AspectRatio) => void;
  disabled?: boolean;
}

const RATIOS: { label: string; value: AspectRatio }[] = [
  { label: "16:9", value: "16:9" },
  { label: "9:16", value: "9:16" },
  { label: "1:1", value: "1:1" },
];

export default function AspectRatioPicker({
  value,
  onChange,
  disabled,
}: AspectRatioPickerProps) {
  return (
    <div className="flex gap-2">
      {RATIOS.map((r) => (
        <button
          key={r.value}
          onClick={() => onChange(r.value)}
          disabled={disabled}
          className={`px-3 py-1.5 rounded text-sm font-medium transition-colors ${
            value === r.value
              ? "bg-white text-black"
              : "bg-white/10 text-white/70 hover:bg-white/20"
          } disabled:opacity-50 disabled:cursor-not-allowed`}
        >
          {r.label}
        </button>
      ))}
    </div>
  );
}
