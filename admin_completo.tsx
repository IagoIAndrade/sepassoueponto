import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { LogOut, MoreVertical, Search, CheckCircle2, XCircle, Trash2, ShieldAlert, UserPlus, Info, Save, Settings as SettingsIcon, Users, List, Trophy, AlertTriangle, DollarSign, Edit2, Key, UserMinus, PlusCircle, UserCheck } from "lucide-react";
import { cn } from "@/lib/utils";


import { supabase } from "@/integrations/supabase/client";
import {
  ConfigSection,
  ScopeBadge,
  UnsavedBadge,
  useUnsavedSection,
} from "@/components/admin-config-section";
import { confirmDiscardUnsaved } from "@/lib/unsaved-guard";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import shieldAsset from "@/assets/shield.asset.json";
import { SkillsTab, SkillWeightsCard } from "@/components/admin-skills-tab";
import {
  DEFAULT_WEIGHTS,
  balanceStatus,
  distributePlayers,
  fmt1,
  isEvaluated,
  overallLevel,
  teamStats,
  type DistributionPlayer,
  type SkillWeights,
} from "@/lib/skills";

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

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

import {
  get_admin_event,
  admin_set_status,
  admin_create_next_event,
  admin_preview_next_event,
  admin_list_events,
  admin_remove,
  admin_add,
  admin_search_players,
  admin_list_players,
  admin_create_block,
  admin_end_block,
  admin_list_blocks,
  admin_save_teams,
  admin_update_settings,
  admin_set_group_active,
  admin_deactivate_player,
  admin_reactivate_player,
  admin_delete_player,
  admin_update_player_name,
  admin_request_pin_reset,
  admin_list_incidents,
  admin_accept_incident_justification,
  admin_cancel_incident,
  admin_update_incident_notes,
  admin_get_fund_config,
  admin_upsert_fund_config,
  admin_get_fund_dashboard,
  admin_list_fund_participants,
  admin_get_fund_participant,
  admin_create_fund_participant,
  admin_update_fund_participant,
  admin_set_payment_reported,
  admin_search_players_for_fund_link,
  admin_link_player_to_fund_participant,
  admin_unlink_player_from_fund_participant,
  admin_list_fund_payments,
  admin_add_fund_payment,
  admin_update_fund_payment,
  admin_delete_fund_payment,
  admin_list_pending_approvals,
  admin_process_group_request,
  admin_list_groups,
  admin_list_players_to_review,
  admin_save_reviewed_accesses,
  admin_set_access_restriction,
  type FundParticipantListItem,
  type FundParticipantStatus,
  type FundPaymentListItem,
  type PendingApproval,
  admin_get_skills_for_players,
  admin_get_skill_weights,
} from "@/lib/admin.functions";



import {
  AdminGroupProvider,
  AdminGroupSelector,
  useAdminGroup,
} from "@/lib/admin-group-context";
import { friendlyError } from "@/lib/error-messages";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";

export const Route = createFileRoute("/_admin/admin")({
  head: () => ({
    meta: [
      { title: "Painel — SE PASSOU, E PONTO" },
      { name: "robots", content: "noindex,nofollow" },
    ],
  }),
  component: AdminPanel,
});

type EventStatus = "scheduled" | "open" | "closed" | "completed" | "cancelled";

function StatusBadge({ status }: { status: EventStatus }) {
  const map: Record<EventStatus, { label: string; cls: string }> = {
    open: { label: "Aberta", cls: "bg-emerald-500/20 text-emerald-300 border-emerald-500/40" },
    closed: { label: "Fechada", cls: "bg-red-500/20 text-red-300 border-red-500/40" },
    scheduled: { label: "Programada", cls: "bg-amber-500/20 text-amber-300 border-amber-500/40" },
    completed: { label: "Finalizada", cls: "bg-zinc-500/20 text-zinc-300 border-zinc-500/40" },
    cancelled: { label: "Cancelada", cls: "bg-zinc-500/20 text-zinc-300 border-zinc-500/40" },
  };
  const s = map[status] ?? map.scheduled;
  return (
    <Badge variant="outline" className={`border ${s.cls} px-2 py-1 text-xs font-semibold`}>
      {s.label}
    </Badge>
  );
}

