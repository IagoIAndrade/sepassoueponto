import { classifyRegistrations, formatRegistrationDateTime, getRegistrationSituation } from "@/lib/registration-classification";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState, useRef, useEffect, useMemo } from "react";
import { VisuallyHidden } from "@radix-ui/react-visually-hidden";
import { toast } from "sonner";

const BUILD_ID = "v2026.08.21.1400";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
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
import { Clock, Lock, ShieldAlert, ShieldCheck, Power, User, Calendar, ListOrdered, Users, Wallet, ChevronDown, ChevronUp, LogOut, Settings, History, Menu, X, Info as InfoIcon, ArrowRight, Camera, ArrowLeft, CheckCircle2, Eye, EyeOff, Loader2, Upload, UserRound, Pencil, RefreshCw, Bell, Check, PartyPopper, BellOff, Info, LogIn, ChevronRight, Plus, Smartphone, AlertCircle } from "lucide-react";

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { NotificationsDialog } from "@/components/NotificationsDialog";
import { getMyNotifications, markNotificationAsRead } from "@/lib/notifications.functions";
import { Skeleton } from "@/components/ui/skeleton";
import Cropper from "react-easy-crop";
import imageCompression from "browser-image-compression";
import { get_avatar_upload_url, confirm_avatar_upload, player_remove_avatar } from "@/lib/avatars.functions";
import { PlayerAvatarEditable } from "@/components/PlayerAvatarEditable";
import { PlayerAvatar } from "@/components/PlayerAvatar";
import { PlayerPhotoModal } from "@/components/PlayerPhotoModal";
import { supabase } from "@/integrations/supabase/client";
import { PlayerEventStatus } from "@/components/PlayerEventStatus";
import { EventContextCard } from "@/components/EventContextCard";
import { PlayerRoundStatusCard } from "@/components/PlayerRoundStatusCard";

import {
  player_signup,
  player_login,
  player_reset_pin,
  get_current_player,
  player_logout,
  join_self,
  get_my_registrations,
  update_my_player_name,
  player_get_my_self_rating,
  player_upsert_self_rating,
} from "@/lib/players.functions";
import { overallLevel } from "@/lib/skills";
import { type RegistrationResult, type PlayerEventStatus as StatusType } from "@/lib/players-signup.types";
import { get_my_history } from "@/lib/player-history.functions";
import { delete_my_player_account } from "@/lib/player-account.functions";
import { get_my_group_accesses, player_request_group_access } from "@/lib/group-access.functions";
import {
  get_current_event_full,
  search_players,
  join_other,
  leave_registration,
  get_my_fund_status_public,
  add_guest,
  remove_guest,
} from "@/lib/public.functions";
import { getRoundRegistrationState, calculateOpenAt } from "@/lib/round-state";
import { friendlyError } from "@/lib/error-messages";
import {
  FundPublicSummaryCard,
  MyFundStatusAlert,
  PlayerFundBadge,
} from "@/components/public-fund";
import { StatusPill, InfoTile, SectionNav, type PillTone } from "@/components/public-ui";
import { MobileNavBar, type TabId } from "@/components/MobileNavBar";
import { MyHistoryDialog } from "@/components/MyHistoryDialog";
import {
  playerFundStatusFor,
  normalizePublicFundStatus,
  type PlayerFundView,
} from "@/lib/public-fund-status";
import { savePushSubscription, removePushSubscription, getMyPushSubscriptions } from "@/lib/push.functions";
import { useIsMobile } from "@/hooks/use-mobile";
import { usePwaInstall } from "@/hooks/use-pwa-install";
import { PwaInstallCard } from "@/components/PwaInstallCard";
import { ThemeToggle } from "@/components/ThemeToggle";
import { PushSettingsDialog } from "@/components/PushSettingsDialog";
import { ProfileDialog, SelfRatingDialog } from "@/components/PlayerProfileMenu";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "SE PASSOU, É PONTO — A melhor pelada de vôlei" },
      { name: "description", content: "Participe das peladas do SE PASSOU, É PONTO. Listas abertas toda semana para Terça, Quarta, Quinta e Sábado." },
      { property: "og:title", content: "SE PASSOU, É PONTO — Vôlei toda semana" },
      { property: "og:description", content: "Entre na lista, confira os times e acompanhe o rateio da pelada mais organizada." },
      { property: "og:url", content: "https://se-passou-e-ponto.lovable.app" },
      { name: "twitter:title", content: "SE PASSOU, E PONTO — Vôlei toda semana" },
      { name: "twitter:description", content: "Entre na lista, confira os times e acompanhe o rateio da pelada mais organizada." },
    ],
    links: [
      { rel: "canonical", href: "https://se-passou-e-ponto.lovable.app" }
    ],
    styles: [
      {
        children: `
          /* Padronização visual: Lista e Times via tokens de tema */
          .bg-card\/60, .bg-card\/40 {
            background-color: color-mix(in srgb, var(--card-bg) 88%, transparent) !important;
            border-color: color-mix(in srgb, var(--card-border) 80%, transparent) !important;
            box-shadow: 0 4px 20px -2px rgba(0, 0, 0, 0.18) !important;
          }
          .dark .bg-card\/60, .dark .bg-card\/40 {
            box-shadow: 0 4px 20px -2px rgba(0, 0, 0, 0.45) !important;
          }
          /* Destaque sutil e elegante do jogador logado */
          .bg-primary\/5 {
            background-color: color-mix(in srgb, var(--accent-neon) 7%, transparent) !important;
            border-left: 3px solid var(--accent-neon) !important;
          }
          .bg-primary\/5:hover, .bg-primary\/10 {
            background-color: color-mix(in srgb, var(--accent-neon) 12%, transparent) !important;
          }
          /* Contraste e legibilidade para nomes e posições */
          .divide-y.divide-border\/40 > * {
            border-color: color-mix(in srgb, var(--card-border) 60%, transparent) !important;
          }
          .divide-y.divide-border\/40 > *:hover {
            background-color: color-mix(in srgb, var(--text) 4%, transparent);
          }
        `,
      },
    ]
  }),
  component: Index,
});

// ---------- helpers ----------
function formatDatePtBr(iso: string): string {
  if (!iso) return "";
  const [y, m, d] = iso.split("-").map(Number);
  const day = String(d).padStart(2, "0");
  const month = String(m).padStart(2, "0");
  return `${day}/${month}/${y}`;
}
function formatTime(t: string | null | undefined): string {
  if (!t) return "";
  return t.slice(0, 5).replace(":", "h");
}
function formatCreatedAt(iso: string): string {
  return formatRegistrationDateTime(iso) ?? "";
}
function formatScheduleDateTime(date: Date | null | undefined): {
  weekdayShort: string;
  formatted: string;
} | null {
  if (!date || isNaN(date.getTime())) return null;
  try {
    const dFmt = new Intl.DateTimeFormat("pt-BR", {
      timeZone: "America/Sao_Paulo",
      day: "2-digit",
      month: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      weekday: "short",
    });
    const parts = dFmt.formatToParts(date);
    const getPart = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
    const rawWeekday = getPart("weekday").replace(".", "").trim();
    const weekdayShort = rawWeekday ? rawWeekday.charAt(0).toUpperCase() + rawWeekday.slice(1) : "";
    const day = getPart("day");
    const month = getPart("month");
    const hour = getPart("hour");
    const minute = getPart("minute");
    return {
      weekdayShort,
      formatted: `${day}/${month} às ${hour}:${minute}`,
    };
  } catch {
    return null;
  }
}
function formatDeadlineLabel(iso: string, timezone: string): string {
  try {
    const d = new Date(iso);
    const weekday = new Intl.DateTimeFormat("pt-BR", {
      weekday: "long",
      timeZone: timezone,
    }).format(d);
    const time = new Intl.DateTimeFormat("pt-BR", {
      hour: "2-digit",
      minute: "2-digit",
      timeZone: timezone,
    }).format(d);
    return `${weekday}, às ${time.replace(":", "h")}`;
  } catch {
    return iso;
  }
}

