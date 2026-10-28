import { cn } from "@/lib/utils";

function formatTime(t: string | null | undefined): string {
  if (!t) return "";
  return t.slice(0, 5).replace(":", "h");
}

export function EventContextCard({ 
  date, 
  startTime, 
  endTime, 
  status, 
  mainCount, 
  mainLimit, 
  waitCount,
  variant = 'full'
}: { 
  date: string | null | undefined, 
  startTime: string | null, 
  endTime: string | null, 
  status: string, 
  mainCount: number, 
  mainLimit: number, 
  waitCount: number,
  variant?: 'full' | 'compact'
}) {
  const displayStatus = status?.toUpperCase() === 'OPEN' ? 'ABERTA' : status;
  const safeDate = date || "";

  if (variant === 'compact') {
    return (
      <div className="rounded-2xl border border-[var(--card-border)] bg-[var(--card-bg)] p-3 shadow-md">
        <div className="flex items-center justify-between">
          <div className="flex flex-col">
            <p className="text-[11px] font-black text-[var(--text)] Oswald uppercase leading-tight">
              {safeDate ? new Date(safeDate + "T00:00:00").toLocaleDateString("pt-BR", { day: "2-digit", month: "short" }) : "—"} • {formatTime(startTime)}
            </p>
            <div className="flex items-center gap-2 mt-0.5">
              <span className="text-[9px] font-bold text-[var(--text-muted)] Oswald uppercase">
                {mainCount}/{mainLimit} Titulares
              </span>
              <span className="text-[9px] font-bold text-[var(--text-muted)] Oswald uppercase">
                • {waitCount} Reservas
              </span>
            </div>
          </div>
          <span className="text-[9px] font-black uppercase tracking-widest text-[var(--accent-neon)] Oswald rounded-full border border-[color-mix(in_srgb,var(--accent-neon)_30%,transparent)] bg-[color-mix(in_srgb,var(--accent-neon)_10%,transparent)] px-2 py-0.5">
            {displayStatus}
          </span>
        </div>
      </div>
    );
  }

  return (
    <div className="hidden md:block rounded-2xl border border-[var(--card-border)] bg-[var(--card-bg)] p-4 shadow-lg">
      <div className="flex justify-between items-center mb-2">
        <h3 className="text-[10px] font-black uppercase tracking-[0.2em] text-[var(--accent-neon)] Oswald">
          Resumo da Rodada
        </h3>
        <span className="text-[9px] font-black uppercase tracking-widest text-[var(--text-muted)] Oswald rounded-full border border-[var(--card-border)] bg-[color-mix(in_srgb,var(--card-bg)_92%,var(--text)_8%)] px-2 py-0.5">
          {displayStatus}
        </span>
      </div>
      <p className="text-sm font-black text-[var(--text)] Oswald uppercase mb-1">
        {safeDate ? new Date(safeDate + "T00:00:00").toLocaleDateString("pt-BR", { day: "2-digit", month: "long" }) : "—"}
      </p>
      <p className="text-xs font-bold text-[var(--text-muted)] mb-3">
        {formatTime(startTime)} às {formatTime(endTime)}
      </p>
      <div className="flex gap-4 border-t border-[var(--card-border)] pt-3">
        <div className="flex flex-col">
          <span className="text-[9px] text-[var(--text-muted)] uppercase font-black Oswald">Titulares</span>
          <span className="text-lg font-black Oswald text-[var(--text)]">{mainCount}/{mainLimit}</span>
        </div>
        <div className="flex flex-col">
          <span className="text-[9px] text-[var(--text-muted)] uppercase font-black Oswald">Reservas</span>
          <span className="text-lg font-black Oswald text-[var(--text)]">{waitCount}</span>
        </div>
      </div>
    </div>
  );
}
