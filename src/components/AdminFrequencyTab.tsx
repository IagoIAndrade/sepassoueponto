import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Search, History, Calendar, CheckCircle2, XCircle, HelpCircle, Copy, AlertTriangle } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { friendlyError } from "@/lib/error-messages";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { PlayerAvatar } from "@/components/PlayerAvatar";
import { admin_get_frequency_stats_fn, admin_get_player_attendance_history_fn } from "@/lib/attendance.functions";
import { admin_list_groups } from "@/lib/admin.functions";

export function AdminFrequencyTab() {
  const getStats = useServerFn(admin_get_frequency_stats_fn);
  const getHistory = useServerFn(admin_get_player_attendance_history_fn);
  const listGroups = useServerFn(admin_list_groups);

  const [search, setSearch] = useState("");
  const [groupId, setGroupId] = useState("all");
  const [page, setPage] = useState(1);
  const limit = 25;

  const [recentLimit, setRecentLimit] = useState(() => Number(localStorage.getItem('freq-recent') || '14'));
  const [attentionLimit, setAttentionLimit] = useState(() => Number(localStorage.getItem('freq-attention') || '29'));
  const [statusFilter, setStatusFilter] = useState("all");
  const [sortBy, setSortBy] = useState("days_desc");

  useEffect(() => {
    localStorage.setItem('freq-recent', recentLimit.toString());
  }, [recentLimit]);
  useEffect(() => {
    localStorage.setItem('freq-attention', attentionLimit.toString());
  }, [attentionLimit]);

  const [historyPlayer, setHistoryPlayer] = useState<any | null>(null);

  const { data: groupsData } = useQuery({
    queryKey: ["admin-groups-all"],
    queryFn: () => listGroups(),
  });

  const { data: statsData, isLoading, isError, error, refetch } = useQuery({
    queryKey: ["frequency-stats", groupId, search, page, recentLimit, attentionLimit, statusFilter, sortBy],
    queryFn: () => getStats({ data: { 
      group_id: groupId === "all" ? null : groupId, 
      search, page, limit, 
      recent_limit: recentLimit, 
      attention_limit: attentionLimit,
      status_filter: statusFilter,
      sort_by: sortBy
    } }),
    staleTime: 10000,
  });

  const { data: historyData, isLoading: historyLoading } = useQuery({
    queryKey: ["attendance-history", historyPlayer?.player_id],
    queryFn: () => getHistory({ data: { player_id: historyPlayer.player_id } }),
    enabled: !!historyPlayer,
  });

  const players = statsData?.players || [];
  const total = statsData?.total || 0;
  const firstRecorded = statsData?.first_recorded_date;
  const totalPages = Math.ceil(total / limit);

  const getStatus = (days: number | null) => {
    if (days === null) {
      return { label: "SEM PARTICIPAÇÃO", color: "text-zinc-400 bg-zinc-500/10 border-zinc-500/20" };
    }
    if (days <= recentLimit) {
      return { label: "PARTICIPAÇÃO RECENTE", color: "text-emerald-400 bg-emerald-500/10 border-emerald-500/20" };
    }
    if (days <= attentionLimit) {
      return { label: "ATENÇÃO", color: "text-amber-400 bg-amber-500/10 border-amber-500/20" };
    }
    return { label: "SEM PRESENÇA RECENTE", color: "text-[#F4149C] bg-[#F4149C]/10 border-[#F4149C]/20" };
  };

  const handleCopy = () => {
    if (!players.length) return;
    const lines = players.map(p => {
      const st = getStatus(p.days_since_last);
      const ult = p.last_presence_date ? new Date(p.last_presence_date).toLocaleDateString("pt-BR") : "Nenhuma vez";
      const dias = p.days_since_last !== null ? `${p.days_since_last} dias` : `Sem participação desde o início`;
      return `${p.name} - ${st.label} | Última: ${ult} (${dias})`;
    });
    const txt = `📋 REVISÃO DE FREQUÊNCIA:\n\n${lines.join("\n")}`;
    navigator.clipboard.writeText(txt).then(() => toast.success("Lista copiada!"));
  };

  return (
    <div className="space-y-6">
      <Card className="p-4 md:p-6 bg-brand-surface/20 border-brand-border space-y-4">
        <div className="flex flex-col md:flex-row gap-4 justify-between md:items-end">
          <div className="flex-1 space-y-1.5">
            <label className="text-[10px] font-black text-brand-silver uppercase Oswald tracking-widest">Busca</label>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-brand-silver/50" />
              <Input 
                placeholder="Nome ou WhatsApp..." 
                value={search}
                onChange={e => { setSearch(e.target.value); setPage(1); }}
                className="pl-9 h-10 text-xs bg-brand-surface border-brand-border focus-visible:ring-[#F4149C]/30"
              />
            </div>
          </div>
          
          <div className="w-full md:w-48 space-y-1.5">
            <label className="text-[10px] font-black text-brand-silver uppercase Oswald tracking-widest">Turma</label>
            <Select value={groupId} onValueChange={v => { setGroupId(v); setPage(1); }}>
              <SelectTrigger className="h-10 text-xs bg-brand-surface border-brand-border font-bold uppercase Oswald">
                <SelectValue placeholder="Todas as Turmas" />
              </SelectTrigger>
              <SelectContent className="bg-brand-surface border-brand-border text-brand-white">
                <SelectItem value="all" className="text-xs uppercase Oswald font-bold">Todas as Turmas</SelectItem>
                {(groupsData || []).map((g: any) => (
                  <SelectItem key={g.id} value={g.id} className="text-xs uppercase Oswald font-bold">{g.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="w-full md:w-32 space-y-1.5">
            <label className="text-[10px] font-black text-brand-silver uppercase Oswald tracking-widest">Situação</label>
            <Select value={statusFilter} onValueChange={v => { setStatusFilter(v); setPage(1); }}>
              <SelectTrigger className="h-10 text-xs bg-brand-surface border-brand-border font-bold uppercase Oswald">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="bg-brand-surface border-brand-border text-brand-white">
                <SelectItem value="all" className="text-xs uppercase Oswald font-bold">Todos</SelectItem>
                <SelectItem value="recent" className="text-xs uppercase Oswald font-bold text-emerald-400">Participação Recente</SelectItem>
                <SelectItem value="attention" className="text-xs uppercase Oswald font-bold text-amber-400">Atenção</SelectItem>
                <SelectItem value="absent" className="text-xs uppercase Oswald font-bold text-[#F4149C]">Sem Presença Recente</SelectItem>
                <SelectItem value="no_record" className="text-xs uppercase Oswald font-bold text-zinc-400">Sem Participação</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="w-full md:w-40 space-y-1.5">
            <label className="text-[10px] font-black text-brand-silver uppercase Oswald tracking-widest">Ordenar por</label>
            <Select value={sortBy} onValueChange={v => { setSortBy(v); setPage(1); }}>
              <SelectTrigger className="h-10 text-xs bg-brand-surface border-brand-border font-bold uppercase Oswald">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="bg-brand-surface border-brand-border text-brand-white">
                <SelectItem value="days_desc" className="text-xs uppercase Oswald font-bold">+ Dias Ausente</SelectItem>
                <SelectItem value="days_asc" className="text-xs uppercase Oswald font-bold">- Dias Ausente</SelectItem>
                <SelectItem value="name" className="text-xs uppercase Oswald font-bold">Ordem Alfabética</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="flex gap-2 w-full md:w-auto">
            <div className="w-full md:w-20 space-y-1.5">
              <label className="text-[10px] font-black text-emerald-400 uppercase Oswald tracking-widest">Recente (dias)</label>
              <Input 
                type="number" 
                value={recentLimit} 
                onChange={e => setRecentLimit(Number(e.target.value))}
                className="h-10 text-xs text-center font-bold bg-brand-surface border-emerald-500/30"
              />
            </div>
            <div className="w-full md:w-20 space-y-1.5">
              <label className="text-[10px] font-black text-amber-400 uppercase Oswald tracking-widest">Atenção (dias)</label>
              <Input 
                type="number" 
                value={attentionLimit} 
                onChange={e => setAttentionLimit(Number(e.target.value))}
                className="h-10 text-xs text-center font-bold bg-brand-surface border-amber-500/30"
              />
            </div>
          </div>
        </div>

        <div className="flex flex-col md:flex-row items-center justify-between gap-4 pt-4 border-t border-brand-border/30">
          <div className="flex flex-col md:flex-row items-start md:items-center gap-2">
            <div className="flex flex-col gap-1">
              <div className="text-[10px] text-brand-silver/50 uppercase font-bold tracking-widest flex items-center gap-2">
                <History className="w-3.5 h-3.5 shrink-0" />
                <span className="hidden md:inline">Início da contagem:</span>
                <span className="text-brand-white bg-white/5 px-2 py-0.5 rounded">{firstRecorded ? new Date(firstRecorded).toLocaleDateString('pt-BR') : '09/10/2026'}</span>
              </div>
              <p className="text-[9px] text-brand-silver/40 font-bold uppercase flex items-start gap-1"><HelpCircle className="w-3 h-3 shrink-0" /> Frequência baseada na lista final; não confirma presença física.</p>
            </div>
          </div>
          <Button variant="outline" size="sm" onClick={handleCopy} disabled={isLoading || isError || players.length === 0} className="h-8 text-[10px] font-bold uppercase Oswald border-[#F4149C]/30 text-[#F4149C] hover:bg-[#F4149C]/10 hover:text-[#F4149C] disabled:opacity-50 disabled:cursor-not-allowed">
            <Copy className="w-3.5 h-3.5 mr-2" /> Copiar para Revisão
          </Button>
        </div>
      </Card>

      {isError ? (
        <Card className="p-12 border-brand-border bg-brand-surface/20 flex flex-col items-center justify-center gap-4">
          <p className="text-red-400 font-bold Oswald uppercase">Erro ao carregar dados</p>
          <div className="text-brand-silver text-[10px] font-mono text-left max-w-xl bg-black/50 p-4 rounded overflow-auto whitespace-pre-wrap break-all">
            {error instanceof Error && error.message.startsWith('{') 
              ? JSON.stringify(JSON.parse(error.message), null, 2)
              : String(error)}
          </div>
          <Button onClick={() => refetch()} className="bg-brand-gold text-brand-blue uppercase font-bold text-[10px]">Tentar Novamente</Button>
        </Card>
      ) : isLoading ? (
        <Card className="p-12 border-brand-border bg-brand-surface/20 flex flex-col items-center justify-center gap-4">
          <div className="w-8 h-8 border-4 border-[#F4149C] border-t-transparent rounded-full animate-spin"></div>
        </Card>
      ) : players.length === 0 ? (
        <Card className="p-12 border-brand-border bg-brand-surface/20 text-center">
          <p className="text-brand-silver/60 text-sm font-bold Oswald uppercase tracking-widest">Nenhum jogador encontrado com estes filtros.</p>
        </Card>
      ) : (
        <div className="space-y-4">
          <div className="grid grid-cols-1 md:hidden gap-3">
            {players.map((p: any) => {
              const st = getStatus(p.days_since_last);
              return (
                <Card key={p.player_id} className="p-4 bg-brand-surface/30 border-brand-border cursor-pointer hover:border-[#F4149C]/30 transition-colors" onClick={() => setHistoryPlayer(p)}>
                  <div className="flex items-start gap-3">
                    <PlayerAvatar path={p.avatar_path} name={p.name} size="sm" />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-black text-brand-white Oswald uppercase truncate">{p.name}</p>
                      <div className="flex items-center gap-2 mt-1 flex-wrap">
                        <Badge variant="outline" className={cn("text-[9px] px-1.5 h-4 font-black tracking-widest", st.color)}>{st.label}</Badge>
                        {p.days_since_last !== null && (
                          <span className="text-[10px] text-brand-silver font-mono">
                            HÁ {p.days_since_last} DIAS
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                  <div className="mt-3 grid grid-cols-3 gap-2 bg-black/20 p-2 rounded-lg text-center">
                    <div><p className="text-[9px] text-brand-silver/50 uppercase font-black Oswald">30D</p><p className="text-xs text-brand-white font-bold">{p.presences_30d}</p></div>
                    <div><p className="text-[9px] text-brand-silver/50 uppercase font-black Oswald">60D</p><p className="text-xs text-brand-white font-bold">{p.presences_60d}</p></div>
                    <div><p className="text-[9px] text-brand-silver/50 uppercase font-black Oswald">90D</p><p className="text-xs text-brand-white font-bold">{p.presences_90d}</p></div>
                  </div>
                  {!p.active && (
                    <p className="text-[9px] text-red-500 font-bold uppercase mt-2 flex items-center gap-1"><XCircle className="w-3 h-3"/> Inativo</p>
                  )}
                </Card>
              )
            })}
          </div>

          <div className="hidden md:block overflow-x-auto border border-brand-border rounded-xl bg-brand-surface/30">
            <table className="w-full text-left">
              <thead className="bg-black/40 border-b border-brand-border">
                <tr>
                  <th className="px-4 py-3 text-[10px] font-black text-brand-silver uppercase Oswald tracking-widest">Jogador</th>
                  <th className="px-4 py-3 text-[10px] font-black text-brand-silver uppercase Oswald tracking-widest">Turmas</th>
                  <th className="px-4 py-3 text-[10px] font-black text-brand-silver uppercase Oswald tracking-widest text-center">Presenças (30/60/90)</th>
                  <th className="px-4 py-3 text-[10px] font-black text-brand-silver uppercase Oswald tracking-widest text-center">Dias Ausente</th>
                  <th className="px-4 py-3 text-[10px] font-black text-brand-silver uppercase Oswald tracking-widest text-right">Situação</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-brand-border/40">
                {players.map((p: any) => {
                  const st = getStatus(p.days_since_last);
                  return (
                    <tr key={p.player_id} className="hover:bg-white/5 cursor-pointer transition-colors" onClick={() => setHistoryPlayer(p)}>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-3">
                          <PlayerAvatar path={p.avatar_path} name={p.name} size="sm" />
                          <div>
                            <p className="text-xs font-black text-brand-white Oswald uppercase">{p.name}</p>
                            <p className="text-[10px] text-brand-silver font-mono">{p.phone_normalized}</p>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex flex-wrap gap-1 max-w-[120px]">
                          {(p.groups_array || []).map((g: string, i: number) => (
                            <Badge key={i} variant="outline" className="text-[8px] px-1.5 py-0 uppercase bg-white/5 text-brand-silver/80 border-white/10">{g}</Badge>
                          ))}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-center">
                        <div className="flex items-center justify-center gap-2 text-xs font-mono font-bold text-brand-silver">
                          <span className={p.presences_30d > 0 ? "text-brand-white" : "opacity-30"}>{p.presences_30d}</span><span className="opacity-30">/</span>
                          <span className={p.presences_60d > 0 ? "text-brand-white" : "opacity-30"}>{p.presences_60d}</span><span className="opacity-30">/</span>
                          <span className={p.presences_90d > 0 ? "text-brand-white" : "opacity-30"}>{p.presences_90d}</span>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-center">
                        {p.days_since_last !== null ? (
                          <span className="text-sm font-black Oswald text-brand-white">{p.days_since_last}</span>
                        ) : (
                          <span className="text-[9px] font-bold text-brand-silver/50 uppercase tracking-widest">Sem participação desde o início</span>
                        )}
                        {!p.active && <Badge variant="outline" className="ml-2 text-[8px] bg-red-500/10 text-red-500 border-red-500/20">INATIVO</Badge>}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <div className="flex flex-col items-end gap-1">
                          <Badge variant="outline" className={cn("text-[9px] uppercase px-2 h-5 font-black tracking-widest", st.color)}>{st.label}</Badge>
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>

          {totalPages > 1 && (
            <div className="flex items-center justify-between px-2">
              <span className="text-[10px] font-bold text-brand-silver uppercase Oswald tracking-widest">Página {page} de {totalPages}</span>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" onClick={() => setPage(p => p - 1)} disabled={page === 1} className="h-8 px-3 text-[10px] font-bold uppercase Oswald">Anterior</Button>
                <Button variant="outline" size="sm" onClick={() => setPage(p => p + 1)} disabled={page === totalPages} className="h-8 px-3 text-[10px] font-bold uppercase Oswald">Próximo</Button>
              </div>
            </div>
          )}
        </div>
      )}

      <Dialog open={!!historyPlayer} onOpenChange={o => !o && setHistoryPlayer(null)}>
        <DialogContent className="max-w-md bg-brand-surface border-brand-border">
          <DialogHeader>
            <DialogTitle className="text-lg font-black text-brand-white Oswald uppercase flex items-center gap-3">
              <Calendar className="w-5 h-5 text-[#F4149C]" />
              Histórico de Presenças
            </DialogTitle>
            <DialogDescription className="text-xs text-brand-silver font-bold uppercase tracking-widest">{historyPlayer?.name}</DialogDescription>
          </DialogHeader>
          <div className="mt-4 space-y-4">
            {historyLoading ? (
              <div className="flex justify-center p-8"><div className="w-6 h-6 border-2 border-[#F4149C] border-t-transparent rounded-full animate-spin"></div></div>
            ) : historyData?.length === 0 ? (
              <div className="text-center p-8 bg-white/5 rounded-xl border border-white/5">
                <p className="text-xs text-brand-silver/50 font-bold Oswald uppercase tracking-widest">Nenhuma inscrição finalizada encontrada.</p>
              </div>
            ) : (
              <div className="max-h-[50vh] overflow-y-auto pr-2 space-y-2 custom-scrollbar">
                {historyPlayer?.unverified_past_rounds > 0 && (
                  <div className="p-3 bg-amber-500/10 border border-amber-500/20 rounded-lg flex gap-2 items-start mb-4">
                    <AlertTriangle className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />
                    <p className="text-[10px] text-amber-500/90 font-bold uppercase leading-tight">
                      Atenção: Existem {historyPlayer.unverified_past_rounds} inscrições passadas sem conferência. A ausência de registro pode não refletir a realidade.
                    </p>
                  </div>
                )}
                {(historyData || []).map((h: any, i: number) => (
                  <div key={i} className="flex items-center justify-between p-3 bg-black/20 border border-brand-border/50 rounded-lg">
                    <div>
                      <p className="text-xs font-bold text-brand-white Oswald uppercase">{h.group_name}</p>
                      <p className="text-[10px] text-brand-silver font-mono">{new Date(h.event_date + "T12:00:00").toLocaleDateString('pt-BR')}</p>
                    </div>
                    <div>
                      {h.attendance_status === 'present' ? (
                        <Badge className="bg-emerald-500/10 text-emerald-400 border-emerald-500/30 text-[9px] uppercase font-black"><CheckCircle2 className="w-3 h-3 mr-1"/> Presente</Badge>
                      ) : h.attendance_status === 'absent' ? (
                        <Badge className="bg-red-500/10 text-red-400 border-red-500/30 text-[9px] uppercase font-black"><XCircle className="w-3 h-3 mr-1"/> Ausente</Badge>
                      ) : (
                        <Badge className="bg-zinc-500/10 text-zinc-400 border-zinc-500/30 text-[9px] uppercase font-black"><HelpCircle className="w-3 h-3 mr-1"/> Não Conferido</Badge>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