type EventStatus = "scheduled" | "open" | "closed" | "completed" | "cancelled";
function StatusBadge({ status, className }: { status: EventStatus; className?: string }) {
  const map: Record<EventStatus, { label: string; cls: string }> = {
    open: { label: "Aberta", cls: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border-emerald-500/40" },
    closed: { label: "Fechada", cls: "bg-red-500/15 text-red-700 dark:text-red-300 border-red-500/40" },
    scheduled: { label: "Programada", cls: "bg-amber-500/15 text-amber-700 dark:text-amber-300 border-amber-500/40" },
    completed: { label: "Finalizada", cls: "bg-zinc-500/15 text-zinc-700 dark:text-zinc-300 border-zinc-500/40" },
    cancelled: { label: "Cancelada", cls: "bg-zinc-500/15 text-zinc-700 dark:text-zinc-300 border-zinc-500/40" },
  };
  const s = map[status] ?? map.scheduled;
  return (
    <Badge variant="outline" className={`border ${s.cls} px-2.5 py-1 text-xs font-semibold ${className}`}>
      {s.label}
    </Badge>
  );
}

const GROUP_STORAGE_KEY = "spp:selected-group";

// ---------- page ----------
function Index() {
  const qc = useQueryClient();
  const getEvent = useServerFn(get_current_event_full);
  const getMe = useServerFn(get_current_player);
  const getAccessesFn = useServerFn(get_my_group_accesses);
  const requestAccessFn = useServerFn(player_request_group_access);
  const getMyRegsFn = useServerFn(get_my_registrations);
  const joinSelfFn = useServerFn(join_self);
  const leaveFn = useServerFn(leave_registration);
  const addGuestFn = useServerFn(add_guest);
  const logout = useServerFn(player_logout);
  const updateNameFn = useServerFn(update_my_player_name);
  const deleteAccountFn = useServerFn(delete_my_player_account);
  const getMyHistoryFn = useServerFn(get_my_history);

  const [activeGroupId, setActiveGroupId] = useState<string | null>(null);
  const [rulesOpen, setRulesOpen] = useState(false);
  const [selectedPlayerForPhoto, setSelectedPlayerForPhoto] = useState<{
    id: string;
    name: string;
    avatar_path?: string | null;
    avatar_url?: string | null;
    position?: string | null;
  } | null>(null);

  const { canInstall: showPwaOption, install: installPwa } = usePwaInstall();

  const [realtimeStatus, setRealtimeStatus] = useState<'connecting' | 'subscribed' | 'closed' | 'error'>('connecting');

  const setGroupId = (id: string) => {
    setActiveGroupId(id);
    qc.removeQueries({ queryKey: ["event-full"] });
    try {
      localStorage.setItem(GROUP_STORAGE_KEY, id);
    } catch {
      /* ignore */
    }
  };

  const meQ = useQuery({
    queryKey: ["me"],
    queryFn: async () => {
      const res = await getMe();
      return res;
    },
    staleTime: 60_000,
  });

  const authReady = !meQ.isLoading && !meQ.isFetching;

  const [activeTab, setActiveTab] = useState<TabId>("inicio");

  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  const eventQ = useQuery({
    queryKey: ["event-full", activeGroupId],
    queryFn: () => {
      return getEvent({ data: { group_id: activeGroupId || null } });
    },
    refetchInterval: () => {
      if (realtimeStatus === 'subscribed') {
        return 60_000;
      }
      return 10_000;
    },
    refetchOnWindowFocus: true,
    refetchOnMount: "always",
    staleTime: 0,
  });

  const me = meQ.data?.player ?? null;
  const isPlayerAdmin = (me as any)?.role === 'admin';

  const [adminStatus, setAdminStatus] = useState<'loading' | 'authenticated' | 'unauthenticated'>('loading');
  const [authUserId, setAuthUserId] = useState<string | null>(null);
  const isAdminSupabase = adminStatus === 'authenticated';

  useEffect(() => {
    let mounted = true;

    async function checkAdminSession() {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        
        if (!session?.user?.id) {
          if (mounted) {
            setAdminStatus('unauthenticated');
            setAuthUserId(null);
          }
          return;
        }

        if (mounted) setAuthUserId(session.user.id);
        
        const { data, error } = await supabase.rpc("has_role", {
          _user_id: session.user.id,
          _role: "admin",
        });
        
        if (mounted) {
          if (error) {
            console.error("[ADMIN AUDIT] Erro na RPC has_role:", error);
            setAdminStatus('unauthenticated');
          } else {
            setAdminStatus(data ? 'authenticated' : 'unauthenticated');
          }
        }
      } catch (e) {
        console.error("[ADMIN AUDIT] Erro na verificação administrativa:", e);
        if (mounted) setAdminStatus('unauthenticated');
      }
    }

    checkAdminSession();
    
    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
      if (event === 'SIGNED_IN' || event === 'SIGNED_OUT' || event === 'USER_UPDATED' || event === 'TOKEN_REFRESHED') {
        checkAdminSession();
      }
    });

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, []); 

  const isAdmin = isAdminSupabase || isPlayerAdmin;

  useEffect(() => {
    if (import.meta.env.DEV) {
      console.log(`[APP BUILD] ${BUILD_ID}`, {
        buildId: BUILD_ID,
        hostname: window.location.hostname,
        pathname: window.location.pathname,
        supabaseSession: !!qc.getQueryData(["me"]),
        adminStatus,
        isAdminSupabase
      });
    }
  }, [adminStatus, isAdminSupabase, qc]);

  const groups = (eventQ.data as any)?.groups ?? [];

  useEffect(() => {
    if (groups.length > 0 && !activeGroupId) {
      try {
        const saved = localStorage.getItem(GROUP_STORAGE_KEY);
        const exists = groups.some((g: any) => g.id === saved);
        if (saved && exists) {
          setActiveGroupId(saved);
        } else {
          setActiveGroupId(groups[0].id);
        }
      } catch {
        setActiveGroupId(groups[0].id);
      }
    }
  }, [groups, activeGroupId]);

  const debounceTimerRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
      if (event === 'SIGNED_OUT') {
        return;
      }
      if (event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED') {
        const currentMe = qc.getQueryData(["me"]) as any;
        if (!currentMe?.player || event === 'TOKEN_REFRESHED') {
          qc.invalidateQueries({ queryKey: ["me"] });
        }
      }
    });

    return () => subscription.unsubscribe();
  }, [qc]);

  useEffect(() => {
    const myId = (meQ.data as any)?.player?.id;
    if (!myId) return;

    const channel = supabase
      .channel(`notifications-${myId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'notifications',
          filter: `player_id=eq.${myId}`
        },
        () => {
          qc.invalidateQueries({ queryKey: ["notifications"] });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [meQ.data, qc]);

  useEffect(() => {
    const eventId = eventQ.data?.event?.id;
    if (!eventId) return;

    const channel = supabase
      .channel(`event-updates-${eventId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'registrations',
          filter: `event_id=eq.${eventId}`
        },
        async (payload) => {
          const myId = (meQ.data as any)?.player?.id;
          if (myId && payload.new && (payload.new as any).player_id === myId) {
            const oldItem = payload.old as any;
            const newItem = payload.new as any;
            
            const wasCancelled = oldItem?.cancelled_at !== undefined && oldItem.cancelled_at !== null;
            const isNowActive = newItem.cancelled_at === null;
            const oldType = oldItem?.list_type;
            const newType = newItem.list_type;

            if (isNowActive && newType === 'main' && (oldType === 'waiting' || wasCancelled)) {
              toast.success("🏐 Você entrou na lista principal!", {
                duration: 5000,
                icon: '🎉'
              });
            }
          }

          if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
          debounceTimerRef.current = setTimeout(() => {
            qc.invalidateQueries({ queryKey: ["event-full", activeGroupId] });
            qc.invalidateQueries({ queryKey: ["my-registrations"] });
          }, 300);
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'volleyball_events',
          filter: `id=eq.${eventId}`
        },
        () => {
          qc.invalidateQueries({ queryKey: ["event-full", activeGroupId] });
        }
      )
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') setRealtimeStatus('subscribed');
        else if (status === 'CLOSED') setRealtimeStatus('closed');
        else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') setRealtimeStatus('error');
        else setRealtimeStatus('connecting');
      });

    return () => {
      if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
      setRealtimeStatus('closed');
      supabase.removeChannel(channel);
    };
  }, [eventQ.data?.event?.id, (meQ.data as any)?.player?.id, qc]);

  const activeGroup = groups?.find((g: any) => g.id === activeGroupId) ?? groups?.[0] ?? null;
  const event = eventQ.data?.event ?? null;
  const settings = eventQ.data?.settings ?? null;
  const regs = eventQ.data?.registrations ?? [];
  const eventLoading = eventQ.isLoading || eventQ.isFetching;
  const eventError = eventQ.isError ? eventQ.error : null;
  const hasValidEvent = !!event?.id;
  
  const mainLimit = event?.main_limit ?? settings?.main_limit ?? 18;

  const classified = classifyRegistrations(regs as any[], mainLimit);
  const sortedRegs = classified.all;
  const mainRegs = classified.starters;
  const waitRegs = classified.reserves;

  // Public count audit: check server aggregate count fallback when visitor doesn't receive raw registrations
  const rawPublicMainCount = 
    (event as any)?.main_count ?? 
    (event as any)?.starters_count ?? 
    (event as any)?.confirmed_count ?? 
    (eventQ.data as any)?.main_count ?? 
    (eventQ.data as any)?.counts?.main ?? 
    null;

  const rawPublicWaitlistCount = 
    (event as any)?.waitlist_count ?? 
    (event as any)?.reserves_count ?? 
    (event as any)?.waiting_count ?? 
    (eventQ.data as any)?.waitlist_count ?? 
    (eventQ.data as any)?.counts?.waiting ?? 
    null;

  const hasDetailedRegs = Array.isArray(eventQ.data?.registrations) && eventQ.data.registrations.length > 0;
  const hasServerCounts = typeof rawPublicMainCount === "number";

  const mainCount = hasDetailedRegs 
    ? mainRegs.length 
    : (typeof rawPublicMainCount === "number" ? rawPublicMainCount : mainRegs.length);

  const waitlistCount = hasDetailedRegs 
    ? waitRegs.length 
    : (typeof rawPublicWaitlistCount === "number" ? rawPublicWaitlistCount : waitRegs.length);

  // Distinguish absence of data from truly empty list: unauthenticated visitor seeing 0 without any confirmation
  const isCountUndetermined = !hasDetailedRegs && !hasServerCounts && !me && event?.status !== "scheduled";

  const teamsRaw = (eventQ.data as any)?.teams ?? [];
  const regMap = new Map((regs || []).map((r: any) => [r.id, r]));
  
  const avatarUrlMap = new Map<string, string>();
  (regs || []).forEach((r: any) => {
    if (r.player_avatar_url) avatarUrlMap.set(r.player_id, r.player_avatar_url);
  });

  const teamsGrouped: Record<number, Array<{ 
    id?: string;
    player_id: string; 
    player_name: string; 
    index: number; 
    avatar_path?: string | null;
    avatar_url?: string | null;
    primary_position?: string | null;
    is_guest?: boolean;
    registered_by_player_id?: string | null;
  }>> = {
    1: [],
    2: [],
    3: [],
  };
  
  for (const t of teamsRaw) {
    const n = Number(t.team_number);
    if (n === 1 || n === 2 || n === 3) {
      const members = (t.team_members || []).map((m: any, idx: number) => {
        const r = regMap.get(m.registration_id) as any;
        return {
          id: m.registration_id,
          player_id: r?.player_id || "unknown",
          player_name: r?.player_name || m?.player_name || "Jogador",
          index: idx,
          avatar_path: r?.player_avatar_path || m?.player_avatar_path || null,
          avatar_url: r?.player_avatar_url || m?.player_avatar_url || avatarUrlMap.get(r?.player_id || m?.player_id) || null,
          primary_position: r?.primary_position || m?.primary_position || null,
          is_guest: r?.is_guest,
          registered_by_player_id: r?.registered_by_player_id
        };
      });
      teamsGrouped[n] = members;
    }
  }
  const hasTeams = teamsRaw.length > 0;

  const eventData = eventQ.data as
    |
      {
        fund_summary?: React.ComponentProps<typeof FundPublicSummaryCard>["summary"];
        fund_statuses?: Array<{ player_id: string; status: string; has_paid?: boolean }>;
        registrations?: Array<{ id: string; player_id: string; player_avatar_url?: string | null }>;
      }
    | undefined;

  const fundSummary = eventData?.fund_summary ?? null;
  const fundStatusesRaw = eventData?.fund_statuses ?? [];
  const fundStatusMap = new Map<string, PlayerFundView>();
  for (const s of fundStatusesRaw) {
    fundStatusMap.set(s.player_id, {
      status: normalizePublicFundStatus(s.status),
      has_paid: s.has_paid === true,
    });
  }

  const accessesQ = useQuery({
    queryKey: ["my-accesses", me?.id],
    queryFn: async () => {
      const res = await getAccessesFn();
      return res;
    },
    enabled: !!me && authReady,
    staleTime: 60_000,
  });
  const myAccesses = accessesQ.data?.accesses ?? [];

  const myGroupsAccess: Record<string, string> = {};
  for (const a of myAccesses) {
    myGroupsAccess[a.group_id] = a.status;
  }
  const isApproved = !me || (activeGroupId && myGroupsAccess[activeGroupId] === "approved");

  const getMyFund = useServerFn(get_my_fund_status_public);
  const myFundQ = useQuery({
    queryKey: ["my-fund-status", me?.id ?? "anon", activeGroupId],
    queryFn: async () => {
      try {
        const res = await getMyFund({ data: { group_id: activeGroupId || "" } });
        return res;
      } catch (e) {
        return { status: null };
      }
    },
    enabled: !!me && !!activeGroupId && authReady,
    staleTime: 60_000,
  });

  const myFundStatus = myFundQ.data?.status ?? null;
  const myFundView = (() => {
    if (myFundQ.data) {
      return {
        status: normalizePublicFundStatus(myFundQ.data.status),
        has_paid: (myFundQ.data as any).has_paid === true,
      } satisfies PlayerFundView;
    }
    if (!me) return null;
    return fundStatusMap.get(me.id) ?? null;
  })();

  const [authOpen, setAuthOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [selfRatingOpen, setSelfRatingOpen] = useState(false);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [playerModalOpen, setPlayerModalOpen] = useState(false);
  const [addOtherOpen, setAddOtherOpen] = useState(false);
  const [myRegsOpen, setMyRegsOpen] = useState(false);
  const [rateioOpen, setRateioOpen] = useState(false);

  const panelOpen = authOpen || profileOpen || historyOpen || selfRatingOpen || notificationsOpen || playerModalOpen || addOtherOpen || myRegsOpen || rateioOpen;

  useEffect(() => {
    if (!panelOpen) return;

    const style = document.createElement("style");
    style.setAttribute("data-dialog-position-fix", "true");
    style.textContent = `
      body:has([role="dialog"][data-state="open"]) nav.fixed.bottom-0,
      body:has([role="dialog"][data-state="open"]) [data-mobile-nav] {
        display: none !important;
      }
      [role="dialog"][data-state="open"]:not([data-mobile-fullscreen-dialog="true"]) {
        width: calc(100vw - 32px) !important;
        max-width: 400px !important;
        max-height: calc(100dvh - 32px) !important;
        margin: 0 !important;
        overflow-y: auto !important;
      }
      [role="dialog"][data-mobile-fullscreen-dialog="true"][data-state="open"] {
        width: 100% !important;
        height: 100dvh !important;
        max-width: none !important;
        max-height: none !important;
        margin: 0 !important;
        border-radius: 0 !important;
        border: none !important;
      }
    `;
    document.head.appendChild(style);

    return () => {
      style.remove();
    };
  }, [panelOpen]);

  const sessionExpiredNotifiedRef = useRef(false);
  useEffect(() => {
    if (meQ.data?.session_expired && !sessionExpiredNotifiedRef.current) {
      sessionExpiredNotifiedRef.current = true;
      toast.info("Atenção: A validade da sua sessão expirou ou foi invalidada para segurança. Por favor, faça login novamente.");
    }
  }, [meQ.data?.session_expired]);

  const currentAccess = useMemo(() => myAccesses.find((a: any) => a.group_id === activeGroupId), [myAccesses, activeGroupId]);
  const accessStatus = currentAccess?.status || "none";
  const hasGlobalPriority = Boolean(
    (eventQ.data as any)?.current_player_profile?.has_global_priority === true ||
    (me as any)?.has_global_priority === true ||
    (me as any)?.has_priority === true ||
    (currentAccess as any)?.has_global_priority === true ||
    (accessesQ.data as any)?.has_global_priority === true
  );
  const hasPriority = hasGlobalPriority || currentAccess?.has_priority === true;
  
  const myRegsQ = useQuery({
    queryKey: ["my-regs", event?.id ?? null, me?.id ?? null, activeGroupId],
    queryFn: () => getMyRegsFn({ data: { event_id: event!.id } }),
    enabled: !!me && !!event,
    refetchInterval: 20_000,
  });
  const myRegs = (myRegsQ.data?.registrations ?? []) as any[];
  const myRegistrationSituation = useMemo(
    () => getRegistrationSituation(sortedRegs as any[], mainLimit, me?.id ?? (myRegsQ.data as any)?.player_id ?? null),
    [sortedRegs, mainLimit, me?.id, myRegsQ.data]
  );
  const mySelfReg = myRegistrationSituation.registration || myRegs.find((r) => (r.is_self || r.player_id === me?.id) && !r.cancelled_at) || null;
  const iAmInscribed = myRegistrationSituation.isRegistered || !!mySelfReg;
  const myTotal = myRegs.length;
  const remainingSlots = Math.max(0, 2 - myTotal);

  const playerStatus: StatusType = useMemo(() => {
    if (!event) return 'EVENT_CLOSED';
    if (event.status === 'closed' || event.status === 'completed' || event.status === 'cancelled') return 'EVENT_CLOSED';
    if (!mySelfReg) return 'NOT_REGISTERED';
    if (mySelfReg.cancelled_at) return 'LEFT_EVENT';
    
    if (!myRegistrationSituation.isRegistered) return 'NOT_REGISTERED';
    
    if (myRegistrationSituation.isStarter) {
      if (mySelfReg.metadata?.promoted_at) return 'PROMOTED_FROM_WAITLIST';
      return 'MAIN_LIST';
    }
    return 'WAITLIST';
  }, [event, mySelfReg, myRegistrationSituation]);

  const playerPosition = useMemo(() => {
    return myRegistrationSituation.position ?? undefined;
  }, [myRegistrationSituation.position]);

  const teamsList = useMemo(() => {
    const raw = (event as any)?.teams_data || (eventQ.data as any)?.teams_data || (eventQ.data as any)?.teams || [];
    if (!Array.isArray(raw)) return [];
    return raw.filter((t: any) => Array.isArray(t.players) && t.players.length > 0);
  }, [event, eventQ.data]);

  const hasPublishedTeams = teamsList.length > 0;

  const [promotionAlertOpen, setPromotionAlertOpen] = useState(false);
  
  useEffect(() => {
    if (playerStatus === 'PROMOTED_FROM_WAITLIST') {
      const notifications = (qc.getQueryData(["notifications"]) as any)?.notifications ?? [];
      const promoNotif = notifications.find((n: any) => n.type === 'promoted_to_main' && !n.read_at && n.event_id === event?.id);
      
      if (promoNotif) {
        setPromotionAlertOpen(true);
      }
    }
  }, [playerStatus, event?.id, qc]);
  useEffect(() => {
    const url = new URL(window.location.href);
    const group = url.searchParams.get('group');
    const eventId = url.searchParams.get('event');
    const view = url.searchParams.get('view');
    
    if (group && group !== activeGroupId) {
      setGroupId(group);
    }
    if (view && view !== activeTab) {
      setActiveTab(view as TabId);
    }
  }, []);
  
  const [selectedPlayerPhoto, setSelectedPlayerPhoto] = useState<{ 
    id: string; 
    name: string; 
    avatar_path?: string | null;
    phone?: string | null; 
    group_name?: string | null; 
    position?: string | null 
  } | null>(null);

  const isAnyModalOpen = authOpen || addOtherOpen || myRegsOpen || historyOpen || selfRatingOpen || profileOpen || notificationsOpen || !!selectedPlayerPhoto;
  const [joinBusy, setJoinBusy] = useState(false);
  const [addOtherBusy, setAddOtherBusy] = useState(false);
  const [leaveBusy, setLeaveBusy] = useState(false);
  const [leaveConfirmOpen, setLeaveConfirmOpen] = useState(false);
  const [leaveNote, setLeaveNote] = useState("");
  useEffect(() => {
    if (leaveConfirmOpen) setLeaveNote("");
  }, [leaveConfirmOpen]);
  const [lateLeaveInfo, setLateLeaveInfo] = useState<{
    registration_id: string;
    deadline_at: string;
    penalty: number;
    timezone: string;
  } | null>(null);
  const pendingJoinRef = useRef(false);
  const [editNameOpen, setEditNameOpen] = useState(false);
  const [editNameValue, setEditNameValue] = useState("");
  const [editNameBusy, setEditNameBusy] = useState(false);
  const [deleteAccountConfirmOpen, setDeleteAccountConfirmOpen] = useState(false);
  const [deleteAccountBusy, setDeleteAccountBusy] = useState(false);

  const [pushSettingsOpen, setPushSettingsOpen] = useState(false);

  const [pushStatus, setPushStatus] = useState<"unsupported" | "default" | "granted" | "denied">("default");
  const [isPushSubscribed, setIsPushSubscribed] = useState(false);
  const [pushBusy, setPushBusy] = useState(false);

  const [loadingPush, setLoadingPush] = useState(true);

  useEffect(() => {
    if (!('serviceWorker' in navigator) || !('PushManager' in window))
      return;

    setPushStatus(Notification.permission);

    navigator.serviceWorker.register('/sw-push.js')
      .then(registration => {
        navigator.serviceWorker.addEventListener('message', (event) => {
          if (event.data?.type === 'NAVIGATE') {
            const url = new URL(event.data.url, window.location.origin);
            const group = url.searchParams.get('group');
            const view = url.searchParams.get('view');
            
            if (group) setGroupId(group);
            if (view) setActiveTab(view as TabId);
          }
        });
        return registration.pushManager.getSubscription();
      })
      .then(subscription => {
        setIsPushSubscribed(!!subscription);
      })
      .catch(err => {
        console.error('[PUSH] Service Worker registration failed:', err);
      })
      .finally(() => {
        setLoadingPush(false);
      });
  }, []);

  useEffect(() => {
    if (!me || loadingPush || !authReady) return;
    
    const checkSub = async () => {
      try {
        const res = await getMyPushSubscriptions();
        const hasSub = (res.subscriptions ?? []).length > 0;
        setIsPushSubscribed(hasSub);
      } catch (e) {
      }
    };
    checkSub();
  }, [me, loadingPush, getMyPushSubscriptions, authReady]);

  const handleTogglePush = async () => {
    if (pushBusy) return;
    setPushBusy(true);

    try {
      if (isPushSubscribed) {
        const registration = await navigator.serviceWorker.ready;
        const subscription = await registration.pushManager.getSubscription();
        if (subscription) {
          await removePushSubscription({ data: { endpoint: subscription.endpoint } });
          await subscription.unsubscribe();
        }
        setIsPushSubscribed(false);
        toast.success("Notificações desativadas.");
      } else {
        const permission = await Notification.requestPermission();
        setPushStatus(permission);

        if (permission === 'granted') {
          const registration = await navigator.serviceWorker.ready;
          
          const publicKey = import.meta.env.VITE_VAPID_PUBLIC_KEY || "BPk75GKjg5RWQr_zdJdh6uc8IvI3ZGc4DOuxwgEBv6vIwWPiMhLbLH31pQGgbXzqG454c_F-Z8j4fLr2SaptvyA";
          
          let subscription = await registration.pushManager.getSubscription();
          if (!subscription) {
            subscription = await registration.pushManager.subscribe({
              userVisibleOnly: true,
              applicationServerKey: publicKey
            });
          }

          const subJson = subscription.toJSON();
          
          if (!subJson.endpoint || !subJson.keys?.p256dh || !subJson.keys?.auth) {
            throw new Error("Erro ao gerar chaves de inscrição no navegador.");
          }

          const res = await savePushSubscription({
            data: {
              endpoint: subscription.endpoint,
              p256dh: subJson.keys.p256dh,
              auth: subJson.keys.auth,
              user_agent: navigator.userAgent
            }
          });

          if (res.success) {
            setIsPushSubscribed(true);
            toast.success("Notificações ativadas com sucesso!");
          }
        } else if (permission === 'denied') {
          toast.error("Permissão de notificação negada pelo navegador.");
        }
      }
    } catch (err: any) {
      const msg = err.message || "";
      if (msg.includes("unauthorized") || msg.includes("Unauthorized") || msg.includes("expirada") || msg.includes("invalid_session")) {
        toast.error("Erro ao configurar notificações: Sessão expirada. Por favor, entre novamente.");
      } else if (msg.includes("Not allowed") || msg.includes("denied")) {
        toast.error("Permissão de notificação negada pelo navegador.");
      } else {
        toast.error(`Erro ao configurar notificações: ${msg || 'Erro desconhecido'}`);
      }
    } finally {
      setPushBusy(false);
    }
  };

  const currentEventDate = event?.event_date ?? null;
  const roundState = (event && settings && currentEventDate) 
    ? getRoundRegistrationState(
        { event_date: currentEventDate, status: event.status },
        {
          open_weekday: Number(settings.open_weekday), 
          open_time: settings.open_time, 
          priority_minutes: Number(settings.priority_minutes ?? 0),
          close_weekday: Number(settings.close_weekday ?? settings.event_weekday ?? 0),
          close_time: settings.close_time
        },
        now
      )
    : null;

  const status: EventStatus = (event?.status as EventStatus) ?? "scheduled";
  
  const canJoin = status === "open" && roundState ? (roundState.phase === "priority" || roundState.phase === "general") : false;
  const guestLimit = Number((settings as any)?.limite_convidados_por_usuario ?? 1);
  const guestRegistrations = ((eventQ.data as any)?.registrations || []) as any[];
  const myGuestCount = me ? guestRegistrations.filter((r: any) => r.is_guest && r.registered_by_player_id === me.id).length : 0;
  const guestReleaseAt = (() => {
    const evDate = currentEventDate;
    if (!evDate || (settings as any)?.dia_liberacao_convidado === null || (settings as any)?.dia_liberacao_convidado === undefined || !(settings as any)?.hora_liberacao_convidado) return null;
    try {
      const eventDate = new Date(`${evDate}T12:00:00`);
      if (isNaN(eventDate.getTime())) return null;
      const eventDow = eventDate.getDay();
      const releaseDow = Number((settings as any).dia_liberacao_convidado);
      const delta = (eventDow - releaseDow + 7) % 7;
      const releaseDate = new Date(eventDate);
      releaseDate.setDate(eventDate.getDate() - delta);
      const datePart = releaseDate.toISOString().slice(0, 10);
      return new Date(`${datePart}T${String((settings as any).hora_liberacao_convidado).slice(0, 5)}:00-03:00`);
    } catch {
      return null;
    }
  })();
  const guestReleaseReached = !!guestReleaseAt && now >= guestReleaseAt.getTime();
  const guestEnabled = !!(settings as any)?.convidados_habilitados;
  const canAddGuest = !!me && !!event && canJoin && guestEnabled && guestReleaseReached && myGuestCount < guestLimit;

  const photoRequired = !!me && !(me as any).has_valid_photo && !isAdmin;

  const isMobile = useIsMobile();
  const isDesktop = !isMobile;

  const priorityActive = canJoin && roundState?.phase === "priority";
  const priorityEndAt = roundState?.priorityEndsAt ?? null;
  const priorityRemainingMs = priorityEndAt
    ? Math.max(0, priorityEndAt.getTime() - now)
    : 0;
  const priorityCountdownLabel = roundState?.countdown || "00:00:00";

  const priorityJustEndedRef = useRef(false);
  useEffect(() => {
    if (priorityEndAt && priorityRemainingMs === 0 && !priorityJustEndedRef.current && roundState?.phase === "general") {
      priorityJustEndedRef.current = true;
      qc.invalidateQueries({ queryKey: ["event-full"] });
      qc.invalidateQueries({ queryKey: ["my-regs"] });
      qc.invalidateQueries({ queryKey: ["my-history"] });
    }
    if (priorityRemainingMs > 0) priorityJustEndedRef.current = false;
  }, [priorityRemainingMs, priorityEndAt?.getTime(), roundState?.phase]);

  const handleOpenPlayerModal = (reg: any) => {
    const rawPos = reg.primary_position || reg.position || reg.player_skills?.primary_position || reg.player?.primary_position;
    const pos = rawPos && rawPos !== "undefined" && rawPos !== "null" && rawPos !== "Sem posição definida" ? String(rawPos).toUpperCase() : null;
    setSelectedPlayerForPhoto({
      id: reg.player_id || reg.id,
      name: reg.player_name || reg.name || "Jogador",
      avatar_path: reg.player_avatar_path || reg.avatar_path || reg.player_avatar || null,
      avatar_url: reg.avatar_url || reg.player_avatar_url || avatarUrlMap.get(reg.player_id) || null,
      position: pos,
    });
  };

  const openRemainingMs = roundState?.openAt ? roundState.openAt.getTime() - now : 0;
  const closeRemainingMs = roundState?.closeAt ? roundState.closeAt.getTime() - now : 0;
  const openJustEndedRef = useRef(false);
  const closeJustEndedRef = useRef(false);

  useEffect(() => {
    if (openRemainingMs <= 0 && roundState?.isPending && !openJustEndedRef.current) {
      openJustEndedRef.current = true;
      qc.invalidateQueries({ queryKey: ["event-full"] });
    }
    if (openRemainingMs > 0) openJustEndedRef.current = false;
  }, [openRemainingMs, roundState?.isPending]);

  useEffect(() => {
    if (closeRemainingMs <= 0 && status === "open" && !closeJustEndedRef.current) {
      closeJustEndedRef.current = true;
      qc.invalidateQueries({ queryKey: ["event-full"] });
    }
    if (closeRemainingMs > 0) closeJustEndedRef.current = false;
  }, [closeRemainingMs, status]);

  const priorityBlocksMe = priorityActive && !!me && !hasPriority && !isAdmin;

  const refreshAll = async () => {
    await Promise.all([
      qc.invalidateQueries({ queryKey: ["event-full"] }),
      qc.invalidateQueries({ queryKey: ["me"] }),
      qc.invalidateQueries({ queryKey: ["my-regs"] }),
      qc.invalidateQueries({ queryKey: ["my-history"] }),
      qc.invalidateQueries({ queryKey: ["my-fund-status"] }),
    ]);
  };

  const [guestName, setGuestName] = useState("");
  const [guestBusy, setGuestBusy] = useState(false);
  const [addGuestOpen, setAddGuestOpen] = useState(false);
  const [removeGuestConfirm, setRemoveGuestConfirm] = useState<{ open: boolean, guest: any | null }>({ open: false, guest: null });
  const removeGuestFn = useServerFn(remove_guest);

  const doJoinSelf = async () => {
    if (!event || joinBusy) return;
    setJoinBusy(true);
    const currentEventId = event.id;
    const loadingToast = toast.loading("Processando sua inscrição...");
    try {
      const res = await joinSelfFn({ data: { event_id: currentEventId } });
      
      if (res && (res as any).error) {
        throw new Error((res as any).error);
      }

      await refreshAll();
      toast.success("Inscrição confirmada!", { id: loadingToast });
    } catch (error: any) {
      toast.error(friendlyError(error), { id: loadingToast });
      qc.invalidateQueries({ queryKey: ["event-full", activeGroupId] });
    } finally {
      setJoinBusy(false);
    }
  };

  const doAddGuest = async () => {
    if (!event || guestBusy) return;
    
    if (event.status === "scheduled") {
      toast.error("A lista ainda não foi aberta.");
      return;
    }
    
    const cleaned = guestName.replace(/\s+/g, " ").trim();
    if (cleaned.length < 2) {
      toast.error("Informe o nome do convidado.");
      return;
    }
    if (!me) {
      setAuthOpen(true);
      return;
    }
    if (!canAddGuest) {
      toast.error("Convidado ainda não liberado ou limite atingido.");
      return;
    }
    setGuestBusy(true);
    const loadingToast = toast.loading("Incluindo convidado...");
    try {
      await addGuestFn({ data: { event_id: event.id, nome_convidado: cleaned } });
      setGuestName("");
      setAddGuestOpen(false);
      toast.success("Convidado incluído na fila da rodada.", { id: loadingToast });
      await refreshAll();
    } catch (e) {
      toast.error(friendlyError(e), { id: loadingToast });
    } finally {
      setGuestBusy(false);
    }
  };

  const doLeaveSelf = async (confirmLate = false) => {
    const activeReg = (eventQ.data as any)?.current_player_registration;
    if (!activeReg || leaveBusy) return;
    if (status === "scheduled") {
      toast.error("A lista ainda não foi aberta. Ações bloqueadas.");
      return;
    }
    if (status === "closed" || status === "completed") {
      toast.error("A lista está fechada para saídas.");
      return;
    }
    setLeaveBusy(true);
    
    const loadingToast = !confirmLate ? toast.loading("Processando saída...") : null;
    
    try {
      const res: any = await leaveFn({
        data: { registration_id: activeReg.id, confirm_late_leave: confirmLate, note: leaveNote.trim() || null },
      });
      
      if (res?.status === "late_leave_confirmation_required") {
        if (loadingToast) toast.dismiss(loadingToast);
        setLeaveConfirmOpen(false);
        setLateLeaveInfo({
          registration_id: activeReg.id,
          deadline_at: res.deadline_at,
          penalty: Number(res.penalty_late_leave ?? 0),
          timezone: res.timezone || "America/Sao_Paulo",
        });
        return;
      }
      
      if (res?.status === "success" || res?.status === "already_cancelled") {
        setLeaveConfirmOpen(false);
        setLateLeaveInfo(null);
        setLeaveNote("");
        
        const successMsg = res.status === "success" ? "Você saiu da lista." : "Esta inscrição já estava cancelada.";
        if (loadingToast) {
          toast.success(successMsg, { id: loadingToast });
        } else {
          toast.success(successMsg);
        }
        
        await refreshAll();
        return;
      }

      throw new Error(res?.message || "Não foi possível confirmar a sua saída.");
    } catch (e: any) {
      if (loadingToast) toast.dismiss(loadingToast);
      
      const msg = e.message || "";
      if (msg.includes("not_authenticated") || msg.includes("invalid_session")) {
        setLeaveConfirmOpen(false);
        setLateLeaveInfo(null);
        await qc.invalidateQueries({ queryKey: ["me"] });
        toast.error("Sessão expirada. Por favor, entre novamente.");
        return;
      }

      toast.error(friendlyError(e));
    } finally {
      setLeaveBusy(false);
    }
  };

  if (meQ.isLoading) {
    return (
      <div className="fixed inset-0 z-[999] bg-background flex items-center justify-center p-6 text-center">
        <div className="space-y-4">
          <div className="w-12 h-12 border-4 border-[#ff2d78] border-t-transparent rounded-full animate-spin mx-auto"></div>
          <p className="text-[#ff2d78] Oswald uppercase font-bold tracking-widest animate-pulse">
            Carregando...
          </p>
        </div>
      </div>
    );
  }

  if (photoRequired) {
    return (
      <div className="fixed inset-0 z-[999] bg-background flex items-center justify-center p-6 text-center overflow-y-auto">
        <div className="w-full max-w-md space-y-8 animate-in fade-in zoom-in duration-300 py-10">
          <div className="space-y-2">
            <h1 className="text-3xl font-bold text-[#ff2d78] Oswald uppercase tracking-tight">
              Complete seu Perfil
            </h1>
            <p className="text-brand-silver text-sm">
              Para continuar, adicione uma foto de perfil real.
            </p>
            <p className="text-brand-silver/60 text-[10px] italic">
              A foto ajuda os outros jogadores a identificarem você na lista e nos times.
            </p>
          </div>

          <div className="bg-brand-surface/40 border border-brand-border p-8 rounded-2xl backdrop-blur-sm shadow-2xl">
            <PlayerAvatarEditable 
              path={me?.avatar_path} 
              name={me?.name || ""} 
              size="xl" 
            />
            
            <div className="mt-6 space-y-4">
              <p className="text-brand-silver text-[11px] leading-relaxed">
                Use uma foto real e atual em que seu rosto esteja visível.
              </p>
              
              <Button 
                variant="ghost" 
                onClick={() => logout().then(() => refreshAll())}
                className="text-[#ff2d78]/70 hover:text-[#ff2d78] text-[10px] uppercase Oswald font-bold"
              >
                Sair do sistema
              </Button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  const handleJoinClick = async () => {
    if (!event) return;
    if (!authReady) return;
    if (!canJoin) {
      toast.info(
        status === "scheduled"
          ? "As inscrições ainda não estão abertas."
          : "As inscrições não estão disponíveis.",
      );
      qc.invalidateQueries({ queryKey: ["event-full", activeGroupId] });
      return;
    }
    if (priorityBlocksMe) {
      toast.info("Aguarde a liberação geral para se inscrever nesta rodada.");
      return;
    }
    if ((eventQ.data as any)?.current_player_registration) {
      setLeaveConfirmOpen(true);
      return;
    }
    if (!me) {
      pendingJoinRef.current = false;
      setAuthOpen(true);
      return;
    }
    if (eventQ.data?.late_leave_incident) {
      toast.error("Você não pode retornar a esta rodada após confirmar uma saída fora do prazo.");
      return;
    }
    if (!event?.id || !activeGroupId) {
      toast.error("Nenhuma rodada ativa encontrada para esta turma.");
      return;
    }
    try {
      const res = await joinSelfFn({
        data: { event_id: event.id, group_id: activeGroupId, player_id: me.id }
      });
      if (res?.ok) {
        toast.success("Inscrição confirmada!");
      } else {
        throw new Error("Não foi possível entrar na lista.");
      }
    } catch (e: any) {
      toast.error(friendlyError(e));
      qc.invalidateQueries({ queryKey: ["event-full", activeGroupId] });
    } finally {
      qc.invalidateQueries({ queryKey: ["event-full", activeGroupId] });
    }
  };

  const handleAuthSuccess = async (mode: "login" | "signup") => {
    setAuthOpen(false);
    pendingJoinRef.current = false;
    
    if (mode === "signup") {
      // Feedback mantido exclusivamente no modal de confirmação para evitar notificação duplicada
      await refreshAll();
      return;
    }

    toast.success("Bem-vindo!");
    await refreshAll();
  };

  const handleAuthCancel = () => {
    pendingJoinRef.current = false;
  };

  const handleLogout = async () => {
    try {
      await logout();
      qc.setQueryData(["me"], { player: null, session_expired: false });
      qc.removeQueries({ queryKey: ["my-regs"] });
      qc.removeQueries({ queryKey: ["my-fund-status"] });
      qc.removeQueries({ queryKey: ["notifications"] });
      toast.success("Você saiu.");
      await refreshAll();
    } catch (e) {
      toast.error(friendlyError(e));
    }
  };

  const normalizeName = (v?: string | null) => (v || "").trim().toLowerCase();

  const roundStatusLabel = (() => {
    if (status === "open") return { label: "Aberta", color: "text-emerald-400 bg-emerald-500/10 border-emerald-500/30" };
    if (status === "scheduled") return { label: "Aguardando", color: "text-amber-400 bg-amber-500/10 border-amber-500/30" };
    return { label: "Encerrada", color: "text-zinc-400 bg-zinc-500/10 border-zinc-500/30" };
  })();

  const weekdayLabel = (() => {
    if (!currentEventDate) return "RODADA";
    try {
      const parts = currentEventDate.split("-").map(Number);
      const y = parts[0] ?? 0;
      const m = parts[1] ?? 1;
      const d = parts[2] ?? 1;
      const dt = new Date(y, m - 1, d);
      return new Intl.DateTimeFormat("pt-BR", { weekday: "long" }).format(dt).toUpperCase();
    } catch {
      return "RODADA";
    }
  })();

  const canLeave = !!(eventQ.data as any)?.current_player_registration && status === "open";

  const eventState = eventLoading
    ? "loading"
    : eventError
      ? "error"
      : hasValidEvent
        ? "valid"
        : "empty";

  // ---------- helper components for tab states ----------
  const TabLoadingSkeleton = () => (
    <div className="flex flex-col items-center justify-center py-16 gap-4">
      <Loader2 className="w-8 h-8 text-[var(--accent-neon)] animate-spin" />
      <p className="text-[11px] font-black uppercase tracking-widest text-[var(--text-muted)] Oswald animate-pulse">Carregando dados da rodada...</p>
    </div>
  );

  const TabErrorState = ({ onRetry }: { onRetry: () => void }) => (
    <div className="flex flex-col items-center justify-center py-16 gap-4">
      <AlertCircle className="w-10 h-10 text-red-600 dark:text-red-400" />
      <p className="text-[11px] font-black uppercase tracking-widest text-red-600 dark:text-red-400 Oswald">Erro ao carregar dados</p>
      <p className="text-[10px] text-[var(--text-muted)] Oswald uppercase">Não foi possível carregar as informações da rodada.</p>
      <Button
        onClick={onRetry}
        variant="outline"
        className="h-9 rounded-xl border-[var(--accent-neon)]/40 text-[var(--accent-neon)] text-xs font-black uppercase Oswald hover:bg-[var(--accent-neon)]/10"
      >
        <RefreshCw className="w-3.5 h-3.5 mr-1.5" />
        Tentar novamente
      </Button>
    </div>
  );

  const TabEmptyState = ({ message }: { message: string }) => (
    <div className="flex flex-col items-center justify-center py-16 gap-3">
      <Calendar className="w-10 h-10 text-[var(--text-muted)] opacity-60" />
      <p className="text-[11px] font-black uppercase tracking-widest text-[var(--text-muted)] Oswald">{message}</p>
    </div>
  );

  return (
    <div className="min-h-dvh bg-[var(--bg)] text-[var(--text)] pb-24 md:pb-safe overflow-x-hidden transition-colors duration-300">
      <div className="mx-auto w-full max-w-3xl py-3 sm:py-6 lg:max-w-[1060px] font-sans">
        {/* Cabeçalho */}
        <header className="sticky top-0 z-50 flex items-center justify-between bg-[color-mix(in_srgb,var(--bg)_95%,transparent)] py-2.5 backdrop-blur-md container-mobile md:mb-4 md:bg-transparent md:p-0 md:backdrop-blur-none px-4 border-b border-[var(--card-border)] md:border-b-0 transition-colors duration-300">
          <div className="flex items-center gap-2.5">
            <img
              src="/se-passou-e-ponto.png"
              alt="Logo"
              className="h-7 w-7 shrink-0 rounded-full ring-1 ring-[#ff2d78]/40"
            />
            <div className="min-w-0">
              <h1 className="font-display text-[12px] font-black uppercase leading-tight tracking-tight text-[var(--text)] Oswald">
                {settings?.event_name || "SE PASSOU, É PONTO"}
              </h1>
              <div className="text-[8px] text-[#ff2d78] font-mono Oswald uppercase tracking-wider">
                PELADA DE VÔLEI
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2 sm:gap-4">
            <ThemeToggle />
            {!authReady ? (
              <Skeleton className="h-9 w-20 rounded-full opacity-20" />
            ) : me ? (
              <div className="flex items-center gap-2 sm:gap-3">
                <button 
                  onClick={() => setNotificationsOpen(true)}
                  className="relative p-2 rounded-xl bg-[var(--card-bg)] border border-[var(--card-border)] hover:border-[var(--accent-neon)]/40 transition-all active:scale-95 group"
                  aria-label="Notificações"
                >
                  <Bell className="w-4 h-4 text-[var(--text-muted)] group-hover:text-[var(--accent-neon)] transition-colors" />
                  {(() => {
                    const unread = (qc.getQueryData(["notifications"]) as any)?.notifications?.filter((n: any) => !n.read_at).length ?? 0;
                    if (unread === 0) return null;
                    return (
                      <span className="absolute -top-1 -right-1 flex h-4 min-w-[16px] items-center justify-center rounded-full bg-[var(--accent-neon)] px-1 text-[8px] font-black text-white ring-2 ring-[var(--bg)]">
                        {unread > 9 ? "9+" : unread}
                      </span>
                    );
                  })()}
                </button>

                <Dialog open={profileOpen} onOpenChange={setProfileOpen}>
                  <DialogTrigger asChild>
                    <div className="group flex cursor-pointer items-center gap-1.5 rounded-xl border border-[var(--card-border)] bg-[var(--card-bg)] p-1.5 transition-all hover:border-[var(--accent-neon)]/40 active:scale-95">
                      <PlayerAvatar 
                        path={me.avatar_path}
                        name={me.name} 
                        size="sm"
                        className="ring-1 ring-[#ff2d78]/30"
                      />
                      <div className="text-left min-w-0 pr-1 ml-1 hidden xs:block">
                        <p className="text-xs font-black text-white leading-none truncate Oswald uppercase">{(me.name || "").trim().split(/\s+/)[0] || "Jogador"}</p>
                      </div>
                      <ChevronDown size={14} className="text-zinc-400 group-hover:text-[#ff2d78] transition-colors" />
                    </div>
                  </DialogTrigger>
                  <DialogContent 
                    aria-describedby="profile-menu-desc"
                    className="fixed inset-0 left-0 top-0 grid h-dvh w-dvw max-w-none translate-x-0 translate-y-0 place-items-center overflow-hidden border-0 bg-black/60 p-4 shadow-none backdrop-blur-sm sm:rounded-none [&>button]:hidden"
                    onClick={(e) => {
                      if (e.target === e.currentTarget) setProfileOpen(false);
                    }}
                    onEscapeKeyDown={() => setProfileOpen(false)}
                  >
                    <div className="w-full max-w-[270px] max-h-[calc(100dvh-32px)] overflow-y-auto rounded-2xl border border-[#262833] bg-[#13141a] shadow-2xl relative">
                      <VisuallyHidden>
                        <DialogTitle>Menu de Perfil</DialogTitle>
                      </VisuallyHidden>
                      <DialogDescription id="profile-menu-desc" className="sr-only">
                        Opções de gerenciamento de conta
                      </DialogDescription>
                      <Button 
                        variant="ghost" 
                        size="icon" 
                        className="absolute right-2 top-2 h-8 w-8 text-zinc-400 hover:text-white hover:bg-white/10 z-50 rounded-full"
                        onClick={() => setProfileOpen(false)}
                        aria-label="Fechar menu"
                      >
                        <X size={16} />
                      </Button>
                      <div className="flex flex-col">
                        <div className="p-4 border-b border-[#262833] bg-[#17181f] flex items-center gap-3 pr-10">
                          <PlayerAvatar 
                            path={me.avatar_path} 
                            name={me.name} 
                            size="md" 
                          />
                          <div className="min-w-0">
                            <p className="text-[9px] font-black text-[#ff2d78] Oswald uppercase tracking-widest mb-0.5">Minha Conta</p>
                            <p className="text-xs font-black text-white Oswald uppercase truncate">{me.name}</p>
                          </div>
                        </div>

                        {/* Status de Acesso por Turma */}
                        <div className="p-3 mx-2 mt-2 rounded-xl bg-[#17181f] border border-[#262833] space-y-1.5">
                          <p className="text-[9px] font-bold uppercase Oswald tracking-widest text-zinc-400">
                            Status de Acesso por Turma
                          </p>
                          <div className="space-y-1">
                            {(groups || []).map((g: any) => {
                              const acc = (myAccesses || []).find((a: any) => a.group_id === g.id);
                              const accStatus = acc?.status;
                              return (
                                <div key={g.id} className="flex items-center justify-between text-xs py-1 border-b border-[#262833]/60 last:border-b-0">
                                  <span className="font-bold uppercase Oswald text-zinc-200 text-[11px]">{g.name.split('-')[0].trim()}</span>
                                  {accStatus === 'approved' ? (
                                    <span className="text-[9px] font-black uppercase text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded border border-emerald-500/30">Aprovado</span>
                                  ) : accStatus === 'pending' ? (
                                    <span className="text-[9px] font-black uppercase text-amber-400 bg-amber-500/10 px-2 py-0.5 rounded border border-amber-500/30">Pendente</span>
                                  ) : accStatus === 'rejected' ? (
                                    <span className="text-[9px] font-black uppercase text-red-400 bg-red-500/10 px-2 py-0.5 rounded border border-red-500/30">Rejeitado</span>
                                  ) : (
                                    <span className="text-[9px] font-medium uppercase text-zinc-500">Não solicitado</span>
                                  )}
                                </div>
                              );
                            })}
                          </div>
                        </div>
                        <div className="flex flex-col p-1.5">
                          <Button 
                            variant="ghost" 
                            className="w-full justify-start gap-3 h-10 text-[11px] font-black uppercase tracking-wider Oswald hover:bg-[#1a1b24] hover:text-[#ff2d78] text-zinc-300 rounded-lg"
                            onClick={() => {
                              setProfileOpen(false);
                              setEditNameValue(me?.name || "");
                              setTimeout(() => setEditNameOpen(true), 100);
                            }}
                          >
                            <User size={14} className="text-[#ff2d78]" />
                            Editar Perfil
                          </Button>

                          <Button 
                            variant="ghost" 
                            className="w-full justify-start gap-3 h-10 text-[11px] font-black uppercase tracking-wider Oswald hover:bg-[#1a1b24] hover:text-[#ff2d78] text-zinc-300 rounded-lg"
                            onClick={() => {
                              setProfileOpen(false);
                              setTimeout(() => setMyRegsOpen(true), 100);
                            }}
                          >
                            <Calendar size={14} className="text-[#ff2d78]" />
                            Minhas Inscrições
                          </Button>

                          <Button 
                            variant="ghost" 
                            className="w-full justify-start gap-3 h-10 text-[11px] font-black uppercase tracking-wider Oswald hover:bg-[#1a1b24] hover:text-[#ff2d78] text-zinc-300 rounded-lg"
                            onClick={() => {
                              setProfileOpen(false);
                              setNotificationsOpen(false);
                              setTimeout(() => setSelfRatingOpen(true), 100);
                            }}
                          >
                            <ListOrdered size={14} className="text-[#ff2d78]" />
                            Minha Autoavaliação
                          </Button>

                          <Button 
                            variant="ghost" 
                            className="w-full justify-start gap-3 h-10 text-[11px] font-black uppercase tracking-wider Oswald hover:bg-[#1a1b24] hover:text-[#ff2d78] text-zinc-300 rounded-lg"
                            onClick={() => {
                              setProfileOpen(false);
                              setPushSettingsOpen(true);
                            }}
                          >
                            <Settings size={14} className="text-[#ff2d78]" />
                            Notificações
                          </Button>

                          {showPwaOption && (
                            <Button 
                              variant="ghost" 
                              className="w-full justify-start gap-3 h-10 text-[11px] font-black uppercase tracking-wider Oswald hover:bg-[#1a1b24] hover:text-[#ff2d78] text-zinc-300 rounded-lg"
                              onClick={() => {
                                setProfileOpen(false);
                                installPwa();
                              }}
                            >
                              <Smartphone size={14} className="text-[#ff2d78]" />
                              Instalar App
                            </Button>
                          )}

                          {isAdmin && !me && (
                            <Link
                              to="/admin"
                              className="flex items-center gap-3 w-full px-3 h-10 text-[11px] font-bold uppercase tracking-wider Oswald hover:bg-[#1a1b24] text-[#ff2d78] rounded-lg transition-colors"
                              onClick={() => setProfileOpen(false)}
                            >
                              <ShieldAlert size={14} />
                              {isAdminSupabase ? "Painel Admin" : "Acessar Painel"}
                            </Link>
                          )}
                          
                          <Button 
                            variant="ghost" 
                            className="w-full justify-start gap-3 h-10 text-[11px] font-black uppercase tracking-wider Oswald text-red-400 hover:bg-red-500/10 hover:text-red-300 rounded-lg"
                            onClick={async () => {
                              await handleLogout();
                            }}
                          >
                            <LogOut size={14} />
                            Sair
                          </Button>
                        </div>
                      </div>
                    </div>
                  </DialogContent>
                </Dialog>

                <PushSettingsDialog 
                  open={pushSettingsOpen} 
                  onOpenChange={setPushSettingsOpen} 
                  groups={groups} 
                />

                <ProfileDialog
                  open={editNameOpen}
                  onOpenChange={setEditNameOpen}
                  profileName={me?.name || ""}
                  playerAvatar={me?.avatar_path}
                  updateNameFn={updateNameFn}
                  onChanged={refreshAll}
                />

                <SelfRatingDialog
                  open={selfRatingOpen}
                  onOpenChange={setSelfRatingOpen}
                />
              </div>
            ) : (
              <div className="flex items-center gap-2">
                <Button
                  onClick={() => setAuthOpen(true)}
                  className="h-9 px-5 bg-[#ff2d78] font-black uppercase tracking-wider text-white shadow-lg shadow-[#ff2d78]/25 hover:bg-[#ff2d78]/90 text-[11px] Oswald rounded-xl active:scale-[0.98] transition-all"
                >
                  ENTRAR
                </Button>
              </div>
            )}
            {authReady && !me && (
              <Link
                to={isAdmin ? "/admin" : "/admin/login"}
                className="h-9 px-2.5 sm:px-3 bg-[#ff2d78]/15 hover:bg-[#ff2d78]/25 border border-[#ff2d78]/40 text-[#ff2d78] font-black uppercase tracking-wider text-[11px] Oswald rounded-xl active:scale-[0.98] transition-all flex items-center gap-1.5 shadow-sm shadow-[#ff2d78]/20"
                title={isAdmin ? "Acessar Painel Administrativo" : "Acesso Administrativo (E-mail e Senha)"}
                aria-label="Acesso ao Painel Administrativo"
              >
                <ShieldCheck className="w-4 h-4 text-[#ff2d78] shrink-0" />
                <span className="hidden sm:inline">PAINEL</span> <span>ADM</span>
              </Link>
            )}
          </div>
        </header>

        {/* Navegação Inferior Mobile Fixa (Início, Times, Lista) */}
        <MobileNavBar activeTab={activeTab} setActiveTab={setActiveTab} />

        {/* Seletor TERÇA / QUARTA / QUINTA / SÁBADO */}
        <div className="my-3 px-4 container-mobile md:px-0">
          <div className="grid grid-cols-4 gap-1.5 sm:gap-2 bg-[#111217] p-1.5 rounded-2xl border border-[#21232d] shadow-inner shadow-black/40">
            {groups.map((g: any) => {
              const isActive = activeGroupId === g.id;
              const accessRow = myAccesses.find((a: any) => a.group_id === g.id);
              const access = accessRow?.status ?? "none";
              const isLocked = settings?.access_restriction_active && access !== "approved";
              const gHasPriority = hasGlobalPriority || accessRow?.has_priority === true;
              const shortName = g.name.split('-')[0].trim().toUpperCase();

              // Compute round state for this group to check if priority window is active
              // For the active group use loaded event/settings; for others try cache
              const cachedData = g.id === activeGroupId
                ? { event, settings }
                : (qc.getQueryData(["event-full", g.id]) as any) ?? null;
              const gEvent = cachedData?.event ?? null;
              const gSettings = cachedData?.settings ?? null;
              const gRoundState = gEvent && gSettings && gSettings.open_weekday !== undefined && gSettings.open_time
                ? getRoundRegistrationState(gEvent as any, gSettings as any, now)
                : null;
              const showPrioBadge = gHasPriority && gRoundState?.phase === 'priority';

              return (
                <button
                  key={g.id}
                  onClick={() => setGroupId(g.id)}
                  className={cn(
                    "relative flex flex-col items-center justify-center py-2 px-1 rounded-xl font-black text-xs uppercase tracking-wider Oswald transition-all select-none border border-transparent",
                    isActive
                      ? "bg-[#ff2d78] text-white shadow-lg shadow-[#ff2d78]/30 border-[#ff2d78]/50 scale-[1.01]"
                      : "bg-transparent text-zinc-400 hover:text-zinc-200 hover:bg-[#181920]"
                  )}
                >
                  <span className="flex items-center gap-1 leading-tight">
                    {shortName}
                    {showPrioBadge && (
                      <span className={cn(
                        "rounded px-1 text-[8px] font-black leading-none py-0.5",
                        isActive ? "bg-black/35 text-white" : "bg-[#ff2d78]/20 text-[#ff2d78] border border-[#ff2d78]/30"
                      )}>
                        PRIO
                      </span>
                    )}
                  </span>
                  {isLocked && (
                    <Lock size={10} className={cn("mt-0.5", isActive ? "text-white/90" : "text-zinc-500")} />
                  )}
                </button>
              );
            })}
          </div>
        </div>

        {/* Feedback de Carregamento Global */}
        {(eventQ.isLoading || accessesQ.isLoading) && (
          <div className="container-mobile space-y-3 px-4">
            <Skeleton className="h-32 w-full rounded-2xl bg-[#16171f]" />
            <Skeleton className="h-24 w-full rounded-2xl bg-[#16171f]" />
          </div>
        )}

        {/* Conteúdo Aba TIMES */}
        {!eventQ.isLoading && !accessesQ.isLoading && activeTab === "times" && (
          <div className="container-mobile px-3 sm:px-4 md:px-0 space-y-3 pb-28 md:pb-8">
            {hasPublishedTeams ? (
              (() => {
                const myTeam = (teamsList || []).find((team: any) =>
                  (team.players || []).some((p: any) => me?.id && (p.player_id === me.id || p.id === me.id))
                );
                if (!myTeam) {
                  return (
                    <Card className="p-8 text-center bg-[#13141a] border border-[#262833] mx-auto shadow-xl rounded-2xl">
                      <Users className="w-10 h-10 text-zinc-600 mx-auto mb-2" />
                      <h3 className="text-sm font-bold text-zinc-200 uppercase Oswald tracking-wide">Você ainda não foi escalado</h3>
                      <p className="text-xs text-zinc-400 mt-1 max-w-sm mx-auto">Quando seu nome entrar em um time divulgado, a escalação aparecerá aqui.</p>
                    </Card>
                  );
                }
                return (
                  <div className="grid grid-cols-1 gap-3 md:gap-4">
                    {[myTeam].map((team: any, idx: number) => (
                      <Card key={team.id || idx} className="relative overflow-hidden bg-[#050507] border border-[#ff2d78]/25 p-0 rounded-2xl space-y-0 shadow-[0_0_32px_rgba(255,45,120,0.16)]">
                        <div className="relative min-h-[138px] overflow-hidden border-b border-[#ff2d78]/20 bg-[radial-gradient(circle_at_18%_20%,rgba(255,45,120,0.32),transparent_28%),radial-gradient(circle_at_88%_10%,rgba(255,255,255,0.12),transparent_18%),linear-gradient(135deg,#050507_0%,#11131d_55%,#050507_100%)] px-4 py-4 sm:px-5">
                          <div className="absolute inset-0 opacity-25 [background-image:linear-gradient(135deg,rgba(255,255,255,0.12)_1px,transparent_1px),linear-gradient(45deg,rgba(255,45,120,0.16)_1px,transparent_1px)] [background-size:18px_18px]" />
                          <div className="absolute left-0 right-0 top-1/2 h-px bg-white/15 shadow-[0_0_18px_rgba(255,45,120,0.85)]" />
                          <div className="absolute -right-8 -top-8 h-28 w-28 rounded-full border-[10px] border-white/10 bg-[#ff2d78]/10 shadow-[0_0_45px_rgba(255,45,120,0.35)]" />
                          <div className="absolute right-5 top-5 text-4xl drop-shadow-[0_0_18px_rgba(255,255,255,0.45)]">🏐</div>
                          <div className="relative z-10 flex items-end justify-between gap-4">
                            <div className="min-w-0">
                              <p className="text-[10px] font-black uppercase tracking-[0.32em] text-[#ff2d78] Oswald">Escalação oficial</p>
                              <h3 className="mt-1 text-4xl sm:text-5xl font-black uppercase leading-none tracking-tighter text-white Oswald">
                                Time {team.team_number || idx + 1}
                              </h3>
                              <p className="mt-2 text-[10px] font-black uppercase tracking-[0.18em] text-zinc-300 Oswald">SE PASSOU, É PONTO</p>
                            </div>
                            <div className="shrink-0 text-right">
                              <div className="text-5xl sm:text-6xl font-black leading-none text-[#ff2d78] Oswald drop-shadow-[0_0_18px_rgba(255,45,120,0.65)]">{team.players?.length || 0}</div>
                              <div className="text-[9px] font-black uppercase tracking-widest text-zinc-300 Oswald">Jogadores</div>
                            </div>
                          </div>
                        </div>
                    <div className="flex items-center justify-between border-b border-[#232634] px-3 py-2">
                      <span className="font-display font-black text-white text-xs sm:text-sm uppercase Oswald tracking-wide flex items-center gap-2 min-w-0 truncate">
                        <span className="w-2 h-2 sm:w-2.5 sm:h-2.5 rounded-full bg-[#ff2d78] shrink-0" />
                        <span className="truncate">{team.name || `Time ${team.team_number || idx + 1}`}</span>
                      </span>
                      <Badge variant="outline" className="border-[#ff2d78]/40 text-[#ff2d78] bg-[#ff2d78]/10 text-[9px] sm:text-[10px] font-mono shrink-0 ml-2 px-1.5 py-0.5">
                        {team.players?.length || 0} JOGADORES
                      </Badge>
                    </div>
                    <div className="grid grid-cols-3 gap-2 p-3 sm:gap-3 sm:p-3.5 min-[360px]:grid-cols-3 max-[320px]:grid-cols-2">
                      {(team.players || []).map((p: any, pIdx: number) => {
                        const playerName = p.name || p.player_name || "Jogador";
                        const playerAvatarPath = p.avatar_path || p.player_avatar_path || null;
                        const playerAvatarUrl = p.avatar_url || p.player_avatar_url || avatarUrlMap.get(p.player_id || p.id) || null;
                        const isMe = !!me && (p.player_id === me.id || p.id === me.id);
                        return (
                          <div 
                            key={p.id || p.registration_id || pIdx} 
                            onClick={() => handleOpenPlayerModal(p)}
                            role="button"
                            tabIndex={0}
                            onKeyDown={(e) => {
                              if (e.key === "Enter" || e.key === " ") {
                                e.preventDefault();
                                handleOpenPlayerModal(p);
                              }
                            }}
                            className={cn(
                              "group relative min-h-[142px] overflow-hidden rounded-2xl border bg-[#050507] p-1.5 text-left shadow-[0_10px_24px_rgba(0,0,0,0.35)] transition-all active:scale-[0.98] cursor-pointer",
                              "border-[#ff2d78]/25 hover:border-[#ff2d78]/60 hover:shadow-[0_0_28px_rgba(255,45,120,0.22)]",
                              isMe && "border-[#ff2d78] shadow-[0_0_26px_rgba(255,45,120,0.72)] ring-1 ring-[#ff2d78]/80"
                            )}
                          >
                            <div className="absolute inset-0 bg-[radial-gradient(circle_at_18%_0%,rgba(255,45,120,0.32),transparent_34%),linear-gradient(145deg,#050507_0%,#11131d_68%,#050507_100%)]" />
                            <div className="absolute -right-5 -top-5 h-16 w-16 rounded-full border-[8px] border-[#ff2d78]/15" />
                            <div className="absolute left-2 top-2 z-10 font-black leading-none text-[#ff2d78] Oswald text-[18px] drop-shadow-[0_0_10px_rgba(255,45,120,0.65)]">
                              {String(pIdx + 1).padStart(2, "0")}
                            </div>
                            {isMe && (
                              <span className="absolute right-2 top-2 z-10 rounded-full border border-[#ff2d78]/70 bg-[#ff2d78] px-1.5 py-0.5 text-[7px] font-black uppercase tracking-widest text-white Oswald shadow-[0_0_12px_rgba(255,45,120,0.85)]">
                                VOCÊ
                              </span>
                            )}
                            <div className="relative z-10 flex h-full flex-col items-center justify-end gap-2 pt-7">
                              <PlayerAvatar 
                                path={playerAvatarPath} 
                                url={playerAvatarUrl} 
                                name={playerName} 
                                className="h-[74px] w-[74px] min-h-[74px] min-w-[74px] rounded-2xl border-2 border-[#ff2d78]/35 bg-[#11131d] text-[18px] shadow-[0_0_22px_rgba(255,45,120,0.18)] group-hover:border-[#ff2d78]/80 group-hover:shadow-[0_0_24px_rgba(255,45,120,0.35)]"
                                imageClassName="rounded-2xl"
                              />
                              <div className="w-full rounded-xl border border-[#ff2d78]/20 bg-black/45 px-1.5 py-1.5 text-center backdrop-blur-sm">
                                <p className="truncate text-[10px] font-black uppercase leading-tight tracking-tight text-white Oswald">
                                  {playerName}
                                </p>
                                {p.position && (
                                  <p className="mt-0.5 truncate text-[8px] font-black uppercase tracking-widest text-[#ff2d78] Oswald">
                                    {p.position}
                                  </p>
                                )}
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                      </Card>
                    ))}
                  </div>
                );
              })()
            ) : (eventQ.data as any)?.can_view === false ? (
              <Card className="p-8 text-center bg-[#13141a] border border-[#262833] mx-auto shadow-xl rounded-2xl space-y-3">
                <Lock className="w-10 h-10 text-amber-500/80 mx-auto mb-1" />
                <h3 className="text-sm font-bold text-zinc-200 uppercase Oswald tracking-wide">Acesso restrito</h3>
                <p className="text-xs text-zinc-400 max-w-sm mx-auto">
                  Esta turma tem restrição de acesso ativa. Entre na sua conta ou solicite acesso para visualizar a escalação.
                </p>
                {!me && (
                  <Button
                    size="sm"
                    onClick={() => setAuthOpen(true)}
                    className="mt-2 bg-[#ff2d78] hover:bg-[#ff2d78]/90 text-white font-bold Oswald uppercase text-xs h-9 px-4 rounded-xl"
                  >
                    Entrar na minha conta
                  </Button>
                )}
              </Card>
            ) : (
              <Card className="p-8 text-center bg-[#13141a] border border-[#262833] mx-auto shadow-xl rounded-2xl">
                <Users className="w-10 h-10 text-zinc-600 mx-auto mb-2" />
                <h3 className="text-sm font-bold text-zinc-200 uppercase Oswald tracking-wide">Times ainda não definidos</h3>
                <p className="text-xs text-zinc-400 mt-1 max-w-sm mx-auto">
                  A organização divulgará a formação dos times após o fechamento da lista de presença.
                </p>
              </Card>
            )}
          </div>
        )}

        <PlayerPhotoModal
          open={!!selectedPlayerForPhoto}
          onOpenChange={(open) => !open && setSelectedPlayerForPhoto(null)}
          player={selectedPlayerForPhoto}
        />

        {/* Conteúdo Aba LISTA */}
        {!eventQ.isLoading && !accessesQ.isLoading && activeTab === "lista" && (
          <div className="container-mobile px-4 md:px-0 space-y-4 mb-8">
            {/* Titulares */}
            <Card className="bg-[#14161f] border border-[#232634] p-4 rounded-2xl space-y-3 shadow-lg">
              <div className="flex items-center justify-between border-b border-[#232634] pb-2">
                <span className="font-display font-black text-white text-sm uppercase Oswald tracking-wide flex items-center gap-2">
                  <span className="w-2.5 h-2.5 rounded-full bg-emerald-500" />
                  Titulares ({mainRegs.length}/{mainLimit})
                </span>
                <Badge variant="outline" className="border-emerald-500/40 text-emerald-400 bg-emerald-500/10 text-[10px] font-mono">
                  CONFIRMADOS
                </Badge>
              </div>
              {mainRegs.length > 0 ? (
                <div className="divide-y divide-border/40">
                  {mainRegs.map((reg: any, idx: number) => {
                    const isMe = me && reg.player_id === me.id;
                    return (
                      <div 
                        key={reg.id || idx} 
                        onClick={() => handleOpenPlayerModal(reg)}
                        role="button"
                        tabIndex={0}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" || e.key === " ") {
                            e.preventDefault();
                            handleOpenPlayerModal(reg);
                          }
                        }}
                        className={cn(
                          "group/row flex items-center justify-between py-2 px-2.5 rounded-lg text-xs transition-colors cursor-pointer hover:bg-white/5 active:scale-[0.99]", 
                          isMe && "bg-primary/5"
                        )}
                      >
                        <div className="flex items-center gap-2 min-w-0">
                          <span className="text-[10px] font-mono text-zinc-500 w-5 text-right shrink-0">{idx + 1}.</span>
                          <PlayerAvatar 
                            name={reg.player_name || "Jogador"} 
                            path={reg.player_avatar_path || reg.avatar_path || reg.player_avatar} 
                            url={reg.avatar_url || avatarUrlMap.get(reg.player_id)} 
                            className="w-6 h-6 text-[10px] shrink-0 transition-transform group-hover/row:scale-110" 
                          />
                          <span className="font-semibold text-zinc-200 truncate group-hover/row:text-white transition-colors">{reg.player_name || "Jogador"}</span>
                          {isMe && <Badge className="bg-[#ff2d78] text-[9px] px-1 py-0 h-4 font-black shrink-0">VOCÊ</Badge>}
                        </div>
                        <span className="text-[10px] text-zinc-400 font-mono shrink-0 ml-2">{formatCreatedAt(reg.created_at)}</span>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <p className="text-xs text-zinc-500 py-3 text-center italic">Nenhum jogador confirmado ainda.</p>
              )}
            </Card>

            {/* Reservas / Fila de Espera */}
            <Card className="bg-[#14161f] border border-[#232634] p-4 rounded-2xl space-y-3 shadow-lg">
              <div className="flex items-center justify-between border-b border-[#232634] pb-2">
                <span className="font-display font-black text-white text-sm uppercase Oswald tracking-wide flex items-center gap-2">
                  <span className="w-2.5 h-2.5 rounded-full bg-amber-500" />
                  Lista de Espera ({waitRegs.length})
                </span>
                <Badge variant="outline" className="border-amber-500/40 text-amber-400 bg-amber-500/10 text-[10px] font-mono">
                  RESERVAS
                </Badge>
              </div>
              {waitRegs.length > 0 ? (
                <div className="divide-y divide-border/40">
                  {waitRegs.map((reg: any, idx: number) => {
                    const isMe = me && reg.player_id === me.id;
                    return (
                      <div 
                        key={reg.id || idx} 
                        onClick={() => handleOpenPlayerModal(reg)}
                        role="button"
                        tabIndex={0}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" || e.key === " ") {
                            e.preventDefault();
                            handleOpenPlayerModal(reg);
                          }
                        }}
                        className={cn(
                          "group/row flex items-center justify-between py-2 px-2.5 rounded-lg text-xs transition-colors cursor-pointer hover:bg-white/5 active:scale-[0.99]", 
                          isMe && "bg-primary/5"
                        )}
                      >
                        <div className="flex items-center gap-2 min-w-0">
                          <span className="text-[10px] font-mono text-zinc-500 w-5 text-right shrink-0">{idx + 1}.</span>
                          <PlayerAvatar 
                            name={reg.player_name || "Jogador"} 
                            path={reg.player_avatar_path || reg.avatar_path || reg.player_avatar} 
                            url={reg.avatar_url || avatarUrlMap.get(reg.player_id)} 
                            className="w-6 h-6 text-[10px] shrink-0" 
                          />
                          <span className="font-semibold text-zinc-300 truncate">{reg.player_name || "Jogador"}</span>
                          {isMe && <Badge className="bg-[#ff2d78] text-[9px] px-1 py-0 h-4 font-black">VOCÊ</Badge>}
                        </div>
                        <span className="text-[10px] text-zinc-400 font-mono">{formatCreatedAt(reg.created_at)}</span>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <p className="text-xs text-zinc-500 py-3 text-center italic">Nenhum jogador na fila de espera.</p>
              )}
            </Card>
          </div>
        )}

        {/* Conteúdo Aba Início */}
        {!eventQ.isLoading && !accessesQ.isLoading && activeTab === "inicio" && !event ? (
          <div className="container-mobile md:px-0 px-4 mb-4">
            <Card className="p-8 text-center bg-[#13141a] border border-[#262833] mx-auto shadow-xl rounded-2xl">
              <Calendar className="w-10 h-10 text-zinc-500 mx-auto mb-3" />
              <h3 className="text-base font-black text-zinc-200 uppercase Oswald tracking-wider mb-1">
                AGUARDANDO PRÓXIMA RODADA
              </h3>
              <p className="text-zinc-400 text-xs Oswald uppercase">
                A organização divulgará a próxima rodada em breve.
              </p>
            </Card>
          </div>
        ) : event && (activeTab === "inicio" || isDesktop) ? (
          <div className="container-mobile md:px-0 px-4 space-y-3 pb-[calc(76px+env(safe-area-inset-bottom,0px))] md:pb-8">
            {/* CARD PRINCIPAL DA RODADA */}
            <div className="rounded-2xl bg-[#13141a] border border-[#262833] p-4 shadow-xl relative overflow-hidden">
              <div className="flex items-start justify-between gap-3 mb-3 pb-3 border-b border-[#21232d]">
                <div>
                  <p className="text-[10px] font-black uppercase tracking-widest text-[#ff2d78] Oswald">
                    {weekdayLabel}
                  </p>
                  <h2 className="text-xl font-black text-white Oswald uppercase tracking-tight">
                    {formatDatePtBr(event.event_date)}
                  </h2>
                  {event.start_time && (
                    <p className="text-xs text-zinc-400 Oswald font-bold">
                      {formatTime(event.start_time)} {event.end_time ? `às ${formatTime(event.end_time)}` : ""}
                    </p>
                  )}
                </div>
                <span className={cn("px-2.5 py-1 rounded-full text-[10px] font-black uppercase tracking-wider border Oswald", roundStatusLabel.color)}>
                  {roundStatusLabel.label}
                </span>
              </div>

              {/* Contadores Titulares / Reservas */}
              <div className="grid grid-cols-2 gap-2 mb-4">
                <div className="rounded-xl bg-[#161822] border border-[#282a38] p-3 text-center shadow-md relative overflow-hidden">
                  <div className="absolute top-0 left-0 right-0 h-[2px] bg-emerald-500/40" />
                  <p className="text-[9px] font-black text-emerald-400 uppercase tracking-widest Oswald mb-1">Titulares</p>
                  <p className="text-2xl font-black text-white Oswald tabular-nums leading-none drop-shadow-sm">
                    {isCountUndetermined ? (
                      <span className="text-zinc-400 font-medium text-lg">--</span>
                    ) : (
                      <>
                        <span className="text-emerald-300 font-black">{mainCount}</span><span className="text-xs text-zinc-500 font-normal">/{mainLimit}</span>
                      </>
                    )}
                  </p>
                  {isCountUndetermined && (
                    <p className="text-[8px] text-zinc-500 Oswald uppercase mt-1 tracking-wider">Acesse para ver</p>
                  )}
                </div>
                <div className="rounded-xl bg-[#161822] border border-[#282a38] p-3 text-center shadow-md relative overflow-hidden">
                  <div className="absolute top-0 left-0 right-0 h-[2px] bg-amber-500/40" />
                  <p className="text-[9px] font-black text-amber-400 uppercase tracking-widest Oswald mb-1">Reservas</p>
                  <p className="text-2xl font-black text-[#ff2d78] Oswald tabular-nums leading-none">
                    {isCountUndetermined ? (
                      <span className="text-zinc-400 font-medium text-lg">--</span>
                    ) : (
                      waitlistCount
                    )}
                  </p>
                  {isCountUndetermined && (
                    <p className="text-[8px] text-zinc-500 Oswald uppercase mt-1 tracking-wider">Acesse para ver</p>
                  )}
                </div>
              </div>

              {/* Situação Pessoal do Jogador */}
              <div className="rounded-xl bg-[#181a22] border border-[#262833] p-3 mb-3 text-center">
                <p className="text-[9px] font-bold text-zinc-400 uppercase tracking-widest Oswald mb-1">Sua Situação</p>
                {!me ? (
                  <p className="text-xs font-black text-zinc-400 Oswald uppercase tracking-wide">
                    FAÇA LOGIN PARA PARTICIPAR
                  </p>
                ) : playerStatus === 'MAIN_LIST' || playerStatus === 'PROMOTED_FROM_WAITLIST' ? (
                  <div className="space-y-0.5">
                    <p className="text-sm font-black text-emerald-400 Oswald uppercase tracking-wide flex items-center justify-center gap-1.5">
                      <CheckCircle2 className="w-4 h-4" /> VOCÊ ESTÁ INSCRITO
                    </p>
                    {playerPosition && (
                      <p className="text-xs text-zinc-300 Oswald font-bold">{playerPosition}ª posição (Titular)</p>
                    )}
                  </div>
                ) : playerStatus === 'WAITLIST' ? (
                  <div className="space-y-0.5">
                    <p className="text-sm font-black text-amber-400 Oswald uppercase tracking-wide flex items-center justify-center gap-1.5">
                      <Clock className="w-4 h-4" /> VOCÊ ESTÁ NA ESPERA
                    </p>
                    {playerPosition && (
                      <p className="text-xs text-zinc-300 Oswald font-bold">{playerPosition}º da fila de reserva</p>
                    )}
                  </div>
                ) : (
                  <p className="text-xs font-black text-zinc-300 Oswald uppercase tracking-wide">
                    VOCÊ NÃO ESTÁ NA LISTA
                  </p>
                )}
              </div>

              {/* Ações de Inscrição / Retirada */}
              <div className="space-y-2">
                {!iAmInscribed ? (
                  <Button
                    onClick={handleJoinClick}
                    disabled={(!canJoin || !authReady || joinBusy || priorityBlocksMe || status === "closed" || status === "completed" || roundState?.phase === "scheduled") && !roundState?.isPending}
                    className={cn(
                      "w-full h-12 text-sm font-black Oswald uppercase tracking-wider rounded-xl transition-all shadow-lg active:scale-[0.98]",
                      canJoin && !priorityBlocksMe
                        ? "bg-[#ff2d78] text-white hover:bg-[#ff2d78]/90 shadow-[#ff2d78]/25"
                        : "bg-[#1e2029] text-zinc-500 border border-[#2a2d3a] cursor-not-allowed"
                    )}
                  >
                    {joinBusy ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                    {!me ? "ENTRAR / CADASTRAR-SE" : priorityBlocksMe ? "AGUARDANDO LIBERAÇÃO GERAL" : mainCount >= mainLimit ? "ENTRAR NA RESERVA" : "ENTRAR NA LISTA"}
                  </Button>
                ) : canLeave ? (
                  <Button
                    variant="outline"
                    onClick={() => setLeaveConfirmOpen(true)}
                    disabled={leaveBusy}
                    className="w-full h-11 text-xs font-black Oswald uppercase tracking-wider text-red-400 border-red-500/30 hover:bg-red-500/10 hover:text-red-300 rounded-xl transition-all"
                  >
                    {leaveBusy ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <LogOut className="w-4 h-4 mr-2" />}
                    RETIRAR MEU NOME
                  </Button>
                ) : null}

                {/* Adicionar Convidado quando permitido */}
                {canAddGuest && iAmInscribed && (
                  <Button
                    variant="outline"
                    onClick={() => setAddGuestOpen(true)}
                    className="w-full h-10 text-xs font-black Oswald uppercase tracking-wider text-zinc-300 border-[#2a2d3a] hover:bg-[#1a1b24] rounded-xl"
                  >
                    <Plus className="w-4 h-4 mr-1.5" /> ADICIONAR CONVIDADO
                  </Button>
                )}
              </div>
            </div>

            {/* Seção Expansível HORÁRIOS E REGRAS */}
            {(() => {
              const isRoundEnded = event.status === "closed" || event.status === "completed" || event.status === "cancelled";
              const priorityOpenDate = roundState?.openAt ?? (event.event_date && settings?.open_weekday !== undefined && settings?.open_time ? calculateOpenAt(event.event_date, settings.open_weekday, settings.open_time) : null);
              const generalOpenDate = roundState?.priorityEndsAt ?? priorityOpenDate;
              const closeFullDate = roundState?.closeAt ?? (event.event_date && settings?.close_weekday !== undefined && settings?.close_weekday !== null && settings?.close_time ? calculateOpenAt(event.event_date, Number(settings.close_weekday), settings.close_time) : (event.event_date ? new Date(`${event.event_date}T${settings?.close_time ? settings.close_time.slice(0, 5) : (event.start_time ? event.start_time.slice(0, 5) : "23:59")}:00-03:00`) : null));
              const guestsConfigEnabled = Boolean(settings?.convidados_habilitados);
              const guestFullReleaseDate = guestsConfigEnabled && event.event_date && settings?.dia_liberacao_convidado !== undefined && settings?.dia_liberacao_convidado !== null && settings?.hora_liberacao_convidado ? calculateOpenAt(event.event_date, Number(settings.dia_liberacao_convidado), settings.hora_liberacao_convidado) : (guestsConfigEnabled ? generalOpenDate : null);

              const priorityOpenFormatted = formatScheduleDateTime(priorityOpenDate);
              const generalOpenFormatted = formatScheduleDateTime(generalOpenDate);
              const guestReleaseFormatted = formatScheduleDateTime(guestFullReleaseDate);
              const closeFormatted = formatScheduleDateTime(closeFullDate);

              const priorityOpenStatus: "Liberado" | "Em breve" | "Encerrado" = isRoundEnded || (closeFullDate && now >= closeFullDate.getTime()) ? "Encerrado" : (priorityOpenDate && now >= priorityOpenDate.getTime() ? "Liberado" : "Em breve");
              const generalOpenStatus: "Liberado" | "Em breve" | "Encerrado" = isRoundEnded || (closeFullDate && now >= closeFullDate.getTime()) ? "Encerrado" : (generalOpenDate && now >= generalOpenDate.getTime() ? "Liberado" : "Em breve");
              const guestStatus: "Liberado" | "Em breve" | "Encerrado" | "Não permitido" = !guestsConfigEnabled ? "Não permitido" : (isRoundEnded || (closeFullDate && now >= closeFullDate.getTime()) ? "Encerrado" : (guestFullReleaseDate && now >= guestFullReleaseDate.getTime() ? "Liberado" : "Em breve"));
              const closeStatus: "Liberado" | "Em breve" | "Encerrado" = isRoundEnded || (closeFullDate && now >= closeFullDate.getTime()) ? "Encerrado" : "Em breve";

              return (
                <div className="rounded-2xl bg-[#13141a] border border-[#262833] overflow-hidden shadow-lg transition-all">
                  <button
                    type="button"
                    onClick={() => setRulesOpen(!rulesOpen)}
                    className="w-full p-4 flex items-center justify-between text-left hover:bg-[#181a22] transition-colors"
                  >
                    <div className="flex items-center gap-2">
                      <Clock className="w-4 h-4 text-[#ff2d78]"
/>
                      <span className="text-xs font-black uppercase tracking-wider Oswald text-white">
                        HORÁRIOS E REGRAS
                      </span>
                    </div>
                    <ChevronDown className={cn("w-4 h-4 text-zinc-400 transition-transform duration-200", rulesOpen && "rotate-180")} />
                  </button>

                  {rulesOpen && (
                    <div className="p-4 pt-0 border-t border-[#21232d] space-y-2 text-xs text-zinc-300 Oswald uppercase">
                      {/* Abertura Prioritária */}
                      <div className="flex items-center justify-between py-2 border-b border-[#1f2128] gap-2">
                        <div className="min-w-0">
                          <span className="text-zinc-400 font-bold block text-[11px]">Abertura prioritária:</span>
                          <span className="font-black text-white text-xs tabular-nums">
                            {priorityOpenFormatted ? (
                              <>
                                <span className="text-zinc-300 capitalize">{priorityOpenFormatted.weekdayShort}, </span>
                                <span>{priorityOpenFormatted.formatted}</span>
                              </>
                            ) : "--:--"}
                          </span>
                        </div>
                        <span className={cn(
                          "px-2 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider border shrink-0",
                          priorityOpenStatus === "Liberado" && "bg-emerald-500/15 text-emerald-400 border-emerald-500/30",
                          priorityOpenStatus === "Em breve" && "bg-amber-500/15 text-amber-400 border-amber-500/30",
                          priorityOpenStatus === "Encerrado" && "bg-zinc-500/15 text-zinc-400 border-zinc-500/30"
                        )}>
                          {priorityOpenStatus}
                        </span>
                      </div>

                      {/* Liberação Geral */}
                      <div className="flex items-center justify-between py-2 border-b border-[#1f2128] gap-2">
                        <div className="min-w-0">
                          <span className="text-zinc-400 font-bold block text-[11px]">Liberação geral:</span>
                          <span className="font-black text-[#ff2d78] text-xs tabular-nums">
                            {generalOpenFormatted ? (
                              <>
                                <span className="text-zinc-300 capitalize">{generalOpenFormatted.weekdayShort}, </span>
                                <span>{generalOpenFormatted.formatted}</span>
                              </>
                            ) : "--:--"}
                          </span>
                        </div>
                        <span className={cn(
                          "px-2 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider border shrink-0",
                          generalOpenStatus === "Liberado" && "bg-emerald-500/15 text-emerald-400 border-emerald-500/30",
                          generalOpenStatus === "Em breve" && "bg-amber-500/15 text-amber-400 border-amber-500/30",
                          generalOpenStatus === "Encerrado" && "bg-zinc-500/15 text-zinc-400 border-zinc-500/30"
                        )}>
                          {generalOpenStatus}
                        </span>
                      </div>

                      {/* Liberação de Convidados */}
                      <div className="flex items-center justify-between py-2 border-b border-[#1f2128] gap-2">
                        <div className="min-w-0">
                          <span className="text-zinc-400 font-bold block text-[11px]">Liberação de convidados:</span>
                          <span className="font-black text-white text-xs tabular-nums">
                            {guestsConfigEnabled && guestReleaseFormatted ? (
                              <>
                                <span className="text-zinc-300 capitalize">{guestReleaseFormatted.weekdayShort}, </span>
                                <span>{guestReleaseFormatted.formatted}</span>
                              </>
                            ) : guestsConfigEnabled ? "Liberado com a lista" : "Não permitido"}
                          </span>
                        </div>
                        <span className={cn(
                          "px-2 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider border shrink-0",
                          guestStatus === "Liberado" && "bg-emerald-500/15 text-emerald-400 border-emerald-500/30",
                          guestStatus === "Em breve" && "bg-amber-500/15 text-amber-400 border-amber-500/30",
                          guestStatus === "Encerrado" && "bg-zinc-500/15 text-zinc-400 border-zinc-500/30",
                          guestStatus === "Não permitido" && "bg-zinc-800 text-zinc-500 border-zinc-700"
                        )}>
                          {guestStatus}
                        </span>
                      </div>

                      {/* Encerramento das Inscrições */}
                      <div className="flex items-center justify-between py-2 border-b border-[#1f2128] gap-2">
                        <div className="min-w-0">
                          <span className="text-zinc-400 font-bold block text-[11px]">Encerramento das inscrições:</span>
                          <span className="font-black text-white text-xs tabular-nums">
                            {closeFormatted ? (
                              <>
                                <span className="text-zinc-300 capitalize">{closeFormatted.weekdayShort}, </span>
                                <span>{closeFormatted.formatted}</span>
                              </>
                            ) : "--:--"}
                          </span>
                        </div>
                        <span className={cn(
                          "px-2 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider border shrink-0",
                          (closeStatus as string) === "Liberado" && "bg-emerald-500/15 text-emerald-400 border-emerald-500/30",
                          closeStatus === "Em breve" && "bg-amber-500/15 text-amber-400 border-amber-500/30",
                          closeStatus === "Encerrado" && "bg-zinc-500/15 text-zinc-400 border-zinc-500/30"
                        )}>
                          {closeStatus}
                        </span>
                      </div>

                      {/* Limite de Titulares */}
                      <div className="flex justify-between py-1.5">
                        <span className="text-zinc-400 font-bold text-[11px]">Limite de Titulares:</span>
                        <span className="font-black text-white">{mainLimit} vagas</span>
                      </div>

                      {settings?.announcement && (
                        <div className="mt-3 p-2.5 rounded-xl bg-[#ff2d78]/10 border border-[#ff2d78]/20 text-[#ff2d78] text-[11px] font-bold">
                          Aviso: {settings.announcement}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })()}
          </div>
        ) : null}
      </div>

      <div className="md:hidden">
        <MobileNavBar
          activeTab={activeTab}
          setActiveTab={setActiveTab}
          isVisible={!isAnyModalOpen}
        />
      </div>

      {/* Modal Remoção de Convidado */}
      <AlertDialog open={removeGuestConfirm.open} onOpenChange={(o) => setRemoveGuestConfirm({ open: o, guest: null })}>
        <AlertDialogContent className="border-red-500/20 max-w-xs bg-[#13141a]">
          <AlertDialogHeader>
            <AlertDialogTitle className="Oswald uppercase font-black text-red-400">Remover convidado</AlertDialogTitle>
            <AlertDialogDescription className="text-xs Oswald uppercase text-zinc-400">
              Deseja retirar <span className="font-bold text-white">{removeGuestConfirm.guest?.player_name}</span> da rodada?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="bg-[#1c1d25] border-zinc-700 text-zinc-300">Cancelar</AlertDialogCancel>
            <AlertDialogAction
              className="bg-red-600 text-white hover:bg-red-700"
              onClick={async (e) => {
                e.preventDefault();
                if (!removeGuestConfirm.guest) return;
                try {
                  await removeGuestFn({ data: { guest_id: removeGuestConfirm.guest.id } });
                  toast.success("Convidado retirado.");
                  setRemoveGuestConfirm({ open: false, guest: null });
                  await refreshAll();
                } catch(e) {
                  toast.error(friendlyError(e));
                }
              }}
            >
              Confirmar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Modal Adicionar Convidado */}
      <Dialog open={addGuestOpen} onOpenChange={(o) => { setAddGuestOpen(o); if(!o) setGuestName(""); }}>
        <DialogContent className="bg-[#13141a] border-[#262833] max-w-[400px] p-6 text-white">
          <DialogHeader>
            <DialogTitle className="Oswald uppercase text-[#ff2d78] tracking-wider text-xl">Adicionar Convidado</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 pt-2">
            <p className="text-xs text-zinc-400 uppercase font-bold tracking-wider leading-relaxed Oswald">
              Este jogador participará apenas desta rodada.
            </p>
            <div className="space-y-2">
              <Label className="text-[10px] uppercase font-black Oswald text-zinc-300">Nome do Convidado</Label>
              <Input
                value={guestName}
                onChange={(e) => setGuestName(e.target.value)}
                placeholder="Ex: João Silva"
                className="h-11 bg-[#1a1b24] border-[#2a2d3a]"
                autoFocus
              />
            </div>
          </div>
          <DialogFooter className="mt-6 flex flex-row justify-end gap-3">
            <Button variant="ghost" onClick={() => setAddGuestOpen(false)} className="text-xs uppercase font-bold Oswald text-zinc-400 hover:bg-white/5">Cancelar</Button>
            <Button onClick={doAddGuest} disabled={guestBusy || guestName.trim().length < 2} className="bg-[#ff2d78] text-white text-xs uppercase font-black Oswald hover:bg-[#ff2d78]/90">
              {guestBusy ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
              Confirmar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Confirmação de Saída */}
      <AlertDialog
        open={leaveConfirmOpen}
        onOpenChange={(v) => {
          if (leaveBusy) return;
          setLeaveConfirmOpen(v);
        }}
      >
        <AlertDialogContent className="bg-[#13141a] border-red-500/30 max-w-sm">
          <AlertDialogHeader>
            <AlertDialogTitle className="Oswald uppercase font-black text-red-400">Confirmar Saída</AlertDialogTitle>
            <AlertDialogDescription className="text-xs Oswald uppercase text-zinc-400">
              Tem certeza de que deseja retirar seu nome da lista deste jogo?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <LeaveNoteField value={leaveNote} onChange={setLeaveNote} disabled={leaveBusy} />
          <AlertDialogFooter>
            <AlertDialogCancel disabled={leaveBusy} className="bg-[#1c1d25] border-zinc-700 text-zinc-300">Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                doLeaveSelf();
              }}
              disabled={leaveBusy}
              className="bg-red-600 text-white hover:bg-red-700"
            >
              {leaveBusy ? (
                <span className="flex items-center gap-2">
                  <Loader2 className="h-3 w-3 animate-spin" />
                  PROCESSANDO...
                </span>
              ) : "Confirmar saída"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Dialog Saída Tardia */}
      <AlertDialog
        open={!!lateLeaveInfo}
        onOpenChange={(v) => {
          if (leaveBusy) return;
          if (!v) { setLateLeaveInfo(null); setLeaveNote(""); }
        }}
      >
        <AlertDialogContent className="bg-[#13141a] border-amber-500/30 max-w-sm">
          <AlertDialogHeader>
            <AlertDialogTitle className="Oswald uppercase font-black text-amber-500">TÉRMINO DO PRAZO DE RETIRADA</AlertDialogTitle>
            <AlertDialogDescription className="text-xs text-zinc-400 leading-relaxed">
              {lateLeaveInfo && (
                <>
                  O prazo para retirar o nome terminou em:{" "}
                  <span className="font-semibold text-white">
                    {formatDeadlineLabel(lateLeaveInfo.deadline_at, lateLeaveInfo.timezone || "America/Sao_Paulo")}
                  </span>
                  .<br /><br />
                  {lateLeaveInfo.penalty > 0 ? (
                    <>A retirada após o prazo poderá gerar bloqueio nas próximas {lateLeaveInfo.penalty} rodadas.</>
                  ) : (
                    <>A retirada fora do prazo será registrada para análise da organização.</>
                  )}
                  <br /><br />
                  Deseja confirmar a saída mesmo assim?
                </>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <LeaveNoteField value={leaveNote} onChange={setLeaveNote} disabled={leaveBusy} />
          <AlertDialogFooter>
            <AlertDialogCancel disabled={leaveBusy} className="bg-[#1c1d25] border-zinc-700 text-zinc-300">Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                doLeaveSelf(true);
              }}
              disabled={leaveBusy}
              className="bg-red-600 text-white hover:bg-red-700"
            >
              {leaveBusy ? "Processando..." : "Confirmar saída"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Diálogos adicionais existentes */}
      <AuthDialog
        open={authOpen}
        onOpenChange={(v) => {
          if (!v) handleAuthCancel();
          setAuthOpen(v);
        }}
        onSuccess={handleAuthSuccess}
      />
      <NotificationsDialog
        open={notificationsOpen}
        onOpenChange={setNotificationsOpen}
        onNavigate={(tab, groupId) => {
          if (groupId) setGroupId(groupId);
          setActiveTab(tab as TabId);
          setNotificationsOpen(false);
        }}
      />
      {event && me && (
        <MyRegistrationsDialog
          open={myRegsOpen}
          onOpenChange={setMyRegsOpen}
          eventId={event.id}
          onChanged={refreshAll}
          setSelectedPlayerPhoto={setSelectedPlayerPhoto}
          groupName={(event as any)?.group_name}
        />
      )}
    </div>
  );
}

// ---------- AuthDialog ----------
function AuthDialog({
  open,
  onOpenChange,
  onSuccess,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onSuccess: (mode: "login" | "signup") => void | Promise<void>;
}) {
  const getEvent = useServerFn(get_current_event_full);
  const loginFn = useServerFn(player_login);
  const signupFn = useServerFn(player_signup);
  const resetPinFn = useServerFn(player_reset_pin);

  const groupsQ = useQuery({
    queryKey: ["all-groups"],
    queryFn: async () => {
      const res = await getEvent({ data: { group_id: null } });
      return (res as any)?.groups || [];
    },
    staleTime: 5 * 60 * 1000
  });
  const groups = groupsQ.data || [];

  const [tab, setTab] = useState<"login" | "signup">("login");
  const [fullName, setFullName] = useState("");
  const [phone, setPhone] = useState("");
  const [pin, setPin] = useState("");
  const [confirmPin, setConfirmPin] = useState("");
  const [showPin, setShowPin] = useState(false);
  const [selectedGroups, setSelectedGroups] = useState<string[]>([]);
  const [remember, setRemember] = useState(true);
  const [loading, setLoading] = useState(false);
  const [needsPinReset, setNeedsPinReset] = useState(false);
  const [newPin, setNewPin] = useState("");
  const [newPin2, setNewPin2] = useState("");

  const reset = () => {
    setFullName("");
    setPhone("");
    setPin("");
    setConfirmPin("");
    setShowPin(false);
    setSelectedGroups([]);
    setRemember(true);
    setLoading(false);
    setNeedsPinReset(false);
    setNewPin("");
    setNewPin2("");
  };

  const submitLogin = async () => {
    if (loading) return;
    const cleanedPhone = phone.replace(/\D/g, "");
    if (cleanedPhone.length < 10) {
      toast.error("Informe o WhatsApp com DDD (mínimo 10 dígitos).");
      return;
    }
    if (pin.length < 4) {
      toast.error("Informe seu PIN de no mínimo 4 dígitos.");
      return;
    }
    setLoading(true);
    try {
      const res = await loginFn({ data: { phone: cleanedPhone, pin, remember } });
      if ((res as any)?.error) {
        throw new Error((res as any).error);
      }
      if ((res as any)?.requires_reset) {
        setNeedsPinReset(true);
        toast.info("Você precisa cadastrar uma nova senha para continuar.");
        return;
      }
      reset();
      await onSuccess("login");
    } catch (e) {
      toast.error(friendlyError(e));
    } finally {
      setLoading(false);
    }
  };

  const submitReset = async () => {
    if (loading) return;
    if (newPin.length < 4 || newPin !== newPin2 || newPin === pin) return;
    setLoading(true);
    try {
      const res = await resetPinFn({ data: { phone: phone.replace(/\D/g, ""), current_pin: pin, new_pin: newPin, remember } });
      if (!(res as any)?.ok) throw new Error("invalid_credentials");
      reset();
      await onSuccess("login");
    } catch (e) {
      toast.error(friendlyError(e));
    } finally {
      setLoading(false);
    }
  };

  const [signupSuccess, setSignupSuccess] = useState(false);
  const [signupErrorMessage, setSignupErrorMessage] = useState<string | null>(null);

  const createPlaceholderAvatar = (name: string): File => {
    try {
      const canvas = document.createElement("canvas");
      canvas.width = 128;
      canvas.height = 128;
      const ctx = canvas.getContext("2d");
      if (ctx) {
        ctx.fillStyle = "#181a22";
        ctx.fillRect(0, 0, 128, 128);
        ctx.fillStyle = "#ff2d78";
        ctx.font = "bold 44px sans-serif";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        const initials = name
          .split(" ")
          .filter(Boolean)
          .slice(0, 2)
          .map((p) => p[0]?.toUpperCase())
          .join("") || "SP";
        ctx.fillText(initials, 64, 64);
      }
      const dataUrl = canvas.toDataURL("image/png");
      const binStr = atob(dataUrl.split(",")[1] || "");
      const arr = new Uint8Array(binStr.length);
      for (let i = 0; i < binStr.length; i++) {
        arr[i] = binStr.charCodeAt(i);
      }
      return new File([arr], "avatar.png", { type: "image/png" });
    } catch {
      const base64Png = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==";
      const binStr = atob(base64Png);
      const arr = new Uint8Array(binStr.length);
      for (let i = 0; i < binStr.length; i++) {
        arr[i] = binStr.charCodeAt(i);
      }
      return new File([arr], "avatar.png", { type: "image/png" });
    }
  };

  const submitSignup = async () => {
    if (loading) return;
    setSignupErrorMessage(null);

    const trimmedName = fullName.replace(/\s+/g, " ").trim();
    if (trimmedName.length < 3) {
      const msg = "Informe seu nome completo para identificação.";
      setSignupErrorMessage(msg);
      toast.error(msg);
      return;
    }

    const nameParts = trimmedName.split(" ").filter(Boolean);
    const firstName = nameParts[0] || "";
    const lastName = nameParts.slice(1).join(" ");

    let cleanedPhone = phone.replace(/\D/g, "");
    if (cleanedPhone.length < 10 || cleanedPhone.length > 11) {
      const msg = "Informe seu WhatsApp com DDD (10 ou 11 dígitos).";
      setSignupErrorMessage(msg);
      toast.error(msg);
      return;
    }
    if (cleanedPhone.length === 10) {
      const ddd = cleanedPhone.slice(0, 2);
      const rest = cleanedPhone.slice(2);
      cleanedPhone = `${ddd}9${rest}`;
    }

    if (!/^\d{4}$/.test(pin)) {
      const msg = "O PIN deve ter exatamente 4 números.";
      setSignupErrorMessage(msg);
      toast.error(msg);
      return;
    }
    if (pin !== confirmPin) {
      const msg = "Os PINs informados não conferem. Digite novamente.";
      setSignupErrorMessage(msg);
      toast.error(msg);
      return;
    }

    const effectiveGroupIds = selectedGroups.length > 0
      ? selectedGroups
      : groups.map((g: any) => g.id).filter(Boolean);

    if (effectiveGroupIds.length === 0) {
      const msg = "Selecione pelo menos uma turma para solicitar cadastro.";
      setSignupErrorMessage(msg);
      toast.error(msg);
      return;
    }

    setLoading(true);
    try {
      const payload = new FormData();
      payload.append("firstName", firstName);
      payload.append("lastName", lastName);
      payload.append("phone", cleanedPhone);
      payload.append("pin", pin);
      payload.append("remember", "true");
      effectiveGroupIds.forEach((gid: string) => payload.append("groupIds", gid));
      payload.append("photo", createPlaceholderAvatar(trimmedName));

      const response = await fetch("/api/player-signup", {
        method: "POST",
        body: payload,
      });

      const res = await response.json().catch(() => null);

      if (!response.ok || !res?.success) {
        const errorMsg = res?.userMessage || (res?.code ? friendlyError(res.code) : "Não foi possível concluir o cadastro. Tente novamente.");
        setSignupErrorMessage(errorMsg);
        toast.error(errorMsg);
        return;
      }

      setSignupSuccess(true);
    } catch (e: any) {
      const msg = friendlyError(e);
      setSignupErrorMessage(msg);
      toast.error(msg);
    }

    setLoading(false);
  };

  const toggleGroupSelection = (id: string) => {
    setSelectedGroups(prev => 
      prev.includes(id) ? prev.filter(g => g !== id) : [...prev, id]
    );
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        if (!v) reset();
        onOpenChange(v);
      }}
    >
      <DialogContent className="max-w-md bg-[#13141a] border-[#262833] text-white p-5 sm:p-6 rounded-2xl">
        <DialogHeader className="space-y-1.5">
          <DialogTitle className="Oswald uppercase font-black tracking-tight text-white text-lg sm:text-xl">
            {tab === "login" ? "Já tenho cadastro" : "Criar conta"}
          </DialogTitle>
          <DialogDescription className="text-xs text-zinc-400 Oswald uppercase tracking-wider">
            {tab === "login" 
              ? "Informe seu WhatsApp e PIN para entrar na lista"
              : "Cadastre-se para participar das próximas rodadas"
            }
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 pt-1">
          <Tabs value={tab} onValueChange={(v) => { setTab(v as any); }} className="w-full">
            <TabsList className="grid w-full grid-cols-2 bg-[#1a1b24] border border-[#2a2d3a] h-11 p-1 rounded-xl mb-4">
              <TabsTrigger 
                value="login" 
                className="text-xs Oswald uppercase font-black rounded-lg data-[state=active]:bg-[#ff2d78] data-[state=active]:text-white data-[state=active]:shadow-sm transition-all"
              >
                Já tenho cadastro
              </TabsTrigger>
              <TabsTrigger 
                value="signup" 
                className="text-xs Oswald uppercase font-black rounded-lg data-[state=active]:bg-[#ff2d78] data-[state=active]:text-white data-[state=active]:shadow-sm transition-all"
              >
                Criar conta
              </TabsTrigger>
            </TabsList>

            {/* Aba 1: Já tenho cadastro */}
            <TabsContent value="login" className="space-y-3.5 outline-none mt-0">
              {needsPinReset ? (
                <div className="space-y-3.5">
                  <p className="text-xs text-amber-300 Oswald uppercase">Cadastre uma nova senha para continuar.</p>
                  <div className="space-y-1.5">
                    <Label className="text-[10px] Oswald uppercase font-black tracking-wider text-zinc-400">Nova senha (4 a 8 dígitos)</Label>
                    <Input type="password" inputMode="numeric" maxLength={8} value={newPin} onChange={(e) => setNewPin(e.target.value.replace(/\D/g, ""))} className="h-11 bg-[#181a22] border-[#2a2d3a] text-white rounded-xl" />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-[10px] Oswald uppercase font-black tracking-wider text-zinc-400">Confirmar nova senha</Label>
                    <Input type="password" inputMode="numeric" maxLength={8} value={newPin2} onChange={(e) => setNewPin2(e.target.value.replace(/\D/g, ""))} className="h-11 bg-[#181a22] border-[#2a2d3a] text-white rounded-xl" />
                    {newPin2.length > 0 && newPin !== newPin2 && <p className="text-xs text-red-400">As senhas não coincidem.</p>}
                    {newPin.length >= 4 && newPin === pin && <p className="text-xs text-red-400">A nova senha deve ser diferente da atual.</p>}
                  </div>
                  <Button
                    onClick={submitReset}
                    disabled={loading || newPin.length < 4 || newPin !== newPin2 || newPin === pin}
                    className="w-full h-11 bg-[#ff2d78] text-white font-black Oswald uppercase tracking-wider hover:bg-[#ff2d78]/90 rounded-xl"
                  >
                    {loading ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
                    SALVAR E ENTRAR
                  </Button>
                </div>
              ) : (
              <>
              <div className="space-y-1.5">
                <Label className="text-[10px] Oswald uppercase font-black tracking-wider text-zinc-400">WhatsApp (com DDD)</Label>
                <Input
                  type="tel"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="Ex: 85999999999"
                  className="h-11 bg-[#181a22] border-[#2a2d3a] text-white placeholder:text-zinc-600 rounded-xl focus-visible:ring-[#ff2d78]"
                  autoFocus
                />
              </div>

              <div className="space-y-1.5">
                <Label className="text-[10px] Oswald uppercase font-black tracking-wider text-zinc-400">PIN / Senha Numérica</Label>
                <div className="relative">
                  <Input
                    type={showPin ? "text" : "password"}
                    maxLength={8}
                    value={pin}
                    onChange={(e) => setPin(e.target.value.replace(/\D/g, ""))}
                    placeholder="Digite seu PIN (4 a 8 dígitos)"
                    className="h-11 bg-[#181a22] border-[#2a2d3a] text-white placeholder:text-zinc-600 rounded-xl pr-10 focus-visible:ring-[#ff2d78]"
                    onKeyDown={(e) => { if (e.key === 'Enter') submitLogin(); }}
                  />
                  <button 
                    type="button"
                    onClick={() => setShowPin(!showPin)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-white transition-colors"
                    tabIndex={-1}
                  >
                    {showPin ? <EyeOff size={18} /> : <Eye size={18} />}
                  </button>
                </div>
              </div>

              <div className="flex items-center space-x-2 pt-1">
                <Checkbox 
                  id="remember-pin" 
                  checked={remember} 
                  onCheckedChange={(c) => setRemember(Boolean(c))} 
                  className="border-zinc-600 data-[state=checked]:bg-[#ff2d78] data-[state=checked]:border-[#ff2d78]"
                />
                <label
                  htmlFor="remember-pin"
                  className="text-xs Oswald uppercase text-zinc-400 cursor-pointer select-none"
                >
                  Lembrar de mim neste dispositivo
                </label>
              </div>

              <Button
                onClick={submitLogin}
                disabled={loading || phone.length < 8 || pin.length < 4}
                className="w-full h-11 bg-[#ff2d78] text-white font-black Oswald uppercase tracking-wider hover:bg-[#ff2d78]/90 shadow-lg shadow-[#ff2d78]/25 rounded-xl mt-2 active:scale-[0.98] transition-all"
              >
                {loading ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <LogIn className="w-4 h-4 mr-2" />}
                ACESSAR MINHA CONTA
              </Button>
              </>
              )}
            </TabsContent>

            {/* Aba 2: Criar conta */}
            <TabsContent value="signup" className="space-y-3.5 outline-none mt-0">
              {signupSuccess ? (
                <div className="py-4 space-y-4 text-center animate-in fade-in zoom-in duration-200">
                  <div className="w-14 h-14 rounded-full bg-emerald-500/20 text-emerald-400 flex items-center justify-center mx-auto border border-emerald-500/40">
                    <CheckCircle2 className="w-8 h-8" />
                  </div>
                  <div className="space-y-1">
                    <h3 className="text-base font-bold Oswald uppercase text-white">
                      Cadastro enviado para aprovação!
                    </h3>
                    <p className="text-xs text-zinc-300 leading-relaxed max-w-sm mx-auto">
                      Seu pedido foi registrado. A organização da pelada analisará seu cadastro em breve.
                    </p>
                  </div>
                  <div className="p-3 rounded-xl bg-[#181a22] border border-[#2a2d3a] text-left text-xs space-y-1">
                    <p className="font-bold Oswald uppercase text-[11px] text-amber-300 flex items-center gap-1.5">
                      <AlertCircle className="w-3.5 h-3.5 text-amber-400" /> Status: Pendente de Liberação
                    </p>
                    <p className="text-[10px] text-zinc-400 leading-relaxed">
                      Assim que liberado, basta entrar com seu WhatsApp e PIN para participar da lista de presença.
                    </p>
                  </div>
                  <Button
                    onClick={async () => {
                      setSignupSuccess(false);
                      setSignupErrorMessage(null);
                      reset();
                      await onSuccess("signup");
                    }}
                    className="w-full h-11 bg-[#ff2d78] text-white font-black Oswald uppercase tracking-wider hover:bg-[#ff2d78]/90 rounded-xl"
                  >
                    ENTENDI, FECHAR
                  </Button>
                </div>
              ) : (
                <>
                  {/* Alerta explicativo de aprovação prévia */}
                  <div className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/25 flex items-start gap-2.5 text-amber-300">
                    <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-amber-400" />
                    <div className="space-y-0.5 text-left">
                      <p className="text-[11px] font-black Oswald uppercase tracking-wide text-amber-200">
                        Aprovação necessária
                      </p>
                      <p className="text-[10px] leading-relaxed text-amber-300/80 Oswald uppercase">
                        Novos cadastros passam por análise da organização antes de poderem entrar nas listas. Cadastre-se e aguarde a liberação.
                      </p>
                    </div>
                  </div>

                  {signupErrorMessage && (
                    <div className="p-3 rounded-xl bg-red-500/15 border border-red-500/40 flex items-start gap-2.5 text-red-300 text-left">
                      <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-red-400" />
                      <div className="space-y-0.5">
                        <p className="text-[11px] font-black Oswald uppercase tracking-wide text-red-200">
                          Falha ao cadastrar
                        </p>
                        <p className="text-[10px] leading-relaxed text-red-300/90">
                          {signupErrorMessage}
                        </p>
                      </div>
                    </div>
                  )}

              <div className="space-y-1.5 text-left">
                <Label className="text-[10px] Oswald uppercase font-black tracking-wider text-zinc-400">Nome Completo</Label>
                <Input
                  type="text"
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  placeholder="Ex: Carlos Eduardo"
                  className="h-11 bg-[#181a22] border-[#2a2d3a] text-white placeholder:text-zinc-600 rounded-xl focus-visible:ring-[#ff2d78]"
                  autoFocus
                />
              </div>

              <div className="space-y-1.5 text-left">
                <Label className="text-[10px] Oswald uppercase font-black tracking-wider text-zinc-400">WhatsApp (com DDD)</Label>
                <Input
                  type="tel"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="Ex: 85999999999"
                  className="h-11 bg-[#181a22] border-[#2a2d3a] text-white placeholder:text-zinc-600 rounded-xl focus-visible:ring-[#ff2d78]"
                />
              </div>

              <div className="grid grid-cols-2 gap-2 text-left">
                <div className="space-y-1.5">
                  <Label className="text-[10px] Oswald uppercase font-black tracking-wider text-zinc-400">Criar PIN (4 a 8 dígitos)</Label>
                  <div className="relative">
                    <Input
                      type={showPin ? "text" : "password"}
                      maxLength={8}
                      value={pin}
                      onChange={(e) => setPin(e.target.value.replace(/\D/g, ""))}
                      placeholder="Ex: 1234"
                      className="h-11 bg-[#181a22] border-[#2a2d3a] text-white placeholder:text-zinc-600 rounded-xl pr-9 focus-visible:ring-[#ff2d78]"
                    />
                    <button 
                      type="button"
                      onClick={() => setShowPin(!showPin)}
                      className="absolute right-2.5 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-white transition-colors"
                      tabIndex={-1}
                    >
                      {showPin ? <EyeOff size={16} /> : <Eye size={16} />}
                    </button>
                  </div>
                </div>

                <div className="space-y-1.5 text-left">
                  <Label className="text-[10px] Oswald uppercase font-black tracking-wider text-zinc-400">Confirmar PIN</Label>
                  <Input
                    type={showPin ? "text" : "password"}
                    maxLength={8}
                    value={confirmPin}
                    onChange={(e) => setConfirmPin(e.target.value.replace(/\D/g, ""))}
                    placeholder="Repita o PIN"
                    className="h-11 bg-[#181a22] border-[#2a2d3a] text-white placeholder:text-zinc-600 rounded-xl focus-visible:ring-[#ff2d78]"
                  />
                </div>
              </div>

              {/* Seleção opcional de dias */}
              {groups.length > 0 && (
                <div className="space-y-1.5 text-left pt-1">
                  <Label className="text-[10px] Oswald uppercase font-black tracking-wider text-zinc-400">
                    Dias de preferência (opcional)
                  </Label>
                  <div className="grid grid-cols-4 gap-1.5">
                    {groups.map((g: any) => {
                      const isSelected = selectedGroups.length === 0 || selectedGroups.includes(g.id);
                      return (
                        <button
                          key={g.id}
                          type="button"
                          onClick={() => toggleGroupSelection(g.id)}
                          className={cn(
                            "py-2 px-1 text-center rounded-lg text-[10px] font-black Oswald uppercase tracking-wider border transition-all",
                            isSelected
                              ? "bg-[#ff2d78]/15 border-[#ff2d78]/50 text-[#ff2d78]"
                              : "bg-[#181a22] border-[#2a2d3a] text-zinc-400 hover:text-zinc-200"
                          )}
                        >
                          {g.name.split('-')[0].trim()}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              <Button
                onClick={submitSignup}
                disabled={loading || fullName.trim().length < 3 || phone.replace(/\D/g, "").length < 10 || pin.length !== 4 || pin !== confirmPin}
                className="w-full h-11 bg-[#ff2d78] text-white font-black Oswald uppercase tracking-wider hover:bg-[#ff2d78]/90 shadow-lg shadow-[#ff2d78]/25 rounded-xl mt-2 active:scale-[0.98] transition-all disabled:opacity-60 disabled:cursor-not-allowed"
              >
                {loading ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <CheckCircle2 className="w-4 h-4 mr-2" />}
                {loading ? "ENVIANDO CADASTRO..." : "SOLICITAR CADASTRO"}
              </Button>
                </>
              )}
            </TabsContent>
          </Tabs>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ---------- MyRegistrationsDialog ----------
function MyRegistrationsDialog({
  open,
  onOpenChange,
  eventId,
  onChanged,
  setSelectedPlayerPhoto,
  groupName,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  eventId: string;
  onChanged: () => void | Promise<void>;
  setSelectedPlayerPhoto: (p: any) => void;
  groupName?: string;
}) {
  const getMyRegs = useServerFn(get_my_registrations);
  const leaveFn = useServerFn(leave_registration);

  const q = useQuery({
    queryKey: ["my-regs-dialog", eventId, open],
    queryFn: () => getMyRegs({ data: { event_id: eventId } }),
    enabled: open,
  });

  const rows = (q.data?.registrations ?? []) as any[];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md bg-[#13141a] border-[#262833] text-white">
        <DialogHeader>
          <DialogTitle className="Oswald uppercase font-black text-[#ff2d78]">Minhas Inscrições</DialogTitle>
        </DialogHeader>
        <div className="space-y-2 pt-2">
          {rows.length === 0 ? (
            <p className="text-xs text-zinc-400 Oswald uppercase text-center py-6">Nenhuma inscrição ativa nesta rodada.</p>
          ) : (
            rows.map((r: any) => (
              <div key={r.id} className="p-3 rounded-xl bg-[#181a22] border border-[#262833] flex justify-between items-center">
                <div>
                  <p className="text-sm font-bold Oswald uppercase text-white">{r.player_name}</p>
                  <p className="text-[10px] text-zinc-400 Oswald uppercase">
                    {r.list_type === "main" ? "Titular" : "Reserva"} {r.list_position ? `· ${r.list_position}ª posição` : ""}
                  </p>
                </div>
              </div>
            ))
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

function LeaveNoteField({ value, onChange, disabled }: { value: string; onChange: (v: string) => void; disabled?: boolean }) {
  return (
    <div className="space-y-1">
      <label htmlFor="leave-note" className="text-[10px] Oswald uppercase tracking-widest text-zinc-400">
        Observação (opcional)
      </label>
      <textarea
        id="leave-note"
        value={value}
        maxLength={500}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value.slice(0, 500))}
        placeholder="Se quiser, explique o motivo da retirada."
        rows={3}
        className="w-full resize-none rounded-md border border-zinc-700 bg-[#1c1d25] p-2 text-base sm:text-sm text-zinc-200 placeholder:text-zinc-500 focus:outline-none focus:ring-1 focus:ring-amber-500/50"
      />
      <p className="text-right text-[10px] text-zinc-500">{value.length}/500</p>
    </div>
  );
}
