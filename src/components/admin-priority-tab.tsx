import { useState, useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Search, Star, AlertTriangle, ChevronLeft, ChevronRight } from "lucide-react";
import { toast } from "sonner";
import { admin_list_global_priorities, admin_set_global_priority } from "@/lib/admin.functions";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { PlayerAvatar } from "@/components/PlayerAvatar";
import { formatPhoneForDisplay } from "@/lib/utils";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { friendlyError } from "@/lib/error-messages";

export function AdminPriorityTab() {
  const qc = useQueryClient();
  const listFn = useServerFn(admin_list_global_priorities);
  const setPriorityFn = useServerFn(admin_set_global_priority);
  
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("all");
  const [page, setPage] = useState(1);
  const pageSize = 30;
  const [loadingIds, setLoadingIds] = useState<Set<string>>(new Set());

  useEffect(() => { setPage(1); }, [search, filter]);
  
  const { data: result, isLoading, isError, error, refetch } = useQuery({
    queryKey: ["admin-global-priorities", search, filter, page],
    queryFn: async () => {
      return await listFn({ data: { search, filter, page, page_size: pageSize } });
    }
  });

  const players = (result?.players || []).filter((p: any) => !p.phone_normalized?.startsWith('GUEST-'));
  const totalPlayers = result?.total || 0;
  const totalPages = Math.ceil(totalPlayers / pageSize);
  
  const handleToggle = async (playerId: string, hasPriority: boolean) => {
    if (loadingIds.has(playerId)) return;
    
    setLoadingIds(prev => new Set(prev).add(playerId));
    const queryKey = ["admin-global-priorities", search, filter, page];
    const oldData = qc.getQueryData<any>(queryKey);

    qc.setQueryData(queryKey, (old: any) => {
      if (!old || !old.players) return old;
      return {
        ...old,
        players: old.players.map((p: any) => p.player_id === playerId ? { ...p, has_priority: hasPriority } : p)
      };
    });

    try {
      await setPriorityFn({
        data: { player_id: playerId, has_priority: hasPriority }
      });
      toast.success("Prioridade atualizada com sucesso.");
      await qc.invalidateQueries({ queryKey: ["admin-global-priorities"] });
    } catch (e: any) {
      if (oldData) {
        qc.setQueryData(queryKey, oldData);
      } else {
        await qc.invalidateQueries({ queryKey: ["admin-global-priorities"] });
      }
      toast.error(friendlyError(e));
    } finally {
      setLoadingIds(prev => {
        const next = new Set(prev);
        next.delete(playerId);
        return next;
      });
    }
  };

  const totalPriority = players?.filter((p: any) => p.has_priority).length || 0;

  return (
    <div className="space-y-6 pb-20">
      <div className="bg-emerald-500/10 border border-emerald-500/20 p-4 rounded-xl flex items-start gap-3">
        <Star className="w-5 h-5 text-emerald-500 shrink-0 mt-0.5" />
        <div>
          <h4 className="text-xs font-black text-brand-white Oswald uppercase tracking-wider mb-1">Prioridade Global</h4>
          <p className="text-[10px] text-brand-silver/70 leading-relaxed uppercase font-bold">
            A prioridade agora é <strong>global</strong> por jogador e independente de rateio ou turma. O seletor superior de turma não afeta esta aba.
          </p>
        </div>
      </div>

      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-brand-surface/20 p-4 rounded-xl border border-brand-border">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-brand-gold/10 border border-brand-gold/20 flex items-center justify-center shrink-0">
            <Star className="w-5 h-5 text-brand-gold" />
          </div>
          <div>
            <h3 className="text-sm font-black text-brand-white uppercase Oswald tracking-[0.1em]">
              Gestão de Prioridade
            </h3>
            <p className="text-[9px] text-brand-silver/50 uppercase font-bold tracking-widest">
              Prioridade global: válida em todas as turmas
            </p>
          </div>
        </div>
        <div className="flex items-center gap-4 mt-4 md:mt-0">
          {!isLoading && !isError && (
            <>
              <div className="flex flex-col items-center bg-brand-surface/40 px-3 py-2 rounded-lg border border-brand-border min-w-[80px]">
                <span className="text-[9px] font-black uppercase text-brand-silver tracking-widest text-center">Listados</span>
                <span className="text-lg font-black text-brand-white leading-none mt-1">{totalPlayers}</span>
              </div>
              <div className="flex flex-col items-center bg-brand-gold/10 px-3 py-2 rounded-lg border border-brand-gold/20 min-w-[80px]">
                <span className="text-[9px] font-black uppercase text-brand-gold/70 tracking-widest text-center">Nesta página</span>
                <span className="text-lg font-black text-brand-gold leading-none mt-1">{totalPriority}</span>
              </div>
            </>
          )}
        </div>
      </div>

      <div className="flex flex-col sm:flex-row gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-2.5 h-4 w-4 text-brand-silver/50" />
          <Input 
            placeholder="Buscar por nome ou WhatsApp..." 
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="pl-9 h-10 text-xs bg-brand-surface/50 border-brand-border focus:border-brand-gold" 
          />
        </div>
        <Select value={filter} onValueChange={setFilter}>
          <SelectTrigger className="w-full sm:w-[180px] h-10 text-xs bg-brand-surface/50 border-brand-border">
            <SelectValue placeholder="Filtro" />
          </SelectTrigger>
          <SelectContent className="bg-brand-surface border-brand-border text-brand-white">
            <SelectItem value="all">Todos</SelectItem>
            <SelectItem value="priority">Com Prioridade</SelectItem>
            <SelectItem value="no_priority">Sem Prioridade</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {isLoading ? (
          <p className="text-center p-8 text-brand-silver/50 col-span-full">Carregando jogadores...</p>
        ) : isError ? (
          <div className="text-center p-8 col-span-full space-y-4">
            <p className="text-red-500 font-medium break-all">Erro ao carregar jogadores: {error instanceof Error ? error.message : JSON.stringify(error)}</p>
            <Button onClick={() => refetch()} variant="outline" className="border-brand-border">Tentar Novamente</Button>
          </div>
        ) : players?.length === 0 ? (
          <p className="text-center p-8 text-brand-silver/50 col-span-full">Nenhum jogador encontrado.</p>
        ) : (
          players.map((p: any) => (
            <Card key={p.player_id} className="bg-brand-surface/20 border-brand-border hover:border-brand-gold/30 transition-all overflow-hidden p-4">
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-3 min-w-0">
                  <PlayerAvatar path={p.avatar_path} name={p.name} size="sm" />
                  <div className="min-w-0">
                    <h4 className="font-bold text-sm text-brand-white tracking-tight truncate">{p.name}</h4>
                    <p className="text-xs text-brand-silver/80 font-mono">{formatPhoneForDisplay(p.phone_normalized)}</p>
                  </div>
                </div>
                <div className="flex flex-col items-center gap-1 shrink-0">
                  <Switch 
                    checked={p.has_priority}
                    onCheckedChange={(val) => handleToggle(p.player_id, val)}
                    disabled={loadingIds.has(p.player_id)}
                    className="data-[state=checked]:bg-brand-gold"
                  />
                  <span className="text-[8px] font-black uppercase text-brand-silver tracking-widest">
                    {p.has_priority ? 'Com prioridade' : 'Sem prioridade'}
                  </span>
                </div>
              </div>
            </Card>
          ))
        )}
      </div>

      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-4 mt-6">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setPage(p => Math.max(1, p - 1))}
            disabled={page === 1}
            className="border-brand-border bg-brand-surface/40 hover:bg-brand-surface text-brand-silver"
          >
            <ChevronLeft className="w-4 h-4 mr-1" />
            Anterior
          </Button>
          <span className="text-xs font-bold text-brand-silver Oswald">
            Página {page} de {totalPages}
          </span>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setPage(p => Math.min(totalPages, p + 1))}
            disabled={page === totalPages}
            className="border-brand-border bg-brand-surface/40 hover:bg-brand-surface text-brand-silver"
          >
            Próxima
            <ChevronRight className="w-4 h-4 ml-1" />
          </Button>
        </div>
      )}
    </div>
  );
}
