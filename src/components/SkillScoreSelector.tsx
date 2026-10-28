import { cn } from "@/lib/utils";

interface SkillScoreSelectorProps {
  value: number | null;
  onChange: (value: number) => void;
  label: string;
}

export function SkillScoreSelector({ value, onChange, label }: SkillScoreSelectorProps) {
  return (
    <div className="flex flex-col gap-1.5 p-3 rounded-xl border border-white/5 bg-white/[0.02] hover:bg-white/[0.04] transition-colors">
      <div className="flex justify-between items-center mb-1">
        <div className="flex flex-col">
          <span className="text-[10px] font-black uppercase text-brand-silver/50 tracking-widest Oswald truncate pr-2">
            {label}
          </span>
          <span className="text-[8px] text-brand-silver/40 uppercase tracking-wider">
            Nota 0 (Iniciante) a 5 (Avançado)
          </span>
        </div>
        <span className={cn(
          "text-sm font-black Oswald",
          (value === null || value === undefined) ? "text-brand-silver/30" : "text-primary"
        )}>
          {(value !== null && value !== undefined) ? value : "—"}
        </span>
      </div>
      <div className="grid grid-cols-6 gap-1 mt-1">
        {[0, 1, 2, 3, 4, 5].map((num) => (
          <button
            key={num}
            type="button"
            onClick={() => onChange(num)}
            className={cn(
              "h-11 rounded-md text-sm font-black Oswald transition-all flex items-center justify-center active:scale-95 touch-manipulation",
              value === num
                ? "bg-primary text-white shadow-lg shadow-primary/20 scale-105 ring-2 ring-primary ring-offset-1 ring-offset-background"
                : "bg-brand-surface border border-white/5 text-brand-silver hover:border-primary/30 hover:bg-brand-surface/80 hover:text-brand-white"
            )}
          >
            {num}
          </button>
        ))}
      </div>
    </div>
  );
}
