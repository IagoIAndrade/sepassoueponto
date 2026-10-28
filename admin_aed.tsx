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
  const [tab, setTab] = useState("list");
  async function handleLogout() {
    await supabase.auth.signOut();
    navigate({ to: "/admin/login", replace: true });
  }

  return (
    <AdminGroupProvider>
      <div className="min-h-dvh bg-brand-surface text-foreground">
        <header className="border-b border-brand-border sticky top-0 bg-brand-background/95 backdrop-blur z-20">
          <div className="max-w-5xl mx-auto flex items-center justify-between px-4 py-3">
             <div className="flex items-center gap-3">
               <img src={shieldAsset.url} className="h-10 w-10 shrink-0 rounded-full ring-1 ring-brand-gold/40" />
               <div>
                  <h1 className="font-display text-lg font-bold uppercase text-brand-white">Painel administrativo</h1>
                  <p className="text-[10px] text-brand-silver uppercase tracking-widest">SE PASSOU, E PONTO</p>
               </div>
             </div>
             <Button variant="ghost" size="sm" onClick={handleLogout} className="text-brand-silver hover:text-brand-white"><LogOut className="w-4 h-4 mr-2" /> Sair</Button>
          </div>
        </header>

        <main className="max-w-5xl mx-auto p-4 pb-24">
          <Tabs value={tab} onValueChange={(v) => { if (v !== tab && !confirmDiscardUnsaved("Você está saindo desta aba.")) return; setTab(v); }} className="w-full">
            <div className="mb-6 bg-brand-surface/40 p-3 rounded-lg border border-brand-border/60">
              <AdminGroupSelector />
            </div>

            <TabsList className="grid grid-cols-4 md:grid-cols-8 w-full h-auto bg-brand-surface/50 p-1 rounded-lg border border-brand-border gap-1">
              <TabsTrigger value="approvals" className="text-[10px] data-[state=active]:bg-brand-gold data-[state=active]:text-brand-blue uppercase font-bold">Aprovações</TabsTrigger>
              <TabsTrigger value="list" className="text-[10px] data-[state=active]:bg-brand-gold data-[state=active]:text-brand-blue uppercase font-bold">Lista</TabsTrigger>
              <TabsTrigger value="players" className="text-[10px] data-[state=active]:bg-brand-gold data-[state=active]:text-brand-blue uppercase font-bold">Jogadores</TabsTrigger>
              <TabsTrigger value="skills" className="text-[10px] data-[state=active]:bg-brand-gold data-[state=active]:text-brand-blue uppercase font-bold">Habilidades</TabsTrigger>
              <TabsTrigger value="incidents" className="text-[10px] data-[state=active]:bg-brand-gold data-[state=active]:text-brand-blue uppercase font-bold">Ocorrências</TabsTrigger>
              <TabsTrigger value="teams" className="text-[10px] data-[state=active]:bg-brand-gold data-[state=active]:text-brand-blue uppercase font-bold">Times</TabsTrigger>
              <TabsTrigger value="fund" className="text-[10px] data-[state=active]:bg-brand-gold data-[state=active]:text-brand-blue uppercase font-bold">Rateio</TabsTrigger>
              <TabsTrigger value="settings" className="text-[10px] data-[state=active]:bg-brand-gold data-[state=active]:text-brand-blue uppercase font-bold">Configurações</TabsTrigger>
            </TabsList>

            <div className="mt-6">
              <TabsContent value="approvals"><ApprovalsTab /></TabsContent>
              <TabsContent value="list" className="mt-0"><ListTab /></TabsContent>
              <TabsContent value="players"><PlayersTab /></TabsContent>
              <TabsContent value="skills"><SkillsTab /></TabsContent>
              <TabsContent value="incidents"><IncidentsTab /></TabsContent>
              <TabsContent value="teams"><TeamsTab /></TabsContent>
              <TabsContent value="fund"><FundParticipantsTab /></TabsContent>
              <TabsContent value="settings"><SettingsTab /></TabsContent>
            </div>
          </Tabs>
        </main>
      </div>
    </AdminGroupProvider>
  );
}

