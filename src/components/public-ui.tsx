import { useEffect, useState } from "react";

import { cn } from "@/lib/utils";


/**
 * Componentes de apresentação compartilhados da tela pública.
 * Somente UI — nenhuma regra de negócio aqui.
 */

export type PillTone = "emerald" | "amber" | "red" | "sky" | "gold" | "neutral";

const TONE_CLASS: Record<PillTone, string> = {
  emerald: "border-emerald-500/40 bg-emerald-500/10 text-emerald-600 dark:text-emerald-300",
  amber: "border-amber-500/45 bg-amber-500/10 text-amber-600 dark:text-amber-300",
  red: "border-red-500/50 bg-red-500/10 text-red-600 dark:text-red-300",
  sky: "border-sky-500/40 bg-sky-500/10 text-sky-600 dark:text-sky-300",
  gold: "border-[color-mix(in_srgb,var(--accent-neon)_55%,transparent)] bg-[color-mix(in_srgb,var(--accent-neon)_10%,transparent)] text-[var(--accent-neon)]",
  neutral: "border-[var(--card-border)] bg-[color-mix(in_srgb,var(--card-bg)_90%,var(--text)_10%)] text-[var(--text-muted)]",
};

/** Badge padronizado da tela pública (mesma altura, raio e tipografia). */
export function StatusPill({
  tone = "neutral",
  className,
  children,
  ...rest
}: React.HTMLAttributes<HTMLSpanElement> & { tone?: PillTone }) {
  return (
    <span
      {...rest}
      className={cn(
        "inline-flex h-6 shrink-0 items-center gap-1 rounded-full border px-2.5 text-[11px] font-semibold leading-none tracking-wide",
        TONE_CLASS[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}

/** Rótulo + valor usado nos cards compactos. */
export function InfoTile({
  label,
  value,
  valueClassName,
  className,
  sub,
}: {
  label: string;
  value: React.ReactNode;
  valueClassName?: string;
  className?: string;
  sub?: string;
}) {
  return (
    <div className={cn("min-w-0 flex flex-col gap-0.5", className)}>
      <p className="text-[10px] font-bold uppercase tracking-widest text-[var(--text-muted)] Oswald">
        {label}
      </p>
      <div className="flex flex-col leading-tight">
        <p className={cn("truncate text-[14px] font-black text-[var(--text)] Oswald uppercase tracking-tight", valueClassName)}>
          {value}
        </p>
        {sub && (
          <p className="text-[9px] font-bold uppercase tracking-wider text-[var(--text-muted)] Oswald truncate">
            {sub}
          </p>
        )}
      </div>
    </div>
  );
}


export type NavAnchor = { id: string; label: string };

/** Navegação por âncoras com rolagem suave (horizontal no mobile). */
export function SectionNav({ 
  items, 
  activeTab, 
  onTabChange 
}: { 
  items: NavAnchor[]; 
  activeTab?: string; 
  onTabChange?: (id: string) => void; 
}) {
  const ids = items.map((i) => i.id).join(",");
  const [internalActive, setInternalActive] = useState<string | null>(items[0]?.id ?? null);
  const active = activeTab ?? internalActive;

  useEffect(() => {
    if (activeTab) return; // Se controlado externamente, não escuta scroll
    const list = ids ? ids.split(",") : [];
    if (list.length === 0) return;
    const onScroll = () => {
      let current: string | null = null;
      for (const id of list) {
        const el = document.getElementById(id);
        if (!el) continue;
        if (el.getBoundingClientRect().top <= 150) current = id;
      }
      setInternalActive(current ?? list[0]);
    };
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, [ids, activeTab]);

  if (items.length === 0) return null;
  return (
    <nav
      aria-label="Navegação rápida"
      className="sticky top-0 z-30 mb-4 border-b border-[color-mix(in_srgb,var(--accent-neon)_15%,transparent)] bg-[color-mix(in_srgb,var(--bg)_95%,transparent)] px-4 py-2 backdrop-blur-sm md:static md:bg-transparent md:p-0 md:border-none hidden md:block"
    >
      <ul className="flex gap-2 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden md:flex-wrap md:justify-center md:overflow-visible container-mobile md:px-0">

        {items.map((it) => {
          const isActive = active === it.id;
          return (
            <li key={it.id} className="shrink-0">
              <button
                onClick={() => {
                  if (onTabChange) {
                    onTabChange(it.id);
                  } else {
                    const el = document.getElementById(it.id);
                    if (el) {
                      const offset = 100;
                      const bodyRect = document.body.getBoundingClientRect().top;
                      const elementRect = el.getBoundingClientRect().top;
                      const elementPosition = elementRect - bodyRect;
                      const offsetPosition = elementPosition - offset;
                      window.scrollTo({
                        top: offsetPosition,
                        behavior: "smooth"
                      });
                    }
                  }
                }}
                aria-label={`Ir para ${it.label}`}
                aria-current={isActive ? "true" : undefined}
                className={cn(
                  "inline-flex h-8 items-center rounded-lg border px-3 text-[10px] font-black uppercase tracking-widest transition-colors focus-visible:outline-none Oswald",
                  isActive
                    ? "border-[color-mix(in_srgb,var(--accent-neon)_60%,transparent)] bg-[color-mix(in_srgb,var(--accent-neon)_15%,transparent)] text-[var(--accent-neon)]"
                    : "border-[var(--card-border)] bg-[color-mix(in_srgb,var(--card-bg)_92%,var(--text)_8%)] text-[var(--text-muted)] hover:border-[color-mix(in_srgb,var(--accent-neon)_30%,transparent)] hover:text-[var(--text)]",
                )}
              >
                {it.label}
              </button>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

