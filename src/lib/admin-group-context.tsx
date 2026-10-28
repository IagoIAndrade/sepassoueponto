import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";

import { admin_list_groups, type AdminGroup } from "@/lib/admin.functions";
import { confirmDiscardUnsaved } from "@/lib/unsaved-guard";

const STORAGE_KEY = "spp:admin-selected-group";

type AdminGroupCtx = {
  groups: AdminGroup[];
  groupId: string | null;
  group: AdminGroup | null;
  setGroupId: (id: string) => void;
  isLoading: boolean;
};

const Ctx = createContext<AdminGroupCtx>({
  groups: [],
  groupId: null,
  group: null,
  setGroupId: () => {},
  isLoading: true,
});

export function useAdminGroup() {
  return useContext(Ctx);
}

export function AdminGroupProvider({ children }: { children: ReactNode }) {
  const listGroups = useServerFn(admin_list_groups);
  const [groupId, setGroupIdState] = useState<string | null>(null);

  const groupsQ = useQuery<AdminGroup[]>({
    queryKey: ["admin-groups"],
    queryFn: () => listGroups(),
    staleTime: 5 * 60_000,
  });
  const groups = groupsQ.data ?? [];

  useEffect(() => {
    if (groups.length === 0) return;
    setGroupIdState((current) => {
      if (current && groups.some((g) => g.id === current)) return current;
      let saved: string | null = null;
      try {
        saved = localStorage.getItem(STORAGE_KEY);
      } catch {
        /* ignore */
      }
      if (saved && groups.some((g) => g.id === saved)) return saved;
      return groups[0].id;
    });
  }, [groups]);

  const setGroupId = (id: string) => {
    setGroupIdState(id);
    try {
      localStorage.setItem(STORAGE_KEY, id);
    } catch {
      /* ignore */
    }
  };

  const group = groups.find((g) => g.id === groupId) ?? null;

  return (
    <Ctx.Provider
      value={{ groups, groupId, group, setGroupId, isLoading: groupsQ.isLoading }}
    >
      {children}
    </Ctx.Provider>
  );
}

export function AdminGroupSelector() {
  const { groups, groupId, setGroupId } = useAdminGroup();
  if (groups.length < 2) return null;
  return (
    <div
      role="tablist"
      aria-label="Turma"
      className="grid grid-cols-4 gap-1 rounded-[10px] border border-brand-border bg-brand-background p-1 h-[42px] items-center"
    >
      {groups.map((g) => {
        const isActive = g.id === groupId;
        return (
          <button
            key={g.id}
            type="button"
            role="tab"
            aria-selected={isActive}
            onClick={() => {
              if (g.id === groupId) return;
              if (!confirmDiscardUnsaved("Você está trocando de turma.")) return;
              setGroupId(g.id);
            }}
            className={`rounded-[8px] h-full px-2 py-1.5 text-[11px] font-bold uppercase tracking-wide transition-all sm:text-xs flex items-center justify-center ${
              isActive
                ? "bg-brand-gold text-brand-blue shadow-[0_0_15px_rgba(245,183,0,0.15)] ring-1 ring-brand-gold/50"
                : "text-brand-silver hover:bg-white/5 hover:text-brand-white"
            }`}
          >
            <span className="sm:hidden">{g.name.split('-')[0].trim()}</span>
            <span className="hidden sm:inline">{g.name}</span>
            {g.active ? "" : " (inativa)"}
          </button>
        );
      })}
    </div>
  );
}