function ListTab() {
  const { groupId } = useAdminGroup();
  const getEvent = useServerFn(get_admin_event);
  const { data } = useQuery({ queryKey: ["admin-event", groupId], queryFn: () => getEvent({ data: { group_id: groupId } }) });
  
  if (!data?.event) return <div className="text-brand-silver italic text-xs">Nenhuma rodada ativa.</div>;
  
  const regs = data.registrations || [];
  const limit = data.event.main_limit || 18;
  const mainList = regs.slice(0, limit);
  const waitList = regs.slice(limit);

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
       <Card className="p-4 bg-brand-surface/40">
          <h3 className="font-bold text-brand-white mb-4">Lista Principal ({mainList.length} / {limit})</h3>
          <div className="space-y-2">
            {mainList.map((r, i) => (
              <div key={r.id} className="text-xs p-2 bg-brand-surface/60 rounded flex justify-between">
                <span>{i+1}. {r.players?.name}</span>
              </div>
            ))}
          </div>
       </Card>
       <Card className="p-4 bg-brand-surface/40">
          <h3 className="font-bold text-brand-white mb-4">Reserva ({waitList.length})</h3>
          <div className="space-y-2">
            {waitList.map((r, i) => (
              <div key={r.id} className="text-xs p-2 bg-brand-surface/60 rounded flex justify-between">
                <span>{i+1}. {r.players?.name}</span>
              </div>
            ))}
          </div>
       </Card>
    </div>
  );
}

function ApprovalsTab() {
  const list = useServerFn(admin_list_pending_approvals);
  const { data } = useQuery({ queryKey: ["approvals"], queryFn: () => list({ data: { status: "pending" } }) });
  return (
    <div className="space-y-2">
      {data?.approvals.map(a => (
        <Card key={a.player_id} className="p-3 bg-brand-surface/40 flex justify-between items-center">
           <span className="text-xs text-brand-white">{a.first_name} {a.last_name}</span>
           <Badge>{a.group_name}</Badge>
        </Card>
      ))}
    </div>
  );
}

function PlayersTab() {
  const { groupId } = useAdminGroup();
  const list = useServerFn(admin_list_players);
  const { data } = useQuery({ queryKey: ["admin-players", groupId], queryFn: () => list({ data: { group_id: groupId } }) });
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
      {data?.players.map(p => (
        <Card key={p.id} className="p-3 bg-brand-surface/40 text-xs text-brand-white">
          {p.name}
        </Card>
      ))}
    </div>
  );
}

function IncidentsTab() {
  const { groupId } = useAdminGroup();
  const list = useServerFn(admin_list_incidents);
  const { data } = useQuery({ queryKey: ["admin-incidents", groupId], queryFn: () => list({ data: { group_id: groupId } }) });
  return <div className="text-xs text-brand-silver">Total de ocorrências: {data?.incidents.length || 0}</div>;
}

function TeamsTab() {
  const { groupId } = useAdminGroup();
  const getEvent = useServerFn(get_admin_event);
  const { data } = useQuery({ queryKey: ["admin-event", groupId], queryFn: () => getEvent({ data: { group_id: groupId } }) });
  return (
     <div className="grid grid-cols-3 gap-2">
       {(data?.teams || []).map((t: any) => (
         <Card key={t.id} className="p-3 bg-brand-surface/40 text-xs text-brand-white">
           Time {t.team_number} ({t.team_members?.length || 0} jog.)
         </Card>
       ))}
     </div>
  );
}

function FundParticipantsTab() {
  const { groupId } = useAdminGroup();
  const list = useServerFn(admin_list_fund_participants);
  const { data } = useQuery({ queryKey: ["admin-fund", groupId], queryFn: () => list({ data: { group_id: groupId } }) });
  return (
    <div className="grid gap-2">
      {data?.items.map(p => (
        <Card key={p.id} className="p-3 bg-brand-surface/40 text-xs text-brand-white flex justify-between">
          <span>{p.name}</span>
          <span className={cn(p.status === 'in_full' ? "text-emerald-500" : "text-amber-500")}>{p.status}</span>
        </Card>
      ))}
    </div>
  );
}

function SettingsTab() {
  const { groupId } = useAdminGroup();
  return <div className="p-4 text-brand-silver text-xs">Configurações para {groupId}</div>;
}
