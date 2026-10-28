import { useState, useEffect, useMemo, useCallback } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { useQueryClient, useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { X, Edit3, History, TrendingUp, DollarSign, Bell, LogOut, ChevronRight, Settings, ShieldCheck, Lock } from "lucide-react";
import { Link } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";

import { player_logout, update_my_player_name, player_upsert_self_rating, player_get_my_self_rating } from "@/lib/players.functions";
import { get_my_fund_status_public, get_current_event_full, getMyGroupAccesses } from "@/lib/public.functions";
import { get_my_group_accesses, player_request_group_access } from "@/lib/group-access.functions";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { PlayerAvatarEditable } from "@/components/PlayerAvatarEditable";
import { MyHistoryDialog } from "@/components/MyHistoryDialog";
import { NotificationsDialog } from "@/components/NotificationsDialog";
import { PushSettingsDialog } from "@/components/PushSettingsDialog";

export function PlayerProfileMenu({ eventData, selectedGroup, groupId, setGroupId, onAuthRequired, onChanged, setActiveTab, onMenuStateChange }: any) {
  const qc = useQueryClient();
  const logoutFn = useServerFn(player_logout);
  const updateNameFn = useServerFn(update_my_player_name);
  
  const [menuOpen, setMenuOpenState] = useState(false);
  const setMenuOpen = (val: boolean) => {
    setMenuOpenState(val);
    onMenuStateChange?.(val);
  };
  const [activeView, setActiveView] = useState<'menu' | 'profile' | 'rating' | 'finance'>('menu');
  const [historyOpen, setHistoryOpen] = useState(false);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [pushSettingsOpen, setPushSettingsOpen] = useState(false);
  const getAccesses = useServerFn(get_my_group_accesses);
  const requestAccessFn = useServerFn(player_request_group_access);
  const accessesQ = useQuery({
    queryKey: ["my-group-accesses-dialog", menuOpen],
    queryFn: () => getAccesses(),
    enabled: menuOpen && !!eventData?.current_player_id,
    staleTime: 10_000,
  });

  // Reapply cooldown state
  const [reapplyBusy, setReapplyBusy] = useState<Record<string, boolean>>({});
  const [reapplyConfirm, setReapplyConfirm] = useState<{ groupId: string; groupName: string } | null>(null);
  const [nowMs, setNowMs] = useState(() => Date.now());
  useEffect(() => {
    if (!menuOpen) return;
    const id = setInterval(() => setNowMs(Date.now()), 1000);
    return () => clearInterval(id);
  }, [menuOpen]);

  // Server time offset for accurate countdown
  const serverOffset = useMemo(() => {
    const serverNow = (accessesQ.data as any)?.server_now;
    if (!serverNow) return 0;
    const serverMs = new Date(serverNow).getTime();
    if (isNaN(serverMs)) return 0;
    return serverMs - Date.now();
  }, [accessesQ.data]);

  const getServerNow = useCallback(() => Date.now() + serverOffset, [serverOffset]);

  const getCooldownInfo = useCallback((acc: any): { canReapply: boolean; remainingMs: number; remainingLabel: string } => {
    if (acc?.status !== 'rejected' || !acc?.processed_at) {
      return { canReapply: false, remainingMs: 0, remainingLabel: '' };
    }
    const rejectedAtMs = new Date(acc.processed_at).getTime();
    if (isNaN(rejectedAtMs)) return { canReapply: false, remainingMs: 0, remainingLabel: '' };
    const cooldownEndMs = rejectedAtMs + 24 * 60 * 60 * 1000;
    const serverNowMs = getServerNow();
    const remaining = cooldownEndMs - serverNowMs;
    if (remaining <= 0) {
      return { canReapply: true, remainingMs: 0, remainingLabel: '' };
    }
    const hours = Math.floor(remaining / (1000 * 60 * 60));
    const mins = Math.floor((remaining % (1000 * 60 * 60)) / (1000 * 60));
    const secs = Math.floor((remaining % (1000 * 60)) / 1000);
    const label = `${String(hours).padStart(2, '0')}:${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
    return { canReapply: false, remainingMs: remaining, remainingLabel: label };
  }, [getServerNow, nowMs]);

  const handleReapply = async (groupId: string) => {
    setReapplyBusy(prev => ({ ...prev, [groupId]: true }));
    try {
      await requestAccessFn({ data: { group_id: groupId } });
      toast.success('Solicitação enviada! Aguarde a análise da organização.');
      setReapplyConfirm(null);
      accessesQ.refetch();
      onChanged();
    } catch (e: any) {
      const msg = e.message || '';
      if (msg.startsWith('cooldown_active::')) {
        toast.error('Ainda não passaram 24 horas desde a última rejeição.');
      } else {
        toast.error(msg || 'Erro ao solicitar acesso.');
      }
    } finally {
      setReapplyBusy(prev => ({ ...prev, [groupId]: false }));
    }
  };

  const openPanel = (action: () => void) => {
    setMenuOpen(false);
    setTimeout(() => {
      action();
    }, 100);
  };
  
  const isLoggedIn = !!eventData?.current_player_id;
  const profile = eventData?.current_player_profile;
  const reg = eventData?.current_player_registration;
  const realName = profile?.name || reg?.player?.name || reg?.player_name;
  const playerName = realName || "Jogador";
  const playerAvatar = profile?.avatar_path || reg?.player_avatar || reg?.player_avatar_path || reg?.player?.avatar_path;

  const [isAdminUser, setIsAdminUser] = useState(false);
  useEffect(() => {
    let mounted = true;
    async function checkAdmin() {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session?.user) {
          if (mounted) setIsAdminUser(false);
          return;
        }
        const { data } = await supabase.rpc("has_role", {
          _user_id: session.user.id,
          _role: "admin",
        });
        if (mounted) setIsAdminUser(Boolean(data));
      } catch {
        if (mounted) setIsAdminUser(false);
      }
    }
    checkAdmin();
    const { data: { subscription } } = supabase.auth.onAuthStateChange(() => {
      checkAdmin();
    });
    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, []);

  const isAnyAdmin = Boolean(
    isAdminUser ||
    eventData?.is_admin ||
    profile?.is_admin ||
    profile?.role === "admin"
  );

  const handleLogout = async () => {
    try {
      await logoutFn();
      await supabase.auth.signOut();
      setMenuOpen(false);
      onChanged();
      toast.success("Saiu com sucesso");
      setTimeout(() => window.location.reload(), 300);
    } catch (e) {
      toast.error("Erro ao sair");
    }
  };

  const renderTrigger = () => {
    if (isLoggedIn) {
      return (
        <button 
          onClick={() => setMenuOpen(true)}
          className="h-[44px] w-[44px] shrink-0 rounded-full border-2 border-[var(--accent-neon)] bg-[var(--card-bg)] overflow-hidden active:scale-95 transition-transform shadow-lg"
          aria-label="Abrir menu do jogador"
        >
          {playerAvatar ? (
            <img src={playerAvatar} alt="Perfil" className="w-full h-full object-cover" />
          ) : (
            <div className="w-full h-full flex items-center justify-center bg-[var(--card-bg)] text-[var(--accent-neon)] font-bold font-oswald text-sm uppercase">
              {playerName[0]}
            </div>
          )}
        </button>
      );
    }
    return (
      <Button 
        onClick={onAuthRequired}
        variant="outline"
        className="h-[44px] min-w-[44px] px-4 border-[var(--accent-neon)]/50 text-[var(--accent-neon)] uppercase font-black Oswald tracking-widest bg-[var(--card-bg)]/80 backdrop-blur-md"
      >
        Entrar
      </Button>
    );
  };

  return (
    <>
      {renderTrigger()}
      
      <Dialog open={menuOpen} onOpenChange={setMenuOpen}>
        <DialogContent className="bg-[var(--card-bg)] border border-[var(--card-border)] text-[var(--text)] max-h-[calc(100dvh-32px)] w-[calc(100vw-32px)] sm:max-w-md rounded-2xl p-0 flex flex-col shadow-2xl [&>button]:hidden">
          <div className="flex items-center justify-between px-5 py-4 border-b border-[var(--card-border)] bg-[color-mix(in_srgb,var(--card-bg)_92%,transparent)] shrink-0">
            <div className="flex items-center gap-3">
              <div className="w-2 h-2 rounded-full bg-[var(--accent-neon)]" />
              <DialogTitle className="text-base font-black Oswald uppercase tracking-wider text-[var(--text)]">
                Minha Conta
              </DialogTitle>
            </div>
            <DialogDescription className="sr-only">Menu principal da conta do jogador</DialogDescription>
            <Button variant="ghost" size="icon" className="h-9 w-9 text-[var(--text-muted)] hover:text-[var(--text)] hover:bg-[color-mix(in_srgb,var(--text)_8%,transparent)] rounded-lg -mr-1" onClick={() => setMenuOpen(false)} aria-label="Fechar">
              <X className="w-5 h-5" />
            </Button>
          </div>
          <div className="p-4 space-y-2 overflow-y-auto flex-1">
            {/* Status de Acesso por Turma */}
            <div className="mb-3 p-3 rounded-xl bg-[color-mix(in_srgb,var(--card-bg)_90%,var(--text)_10%)] border border-[var(--card-border)] space-y-2">
              <p className="text-[10px] font-bold uppercase Oswald tracking-widest text-[var(--text-muted)]">
                Status de Acesso por Turma
              </p>
              <div className="space-y-1.5">
                {(eventData?.groups || []).map((g: any) => {
                  const accesses = Array.isArray(accessesQ.data) ? accessesQ.data : ((accessesQ.data as any)?.accesses ?? []);
                  const acc = accesses.find((a: any) => a.group_id === g.id);
                  const status = acc?.status;
                  const cooldown = getCooldownInfo(acc);
                  return (
                    <div key={g.id} className="flex flex-col gap-1 py-1.5 border-b border-[var(--card-border)]/40 last:border-b-0">
                      <div className="flex items-center justify-between text-xs">
                        <span className="font-bold uppercase Oswald text-[var(--text)]">{g.name}</span>
                        {status === 'approved' ? (
                          <Badge className="bg-emerald-500/15 text-emerald-400 border-emerald-500/30 text-[9px] font-bold uppercase">Aprovado</Badge>
                        ) : status === 'pending' ? (
                          <Badge className="bg-amber-500/15 text-amber-400 border-amber-500/30 text-[9px] font-bold uppercase">Pendente</Badge>
                        ) : status === 'rejected' ? (
                          <Badge className="bg-red-500/15 text-red-400 border-red-500/30 text-[9px] font-bold uppercase">Rejeitado</Badge>
                        ) : (
                          <span className="text-[10px] text-[var(--text-muted)] uppercase font-semibold">Não solicitado</span>
                        )}
                      </div>
                      {status === 'rejected' && (
                        <div className="flex items-center justify-between gap-2">
                          {cooldown.canReapply ? (
                            <Button
                              size="sm"
                              variant="outline"
                              disabled={!!reapplyBusy[g.id]}
                              onClick={() => setReapplyConfirm({ groupId: g.id, groupName: g.name })}
                              className="h-7 text-[9px] font-bold uppercase Oswald border-[var(--accent-neon)]/40 text-[var(--accent-neon)] hover:bg-[var(--accent-neon)]/10 w-full"
                            >
                              {reapplyBusy[g.id] ? 'Enviando...' : 'Solicitar novamente'}
                            </Button>
                          ) : cooldown.remainingMs > 0 ? (
                            <div className="flex items-center gap-1.5 w-full">
                              <Lock className="w-3 h-3 text-[var(--text-muted)] shrink-0" />
                              <span className="text-[9px] text-[var(--text-muted)] font-mono">
                                Aguarde {cooldown.remainingLabel}
                              </span>
                            </div>
                          ) : null}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>

            <MenuOption icon={Edit3} label="Editar Perfil" onClick={() => openPanel(() => setActiveView('profile'))} />
            <MenuOption icon={History} label="Minhas Inscrições" onClick={() => openPanel(() => setHistoryOpen(true))} />
            <MenuOption icon={TrendingUp} label="Minha Autoavaliação" onClick={() => openPanel(() => setActiveView('rating'))} />
            <MenuOption icon={Bell} label="Central de Avisos" onClick={() => openPanel(() => setNotificationsOpen(true))} />
            <MenuOption icon={Settings} label="Configurar notificações" onClick={() => openPanel(() => setPushSettingsOpen(true))} />
            
            {isAnyAdmin && (
              <div className="pt-1">
                <Link to="/admin" onClick={() => setMenuOpen(false)} className="block w-full">
                  <Button variant="ghost" className="w-full justify-between h-12 bg-[color-mix(in_srgb,var(--accent-neon)_10%,transparent)] border border-[color-mix(in_srgb,var(--accent-neon)_40%,transparent)] hover:bg-[color-mix(in_srgb,var(--accent-neon)_18%,transparent)] active:scale-[0.99] transition-all rounded-xl px-4 text-[var(--accent-neon)]">
                    <div className="flex items-center">
                      <ShieldCheck className="w-4 h-4 mr-3 text-[var(--accent-neon)]" />
                      <span className="font-bold Oswald uppercase tracking-wider text-xs text-[var(--text)]">PAINEL ADM</span>
                    </div>
                    <ChevronRight className="w-4 h-4 text-[var(--accent-neon)]" />
                  </Button>
                </Link>
              </div>
            )}

            <div className="h-px bg-[var(--card-border)] my-3" />
            
            <Button variant="ghost" className="w-full justify-start text-red-500 hover:text-red-600 hover:bg-red-500/10 h-12 rounded-xl transition-colors" onClick={handleLogout}>
              <LogOut className="w-4 h-4 mr-3" />
              <span className="font-bold Oswald uppercase tracking-widest text-xs">Sair da conta</span>
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <ProfileDialog open={activeView === 'profile'} onOpenChange={(val: boolean) => setActiveView(val ? 'profile' : 'menu')} profileName={realName} playerAvatar={playerAvatar} updateNameFn={updateNameFn} onChanged={onChanged} />
      
      <SelfRatingDialog open={activeView === 'rating'} onOpenChange={(val: boolean) => setActiveView(val ? 'rating' : 'menu')} />
      
      {/* Reapply confirmation dialog */}
      <Dialog open={!!reapplyConfirm} onOpenChange={(open) => { if (!open) setReapplyConfirm(null); }}>
        <DialogContent className="bg-[var(--card-bg)] border border-[var(--card-border)] text-[var(--text)] w-[calc(100vw-32px)] sm:max-w-sm rounded-2xl p-5 [&>button]:hidden">
          <DialogHeader>
            <DialogTitle className="text-base font-black Oswald uppercase tracking-wider text-[var(--text)]">
              Solicitar novamente
            </DialogTitle>
          </DialogHeader>
          <p className="text-sm text-[var(--text-muted)]">
            Deseja enviar uma nova solicitação de acesso para <strong className="text-[var(--text)]">{reapplyConfirm?.groupName}</strong>?
          </p>
          <p className="text-xs text-[var(--text-muted)]">
            A organização precisará aprovar sua solicitação. Você não terá acesso até a aprovação.
          </p>
          <div className="flex gap-2 mt-4">
            <Button variant="outline" className="flex-1 h-10 text-xs font-bold uppercase Oswald" onClick={() => setReapplyConfirm(null)}>
              Cancelar
            </Button>
            <Button
              className="flex-1 h-10 text-xs font-black uppercase Oswald bg-[var(--accent-neon)] hover:bg-[var(--accent-neon)]/90 text-white"
              disabled={!!reapplyBusy[reapplyConfirm?.groupId ?? '']}
              onClick={() => { if (reapplyConfirm) handleReapply(reapplyConfirm.groupId); }}
            >
              {reapplyBusy[reapplyConfirm?.groupId ?? ''] ? 'Enviando...' : 'Confirmar'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <FinanceDialog open={activeView === 'finance'} onOpenChange={(val: boolean) => setActiveView(val ? 'finance' : 'menu')} groupId={groupId} eventData={eventData} selectedGroup={selectedGroup} />

      <MyHistoryDialog open={historyOpen} onOpenChange={setHistoryOpen} onChanged={onChanged} player={null} />
      <NotificationsDialog open={notificationsOpen} onOpenChange={setNotificationsOpen} onNavigate={(tab) => setActiveTab(tab)} />
      <PushSettingsDialog open={pushSettingsOpen} onOpenChange={setPushSettingsOpen} groups={eventData?.groups || []} />
    </>
  );
}

function MenuOption({ icon: Icon, label, onClick }: any) {
  return (
    <Button variant="ghost" className="w-full justify-between h-12 bg-[color-mix(in_srgb,var(--card-bg)_92%,var(--text)_8%)] border border-[var(--card-border)] hover:border-[color-mix(in_srgb,var(--accent-neon)_40%,transparent)] hover:bg-[color-mix(in_srgb,var(--card-bg)_86%,var(--text)_14%)] active:scale-[0.99] transition-all rounded-xl px-4" onClick={onClick}>
      <div className="flex items-center">
        <Icon className="w-4 h-4 mr-3 text-[var(--accent-neon)]" />
        <span className="font-bold Oswald uppercase tracking-wider text-xs text-[var(--text)]">{label}</span>
      </div>
      <ChevronRight className="w-4 h-4 text-[var(--text-muted)]" />
    </Button>
  );
}

export function ProfileDialog({ open, onOpenChange, profileName, playerAvatar, updateNameFn, onChanged }: any) {
  const [name, setName] = useState("");
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (open) setName(profileName || "");
  }, [open, profileName]);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSaving(true);
    const loadingToast = toast.loading("Salvando perfil...");
    try {
      await updateNameFn({ data: { name } });
      toast.success("Perfil salvo!", { id: loadingToast });
      onChanged();
      onOpenChange(false);
    } catch (e: any) {
      toast.error(e.message || "Erro ao salvar", { id: loadingToast });
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent aria-describedby={undefined} className="bg-[var(--card-bg)] border border-[var(--card-border)] text-[var(--text)] max-h-[calc(100dvh-32px)] w-[calc(100vw-32px)] sm:max-w-md rounded-2xl p-0 flex flex-col shadow-2xl [&>button]:hidden">
        <DialogHeader className="px-5 py-4 border-b border-[var(--card-border)] bg-[color-mix(in_srgb,var(--card-bg)_92%,transparent)] flex flex-row items-center justify-between shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-2 h-2 rounded-full bg-[var(--accent-neon)]" />
            <DialogTitle className="text-base font-black Oswald uppercase tracking-wider text-[var(--text)]">Editar Perfil</DialogTitle>
          </div>
          <Button variant="ghost" size="icon" className="h-9 w-9 text-[var(--text-muted)] hover:text-[var(--text)] hover:bg-[color-mix(in_srgb,var(--text)_8%,transparent)] rounded-lg -mr-1" onClick={() => onOpenChange(false)} aria-label="Fechar">
            <X className="w-5 h-5" />
          </Button>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto p-5 space-y-6">
          <div className="flex flex-col items-center justify-center p-4 rounded-xl bg-[color-mix(in_srgb,var(--card-bg)_90%,var(--text)_10%)] border border-[var(--card-border)]">
            <PlayerAvatarEditable 
              path={playerAvatar} 
              name={profileName || "U"} 
              size="lg" 
            />
            <p className="text-[11px] text-[var(--text-muted)] mt-2 font-medium">Toque na foto para alterar</p>
          </div>

          <form id="profile-form" onSubmit={handleSave} className="space-y-4">
            <div className="space-y-2">
              <Label className="text-xs font-bold uppercase Oswald tracking-wider text-[var(--text-muted)]">Seu Nome</Label>
              <Input 
                value={name} 
                onChange={(e) => setName(e.target.value)} 
                className="h-11 bg-[color-mix(in_srgb,var(--card-bg)_90%,var(--text)_10%)] border-[var(--card-border)] text-sm text-[var(--text)] focus-visible:border-[var(--accent-neon)]"
                required 
                minLength={2} 
              />
            </div>
          </form>
        </div>

        <div className="p-4 border-t border-[var(--card-border)] bg-[color-mix(in_srgb,var(--card-bg)_95%,transparent)] shrink-0">
          <Button form="profile-form" type="submit" className="w-full h-11 text-xs font-black Oswald uppercase tracking-wider bg-[var(--accent-neon)] hover:bg-[var(--accent-neon)]/90 text-white shadow-lg shadow-[var(--accent-neon)]/20" disabled={isSaving}>
            {isSaving ? "Salvando..." : "Salvar Alterações"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export function SelfRatingDialog({ open, onOpenChange }: any) {
  const getRatingFn = useServerFn(player_get_my_self_rating);
  const upsertRatingFn = useServerFn(player_upsert_self_rating);
  
  const { data, isLoading } = useQuery({
    queryKey: ["self-rating", open],
    queryFn: () => getRatingFn(),
    enabled: open,
  });

  const [form, setForm] = useState({
    reception_score: 3, setting_score: 3, attack_score: 3, 
    serve_score: 3, block_score: 3, defense_score: 3, 
    movement_score: 3, positioning_score: 3, 
    primary_position: "PONTEIRO", height_cm: 180
  });
  
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    const rating = data?.rating ?? null;
    if (rating) {
      setForm(prev => ({
        ...prev,
        reception_score: rating.reception_score ?? prev.reception_score,
        setting_score: rating.setting_score ?? prev.setting_score,
        attack_score: rating.attack_score ?? prev.attack_score,
        serve_score: rating.serve_score ?? prev.serve_score,
        block_score: rating.block_score ?? prev.block_score,
        defense_score: rating.defense_score ?? prev.defense_score,
        movement_score: rating.movement_score ?? prev.movement_score,
        positioning_score: rating.positioning_score ?? prev.positioning_score,
        primary_position: rating.primary_position ?? prev.primary_position,
        height_cm: rating.height_cm ?? prev.height_cm
      }));
    }
  }, [data]);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSaving(true);
    const toastId = toast.loading("Salvando autoavaliação...");
    try {
      await upsertRatingFn({ data: form });
      toast.success("Autoavaliação salva!", { id: toastId });
      onOpenChange(false);
    } catch (e: any) {
      toast.error(e.message || "Erro", { id: toastId });
    } finally {
      setIsSaving(false);
    }
  };

  const fields = [
    { key: "reception_score", label: "Recepção", desc: "Passe de saque e bola de graça" },
    { key: "setting_score", label: "Levantamento", desc: "Precisão no toque e manchete alta" },
    { key: "attack_score", label: "Ataque", desc: "Potência, passada e variação de golpe" },
    { key: "serve_score", label: "Saque", desc: "Regularidade, força e direção do serviço" },
    { key: "block_score", label: "Bloqueio", desc: "Tempo de salto, invasão e fechamento" },
    { key: "defense_score", label: "Defesa", desc: "Posicionamento e recuperação de ataques" },
    { key: "movement_score", label: "Movimentação", desc: "Agilidade, cobertura e deslocamento em quadra" },
    { key: "positioning_score", label: "Posicionamento", desc: "Leitura tática e respeito às zonas de jogo" }
  ] as const;

  const averageScore = useMemo(() => {
    const sum = fields.reduce((acc, f) => acc + (Number(form[f.key as keyof typeof form]) || 0), 0);
    return (sum / fields.length).toFixed(1);
  }, [form, fields]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent aria-describedby={undefined} className="bg-[var(--bg)] border border-[var(--card-border)] text-[var(--text)] max-h-[calc(100dvh-32px)] w-[calc(100vw-32px)] sm:max-w-md rounded-2xl p-0 flex flex-col shadow-2xl [&>button]:hidden">
        <DialogHeader className="px-5 py-4 border-b border-[var(--card-border)] bg-[var(--card-bg)] flex flex-row items-center justify-between shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-2.5 h-2.5 rounded-full bg-[var(--accent-neon)] shadow-[0_0_8px_var(--accent-neon)]" />
            <DialogTitle className="text-base font-black Oswald uppercase tracking-wider text-[var(--text)]">
              Minha Autoavaliação
            </DialogTitle>
          </div>
          <Button variant="ghost" size="icon" className="h-9 w-9 text-[var(--text-muted)] hover:text-[var(--text)] hover:bg-[color-mix(in_srgb,var(--text)_8%,transparent)] rounded-lg -mr-1" onClick={() => onOpenChange(false)} aria-label="Fechar">
            <X className="w-5 h-5" />
          </Button>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto overscroll-contain px-4 py-4 sm:px-5 space-y-4 min-h-0">
          {isLoading ? (
            <div className="flex justify-center items-center py-16">
              <div className="w-8 h-8 border-4 border-[var(--accent-neon)] border-t-transparent rounded-full animate-spin"></div>
            </div>
          ) : (
            <form id="rating-form" onSubmit={handleSave} className="space-y-3 pb-24">
              {/* Média Geral em Destaque */}
              <div className="p-4 rounded-xl bg-[var(--card-bg)] border border-[var(--card-border)] flex items-center justify-between shadow-lg">
                <div className="space-y-0.5">
                  <span className="text-[11px] font-black uppercase tracking-widest text-[var(--text)] Oswald block">Média Geral Calculada</span>
                  <span className="text-xs text-[var(--text-muted)] font-medium block">Baseada nos 8 fundamentos técnicos</span>
                </div>
                <div className="flex items-baseline gap-1 bg-[var(--bg)] border border-[var(--accent-neon)]/40 px-3.5 py-1.5 rounded-xl shadow-[0_0_14px_rgba(255,0,153,0.2)]">
                  <span className="text-2xl font-black text-[var(--accent-neon)] Oswald leading-none">{averageScore}</span>
                  <span className="text-[11px] font-bold text-[var(--text-muted)] Oswald">/5.0</span>
                </div>
              </div>

              {/* Posição Principal e Altura lado a lado */}
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5 p-3.5 rounded-xl bg-[var(--card-bg)] border border-[var(--card-border)]">
                  <Label className="text-[10px] font-bold uppercase Oswald tracking-widest text-[var(--text)] block">Posição Principal</Label>
                  <select 
                    className="w-full h-10 bg-[var(--bg)] border border-[var(--card-border)] rounded-lg px-2.5 text-[var(--text)] font-bold text-xs focus:border-[var(--accent-neon)] focus:ring-1 focus:ring-[var(--accent-neon)] outline-none transition-colors"
                    value={form.primary_position}
                    onChange={(e) => setForm({...form, primary_position: e.target.value})}
                  >
                    <option value="LEVANTADOR">Levantador</option>
                    <option value="PONTEIRO">Ponteiro</option>
                    <option value="OPOSTO">Oposto</option>
                    <option value="CENTRAL">Central</option>
                    <option value="LIBERO">Líbero</option>
                  </select>
                </div>

                <div className="space-y-1.5 p-3.5 rounded-xl bg-[var(--card-bg)] border border-[var(--card-border)]">
                  <Label className="text-[10px] font-bold uppercase Oswald tracking-widest text-[var(--text)] block">Altura (cm)</Label>
                  <Input 
                    type="number"
                    min="120"
                    max="230"
                    value={form.height_cm || ""}
                    onChange={(e) => setForm({...form, height_cm: Number(e.target.value)})}
                    className="h-10 bg-[var(--bg)] border-[var(--card-border)] text-xs font-bold text-[var(--text)] rounded-lg focus-visible:border-[var(--accent-neon)] focus-visible:ring-1 focus-visible:ring-[var(--accent-neon)]"
                    placeholder="Ex: 180"
                  />
                </div>
              </div>

              {/* Fundamentos com seletores de 0 a 5 */}
              <div className="space-y-1">
                <div className="flex items-center justify-between px-1 pt-1 pb-2 border-b border-[var(--card-border)]">
                  <h3 className="text-xs font-black Oswald uppercase text-[var(--text)] tracking-widest">Fundamentos Técnicos</h3>
                  <span className="text-[10px] text-[var(--text-muted)] font-bold uppercase tracking-wider Oswald">Notas de 0 a 5</span>
                </div>

                <div className="divide-y divide-[var(--card-border)]">
                  {fields.map((f) => {
                    const currentVal = Number(form[f.key as keyof typeof form]) ?? 0;
                    return (
                      <div key={f.key} className="py-3 space-y-2">
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0 flex-1">
                            <Label className="text-xs font-bold uppercase Oswald tracking-wider text-[var(--text)] block">{f.label}</Label>
                            <span className="text-[11px] text-[var(--text-muted)] leading-snug block mt-0.5">{f.desc}</span>
                          </div>
                          <span className="text-xs font-black Oswald px-2 py-0.5 rounded-md text-[var(--accent-neon)] shrink-0">
                            Nota: {currentVal}
                          </span>
                        </div>

                        <div className="grid grid-cols-6 gap-1.5">
                          {[0, 1, 2, 3, 4, 5].map((val) => {
                            const isSelected = currentVal === val;
                            return (
                              <button
                                key={val}
                                type="button"
                                onClick={() => setForm(prev => ({ ...prev, [f.key]: val }))}
                                className={cn(
                                  "h-9 rounded-md font-black text-xs Oswald transition-all flex items-center justify-center border",
                                  isSelected
                                    ? "bg-[var(--accent-neon)] text-white border-[var(--accent-neon)] shadow-[0_0_10px_rgba(255,0,153,0.35)]"
                                    : "bg-transparent border-[var(--card-border)] text-[var(--text-muted)] hover:text-[var(--text)] hover:border-[var(--accent-neon)]/50 active:scale-95"
                                )}
                              >
                                {val}
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Referência Administrativa ocultada da interface do jogador. Dados seguem preservados no servidor. */}
            </form>
          )}
        </div>

        <div className="p-4 pb-[calc(1rem+env(safe-area-inset-bottom,0px))] border-t border-[var(--card-border)] bg-[var(--card-bg)] shrink-0 sticky bottom-0">
          <Button form="rating-form" type="submit" className="w-full h-11 text-xs font-black Oswald uppercase tracking-wider bg-[var(--accent-neon)] hover:bg-[var(--accent-neon)]/90 text-white shadow-lg shadow-[var(--accent-neon)]/30" disabled={isSaving || isLoading}>
            {isSaving ? "Salvando..." : "Salvar Autoavaliação"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function FinanceDialog({ open, onOpenChange, groupId, eventData, selectedGroup }: any) {
  const getFullFn = useServerFn(get_current_event_full);
  const { data, isLoading, isError } = useQuery({
    queryKey: ["finance-full", open, groupId],
    queryFn: () => getFullFn({ data: { group_id: groupId } }),
    enabled: open && !!groupId,
    initialData: eventData,
  });

  const fundSummary = data?.fund_summary;
  const myStatus = data?.fund_statuses?.find((s: any) => s.player_id === data?.current_player_id);

  const groupName = selectedGroup?.name || "Turma";
  const eventDate = data?.event?.event_date 
    ? new Date(data.event.event_date + "T12:00:00").toLocaleDateString('pt-BR') 
    : "Data indefinida";

  const formatBRL = (v: any) => {
    const n = Number(v);
    if (!Number.isFinite(n)) return "R$ 0,00";
    return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(n);
  };

  const getStatusInfo = () => {
    if (!fundSummary || !fundSummary.fund_id) {
      return { label: "Sem cobrança", color: "text-brand-silver bg-brand-surface border-brand-border" };
    }
    if (!myStatus) {
      return { label: "Sem cobrança", color: "text-brand-silver bg-brand-surface border-brand-border" };
    }
    const s = myStatus.status;
    const paidVal = Number(myStatus.total_paid);
    if (s === 'exempt' || s === 'not_participating') {
      return { label: "Sem cobrança", color: "text-brand-silver bg-brand-surface border-brand-border" };
    }
    if ((s === 'in_full' || s === 'overpaid') && paidVal > 0) {
      return { label: "Pago", color: "text-emerald-400 bg-emerald-500/10 border-emerald-500/20" };
    }
    if (paidVal > 0 && s !== 'in_full' && s !== 'overpaid') {
      return { label: "Pendente (Parcial)", color: "text-amber-400 bg-amber-500/10 border-amber-500/20" };
    }
    return { label: "Pendente", color: "text-red-400 bg-red-500/10 border-red-500/20" };
  };

  const statusInfo = getStatusInfo();
  const hasFund = !!(fundSummary && fundSummary.fund_id);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent aria-describedby={undefined} className="fixed !inset-0 !top-0 !left-0 !transform-none !translate-x-0 !translate-y-0 !max-w-full z-[200] w-full h-[100dvh] p-0 border-0 bg-[var(--bg)] text-[var(--text)] flex flex-col [&>button]:hidden">
        <DialogHeader className="p-4 border-b border-[var(--card-border)] bg-[var(--card-bg)] flex flex-row items-center gap-3 sticky top-0 z-50">
          <Button variant="ghost" size="icon" className="h-11 w-11 -ml-2 text-[var(--text-muted)] hover:text-[var(--text)] hover:bg-[color-mix(in_srgb,var(--text)_8%,transparent)]" onClick={() => onOpenChange(false)} aria-label="Fechar">
            <X className="h-6 w-6" />
          </Button>
          <DialogTitle className="text-sm font-black Oswald uppercase tracking-[0.15em] text-[var(--text)]">Rateio & Financeiro</DialogTitle>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto no-scrollbar p-6">
          <div className="max-w-md mx-auto space-y-6 pb-8">
            <div className="text-center space-y-1 mb-6">
              <h2 className="text-lg font-black Oswald uppercase text-[var(--accent-neon)]">{groupName}</h2>
              <p className="text-xs text-[var(--text-muted)] uppercase font-bold tracking-widest">{eventDate}</p>
            </div>

            {isLoading ? (
               <div className="flex justify-center items-center h-32"><div className="w-8 h-8 border-4 border-brand-gold border-t-transparent rounded-full animate-spin"></div></div>
            ) : isError ? (
               <div className="p-8 rounded-2xl bg-brand-surface border border-red-500/30 text-center space-y-4">
                 <X className="w-10 h-10 text-red-400 mx-auto" />
                 <p className="font-black Oswald uppercase tracking-widest text-red-400">Falha na consulta</p>
                 <p className="text-xs text-brand-silver">Não foi possível carregar os dados financeiros.</p>
               </div>
            ) : !hasFund ? (
              <div className="p-12 text-center text-[var(--text-muted)]/50 border-2 border-dashed border-[var(--card-border)] rounded-3xl space-y-4">
                <DollarSign className="w-12 h-12 mx-auto opacity-20" />
                <p className="font-black Oswald uppercase tracking-widest text-[var(--text)]">Sem cobrança nesta rodada</p>
              </div>
            ) : (
              <>
                <div className="p-6 rounded-2xl bg-[var(--card-bg)] border border-[var(--card-border)] text-center space-y-4 shadow-lg">
                  <div className="w-16 h-16 bg-[var(--accent-neon)]/10 rounded-full flex items-center justify-center mx-auto">
                    <DollarSign className="w-8 h-8 text-[var(--accent-neon)]" />
                  </div>
                  <div className="space-y-1">
                    <h3 className="text-xl font-black Oswald uppercase text-[var(--text)]">Meu Status</h3>
                  </div>
                  <div className={cn("inline-block px-6 py-2.5 rounded-xl border font-black Oswald uppercase text-lg tracking-widest", statusInfo.color)}>
                    {statusInfo.label}
                  </div>
                </div>

                <div className="space-y-3">
                  <h4 className="text-xs font-black Oswald uppercase text-[var(--text-muted)] tracking-widest pl-2">Resumo da Rodada</h4>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="p-4 bg-[var(--card-bg)] rounded-xl border border-[var(--card-border)] text-center">
                      <p className="text-[10px] text-[var(--text-muted)] uppercase font-bold tracking-wider mb-1">Total do Rateio</p>
                      <p className="text-sm font-black text-[var(--text)] Oswald">{formatBRL(fundSummary.total_amount)}</p>
                    </div>
                    <div className="p-4 bg-[var(--card-bg)] rounded-xl border border-[var(--card-border)] text-center">
                      <p className="text-[10px] text-[var(--text-muted)] uppercase font-bold tracking-wider mb-1">Arrecadado</p>
                      <p className="text-sm font-black text-emerald-400 Oswald">{formatBRL(fundSummary.total_collected)}</p>
                    </div>
                  </div>
                </div>

                <div className="space-y-3">
                  <h4 className="text-xs font-black Oswald uppercase text-[var(--text-muted)] tracking-widest pl-2">Minha Contribuição</h4>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="p-4 bg-[var(--card-bg)] rounded-xl border border-[var(--card-border)] text-center">
                      <p className="text-[10px] text-[var(--text-muted)] uppercase font-bold tracking-wider mb-1">Valor Devido</p>
                      <p className="text-sm font-black text-[var(--text)] Oswald">{formatBRL(myStatus?.agreed_amount)}</p>
                    </div>
                    <div className="p-4 bg-[var(--card-bg)] rounded-xl border border-[var(--card-border)] text-center">
                      <p className="text-[10px] text-[var(--text-muted)] uppercase font-bold tracking-wider mb-1">Saldo Pendente</p>
                      <p className={cn("text-sm font-black Oswald", Number(myStatus?.outstanding) > 0 ? "text-red-400" : "text-emerald-400")}>
                        {formatBRL(myStatus?.outstanding)}
                      </p>
                    </div>
                  </div>
                </div>
              </>
            )}
          </div>
        </div>

        <div className="p-4 border-t border-[var(--card-border)] bg-[var(--card-bg)] sticky bottom-0">
          <Button onClick={() => onOpenChange(false)} variant="outline" className="w-full h-14 text-base font-black Oswald uppercase border-[var(--card-border)] text-[var(--text)]">
            Voltar
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
