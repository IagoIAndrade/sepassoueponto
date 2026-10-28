import React from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { 
  Bell, 
  Clock, 
  Info, 
  Users, 
  AlertCircle, 
  CreditCard,
  ChevronRight,
  Circle,
  CheckCircle2,
  X
} from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { ptBR } from "date-fns/locale";
import { VisuallyHidden } from "@radix-ui/react-visually-hidden";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { 
  getMyNotifications, 
  markNotificationAsRead, 
  markAllNotificationsAsRead,
  type AppNotification,
  type NotificationType
} from "@/lib/notifications.functions";
import { cn } from "@/lib/utils";

interface NotificationsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onNavigate?: (tab: 'inicio' | 'rateio' | 'lista' | 'times', groupId?: string) => void;
}

const NOTIFICATION_CONFIG: Record<NotificationType, { 
  title: string; 
  icon: React.ElementType; 
  color: string;
  targetTab?: 'inicio' | 'rateio' | 'lista' | 'times';
}> = {
  registration_opened: { title: "Lista aberta", icon: Clock, color: "text-emerald-600 dark:text-emerald-400", targetTab: "inicio" },
  registration_confirmed: { title: "Vaga confirmada", icon: CheckCircle2, color: "text-emerald-600 dark:text-emerald-400", targetTab: "lista" },
  waitlist_joined: { title: "Você entrou na fila de espera", icon: Clock, color: "text-amber-600 dark:text-amber-400", targetTab: "lista" },
  promoted_to_main: { title: "Você conseguiu uma vaga! 🎉", icon: Users, color: "text-[var(--accent-neon)]", targetTab: "lista" },
  teams_published: { title: "Os times foram publicados", icon: Users, color: "text-[var(--accent-neon)]", targetTab: "times" },
  event_changed: { title: "Rodada alterada", icon: Info, color: "text-blue-600 dark:text-blue-400", targetTab: "inicio" },
  event_cancelled: { title: "Rodada cancelada", icon: AlertCircle, color: "text-red-600 dark:text-red-400", targetTab: "inicio" },
  organization_announcement: { title: "Aviso da organização", icon: Info, color: "text-[var(--accent-neon)]", targetTab: "inicio" },
  withdrawal_deadline: { title: "Prazo de retirada", icon: Clock, color: "text-amber-600 dark:text-amber-400", targetTab: "lista" },
  payment_pending: { title: "Pendência de rateio", icon: CreditCard, color: "text-amber-600 dark:text-amber-400", targetTab: "rateio" },
  access_approved: { title: "Acesso aprovado", icon: CheckCircle2, color: "text-emerald-600 dark:text-emerald-400", targetTab: "inicio" },
};

function recencyGroup(createdAt: string) {
  const created = new Date(createdAt).getTime();
  const ageMs = Date.now() - created;
  if (ageMs < 24 * 60 * 60 * 1000) return "Hoje";
  return "Últimos 7 dias";
}

function formatNotificationDate(value: unknown) {
  if (typeof value !== "string" || !value) return null;
  return new Date(`${value}T12:00:00`).toLocaleDateString("pt-BR");
}

