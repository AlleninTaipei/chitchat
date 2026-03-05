"use client";

import { useState } from "react";
import { PERSONA_PRESETS } from "@/lib/personas";
import { useLocale } from "@/contexts/LocaleContext";
import type { AppState } from "@/types";

interface PersonaPickerProps {
  value: AppState["persona"];
  onChange: (persona: AppState["persona"]) => void;
  disabled?: boolean;
}

export default function PersonaPicker({ value, onChange, disabled }: PersonaPickerProps) {
  const [showCustom, setShowCustom] = useState(value.presetId === "custom");
  const { locale, t } = useLocale();

  function handlePresetChange(presetId: string) {
    if (presetId === "custom") {
      setShowCustom(true);
      onChange({ presetId: "custom", customPrompt: value.customPrompt ?? "" });
    } else {
      setShowCustom(false);
      onChange({ presetId, customPrompt: undefined });
    }
  }

  function handleCustomPromptChange(customPrompt: string) {
    onChange({ presetId: "custom", customPrompt });
  }

  const selectValue = value.presetId === "custom" ? "custom" : value.presetId;

  return (
    <div className="flex flex-col gap-2 w-full">
      <div className="flex items-center gap-2">
        <label className="text-xs text-white/50 whitespace-nowrap">{t.aiRole}</label>
        <select
          value={selectValue}
          onChange={(e) => handlePresetChange(e.target.value)}
          disabled={disabled}
          className="flex-1 bg-white/5 border border-white/15 text-white text-sm rounded-lg px-3 py-1.5 appearance-none cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed focus:outline-none focus:ring-1 focus:ring-white/30"
        >
          {PERSONA_PRESETS.map((preset) => (
            <option key={preset.id} value={preset.id} className="bg-zinc-900">
              {preset.labels[locale]}
            </option>
          ))}
          <option value="custom" className="bg-zinc-900">
            {t.customPromptLabel}
          </option>
        </select>
      </div>

      {showCustom && (
        <textarea
          value={value.customPrompt ?? ""}
          onChange={(e) => handleCustomPromptChange(e.target.value)}
          disabled={disabled}
          placeholder={t.customPromptPlaceholder}
          rows={3}
          className="w-full bg-white/5 border border-white/15 text-white text-sm rounded-lg px-3 py-2 resize-none placeholder:text-white/25 disabled:opacity-40 disabled:cursor-not-allowed focus:outline-none focus:ring-1 focus:ring-white/30"
        />
      )}
    </div>
  );
}