function formatDate(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  const date = new Date(y, (m ?? 1) - 1, d ?? 1);
  return date.toLocaleDateString("pt-BR", {
    weekday: "long",
    day: "2-digit",
    month: "long",
  });
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
              <img
                src={shieldAsset.url}
                alt="Escudo SE PASSOU, É PONTO"
                className="h-10 w-10 shrink-0 rounded-full ring-1 ring-brand-gold/40"
              />
              <div className="min-w-0">
                <h1 className="font-display text-base font-bold uppercase tracking-wide text-brand-white truncate">
                  Painel administrativo
                </h1>
                <p className="text-[11px] text-brand-silver truncate">SE PASSOU, É PONTO</p>
              </div>
            </div>
            <Button variant="outline" size="sm" onClick={handleLogout} className="shrink-0">
              <LogOut className="w-4 h-4 mr-1" /> Sair
            </Button>
          </div>
        </header>

        <main className="max-w-5xl mx-auto p-4 pb-24">
          <div className="mb-4">
            <h3 className="text-xs font-semibold text-muted-foreground uppercase mb-2">Gestão de acessos</h3>
            <Tabs
              value={tab}
              onValueChange={(v) => {
                if (v !== tab && !confirmDiscardUnsaved("Você está saindo desta aba.")) return;
                setTab(v);
              }}
              className="w-full"
            >
              <TabsList className="grid grid-cols-2 w-full h-auto mb-2">
                <TabsTrigger value="approvals" className="text-[11px] py-2 px-1">
                  Aprovações
                </TabsTrigger>
                <TabsTrigger value="review" className="text-[11px] py-2 px-1">
                  Acessos a revisar
                </TabsTrigger>
              </TabsList>
              <TabsContent value="approvals"><ApprovalsTab /></TabsContent>
              <TabsContent value="review"><AccessReviewTab /></TabsContent>
            </Tabs>
          </div>

          <div className="mb-4 pt-4 border-t border-brand-border">
            <h3 className="text-xs font-semibold text-muted-foreground uppercase mb-2">Gestão da turma</h3>
            <AdminGroupSelector />
            <Tabs
              value={tab}
              onValueChange={(v) => {
                if (v !== tab && !confirmDiscardUnsaved("Você está saindo desta aba.")) return;
                setTab(v);
              }}
              className="w-full"
            >
              <TabsList className="grid grid-cols-7 w-full h-auto">
                <TabsTrigger value="list" className="text-[11px] py-2 px-1">Lista</TabsTrigger>
                <TabsTrigger value="players" className="text-[11px] py-2 px-1">Jogadores</TabsTrigger>
                <TabsTrigger value="skills" className="text-[11px] py-2 px-1">Habilidades</TabsTrigger>
                <TabsTrigger value="incidents" className="text-[11px] py-2 px-1">Ocorrências</TabsTrigger>
                <TabsTrigger value="teams" className="text-[11px] py-2 px-1">Times</TabsTrigger>
                <TabsTrigger value="fund" className="text-[11px] py-2 px-1">Rateio</TabsTrigger>
                <TabsTrigger value="settings" className="text-[11px] py-2 px-1">Config</TabsTrigger>
              </TabsList>

              <TabsContent value="list" className="mt-4"><ListTab /></TabsContent>
              <TabsContent value="players" className="mt-4"><PlayersTab /></TabsContent>
              <TabsContent value="skills" className="mt-4"><SkillsTab /></TabsContent>
              <TabsContent value="incidents" className="mt-4"><IncidentsTab /></TabsContent>
              <TabsContent value="teams" className="mt-4"><TeamsTab /></TabsContent>
              <TabsContent value="fund" className="mt-4"><FundParticipantsTab /></TabsContent>
              <TabsContent value="settings" className="mt-4"><SettingsTab onOpenFundTab={() => setTab("fund")} /></TabsContent>
            </Tabs>
          </div>
        </main>
      </div>
    </AdminGroupProvider>
  );
}

