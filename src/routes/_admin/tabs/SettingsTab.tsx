import { useQuery, useQueryClient, useIsFetching } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState, useEffect } from "react";
import { toast } from "sonner";
import { ShieldAlert, DollarSign, Clock, Users, Calendar, Save, AlertCircle, Info, ChevronRight } from "lucide-react";
import { useAdminGroup } from "@/lib/admin-group-context";
import { get_admin_event, admin_update_settings, admin_update_automation } from "@/lib/admin.functions";
import { admin_list_active_blocks } from "@/lib/incidents.functions";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { useUnsavedSection } from "@/components/admin-config-section";
import { friendlyError } from "@/lib/error-messages";
import { cn } from "@/lib/utils";

const DAYS = [
  { value: 0, label: "Domingo" },
  { value: 1, label: "Segunda-feira" },
  { value: 2, label: "Terça-feira" },
  { value: 3, label: "Quarta-feira" },
  { value: 4, label: "Quinta-feira" },
  { value: 5, label: "Sexta-feira" },
  { value: 6, label: "Sábado" },
];

export function SettingsTab() {
  const { groupId } = useAdminGroup();
  const getEvent = useServerFn(get_admin_event);
  const updateSettings = useServerFn(admin_update_settings);
  const queryClient = useQueryClient();
  
  const isFetchingGlobal = useIsFetching();
  
  const getActiveBlocks = useServerFn(admin_list_active_blocks);
  const { data: blocksRes } = useQuery({
    queryKey: ["admin-active-blocks", groupId],
    queryFn: () => getActiveBlocks({ data: { group_id: groupId! } }),
    enabled: !!groupId,
  });
  const activeBlocks = blocksRes?.blocks || [];
  const [blockModalOpen, setBlockModalOpen] = useState(false);
  const [showDetails, setShowDetails] = useState<string | null>(null);

  const { data: res, refetch, isLoading: isLoadingConfig, error } = useQuery({
    queryKey: ["admin-settings-full", groupId],
    queryFn: () => getEvent({ data: { group_id: groupId } }),
    enabled: !!groupId,
    staleTime: 0,
    gcTime: 0,
    retry: 2
  });

  const [loadingTimeout, setLoadingTimeout] = useState(false);
  useEffect(() => {
    let timer: any;
    if (isLoadingConfig) {
      timer = setTimeout(() => {
        setLoadingTimeout(true);
      }, 10000);
    } else {
      setLoadingTimeout(false);
    }
    return () => clearTimeout(timer);
  }, [isLoadingConfig]);


  const [formData, setFormData] = useState<any>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [hasChanges, setHasChanges] = useState(false);
  const [editingGroupId, setEditingGroupId] = useState<string | null>(null);
  const [editingGroupName, setEditingGroupName] = useState<string>("Turma");

  useUnsavedSection("Regras da turma", hasChanges);

  useEffect(() => {
    if (res?.settings) {
      console.log("[GROUP SETTINGS ADMIN] groupId:", groupId);
      console.log("[GROUP SETTINGS ADMIN] settings:", res.settings);
      setFormData({ 
        ...res.settings,
        max_players: res.settings.main_limit // Garantir consistência inicial
      });
      setEditingGroupId(groupId);
      setEditingGroupName((res.settings as any)?.group?.name || "Turma");
      setHasChanges(false);
    }

  }, [res, groupId]);

  const handleSave = async () => {
    if (!groupId || !formData) return;
    if (groupId !== editingGroupId) {
      toast.error(`A turma foi alterada. Operação em ${editingGroupName} cancelada.`);
      return;
    }
    setIsSaving(true);
    
    // Salvamento com validação cronológica restrita
    
    try {
      // Validação explícita dos campos numéricos antes de montar o payload
      const mainLimit = Number(formData.main_limit);
      const priorityMinutes = Number(formData.priority_minutes);
      
      if (!Number.isFinite(mainLimit)) {
        toast.error("Informe um número válido de titulares.");
        setIsSaving(false);
        return;
      }
      
      if (!Number.isFinite(priorityMinutes)) {
        toast.error("Informe um tempo de prioridade válido.");
        setIsSaving(false);
        return;
      }

      const openW = formData.open_weekday ?? 0;
      const eventW = formData.event_weekday ?? 0;
      const closeW = formData.close_weekday ?? eventW;
      const openTimeNum = formData.open_time ? parseInt(formData.open_time.replace(":", "")) : 0;
      const eventTimeNum = formData.start_time ? parseInt(formData.start_time.replace(":", "")) : 0;
      const closeTimeNum = formData.close_time ? parseInt(formData.close_time.replace(":", "")) : 2359;
      
      // Validação usando minutos lineares dentro de um ciclo de 14 dias para abranger semana cruzada
      const openMin = openW * 1440 + Math.floor(openTimeNum / 100) * 60 + (openTimeNum % 100);
      let eventMin = eventW * 1440 + Math.floor(eventTimeNum / 100) * 60 + (eventTimeNum % 100);
      let closeMin = closeW * 1440 + Math.floor(closeTimeNum / 100) * 60 + (closeTimeNum % 100);

      // Ajustar para fluxo sequencial linear
      if (eventMin < openMin) eventMin += 7 * 1440;
      if (closeMin < eventMin) closeMin += 7 * 1440;

      if (openMin >= eventMin || eventMin >= closeMin) {
         toast.error("A ordem cronológica deve ser: Abertura < Jogo < Encerramento.");
         setIsSaving(false);
         return;
      }

      // Conversão segura para max_waitlist
      let maxWaitlist: number | null = null;
      if (formData.max_waitlist !== "" && formData.max_waitlist !== null && formData.max_waitlist !== undefined) {
        const parsed = Number(formData.max_waitlist);
        if (!Number.isFinite(parsed)) {
          toast.error("Informe uma quantidade válida de reservas.");
          setIsSaving(false);
          return;
        }
        maxWaitlist = parsed;
      }

      const payload = {
        group_id: groupId,
        access_restriction_active: !!formData.access_restriction_active,
        open_weekday: formData.open_weekday,
        open_time: formData.open_time,
        priority_minutes: priorityMinutes,
        main_limit: mainLimit,
        max_players: mainLimit, // Sincronizado com main_limit
        max_waitlist: maxWaitlist,
        deadline_weekday: formData.withdrawal_deadline_weekday,
        deadline_time: formData.withdrawal_deadline_time,
        auto_promote: !!formData.auto_promote_reservations,
        auto_generate_incidents: !!formData.auto_generate_incidents,
        announcement: formData.announcement || null,
        convidados_habilitados: !!formData.convidados_habilitados,
        dia_liberacao_convidado: formData.dia_liberacao_convidado === "" || formData.dia_liberacao_convidado === null || formData.dia_liberacao_convidado === undefined ? null : Number(formData.dia_liberacao_convidado),
        hora_liberacao_convidado: formData.hora_liberacao_convidado || null,
        limite_convidados_por_usuario: Number(formData.limite_convidados_por_usuario ?? 1),
        auto_open: formData.auto_open === undefined ? true : Boolean(formData.auto_open),
        auto_close: formData.auto_close === undefined ? true : Boolean(formData.auto_close),
        close_weekday: Number(formData.close_weekday ?? formData.event_weekday ?? 0),
        close_time: String(formData.close_time || '23:59:59'),
      };

      console.log("[SAVE CLASS SETTINGS] Payload preparado:", JSON.stringify(payload, null, 2));

      const result = await updateSettings({ data: payload as any });
      console.log("[SAVE CLASS SETTINGS] Resultado completo:", result);

      if (typeof admin_update_automation === 'function') {
        await admin_update_automation({
          data: {
            group_id: groupId,
            auto_open: formData.auto_open === undefined ? true : Boolean(formData.auto_open),
            auto_close: formData.auto_close === undefined ? true : Boolean(formData.auto_close),
            close_weekday: Number(formData.close_weekday ?? formData.event_weekday ?? 0),
            close_time: String(formData.close_time || '23:59:59')
          }
        });
      }

      if (result && (result as any).error) {
        console.error("[SAVE CLASS SETTINGS] Erro servidor:", (result as any).error);
        toast.error(`Erro: ${(result as any).error.message || "Erro desconhecido no servidor"}`);
        return;
      }

      toast.success("Configurações salvas com sucesso!");
      await refetch();
      setHasChanges(false);
    } catch (e: any) {
      console.error("[SAVE CLASS SETTINGS] ERRO COMPLETO:", e);
      
      // Se o erro vier do TanStack Start / Server Function, ele pode estar encapsulado
      if (e instanceof Error) {
        console.error({
          message: e.message,
          stack: e.stack,
          name: e.name
        });
      }

      toast.error(friendlyError(e));
    } finally {
      setIsSaving(false);
    }
  };


  const updateField = (field: string, value: any) => {
    setFormData((prev: any) => ({ ...prev, [field]: value }));
    setHasChanges(true);
  };

  if (isLoadingConfig && !loadingTimeout) {
    return (
      <div className="flex flex-col items-center justify-center py-20 animate-pulse">
        <Clock className="w-8 h-8 text-pink-600 dark:text-brand-gold mb-4 animate-spin" />
        <div className="text-slate-500 dark:text-brand-silver Oswald uppercase text-xs italic tracking-widest">Carregando configurações...</div>
      </div>
    );
  }

  if (error || !formData || loadingTimeout) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center">
        <AlertCircle className="w-10 h-10 text-red-500 dark:text-red-400 mb-4" />
        <h4 className="text-slate-900 dark:text-brand-white Oswald uppercase text-sm mb-2">
          {loadingTimeout ? "Tempo limite excedido" : "Erro ao carregar configurações"}
        </h4>
        <p className="text-slate-500 dark:text-brand-silver text-[10px] mb-6">
          {loadingTimeout ? "A conexão demorou muito para responder." : friendlyError(error)}
        </p>
        <Button onClick={() => { setLoadingTimeout(false); refetch(); }} className="bg-slate-900 dark:bg-brand-gold text-white dark:text-brand-blue font-bold h-9 Oswald uppercase">Tentar Novamente</Button>
      </div>
    );
  }


  return (
    <div className="space-y-6 pb-20 max-w-3xl mx-auto">
      <div className="sticky top-[116px] md:top-[124px] z-30 bg-slate-50 dark:bg-[#020B1B] py-4 border-b border-slate-200 dark:border-brand-border/30 -mx-4 px-4 sm:mx-0 sm:px-0">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div>
            <h3 className="text-base font-semibold text-slate-900 dark:text-brand-white flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-pink-600 dark:bg-brand-gold animate-pulse" />
              Turma: {editingGroupName}
            </h3>
            <p className="text-sm text-slate-600 dark:text-brand-silver/80 mt-1">
              Mudanças afetam apenas esta turma, aplicando-se imediatamente.
            </p>
          </div>
          <Button 
            size="sm" 
            onClick={handleSave} 
            disabled={isSaving || !hasChanges}
            className={cn(
              "h-10 text-sm px-6 transition-all rounded-lg shadow-lg shrink-0 w-full sm:w-auto",
              hasChanges 
                ? "bg-brand-gold text-brand-blue font-bold hover:scale-105 active:scale-95" 
                : "bg-slate-200 dark:bg-brand-surface border border-slate-300 dark:border-brand-border text-slate-500 dark:text-brand-silver/50 opacity-70 cursor-not-allowed"
            )}
          >
            {isSaving ? "Salvando..." : (
              <div className="flex items-center gap-2">
                <Save className="w-4 h-4" />
                <span>{hasChanges ? "Salvar alterações" : "Salvo"}</span>
              </div>
            )}
          </Button>
        </div>
      </div>

      <div className="space-y-8 pt-2">
        <section className="space-y-4">
          <h2 className="text-lg font-semibold text-slate-900 dark:text-brand-white border-b border-slate-200 dark:border-brand-border/50 pb-2">Acesso e abertura</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label className="text-sm font-medium text-slate-700 dark:text-brand-white">Restrição de acesso</Label>
                <Switch 
                  checked={!!formData.access_restriction_active}
                  onCheckedChange={(val) => updateField("access_restriction_active", val)}
                  className="data-[state=checked]:bg-brand-gold"
                />
              </div>
              <p className="text-sm text-slate-500 dark:text-brand-silver/70">
                Apenas jogadores aprovados pela organização podem acessar e participar.
              </p>
            </div>
            
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2 col-span-2 flex items-center justify-between border-b border-slate-200 dark:border-brand-border/30 pb-2">
                <Label className="text-sm font-medium text-slate-700 dark:text-brand-white">Abertura Automática</Label>
                <Switch 
                  checked={formData.auto_open ?? true}
                  onCheckedChange={(val) => updateField("auto_open", val)}
                  className="data-[state=checked]:bg-brand-gold"
                />
              </div>
              <div className="space-y-2">
                <Label className="text-sm font-medium text-slate-700 dark:text-brand-white">Dia de abertura</Label>
                <Select 
                  value={formData.open_weekday?.toString()} 
                  onValueChange={(val) => updateField("open_weekday", parseInt(val))}
                >
                  <SelectTrigger className="h-10 bg-white dark:bg-brand-surface border-slate-300 dark:border-brand-border text-sm">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="bg-white dark:bg-brand-surface border-slate-200 dark:border-brand-border">
                    {DAYS.map(d => <SelectItem key={d.value} value={d.value.toString()}>{d.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label className="text-sm font-medium text-slate-700 dark:text-brand-white">Horário</Label>
                <Input 
                  type="time"
                  value={formData.open_time?.substring(0, 5) ?? ""}
                  onChange={(e) => updateField("open_time", e.target.value)}
                  className="h-10 bg-white dark:bg-brand-surface border-slate-300 dark:border-brand-border text-sm"
                />
              </div>
              <div className="space-y-2 col-span-2 flex items-center justify-between border-b border-slate-200 dark:border-brand-border/30 pb-2 mt-2">
                <Label className="text-sm font-medium text-slate-700 dark:text-brand-white">Encerramento Automático</Label>
                <Switch 
                  checked={formData.auto_close ?? true}
                  onCheckedChange={(val) => updateField("auto_close", val)}
                  className="data-[state=checked]:bg-brand-gold"
                />
              </div>
              <div className="space-y-2">
                <Label className="text-sm font-medium text-slate-700 dark:text-brand-white">Dia de encerramento</Label>
                <Select 
                  value={formData.close_weekday?.toString() ?? formData.event_weekday?.toString()} 
                  onValueChange={(val) => updateField("close_weekday", parseInt(val))}
                >
                  <SelectTrigger className="h-10 bg-white dark:bg-brand-surface border-slate-300 dark:border-brand-border text-sm">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="bg-white dark:bg-brand-surface border-slate-200 dark:border-brand-border">
                    {DAYS.map(d => <SelectItem key={d.value} value={d.value.toString()}>{d.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label className="text-sm font-medium text-slate-700 dark:text-brand-white">Horário</Label>
                <Input 
                  type="time"
                  value={formData.close_time?.substring(0, 5) ?? "23:59"}
                  onChange={(e) => updateField("close_time", e.target.value)}
                  className="h-10 bg-white dark:bg-brand-surface border-slate-300 dark:border-brand-border text-sm"
                />
              </div>
            </div>
          </div>

          <div className="mt-4 p-4 bg-slate-100 dark:bg-brand-surface/50 rounded-xl border border-slate-200 dark:border-brand-border">
            <h4 className="text-xs font-bold text-brand-gold uppercase tracking-widest mb-2">Prévia da Automação</h4>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-[11px] font-mono text-slate-600 dark:text-brand-silver">
              <div>
                <strong className="block text-slate-900 dark:text-brand-white Oswald uppercase tracking-wider">Abre em:</strong>
                {formData.auto_open === false ? "Manual" : `${DAYS.find(d => d.value === (formData.open_weekday ?? 0))?.label} às ${formData.open_time?.substring(0, 5) || "00:00"}`}
              </div>
              <div>
                <strong className="block text-slate-900 dark:text-brand-white Oswald uppercase tracking-wider">Jogo:</strong>
                {DAYS.find(d => d.value === (formData.event_weekday ?? 0))?.label} às {formData.start_time?.substring(0, 5) || "00:00"}
              </div>
              <div>
                <strong className="block text-slate-900 dark:text-brand-white Oswald uppercase tracking-wider">Encerra e arquiva:</strong>
                {formData.auto_close === false ? "Manual" : `${DAYS.find(d => d.value === (formData.close_weekday ?? formData.event_weekday ?? 0))?.label} às ${formData.close_time?.substring(0, 5) || "23:59"}`}
              </div>
            </div>
          </div>
        </section>

        <section className="space-y-4">
          <h2 className="text-lg font-semibold text-slate-900 dark:text-brand-white border-b border-slate-200 dark:border-brand-border/50 pb-2">Vagas e prioridade</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-2">
              <Label className="text-sm font-medium text-slate-700 dark:text-brand-white">Vagas titulares</Label>
              <div className="relative">
                <Input 
                  type="number"
                  value={formData.main_limit ?? ""}
                  onChange={(e) => updateField("main_limit", e.target.value)}
                  className="h-10 bg-white dark:bg-brand-surface border-slate-300 dark:border-brand-border text-sm pr-10"
                />
                <Users className="absolute right-3 top-2.5 w-5 h-5 text-slate-400" />
              </div>
            </div>
            
            <div className="space-y-2">
              <Label className="text-sm font-medium text-slate-700 dark:text-brand-white">Vagas reservas (máximo)</Label>
              <div className="relative">
                <Input 
                  type="number"
                  value={formData.max_waitlist === null || formData.max_waitlist === undefined ? "" : formData.max_waitlist}
                  onChange={(e) => updateField("max_waitlist", e.target.value)}
                  placeholder="Sem limite (vazio)"
                  className="h-10 bg-white dark:bg-brand-surface border-slate-300 dark:border-brand-border text-sm pr-10"
                />
                <Users className="absolute right-3 top-2.5 w-5 h-5 text-slate-400 opacity-50" />
              </div>
            </div>

            <div className="space-y-2 md:col-span-2">
              <Label className="text-sm font-medium text-slate-700 dark:text-brand-white">Janela de prioridade (minutos)</Label>
              <Input 
                type="number"
                value={formData.priority_minutes ?? ""}
                onChange={(e) => updateField("priority_minutes", e.target.value)}
                className="h-10 bg-white dark:bg-brand-surface border-slate-300 dark:border-brand-border text-sm w-full md:w-1/2"
              />
              <p className="text-sm text-slate-500 dark:text-brand-silver/70">
                A prioridade é <strong>global</strong> por jogador; a janela é configurada por turma. 
                Durante a janela, podem entrar apenas jogadores com prioridade global e organizadores.
                {formData.priority_minutes > 0 && (
                  <span className="ml-1 text-slate-700 dark:text-brand-gold font-medium">
                    ({Math.floor(formData.priority_minutes / 60)}h{String(formData.priority_minutes % 60).padStart(2, '0')}min)
                  </span>
                )}
              </p>
            </div>
          </div>
        </section>

        <section className="space-y-4">
          <h2 className="text-lg font-semibold text-slate-900 dark:text-brand-white border-b border-slate-200 dark:border-brand-border/50 pb-2">Convidados</h2>
          <div className="space-y-4">
            <div className="flex items-center justify-between max-w-md">
              <Label className="text-sm font-medium text-slate-700 dark:text-brand-white">Permitir convidados</Label>
              <Switch 
                checked={!!formData.convidados_habilitados}
                onCheckedChange={(val) => updateField("convidados_habilitados", val)}
                className="data-[state=checked]:bg-brand-gold"
              />
            </div>
            
            {!formData.convidados_habilitados ? (
              <p className="text-sm text-slate-500 dark:text-brand-silver/50 italic">Convidados desativados.</p>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pt-2">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label className="text-sm font-medium text-slate-700 dark:text-brand-white">Dia de liberação</Label>
                    <Select 
                      value={formData.dia_liberacao_convidado === null || formData.dia_liberacao_convidado === undefined ? "" : formData.dia_liberacao_convidado.toString()} 
                      onValueChange={(val) => updateField("dia_liberacao_convidado", parseInt(val))}
                    >
                      <SelectTrigger className="h-10 bg-white dark:bg-brand-surface border-slate-300 dark:border-brand-border text-sm">
                        <SelectValue placeholder="Selecione" />
                      </SelectTrigger>
                      <SelectContent className="bg-white dark:bg-brand-surface border-slate-200 dark:border-brand-border">
                        {DAYS.map(d => <SelectItem key={d.value} value={d.value.toString()}>{d.label}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label className="text-sm font-medium text-slate-700 dark:text-brand-white">Horário</Label>
                    <Input 
                      type="time"
                      value={formData.hora_liberacao_convidado?.substring(0, 5) ?? ""}
                      onChange={(e) => updateField("hora_liberacao_convidado", e.target.value)}
                      className="h-10 bg-white dark:bg-brand-surface border-slate-300 dark:border-brand-border text-sm"
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label className="text-sm font-medium text-slate-700 dark:text-brand-white">Limite por jogador</Label>
                  <Input 
                    type="number"
                    min={0}
                    max={10}
                    value={formData.limite_convidados_por_usuario ?? 1}
                    onChange={(e) => updateField("limite_convidados_por_usuario", e.target.value)}
                    className="h-10 bg-white dark:bg-brand-surface border-slate-300 dark:border-brand-border text-sm"
                  />
                  <p className="text-sm text-slate-500 dark:text-brand-silver/70 mt-1">
                    Jogadores cadastrados poderão incluir convidados a partir do dia e hora definidos.
                  </p>
                </div>
              </div>
            )}
          </div>
        </section>

        <section className="space-y-4">
          <div className="flex items-center justify-between border-b border-slate-200 dark:border-brand-border/50 pb-2">
            <h2 className="text-lg font-semibold text-slate-900 dark:text-brand-white">Retiradas e penalidades</h2>
            <Button 
              variant="outline" 
              size="sm"
              onClick={() => setBlockModalOpen(true)}
              className="text-sm border-slate-300 dark:border-brand-border hover:bg-slate-100 dark:hover:bg-brand-surface/40 flex items-center gap-2"
            >
              <ShieldAlert className="w-4 h-4 text-red-500" />
              Gestão de bloqueios
              {activeBlocks.length > 0 && (
                <Badge className="ml-1 bg-red-100 text-red-700 dark:bg-red-500/20 dark:text-red-400 border-0">{activeBlocks.length}</Badge>
              )}
            </Button>
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label className="text-sm font-medium text-slate-700 dark:text-brand-white">Dia limite para saída</Label>
                <Select 
                  value={formData.withdrawal_deadline_weekday?.toString()} 
                  onValueChange={(val) => updateField("withdrawal_deadline_weekday", parseInt(val))}
                >
                  <SelectTrigger className="h-10 bg-white dark:bg-brand-surface border-slate-300 dark:border-brand-border text-sm">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="bg-white dark:bg-brand-surface border-slate-200 dark:border-brand-border">
                    {DAYS.map(d => <SelectItem key={d.value} value={d.value.toString()}>{d.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label className="text-sm font-medium text-slate-700 dark:text-brand-white">Horário limite</Label>
                <Input 
                  type="time"
                  value={formData.withdrawal_deadline_time?.substring(0, 5) ?? ""}
                  onChange={(e) => updateField("withdrawal_deadline_time", e.target.value)}
                  className="h-10 bg-white dark:bg-brand-surface border-slate-300 dark:border-brand-border text-sm"
                />
              </div>
            </div>
            
            <div className="space-y-2">
              <div className="p-4 bg-red-50 dark:bg-red-500/5 border border-red-100 dark:border-red-500/10 rounded-lg flex items-start gap-3">
                <AlertCircle className="w-5 h-5 text-red-500 shrink-0 mt-0.5" />
                <p className="text-sm text-red-700 dark:text-red-400">
                  Jogadores que saírem da lista após este prazo recebem infração automática por <strong>"Saída tardia"</strong>. 
                  A punição padrão (bloqueio na próxima rodada) será sugerida na central de ocorrências.
                </p>
              </div>
            </div>
          </div>
        </section>

        <section className="space-y-4">
          <h2 className="text-lg font-semibold text-slate-900 dark:text-brand-white border-b border-slate-200 dark:border-brand-border/50 pb-2">Comunicação</h2>
          <div className="space-y-2">
            <Label className="text-sm font-medium text-slate-700 dark:text-brand-white">Aviso da turma (topo do app)</Label>
            <div className="relative">
              <Input 
                value={formData.announcement ?? ""}
                onChange={(e) => updateField("announcement", e.target.value)}
                placeholder="Ex: Trazer uniforme azul e branco..."
                className="h-10 pl-10 bg-white dark:bg-brand-surface border-slate-300 dark:border-brand-border text-sm"
              />
              <Info className="absolute left-3 top-2.5 w-5 h-5 text-slate-400" />
            </div>
            <p className="text-sm text-slate-500 dark:text-brand-silver/70 mt-1">
              Texto exibido no topo do aplicativo para todos os jogadores inscritos. Ideal para lembretes curtos de uniforme ou quadra.
            </p>
          </div>
        </section>
      </div>

      <Dialog open={blockModalOpen} onOpenChange={setBlockModalOpen}>
        <DialogContent className="max-w-md bg-white dark:bg-brand-surface border-slate-200 dark:border-brand-border/50 p-6">
          <DialogHeader className="text-left space-y-1.5 border-b border-slate-200 dark:border-brand-border/30 pb-4">
            <DialogTitle className="text-xl font-black text-slate-900 dark:text-brand-white Oswald uppercase flex items-center gap-2">
              <ShieldAlert className="w-5 h-5 text-[#f43f5e]" /> GESTÃO DE BLOQUEIOS
            </DialogTitle>
            <DialogDescription className="text-slate-500 dark:text-brand-silver text-[11px] uppercase font-bold tracking-widest">
              TURMA: <span className="text-slate-900 dark:text-brand-white">{editingGroupName}</span>
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 mt-4 max-h-[60vh] overflow-y-auto pr-1">
            {activeBlocks.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-10 border border-dashed border-slate-200 dark:border-brand-border/30 rounded-xl bg-slate-50 dark:bg-white/5">
                <ShieldAlert className="w-8 h-8 text-slate-300 dark:text-brand-silver/20 mb-3" />
                <p className="text-center text-slate-500 dark:text-brand-silver/50 text-[10px] font-bold tracking-widest Oswald uppercase">Nenhum bloqueio ativo nesta turma.</p>
              </div>
            ) : activeBlocks.map((b: any) => (
              <div key={b.incident_id} className="p-4 bg-white dark:bg-[#020B1B]/60 border border-red-200 dark:border-[#f43f5e]/30 rounded-xl space-y-3 relative shadow-sm dark:shadow-md">
                <div className="flex justify-between items-start">
                  <div>
                    <p className="text-sm font-black text-slate-900 dark:text-brand-white uppercase Oswald">{b.player_name}</p>
                    <p className="text-[9px] text-slate-500 dark:text-brand-silver/60 font-bold uppercase tracking-wider mt-0.5">
                      MOTIVO: <span className="text-slate-700 dark:text-brand-silver">{b.incident_type === 'no_show' ? 'Falta sem aviso' : b.incident_type === 'late_leave' ? 'Saída tardia' : b.incident_type}</span>
                    </p>
                  </div>
                  <Badge className="bg-red-50 dark:bg-[#f43f5e]/10 text-red-600 dark:text-[#f43f5e] border-red-200 dark:border-[#f43f5e]/20 text-[8px] uppercase font-black px-2 h-5 tracking-widest">BLOQUEIO ATIVO</Badge>
                </div>
                <div className="grid grid-cols-2 gap-2 text-[9px] bg-slate-50 dark:bg-black/40 p-2.5 rounded-lg border border-slate-200 dark:border-[#f43f5e]/10 font-bold tracking-wider">
                  <div><span className="text-slate-500 dark:text-brand-silver/40">PUNIÇÃO:</span> <span className="text-slate-900 dark:text-brand-white ml-1">{b.suggested_rounds} Rds</span></div>
                  <div><span className="text-slate-500 dark:text-brand-silver/40">APLICAÇÃO:</span> <span className="text-slate-900 dark:text-brand-white ml-1">{b.applied_at ? new Date(b.applied_at).toLocaleDateString() : '-'}</span></div>
                  <div><span className="text-slate-500 dark:text-brand-silver/40">CUMPRIDAS:</span> <span className="text-emerald-500 dark:text-emerald-400 ml-1">{b.fulfilled_rounds || 0} Rds</span></div>
                  <div><span className="text-slate-500 dark:text-brand-silver/40">RESTANTES:</span> <span className="text-[#f43f5e] ml-1">{b.remaining_rounds || 0} Rds</span></div>
                </div>
                {b.admin_notes && (
                  <div className="pt-2">
                    {showDetails === b.incident_id ? (
                      <div className="text-[10px] text-slate-700 dark:text-brand-silver/80 bg-slate-100 dark:bg-white/5 p-3 rounded-lg italic border border-slate-200 dark:border-white/5 relative">
                        "{b.admin_notes}"
                        <button onClick={() => setShowDetails(null)} className="absolute -top-2 -right-2 bg-white dark:bg-brand-surface border border-slate-200 dark:border-brand-border rounded-full p-1 w-5 h-5 flex items-center justify-center text-slate-500 dark:text-brand-silver hover:text-slate-900 dark:hover:text-white transition-colors">
                          <span className="sr-only">Fechar</span>×
                        </button>
                      </div>
                    ) : (
                      <button onClick={() => setShowDetails(b.incident_id)} className="text-[9px] text-[#f43f5e] hover:text-[#f43f5e]/80 font-black tracking-widest uppercase flex items-center gap-1 transition-colors">
                        <Info className="w-3 h-3" /> VER DETALHES
                      </button>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
