import { useState, useMemo, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { format } from "date-fns";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { PlusCircle, Search, Trash2, Calendar, User, FileText, Clock, AlertCircle, Info, ShieldAlert, CheckCircle2, MoreHorizontal } from "lucide-react";
import { useAdminGroup } from "@/lib/admin-group-context";
import { admin_list_incidents, get_admin_event, admin_list_players } from "@/lib/admin.functions";
import { admin_create_incident, admin_delete_incident, admin_apply_incident, admin_resolve_incident, admin_get_incidents_metrics, admin_list_incidents_by_game } from "@/lib/incidents.functions";

import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { AppConfirmDialog } from "@/components/AppDialogs";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { cn } from "@/lib/utils";
import { friendlyError } from "@/lib/error-messages";
import { PlayerAvatar } from "@/components/PlayerAvatar";
import { PlayerPhotoModal } from "@/components/PlayerPhotoModal";

export function IncidentsTab() {
  const [selectedPhoto, setSelectedPhoto] = useState<any>(null);
  const { groupId } = useAdminGroup();
  const list = useServerFn(admin_list_incidents_by_game);
  const create = useServerFn(admin_create_incident);
  const remove = useServerFn(admin_delete_incident);
  const applyInc = useServerFn(admin_apply_incident);
  const resolveInc = useServerFn(admin_resolve_incident);
  const getEvent = useServerFn(get_admin_event);
  const listPlayers = useServerFn(admin_list_players);

  const [search, setSearch] = useState("");
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<{ open: boolean; id: string | null }>({ open: false, id: null });

  const [formData, setFormData] = useState({
    player_id: "",
    incident_type: "no_show" as "no_show" | "late_leave",
    status: "pending" as any,
    admin_notes: "",
    suggested_rounds: 1
  });

  const [groupFilter, setGroupFilter] = useState<string>("all");
  const [dateMode, setDateMode] = useState<"all" | "day" | "range">("all");
  const [day, setDay] = useState("");
  const [rStart, setRStart] = useState("");
  const [rEnd, setREnd] = useState("");
  const gid = groupFilter === "all" ? null : groupFilter;

  const { data: groupsList } = useQuery({
    queryKey: ["incidents-groups"],
    queryFn: async () => {
      const { data } = await supabase.from("groups").select("id, name").order("sort_order");
      return data || [];
    },
  });
  const { data: evDates } = useQuery({
    queryKey: ["incidents-event-dates"],
    queryFn: async () => {
      const { data } = await supabase.from("volleyball_events").select("group_id, event_date").order("event_date", { ascending: false });
      return data || [];
    },
  });
  const gameDates = useMemo(() => {
    const set = new Set<string>();
    (evDates || []).forEach((e: any) => { if (!gid || e.group_id === gid) set.add(e.event_date); });
    return Array.from(set).sort((a, b) => b.localeCompare(a));
  }, [evDates, gid]);
  useEffect(() => {
    if (day && evDates && !gameDates.includes(day)) setDay("");
  }, [day, evDates, gameDates]);
  const fmtDate = (d: string | null) => (d ? format(new Date(d + "T12:00:00"), "dd/MM/yyyy") : "-");
  const fmtDateTime = (iso: string) =>
    new Date(iso).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
  const startDate = dateMode === "day" ? day || null : dateMode === "range" ? rStart || null : null;
  const endDate = dateMode === "day" ? day || null : dateMode === "range" ? rEnd || null : null;

  const { data: res, isLoading, isFetching, error: loadError, refetch } = useQuery({
    queryKey: ["admin-incidents-by-game", gid, startDate, endDate],
    queryFn: () => list({ data: { group_id: gid, start_date: startDate, end_date: endDate } }),
    staleTime: 0,
    retry: false,
  });

  const { data: eligiblePlayers } = useQuery({
    queryKey: ["admin-all-players", groupId],
    queryFn: () => listPlayers({ data: { search: "" } }),
    enabled: !!groupId && isModalOpen,
  });

  const { data: eventData } = useQuery({
    queryKey: ["admin-current-event", groupId],
    queryFn: () => getEvent({ data: { group_id: groupId } }),
    enabled: !!groupId && isModalOpen,
  });

  const [editingGroupId, setEditingGroupId] = useState<string | null>(null);
  const groupName = ((eventData?.settings as any)?.group?.name || "TURMA").toUpperCase();

  useState(() => {
    if (groupId) setEditingGroupId(groupId);
  });

  const incidents = Array.isArray(res?.incidents) ? res.incidents.filter((i: any) => 
    i.player_name.toLowerCase().includes(search.toLowerCase())
  ) : [];

  const summary = useMemo(() => {
    const total = incidents.length;
    const noShows = incidents.filter((i: any) => i.incident_type === 'no_show').length;
    const lateLeaves = incidents.filter((i: any) => i.incident_type === 'late_leave').length;
    const pending = incidents.filter((i: any) => i.status === 'pending').length;
    const active = incidents.filter((i: any) => i.status === 'applied').length;
    return { total, noShows, lateLeaves, pending, active };
  }, [incidents]);

  const handleCreate = async () => {
    if (groupId !== editingGroupId) {
       toast.error(`Turma alterada. Operação cancelada.`);
       return;
    }
    if (!formData.player_id) {
      toast.error("Selecione um jogador");
      return;
    }
    if (!eventData?.event?.id) {
      toast.error("Nenhuma rodada ativa encontrada para esta turma.");
      return;
    }

    setBusy(true);
    try {
      await create({
        data: {
          ...formData,
          event_id: eventData.event.id,
          occurred_at: new Date().toISOString(),
          group_id: groupId!
        }
      });
      toast.success("Ocorrência criada com sucesso");
      setIsModalOpen(false);
      refetch();
    } catch (e: any) {
      toast.error(friendlyError(e.message));
    } finally {
      setBusy(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (groupId !== editingGroupId) {
       toast.error(`Turma alterada. Operação cancelada.`);
       return;
    }
    setBusy(true);
    try {
      const { ok } = await remove({ data: { incident_id: id } });
      if (ok) {
        toast.success("Ocorrência excluída com sucesso.");
        refetch();
      }
    } catch (e: any) {
      toast.error(friendlyError(e.message));
    } finally {
      setBusy(false);
      setConfirmDelete({ open: false, id: null });
    }
  };

  const handleApply = async (id: string) => {
    setBusy(true);
    try {
      await applyInc({ data: { incident_id: id } });
      toast.success("Punição aplicada! Bloqueio ativo para a turma.");
      refetch();
    } catch (e: any) {
      toast.error(friendlyError(e.message));
    } finally {
      setBusy(false);
    }
  };

  const handleResolve = async (id: string, status: string) => {
    setBusy(true);
    try {
      await resolveInc({ data: { incident_id: id, status } });
      toast.success("Ocorrência atualizada com sucesso.");
      refetch();
    } catch (e: any) {
      toast.error(friendlyError(e.message));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-6 pb-20">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-end gap-4">
        <div className="space-y-1">
          <h3 className="text-xl md:text-2xl font-black text-slate-900 dark:text-brand-white Oswald uppercase tracking-tight flex items-center gap-2">
            Central <span className="text-pink-600 dark:text-brand-gold">Disciplinar</span>
            {groupName !== "TURMA" && <span className="text-[10px] text-slate-500 dark:text-brand-silver/50 ml-2 border-l border-slate-200 dark:border-brand-border/50 pl-2">Turma: {groupName}</span>}
          </h3>
          <p className="text-[10px] text-slate-500 dark:text-brand-silver uppercase font-bold tracking-widest flex items-center gap-1">
            <Info className="w-3 h-3 text-pink-600 dark:text-brand-gold" />
            Gestão de faltas e conduta operacional da turma
          </p>
        </div>
        <Button 
          size="sm" 
          className="h-10 bg-slate-900 dark:bg-brand-gold text-white dark:text-brand-blue font-black text-[11px] Oswald uppercase hover:bg-slate-800 dark:hover:bg-brand-gold/90 tracking-widest transition-all active:scale-95 shadow-lg dark:shadow-brand-gold/10"
          onClick={() => setIsModalOpen(true)}
        >
          <PlusCircle className="w-4 h-4 mr-2" /> Registrar Ocorrência
        </Button>
      </div>

      {/* DISCIPLINARY SUMMARY */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Card className="p-3 bg-white dark:bg-white/5 border-slate-200 dark:border-brand-border/40 flex flex-col justify-center items-center text-center shadow-sm dark:shadow-none">
          <span className="text-[9px] uppercase font-bold text-slate-500 dark:text-brand-silver/50 tracking-widest mb-1">Total</span>
          <p className="text-xl font-black text-slate-900 dark:text-brand-white Oswald leading-none">{summary.total}</p>
        </Card>
        <Card className="p-3 bg-red-50 dark:bg-red-500/5 border-red-200 dark:border-red-500/20 flex flex-col justify-center items-center text-center">
          <span className="text-[9px] uppercase font-bold text-red-500 dark:text-red-400/50 tracking-widest mb-1">No-Shows</span>
          <p className="text-xl font-black text-red-600 dark:text-red-400 Oswald leading-none">{summary.noShows}</p>
        </Card>
        <Card className="p-3 bg-orange-50 dark:bg-orange-500/5 border-orange-200 dark:border-orange-500/20 flex flex-col justify-center items-center text-center">
          <span className="text-[9px] uppercase font-bold text-orange-500 dark:text-orange-400/50 tracking-widest mb-1">Saídas</span>
          <p className="text-xl font-black text-orange-600 dark:text-orange-400 Oswald leading-none">{summary.lateLeaves}</p>
        </Card>
        <Card className="p-3 bg-amber-50 dark:bg-amber-500/5 border-amber-200 dark:border-amber-500/20 flex flex-col justify-center items-center text-center">
          <span className="text-[9px] uppercase font-bold text-amber-500 dark:text-amber-500/50 tracking-widest mb-1">Pendentes</span>
          <p className="text-xl font-black text-amber-600 dark:text-amber-500 Oswald leading-none">{summary.pending}</p>
        </Card>
        <Card className="p-3 bg-red-50 dark:bg-red-500/5 border-red-200 dark:border-red-500/20 flex flex-col justify-center items-center text-center">
          <span className="text-[9px] uppercase font-bold text-red-500 dark:text-red-500/50 tracking-widest mb-1">Bloqueios Ativos</span>
          <p className="text-xl font-black text-red-600 dark:text-red-500 Oswald leading-none">{summary.active}</p>
        </Card>
      </div>
      
      <div className="relative group">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 dark:text-brand-silver/30 group-focus-within:text-pink-600 dark:group-focus-within:text-brand-gold transition-colors" />
        <Input 
          placeholder="Buscar jogador na central..." 
          className="pl-10 bg-white dark:bg-[#020B1B]/40 border-slate-200 dark:border-brand-border h-11 text-[11px] text-slate-900 dark:text-brand-white Oswald uppercase tracking-wider focus:border-pink-500 dark:focus:border-brand-gold transition-all shadow-sm dark:shadow-none"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      <div className="grid gap-2 md:grid-cols-3">
        <select aria-label="Turma" className="h-10 rounded-lg bg-white dark:bg-brand-surface/30 border border-slate-200 dark:border-brand-border/60 px-2 text-[11px] text-slate-900 dark:text-brand-white Oswald uppercase font-bold" value={groupFilter} onChange={(e) => setGroupFilter(e.target.value)}>
          <option value="all">Todas as turmas</option>
          {(groupsList || []).map((g: any) => <option key={g.id} value={g.id}>{g.name}</option>)}
        </select>
        <select aria-label="Data do jogo" className="h-10 rounded-lg bg-white dark:bg-brand-surface/30 border border-slate-200 dark:border-brand-border/60 px-2 text-[11px] text-slate-900 dark:text-brand-white Oswald uppercase font-bold" value={dateMode} onChange={(e) => setDateMode(e.target.value as any)}>
          <option value="all">Todas as datas</option>
          <option value="day">Dia do jogo</option>
          <option value="range">Intervalo</option>
        </select>
        {dateMode === "day" && (
          <select aria-label="Dia do jogo" className="h-10 rounded-lg bg-white dark:bg-brand-surface/30 border border-slate-200 dark:border-brand-border/60 px-2 text-[11px] text-slate-900 dark:text-brand-white Oswald uppercase font-bold" value={day} onChange={(e) => setDay(e.target.value)}>
            <option value="">Selecione o jogo</option>
            {gameDates.map((d) => <option key={d} value={d}>{fmtDate(d)}</option>)}
          </select>
        )}
        {dateMode === "range" && (
          <div className="flex gap-2">
            <Input type="date" aria-label="De" value={rStart} onChange={(e) => setRStart(e.target.value)} className="h-10 text-[11px]" />
            <Input type="date" aria-label="Até" value={rEnd} onChange={(e) => setREnd(e.target.value)} className="h-10 text-[11px]" />
          </div>
        )}
      </div>

      {loadError && (
        <div className="flex flex-col items-center gap-3 py-10 border border-red-500/30 rounded-xl bg-red-500/5 text-center">
          <AlertCircle className="w-8 h-8 text-red-500" />
          <p className="text-xs font-bold text-red-500 Oswald uppercase">Não foi possível carregar as ocorrências.</p>
          <Button size="sm" variant="outline" onClick={() => refetch()} disabled={isFetching}>Tentar novamente</Button>
        </div>
      )}

      <div className="grid gap-3">
        {!loadError && incidents.map((inc: any) => (
          <Card key={inc.incident_id} className={cn("p-4 transition-all duration-300 group shadow-sm dark:shadow-md", inc.status === 'applied' ? "bg-red-50 dark:bg-red-500/5 border-red-200 dark:border-red-500/30 shadow-[0_0_15px_rgba(239,68,68,0.1)]" : "bg-white dark:bg-[#020B1B]/40 border-slate-200 dark:border-brand-border/50 hover:border-pink-500/40 dark:hover:border-brand-gold/40")}>
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
              <div className="min-w-0 flex-1 flex items-start md:items-center gap-4">
                <PlayerAvatar 
                  path={inc.avatar_path} 
                  name={inc.player_name} 
                  size="md" 
                  className="shrink-0 cursor-pointer border border-brand-border group-hover:border-brand-gold/50 transition-all" 
                  onClick={(e) => {
                    e.stopPropagation();
                    setSelectedPhoto({
                      id: inc.player_id,
                      name: inc.player_name,
                      avatar_path: inc.avatar_path,
                      phone: inc.phone,
                      group_name: "CENTRAL DISCIPLINAR",
                      position: inc.incident_type === 'no_show' ? 'FALTA' : 'SAÍDA TARDIA'
                    });
                  }}
                />
                <div className="min-w-0 w-full">
                  <div className="flex items-center justify-between md:justify-start gap-2 flex-wrap">
                    <p className="text-xs font-black text-slate-900 dark:text-brand-white Oswald uppercase tracking-tight truncate max-w-[150px]">{inc.player_name}</p>
                    <Badge variant="outline" className={cn(
                      "text-[8px] uppercase px-1.5 h-4 font-black tracking-widest border-2",
                      inc.incident_type === 'no_show' ? "bg-red-500/10 text-red-500 border-red-500/20" : "bg-orange-500/10 text-orange-500 border-orange-500/20"
                    )}>
                      {inc.incident_type === 'no_show' ? 'Falta sem aviso' : 'Retirada após o prazo'}
                    </Badge>
                  </div>
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-1.5 text-[9px] text-slate-500 dark:text-brand-silver/50 Oswald font-bold uppercase tracking-widest">
                    <span className="flex items-center gap-1"><Calendar className="w-3 h-3 text-pink-600/50 dark:text-brand-gold/50" /> JOGO {fmtDate(inc.event_date)}</span>
                    <span className="flex items-center gap-1"><User className="w-3 h-3 text-pink-600/50 dark:text-brand-gold/50" /> {inc.group_name || "-"}</span>
                    <span className="flex items-center gap-1"><FileText className="w-3 h-3 text-pink-600/50 dark:text-brand-gold/50" /> REGISTRO {fmtDateTime(inc.occurred_at)}</span>
                    <span className="flex items-center gap-1"><Clock className="w-3 h-3 text-pink-600/50 dark:text-brand-gold/50" /> {inc.suggested_rounds} {inc.suggested_rounds === 1 ? 'RODADA' : 'RODADAS'} DE PUNIÇÃO</span>
                  </div>
                  
                  {inc.status === 'applied' && (
                    <div className="mt-3 grid grid-cols-2 md:flex md:items-center gap-3 md:gap-6 bg-slate-50 dark:bg-black/20 p-2.5 rounded-lg border border-slate-200 dark:border-red-500/20">
                      <div className="space-y-0.5">
                        <p className="text-[8px] text-slate-500 dark:text-brand-silver/60 uppercase font-black tracking-widest">Status Atual</p>
                        <p className="text-[10px] text-red-500 dark:text-red-400 font-bold uppercase tracking-wider flex items-center gap-1"><ShieldAlert className="w-3 h-3" /> BLOQUEIO ATIVO</p>
                      </div>
                      <div className="space-y-0.5">
                        <p className="text-[8px] text-slate-500 dark:text-brand-silver/60 uppercase font-black tracking-widest">Data de Aplicação</p>
                        <p className="text-[10px] text-slate-900 dark:text-brand-white font-bold uppercase tracking-wider">{inc.applied_at ? fmtDateTime(inc.applied_at) : '-'}</p>
                      </div>
                      <div className="space-y-0.5">
                        <p className="text-[8px] text-slate-500 dark:text-brand-silver/60 uppercase font-black tracking-widest">Rodadas Cumpridas</p>
                        <p className="text-[10px] text-slate-900 dark:text-brand-white font-bold uppercase tracking-wider text-emerald-500 dark:text-emerald-400">{inc.fulfilled_rounds || 0}</p>
                      </div>
                      <div className="space-y-0.5">
                        <p className="text-[8px] text-slate-500 dark:text-brand-silver/60 uppercase font-black tracking-widest">Rodadas Restantes</p>
                        <p className="text-[10px] text-slate-900 dark:text-brand-white font-bold uppercase tracking-wider text-red-500 dark:text-red-400">{inc.remaining_rounds || 0}</p>
                      </div>
                    </div>
                  )}
                  
                  {inc.incident_type === 'late_leave' && (
                    <div className="mt-2 p-2 bg-slate-50 dark:bg-white/5 rounded-lg border border-slate-200 dark:border-white/5">
                      <p className="text-[8px] text-slate-500 dark:text-brand-silver/60 uppercase font-black tracking-widest mb-1">Observação informada na retirada</p>
                      {inc.withdrawal_note ? (
                        <p className="text-[11px] text-slate-800 dark:text-brand-white/90 whitespace-pre-wrap break-words leading-relaxed">{inc.withdrawal_note}</p>
                      ) : (
                        <p className="text-[10px] text-slate-400 dark:text-brand-silver/40 italic">Sem observação</p>
                      )}
                    </div>
                  )}
                  {inc.admin_notes && (
                    <div className="mt-2 flex items-start gap-1.5 p-2 bg-slate-50 dark:bg-white/5 rounded-lg border border-slate-200 dark:border-white/5 italic">
                      <FileText className="w-3 h-3 text-slate-400 dark:text-brand-silver/30 mt-0.5 shrink-0" />
                      <p className="text-[10px] text-slate-700 dark:text-brand-silver/70 line-clamp-2 leading-relaxed">"{inc.admin_notes}"</p>
                    </div>
                  )}
                </div>
              </div>
              
              <div className="flex flex-row md:flex-col items-center md:items-end gap-2 w-full md:w-auto mt-2 md:mt-0 border-t md:border-t-0 border-brand-border/30 pt-3 md:pt-0">
                <Badge variant="outline" className={cn(
                  "text-[9px] uppercase px-2 h-5 font-black tracking-widest border-2 shrink-0 hidden md:inline-flex",
                  inc.status === 'pending' ? "bg-amber-500/10 text-amber-500 border-amber-500/20" :
                  inc.status === 'applied' ? "bg-red-500/10 text-red-500 border-red-500/20" :
                  "bg-emerald-500/10 text-emerald-500 border-emerald-500/20"
                )}>
                  {inc.status === 'pending' ? 'AGUARDANDO DECISÃO' : inc.status === 'applied' ? 'BLOQUEADO' : 'RESOLVIDO'}
                </Badge>
                
                <div className="flex flex-wrap items-center justify-end gap-2 w-full">
                  {inc.status === 'pending' && (
                    <>
                      <Button size="sm" variant="outline" className="h-7 text-[9px] font-bold uppercase text-emerald-400 border-emerald-500/30 hover:bg-emerald-500/10" onClick={(e) => { e.stopPropagation(); handleResolve(inc.incident_id, 'justified'); }} disabled={busy}>Perdoar / Arquivar</Button>
                      <Button size="sm" className="h-7 text-[9px] font-bold uppercase bg-red-500 text-white hover:bg-red-600 shadow-md" onClick={(e) => { e.stopPropagation(); handleApply(inc.incident_id); }} disabled={busy}>Aplicar Punição</Button>
                    </>
                  )}
                  {inc.status === 'applied' && (
                    <Button size="sm" variant="outline" className="h-7 text-[9px] font-bold uppercase text-slate-600 dark:text-brand-silver border-slate-200 dark:border-brand-border hover:bg-slate-50 dark:hover:bg-white/5" onClick={(e) => { e.stopPropagation(); handleResolve(inc.incident_id, 'cancelled'); }} disabled={busy}>Suspender Bloqueio</Button>
                  )}
                  {(inc.status === 'completed' || inc.status === 'cancelled' || inc.status === 'justified') && (
                    <span className="text-[9px] font-bold text-slate-500 dark:text-brand-silver/50 uppercase flex items-center gap-1"><CheckCircle2 className="w-3 h-3" /> ARQUIVADO</span>
                  )}
                  
                  <Button 
                    variant="ghost" 
                    size="icon" 
                    className="h-7 w-7 text-red-500/60 dark:text-red-400/60 hover:text-red-600 dark:hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-400/10 transition-all rounded-lg shrink-0 ml-auto md:ml-0"
                    onClick={(e) => {
                      e.stopPropagation();
                      setConfirmDelete({ open: true, id: inc.incident_id });
                    }}
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </Button>
                </div>
              </div>
            </div>
          </Card>
        ))}
        {isLoading && <p className="text-center text-[10px] text-slate-500 Oswald uppercase py-8">Carregando ocorrências...</p>}
        {incidents.length === 0 && !isLoading && !loadError && (
          <div className="flex flex-col items-center justify-center py-20 border-2 border-dashed border-slate-200 dark:border-brand-border/30 rounded-3xl bg-slate-50 dark:bg-white/2 overflow-hidden relative">
            <div className="absolute inset-0 bg-brand-gold/2 opacity-[0.02] pointer-events-none" />
            <ShieldAlert className="w-12 h-12 text-slate-300 dark:text-brand-silver/10 mb-4" />
            <h4 className="text-xs font-black text-slate-400 dark:text-brand-silver/40 Oswald uppercase tracking-[0.2em]">{dateMode === "day" && day ? "Nenhuma ocorrência para este jogo" : "Nenhuma ocorrência encontrada"}</h4>
            <p className="text-[10px] text-slate-400 dark:text-brand-silver/30 Oswald uppercase mt-1">Nenhum registro para os filtros selecionados.</p>
          </div>
        )}
      </div>

      {/* DIALOG FOR NEW INCIDENT */}
      <Dialog open={isModalOpen} onOpenChange={setIsModalOpen}>
        <DialogContent aria-describedby="incident-dialog-desc" className="bg-white dark:bg-brand-blue border-slate-200 dark:border-brand-gold/30 text-slate-900 dark:text-brand-white max-w-sm Oswald">
          <DialogHeader>
            <DialogTitle className="Oswald uppercase text-pink-600 dark:text-brand-gold text-xl tracking-tight">Novo Registro</DialogTitle>
            <DialogDescription id="incident-dialog-desc" className="text-slate-500 dark:text-brand-silver/70 text-[11px] Oswald uppercase">Reportar infração operacional do jogador.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label className="text-[10px] uppercase Oswald text-brand-silver font-black tracking-widest">Selecionar Jogador</Label>
              <div className="relative group">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-brand-silver/50 z-10 group-focus-within:text-brand-gold transition-colors" />
                <Input 
                  placeholder="Nome ou WhatsApp..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="pl-8 bg-slate-50 dark:bg-brand-surface border-slate-200 dark:border-brand-border h-10 text-[11px] text-slate-900 dark:text-brand-white Oswald uppercase tracking-wider mb-2"
                />
              </div>
              <Select 
                value={formData.player_id} 
                onValueChange={(val) => setFormData(prev => ({ ...prev, player_id: val }))}
              >
                <SelectTrigger className="bg-slate-50 dark:bg-brand-surface border-slate-200 dark:border-brand-border h-10 text-[11px] text-slate-900 dark:text-brand-white Oswald uppercase font-bold tracking-wider">
                  <SelectValue placeholder="Escolha na lista..." />
                </SelectTrigger>
                <SelectContent className="bg-white dark:bg-brand-blue border-slate-200 dark:border-brand-border text-slate-900 dark:text-brand-white max-h-[300px] Oswald">
                  {eligiblePlayers?.players
                    ?.filter((p: any) => {
                      const s = search.toLowerCase();
                      return p.name.toLowerCase().includes(s) || (p.phone && p.phone.includes(s));
                    })
                    .map((p: any) => (
                      <SelectItem key={p.id} value={p.id} className="text-[11px] uppercase Oswald font-bold focus:bg-brand-gold focus:text-brand-blue transition-colors">
                        <div className="flex items-center gap-3 py-1">
                          <Avatar className="h-6 w-6 border border-brand-border/50">
                            <AvatarImage src={p.avatar_url || ""} />
                            <AvatarFallback className="text-[8px]">{p.name?.slice(0,2)}</AvatarFallback>
                          </Avatar>
                          <div className="flex flex-col">
                            <span>{p.name}</span>
                            <span className="text-[8px] text-brand-silver/50 font-mono font-normal">+{p.phone}</span>
                          </div>
                        </div>
                      </SelectItem>
                    ))
                  }
                  {(!eligiblePlayers?.players || eligiblePlayers.players.length === 0) && (
                    <p className="text-[10px] p-4 text-slate-500 dark:text-brand-silver/50 Oswald text-center uppercase">Nenhum jogador encontrado.</p>
                  )}
                </SelectContent>
              </Select>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label className="text-[10px] uppercase Oswald text-slate-500 dark:text-brand-silver font-black tracking-widest">Tipo</Label>
                <Select 
                  value={formData.incident_type} 
                  onValueChange={(val: any) => setFormData(prev => ({ ...prev, incident_type: val }))}
                >
                  <SelectTrigger className="bg-slate-50 dark:bg-brand-surface border-slate-200 dark:border-brand-border h-10 text-[11px] text-slate-900 dark:text-brand-white Oswald uppercase font-bold tracking-wider">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="bg-white dark:bg-brand-blue border-slate-200 dark:border-brand-border text-slate-900 dark:text-brand-white Oswald">
                    <SelectItem value="no_show" className="text-[11px] uppercase Oswald font-bold">Falta sem aviso</SelectItem>
                    <SelectItem value="late_leave" className="text-[11px] uppercase Oswald font-bold">Retirada após o prazo</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label className="text-[10px] uppercase Oswald text-slate-500 dark:text-brand-silver font-black tracking-widest">Punir (Rds)</Label>
                <Input 
                  type="number" 
                  min="1"
                  value={formData.suggested_rounds}
                  onChange={(e) => setFormData(prev => ({ ...prev, suggested_rounds: parseInt(e.target.value) || 1 }))}
                  className="bg-slate-50 dark:bg-brand-surface border-slate-200 dark:border-brand-border h-10 text-[11px] text-slate-900 dark:text-brand-white Oswald font-bold"
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label className="text-[10px] uppercase Oswald text-slate-500 dark:text-brand-silver font-black tracking-widest">Status</Label>
              <Select 
                value={formData.status} 
                onValueChange={(val: any) => setFormData(prev => ({ ...prev, status: val }))}
              >
                <SelectTrigger className="bg-slate-50 dark:bg-brand-surface border-slate-200 dark:border-brand-border h-10 text-[11px] text-slate-900 dark:text-brand-white Oswald uppercase font-bold tracking-wider">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="bg-white dark:bg-brand-blue border-slate-200 dark:border-brand-border text-slate-900 dark:text-brand-white Oswald">
                  <SelectItem value="pending" className="text-[11px] uppercase Oswald font-bold">Pendente</SelectItem>
                  <SelectItem value="completed" className="text-[11px] uppercase Oswald font-bold">Cumprida</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label className="text-[10px] uppercase Oswald text-slate-500 dark:text-brand-silver font-black tracking-widest">Observações</Label>
              <Textarea 
                placeholder="Detalhes internos..."
                value={formData.admin_notes}
                onChange={(e) => setFormData(prev => ({ ...prev, admin_notes: e.target.value }))}
                className="bg-slate-50 dark:bg-brand-surface border-slate-200 dark:border-brand-border text-slate-900 dark:text-brand-white text-[11px] min-h-[80px] Oswald"
              />
            </div>
          </div>
          <DialogFooter className="flex-row gap-3 pt-2">
            <Button variant="ghost" className="flex-1 h-11 Oswald uppercase text-[10px] font-bold tracking-widest" onClick={() => setIsModalOpen(false)}>Cancelar</Button>
            <Button className="flex-1 h-11 bg-slate-900 dark:bg-brand-gold text-white dark:text-brand-blue Oswald uppercase font-black text-[10px] tracking-[0.1em] shadow-lg dark:shadow-brand-gold/10" onClick={handleCreate} disabled={busy}>
              {busy ? "Salvando..." : "Confirmar Registro"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <PlayerPhotoModal
        open={!!selectedPhoto}
        onOpenChange={(v: boolean) => !v && setSelectedPhoto(null)}
        player={selectedPhoto}
      />
      <AppConfirmDialog 
        open={confirmDelete.open}
        onOpenChange={(o) => setConfirmDelete({ open: o, id: null })}
        title={`Remover Registro - ${groupName}`}
        description={`Esta ação é permanente e afetará o histórico disciplinar do jogador em ${groupName}.`}
        variant="destructive"
        onConfirm={() => {
          if (confirmDelete.id) handleDelete(confirmDelete.id);
        }}
        confirmText="Excluir Permanentemente"
        cancelText="Manter Registro"
      />
    </div>
  );
}