function ListTab() {
  const { groupId } = useAdminGroup();
  const getEvent = useServerFn(get_admin_event);
  const setStatus = useServerFn(admin_set_status);
  const removePlayer = useServerFn(admin_remove);
  
  const { data: event, refetch } = useQuery({
    queryKey: ["admin-event", groupId],
    queryFn: () => getEvent({ data: { group_id: groupId } }),
    enabled: !!groupId,
  });

  const handleToggleStatus = async () => {
    if (!event?.event) return;
    const nextStatus = event.event.status === "open" ? "closed" : "open";
    try {
      await setStatus({ data: { event_id: event.event.id, status: nextStatus } });
      toast.success(`Lista ${nextStatus === "open" ? "aberta" : "fechada"}!`);
      refetch();
    } catch (e) {
      toast.error(friendlyError(e));
    }
  };

  const handleRemove = async (regId: string, name: string) => {
    if (!confirm(`Remover ${name} da lista?`)) return;
    try {
      await removePlayer({ data: { registration_id: regId } });
      toast.success("Removido com sucesso");
      refetch();
    } catch (e) {
      toast.error(friendlyError(e));
    }
  };

  if (!event?.event) return <div className="text-center py-10 text-brand-silver text-sm italic">Carregando evento da turma...</div>;

  return (
    <div className="space-y-6">
      <Card className="p-4 bg-brand-surface/40 border-brand-border">
        <div className="flex items-center justify-between mb-4">
          <div className="min-w-0">
            <h3 className="text-sm font-bold text-brand-white uppercase truncate">Rodada #{event.event.id.slice(0, 4)}</h3>
            <p className="text-[10px] text-brand-silver">Data: {new Date(event.event.event_date).toLocaleDateString()}</p>
          </div>
          <div className="flex items-center gap-2">
            <StatusBadge status={event.event.status as any} />
            <Button size="sm" onClick={handleToggleStatus} variant="outline" className="h-7 text-[10px] border-brand-gold/30 text-brand-gold px-2">
              {event.event.status === "open" ? "Fechar Lista" : "Abrir Lista"}
            </Button>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4 text-center border-t border-brand-border pt-4">
          <div>
            <p className="text-[9px] uppercase text-brand-silver font-bold">Inscritos</p>
            <p className="text-xl font-display text-brand-gold">{event.registrations.length}</p>
          </div>
          <div>
            <p className="text-[9px] uppercase text-brand-silver font-bold">Limite</p>
            <p className="text-xl font-display text-brand-white">{event.event.max_players || "--"}</p>
          </div>
        </div>
      </Card>

      <div className="space-y-2">
        <h4 className="text-[10px] font-bold text-brand-silver uppercase px-1">Jogadores na Lista</h4>
        {event.registrations.map((reg, idx) => (
          <div key={reg.id} className="flex items-center justify-between p-2.5 bg-brand-surface/30 border border-brand-border rounded-lg group">
            <div className="flex items-center gap-2 min-w-0">
              <span className="text-[10px] font-mono text-brand-gold/50 w-4">{idx + 1}.</span>
              <div className="min-w-0">
                <p className="text-xs font-bold text-brand-white truncate">{reg.player_name}</p>
                <p className="text-[9px] text-brand-silver uppercase">{reg.position || "Sem posição"}</p>
              </div>
            </div>
            <Button 
              variant="ghost" 
              size="icon" 
              className="h-7 w-7 text-red-400 hover:bg-red-500/10 md:opacity-0 group-hover:opacity-100 transition-opacity"
              onClick={() => handleRemove(reg.id, reg.player_name)}
            >
              <Trash2 className="w-3.5 h-3.5" />
            </Button>
          </div>
        ))}
        {event.registrations.length === 0 && (
          <p className="text-center py-8 text-brand-silver italic text-xs">Ninguém inscrito ainda.</p>
        )}
      </div>
    </div>
  );
}

