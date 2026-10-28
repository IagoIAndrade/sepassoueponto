import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Search, RefreshCw, Trash2, Info } from "lucide-react";
import { toast } from "sonner";

import { cn, formatPhoneForDisplay } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { friendlyError } from "@/lib/error-messages";
import {
  admin_list_groups,
  admin_list_players_to_review,
  admin_save_reviewed_accesses_v2,
  admin_delete_player,
  type AdminGroup
} from "@/lib/admin.functions";
import { AppConfirmDialog } from "@/components/AppDialogs";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";


export function AcessosARevisarTab() {
  const list = useServerFn(admin_list_players_to_review);
  const save = useServerFn(admin_save_reviewed_accesses_v2);
  const getGroups = useServerFn(admin_list_groups);
  const deletePlayer = useServerFn(admin_delete_player);


  const [selectedChanges, setSelectedChanges] = useState<Record<string, Record<string, "approve" | "remove" | null>>>({});
  const [search, setSearch] = useState("");
  const [accessFilter, setAccessFilter] = useState("all");
  const [page, setPage] = useState(1);
  const [isSaving, setIsSaving] = useState(false);
  const [saveStatus, setSaveStatus] = useState<"idle" | "saving" | "saved">("idle");
  const [playerToDelete, setPlayerToDelete] = useState<any>(null);
  
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [batchDeleteConfirmOpen, setBatchDeleteConfirmOpen] = useState(false);
  const [isDeletingBatch, setIsDeletingBatch] = useState(false);

  useEffect(() => {
    setSelectedIds(new Set());
  }, [search, accessFilter, page]);


  const { data: playersRes, refetch, isLoading } = useQuery({
    queryKey: ["access-review", page, search, accessFilter],
    queryFn: () => list({ data: {
      search,
      page,
      page_size: 50,
      status: "active",
      access_filter: accessFilter,
      sort: "name_asc",
    } }),
  });

  const { data: groupsData } = useQuery<AdminGroup[]>({
    queryKey: ["admin-groups"],
    queryFn: () => getGroups({ data: undefined }),
  });

  const players = ((playersRes?.items ?? []) as any[]).filter(p => !p.phone_normalized?.startsWith('GUEST-'));
  const groups = (groupsData ?? []).filter((g) => g.active).sort((a, b) => a.sort_order - b.sort_order);

  const statusFor = (p: any, groupId: string) => {
    const g = playersRes?.groups as any;
    if (!g) return "none";
    if (groupId === g.tuesday) return p.tuesday_status;
    if (groupId === g.wednesday) return p.wednesday_status;
    if (groupId === g.thursday) return p.thursday_status;
    if (groupId === g.saturday) return p.saturday_status;
    return "none";
  };

  const toggleChange = (player_id: string, group_id: string, currentStatus: string) => {
    const isApproved = currentStatus === "approved";
    const pendingChange = selectedChanges[player_id]?.[group_id];
    const nextAction: "approve" | "remove" | null = pendingChange ? null : (isApproved ? "remove" : "approve");

    setSelectedChanges(prev => ({
      ...prev,
      [player_id]: { ...(prev[player_id] || {}), [group_id]: nextAction },
    }));
  };

  const pendingCount = Object.values(selectedChanges).reduce(
    (acc, groupsMap) => acc + Object.values(groupsMap).filter(Boolean).length,
    0
  );

  const handleBulkSave = async () => {
    const playerIds = Object.keys(selectedChanges);
    if (playerIds.length === 0) return;

    setIsSaving(true);
    setSaveStatus("saving");
    try {
      const actions: { player_ids: string[]; group_ids: string[]; action: "approve" | "remove" }[] = [];

      for (const pId of playerIds) {
        const playerChanges = selectedChanges[pId];
        if (!playerChanges) continue;
        for (const gId in playerChanges) {
          const action = playerChanges[gId];
          if (!action) continue;
          const existing = actions.find(a => a.action === action && a.group_ids.includes(gId));
          if (existing) {
            if (!existing.player_ids.includes(pId)) existing.player_ids.push(pId);
          } else {
            actions.push({ player_ids: [pId], group_ids: [gId], action });
          }
        }
      }

      for (const task of actions) {
        await save({ data: task });
      }

      toast.success("Alterações salvas com sucesso!");
      setSelectedChanges({});
      setSaveStatus("saved");
      setTimeout(() => setSaveStatus("idle"), 3000);
      refetch();
    } catch (e: any) {
      toast.error(friendlyError(e?.message ?? e));
      setSaveStatus("idle");
    } finally {
      setIsSaving(false);
    }
  };

  const currentPageIds = players.map(p => p.id);
  const isAllSelected = currentPageIds.length > 0 && currentPageIds.every(id => selectedIds.has(id));
  const isSomeSelected = currentPageIds.some(id => selectedIds.has(id)) && !isAllSelected;

  const handleSelectAll = () => {
    const next = new Set(selectedIds);
    if (isAllSelected) {
      currentPageIds.forEach(id => next.delete(id));
    } else {
      currentPageIds.forEach(id => next.add(id));
    }
    setSelectedIds(next);
  };

  const toggleSelect = (id: string) => {
    const next = new Set(selectedIds);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelectedIds(next);
  };

  const handleBatchDelete = async () => {
    if (selectedIds.size === 0) return;
    setIsDeletingBatch(true);
    
    const promises = Array.from(selectedIds).map(id => 
      deletePlayer({ data: { player_id: id } }).then(() => id)
    );
    
    const results = await Promise.allSettled(promises);
    
    const successes = results.filter(r => r.status === "fulfilled").map(r => (r as PromiseFulfilledResult<string>).value);
    const failures = results.filter(r => r.status === "rejected");
    
    if (failures.length === 0) {
      toast.success(`${successes.length} jogadores excluídos com sucesso!`);
      setSelectedIds(new Set());
    } else {
      toast.error(`Atenção: ${failures.length} falharam. ${successes.length} excluídos com sucesso.`);
      const failedIds = new Set(selectedIds);
      successes.forEach(id => failedIds.delete(id));
      setSelectedIds(failedIds);
    }
    
    setBatchDeleteConfirmOpen(false);
    setIsDeletingBatch(false);
    refetch();
  };

  const handleDeletePlayer = async () => {
    if (!playerToDelete) return;
    const p = playerToDelete;
    
    try {
      await deletePlayer({ data: { player_id: p.id } });
      toast.success("Jogador excluído com sucesso!");
      refetch();
    } catch (e: any) {
      toast.error(friendlyError(e?.message ?? e));
    } finally {
      setPlayerToDelete(null);
    }
  };


  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-brand-surface/20 p-4 rounded-xl border border-brand-border">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-brand-gold/10 border border-brand-gold/20 flex items-center justify-center shrink-0">
            <Search className="w-5 h-5 text-brand-gold" />
          </div>
          <div>
            <h3 className="text-sm font-black text-brand-white uppercase Oswald tracking-[0.1em]">
              Revisar Vínculos
            </h3>
            <p className="text-[9px] text-brand-silver/50 uppercase font-bold tracking-widest">
              Dados globais de todas as turmas
            </p>
          </div>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-2 flex-1 md:flex-none mt-4 md:mt-0">
          <div className="bg-brand-surface/20 border border-brand-border px-3 py-1.5 rounded-lg text-center min-w-[70px]">
            <p className="text-[8px] text-brand-silver font-black uppercase tracking-tighter">Jogadores (Total)</p>
            <p className="text-sm font-black text-brand-white">{playersRes?.total || 0}</p>
          </div>
          <div className="bg-amber-500/5 border border-amber-500/20 px-3 py-1.5 rounded-lg text-center min-w-[70px]">
            <p className="text-[8px] text-amber-500 font-black uppercase tracking-tighter">Com Pendências</p>
            <p className="text-sm font-black text-amber-500">{players.filter((p: any) => p.has_pending_request).length} <span className="text-[10px] opacity-50">na tela</span></p>
          </div>
          <div className="bg-emerald-500/5 border border-emerald-500/20 px-3 py-1.5 rounded-lg text-center min-w-[70px]">
            <p className="text-[8px] text-emerald-500 font-black uppercase tracking-tighter">Com Acesso Ativo</p>
            <p className="text-sm font-black text-emerald-500">{players.filter((p: any) => p.total_approved_groups > 0).length} <span className="text-[10px] opacity-50">na tela</span></p>
          </div>
          <div className="bg-brand-surface/20 border border-brand-border px-3 py-1.5 rounded-lg text-center min-w-[70px]">
            <p className="text-[8px] text-brand-silver font-black uppercase tracking-tighter">Sem Acesso</p>
            <p className="text-sm font-black text-brand-white">{players.filter((p: any) => p.total_approved_groups === 0).length} <span className="text-[10px] opacity-50">na tela</span></p>
          </div>
        </div>
      </div>

      <div className="flex flex-col md:flex-row gap-4 mb-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-2.5 h-4 w-4 text-brand-silver/50" />
          <Input
            placeholder="Buscar por nome ou WhatsApp..."
            value={search}
            onChange={e => { setSearch(e.target.value); setPage(1); }}
            className="pl-9 h-9 text-xs bg-brand-surface/50 border-brand-border focus:border-brand-gold"
          />
        </div>
        <div className="flex items-center justify-between md:justify-end gap-2 w-full md:w-auto">
          <span className="text-xs text-brand-silver font-medium ml-2 md:ml-0 whitespace-nowrap">
            {players.length} de {playersRes?.total || 0}
          </span>
          <Select value={accessFilter} onValueChange={v => { setAccessFilter(v); setPage(1); }}>
            <SelectTrigger className="w-full md:w-[150px] h-9 text-[10px] uppercase font-black tracking-widest bg-brand-surface/50 border-brand-border focus:ring-brand-gold">
              <SelectValue placeholder="Acesso" />
            </SelectTrigger>
            <SelectContent className="bg-brand-surface border-brand-border text-brand-white">
              <SelectItem value="all" className="text-[10px] uppercase font-bold">Todos</SelectItem>
              <SelectItem value="pending" className="text-[10px] uppercase font-bold text-amber-500">Pendentes</SelectItem>
              <SelectItem value="no_access" className="text-[10px] uppercase font-bold text-brand-silver">Sem Acesso</SelectItem>
              <SelectItem value="has_access" className="text-[10px] uppercase font-bold text-emerald-500">Com Acesso</SelectItem>
            </SelectContent>
          </Select>
          <Button
            variant="outline"
            size="icon"
            onClick={() => refetch()}
            className="h-9 w-9 border-brand-border bg-brand-surface/50"
          >
            <RefreshCw className={cn("w-4 h-4 text-brand-silver", isLoading && "animate-spin")} />
          </Button>
        </div>
      </div>

      <TooltipProvider>
        {/* DESKTOP TABLE */}
        <div className="hidden md:block bg-brand-surface/20 border border-brand-border rounded-lg overflow-auto max-h-[600px] custom-scrollbar">
          <table className="w-full text-[14px] text-brand-white relative">
            <thead className="bg-brand-surface border-b border-brand-border sticky top-0 z-10 shadow-sm">
              <tr>
                <th className="p-4 text-center w-[50px]">
                  <input
                    type="checkbox"
                    checked={isAllSelected}
                    ref={input => { if (input) input.indeterminate = isSomeSelected; }}
                    onChange={handleSelectAll}
                    className="w-4 h-4 rounded border-brand-border bg-brand-surface/50 text-brand-gold cursor-pointer"
                  />
                </th>
                <th className="p-4 text-left text-[12px] font-semibold text-brand-silver/80">Nome do Jogador</th>
                {groups.map((g: any) => (
                  <th key={g.id} className="p-4 text-center text-[12px] font-semibold text-brand-silver/80">{g.name}</th>
                ))}
                <th className="p-4 text-center text-[12px] font-semibold text-brand-silver/80 w-[80px]">Ações</th>
              </tr>
            </thead>
            <tbody>
              {players.map((p: any) => (
                <tr key={p.id} className="border-b border-brand-border/30 hover:bg-brand-surface/40 transition-colors">
                  <td className="p-4 text-center">
                    <input
                      type="checkbox"
                      checked={selectedIds.has(p.id)}
                      onChange={() => toggleSelect(p.id)}
                      className="w-4 h-4 rounded border-brand-border bg-brand-surface/50 text-brand-gold cursor-pointer"
                    />
                  </td>
                  <td className="p-4">
                    <p className="font-semibold text-brand-white tracking-tight truncate max-w-[250px]">{p.name}</p>
                    <p className="text-[13px] text-brand-silver/70 font-mono mt-0.5">{formatPhoneForDisplay(p.phone_normalized) || "Sem WhatsApp"}</p>
                  </td>
                  {groups.map((g: any) => {
                    const status = statusFor(p, g.id);
                    const pendingChange = selectedChanges[p.id]?.[g.id];
                    const isApproved = pendingChange ? pendingChange === "approve" : status === "approved";
                    const isPending = status === "pending";

                    return (
                      <td key={g.id} className="p-4 text-center">
                        <div className="flex flex-col items-center justify-center gap-2">
                          <input
                            type="checkbox"
                            checked={isApproved}
                            disabled={isSaving}
                            aria-label={`Acesso de ${p.name} na turma ${g.name}`}
                            onChange={() => toggleChange(p.id, g.id, status)}
                            className={cn(
                              "w-6 h-6 rounded border-brand-border bg-brand-surface/50 text-brand-gold cursor-pointer transition-all",
                              pendingChange && "ring-2 ring-brand-gold ring-offset-2 ring-offset-brand-background",
                              isSaving && "opacity-50 cursor-not-allowed"
                            )}
                          />
                          {isPending && (
                            <Badge className="bg-amber-500/10 text-amber-500 border-amber-500/20 text-[10px] px-1.5 h-4 font-semibold uppercase">Solicitou</Badge>
                          )}
                        </div>
                      </td>
                    );
                  })}
                  <td className="p-4 text-center">
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button
                          variant="ghost"
                          size="icon"
                          disabled={isSaving}
                          onClick={() => setPlayerToDelete(p)}
                          className="h-9 w-9 text-red-400 hover:text-red-300 hover:bg-red-500/10 transition-colors"
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent className="bg-red-600 text-white border-red-700">
                        Excluir Cadastro Permanentemente
                      </TooltipContent>
                    </Tooltip>
                  </td>
                </tr>
              ))}
              {players.length === 0 && !isLoading && (
                <tr>
                  <td colSpan={groups.length + 3} className="py-16 text-center bg-brand-surface/10 border-brand-border/20">
                    <div className="flex flex-col items-center justify-center gap-3">
                      <div className="w-12 h-12 rounded-full bg-brand-surface border border-brand-border flex items-center justify-center">
                        <Search className="w-6 h-6 text-brand-silver/40" />
                      </div>
                      <div className="space-y-1">
                        <p className="text-xs font-black Oswald text-brand-white uppercase tracking-widest">Nenhum jogador encontrado</p>
                        <p className="text-[10px] text-brand-silver font-bold Oswald uppercase tracking-wider">Tente ajustar os filtros acima.</p>
                      </div>
                    </div>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* MOBILE CARDS */}
        <div className="md:hidden space-y-4">
          {players.map((p: any) => (
            <div key={p.id} className="bg-brand-surface/20 border border-brand-border rounded-xl p-4 space-y-4">
              <div className="flex justify-between items-start">
                <div className="flex items-start gap-3">
                  <div className="mt-1">
                    <input
                      type="checkbox"
                      checked={selectedIds.has(p.id)}
                      onChange={() => toggleSelect(p.id)}
                      className="w-5 h-5 rounded border-brand-border bg-brand-surface/50 text-brand-gold cursor-pointer"
                    />
                  </div>
                  <div>
                    <p className="font-semibold text-[16px] text-brand-white tracking-tight">{p.name}</p>
                    <p className="text-[13px] text-brand-silver/70 font-mono mt-0.5">{formatPhoneForDisplay(p.phone_normalized) || "Sem WhatsApp"}</p>
                  </div>
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  disabled={isSaving}
                  onClick={() => setPlayerToDelete(p)}
                  className="h-9 w-9 text-red-400 hover:text-red-300 hover:bg-red-500/10 transition-colors shrink-0"
                >
                  <Trash2 className="w-4 h-4" />
                </Button>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 border-t border-brand-border/30 pt-3">
                {groups.map((g: any) => {
                  const status = statusFor(p, g.id);
                  const pendingChange = selectedChanges[p.id]?.[g.id];
                  const isApproved = pendingChange ? pendingChange === "approve" : status === "approved";
                  const isPending = status === "pending";

                  return (
                    <div key={g.id} className="flex flex-col items-center gap-2 p-2 bg-brand-surface/30 rounded-lg border border-brand-border/50">
                      <span className="text-[11px] font-semibold text-brand-silver/80 text-center">{g.name}</span>
                      <input
                        type="checkbox"
                        checked={isApproved}
                        disabled={isSaving}
                        aria-label={`Acesso de ${p.name} na turma ${g.name}`}
                        onChange={() => toggleChange(p.id, g.id, status)}
                        className={cn(
                          "w-6 h-6 rounded border-brand-border bg-brand-surface/50 text-brand-gold cursor-pointer transition-all",
                          pendingChange && "ring-2 ring-brand-gold ring-offset-2 ring-offset-brand-background",
                          isSaving && "opacity-50 cursor-not-allowed"
                        )}
                      />
                      {isPending && (
                        <span className="text-[10px] font-semibold text-amber-500 uppercase">Solicitou</span>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
          {players.length === 0 && !isLoading && (
            <div className="py-16 text-center bg-brand-surface/10 border border-brand-border/20 rounded-xl">
              <div className="flex flex-col items-center justify-center gap-3">
                <div className="w-12 h-12 rounded-full bg-brand-surface border border-brand-border flex items-center justify-center">
                  <Search className="w-6 h-6 text-brand-silver/40" />
                </div>
                <div className="space-y-1">
                  <p className="text-xs font-black Oswald text-brand-white uppercase tracking-widest">Nenhum jogador encontrado</p>
                  <p className="text-[10px] text-brand-silver font-bold Oswald uppercase tracking-wider">Tente ajustar os filtros acima.</p>
                </div>
              </div>
            </div>
          )}
        </div>
      </TooltipProvider>

      <AppConfirmDialog 
        open={!!playerToDelete}
        onOpenChange={(o) => !o && setPlayerToDelete(null)}
        title="Excluir Jogador"
        description={`Deseja realmente EXCLUIR o jogador ${playerToDelete?.name}? Esta ação é irreversível e removerá o jogador de todas as turmas, listas, times e histórico.`}
        variant="destructive"
        onConfirm={handleDeletePlayer}
        confirmText="Excluir Permanentemente"
      />

      <AppConfirmDialog 
        open={batchDeleteConfirmOpen}
        onOpenChange={(o) => !o && !isDeletingBatch && setBatchDeleteConfirmOpen(false)}
        title="Excluir Selecionados"
        description={`Deseja realmente EXCLUIR os ${selectedIds.size} jogadores selecionados? Esta ação é irreversível e removerá os vínculos dos jogadores com todas as turmas, listas, times e histórico. A conta em si não é deletada, apenas os vínculos e dados do jogador no sistema. O alcance desta operação é GLOBAL e afetará todas as turmas. Jogadores afetados: ${players.filter((p: any) => selectedIds.has(p.id)).map((p: any) => p.name).join(", ")}`}
        variant="destructive"
        onConfirm={handleBatchDelete}
        confirmText={isDeletingBatch ? "Excluindo..." : "Excluir Selecionados"}
        isLoading={isDeletingBatch}
      />

      {selectedIds.size > 0 && (
        <div className="sticky bottom-[88px] md:bottom-20 flex items-center justify-between gap-4 bg-brand-surface border border-red-500/40 rounded-xl p-4 shadow-lg z-40 mb-4">
          <div className="flex items-center gap-2">
            <p className="text-xs text-brand-white font-bold">
              {selectedIds.size} selecionado(s)
            </p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" className="h-9 text-[10px] border-brand-border" onClick={() => setSelectedIds(new Set())}>
              Limpar seleção
            </Button>
            <Button
              size="sm"
              disabled={isDeletingBatch}
              onClick={() => setBatchDeleteConfirmOpen(true)}
              className="h-9 text-[10px] bg-red-600 hover:bg-red-700 text-white font-black uppercase tracking-widest"
            >
              Excluir selecionados
            </Button>
          </div>
        </div>
      )}

      {pendingCount > 0 && (
        <div className="sticky bottom-4 flex items-center justify-between gap-4 bg-brand-surface border border-brand-gold/40 rounded-xl p-4 shadow-lg">
          <div className="flex items-center gap-2">
            <p className="text-xs text-brand-white font-bold">
              {pendingCount} alteração(ões) pendente(s)
            </p>
            {saveStatus === "saved" && (
                <Badge className="bg-emerald-500/10 text-emerald-500 border-emerald-500/20 text-[8px] uppercase font-black">Salvo</Badge>
            )}
            {saveStatus === "saving" && (
                <Badge className="bg-brand-gold/10 text-brand-gold border-brand-gold/20 text-[8px] uppercase font-black animate-pulse">Salvando...</Badge>
            )}
          </div>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" className="h-9 text-[10px] border-brand-border" onClick={() => setSelectedChanges({})}>
              Descartar
            </Button>
            <Button
              size="sm"
              disabled={isSaving}
              onClick={handleBulkSave}
              className="h-9 text-[10px] bg-brand-gold text-brand-blue font-black uppercase tracking-widest"
            >
              {isSaving ? "Salvando..." : "Salvar alterações"}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
