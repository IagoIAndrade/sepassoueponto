import { cn } from "@/lib/utils";
import { Clock, Users, ListOrdered } from "lucide-react";

export type TabId = "inicio" | "lista" | "times";

export function MobileNavBar({
  activeTab,
  setActiveTab,
  isVisible = true,
}: {
  activeTab: TabId;
  setActiveTab: (tab: TabId) => void;
  isVisible?: boolean;
}) {
  const tabs = [
    { id: "inicio", label: "INÍCIO", icon: Clock },
    { id: "times", label: "TIMES", icon: Users },
    { id: "lista", label: "LISTA", icon: ListOrdered },
  ] as const;

  return (
    <nav
      aria-label="Navegação inferior mobile"
      className={cn(
        "fixed bottom-0 left-0 right-0 z-50 flex h-[calc(60px+env(safe-area-inset-bottom,0px))] items-center justify-around border-t border-[var(--card-border)] bg-[color-mix(in_srgb,var(--card-bg)_95%,transparent)] backdrop-blur-xl px-2 pb-[env(safe-area-inset-bottom,0px)] md:hidden w-full transition-transform duration-300 shadow-[0_-4px_24px_rgba(0,0,0,0.18)] dark:shadow-[0_-4px_24px_rgba(0,0,0,0.7)]",
        !isVisible && "translate-y-full pointer-events-none"
      )}
    >
      {tabs.map(({ id, label, icon: Icon }) => {
        const isActive = activeTab === id;
        return (
          <button
            key={id}
            type="button"
            onClick={() => setActiveTab(id as TabId)}
            className={cn(
              "flex flex-col items-center justify-center gap-1 transition-all flex-1 h-full touch-manipulation max-w-[120px] select-none py-1",
              isActive ? "text-[var(--accent-neon)]" : "text-[var(--text-muted)] hover:text-[var(--text)]"
            )}
          >
            <div
              className={cn(
                "p-1.5 rounded-xl transition-all duration-200",
                isActive
                  ? "bg-[color-mix(in_srgb,var(--accent-neon)_15%,transparent)] text-[var(--accent-neon)] shadow-[0_0_12px_rgba(255,0,153,0.35)] scale-105"
                  : "bg-transparent text-[var(--text-muted)]"
              )}
            >
              <Icon className={cn("h-5 w-5", isActive ? "stroke-[2.5]" : "stroke-[2]")} />
            </div>
            <span
              className={cn(
                "text-[10px] font-black uppercase tracking-[0.12em] Oswald transition-all",
                isActive ? "text-[var(--accent-neon)] opacity-100 font-bold drop-shadow-[0_0_6px_rgba(255,0,153,0.4)]" : "opacity-60"
              )}
            >
              {label}
            </span>
          </button>
        );
      })}
    </nav>
  );
}