function PlayersTab() {
  const { groupId } = useAdminGroup();
  const listPlayers = useServerFn(admin_list_players);
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);

  const { data, isLoading } = useQuery({
    queryKey: ["admin-players", search, page, groupId],
    queryFn: () => listPlayers({ data: { search, page, limit: 15, group_id: groupId } }),
  });

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-brand-silver" />
          <Input 
            placeholder="Buscar por nome ou celular..." 
            className="pl-9 bg-brand-surface/50 border-brand-border h-9 text-sm"
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1); }}
          />
        </div>
      </div>

      <div className="grid gap-2">
        {data?.players.map(p => (
          <Card key={p.id} className="p-3 bg-brand-surface/40 border-brand-border hover:border-brand-gold/20 transition-colors">
            <div className="flex items-center justify-between">
              <div className="min-w-0">
                <h4 className="text-sm font-bold text-brand-white truncate">{p.name}</h4>
                <div className="flex items-center gap-2 mt-0.5">
                  <span className="text-[10px] text-brand-silver">{p.phone_normalized}</span>
                  {p.is_admin && <Badge className="h-3.5 text-[8px] bg-brand-gold text-brand-black px-1">ADM</Badge>}
                </div>
              </div>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="icon" className="h-8 w-8 text-brand-silver">
                    <MoreVertical className="w-4 h-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="bg-brand-surface border-brand-border min-w-[140px]">
                  <DropdownMenuItem className="text-[11px] gap-2">
                    <Edit2 className="w-3.5 h-3.5" /> Editar dados
                  </DropdownMenuItem>
                  <DropdownMenuItem className="text-[11px] gap-2">
                    <Key className="w-3.5 h-3.5" /> Resetar PIN
                  </DropdownMenuItem>
                  <DropdownMenuSeparator className="bg-brand-border" />
                  <DropdownMenuItem className="text-[11px] gap-2 text-red-400 focus:text-red-400">
                    <UserMinus className="w-3.5 h-3.5" /> Desativar
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </Card>
        ))}
      </div>
      {isLoading && <div className="text-center py-8 text-brand-silver text-xs italic">Carregando jogadores...</div>}
    </div>
  );
}

