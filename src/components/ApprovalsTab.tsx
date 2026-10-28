import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { useState, useMemo } from "react";
import { toast } from "sonner";
import { Search, MoreVertical, X, Users, CheckCircle, Info, Camera } from "lucide-react";
import { cn, formatPhoneForDisplay } from "@/lib/utils";
import { PlayerAvatar } from "@/components/PlayerAvatar";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { AppPromptDialog, AppConfirmDialog } from "@/components/AppDialogs";
import { friendlyError } from "@/lib/error-messages";
import { admin_list_pending_approvals, admin_process_group_request } from "@/lib/admin.functions";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, DropdownMenuSeparator } from "@/components/ui/dropdown-menu";

const ActionMenu = ({ p, onAction }: { p: any, onAction: (a: string) => void }) => {
    return (
        <DropdownMenu>
            <DropdownMenuTrigger asChild>
                                <Button variant="ghost" size="icon" className="h-8 w-8 text-slate-400 dark:text-brand-silver hover:text-slate-900 dark:hover:text-brand-white hover:bg-slate-100 dark:hover:bg-white/10">
                    <MoreVertical className="w-4 h-4" />
                </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="bg-white dark:bg-brand-surface border-slate-200 dark:border-brand-border text-slate-900 dark:text-brand-white min-w-[200px]">
                <DropdownMenuItem onClick={() => onAction('approve_pending')} className="text-[10px] uppercase font-bold focus:bg-emerald-50 dark:focus:bg-emerald-500/10 focus:text-emerald-600 dark:focus:text-emerald-400 cursor-pointer">
                    <CheckCircle className="w-3.5 h-3.5 mr-2" /> Aprovar pendentes
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => onAction('reject_pending')} className="text-[10px] uppercase font-bold focus:bg-red-50 dark:focus:bg-red-500/10 focus:text-red-600 dark:focus:text-red-400 cursor-pointer">
                    <X className="w-3.5 h-3.5 mr-2" /> Recusar pendentes
                </DropdownMenuItem>
                <DropdownMenuSeparator className="bg-slate-100 dark:bg-brand-border/40" />
                <DropdownMenuItem onClick={() => onAction('approve_all')} className="text-[10px] uppercase font-bold focus:bg-slate-50 dark:focus:bg-white/5 cursor-pointer">
                    <Users className="w-3.5 h-3.5 mr-2" /> Liberar todas turmas
                </DropdownMenuItem>
            </DropdownMenuContent>
        </DropdownMenu>
    )
}



