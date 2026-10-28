import React, { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { X, AlertTriangle, ShieldCheck, Smartphone, Info } from "lucide-react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

import { 
  getMyPushPreferences, 
  updateMyPushPreferences, 
  savePushSubscription, 
  removePushSubscription,
  getVapidPublicKey
} from "@/lib/push.functions";

function urlB64ToUint8Array(base64String: string) {
  const padding = '='.repeat((4 - base64String.length % 4) % 4);
  const base64 = (base64String + padding).replace(/\-/g, '+').replace(/_/g, '/');
  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

function arrayBufferToBase64(buffer: ArrayBuffer) {
  let binary = '';
  const bytes = new Uint8Array(buffer);
  const len = bytes.byteLength;
  for (let i = 0; i < len; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return window.btoa(binary);
}

export function PushSettingsDialog({ open, onOpenChange, groups = [] }: any) {
  const qc = useQueryClient();
  const getPushPrefsFn = useServerFn(getMyPushPreferences);
  const updatePushPrefsFn = useServerFn(updateMyPushPreferences);
  const savePushSubscriptionFn = useServerFn(savePushSubscription);
  const removePushSubscriptionFn = useServerFn(removePushSubscription);
  const getVapidPublicKeyFn = useServerFn(getVapidPublicKey);

  const [isSupported, setIsSupported] = useState(false);
  const [permission, setPermission] = useState<NotificationPermission>('default');
  const [enrolled, setEnrolled] = useState(false);
  const [subEndpoint, setSubEndpoint] = useState<string | null>(null);
  const [isEnrolling, setIsEnrolling] = useState(false);

  useEffect(() => {
    const supported = 'serviceWorker' in navigator && 'PushManager' in window;
    setIsSupported(supported);
    if (supported) {
      setPermission(Notification.permission);
      navigator.serviceWorker.ready.then(reg => {
        reg.pushManager.getSubscription().then(sub => {
          if (sub) {
            setEnrolled(true);
            setSubEndpoint(sub.endpoint);
          } else {
            setEnrolled(false);
          }
        }).catch(err => {
            console.error("Erro ao verificar subscrição:", err);
        });
      });
    }
  }, [open]);

  const { data: prefsData, isLoading: isLoadingPrefs, isError: isErrorPrefs } = useQuery({
    queryKey: ['push-prefs'],
    queryFn: () => getPushPrefsFn(),
    enabled: open,
    staleTime: 0
  });

  const defaultPrefs = {
    notify_registration_open: true,
    notify_guest_release: true,
    notify_promoted: true,
    notify_event_changed: true,
    notify_access_approved: true,
    group_ids: groups.map((g: any) => g.id)
  };

  const [localPrefs, setLocalPrefs] = useState<any>(defaultPrefs);

  useEffect(() => {
    if (prefsData) {
      setLocalPrefs(prefsData.preferences || defaultPrefs);
    }
  }, [prefsData]);

  const savePrefsMutation = useMutation({
    mutationFn: (newPrefs: any) => updatePushPrefsFn({ data: newPrefs }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['push-prefs'] });
      toast.success("Preferências salvas com sucesso!");
      onOpenChange(false);
    },
    onError: () => toast.error("Erro ao salvar preferências. Tente novamente.")
  });

  const handleTogglePref = (key: string, checked: boolean) => {
    setLocalPrefs({ ...localPrefs, [key]: checked });
  };

  const handleToggleGroup = (groupId: string, checked: boolean) => {
    const currentGroups = localPrefs.group_ids || [];
    const newGroups = checked 
      ? [...currentGroups, groupId] 
      : currentGroups.filter((id: string) => id !== groupId);
    setLocalPrefs({ ...localPrefs, group_ids: newGroups });
  };

  const handleSave = () => {
    savePrefsMutation.mutate(localPrefs);
  };

  const handleEnroll = async () => {
    if (!isSupported) return;
    setIsEnrolling(true);
    try {
      const perm = await Notification.requestPermission();
      setPermission(perm);
      if (perm !== 'granted') {
        toast.error('Permissão negada. Ative nas configurações do navegador.');
        setIsEnrolling(false);
        return;
      }

      const reg = await navigator.serviceWorker.ready;
      const { publicKey: vapidKey } = await getVapidPublicKeyFn();
      if (!vapidKey) throw new Error("O servidor ainda não forneceu a chave pública para notificações.");
      
      let sub = await reg.pushManager.getSubscription();
      if (sub) await sub.unsubscribe();

      sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlB64ToUint8Array(vapidKey)
      });

      await savePushSubscriptionFn({
        data: {
          endpoint: sub.endpoint,
          p256dh: sub.getKey('p256dh') ? arrayBufferToBase64(sub.getKey('p256dh') as ArrayBuffer) : '',
          auth: sub.getKey('auth') ? arrayBufferToBase64(sub.getKey('auth') as ArrayBuffer) : '',
          user_agent: navigator.userAgent
        }
      });

      setEnrolled(true);
      setSubEndpoint(sub.endpoint);
      toast.success('Dispositivo ativado para receber avisos!');
    } catch (err: any) {
      console.error(err);
      toast.error('Erro ao ativar notificações: ' + err.message);
    } finally {
      setIsEnrolling(false);
    }
  };

  const handleUnenroll = async () => {
    if (!isSupported) return;
    setIsEnrolling(true);
    try {
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.getSubscription();
      if (sub) {
        await sub.unsubscribe();
        if (subEndpoint || sub.endpoint) {
           await removePushSubscriptionFn({ data: { endpoint: subEndpoint || sub.endpoint } });
        }
      }
      setEnrolled(false);
      setSubEndpoint(null);
      toast.success('Notificações desativadas neste aparelho.');
    } catch (err: any) {
      console.error(err);
      toast.error('Erro ao desativar: ' + err.message);
    } finally {
      setIsEnrolling(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent aria-describedby={undefined} className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-[200] w-[calc(100vw-32px)] max-w-lg max-h-[calc(100dvh-32px)] p-0 border border-[var(--card-border)] bg-[var(--bg)] rounded-2xl flex flex-col shadow-2xl overflow-hidden [&>button]:hidden transition-colors">
        <DialogHeader className="p-4 sm:p-5 border-b border-[var(--card-border)] bg-[color-mix(in_srgb,var(--card-bg)_90%,transparent)] backdrop-blur-md flex flex-row items-center justify-between sticky top-0 z-50 shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="w-2.5 h-2.5 rounded-full bg-[var(--accent-neon)] shadow-[0_0_10px_var(--accent-neon)] shrink-0" />
            <div>
              <DialogTitle className="text-sm sm:text-base font-black Oswald uppercase tracking-[0.12em] text-[var(--text)] leading-none">
                Configurar Notificações
              </DialogTitle>
              <DialogDescription className="text-[11px] text-[var(--text-muted)] font-medium leading-none mt-1">
                Avisos em tempo real da pelada
              </DialogDescription>
            </div>
          </div>
          <Button 
            variant="ghost" 
            size="icon" 
            className="h-9 w-9 rounded-lg text-[var(--text-muted)] hover:text-[var(--text)] hover:bg-[color-mix(in_srgb,var(--text)_8%,transparent)] transition-colors shrink-0" 
            onClick={() => onOpenChange(false)} 
            aria-label="Fechar"
          >
            <X className="h-5 w-5" />
          </Button>
        </DialogHeader>

        <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain p-4 sm:p-5 space-y-5 custom-scrollbar">
          {/* Seção 1: Neste Dispositivo */}
          <div className="space-y-2.5">
            <div className="flex items-center gap-2 text-xs font-black Oswald uppercase tracking-wider text-[var(--accent-neon)]">
              <Smartphone className="w-3.5 h-3.5" />
              <span>Neste Dispositivo</span>
            </div>
            
            {!isSupported ? (
              <div className="p-4 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 dark:text-red-300 text-xs sm:text-sm flex gap-3 items-start">
                <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5 text-red-400" />
                <p>Seu navegador não suporta notificações push.</p>
              </div>
            ) : (
              <div className="p-4 rounded-xl bg-[var(--card-bg)] border border-[var(--card-border)] space-y-3 shadow-sm">
                <div className="flex items-center justify-between gap-3">
                  <div className="space-y-0.5 flex-1 pr-2">
                    <p className="text-xs sm:text-sm font-bold text-[var(--text)] leading-tight">Receber avisos neste aparelho</p>
                    <p className="text-[11px] sm:text-xs text-[var(--text-muted)] leading-snug">
                      {permission === 'denied' 
                        ? "Bloqueado nas configurações do navegador."
                        : enrolled 
                          ? "Ativado para receber alertas push instantâneos."
                          : "Toque para ativar as notificações push neste aparelho."}
                    </p>
                  </div>
                  <Switch 
                    checked={enrolled}
                    disabled={isEnrolling || permission === 'denied'}
                    onCheckedChange={(c) => c ? handleEnroll() : handleUnenroll()}
                    className="data-[state=checked]:!bg-[var(--accent-neon)] data-[state=unchecked]:bg-[color-mix(in_srgb,var(--card-bg)_70%,var(--text)_30%)] border-[var(--card-border)] shrink-0 transition-colors"
                  />
                </div>
                
                {permission === 'denied' && (
                  <div className="p-3 rounded-lg bg-amber-500/10 border border-amber-500/20 text-amber-600 dark:text-amber-300 text-xs flex gap-2 items-start mt-2">
                    <Info className="w-4 h-4 shrink-0 mt-0.5 text-amber-400" />
                    <p>Permissão negada. Desbloqueie as notificações nas configurações do navegador/sistema e recarregue.</p>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Seção 2: Tipos de Aviso */}
          <div className={cn("space-y-2.5 transition-opacity", isLoadingPrefs ? "opacity-50 pointer-events-none" : "")}>
            <div className="flex items-center gap-2 text-xs font-black Oswald uppercase tracking-wider text-[var(--accent-neon)]">
              <ShieldCheck className="w-3.5 h-3.5" />
              <span>Tipos de Aviso</span>
            </div>
            
            {isErrorPrefs && (
              <div className="p-3 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 dark:text-red-300 text-xs flex gap-2 items-start">
                <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5 text-red-400" />
                <p>Erro ao carregar preferências. Exibindo configuração padrão.</p>
              </div>
            )}

            <div className="p-4 rounded-xl bg-[var(--card-bg)] border border-[var(--card-border)] divide-y divide-[color-mix(in_srgb,var(--card-border)_50%,transparent)] space-y-0">
              <PrefToggle 
                label="Abertura de Inscrição"
                desc="Aviso 1 minuto antes da liberação da sua inscrição."
                checked={localPrefs?.notify_registration_open ?? true}
                onChange={(c) => handleTogglePref('notify_registration_open', c)}
              />
              <PrefToggle 
                label="Liberação de Convidados"
                desc="Quando convidados forem permitidos na rodada."
                checked={localPrefs?.notify_guest_release ?? true}
                onChange={(c) => handleTogglePref('notify_guest_release', c)}
              />
              <PrefToggle 
                label="Promoção de Fila"
                desc="Aviso imediato quando você subir da reserva para titular."
                checked={localPrefs?.notify_promoted ?? true}
                onChange={(c) => handleTogglePref('notify_promoted', c)}
              />
              <PrefToggle 
                label="Mudança na Rodada"
                desc="Alterações de horário, local ou eventuais cancelamentos."
                checked={localPrefs?.notify_event_changed ?? true}
                onChange={(c) => handleTogglePref('notify_event_changed', c)}
              />
              <PrefToggle 
                label="Aprovação de Turma"
                desc="Quando o organizador aceitar sua entrada na turma."
                checked={localPrefs?.notify_access_approved ?? true}
                onChange={(c) => handleTogglePref('notify_access_approved', c)}
              />
            </div>
          </div>

          {/* Seção 3: Turmas Acompanhadas */}
          {groups && groups.length > 0 && (
            <div className="space-y-2.5 pb-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 text-xs font-black Oswald uppercase tracking-wider text-[var(--accent-neon)]">
                  <Smartphone className="w-3.5 h-3.5" />
                  <span>Turmas Acompanhadas</span>
                </div>
              </div>
              <p className="text-[11px] text-[var(--text-muted)] font-medium px-0.5">
                Selecione quais turmas enviarão avisos de abertura para você:
              </p>
              
              <div className="p-4 rounded-xl bg-[var(--card-bg)] border border-[var(--card-border)] divide-y divide-[color-mix(in_srgb,var(--card-border)_50%,transparent)] space-y-0">
                {groups.map((g: any) => (
                  <div key={g.id} className="flex items-center justify-between py-3 first:pt-0 last:pb-0 gap-3">
                    <Label className="text-xs sm:text-sm font-semibold text-[var(--text)] cursor-pointer select-none leading-tight" htmlFor={`g-${g.id}`}>
                      {g.name}
                    </Label>
                    <Switch 
                      id={`g-${g.id}`}
                      checked={(localPrefs?.group_ids || []).includes(g.id)}
                      onCheckedChange={(c) => handleToggleGroup(g.id, c)}
                      className="data-[state=checked]:!bg-[var(--accent-neon)] data-[state=unchecked]:bg-[color-mix(in_srgb,var(--card-bg)_70%,var(--text)_30%)] border-[var(--card-border)] shrink-0 transition-colors"
                    />
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Ações Cancelar / Salvar acessíveis */}
        <div className="p-3 sm:p-4 border-t border-[var(--card-border)] bg-[var(--card-bg)] sticky bottom-0 z-50 flex items-center gap-2.5 shrink-0 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
          <Button 
            onClick={() => onOpenChange(false)} 
            variant="outline" 
            className="flex-1 h-11 sm:h-12 text-xs sm:text-sm font-black Oswald uppercase tracking-wider border-[var(--card-border)] bg-transparent text-[var(--text-muted)] hover:bg-[color-mix(in_srgb,var(--text)_8%,transparent)] hover:text-[var(--text)] transition-all"
          >
            Cancelar
          </Button>
          <Button 
            onClick={handleSave} 
            disabled={savePrefsMutation.isPending || isLoadingPrefs}
            className="flex-1 h-11 sm:h-12 text-xs sm:text-sm font-black Oswald uppercase tracking-wider bg-[var(--accent-neon)] hover:bg-[var(--accent-neon)]/90 text-white shadow-lg shadow-[var(--accent-neon)]/25 transition-all active:scale-[0.99]"
          >
            {savePrefsMutation.isPending ? "Salvando..." : "Salvar Preferências"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function PrefToggle({ label, desc, checked, onChange }: { label: string; desc: string; checked: boolean; onChange: (c: boolean) => void }) {
  return (
    <div className="flex items-center justify-between py-3 first:pt-0 last:pb-0 gap-3">
      <div className="space-y-0.5 flex-1 pr-2">
        <Label className="text-xs sm:text-sm font-bold text-[var(--text)] leading-tight cursor-pointer block">{label}</Label>
        <p className="text-[11px] text-[var(--text-muted)] leading-snug">{desc}</p>
      </div>
      <Switch 
        checked={checked}
        onCheckedChange={onChange}
        className="data-[state=checked]:!bg-[var(--accent-neon)] data-[state=unchecked]:bg-[color-mix(in_srgb,var(--card-bg)_70%,var(--text)_30%)] border-[var(--card-border)] shrink-0 transition-colors"
      />
    </div>
  );
}