function TeamsTab() {
  const { groupId } = useAdminGroup();
  const getEvent = useServerFn(get_admin_event);
  const saveTeams = useServerFn(admin_save_teams);
  const [localTeams, setLocalTeams] = useState<any[]>([]);
  const [isDirty, setIsDirty] = useState(false);

  const { data: event, refetch } = useQuery({
    queryKey: ["admin-teams", groupId],
    queryFn: () => getEvent({ data: { group_id: groupId } }),
    enabled: !!groupId,
  });

  useEffect(() => {
    if (event?.teams) {
      setLocalTeams(event.teams);
      setIsDirty(false);
    }
  }, [event]);

  const handleDistribute = () => {
    if (!event?.registrations) return;
    const players = [...event.registrations];
    const numTeams = 3;
    const newTeams: any[] = Array.from({ length: numTeams }, (_, i) => ({
      team_number: i + 1,
      players: []
    }));
    players.forEach((p, i) => {
      const teamIdx = i % numTeams;
      newTeams[teamIdx].players.push({
        id: p.id,
        player_id: p.player_id,
        player_name: p.player_name
      });
    });
    setLocalTeams(newTeams);
    setIsDirty(true);
  };

  const handleSave = async () => {
    if (!event?.event) return;
    try {
      await saveTeams({ data: { event_id: event.event.id, teams: localTeams } });
      toast.success("Times salvos!");
      setIsDirty(false);
      refetch();
    } catch (e) {
      toast.error(friendlyError(e));
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h3 className="text-[11px] font-bold text-brand-white uppercase">Formação de Equipes</h3>
        <div className="flex gap-2">
          <Button size="sm" variant="outline" onClick={handleDistribute} className="h-7 text-[10px] border-brand-gold/30 text-brand-gold">
            Auto-Gerar
          </Button>
          {isDirty && (
            <Button size="sm" onClick={handleSave} className="h-7 text-[10px] bg-brand-gold text-brand-black font-bold">
              Salvar
            </Button>
          )}
        </div>
      </div>

      <div className="grid gap-3 md:grid-cols-3">
        {localTeams.map((team, idx) => (
          <Card key={idx} className="p-3 bg-brand-surface/40 border-brand-border">
            <h4 className="text-[10px] font-bold text-brand-gold uppercase mb-3 text-center border-b border-brand-border pb-2">
              Time {team.team_number}
            </h4>
            <div className="space-y-1">
              {team.players.map((p: any) => (
                <div key={p.player_id} className="text-[10px] text-brand-white py-1.5 px-2 rounded bg-brand-surface/20 flex items-center justify-between group">
                  <span className="truncate">{p.player_name}</span>
                </div>
              ))}
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}

function IncidentsTab() {
  const { groupId } = useAdminGroup();
  const list = useServerFn(admin_list_incidents);
  const { data: res, isLoading } = useQuery({
    queryKey: ["admin-incidents", groupId],
    queryFn: () => list({ data: { group_id: groupId } }),
  });

  const incidents = Array.isArray(res) ? res : [];

  return (
    <div className="space-y-4">
      <h3 className="text-[11px] font-bold text-brand-white uppercase">Ocorrências</h3>
      {incidents.length === 0 && !isLoading && <p className="text-center py-8 text-brand-silver italic text-xs">Sem ocorrências.</p>}
      <div className="grid gap-2">
        {incidents.map((inc: any) => (
          <Card key={inc.incident_id} className="p-3 bg-brand-surface/40 border-brand-border">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-bold text-brand-white">{inc.player_name}</p>
                <p className="text-[9px] text-brand-silver">{new Date(inc.occurred_at).toLocaleDateString()} — {inc.incident_type === 'no_show' ? 'Falta' : 'Saída Tardia'}</p>
              </div>
              <Badge variant="outline" className={cn(
                "text-[8px] uppercase px-1 h-4",
                inc.status === 'pending' ? "border-amber-500 text-amber-500" : "border-emerald-500 text-emerald-500"
              )}>
                {inc.status === 'pending' ? 'Pendente' : 'OK'}
              </Badge>
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}


function FundParticipantsTab() {
  const { groupId } = useAdminGroup();
  const list = useServerFn(admin_list_fund_participants);
  const { data: res, isLoading } = useQuery({
    queryKey: ["admin-fund", groupId],
    queryFn: () => list({ data: { group_id: groupId } }),
  });

  const participants = res?.items ?? [];

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-[11px] font-bold text-brand-white uppercase">Rateio da Turma</h3>
        <Button size="sm" variant="outline" className="h-7 text-[10px] border-brand-gold/30 text-brand-gold">Novo</Button>
      </div>
      <div className="grid gap-2">
        {participants.map((p: any) => (
          <Card key={p.id} className="p-3 bg-brand-surface/40 border-brand-border">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-bold text-brand-white">{p.display_name}</p>
                <p className="text-[9px] text-brand-silver">Saldo: R$ {Number(p.balance || 0).toFixed(2)}</p>
              </div>
              <Badge className={cn(
                "text-[8px] px-1 h-4",
                p.status === 'up_to_date' ? "bg-emerald-500/20 text-emerald-400" : "bg-red-500/20 text-red-400"
              )}>
                {p.status === 'up_to_date' ? 'OK' : 'Pendente'}
              </Badge>
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}


function SettingsTab({ onOpenFundTab }: { onOpenFundTab: () => void }) {
  const { groupId } = useAdminGroup();
  const getConfig = useServerFn(admin_get_fund_config);
  const updateSettings = useServerFn(admin_update_settings);
  const { data: res } = useQuery({
    queryKey: ["admin-settings", groupId],
    queryFn: () => getConfig({ data: { group_id: groupId } }),
  });

  const config = res?.active;

  const handleToggleRestriction = async (val: boolean) => {
    try {
      await updateSettings({ 
        data: { 
          group_id: groupId!, 
          location: "Quadra", // Campos obrigatórios conforme schema
          start_time: "19:00",
          end_time: "21:00",
          main_limit: 18,
          event_weekday: 3,
          open_weekday: 1,
          open_time: "12:00",
          withdrawal_deadline_weekday: 2,
          withdrawal_deadline_time: "12:00",
          penalty_late_leave: 0,
          penalty_no_show: 0,
          show_rules_to_players: true,
          priority_minutes: 30,
          ...config, 
          access_restriction_active: val 
        } as any 
      });
      toast.success("Atualizado!");
    } catch (e) {
      toast.error(friendlyError(e));
    }
  };

  return (
    <div className="space-y-6">
      <ConfigSection title="Configurações">
        <div className="flex items-center justify-between p-3 bg-brand-surface/30 border border-brand-border rounded-lg">
          <div className="min-w-0 pr-4">
            <h4 className="text-xs font-bold text-brand-white">Restrição de Acesso</h4>
            <p className="text-[10px] text-brand-silver">Somente jogadores aprovados entram na lista.</p>
          </div>
          <Switch 
            checked={!!config?.access_restriction_active}
            onCheckedChange={handleToggleRestriction}
          />
        </div>
      </ConfigSection>

      <div className="grid grid-cols-2 gap-3">
        <Button variant="outline" className="h-12 flex flex-col gap-0.5 border-brand-border hover:bg-brand-surface/50 text-[10px] uppercase font-bold text-brand-white">
          <ShieldAlert className="w-3.5 h-3.5 text-brand-gold mb-0.5" />
          Bloqueios
        </Button>
        <Button variant="outline" className="h-12 flex flex-col gap-0.5 border-brand-border hover:bg-brand-surface/50 text-[10px] uppercase font-bold text-brand-white" onClick={onOpenFundTab}>
          <DollarSign className="w-3.5 h-3.5 text-brand-gold mb-0.5" />
          Config Rateio
        </Button>
      </div>
    </div>
  );
}



function ApprovalsTab() {
  const list = useServerFn(admin_list_pending_approvals);
  const process = useServerFn(admin_process_group_request);
  const [search, setSearch] = useState("");
  const [busy, setBusy] = useState<string | null>(null);

  const { data, refetch, isLoading } = useQuery({
    queryKey: ["approvals", search],
    queryFn: () => list({ data: { status: "pending", search } }),
  });

  const handleAction = async (player_id: string, group_id: string, status: "approved" | "rejected") => {
    setBusy(`${player_id}-${group_id}`);
    try {
      await process({ data: { player_id, group_id, status } });
      toast.success(status === "approved" ? "Acesso liberado!" : "Solicitação recusada.");
      refetch();
    } catch (e) {
      toast.error(friendlyError(e));
    } finally {
      setBusy(null);
    }
  };

  const pending = data?.approvals ?? [];

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-1">
        <h3 className="text-base font-bold text-brand-white uppercase">Aprovações Pendentes</h3>
        <p className="text-xs text-brand-silver">Novos cadastros ou jogadores solicitando acesso a turmas.</p>
      </div>

      <Input
        placeholder="Buscar por nome ou celular..."
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        className="bg-brand-surface/50"
      />

      {isLoading && <div className="text-center py-8 text-brand-silver">Carregando solicitações...</div>}
      
      {!isLoading && pending.length === 0 && (
        <Card className="p-8 text-center border-dashed border-brand-border bg-transparent">
          <p className="text-brand-silver italic">Nenhuma aprovação pendente no momento.</p>
        </Card>
      )}

      <div className="grid gap-3">
        {pending.map((a) => (
          <Card key={`${a.player_id}-${a.group_id}`} className="p-3 bg-brand-surface/40 border-brand-border hover:border-brand-gold/30 transition-colors">
            <div className="flex items-center justify-between gap-4">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <h4 className="font-bold text-sm text-brand-white truncate">
                    {a.first_name} {a.last_name}
                  </h4>
                  <Badge variant="outline" className="text-[9px] py-0 px-1 border-brand-gold/40 text-brand-gold bg-brand-gold/5">
                    {a.group_name}
                  </Badge>
                </div>
                <p className="text-[11px] text-brand-silver mt-0.5">{a.phone_normalized}</p>
              </div>
              
              <div className="flex gap-2 shrink-0">
                <Button 
                  size="sm" 
                  variant="outline" 
                  className="h-8 px-2 text-[11px] border-red-500/30 text-red-400 hover:bg-red-500/10"
                  disabled={!!busy}
                  onClick={() => handleAction(a.player_id, a.group_id, "rejected")}
                >
                  Recusar
                </Button>
                <Button 
                  size="sm" 
                  className="h-8 px-2 text-[11px] bg-emerald-600 hover:bg-emerald-500 text-white"
                  disabled={!!busy}
                  onClick={() => handleAction(a.player_id, a.group_id, "approved")}
                >
                  {busy === `${a.player_id}-${a.group_id}` ? "..." : "Aprovar"}
                </Button>
              </div>
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}

function AccessReviewTab() {
  const list = useServerFn(admin_list_players_to_review);
  const save = useServerFn(admin_save_reviewed_accesses);
  const getGroups = useServerFn(admin_list_groups);
  const [search, setSearch] = useState("");
  const [selectedPlayers, setSelectedPlayers] = useState<string[]>([]);
  const [targetGroups, setTargetGroups] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);

  const { data: players, refetch, isLoading } = useQuery({
    queryKey: ["access-review", search],
    queryFn: () => list({ data: { search } }),
  });

  const { data: groupsData } = useQuery({
    queryKey: ["admin-groups"],
    queryFn: () => getGroups({ data: undefined }),
  });

  const togglePlayer = (id: string) => {
    setSelectedPlayers(prev => 
      prev.includes(id) ? prev.filter(p => p !== id) : [...prev, id]
    );
  };

  const toggleGroup = (id: string) => {
    setTargetGroups(prev => 
      prev.includes(id) ? prev.filter(g => g !== id) : [...prev, id]
    );
  };

  const handleBulkSave = async () => {
    if (selectedPlayers.length === 0 || targetGroups.length === 0) {
      toast.error("Selecione ao menos um jogador e uma turma.");
      return;
    }
    setBusy(true);
    try {
      await save({ data: { player_ids: selectedPlayers, group_ids: targetGroups } });
      toast.success(`${selectedPlayers.length} jogadores atualizados!`);
      setSelectedPlayers([]);
      refetch();
    } catch (e) {
      toast.error(friendlyError(e));
    } finally {
      setBusy(false);
    }
  };

  const activeGroups = (groupsData?.groups ?? []).filter(g => g.active);

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-1">
        <h3 className="text-base font-bold text-brand-white uppercase">Acessos a Revisar</h3>
        <p className="text-xs text-brand-silver">Jogadores sem nenhuma turma atribuída. Defina seus acessos aqui.</p>
      </div>

      <div className="bg-brand-surface/40 border border-brand-border rounded-lg p-3 space-y-3">
        <Label className="text-[11px] uppercase text-brand-gold font-bold">Turmas de destino (Bulk)</Label>
        <div className="flex flex-wrap gap-2">
          {activeGroups.map(g => (
            <Badge 
              key={g.id}
              variant={targetGroups.includes(g.id) ? "default" : "outline"}
              className={cn(
                "cursor-pointer px-3 py-1 text-[11px]",
                targetGroups.includes(g.id) ? "bg-brand-gold text-brand-black" : "border-brand-border text-brand-silver"
              )}
              onClick={() => toggleGroup(g.id)}
            >
              {g.name}
            </Badge>
          ))}
        </div>
        <div className="pt-2 flex justify-between items-center gap-4">
          <p className="text-[10px] text-brand-silver italic">
            Selecione as turmas acima e os jogadores abaixo para liberar o acesso.
          </p>
          <Button 
            size="sm" 
            className="h-8 bg-brand-gold text-brand-black font-bold hover:bg-brand-gold/80"
            disabled={busy || selectedPlayers.length === 0 || targetGroups.length === 0}
            onClick={handleBulkSave}
          >
            {busy ? "Salvando..." : `Liberar para ${selectedPlayers.length} selecionados`}
          </Button>
        </div>
      </div>

      <Input
        placeholder="Filtrar jogadores..."
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        className="bg-brand-surface/50 h-9 text-sm"
      />

      {isLoading && <div className="text-center py-8 text-brand-silver text-sm italic">Carregando lista...</div>}

      <div className="grid gap-2">
        {(players ?? []).map((p: any) => (
          <div 
            key={p.id} 
            className={cn(
              "flex items-center justify-between p-3 border rounded-lg transition-colors cursor-pointer",
              selectedPlayers.includes(p.id) 
                ? "bg-brand-gold/10 border-brand-gold/40" 
                : "bg-brand-surface/30 border-brand-border"
            )}
            onClick={() => togglePlayer(p.id)}
          >
            <div className="min-w-0">
              <p className="text-sm font-bold text-brand-white truncate">{p.name}</p>
              <p className="text-[10px] text-brand-silver">{p.phone_normalized}</p>
            </div>
            {selectedPlayers.includes(p.id) ? (
              <Badge className="bg-brand-gold text-brand-black">Selecionado</Badge>
            ) : (
              <Badge variant="outline" className="border-brand-border text-brand-silver">Aguardando</Badge>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}