export const ApprovalsTab = () => {

  const listFn = useServerFn(admin_list_pending_approvals);
  const processFn = useServerFn(admin_process_group_request);
  
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("pending");
  const [isRejecting, setIsRejecting] = useState<{ open: boolean; player: any | null; group: { id: string, name: string } | null; reason: string }>({
    open: false,
    player: null,
    group: null,
    reason: ""
  });
  const [confirmLib, setConfirmLib] = useState<{ open: boolean; player: any | null; group: { id: string, name: string } | null; action: "approve" | "remove" }>({
    open: false,
    player: null,
    group: null,
    action: "approve"
  });
  const [bulkConfirm, setBulkConfirm] = useState<{
    open: boolean;
    player: any | null;
    action: 'approve_pending' | 'reject_pending' | 'approve_all';
    targets: { key: string; name: string; id: string | undefined }[];
  }>({ open: false, player: null, action: 'approve_pending', targets: [] });
  
  const [busy, setBusy] = useState<Record<string, boolean>>({});

  const { data, isLoading, refetch, isError } = useQuery({ 
    queryKey: ["admin", "access-requests-v2", statusFilter, search], 
    queryFn: async () => {
        const res = await listFn({ data: { status: statusFilter as any, search } });
        console.log("[ACCESS AUDIT] Admin list response:", res);
        return res;
    },
    refetchInterval: 30000,
  });

  const players = data?.players || [];
  const groups = data?.groups;

  const handleProcess = async (player: any, groupId: string, groupName: string, status: "approved" | "rejected" | "suspended", reason?: string) => {
    const key = `${player.player_id}-${groupId}`;
    setBusy(prev => ({ ...prev, [key]: true }));
    try {
      await processFn({ data: { 
        player_id: player.player_id, 
        group_id: groupId, 
        status, 
        reason: reason || null 
      }});
      
      const statusText = status === 'approved' ? 'liberado' : status === 'rejected' ? 'recusado' : 'suspenso';
      toast.success(`Acesso à ${groupName} ${statusText} para ${player.name}.`);
      refetch();
    } catch (e: any) {
      const errMsg = e.message || "Erro desconhecido";
      console.error(`[DIAGNOSTIC] handleProcess failed:`, e);
      const msg = errMsg.includes('22P02') || errMsg.includes('invalid input value for enum')
        ? errMsg
        : friendlyError(errMsg);
      toast.error(`Falha: ${msg}`);
    } finally {
      setBusy(prev => ({ ...prev, [key]: false }));
      setIsRejecting({ open: false, player: null, group: null, reason: "" });
      setConfirmLib({ open: false, player: null, group: null, action: "approve" });
    }
  };

  const handleBulkAction = async (player: any, action: 'approve_pending' | 'reject_pending' | 'approve_all') => {
    const pgs = [
      { key: 'tuesday', name: 'Terça-feira', id: groups?.tuesday },
      { key: 'wednesday', name: 'Quarta-feira', id: groups?.wednesday },
      { key: 'thursday', name: 'Quinta-feira', id: groups?.thursday },
      { key: 'saturday', name: 'Sábado', id: groups?.saturday }
    ];

    let targets: { key: string, name: string, id: string | undefined }[] = [];
    if (action === 'approve_pending') {
      targets = pgs.filter(g => player[g.key]?.status === 'pending');
    } else if (action === 'reject_pending') {
      targets = pgs.filter(g => player[g.key]?.status === 'pending');
    } else if (action === 'approve_all') {
      targets = pgs;
    }

    if (targets.length === 0) return;

    // Exibir confirmação explícita antes de qualquer ação em lote
    setBulkConfirm({
      open: true,
      player,
      action,
      targets,
    });
  };

  const executeBulkAction = async () => {
    const { player, action, targets } = bulkConfirm;
    if (!player || targets.length === 0) return;

    const status = action === 'reject_pending' ? 'rejected' : 'approved';
    toast.info(`Processando ${targets.length} turma(s)...`);

    let successCount = 0;
    let failCount = 0;

    for (const target of targets) {
      if (!target.id) continue;
      const key = `${player.player_id}-${target.id}`;
      setBusy(prev => ({ ...prev, [key]: true }));
      try {
        await processFn({ data: { 
          player_id: player.player_id, 
          group_id: target.id, 
          status: status as any, 
          reason: null 
        }});
        successCount++;
      } catch (e: any) {
        failCount++;
        const errMsg = e.message || "Erro desconhecido";
        console.error(`[DIAGNOSTIC] Bulk approve failed for ${target.name}:`, e);
        const msg = errMsg.includes('22P02') || errMsg.includes('invalid input value for enum')
          ? errMsg
          : friendlyError(errMsg);
        toast.error(`Falha em ${target.name}: ${msg}`);
      } finally {
        setBusy(prev => ({ ...prev, [key]: false }));
      }
    }

    if (successCount > 0) {
      toast.success(`${successCount} turma(s) processada(s) com sucesso para ${player.name}.`);
      refetch();
    }
    if (failCount > 0) {
      toast.warning(`Houve ${failCount} falha(s). Verifique e tente novamente.`);
    }

    setIsRejecting({ open: false, player: null, group: null, reason: "" });
    setConfirmLib({ open: false, player: null, group: null, action: "approve" });
    setBulkConfirm({ open: false, player: null, action: 'approve_pending', targets: [] });
  };


  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'approved': return <Badge className="bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border-emerald-500/30 text-[11px] font-bold uppercase tracking-wider">Aprovado</Badge>;
      case 'pending': return <Badge className="bg-amber-500/15 text-amber-600 dark:text-amber-400 border-amber-500/30 text-[11px] font-bold uppercase tracking-wider animate-pulse">Pendente</Badge>;
      case 'rejected': return <Badge className="bg-red-500/15 text-red-600 dark:text-red-400 border-red-500/30 text-[11px] font-bold uppercase tracking-wider">Rejeitado</Badge>;
      case 'suspended': return <Badge className="bg-zinc-500/15 text-zinc-500 dark:text-zinc-400 border-zinc-500/30 text-[11px] font-bold uppercase tracking-wider">Suspenso</Badge>;
      default: return <span className="text-[11px] text-slate-400 dark:text-brand-silver/50 font-semibold uppercase">Não solicitado</span>;
    }
  };

  const calculateSituation = (p: any) => {
    const stats = [p.tuesday?.status, p.wednesday?.status, p.thursday?.status, p.saturday?.status];
    const pendings = stats.filter(s => s === 'pending').length;
    const approveds = stats.filter(s => s === 'approved').length;
    const rejecteds = stats.filter(s => s === 'rejected').length;

    if (approveds === stats.length) return "Todas as turmas liberadas";
    if (pendings === 0 && approveds === 0) return "Nenhuma solicitação";
    
    const parts = [];
    if (approveds > 0) parts.push(`${approveds} liberado${approveds > 1 ? 's' : ''}`);
    if (pendings > 0) parts.push(`${pendings} pendente${pendings > 1 ? 's' : ''}`);
    if (rejecteds > 0) parts.push(`${rejecteds} recusado${rejecteds > 1 ? 's' : ''}`);
    
    return parts.join(' e ');
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-white dark:bg-brand-surface/20 p-4 rounded-xl border border-slate-200 dark:border-brand-border shadow-sm dark:shadow-none">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-pink-50 dark:bg-brand-gold/10 border border-pink-100 dark:border-brand-gold/20 flex items-center justify-center shrink-0">
            <Users className="w-5 h-5 text-pink-600 dark:text-brand-gold" />
          </div>
          <div>
            <h3 className="text-sm font-black text-slate-900 dark:text-brand-white uppercase Oswald tracking-[0.1em]">
              Solicitações de Acesso
            </h3>
            <p className="text-[9px] text-slate-500 dark:text-brand-silver/50 uppercase font-bold tracking-widest">
              Dados globais de todas as turmas
            </p>
          </div>
        </div>
        <div className="grid grid-cols-2 sm:flex sm:flex-row items-stretch sm:items-center gap-2 sm:gap-4 mt-4 md:mt-0">
          <div className="flex flex-col items-center sm:items-start bg-slate-50 dark:bg-brand-surface/40 px-3 py-2 rounded-lg border border-slate-200 dark:border-brand-border min-w-[100px]">
            <span className="text-[9px] font-black uppercase text-slate-500 dark:text-brand-silver tracking-widest text-center sm:text-left">Jogadores<br/>(Base/Tela)</span>
            <span className="text-lg font-black text-slate-900 dark:text-brand-white leading-none mt-1">{data?.total_pending_players || 0} <span className="text-sm text-slate-400 dark:text-brand-silver/50">/ {players.length}</span></span>
          </div>
          <div className="flex flex-col items-center sm:items-start bg-amber-50 dark:bg-amber-500/10 px-3 py-2 rounded-lg border border-amber-200 dark:border-amber-500/20 min-w-[100px]">
            <span className="text-[9px] font-black uppercase text-amber-600 dark:text-amber-500/70 tracking-widest text-center sm:text-left">Solicitações<br/>(Base/Tela)</span>
            <span className="text-lg font-black text-amber-600 dark:text-amber-500 leading-none mt-1">{data?.total_pending_requests || 0} <span className="text-sm opacity-50">/ {players.reduce((acc: number, p: any) => acc + [p.tuesday?.status, p.wednesday?.status, p.thursday?.status, p.saturday?.status].filter((s: string) => s === 'pending').length, 0)}</span></span>
          </div>
        </div>
      </div>

      <div className="flex flex-col md:flex-row gap-4 mb-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400 dark:text-brand-silver/50" />
          <Input 
            placeholder="Buscar por nome ou WhatsApp..." 
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="pl-9 h-9 text-[14px] md:text-[16px] bg-white dark:bg-brand-surface/50 border-slate-200 dark:border-brand-border focus:border-pink-500 dark:focus:border-brand-gold shadow-sm dark:shadow-none" 
          />
        </div>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-full md:w-[200px] h-9 text-[14px] md:text-[16px] bg-slate-50 dark:bg-brand-surface/50 border-slate-200 dark:border-brand-border focus:ring-pink-500 dark:focus:ring-brand-gold text-slate-900 dark:text-brand-white">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent className="bg-white dark:bg-brand-surface border-slate-200 dark:border-brand-border text-slate-900 dark:text-brand-white">
            <SelectItem value="pending">Pendentes</SelectItem>
            <SelectItem value="all">Todos</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {players.length === 0 && !isLoading ? (
          <Card className="col-span-full p-16 text-center bg-white dark:bg-brand-surface/10 border-slate-200 dark:border-brand-border/20 shadow-sm dark:shadow-none">
            <div className="flex flex-col items-center justify-center gap-3">
              <div className="w-12 h-12 rounded-full bg-slate-50 dark:bg-brand-surface border border-slate-200 dark:border-brand-border flex items-center justify-center">
                <CheckCircle className="w-6 h-6 text-emerald-500/40" />
              </div>
              <div className="space-y-1">
                <p className="text-xs font-black Oswald text-slate-900 dark:text-brand-white uppercase tracking-widest">Nenhuma solicitação pendente</p>
                <p className="text-[10px] text-slate-500 dark:text-brand-silver font-bold Oswald uppercase tracking-wider">Tudo em dia com as turmas!</p>
              </div>
            </div>
          </Card>
        ) : players.map((p: any) => (
          <Card key={p.player_id} className="bg-white dark:bg-brand-surface/20 border-slate-200 dark:border-brand-border hover:border-pink-500/30 dark:hover:border-brand-gold/30 transition-all overflow-hidden group shadow-sm dark:shadow-none">
            <div className="p-4 flex items-start justify-between border-b border-slate-200 dark:border-brand-border/40 bg-slate-50 dark:bg-brand-surface/40">
              <div className="flex items-center gap-3">
                <PlayerAvatar path={p.avatar_path} name={p.name} size="md" />
                <div>
                  <h4 className="font-bold text-[16px] text-slate-900 dark:text-brand-white tracking-tight">{p.name}</h4>
                  <p className="text-[14px] text-slate-500 dark:text-brand-silver/80 font-mono">{formatPhoneForDisplay(p.phone)}</p>
                </div>
              </div>
              <ActionMenu p={p} onAction={(action: any) => handleBulkAction(p, action)} />
            </div>

            <div className="p-4 space-y-3">
              <div className="grid grid-cols-2 gap-2">
                {[
                  { key: 'tuesday', name: 'Terça', id: groups?.tuesday },
                  { key: 'wednesday', name: 'Quarta', id: groups?.wednesday },
                  { key: 'thursday', name: 'Quinta', id: groups?.thursday },
                  { key: 'saturday', name: 'Sábado', id: groups?.saturday }
                ].map(day => {
                  const dayData = p[day.key];
                  const isPending = dayData?.status === 'pending';
                  const isApproved = dayData?.status === 'approved';
                  const isBusy = busy[`${p.player_id}-${day.id}`];

                  return (
                    <div key={day.key} className={cn(
                      "flex flex-col items-center gap-1.5 p-2 rounded-lg border transition-all",
                      isPending ? "bg-amber-50 dark:bg-amber-500/5 border-amber-200 dark:border-amber-500/20" : 
                      isApproved ? "bg-emerald-50 dark:bg-emerald-500/5 border-emerald-200 dark:border-emerald-500/20" : 
                      "bg-slate-50 dark:bg-brand-surface/30 border-slate-200 dark:border-brand-border/50"
                    )}>
                      <span className="text-[12px] font-semibold text-slate-500 dark:text-brand-silver/70">{day.name}</span>
                      
                      <div className="relative group/check">
                        <input 
                          type="checkbox"
                          checked={isApproved}
                          disabled={isBusy || !day.id}
                          onChange={() => {
                            if (!day.id) return;
                            if (isPending) {
                              handleProcess(p, day.id, day.name, 'approved');
                            } else if (isApproved) {
                              setConfirmLib({ open: true, player: p, group: { id: day.id, name: day.name }, action: "remove" });
                            } else {
                              setConfirmLib({ open: true, player: p, group: { id: day.id, name: day.name }, action: "approve" });
                            }
                          }}
                          className={cn(
                            "w-5 h-5 rounded border-slate-300 dark:border-brand-border bg-white dark:bg-brand-surface/50 text-pink-600 dark:text-brand-gold focus:ring-pink-500/30 dark:focus:ring-brand-gold/30 cursor-pointer transition-all",
                            (isBusy || !day.id) && "opacity-50 animate-pulse"
                          )}
                        />
                        {isPending && day.id && (
                          <div 
                            onClick={() => setIsRejecting({ open: true, player: p, group: { id: day.id!, name: day.name }, reason: "" })}
                            className="absolute -top-1.5 -right-1.5 bg-red-500 text-white rounded-full p-0.5 cursor-pointer hover:bg-red-600 shadow-lg"
                          >
                            <X className="w-2.5 h-2.5" />
                          </div>
                        )}
                      </div>
                      {getStatusBadge(dayData?.status)}
                    </div>
                  );
                })}
              </div>

              <div className="flex items-center justify-between pt-2 border-t border-slate-200 dark:border-brand-border/20">
                <span className="text-[12px] font-medium text-slate-600 dark:text-brand-silver/90">
                  {calculateSituation(p)}
                </span>
                
                {Object.values(p).some((d: any) => d?.status === 'pending') && (
                  <Button 
                    size="sm" 
                    className="h-8 text-[12px] font-semibold bg-emerald-500 text-white hover:bg-emerald-600"
                    onClick={() => handleBulkAction(p, 'approve_pending')}
                  >
                    Aprovar tudo
                  </Button>
                )}
              </div>
            </div>
          </Card>
        ))}
      </div>

      <AppPromptDialog
        open={isRejecting.open}
        onOpenChange={(o) => setIsRejecting(prev => ({ ...prev, open: o }))}
        title="RECUSAR SOLICITAÇÃO"
        description={`Deseja recusar a solicitação de ${isRejecting.player?.name} para ${isRejecting.group?.name}?`}
        label="Observação opcional"
        onConfirm={(reason) => {
            if (isRejecting.player && isRejecting.group) {
                handleProcess(isRejecting.player, isRejecting.group.id, isRejecting.group.name, 'rejected', reason);
            }
        }}
      />

      <AppConfirmDialog
        open={bulkConfirm.open}
        onOpenChange={(o) => setBulkConfirm(prev => ({ ...prev, open: o }))}
        title={bulkConfirm.action === 'reject_pending' ? "RECUSAR EM LOTE" : "APROVAÇÃO EM LOTE"}
        variant={bulkConfirm.action === 'reject_pending' ? "destructive" : "default"}
        description={`Confirmar ${bulkConfirm.action === 'reject_pending' ? 'a recusa' : 'a aprovação'} para o jogador ${bulkConfirm.player?.name}? Turmas afetadas: ${bulkConfirm.targets.map(t => t.name).join(', ')}.`}
        onConfirm={executeBulkAction}
      />

      <AppConfirmDialog
        open={confirmLib.open}
        onOpenChange={(o) => setConfirmLib(prev => ({ ...prev, open: o }))}
        title={confirmLib.action === 'approve' ? "LIBERAR ACESSO" : "REMOVER ACESSO"}
        variant={confirmLib.action === 'approve' ? "default" : "destructive"}
        description={
            confirmLib.action === 'approve' 
                ? `${confirmLib.player?.name} não solicitou acesso à turma de ${confirmLib.group?.name}. Deseja liberar este acesso mesmo assim?`
                : `Deseja remover o acesso de ${confirmLib.player?.name} à turma de ${confirmLib.group?.name}?`
        }
        onConfirm={() => {
            if (confirmLib.player && confirmLib.group) {
                handleProcess(
                    confirmLib.player, 
                    confirmLib.group.id, 
                    confirmLib.group.name, 
                    confirmLib.action === 'approve' ? 'approved' : 'suspended'
                );
            }
        }}
      />
    </div>
  );
};



