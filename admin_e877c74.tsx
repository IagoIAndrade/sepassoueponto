import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { LogOut, MoreVertical, Search, Trash2, Edit2, Key, UserMinus, CheckSquare, Square, ShieldAlert, DollarSign, Clock, Users, MapPin, Calendar, Plus, History, Power, CheckCircle, ChevronRight, UserPlus, ArrowRight, ArrowLeft, ArrowUp, ArrowDown, UserPlus2, ListFilter, AlertCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import shieldAsset from "@/assets/shield.asset.json";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { confirmDiscardUnsaved } from "@/lib/unsaved-guard";
import { AdminGroupProvider, AdminGroupSelector, useAdminGroup } from "@/lib/admin-group-context";
import { friendlyError } from "@/lib/error-messages";
import { ConfigSection } from "@/components/admin-config-section";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { SkillsTab } from "@/components/admin-skills-tab";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { player_signup } from "@/lib/players.functions";

import {
  get_admin_event,
  admin_set_status,
  admin_remove,
  admin_move,
  admin_preview_next_event,
  admin_create_next_event,
  admin_list_events,
  admin_list_players,
  admin_list_incidents,
  admin_list_fund_participants,
  admin_get_fund_config,
  admin_update_settings,
  admin_list_pending_approvals,
  admin_process_group_request,
  admin_list_groups,
  admin_list_players_to_review,
  admin_save_reviewed_accesses,
  admin_add,
} from "@/lib/admin.functions";

export const Route = createFileRoute("/_admin/admin")({
  head: () => ({
    meta: [
      { title: "Painel — SE PASSOU, E PONTO" },
      { name: "robots", content: "noindex,nofollow" },
    ],
  }),
  component: AdminPanel,
});

function StatusBadge({ status, className }: { status: string; className?: string }) {
  const map: any = {
    open: { label: "Aberta", cls: "bg-emerald-500/20 text-emerald-300 border-emerald-500/40" },
    closed: { label: "Fechada", cls: "bg-red-500/20 text-red-300 border-red-500/40" },
    scheduled: { label: "Programada", cls: "bg-amber-500/20 text-amber-300 border-amber-500/40" },
    completed: { label: "Finalizada", cls: "bg-brand-silver/20 text-brand-silver border-brand-border" },
  };
  const s = map[status] ?? map.scheduled;
  return <Badge variant="outline" className={cn("border px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider", s.cls, className)}>{s.label}</Badge>;
}

function AdminPanel() {
  const navigate = useNavigate();
  const [tab, setTab] = useState("approvals");
  async function handleLogout() {
    await supabase.auth.signOut();
    navigate({ to: "/admin/login", replace: true });
  }

  return (
    <AdminGroupProvider>
      <div className="min-h-dvh bg-brand-gradient text-foreground">
        <header className="border-b border-brand-border sticky top-0 bg-brand-surface/90 backdrop-blur z-10">
          <div className="max-w-5xl mx-auto flex items-center justify-between px-4 py-3 gap-3">
            <div className="flex min-w-0 items-center gap-3">
              <img src={shieldAsset.url} className="h-10 w-10 shrink-0 rounded-full ring-1 ring-brand-gold/40" />
              <div className="min-w-0">
                <h1 className="font-display text-base font-bold uppercase tracking-wide text-brand-white truncate">Painel administrativo</h1>
                <p className="text-[11px] text-brand-silver truncate">SE PASSOU, E PONTO</p>
              </div>
            </div>
            <Button variant="outline" size="sm" onClick={handleLogout} className="shrink-0"><LogOut className="w-4 h-4 mr-1" /> Sair</Button>
          </div>
        </header>

        <main className="max-w-5xl mx-auto p-4 pb-24">
          <Tabs value={tab} onValueChange={(v) => { if (v !== tab && !confirmDiscardUnsaved("Você está saindo desta aba.")) return; setTab(v); }} className="w-full">
            <div className="mb-6">
              <h3 className="text-[10px] font-bold text-brand-silver uppercase mb-2 px-1 tracking-wider">Gestão de acessos</h3>
              <TabsList className="grid grid-cols-2 w-full h-9 bg-brand-surface/50 border border-brand-border">
                <TabsTrigger value="approvals" className="text-[11px]">Aprovações</TabsTrigger>
                <TabsTrigger value="review" className="text-[11px]">Acessos a revisar</TabsTrigger>
              </TabsList>
            </div>

            <div className="mb-4 pt-4 border-t border-brand-border/50">
              <h3 className="text-[10px] font-bold text-brand-silver uppercase mb-2 px-1 tracking-wider">Gestão da turma</h3>
              <AdminGroupSelector />
              <TabsList className="grid grid-cols-7 w-full h-9 mt-2 bg-brand-surface/50 border border-brand-border overflow-hidden">
                <TabsTrigger value="list" className="text-[10px] px-0">Lista</TabsTrigger>
                <TabsTrigger value="players" className="text-[10px] px-0">Jogadores</TabsTrigger>
                <TabsTrigger value="skills" className="text-[10px] px-0">Hab.</TabsTrigger>
                <TabsTrigger value="incidents" className="text-[10px] px-0">Ocorr.</TabsTrigger>
                <TabsTrigger value="teams" className="text-[10px] px-0">Times</TabsTrigger>
                <TabsTrigger value="fund" className="text-[10px] px-0">Rateio</TabsTrigger>
                <TabsTrigger value="settings" className="text-[10px] px-0">Config</TabsTrigger>
              </TabsList>
            </div>

            <div className="mt-6">
              <TabsContent value="approvals"><ApprovalsTab /></TabsContent>
              <TabsContent value="review"><AccessReviewTab /></TabsContent>
              <TabsContent value="list" className="mt-0"><ListTab /></TabsContent>
              <TabsContent value="players"><PlayersTab /></TabsContent>
              <TabsContent value="skills"><SkillsTab /></TabsContent>
              <TabsContent value="incidents"><IncidentsTab /></TabsContent>
              <TabsContent value="teams"><TeamsTab /></TabsContent>
              <TabsContent value="fund"><FundParticipantsTab /></TabsContent>
              <TabsContent value="settings"><SettingsTab onOpenFundTab={() => setTab("fund")} /></TabsContent>
            </div>
          </Tabs>
        </main>
      </div>
    </AdminGroupProvider>
  );
}

// --- LIST TAB (Restauração Completa) ---

function ListTab() {
  const { groupId } = useAdminGroup();
  const getEvent = useServerFn(get_admin_event);
  const setStatus = useServerFn(admin_set_status);
  const removeReg = useServerFn(admin_remove);
  const moveReg = useServerFn(admin_move);
  const addReg = useServerFn(admin_add);
  const createNext = useServerFn(admin_create_next_event);
  const listEvents = useServerFn(admin_list_events);
  
  const [addModalOpen, setAddModalOpen] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);

  const { data: eventData, refetch, isLoading } = useQuery({ 
    queryKey: ["admin-event", groupId], 
    queryFn: () => getEvent({ data: { group_id: groupId } }) 
  });

  const { data: historyEvents } = useQuery({
    queryKey: ["admin-events-history", groupId],
    queryFn: () => listEvents({ data: { group_id: groupId } }),
    enabled: historyOpen
  });

  if (isLoading) return <div className="text-center py-20 animate-pulse text-brand-silver font-display uppercase tracking-widest text-xs">Carregando rodada...</div>;
  if (!eventData?.event) return (
    <div className="flex flex-col items-center justify-center py-20 text-center space-y-4">
      <div className="p-4 bg-brand-surface/20 rounded-full">
        <ShieldAlert className="w-12 h-12 text-brand-silver/40" />
      </div>
      <div className="space-y-1">
        <p className="text-brand-white font-bold">Nenhuma rodada ativa</p>
        <p className="text-xs text-brand-silver">Inicie uma nova rodada para gerenciar a lista.</p>
      </div>
      <Button 
        onClick={async () => {
          try {
            await createNext({ data: { group_id: groupId } });
            toast.success("Rodada criada com sucesso!");
            refetch();
          } catch (e: any) {
            toast.error(friendlyError(e.message));
          }
        }}
        className="bg-brand-gold text-brand-blue hover:bg-brand-gold/90 font-bold"
      >
        Criar próxima rodada
      </Button>
    </div>
  );

  const event = eventData.event;
  const registrations = eventData.registrations || [];
  const limit = event.main_limit || 18;
  
  const mainList = registrations.slice(0, limit);
  const waitList = registrations.slice(limit);

  const handleRemove = async (id: string, name: string) => {
    if (!confirm(`Remover "${name}" da lista?`)) return;
    try {
      await removeReg({ data: { registration_id: id } });
      toast.success("Jogador removido.");
      refetch();
    } catch (e: any) {
      toast.error(friendlyError(e.message));
    }
  };

  const handleMove = async (id: string, type: "main" | "wait", pos: number) => {
    try {
      await moveReg({ data: { registration_id: id, new_list: type, new_position: pos } });
      toast.success("Posição alterada.");
      refetch();
    } catch (e: any) {
      toast.error(friendlyError(e.message));
    }
  };

  return (
    <div className="space-y-6 pb-20">
      {/* 1. Resumo da Rodada */}
      <Card className="p-5 bg-brand-surface/40 border-brand-border/60 relative overflow-hidden group">
        <div className="absolute top-0 right-0 p-8 bg-brand-gold/5 rounded-full -mr-10 -mt-10 blur-2xl group-hover:bg-brand-gold/10 transition-colors" />
        
        <div className="relative flex flex-col md:flex-row justify-between gap-6">
          <div className="space-y-4 flex-1">
            <div className="flex items-center gap-2">
              <div className="h-2 w-2 rounded-full bg-brand-gold animate-pulse" />
              <h3 className="font-display text-lg font-bold text-brand-white tracking-tight uppercase">Rodada Atual</h3>
              <StatusBadge status={event.status} />
            </div>
            
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-y-4 gap-x-8">
              <div className="flex items-start gap-3">
                <Calendar className="w-4 h-4 text-brand-gold mt-0.5 shrink-0" />
                <div className="space-y-0.5">
                  <p className="text-[10px] uppercase font-bold text-brand-silver tracking-wider">Data e Horário</p>
                  <p className="text-xs text-brand-white font-medium">
                    {new Date(event.event_date).toLocaleDateString("pt-BR", { weekday: "long", day: "2-digit", month: "long" })}
                    <span className="block text-brand-silver/80 mt-0.5">{event.start_time} às {event.end_time}</span>
                  </p>
                </div>
              </div>
              
              <div className="flex items-start gap-3">
                <MapPin className="w-4 h-4 text-brand-gold mt-0.5 shrink-0" />
                <div className="space-y-0.5">
                  <p className="text-[10px] uppercase font-bold text-brand-silver tracking-wider">Local</p>
                  <p className="text-xs text-brand-white font-medium leading-relaxed">{event.location}</p>
                </div>
              </div>

              <div className="flex items-start gap-3">
                <Clock className="w-4 h-4 text-brand-gold mt-0.5 shrink-0" />
                <div className="space-y-0.5">
                  <p className="text-[10px] uppercase font-bold text-brand-silver tracking-wider">Abertura</p>
                  <p className="text-xs text-brand-white font-medium">
                    {new Date(event.opens_at).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "2-digit" })} às {new Date(event.opens_at).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}
                  </p>
                </div>
              </div>
            </div>

            <div className="pt-4 border-t border-brand-border/30 space-y-3">
               <div className="flex justify-between items-end mb-1">
                  <div className="space-y-1">
                    <p className="text-xs font-bold text-brand-white">
                      Lista Principal: <span className="text-brand-gold">{mainList.length}</span> de {limit}
                    </p>
                    {waitList.length > 0 && (
                      <p className="text-[11px] text-brand-silver">
                        Jogadores na reserva: <span className="text-brand-gold font-bold">{waitList.length}</span>
                      </p>
                    )}
                  </div>
                  <p className="text-[11px] text-brand-silver bg-brand-surface/60 px-2 py-0.5 rounded border border-brand-border/40">
                    Total: <span className="text-brand-white font-bold">{registrations.length}</span>
                  </p>
               </div>
               
               <div className="relative h-2 w-full bg-brand-surface/60 rounded-full overflow-hidden border border-brand-border/20">
                  <div 
                    className={cn(
                      "absolute top-0 left-0 h-full transition-all duration-500 rounded-full",
                      mainList.length >= limit ? "bg-brand-gold" : "bg-emerald-500"
                    )}
                    style={{ width: `${Math.min(100, (mainList.length / limit) * 100)}%` }}
                  />
               </div>
               
               {mainList.length < limit && (
                 <p className="text-[10px] text-emerald-400 font-bold uppercase tracking-wider text-right">
                   {limit - mainList.length} vagas disponíveis
                 </p>
               )}
            </div>
          </div>

          <div className="flex flex-col gap-2 shrink-0 md:w-48">
            <Button 
              variant="outline" 
              size="sm" 
              onClick={async () => {
                if (!confirm("Deseja fechar a lista para novas inscrições?")) return;
                try {
                  await setStatus({ data: { event_id: event.id, status: "closed" } });
                  toast.success("Lista fechada.");
                  refetch();
                } catch (e: any) {
                  toast.error(friendlyError(e.message));
                }
              }}
              disabled={event.status === "closed" || event.status === "completed"}
              className="h-8 text-[11px] font-bold border-brand-border hover:bg-brand-surface/60 text-brand-white"
            >
              <Power className="w-3.5 h-3.5 mr-1.5 text-red-400" /> Fechar lista
            </Button>
            <Button 
              variant="outline" 
              size="sm"
              onClick={async () => {
                if (!confirm("Finalizar rodada? Isso salvará o histórico e preparará para a próxima.")) return;
                try {
                  await setStatus({ data: { event_id: event.id, status: "completed" } });
                  toast.success("Rodada finalizada.");
                  refetch();
                } catch (e: any) {
                  toast.error(friendlyError(e.message));
                }
              }}
              disabled={event.status === "completed"}
              className="h-8 text-[11px] font-bold border-brand-border hover:bg-brand-surface/60 text-brand-white"
            >
              <CheckCircle className="w-3.5 h-3.5 mr-1.5 text-emerald-400" /> Finalizar rodada
            </Button>
            
            <div className="grid grid-cols-2 gap-2 mt-2">
               <Button 
                variant="outline" 
                size="sm" 
                onClick={() => setAddModalOpen(true)}
                className="h-8 text-[10px] font-bold border-brand-border hover:bg-brand-surface/60 text-brand-white"
               >
                 <Plus className="w-3.5 h-3.5 mr-1" /> Adicionar jogador
               </Button>
               <Button 
                variant="outline" 
                size="sm"
                onClick={() => setHistoryOpen(true)}
                className="h-8 text-[10px] font-bold border-brand-border hover:bg-brand-surface/60 text-brand-white"
               >
                 <History className="w-3.5 h-3.5 mr-1" /> Histórico
               </Button>
            </div>
          </div>
        </div>
      </Card>

      {/* MODAL ADICIONAR JOGADOR */}
      <AddPlayerModal 
        open={addModalOpen} 
        onOpenChange={setAddModalOpen} 
        eventId={event.id!} 

        groupId={groupId!}
        mainLimit={limit}
        registrations={registrations}
        onSuccess={() => {
          setAddModalOpen(false);
          refetch();
        }}
      />

      {/* MODAL HISTÓRICO */}
      <HistoryModal 
        open={historyOpen}
        onOpenChange={setHistoryOpen}
        events={historyEvents || []}
      />


      {/* 2 & 6. Listas Separadas e Layout Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">
        {/* LISTA PRINCIPAL */}
        <div className="space-y-3">
          <div className="flex items-center justify-between px-1">
            <h4 className="font-display text-sm font-black text-brand-white uppercase tracking-wider flex items-center gap-2">
              <span className="w-1.5 h-4 bg-brand-gold rounded-full" />
              Lista Principal
            </h4>
            <Badge variant="outline" className="text-[10px] font-black border-brand-gold/30 bg-brand-gold/5 text-brand-gold px-2 py-0">
              {mainList.length} / {limit}
            </Badge>
          </div>
          
          <div className="bg-brand-surface/20 border border-brand-border/40 rounded-lg overflow-hidden divide-y divide-brand-border/20">
            {mainList.length > 0 ? (
              mainList.map((reg, idx) => (
                <PlayerRow 
                  key={reg.id} 
                  reg={reg} 
                  idx={idx} 
                  listType="main"
                  onRemove={handleRemove}
                  onMove={handleMove}
                  limit={limit}
                />

              ))
            ) : (
              <div className="py-12 text-center text-brand-silver/50 italic text-xs">Ninguém na lista principal.</div>
            )}
          </div>
        </div>

        {/* RESERVA */}
        <div className="space-y-3">
          <div className="flex items-center justify-between px-1">
            <h4 className="font-display text-sm font-black text-brand-silver uppercase tracking-wider flex items-center gap-2">
              <span className="w-1.5 h-4 bg-brand-silver/30 rounded-full" />
              Reserva
            </h4>
            <Badge variant="outline" className="text-[10px] font-black border-brand-border bg-brand-surface/50 text-brand-silver px-2 py-0">
              {waitList.length}
            </Badge>
          </div>
          
          <div className="bg-brand-surface/20 border border-brand-border/40 rounded-lg overflow-hidden divide-y divide-brand-border/20">
            {waitList.length > 0 ? (
              waitList.map((reg, idx) => (
                <PlayerRow 
                  key={reg.id} 
                  reg={reg} 
                  idx={idx} 
                  listType="wait"
                  onRemove={handleRemove}
                  onMove={handleMove}
                  limit={limit}
                />

              ))
            ) : (
              <div className="py-12 text-center text-brand-silver/50 italic text-xs">Nenhum jogador reserva.</div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// --- COMPONENTES AUXILIARES PARA A LISTA ---

function PlayerRow({ 
  reg, 
  idx, 
  onRemove, 
  onMove,
  listType,
  limit 
}: { 
  reg: any; 
  idx: number; 
  onRemove: (id: string, name: string) => void;
  onMove: (id: string, type: "main" | "wait", pos: number) => void;
  listType: "main" | "wait";
  limit: number;
}) {
  const p = reg.players;
  const pos = idx + 1;
  const isPaid = false; // Admin view logic for payment to be restored if needed
  
  return (
    <div className="flex items-center gap-3 p-2.5 transition-colors group/row">
      <div className={cn(
        "w-6 h-6 shrink-0 flex items-center justify-center rounded-md text-[10px] font-black border",
        listType === 'main' ? "bg-brand-gold/10 border-brand-gold/30 text-brand-gold" : "bg-brand-surface/60 border-brand-border/40 text-brand-silver"
      )}>
        {pos}
      </div>
      
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5 mb-0.5">
          <span className="text-xs font-bold text-brand-white truncate">{p?.name || 'Jogador sem nome'}</span>
          {isPaid && <div className="h-1.5 w-1.5 rounded-full bg-emerald-500 shrink-0" title="Em dia" />}
        </div>
        <div className="flex items-center gap-2">
          <span className="text-[9px] text-brand-silver/70 font-mono">
            {new Date(reg.created_at).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}
          </span>
          {reg.responsible_player_id && reg.responsible_player_id !== reg.player_id && (
            <span className="text-[8px] bg-brand-surface/80 text-brand-silver px-1 rounded border border-brand-border/40">
              C/O
            </span>
          )}
          {/* Payment badges simplified until backend columns are verified */}
          <Badge variant="outline" className="h-3.5 px-1 text-[8px] font-black border-brand-border/40 text-brand-silver/60">
            PENDENTE
          </Badge>
        </div>
      </div>

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon" className="h-7 w-7 text-brand-silver hover:text-brand-white">
            <MoreVertical className="w-3.5 h-3.5" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="bg-brand-surface border-brand-border text-brand-white min-w-40">
          {listType === 'main' ? (
            <DropdownMenuItem onClick={() => onMove(reg.id, 'wait', 1)} className="text-xs focus:bg-brand-gold/10">
              <ArrowDown className="w-3.5 h-3.5 mr-2 text-amber-500" /> Rebaixar para reserva
            </DropdownMenuItem>
          ) : (
            <DropdownMenuItem onClick={() => onMove(reg.id, 'main', limit + 1)} className="text-xs focus:bg-brand-gold/10">
              <ArrowUp className="w-3.5 h-3.5 mr-2 text-emerald-500" /> Promover para principal
            </DropdownMenuItem>
          )}
          
          <DropdownMenuItem onClick={() => onMove(reg.id, listType, listType === 'main' ? (pos > 1 ? pos - 1 : pos) : (pos > 1 ? pos - 1 : pos))} className="text-xs focus:bg-brand-gold/10">
            <ArrowUp className="w-3.5 h-3.5 mr-2" /> Subir posição
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => onMove(reg.id, listType, pos + 1)} className="text-xs focus:bg-brand-gold/10">
            <ArrowDown className="w-3.5 h-3.5 mr-2" /> Descer posição
          </DropdownMenuItem>

          <DropdownMenuSeparator className="bg-brand-border/40" />
          
          <DropdownMenuItem className="text-xs focus:bg-brand-gold/10">
            <Search className="w-3.5 h-3.5 mr-2" /> Ver jogador
          </DropdownMenuItem>
          <DropdownMenuItem className="text-xs focus:bg-brand-gold/10">
            <ShieldAlert className="w-3.5 h-3.5 mr-2" /> Registrar ocorrência
          </DropdownMenuItem>
          
          <DropdownMenuSeparator className="bg-brand-border/40" />
          
          <DropdownMenuItem 
            onClick={() => onRemove(reg.id, p?.name || 'Jogador')}
            className="text-xs text-red-400 focus:bg-red-400/10 focus:text-red-400"
          >
            <Trash2 className="w-3.5 h-3.5 mr-2" /> Remover da rodada
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}


function AddPlayerModal({ 
  open, 
  onOpenChange, 
  eventId, 
  groupId,
  mainLimit, 
  registrations,
  onSuccess 
}: { 
  open: boolean; 
  onOpenChange: (o: boolean) => void; 
  eventId: string;
  groupId: string;
  mainLimit: number;
  registrations: any[];
  onSuccess: () => void;
}) {
  const searchFn = useServerFn(admin_list_players);
  const addReg = useServerFn(admin_add);
  const [query, setQuery] = useState("");
  const [selectedPlayer, setSelectedPlayer] = useState<any>(null);
  const [targetList, setTargetList] = useState<"auto" | "main" | "wait">("auto");
  const [busy, setBusy] = useState(false);
  const [forceConfirm, setForceConfirm] = useState(false);
  const [isRegistering, setIsRegistering] = useState(false);
  const [newPlayerData, setNewPlayerData] = useState({ firstName: "", lastName: "", phone: "" });
  const signupFn = useServerFn(player_signup);


  const { data: searchResults } = useQuery({
    queryKey: ["admin-player-search", query],
    queryFn: () => searchFn({ data: { query, page_size: 5 } }),
    enabled: query.length >= 2
  });

  const handleAdd = async (force = false) => {
    if (!selectedPlayer) return;
    
    // Verificar duplicidade local
    const already = registrations.find(r => r.player_id === selectedPlayer.id);
    if (already) {
      const listName = already.list_type === 'main' ? 'Lista Principal' : 'Reserva';
      toast.error(`Este jogador já está inscrito na rodada (${listName}, posição ${already.position_number})`);
      return;
    }

    setBusy(true);
    try {
      let list = targetList;
      if (list === "auto") {
        const mainCount = registrations.filter(r => r.list_type === 'main').length;
        list = mainCount < mainLimit ? "main" : "wait";
      }

      if (list === "main" && !force) {
        const mainCount = registrations.filter(r => r.list_type === 'main').length;
        if (mainCount >= mainLimit) {
          setForceConfirm(true);
          setBusy(false);
          return;
        }
      }

      await addReg({ data: { event_id: eventId, player_id: selectedPlayer.id, list_type: list as "main" | "wait", force: true } });
      toast.success("Jogador adicionado com sucesso!");
      onSuccess();
      setSelectedPlayer(null);
      setQuery("");
    } catch (e: any) {
      toast.error(friendlyError(e.message));
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="bg-brand-surface border-brand-border max-w-md">
          <DialogHeader>
            <DialogTitle className="text-brand-white font-display uppercase">Adicionar jogador à rodada</DialogTitle>
            <DialogDescription className="text-brand-silver text-xs">
              Busque um jogador cadastrado ou selecione da lista.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            {!isRegistering ? (
              <div className="space-y-2">
                <div className="flex justify-between items-center mb-1">
                  <Label className="text-[10px] uppercase font-bold text-brand-silver">Buscar jogador</Label>
                  <Button 
                    variant="link" 
                    className="h-auto p-0 text-[10px] text-brand-gold font-bold uppercase"
                    onClick={() => setIsRegistering(true)}
                  >
                    + Novo cadastro
                  </Button>
                </div>
                <div className="relative">
                  <Search className="absolute left-3 top-2.5 h-4 w-4 text-brand-silver/50" />
                  <Input 
                    placeholder="Nome ou WhatsApp..." 
                    value={query} 
                    onChange={e => setQuery(e.target.value)}
                    className="pl-9 bg-brand-surface/50 border-brand-border text-xs"
                  />
                </div>
                
                {searchResults?.players && query.length >= 2 && (
                  <div className="bg-brand-surface/80 border border-brand-border rounded-md mt-1 divide-y divide-brand-border/40 max-h-40 overflow-y-auto">
                    {searchResults.players.map(p => (
                      <div 
                        key={p.id} 
                        onClick={() => { setSelectedPlayer(p); setQuery(""); }}
                        className="p-2.5 hover:bg-brand-gold/10 cursor-pointer flex justify-between items-center transition-colors"
                      >
                        <span className="text-xs text-brand-white font-medium">{p.name}</span>
                        <span className="text-[10px] text-brand-silver">{p.phone_normalized}</span>
                      </div>
                    ))}
                    {searchResults.players.length === 0 && (
                      <div className="p-4 text-center">
                        <p className="text-xs text-brand-silver italic mb-3">Nenhum jogador encontrado.</p>
                        <Button 
                          variant="outline" 
                          size="sm" 
                          className="h-8 text-[11px] border-brand-gold/30 text-brand-gold hover:bg-brand-gold/10 w-full"
                          onClick={() => setIsRegistering(true)}
                        >
                          <UserPlus2 className="w-4 h-4 mr-2" /> Cadastrar novo jogador
                        </Button>
                      </div>
                    )}
                  </div>
                )}
              </div>
            ) : (
              <div className="space-y-3 animate-in fade-in slide-in-from-right-2">
                <div className="flex justify-between items-center mb-1">
                  <Label className="text-[10px] uppercase font-bold text-brand-gold">Novo Cadastro</Label>
                  <Button 
                    variant="link" 
                    className="h-auto p-0 text-[10px] text-brand-silver uppercase"
                    onClick={() => setIsRegistering(false)}
                  >
                    Voltar para busca
                  </Button>
                </div>
                
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <Label className="text-[9px] text-brand-silver">Nome</Label>
                    <Input 
                      placeholder="Ex: João" 
                      value={newPlayerData.firstName} 
                      onChange={e => setNewPlayerData({...newPlayerData, firstName: e.target.value})}
                      className="h-8 text-xs bg-brand-surface/50 border-brand-border"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-[9px] text-brand-silver">Sobrenome</Label>
                    <Input 
                      placeholder="Ex: Silva" 
                      value={newPlayerData.lastName} 
                      onChange={e => setNewPlayerData({...newPlayerData, lastName: e.target.value})}
                      className="h-8 text-xs bg-brand-surface/50 border-brand-border"
                    />
                  </div>
                </div>

                <div className="space-y-1">
                  <Label className="text-[9px] text-brand-silver">WhatsApp</Label>
                  <Input 
                    placeholder="31999999999" 
                    value={newPlayerData.phone} 
                    onChange={e => setNewPlayerData({...newPlayerData, phone: e.target.value})}
                    className="h-8 text-xs bg-brand-surface/50 border-brand-border"
                  />
                </div>

                <div className="p-2 bg-brand-surface/40 border border-brand-border rounded text-[10px] text-brand-silver italic">
                  * O PIN será gerado automaticamente (123456) e o jogador terá acesso a esta turma.
                </div>
                
                <Button 
                  disabled={busy || !newPlayerData.firstName || !newPlayerData.phone}
                  onClick={async () => {
                    setBusy(true);
                    try {
                      const res = await signupFn({ data: { 
                        firstName: newPlayerData.firstName, 
                        lastName: newPlayerData.lastName, 
                        phone: newPlayerData.phone, 
                        pin: "123456", 
                        groupIds: [groupId],
                        remember: false
                      }});
                      toast.success("Jogador cadastrado!");
                      setSelectedPlayer({ id: res.player_id, name: `${newPlayerData.firstName} ${newPlayerData.lastName}` });
                      setIsRegistering(false);
                      setNewPlayerData({ firstName: "", lastName: "", phone: "" });
                    } catch (e: any) {
                      toast.error(friendlyError(e.message));
                    } finally {
                      setBusy(false);
                    }
                  }}
                  className="w-full bg-brand-gold text-brand-blue hover:bg-brand-gold/90 text-xs font-bold h-8"
                >
                  {busy ? "Cadastrando..." : "Cadastrar e selecionar"}
                </Button>
              </div>
            )}



            {selectedPlayer && (
              <div className="p-3 bg-brand-gold/5 border border-brand-gold/20 rounded-md animate-in fade-in slide-in-from-top-1">
                <div className="flex justify-between items-start">
                  <div>
                    <p className="text-[10px] uppercase font-bold text-brand-gold mb-1">Jogador selecionado</p>
                    <p className="text-sm font-bold text-brand-white">{selectedPlayer.name}</p>
                    <p className="text-[10px] text-brand-silver">{selectedPlayer.phone_normalized}</p>
                  </div>
                  <Button variant="ghost" size="icon" onClick={() => setSelectedPlayer(null)} className="h-6 w-6 text-brand-silver hover:text-red-400">
                    <Trash2 className="w-3.5 h-3.5" />
                  </Button>
                </div>
              </div>
            )}

            <div className="space-y-2 pt-2">
              <Label className="text-[10px] uppercase font-bold text-brand-silver">Adicionar em</Label>
              <Tabs value={targetList} onValueChange={v => setTargetList(v as any)} className="w-full">
                <TabsList className="grid grid-cols-3 bg-brand-surface/50 border border-brand-border">
                  <TabsTrigger value="auto" className="text-[10px]">Automático</TabsTrigger>
                  <TabsTrigger value="main" className="text-[10px]">Principal</TabsTrigger>
                  <TabsTrigger value="wait" className="text-[10px]">Reserva</TabsTrigger>
                </TabsList>
              </Tabs>
              <p className="text-[9px] text-brand-silver/60 italic leading-tight">
                * Automático: Insere na lista principal até {mainLimit} jogadores, depois na reserva.
              </p>
            </div>
          </div>

          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="outline" onClick={() => onOpenChange(false)} className="text-xs border-brand-border">Cancelar</Button>
            <Button 
              disabled={!selectedPlayer || busy} 
              onClick={() => handleAdd()}
              className="bg-brand-gold text-brand-blue hover:bg-brand-gold/90 text-xs font-bold"
            >
              {busy ? "Adicionando..." : "Adicionar jogador"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={forceConfirm} onOpenChange={setForceConfirm}>
        <AlertDialogContent className="bg-brand-surface border-brand-border">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-brand-white flex items-center gap-2">
              <AlertCircle className="w-5 h-5 text-amber-500" />
              Lista principal completa
            </AlertDialogTitle>
            <AlertDialogDescription className="text-brand-silver text-xs space-y-2">
              <p>A lista principal já atingiu o limite de {mainLimit} jogadores.</p>
              <p>Deseja inserir na lista principal mesmo assim? (O último titular será movido para a reserva).</p>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="text-xs border-brand-border">Cancelar</AlertDialogCancel>
            <AlertDialogAction 
              onClick={() => handleAdd(true)}
              className="bg-brand-gold text-brand-blue hover:bg-brand-gold/90 text-xs font-bold"
            >
              Sim, inserir na principal
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

function HistoryModal({ open, onOpenChange, events }: { open: boolean; onOpenChange: (o: boolean) => void; events: any[] }) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-brand-surface border-brand-border max-w-2xl">
        <DialogHeader>
          <DialogTitle className="text-brand-white font-display uppercase flex items-center gap-2">
            <History className="w-5 h-5 text-brand-gold" />
            Histórico de rodadas
          </DialogTitle>
          <DialogDescription className="text-brand-silver text-xs">
            Visualize o resumo das rodadas anteriores desta turma.
          </DialogDescription>
        </DialogHeader>

        <div className="py-4 overflow-x-auto">
          <table className="w-full text-[11px] text-left border-collapse">
            <thead>
              <tr className="border-b border-brand-border/40 text-brand-silver uppercase tracking-wider">
                <th className="pb-2 font-black">Data</th>
                <th className="pb-2 font-black">Status</th>
                <th className="pb-2 font-black text-center">Titulares</th>
                <th className="pb-2 font-black text-center">Reservas</th>
                <th className="pb-2 font-black text-center">Total</th>
                <th className="pb-2 font-black text-right">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-brand-border/20">
              {events.length > 0 ? events.map(e => (
                <tr key={e.id} className="hover:bg-brand-gold/5 transition-colors">
                  <td className="py-3 text-brand-white font-medium">
                    {new Date(e.event_date).toLocaleDateString("pt-BR")}
                  </td>
                  <td className="py-3">
                    <StatusBadge status={e.status} />
                  </td>
                  <td className="py-3 text-center text-brand-white">{e.main_count || 0}</td>
                  <td className="py-3 text-center text-brand-silver">{e.wait_count || 0}</td>
                  <td className="py-3 text-center font-bold text-brand-gold">{e.main_count + e.wait_count}</td>
                  <td className="py-3 text-right">
                    <Button variant="ghost" size="sm" className="h-7 text-[10px] text-brand-gold hover:bg-brand-gold/10">
                      Visualizar
                    </Button>
                  </td>
                </tr>
              )) : (
                <tr>
                  <td colSpan={6} className="py-10 text-center text-brand-silver/50 italic">Nenhuma rodada anterior encontrada.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} className="text-xs border-brand-border w-full sm:w-auto">Fechar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function PlayersTab() {
  const { groupId } = useAdminGroup();
  const listPlayers = useServerFn(admin_list_players);
  const { data } = useQuery({ queryKey: ["admin-players", groupId], queryFn: () => listPlayers({ data: { group_id: groupId } }) });
  return (
    <div className="space-y-2">
      {data?.players.map(p => (
        <div key={p.id} className="p-3 bg-brand-surface/30 rounded text-xs">{p.name}</div>
      ))}
    </div>
  );
}

function IncidentsTab() {
  const { groupId } = useAdminGroup();
  const list = useServerFn(admin_list_incidents);
  const { data } = useQuery({ queryKey: ["admin-incidents", groupId], queryFn: () => list({ data: { group_id: groupId } }) });
  return <div className="text-xs text-brand-silver">Total de ocorrências: {data?.incidents.length}</div>;
}

function TeamsTab() {
  return <div className="text-xs text-brand-silver">Funcionalidade de times em restauração...</div>;
}

function FundParticipantsTab() {
  const { groupId } = useAdminGroup();
  const list = useServerFn(admin_list_fund_participants);
  const { data } = useQuery({ queryKey: ["admin-fund", groupId], queryFn: () => list({ data: { group_id: groupId } }) });
  return <div className="text-xs text-brand-silver">Rateio carregado: {data?.items.length} participantes</div>;
}

function SettingsTab({ onOpenFundTab }: { onOpenFundTab: () => void }) {
  const { groupId } = useAdminGroup();
  const getConfig = useServerFn(admin_get_fund_config);
  const { data: res } = useQuery({ queryKey: ["admin-settings", groupId], queryFn: () => getConfig({ data: { group_id: groupId } }) });
  return (
    <div className="space-y-4">
      <ConfigSection title="Configurações">
        <p className="text-xs text-brand-silver">Configurações da turma {groupId}</p>
      </ConfigSection>
      <Button variant="outline" onClick={onOpenFundTab}>Config Rateio</Button>
    </div>
  );
}

function ApprovalsTab() {
  const list = useServerFn(admin_list_pending_approvals);
  const { data } = useQuery({ queryKey: ["approvals"], queryFn: () => list({ data: { status: "pending" } }) });
  return <div className="text-xs text-brand-silver">{data?.approvals.length} pendentes.</div>;
}

function AccessReviewTab() {
  const list = useServerFn(admin_list_players_to_review);
  const save = useServerFn(admin_save_reviewed_accesses);
  const getGroups = useServerFn(admin_list_groups);
  const [selectedPlayerIds, setSelectedPlayerIds] = useState<string[]>([]);
  const [targetGroups, setTargetGroups] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);

  const { data: players, refetch } = useQuery({ queryKey: ["access-review"], queryFn: () => list({ data: {} }) });
  const { data: groupsData } = useQuery({ queryKey: ["admin-groups"], queryFn: () => getGroups({ data: undefined }) });

  const togglePlayer = (id: string, e?: React.MouseEvent) => {
    e?.stopPropagation();
    setSelectedPlayerIds(prev => prev.includes(id) ? prev.filter(p => p !== id) : [...prev, id]);
  };

  const handleBulkSave = async () => {
    setBusy(true);
    await save({ data: { player_ids: selectedPlayerIds, group_ids: targetGroups } });
    setBusy(false);
    setSelectedPlayerIds([]);
    refetch();
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        {(groupsData?.groups ?? []).filter(g => g.active).map(g => (
          <Badge key={g.id} variant={targetGroups.includes(g.id) ? "default" : "outline"} className="cursor-pointer" onClick={() => setTargetGroups(prev => prev.includes(g.id) ? prev.filter(x => x !== g.id) : [...prev, g.id])}>{g.name}</Badge>
        ))}
      </div>
      <Button onClick={handleBulkSave} disabled={busy || !selectedPlayerIds.length || !targetGroups.length}>Salvar</Button>
      <div className="grid gap-2">
        {(players ?? []).map((p: any) => (
          <div key={p.id} className={cn("p-3 border rounded", selectedPlayerIds.includes(p.id) && "border-brand-gold")} onClick={() => togglePlayer(p.id)}>
            {p.name}
          </div>
        ))}
      </div>
    </div>
  );
}