export function NotificationsDialog({ open, onOpenChange, onNavigate }: NotificationsDialogProps) {
  const qc = useQueryClient();
  const getNotificationsFn = useServerFn(getMyNotifications);
  const markReadFn = useServerFn(markNotificationAsRead);
  const markAllReadFn = useServerFn(markAllNotificationsAsRead);

  const { data, isLoading } = useQuery({
    queryKey: ["notifications"],
    queryFn: () => getNotificationsFn(),
    enabled: open,
  });

  const notifications = data?.notifications ?? [];
  const unreadCount = notifications.filter(n => !n.read_at).length;
  const groupedNotifications = notifications.reduce<Record<string, AppNotification[]>>((acc, notification) => {
    const group = recencyGroup(notification.created_at);
    acc[group] = [...(acc[group] ?? []), notification];
    return acc;
  }, {});

  const markReadMutation = useMutation({
    mutationFn: (id: string) => markReadFn({ data: { id } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["notifications"] }),
  });

  const markAllReadMutation = useMutation({
    mutationFn: () => markAllReadFn(),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["notifications"] }),
  });

  const handleNotificationClick = (notification: AppNotification) => {
    if (!notification.read_at) {
      markReadMutation.mutate(notification.id);
    }
    
    const config = NOTIFICATION_CONFIG[notification.type];
    if (config.targetTab && onNavigate) {
      onNavigate(config.targetTab, notification.group_id || undefined);
      onOpenChange(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent 
        data-mobile-fullscreen-dialog="true"
        className="fixed !left-0 !top-0 !translate-x-0 !translate-y-0 !transform-none z-[200] max-w-none w-full h-[100dvh] p-0 border-0 bg-[color-mix(in_srgb,var(--bg)_95%,transparent)] backdrop-blur-xl flex flex-col overflow-hidden transition-all duration-300 [&>button]:hidden"
        aria-describedby="notifications-description"
      >
        <DialogHeader className="px-4 pt-[calc(1rem+env(safe-area-inset-top))] pb-4 border-b border-[var(--card-border)] bg-[color-mix(in_srgb,var(--card-bg)_80%,transparent)] flex flex-row items-center justify-between space-y-0 shrink-0 z-50">
          <div className="flex items-center gap-3">
             <Button
              variant="ghost"
              size="icon"
              aria-label="Fechar"
              className="text-[var(--text-muted)] hover:text-[var(--text)] transition-colors h-11 w-11 -ml-2"
              onClick={() => onOpenChange(false)}
            >
              <X className="h-6 w-6" />
            </Button>
            <DialogTitle className="text-sm font-black Oswald uppercase tracking-[0.15em] text-[var(--text)]">
              CENTRAL DE AVISOS
            </DialogTitle>
            <VisuallyHidden>
              <DialogDescription>Central de avisos e notificações do jogador</DialogDescription>
            </VisuallyHidden>
          </div>
          {unreadCount > 0 && (
            <Button 
              variant="ghost" 
              size="sm" 
              onClick={() => markAllReadMutation.mutate()}
              disabled={markAllReadMutation.isPending}
              className="text-[9px] text-[var(--accent-neon)] hover:bg-[var(--accent-neon)]/10 h-8 px-2 font-black uppercase tracking-widest Oswald"
            >
              MARCAR LIDOS
            </Button>
          )}
          <DialogDescription id="notifications-description" className="sr-only">
            Central de avisos e notificações do jogador
          </DialogDescription>
        </DialogHeader>

        <ScrollArea className="flex-1 min-h-0 overflow-y-auto">
          <div className="w-full max-w-lg mx-auto py-2 px-2 pb-[calc(1rem+env(safe-area-inset-bottom))]">
            {isLoading ? (
              <div className="p-12 text-center text-[var(--text-muted)] text-xs Oswald uppercase tracking-widest animate-pulse">Carregando avisos...</div>
            ) : notifications.length === 0 ? (
              <div className="p-16 text-center flex flex-col items-center gap-6">
                <div className="w-16 h-16 rounded-2xl bg-[var(--card-bg)] border border-[var(--card-border)] flex items-center justify-center">
                  <Bell className="h-8 w-8 text-[var(--text-muted)]/20" />
                </div>
                <div>
                  <p className="text-[var(--text)] font-black Oswald uppercase tracking-widest">Tudo em ordem!</p>
                  <p className="text-[10px] text-[var(--text-muted)] Oswald uppercase tracking-wider mt-2 max-w-[200px] mx-auto leading-relaxed">
                    Você não possui novas notificações no momento.
                  </p>
                </div>
              </div>
            ) : (
              <div className="space-y-4 p-2">
                {Object.entries(groupedNotifications).map(([group, items]) => (
                  <div key={group} className="space-y-2">
                    <p className="px-2 text-[9px] font-black uppercase tracking-[0.2em] Oswald text-[var(--accent-neon)]/60">
                      {group}
                    </p>
                    {items.map((n) => {
                  const config = NOTIFICATION_CONFIG[n.type];
                  const Icon = config.icon;
                  const isUnread = !n.read_at;
                  const eventDate = formatNotificationDate(n.metadata?.event_date);
                  const groupName = typeof n.metadata?.group_name === "string" ? n.metadata.group_name : typeof n.metadata?.event_name === "string" ? n.metadata.event_name : null;

                  return (
                    <button
                      key={n.id}
                      onClick={() => handleNotificationClick(n)}
                      className={cn(
                        "w-full text-left p-3.5 rounded-xl border transition-all flex gap-3.5 items-start active:scale-[0.99]",
                        isUnread 
                          ? "bg-[color-mix(in_srgb,var(--card-bg)_85%,var(--accent-neon)_15%)] border-[var(--accent-neon)]/40 shadow-sm shadow-[var(--accent-neon)]/10 ring-1 ring-[var(--accent-neon)]/25"
                          : "bg-[var(--card-bg)] border-[var(--card-border)] hover:border-[var(--card-border-glow)] opacity-90"
                      )}
                    >
                      <div className={cn(
                        "mt-0.5 p-2 rounded-lg border shrink-0",
                        isUnread
                          ? "bg-[var(--card-bg)] border-[var(--accent-neon)]/30"
                          : "bg-[color-mix(in_srgb,var(--card-bg)_85%,var(--text)_15%)] border-[var(--card-border)]",
                        config.color
                      )}>
                        <Icon className="h-4 w-4" />
                      </div>
                      
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between gap-2 mb-1">
                          <span className={cn(
                            "text-[12px] font-black uppercase tracking-wider Oswald leading-none", 
                            isUnread ? "text-[var(--text)]" : "text-[var(--text-muted)]"
                          )}>
                            {config.title}
                          </span>
                          {isUnread ? (
                            <span className="flex items-center gap-1 text-[8px] font-black uppercase tracking-wider Oswald text-[var(--accent-neon)] bg-[var(--accent-neon)]/10 px-1.5 py-0.5 rounded border border-[var(--accent-neon)]/30">
                              <span className="h-1.5 w-1.5 rounded-full bg-[var(--accent-neon)] animate-pulse" />
                              Nova
                            </span>
                          ) : (
                            <span className="text-[8px] font-medium text-[var(--text-muted)]/70 uppercase Oswald">Lida</span>
                          )}
                        </div>
                        
                        {n.metadata?.message && (
                          <p className={cn(
                            "text-[11px] mb-2 leading-snug Oswald font-medium tracking-tight",
                            isUnread ? "text-[var(--text)]" : "text-[var(--text-muted)]"
                          )}>
                            {n.metadata.message}
                          </p>
                        )}
                        {(groupName || eventDate) && (
                          <p className="text-[9px] mb-1 leading-relaxed Oswald uppercase font-bold tracking-tight text-[var(--accent-neon)]/70">
                            {groupName ? `TURMA: ${groupName}` : null}{groupName && eventDate ? " • " : null}{eventDate ? `DATA: ${eventDate}` : null}
                          </p>
                        )}

                        <div className="flex flex-wrap items-center gap-2 text-[8px] text-[var(--text-muted)]/40 uppercase font-black tracking-[0.2em] Oswald mt-1">
                          <span>{formatDistanceToNow(new Date(n.created_at), { addSuffix: true, locale: ptBR })}</span>
                          <span>{isUnread ? "NÃO LIDA" : "LIDA"}</span>
                          <span>TOQUE PARA ABRIR</span>
                        </div>
                      </div>

                      <ChevronRight className="h-3 w-3 text-[var(--text-muted)]/40 mt-1" />
                    </button>
                  );
                    })}
                  </div>
                ))}
              </div>
            )}
          </div>
        </ScrollArea>
        
        <div className="p-4 pb-[calc(1rem+env(safe-area-inset-bottom))] border-t border-[var(--card-border)] bg-[color-mix(in_srgb,var(--card-bg)_80%,transparent)] shrink-0">
          <Button 
            className="w-full h-12 rounded-xl bg-[var(--card-bg)] border border-[var(--card-border)] text-[var(--text-muted)] Oswald font-black uppercase tracking-widest active:scale-[0.98] transition-all"
            onClick={() => onOpenChange(false)}
          >
            VOLTAR
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
