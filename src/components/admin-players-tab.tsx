import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Search, ShieldCheck, UserMinus, Key, Shield, Info, MoreHorizontal, UserCheck, Edit, UserPlus, Camera, Trash, MoreVertical, CheckCircle, Edit2, Plus, Users } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { PlayerAvatar } from "@/components/PlayerAvatar";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, DropdownMenuSeparator, DropdownMenuGroup } from "@/components/ui/dropdown-menu";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { AdminFrequencyTab } from "@/components/AdminFrequencyTab";
import { AppConfirmDialog, AppPromptDialog } from "@/components/AppDialogs";
import { friendlyError } from "@/lib/error-messages";
import { 
  admin_list_players, 
  admin_request_pin_reset, 
  admin_deactivate_player,
  admin_get_skill_weights 
} from "@/lib/admin.functions";
import { positionLabel, DEFAULT_WEIGHTS } from "@/lib/skills";
import { admin_update_player_details } from "@/lib/admin-extra.functions";
import { admin_approve_avatar, admin_reject_avatar } from "@/lib/avatars.functions";
import { PlayerPhotoModal } from "@/components/PlayerPhotoModal";
import { PlayerDrawer } from "./PlayerDrawer";

function formatPhoneForDisplay(phone?: string | null) {
  if (!phone) return "—";
  const p = phone.replace(/\D/g, "");
  if (p.length === 11) {
    return `(${p.substring(0,2)}) ${p.substring(2,7)}-${p.substring(7)}`;
  }
  return phone;
}

