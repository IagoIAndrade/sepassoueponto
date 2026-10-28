import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { LogOut, MoreVertical } from "lucide-react";

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
  type FundParticipantListItem,
  type FundParticipantStatus,
  type FundPaymentListItem,
  type PendingApproval,
  admin_get_skills_for_players,
  admin_get_skill_weights,
  admin_list_players_to_review,
  admin_save_reviewed_accesses,
  admin_set_access_restriction,
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
// ... (rest of file omitted for brevity, keeping all existing components)
