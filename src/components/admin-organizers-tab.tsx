import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Search, ShieldCheck, UserMinus, ArrowUp, ArrowDown, Shield, User, Info } from "lucide-react";
import { toast } from "sonner";
import { useAdminGroup } from "@/lib/admin-group-context";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { AppConfirmDialog } from "@/components/AppDialogs";
import { friendlyError } from "@/lib/error-messages";
import { cn } from "@/lib/utils";
import { 
  admin_get_organizers,
  admin_list_eligible_organizers,
  admin_set_organizer_status,
  admin_reorder_organizers
} from "@/lib/admin-extra.functions";

export function OrganizersTab() {
  const { groupId } = useAdminGroup();
  const getOrganizers = useServerFn(admin_get_organizers);
  const listEligible = useServerFn(admin_list_eligible_organizers);
  const setStatus = useServerFn(admin_set_organizer_status);
  const reorder = useServerFn(admin_reorder_organizers);
  
  const [search, setSearch] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [confirmDialog, setConfirmDialog] = useState<{ open: boolean; title: string; description: string; onConfirm: () => void; variant?: "default" | "destructive" }>({
    open: false, title: "", description: "", onConfirm: () => {},
  });
  const [itemToRemove, setItemToRemove] = useState<{
    player_id: string;
    name: string;
    group_id: string;
  } | null>(null);
  const [editingGroupId, setEditingGroupId] = useState<string | null>(groupId || null);

  useEffect(() => {
    setConfirmDialog(prev => ({ ...prev, open: false }));
    setItemToRemove(null);
    setSearch("");
    setEditingGroupId(groupId || null);
  }, [groupId]);

  const organizersQ = useQuery({
    queryKey: ["admin-organizers", groupId],
    queryFn: () => getOrganizers({ data: { group_id: groupId! } }),
    enabled: !!groupId,
  });

  const eligibleQ = useQuery({
    queryKey: ["admin-eligible-organizers", groupId, search],
    queryFn: () => listEligible({ data: { group_id: groupId!, search } }),
    enabled: !!groupId,
  });

  const handleAdd = async (playerId: string, organizers: any[]) => {
    const actionGroupId = groupId;
    if (actionGroupId !== editingGroupId) {
       toast.error(`Turma alterada. Operação cancelada.`);
       return;
    }
    const currentCount = organizers.length;
    const maxOrder = organizers.length > 0 ? Math.max(...organizers.map(o => o.organizer_order || 0)) : 0;
    const nextOrder = maxOrder + 1;

    if (currentCount >= 18) {
      toast.error("Máximo de 18 organizadores atingido.");
      return;
    }
    setBusy(playerId);
    try {
      await setStatus({ data: { player_id: playerId, group_id: actionGroupId!, is_organizer: true, order: nextOrder } });
      if (groupId === actionGroupId) {
        toast.success("Organizador adicionado");
        organizersQ.refetch();
        eligibleQ.refetch();
      }
    } catch (e: any) {
      console.error("[ADD ORGANIZER ERROR]", {
        message: e.message,
        code: e.code,
        details: e.details,
        hint: e.hint,
        player_id: playerId,
        group_id: actionGroupId
      });
      if (groupId === actionGroupId) toast.error(friendlyError(e.message));
    } finally {
      if (groupId === actionGroupId) setBusy(null);
    }
  };

  const confirmRemove = async () => {
    const actionGroupId = groupId;
    if (!itemToRemove || !itemToRemove.player_id || !itemToRemove.group_id) {
       toast.error("Erro: Identificadores ausentes.");
       return;
    }
    if (itemToRemove.group_id !== actionGroupId || actionGroupId !== editingGroupId) {
       toast.error(`Turma alterada. Operação cancelada.`);
       setConfirmDialog(prev => ({ ...prev, open: false }));
       setItemToRemove(null);
       return;
    }
    setBusy(itemToRemove.player_id);
    try {
      await setStatus({ data: { player_id: itemToRemove.player_id, group_id: actionGroupId!, is_organizer: false } });
      if (groupId === actionGroupId) {
        toast.success("Organizador removido");
        organizersQ.refetch();
        eligibleQ.refetch();
        setConfirmDialog(prev => ({ ...prev, open: false }));
      }
    } catch (e: any) {
      if (groupId === actionGroupId) toast.error(friendlyError(e.message));
    } finally {
      if (groupId === actionGroupId) {
        setBusy(null);
        setItemToRemove(null);
      }
    }
  };

  const handleRemove = (player: any) => {
    const pId = player.player_id || player.id;
    const pName = player.players?.name || player.name || "Jogador";
    
    setItemToRemove({
      player_id: pId,
      name: pName,
      group_id: groupId!
    });

    setConfirmDialog({
      open: true,
      title: `Remover da Organização - ${groupName}`,
      description: `Deseja remover o status de organizador de ${pName} nesta turma? Isso não exclui o jogador da turma nem de sua conta, apenas retira a prioridade nas rodadas.`,
      variant: "destructive",
      onConfirm: () => {}
    });
  };

  const handleMove = async (currentIndex: number, direction: 'up' | 'down') => {
    const actionGroupId = groupId;
    if (actionGroupId !== editingGroupId) {
       toast.error(`Turma alterada. Operação cancelada.`);
       return;
    }
    const targetIndex = direction === 'up' ? currentIndex - 1 : currentIndex + 1;
    const currentOrganizers = organizersQ.data?.organizers || [];
    if (targetIndex < 0 || targetIndex >= currentOrganizers.length) return;

    const newOrganizers = [...currentOrganizers];
    [newOrganizers[currentIndex], newOrganizers[targetIndex]] = [newOrganizers[targetIndex], newOrganizers[currentIndex]];

    setBusy("reorder");
    try {
      await reorder({
        data: {
          group_id: actionGroupId!,
          orders: newOrganizers.map((p, idx) => ({ player_id: p.player_id, order: idx + 1 }))
        }
      });
      if (groupId === actionGroupId) {
        organizersQ.refetch();
      }
    } catch (e: any) {
      if (groupId === actionGroupId) toast.error(friendlyError(e.message));
    } finally {
      if (groupId === actionGroupId) setBusy(null);
    }
  };

  const organizers = organizersQ.data?.organizers || [];
  const eligible = eligibleQ.data?.players || [];
  
  const { groups } = useAdminGroup() as any;
  const groupName = (groups?.find((g: any) => g.id === groupId)?.name || "TURMA").toUpperCase();

  return (
    <div className="space-y-6 pb-20">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-end gap-4">
        <div className="space-y-1">
          <h3 className="text-xl md:text-2xl font-black text-slate-900 dark:text-brand-white Oswald uppercase tracking-tight flex items-center gap-2">
            Prioridade da <span className="text-pink-600 dark:text-brand-gold">Organização</span>
            <span className="text-xs text-slate-500 dark:text-brand-silver/50 ml-2 border-l border-slate-300 dark:border-brand-border/50 pl-2">Turma: {groupName}</span>
          </h3>
          <p className="text-[10px] text-brand-silver uppercase font-bold tracking-widest flex items-center gap-1">
            <Info className="w-3 h-3 text-brand-gold" />
            Organizadores entram com prioridade absoluta no topo da lista
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">
        {/* LISTA DE ORGANIZADORES ATUAIS */}
        <Card className="p-0 overflow-hidden bg-white dark:bg-[#020B1B]/40 border-slate-200 dark:border-brand-border/50 backdrop-blur-sm shadow-sm dark:shadow-xl">
          <div className="p-4 border-b border-slate-200 dark:border-brand-border/50 bg-slate-50 dark:bg-white/5 flex justify-between items-center">
            <h4 className="text-[10px] font-black text-pink-600 dark:text-brand-gold uppercase tracking-widest flex items-center gap-2">
              <ShieldCheck className="w-4 h-4" /> Ordem de Prioridade
            </h4>
            <Badge variant="outline" className="text-[9px] border-brand-gold/30 text-brand-gold font-mono px-2 py-0.5">
              {organizers.length}/18 Vagas
            </Badge>
          </div>
          
          <div className="p-3 space-y-2">
            {organizers.map((p: any, idx: number) => {
              const isTop3 = idx < 3;
              return (
                <div 
                  key={p.player_id} 
                  className={cn(
                    "flex items-center justify-between bg-brand-surface/30 border rounded-xl p-2.5 transition-all duration-200 group",
                    isTop3 ? "border-brand-gold/40 shadow-lg shadow-brand-gold/5" : "border-brand-border/40"
                  )}
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div className={cn(
                      "flex items-center justify-center w-7 h-7 rounded-lg text-[10px] font-black Oswald shrink-0",
                      isTop3 ? "bg-brand-gold text-brand-blue" : "bg-white/5 text-brand-silver"
                    )}>
                      {idx + 1}º
                    </div>
                    <Avatar className={cn(
                      "h-8 w-8 border transition-all",
                      isTop3 ? "border-brand-gold/50" : "border-brand-border"
                    )}>
                      <AvatarImage src={p.players?.avatar_path || ""} />
                      <AvatarFallback className="text-[8px] bg-brand-surface text-brand-silver Oswald">
                        {p.players?.name?.substring(0, 2).toUpperCase()}
                      </AvatarFallback>
                    </Avatar>
                    <div className="min-w-0">
                      <p className={cn(
                        "text-xs font-bold uppercase Oswald tracking-tight truncate",
                        isTop3 ? "text-brand-gold" : "text-brand-white"
                      )}>
                        {p.players?.name}
                      </p>
                      <p className="text-[9px] text-brand-silver/50 font-mono tracking-tighter">
                        +{p.players?.phone_normalized}
                      </p>
                    </div>
                  </div>
                  
                  <div className="flex items-center gap-1.5 ml-2">
                    <Button 
                      variant="ghost" 
                      size="icon" 
                      className="h-10 w-10 text-brand-silver hover:text-brand-gold hover:bg-brand-gold/10 rounded-full" 
                      onClick={() => handleMove(idx, 'up')} 
                      disabled={idx === 0 || busy === "reorder"}
                      aria-label="Subir na ordem de prioridade"
                    >
                      <ArrowUp className="w-4 h-4" />
                    </Button>
                    <Button 
                      variant="ghost" 
                      size="icon" 
                      className="h-10 w-10 text-brand-silver hover:text-brand-gold hover:bg-brand-gold/10 rounded-full" 
                      onClick={() => handleMove(idx, 'down')} 
                      disabled={idx === organizers.length - 1 || busy === "reorder"}
                      aria-label="Descer na ordem de prioridade"
                    >
                      <ArrowDown className="w-4 h-4" />
                    </Button>
                    <div className="w-px h-6 bg-brand-border/50 mx-1" />
                    <Button 
                      variant="ghost" 
                      size="icon" 
                      className="h-10 w-10 text-red-400/70 hover:text-red-400 hover:bg-red-400/10 rounded-full" 
                      onClick={() => handleRemove(p)} 
                      disabled={busy === p.player_id}
                      aria-label="Remover da organização"
                    >
                      <UserMinus className="w-4 h-4" />
                    </Button>
                  </div>
                </div>
              );
            })}
            
            {organizers.length === 0 && (
              <div className="text-center py-12 px-4 border-2 border-dashed border-brand-border/30 rounded-2xl">
                <Shield className="w-8 h-8 text-brand-silver/20 mx-auto mb-2" />
                <p className="text-[10px] text-brand-silver/40 font-bold Oswald uppercase tracking-widest">
                  Nenhum organizador definido para esta turma.
                </p>
              </div>
            )}
          </div>
        </Card>

        {/* BUSCA E ADIÇÃO */}
        <Card className="p-0 overflow-hidden bg-white dark:bg-[#020B1B]/40 border-slate-200 dark:border-brand-border/50 backdrop-blur-sm shadow-sm dark:shadow-xl">
          <div className="p-4 border-b border-slate-200 dark:border-brand-border/50 bg-slate-50 dark:bg-white/5">
            <h4 className="text-[10px] font-black text-slate-500 dark:text-brand-silver uppercase tracking-widest flex items-center gap-2">
              <Search className="w-4 h-4" /> Adicionar à Organização
            </h4>
          </div>
          
          <div className="p-4 space-y-4">
            <div className="relative group">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-brand-silver/30 group-focus-within:text-brand-gold transition-colors" />
              <Input 
                placeholder="Buscar por nome ou WhatsApp..." 
                value={search}
                onChange={e => setSearch(e.target.value)}
                className="pl-9 h-10 text-[11px] bg-slate-50 dark:bg-brand-surface/40 border-slate-200 dark:border-brand-border focus:border-pink-500 dark:focus:border-brand-gold transition-all text-slate-900 dark:text-white Oswald uppercase tracking-wider" 
              />
            </div>

            <div className="space-y-1.5 max-h-[450px] overflow-y-auto pr-1 no-scrollbar">
              {eligible.map((p: any) => (
                <div key={p.id} className="flex items-center justify-between p-2.5 hover:bg-white/5 rounded-xl border border-transparent hover:border-brand-border/50 transition-all group">
                  <div className="flex items-center gap-3 min-w-0">
                    <Avatar className="h-8 w-8 border border-brand-border">
                      <AvatarImage src={p.avatar_url || ""} />
                      <AvatarFallback className="text-[8px] bg-brand-surface text-brand-silver Oswald">
                        {p.name?.substring(0, 2).toUpperCase()}
                      </AvatarFallback>
                    </Avatar>
                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5">
                        <span className="text-xs text-slate-900 dark:text-brand-white font-bold Oswald uppercase truncate">{p.name}</span>
                        {p.group_status === 'approved' ? (
                          <Badge className="h-3.5 px-1.5 text-[7px] bg-green-500/10 text-green-400 border-none uppercase font-bold Oswald">Ativo</Badge>
                        ) : p.group_status === 'pending' ? (
                          <Badge className="h-3.5 px-1.5 text-[7px] bg-yellow-500/10 text-yellow-500 border-none uppercase font-bold Oswald">Pendente</Badge>
                        ) : (
                          <Badge className="h-3.5 px-1.5 text-[7px] bg-brand-silver/10 text-brand-silver border-none uppercase font-bold Oswald">Inativo</Badge>
                        )}
                      </div>
                      <span className="text-[9px] text-brand-silver/40 font-mono tracking-tighter">
                        +{p.phone}
                      </span>
                    </div>
                  </div>
                  
                  <Button 
                    variant={p.group_status === 'approved' ? "outline" : "default"}
                    size="sm" 
                    className={cn(
                      "h-8 px-3 text-[9px] font-black uppercase Oswald tracking-widest shrink-0 transition-all active:scale-95",
                      p.group_status !== 'approved' 
                        ? 'bg-brand-gold text-brand-blue hover:bg-brand-gold/80 border-none' 
                        : 'border-brand-gold/30 text-brand-gold hover:bg-brand-gold/10'
                    )}
                    onClick={() => {
                      if (p.group_status !== 'approved') {
                        setConfirmDialog({
                          open: true,
                          title: `Liberar Acesso e Adicionar à Organização - ${groupName}`,
                          description: `Você está prestes a aprovar o acesso de ${p.name} à turma ${groupName} E adicioná-lo como organizador (prioridade na inscrição). Deseja confirmar?`,
                          onConfirm: () => {
                            handleAdd(p.id, organizers);
                            setConfirmDialog(prev => ({ ...prev, open: false }));
                          }
                        });
                      } else {
                        handleAdd(p.id, organizers);
                      }
                    }}
                    disabled={busy === p.id}
                  >
                    {busy === p.id ? "..." : (p.group_status === 'approved' ? 'Adicionar' : 'Liberar + Add')}
                  </Button>
                </div>
              ))}
              
              {eligible.length === 0 && (
                <div className="text-center py-8">
                  <p className="text-[10px] text-brand-silver/30 font-bold Oswald uppercase tracking-widest italic">
                    Nenhum jogador disponível para adição.
                  </p>
                </div>
              )}
            </div>
          </div>
        </Card>
      </div>
      
      <AppConfirmDialog 
        {...confirmDialog} 
        onConfirm={itemToRemove ? confirmRemove : confirmDialog.onConfirm}
        onOpenChange={o => {
          setConfirmDialog(prev => ({ ...prev, open: o }));
          if (!o) setItemToRemove(null);
        }} 
      />
      
      {/* LEGEND/INFO SECTION */}
      <div className="flex flex-wrap gap-4 items-center justify-center pt-4 border-t border-brand-border/30 opacity-60">
        <div className="flex items-center gap-1.5">
          <div className="w-2 h-2 rounded-full bg-brand-gold" />
          <span className="text-[9px] uppercase font-bold text-brand-silver Oswald tracking-widest">Prioridade no Topo</span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="w-2 h-2 rounded-full bg-green-500/50" />
          <span className="text-[9px] uppercase font-bold text-brand-silver Oswald tracking-widest">Acesso Aprovado</span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="w-2 h-2 rounded-full bg-yellow-500/50" />
          <span className="text-[9px] uppercase font-bold text-brand-silver Oswald tracking-widest">Pendente de Vínculo</span>
        </div>
      </div>
    </div>
  );
}