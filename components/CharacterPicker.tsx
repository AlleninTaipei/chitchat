"use client";

interface CharacterPickerProps {
  characters: string[];
  onSelect: (character: string) => void;
  onCancel: () => void;
}

export default function CharacterPicker({ characters, onSelect, onCancel }: CharacterPickerProps) {
  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50">
      <div className="bg-zinc-900 border border-white/10 rounded-xl p-6 w-80 max-w-full mx-4">
        <h2 className="text-white font-bold text-lg mb-1">選擇你的角色</h2>
        <p className="text-white/50 text-sm mb-4">
          你要扮演哪個角色？AI 將扮演其他所有角色。
        </p>
        <div className="flex flex-col gap-2 max-h-64 overflow-y-auto">
          {characters.map((char) => (
            <button
              key={char}
              onClick={() => onSelect(char)}
              className="px-4 py-2.5 text-left bg-white/5 hover:bg-white/10 text-white rounded-lg transition-colors border border-white/10 hover:border-white/30"
            >
              {char}
            </button>
          ))}
        </div>
        <button
          onClick={onCancel}
          className="mt-4 w-full px-4 py-2 text-white/50 hover:text-white/80 text-sm transition-colors"
        >
          取消
        </button>
      </div>
    </div>
  );
}
