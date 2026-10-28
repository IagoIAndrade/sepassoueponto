import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { History, Search, Calendar, Clock, AlertCircle, UserX, Info, Users } from "lucide-react";
import { useAdminGroup } from "@/lib/admin-group-context";
import { admin_list_withdrawals } from "@/lib/withdrawals.functions";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { format } from "date-fns";

type DateMode = "all" | "day" | "range";

export function WithdrawalsTab() {
  const { groupId } = useAdminGroup();
  const list = useServerFn(admin_list_withdrawals);
  const [search, setSearch] = useState("");
  const [groupFilter, setGroupFilter] = useState<string>(groupId ?? "all");
  const [dateMode, setDateMode] = useState<DateMode>("all");
  const [day, setDay] = useState("");
  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");

  const { data: groups } = useQuery({
    queryKey: ["withdrawals-groups"],
    queryFn: async () => {
      const { data } = await supabase.from("groups").select("id, name").order("sort_order");
      return data || [];
    },
  });

  const gid = groupFilter === "all" ? null : groupFilter;

  const { data: events } = useQuery({
    queryKey: ["withdrawals-event-dates"],
    queryFn: async () => {
      const { data } = await supabase
        .from("volleyball_events")
        .select("group_id, event_date")
        .order("event_date", { ascending: false });
      return data || [];
    },
  });

  const gameDates = useMemo(() => {
    const set = new Set<string>();
    (events || []).forEach((e: any) => {
      if (!gid || e.group_id === gid) set.add(e.event_date);
    });
    return Array.from(set).sort((a, b) => b.localeCompare(a));
  }, [events, gid]);

  useEffect(() => {
    if (day && events && !gameDates.includes(day)) setDay("");
  }, [day, events, gameDates]);

  const startDate = dateMode === "day" ? day || null : dateMode === "range" ? start || null : null;
  const endDate = dateMode === "day" ? day || null : dateMode === "range" ? end || null : null;

  const { data, isLoading, error } = useQuery({
    queryKey: ["admin-withdrawals", gid, startDate, endDate],
    queryFn: () => list({ data: { group_id: gid, start_date: startDate, end_date: endDate } }),
    retry: false,
    staleTime: 0,
  });

  const withdrawals = Array.isArray((data as any)?.withdrawals) ? (data as any).withdrawals : [];
  const filtered = withdrawals.filter((w: any) =>
    (w.player_name_snapshot || "").toLowerCase().includes(search.toLowerCase()),
  );

  const selectCls =
    "h-9 rounded-lg bg-brand-surface/30 border border-brand-border/60 px-2 text-[11px] text-brand-white Oswald uppercase font-bold";

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-brand-surface/20 p-4 rounded-xl border border-brand-border">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-brand-gold/10 border border-brand-gold/20 flex items-center justify-center">
            <History className="w-5 h-5 text-brand-gold" />
          </div>
          <div>
            <h3 className="text-sm font-black text-brand-white uppercase Oswald tracking-[0.1em]">Central de Retiradas</h3>
            <p className="text-[9px] text-brand-silver/50 uppercase font-bold tracking-widest">Histórico de todas as rodadas, inclusive encerradas</p>
          </div>
        </div>
        <Badge variant="outline" className="text-[10px] font-black Oswald border-brand-border bg-brand-surface/50 text-brand-silver px-3 py-1">
          {filtered.length} REGISTROS
        </Badge>
      </div>

      <div className="grid gap-2 md:grid-cols-[1fr_auto_auto] items-end">
        <div className="relative">
          <Search className="absolute left-3 top-2.5 w-4 h-4 text-brand-silver/30" />
          <Input
            placeholder="BUSCAR JOGADOR RETIRADO..."
            className="pl-10 bg-brand-surface/30 border-brand-border/60 h-9 text-[11px] text-brand-white Oswald uppercase font-bold"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <label className="flex flex-col gap-1 text-[8px] text-brand-silver/50 Oswald uppercase font-black">
          Turma
          <select aria-label="Turma" className={selectCls} value={groupFilter} onChange={(e) => setGroupFilter(e.target.value)}>
            <option value="all">Todas</option>
            {(groups || []).map((g: any) => (
              <option key={g.id} value={g.id}>{g.name}</option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-[8px] text-brand-silver/50 Oswald uppercase font-black">
          Data do jogo
          <select aria-label="Data do jogo" className={selectCls} value={dateMode} onChange={(e) => setDateMode(e.target.value as DateMode)}>
            <option value="all">Todas as datas</option>
            <option value="day">Dia específico</option>
            <option value="range">Intervalo</option>
          </select>
        </label>
      </div>
      {dateMode === "day" && (
        <select aria-label="Dia do jogo" className={cn(selectCls, "w-48")} value={day} onChange={(e) => setDay(e.target.value)}>
          <option value="">Selecione a data</option>
          {gameDates.map((d) => (
            <option key={d} value={d}>{format(new Date(d + "T12:00:00"), "dd/MM/yyyy")}</option>
          ))}
        </select>
      )}
      {dateMode === "range" && (
        <div className="flex gap-2 items-center">
          <Input type="date" aria-label="De" className="h-9 w-44 bg-brand-surface/30 border-brand-border/60 text-brand-white" value={start} onChange={(e) => setStart(e.target.value)} />
          <span className="text-brand-silver/50 text-xs">até</span>
          <Input type="date" aria-label="Até" className="h-9 w-44 bg-brand-surface/30 border-brand-border/60 text-brand-white" value={end} onChange={(e) => setEnd(e.target.value)} />
        </div>
      )}

      <div className="grid gap-2">
        {filtered.length > 0 && (
          <div className="hidden md:grid grid-cols-[minmax(0,2.2fr)_minmax(0,1fr)_minmax(0,1fr)_minmax(0,1.2fr)_minmax(0,1.6fr)] gap-4 px-3 py-2 text-[10px] text-brand-silver/50 Oswald uppercase font-black tracking-widest text-left border-b border-brand-border/40">
            <span>Jogador</span>
            <span>Turma</span>
            <span>Data do jogo</span>
            <span>Retirada</span>
            <span>Responsável</span>
          </div>
        )}
        {filtered.map((w: any) => {
          const late = w.deadline_status === "late" || w.deadline_status === "delayed";
          const gameDate = w.event_date ? format(new Date(w.event_date + "T12:00:00"), "dd/MM/yyyy") : "-";
          const removed = format(new Date(w.removed_at), "dd/MM/yyyy HH:mm");
          const label = "md:hidden text-[10px] text-brand-silver/50 Oswald uppercase font-black tracking-widest";
          const cell = "grid grid-cols-[96px_minmax(0,1fr)] md:block items-start gap-2 text-left min-w-0";
          return (
            <div key={w.id} className="grid grid-cols-1 md:grid-cols-[minmax(0,2.2fr)_minmax(0,1fr)_minmax(0,1fr)_minmax(0,1.2fr)_minmax(0,1.6fr)] gap-2 md:gap-4 md:items-start p-3 bg-brand-surface/40 border border-brand-border rounded-xl text-xs">
              <div className={cell}>
                <span className={label}>Jogador</span>
                <div className="flex items-start gap-2 min-w-0">
                  <UserX className="w-4 h-4 shrink-0 mt-0.5 text-brand-silver/50" />
                  <div className="min-w-0">
                    <p className="font-black text-brand-white Oswald uppercase break-words leading-snug">{w.player_name_snapshot}</p>
                    <div className="flex flex-wrap gap-1 mt-1">
                      <Badge variant="outline" className={cn("text-[9px] uppercase px-1.5 h-4 font-black border-0 rounded-md", late ? "bg-red-500/20 text-red-500" : "bg-emerald-500/20 text-emerald-400")}>
                        {late ? "FORA DO PRAZO" : w.deadline_status === "unknown_historical" ? "HISTÓRICO" : "DENTRO DO PRAZO"}
                      </Badge>
                      <Badge variant="outline" className="text-[9px] uppercase px-1.5 h-4 font-black border-0 rounded-md bg-brand-blue text-brand-silver/70">
                        {w.list_type_snapshot === "main" ? "TITULAR" : "RESERVA"}
                      </Badge>
                    </div>
                  </div>
                </div>
              </div>
              <div className={cell}>
                <span className={label}>Turma</span>
                <span className="text-brand-silver/80 break-words leading-snug">{w.group_name || "-"}</span>
              </div>
              <div className={cell}>
                <span className={label}>Data do jogo</span>
                <span className="font-mono tabular-nums text-brand-gold/90 leading-snug">{gameDate}</span>
              </div>
              <div className={cell}>
                <span className={label}>Retirada</span>
                <span className="font-mono tabular-nums text-brand-silver/80 leading-snug">{removed}</span>
              </div>
              <div className={cell}>
                <span className={label}>Responsável</span>
                <div className="min-w-0 leading-snug">
                  <p className={cn("font-bold break-words", w.origin_label === "Administrador" ? "text-brand-gold" : "text-brand-white")}>{w.author_label}</p>
                  <p className="text-[10px] text-brand-silver/60 uppercase mt-0.5">{w.origin_label}</p>
                </div>
              </div>
            </div>
          );
        })}

        {filtered.length === 0 && !isLoading && !error && (
          <div className="flex flex-col items-center justify-center py-16 border-2 border-dashed border-brand-border/20 rounded-2xl bg-brand-surface/10">
            <History className="w-10 h-10 text-brand-border/20 mb-3" />
            <p className="text-brand-silver/40 text-xs Oswald uppercase tracking-[0.2em]">Nenhuma retirada encontrada para estes filtros</p>
          </div>
        )}

        {isLoading && (
          <div className="p-12 text-center">
            <div className="w-8 h-8 border-2 border-brand-gold/30 border-t-brand-gold rounded-full animate-spin mx-auto mb-4" />
            <p className="text-brand-silver/50 Oswald uppercase text-[10px] tracking-widest">Carregando histórico...</p>
          </div>
        )}

        {error && (
          <div className="p-8 text-center border-2 border-red-500/20 rounded-2xl bg-red-500/5">
            <AlertCircle className="w-8 h-8 text-red-500/60 mx-auto" />
            <p className="text-red-500 font-black Oswald uppercase text-xs mt-2">Falha ao carregar o histórico</p>
            <p className="text-[10px] text-brand-silver/60 mt-1">{(error as any)?.message || "Erro de permissão ou rede"}</p>
          </div>
        )}
      </div>

      <div className="p-4 bg-brand-gold/5 rounded-xl border border-brand-gold/10 flex items-start gap-3">
        <Info className="w-4 h-4 text-brand-gold shrink-0 mt-0.5 opacity-60" />
        <p className="text-[9px] text-brand-silver/60 uppercase font-bold leading-relaxed">
          O autor vem do registro gravado no momento da retirada. Quando não é possível comprovar quem executou, aparece "Autor não identificado".
        </p>
      </div>
    </div>
  );
}