export function PlayersTab() {
  const listPlayers = useServerFn(admin_list_players);
  const getWeights = useServerFn(admin_get_skill_weights);
  const updateDetails = useServerFn(admin_update_player_details);
  const resetPin = useServerFn(admin_request_pin_reset);
  const deactivate = useServerFn(admin_deactivate_player);
  const approveAvatar = useServerFn(admin_approve_avatar);
  const rejectAvatar = useServerFn(admin_reject_avatar);
  
  const [selectedPlayer, setSelectedPlayer] = useState<any | null>(null);
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);

  const [selectedPhoto, setSelectedPhoto] = useState<any>(null);
  const [search, setSearch] = useState("");

  const [page, setPage] = useState(1);
  const [statusFilter, setStatusFilter] = useState<"active" | "inactive" | "all">("active");

  const [confirmDialog, setConfirmDialog] = useState<{ open: boolean; title: string; description: string; onConfirm: () => void; variant?: "default" | "destructive"; isLoading?: boolean }>({
    open: false, title: "", description: "", onConfirm: () => {},
  });

  const [promptDialog, setPromptDialog] = useState<{ open: boolean; title: string; description: string; label: string; defaultValue: string; onConfirm: (v: string) => void; isLoading?: boolean }>({
    open: false, title: "", description: "", label: "", defaultValue: "", onConfirm: () => {},
  });

  const { data: weightsRes } = useQuery({
    queryKey: ["skill-weights-admin"],
    queryFn: () => getWeights(),
  });
  const weights = (weightsRes?.weights as any) ?? DEFAULT_WEIGHTS;

  const { data: playersRes, refetch, isLoading } = useQuery({
    queryKey: ["admin-players-global", search, page, statusFilter],
    queryFn: () => listPlayers({ data: { query: search, page, status: statusFilter, page_size: 25 } })
  });

  const players = (playersRes?.players || []).filter((p: any) => !p.phone_normalized?.startsWith('GUEST-'));
  const total = playersRes?.total || 0;
  const totalPages = Math.ceil(total / 25);

  const handleUpdateName = async (id: string, currentName: string) => {
    setPromptDialog({
      open: true,
      title: "Alterar nome do jogador",
      description: "Atualize o nome utilizado nas listas e nas telas administrativas.",
      label: "Nome completo",
      defaultValue: currentName,
      onConfirm: async (newName: string) => {
        if (!newName || newName.trim() === currentName) {
          setPromptDialog(prev => ({ ...prev, open: false }));
          return;
        }
        setPromptDialog(prev => ({ ...prev, isLoading: true }));
        try {
          await updateDetails({ data: { player_id: id, name: newName.trim() } });
          toast.success("Nome alterado com sucesso.");
          refetch();
          setPromptDialog(prev => ({ ...prev, open: false }));
        } catch (e: any) {
          toast.error(friendlyError(e.message));
        } finally {
          setPromptDialog(prev => ({ ...prev, isLoading: false }));
        }
      }
    });
  };

  const removeAccents = (str: string) => {
    return str.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  };

  const filteredPlayers = useMemo(() => {
    if (!search) return players;
    const s = removeAccents(search.toLowerCase().trim());
    const digits = search.replace(/\D/g, "");
    
    return players.filter((p: any) => {
      const name = removeAccents(p.name.toLowerCase());
      const phone = p.phone_normalized || "";
      
      return name.includes(s) || 
             (digits && phone.includes(digits));
    });
  }, [players, search]);


  const PlayerActionsMenu = ({ p }: { p: any }) => (
    <DropdownMenu>
      <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
        <Button variant="ghost" size="icon" className="h-8 w-8 text-brand-silver hover:text-brand-white hover:bg-white/10" disabled={isProcessing}>
          <MoreVertical className="w-4 h-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="bg-brand-surface border-brand-border text-brand-white min-w-[14rem] p-1">
        <DropdownMenuGroup>
          <div className="px-2 py-1.5 text-[10px] font-bold text-brand-silver/50 uppercase tracking-widest">Dados do Jogador</div>
          <DropdownMenuItem onClick={(e) => { e.stopPropagation(); setSelectedPlayer(p); setIsDrawerOpen(true); }} className="text-sm cursor-pointer hover:bg-white/5">
            <CheckCircle className="w-4 h-4 mr-2 text-brand-gold/70" /> Visualizar perfil
          </DropdownMenuItem>
          <DropdownMenuItem onClick={(e) => { e.stopPropagation(); handleUpdateName(p.id, p.name); }} className="text-sm cursor-pointer hover:bg-white/5">
            <Edit2 className="w-4 h-4 mr-2 text-brand-gold/70" /> Alterar nome
          </DropdownMenuItem>
          <DropdownMenuItem 
            onClick={(e) => {
              e.stopPropagation();
              setPromptDialog({
                open: true,
                title: "Alterar WhatsApp",
                description: `Atualize o número de WhatsApp de ${p.name}.`,
                label: "WhatsApp (somente números)",
                defaultValue: p.phone_normalized || "",
                onConfirm: async (newPhone: string) => {
                  if (isProcessing) return;
                  setIsProcessing(true);
                  setPromptDialog(prev => ({ ...prev, isLoading: true }));
                  try {
                    await updateDetails({ data: { player_id: p.id, phone: newPhone } });
                    toast.success("WhatsApp atualizado.");
                    refetch();
                    setPromptDialog(prev => ({ ...prev, open: false }));
                  } catch (e: any) {
                    toast.error(friendlyError(e.message));
                  } finally {
                    setPromptDialog(prev => ({ ...prev, isLoading: false }));
                    setIsProcessing(false);
                  }
                }
              });
            }}
            className="text-sm cursor-pointer hover:bg-white/5"
          >
            <Plus className="w-4 h-4 mr-2 text-brand-gold/70" /> Alterar WhatsApp
          </DropdownMenuItem>
          <DropdownMenuItem 
            onClick={(e) => {
              e.stopPropagation();
              setSelectedPhoto({
                id: p.id,
                name: p.name,
                avatar_path: p.avatar_path,
                phone: p.phone_normalized,
                group_name: "SE PASSOU, E PONTO",
                position: "JOGADOR"
              });
            }} 
            className="text-sm cursor-pointer hover:bg-white/5"
          >
            <Camera className="w-4 h-4 mr-2 text-brand-gold/70" /> Alterar/remover foto
          </DropdownMenuItem>
        </DropdownMenuGroup>
        <DropdownMenuSeparator className="bg-brand-border/40" />
        <DropdownMenuGroup>
          <div className="px-2 py-1.5 text-[10px] font-bold text-brand-silver/50 uppercase tracking-widest">Segurança / Permissões</div>
          <DropdownMenuItem 
            onClick={(e) => {
              e.stopPropagation();
              setConfirmDialog({
                open: true,
                title: "Resetar PIN",
                description: `Deseja resetar o PIN de ${p.name} para o padrão "1234"?`,
                onConfirm: async () => {
                  if (isProcessing) return;
                  setIsProcessing(true);
                  setConfirmDialog(prev => ({ ...prev, isLoading: true }));
                  try {
                    const payload: any = { player_id: p.id, new_pin: "1234", pin: "1234" };
                    await resetPin({ data: payload });
                    toast.success("PIN resetado para 1234 com sucesso.");
                    setConfirmDialog(prev => ({ ...prev, open: false }));
                  } catch (e: any) {
                    toast.error(friendlyError(e.message));
                  } finally {
                    setConfirmDialog(prev => ({ ...prev, isLoading: false }));
                    setIsProcessing(false);
                  }
                }
              });
            }}
            className="text-sm cursor-pointer hover:bg-white/5"
          >
            <Key className="w-4 h-4 mr-2" /> Resetar PIN
          </DropdownMenuItem>
          <DropdownMenuItem 
            onClick={(e) => {
              e.stopPropagation();
              setConfirmDialog({
                open: true,
                title: p.is_admin ? "Remover Admin" : "Definir como Admin",
                description: `Deseja ${p.is_admin ? 'remover' : 'conceder'} privilégios administrativos para ${p.name}?`,
                onConfirm: async () => {
                  if (isProcessing) return;
                  setIsProcessing(true);
                  setConfirmDialog(prev => ({ ...prev, isLoading: true }));
                  try {
                    await updateDetails({ data: { player_id: p.id, is_admin: !p.is_admin } });
                    toast.success("Privilégios atualizados.");
                    refetch();
                    setConfirmDialog(prev => ({ ...prev, open: false }));
                  } catch (e: any) {
                    toast.error(friendlyError(e.message));
                  } finally {
                    setConfirmDialog(prev => ({ ...prev, isLoading: false }));
                    setIsProcessing(false);
                  }
                }
              });
            }}
            className="text-sm cursor-pointer hover:bg-white/5"
          >
            <ShieldCheck className="w-4 h-4 mr-2" /> {p.is_admin ? "Remover admin" : "Definir como admin"}
          </DropdownMenuItem>
        </DropdownMenuGroup>
        <DropdownMenuSeparator className="bg-brand-border/40" />
        <DropdownMenuGroup>
          <div className="px-2 py-1.5 text-[10px] font-bold text-brand-silver/50 uppercase tracking-widest">Desativação</div>
          <DropdownMenuItem 
            onClick={(e) => {
              e.stopPropagation();
              setConfirmDialog({
                open: true,
                title: p.active ? "Desativar cadastro" : "Reativar cadastro",
                description: `Deseja realmente ${p.active ? 'desativar' : 'reativar'} o cadastro de ${p.name}?`,
                variant: p.active ? "destructive" : "default",
                onConfirm: async () => {
                  if (isProcessing) return;
                  setIsProcessing(true);
                  setConfirmDialog(prev => ({ ...prev, isLoading: true }));
                  try {
                    await deactivate({ data: { player_id: p.id, active: !p.active } });
                    toast.success("Status alterado.");
                    refetch();
                    setConfirmDialog(prev => ({ ...prev, open: false }));
                  } catch (e: any) {
                    toast.error(friendlyError(e.message));
                  } finally {
                    setConfirmDialog(prev => ({ ...prev, isLoading: false }));
                    setIsProcessing(false);
                  }
                }
              });
            }}
            className={cn("text-sm cursor-pointer hover:bg-white/5", p.active ? "text-red-400" : "text-emerald-400")}
          >
            <UserMinus className="w-4 h-4 mr-2" /> {p.active ? "Desativar" : "Reativar"}
          </DropdownMenuItem>
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-4 bg-white dark:bg-brand-surface/20 p-4 md:p-6 rounded-xl border border-slate-200 dark:border-brand-border shadow-sm dark:shadow-none">
        <div className="space-y-1 pb-4 border-b border-slate-200 dark:border-brand-border/40">
          <h3 className="text-xl font-black text-slate-900 dark:text-brand-white uppercase Oswald tracking-tight flex items-center gap-2">
            <Users className="w-6 h-6 text-pink-600 dark:text-brand-gold" />
            Base de Jogadores
          </h3>
          <p className="text-xs text-brand-silver/80">A base de jogadores é global e compartilhada entre todas as turmas do sistema.</p>
        </div>
        
        <div className="flex flex-col md:flex-row gap-4 items-end">
          <div className="flex-1 w-full space-y-1.5">
            <label className="text-xs font-bold text-brand-silver uppercase Oswald tracking-widest">Busca de jogador</label>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-brand-silver/50" />
              <Input 
                placeholder="Buscar por nome ou WhatsApp..." 
                value={search}
                onChange={e => { setSearch(e.target.value); setPage(1); }}
                className="pl-9 h-11 text-sm bg-slate-50 dark:bg-brand-surface border-slate-200 dark:border-brand-border focus-visible:ring-pink-500/30 dark:focus-visible:ring-brand-gold/30 text-slate-900 dark:text-white" 
              />
            </div>
          </div>
          <div className="w-full md:w-56 space-y-1.5">
            <label className="text-xs font-bold text-brand-silver uppercase Oswald tracking-widest">Filtro de status</label>
            <select 
              value={statusFilter}
              onChange={e => { setStatusFilter(e.target.value as any); setPage(1); }}
              className="h-11 w-full text-sm bg-slate-50 dark:bg-brand-surface border border-slate-200 dark:border-brand-border rounded-md px-3 text-slate-900 dark:text-brand-white outline-none focus:ring-2 focus:ring-pink-500/30 dark:focus:ring-brand-gold/30 font-bold Oswald uppercase"
            >
              <option value="active">Ativos</option>
              <option value="inactive">Inativos</option>
              <option value="all">Todos</option>
            </select>
          </div>
        </div>
      </div>

      <div className="flex items-center justify-between text-xs font-bold text-brand-silver uppercase Oswald px-1">
        <span>
          {isLoading ? (
            "Buscando informações..."
          ) : (
            `Exibindo ${filteredPlayers.length} resultado(s) de ${total} totais`
          )}
        </span>
      </div>

      {isLoading && (
        <Card className="p-12 border-brand-border bg-brand-surface/20 flex flex-col items-center justify-center gap-4">
          <div className="w-8 h-8 border-4 border-brand-gold border-t-transparent rounded-full animate-spin"></div>
          <p className="text-sm font-bold text-brand-silver uppercase Oswald tracking-widest">Carregando base...</p>
        </Card>
      )}

      {!isLoading && filteredPlayers.length === 0 && (
        <Card className="p-12 border-brand-border bg-brand-surface/20 text-center">
          <p className="text-brand-silver/60 text-sm font-bold Oswald uppercase tracking-widest">
            {search ? "Nenhum jogador corresponde à busca." : "A base de jogadores está vazia."}
          </p>
        </Card>
      )}

      {!isLoading && filteredPlayers.length > 0 && (
        <Card className="bg-white dark:bg-brand-surface/20 border-slate-200 dark:border-brand-border overflow-hidden">
          
          {/* MOBILE VIEW */}
          <div className="grid grid-cols-1 divide-y divide-brand-border/20 md:hidden">
            {filteredPlayers.map((p: any) => (
              <div 
                key={p.id} 
                className="p-4 flex flex-col gap-3 active:bg-white/5 transition-colors cursor-pointer"
                onClick={() => { setSelectedPlayer(p); setIsDrawerOpen(true); }}
              >
                <div className="flex justify-between items-start">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="relative shrink-0">
                      <PlayerAvatar 
                        path={p.avatar_path} 
                        name={p.name} 
                        size="md" 
                        className="border border-brand-border"
                      />
                      {p.is_admin && (
                        <div className="absolute -top-1 -right-1 bg-brand-gold rounded-full p-0.5 shadow-sm">
                          <Shield className="w-3 h-3 text-brand-blue" />
                        </div>
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-bold text-brand-white truncate">{p.name}</p>
                      <p className="text-xs text-brand-silver font-mono mt-0.5">{formatPhoneForDisplay(p.phone_normalized)}</p>
                      {(p.primary_position && p.primary_position !== "undefined" && p.primary_position !== "Sem posição definida") && (
                        <p className="text-[10px] text-brand-gold font-bold uppercase Oswald mt-1">
                          {positionLabel(p.primary_position)}
                        </p>
                      )}
                    </div>
                  </div>
                  <PlayerActionsMenu p={p} />
                </div>
                <div className="flex justify-between items-center mt-1">
                  <span className="text-[10px] text-brand-silver/50 uppercase font-bold tracking-widest">
                    Criado: {new Date(p.created_at).toLocaleDateString("pt-BR")}
                  </span>
                  <Badge variant="outline" className={cn(
                    "text-[9px] uppercase px-2 h-5 font-bold tracking-wider",
                    p.active ? "border-emerald-500/40 text-emerald-400 bg-emerald-500/5" : "border-red-500/40 text-red-400 bg-red-500/5"
                  )}>
                    {p.active ? "Ativo" : "Inativo"}
                  </Badge>
                </div>
              </div>
            ))}
          </div>

          {/* DESKTOP VIEW */}
          <div className="hidden md:block overflow-x-auto max-h-[600px] overflow-y-auto custom-scrollbar">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-slate-200 dark:border-brand-border/40 bg-slate-50 dark:bg-brand-surface/40 sticky top-0 z-10">
                  <th className="px-4 py-3 text-xs font-black text-slate-500 dark:text-brand-silver uppercase tracking-wider">Jogador</th>
                  <th className="px-4 py-3 text-xs font-black text-slate-500 dark:text-brand-silver uppercase tracking-wider">WhatsApp</th>
                  <th className="px-4 py-3 text-xs font-black text-slate-500 dark:text-brand-silver uppercase tracking-wider">Cadastro</th>
                  <th className="px-4 py-3 text-xs font-black text-slate-500 dark:text-brand-silver uppercase tracking-wider">Status</th>
                  <th className="px-4 py-3 text-xs font-black text-slate-500 dark:text-brand-silver uppercase tracking-wider text-right">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-brand-border/20">
                {filteredPlayers.map((p: any) => (
                  <tr 
                    key={p.id} 
                    className="hover:bg-brand-white/5 transition-colors group cursor-pointer"
                    onClick={() => { setSelectedPlayer(p); setIsDrawerOpen(true); }}
                  >
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        <div className="relative">
                          <PlayerAvatar 
                            path={p.avatar_path} 
                            name={p.name} 
                            size="sm" 
                            className="cursor-pointer hover:ring-2 hover:ring-brand-gold/50 transition-all border border-brand-border"
                            onClick={(e) => {
                              e.stopPropagation();
                              setSelectedPhoto({
                                id: p.id,
                                name: p.name,
                                avatar_path: p.avatar_path,
                                phone: p.phone_normalized,
                                group_name: "SE PASSOU, E PONTO",
                                position: "JOGADOR"
                              });
                            }}
                          />
                          {p.is_admin && (
                            <div className="absolute -top-1 -right-1 bg-brand-gold rounded-full p-0.5 shadow-sm">
                              <Shield className="w-2.5 h-2.5 text-brand-blue" />
                            </div>
                          )}
                        </div>
                        <div className="flex flex-col">
                          <p className="text-sm font-bold text-slate-900 dark:text-brand-white max-w-[200px] truncate">
                            {p.name}
                          </p>
                          {(p.primary_position && p.primary_position !== "undefined" && p.primary_position !== "Sem posição definida") && (
                            <span className="text-[10px] text-brand-gold font-bold uppercase Oswald mt-0.5">
                              {positionLabel(p.primary_position)}
                            </span>
                          )}
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <span className="text-sm text-brand-silver font-mono">{formatPhoneForDisplay(p.phone_normalized)}</span>
                    </td>
                    <td className="px-4 py-3">
                      <span className="text-sm text-brand-silver">{new Date(p.created_at).toLocaleDateString("pt-BR")}</span>
                    </td>
                    <td className="px-4 py-3">
                      <Badge variant="outline" className={cn(
                        "text-[9px] font-bold uppercase px-2 h-5 tracking-wider",
                        p.active ? "border-emerald-500/40 text-emerald-400 bg-emerald-500/5" : "border-red-500/40 text-red-400 bg-red-500/5"
                      )}>
                        {p.active ? "Ativo" : "Inativo"}
                      </Badge>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <PlayerActionsMenu p={p} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        {totalPages > 1 && (
          <div className="p-4 border-t border-brand-border/40 flex items-center justify-between bg-brand-surface/40">
            <p className="text-xs font-bold text-brand-silver uppercase Oswald tracking-widest">Página {page} de {totalPages}</p>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" disabled={page === 1} onClick={() => setPage(p => p - 1)} className="h-9 px-4 text-xs font-bold uppercase Oswald">Anterior</Button>
              <Button variant="outline" size="sm" disabled={page === totalPages} onClick={() => setPage(p => p + 1)} className="h-9 px-4 text-xs font-bold uppercase Oswald">Próxima</Button>
            </div>
          </div>
        )}
      </Card>
      )}
      <PlayerPhotoModal
        open={!!selectedPhoto}
        onOpenChange={(v) => !v && setSelectedPhoto(null)}
        player={selectedPhoto}
      />
      <PlayerDrawer 
        player={selectedPlayer}
        open={isDrawerOpen}
        onOpenChange={setIsDrawerOpen}
        weights={weights}
        onResetPin={(id) => {
           setConfirmDialog({
            open: true,
            title: "Resetar PIN",
            description: `Deseja resetar o PIN do jogador para o padrão "1234"?`,
            onConfirm: async () => {
              if (isProcessing) return;
              setIsProcessing(true);
              setConfirmDialog(prev => ({ ...prev, isLoading: true }));
              try {
                const payload: any = { player_id: id, new_pin: "1234", pin: "1234" };
                await resetPin({ data: payload });
                toast.success("PIN resetado para 1234 com sucesso.");
                setConfirmDialog(prev => ({ ...prev, open: false }));
              } catch (e: any) {
                toast.error(friendlyError(e.message));
              } finally {
                setConfirmDialog(prev => ({ ...prev, isLoading: false }));
                setIsProcessing(false);
              }
            }
          });
        }}
        onDeactivate={(id, active) => {
           setConfirmDialog({
            open: true,
            title: active ? "Desativar cadastro" : "Reativar cadastro",
            description: `Deseja realmente ${active ? 'desativar' : 'reativar'} este cadastro?`,
            variant: active ? "destructive" : "default",
            onConfirm: async () => {
              if (isProcessing) return;
              setIsProcessing(true);
              setConfirmDialog(prev => ({ ...prev, isLoading: true }));
              try {
                await deactivate({ data: { player_id: id, active: !active } });
                toast.success("Status alterado.");
                refetch();
                setSelectedPlayer((prev: any) => prev ? { ...prev, active: !active } : null);
                setConfirmDialog(prev => ({ ...prev, open: false }));
              } catch (e: any) {
                toast.error(friendlyError(e.message));
              } finally {
                setConfirmDialog(prev => ({ ...prev, isLoading: false }));
                setIsProcessing(false);
              }
            }
          });
        }}
        onEditName={handleUpdateName}
      />
      <AppConfirmDialog {...confirmDialog} onOpenChange={o => setConfirmDialog(prev => ({ ...prev, open: o }))} />
      <AppPromptDialog {...promptDialog} onOpenChange={o => setPromptDialog(prev => ({ ...prev, open: o }))} />
    </div>
  );
}
