import { useQuery, useQueryClient } from "@tanstack/react-query";
import { cn } from "@/lib/utils";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Trash2, RefreshCw, ChevronDown, ArrowUp, ArrowDown, MoreVertical, ShieldCheck, User, Shield, GripVertical, MessageSquare, Power, Copy, Calendar, Users, List, Plus, MoreHorizontal, Check } from "lucide-react";
import { useAdminGroup } from "@/lib/admin-group-context";
import { get_admin_event, admin_set_status, admin_remove, admin_create_next_event } from "@/lib/admin.functions";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { friendlyError } from "@/lib/error-messages";
import { AddPlayerModal } from "@/components/AddPlayerModal";
import { AppConfirmDialog } from "@/components/AppDialogs";
import { PlayerAvatar } from "@/components/PlayerAvatar";
import { PlayerPhotoModal } from "@/components/PlayerPhotoModal";
import { AdminAttendanceDialog } from "@/components/AdminAttendanceDialog";

import { useState, useTransition, useMemo, useEffect, useRef } from "react";
import { POSITIONS, positionLabel } from "@/lib/skills";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
} from "@dnd-kit/core";
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
  useSortable,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { restrictToVerticalAxis, restrictToWindowEdges } from "@dnd-kit/modifiers";
import { classifyRegistrations, displayNumber, formatRegistrationDateTime } from "@/lib/registration-classification";

export function StatusBadge({ status }: { status: string }) {
  const map: Record<string, { label: string; cls: string }> = {
    open: { label: "Aberta", cls: "bg-emerald-500/20 text-emerald-300 border-emerald-500/40" },
    closed: { label: "Fechada", cls: "bg-red-500/20 text-red-300 border-red-500/40" },
    scheduled: { label: "Programada", cls: "bg-amber-500/20 text-amber-300 border-amber-500/40" },
    completed: { label: "Finalizada", cls: "bg-zinc-500/20 text-zinc-300 border-zinc-500/40" },
    cancelled: { label: "Cancelada", cls: "bg-zinc-500/20 text-zinc-300 border-zinc-500/40" },
  };
  const s = map[status] ?? map.scheduled;
  return (
    <Badge variant="outline" className={`border ${s.cls} px-2 py-1 text-[10px] font-bold uppercase`}>
      {s.label}
    </Badge>
  );
}


export function ListTab() {
  const { groupId } = useAdminGroup();
  const qc = useQueryClient();
  const getEvent = useServerFn(get_admin_event);
  const setStatus = useServerFn(admin_set_status);
  const removePlayer = useServerFn(admin_remove);
  const createNext = useServerFn(admin_create_next_event);
  const updatePosition = useServerFn(async (args: { data: { player_id: string, primary_position: string | null } }) => {
    const { admin_update_player_primary_position } = await import("@/lib/admin-extra.functions");
    return admin_update_player_primary_position(args);
  });
  const moveRegistration = useServerFn(async (args: { data: { registration_id: string, new_position: number } }) => {
    const { admin_move_registration } = await import("@/lib/admin-extra.functions");
    return admin_move_registration(args);
  });
  
  const [isPending, startTransition] = useTransition();
  // LOGS DE AUDITORIA DE PERMISSÃO
  // console.log("[ADMIN LIST] Rendering ListTab. groupId:", groupId);

  const adminAutoEnrollOrganizers = useServerFn(async (args: { data: { group_id: string, event_id?: string } }) => {
    const { admin_auto_enroll_organizers } = await import("@/lib/admin-extra.functions");
    return admin_auto_enroll_organizers(args);
  });

  const { data: event, isLoading, isError, error, refetch } = useQuery({
    queryKey: ["admin-event", groupId],
    queryFn: async () => {
      try {
        return await getEvent({ data: { group_id: groupId } });
      } catch (err) {
        console.error("[ADMIN LIST UI] ERRO na queryFn:", err);
        throw err;
      }
    },
    enabled: !!groupId,
    retry: 1,
  });

  // Autoinscrição de organizadores ocorre apenas na abertura da rodada ou via botão manual.
  // Remoções feitas pelo admin são respeitadas (sem reinscrição automática).

  const [isSyncing, setIsSyncing] = useState(false);
  const [syncConfirmOpen, setSyncConfirmOpen] = useState(false);
  const [statusConfirmOpen, setStatusConfirmOpen] = useState(false);
  const [isTogglingStatus, setIsTogglingStatus] = useState(false);
  const [attendanceOpen, setAttendanceOpen] = useState(false);
  const [registrations, setRegistrations] = useState<any[]>([]);
  const [playerToRemove, setPlayerToRemove] = useState<{id: string, name: string} | null>(null);
  const [selectedPhoto, setSelectedPhoto] = useState<any>(null);

  const mainLimit = event?.event?.main_limit ?? event?.settings?.main_limit ?? 18;
  const groupName = ((event?.settings as any)?.group?.name || "TURMA").toUpperCase();
  const eventDateStr = event?.event?.event_date ? new Date(event.event.event_date + "T12:00:00").toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' }) : "";

  useEffect(() => {
    if (event?.registrations) {
      // FONTE ÚNICA DE VERDADE: ordem exclusivamente cronológica (created_at ASC, id ASC)
      setRegistrations(classifyRegistrations(event.registrations, mainLimit).all);
    }
  }, [event?.registrations, mainLimit]);

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 2,
        delay: 0,
      },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center py-20 space-y-4">
        <div className="w-8 h-8 border-4 border-brand-gold border-t-transparent rounded-full animate-spin"></div>
        <p className="text-brand-silver text-sm italic Oswald uppercase tracking-widest animate-pulse">Carregando evento da turma...</p>
      </div>
    );
  }

  if (isError) {
    return (
      <Card className="p-8 text-center bg-white dark:bg-brand-surface/40 border border-slate-200 dark:border-red-500/20 space-y-4 shadow-sm dark:shadow-none">
        <div className="text-red-500 dark:text-red-400 font-bold Oswald uppercase">Erro ao carregar rodada</div>
        <p className="text-slate-500 dark:text-brand-silver text-xs italic">{friendlyError(error)}</p>
        <Button onClick={() => refetch()} className="bg-pink-600 hover:bg-pink-700 dark:bg-brand-gold text-white dark:text-brand-blue uppercase font-bold text-[10px]">
          Tentar Novamente
        </Button>
      </Card>
    );
  }

  const handleDragEnd = async (dragEvent: DragEndEvent) => {
    const { active, over } = dragEvent;
    if (!over || active.id === over.id) return;

    const oldIndex = registrations.findIndex((r) => r.id === active.id);
    const newIndex = registrations.findIndex((r) => r.id === over.id);

    if (oldIndex === -1 || newIndex === -1) return;

    // Optimistic UI
    const newOrder = arrayMove(registrations, oldIndex, newIndex);
    setRegistrations(newOrder);

    try {
      await moveRegistration({
        data: {
          registration_id: active.id as string,
          new_position: newIndex + 1
        }
      });
      toast.success("Ordem atualizada!");
      refetch();
    } catch (e) {
      toast.error("Erro ao reordenar: " + friendlyError(e));
      setRegistrations(registrations); // Revert
    }
  };


function PlayerRow({ reg, totalIdx, mainLimit, isOrganizer, isAdmin, onRefetch, isPending, updatePosition, handleRemove, onPhotoClick }: any) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: reg.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    zIndex: isDragging ? 50 : undefined,
    opacity: isDragging ? 0.5 : 1,
  };

  const playerName = (reg.player?.name || reg.player_name || "").trim() || "Sem nome";
  const rawPos = reg.player_skills?.primary_position || (reg.player as any)?.primary_position;
  const playerPosition = (!rawPos || rawPos === "undefined" || rawPos === "null" || rawPos === "" || rawPos === "Sem posição definida") 
    ? null : String(rawPos).toUpperCase();
  const regCreatedAt = reg.created_at;
  const registrationTime = formatRegistrationDateTime(regCreatedAt);
  const source = (reg as any).registration_source;

  return (
    <div 
      ref={setNodeRef} 
      style={style}
      className={cn(
        "group flex items-center justify-between gap-3 p-3 transition-all duration-200 border rounded-xl",
        isDragging 
          ? "border-pink-500 dark:border-brand-gold shadow-2xl scale-[1.02] bg-white dark:bg-brand-surface z-50" 
          : "bg-white dark:bg-white/5 border-slate-200 dark:border-transparent hover:border-pink-500/20 dark:hover:border-brand-gold/20 hover:bg-slate-50 dark:hover:bg-white/10"
      )}
    >
      <div className="flex items-center gap-3 min-w-0 flex-1">
        <div 
          className="cursor-grab active:cursor-grabbing p-1 text-brand-silver/20 group-hover:text-brand-gold/40 transition-colors"
          {...attributes} 
          {...listeners}
        >
          <GripVertical className="w-3.5 h-3.5" />
        </div>

        <div className="relative shrink-0">
          <PlayerAvatar 
            path={reg.player?.avatar_path || reg.player_avatar_path} 
            name={playerName} 
            size="sm" 
            className="border border-brand-border group-hover:border-brand-gold/50 transition-all cursor-pointer"
            onClick={(e) => {
              e.stopPropagation();
              onPhotoClick({
                id: reg.player_id,
                name: playerName,
                avatar_path: reg.player?.avatar_path || reg.player_avatar_path,
                phone: reg.player?.phone_normalized,
                group_name: (reg as any).group_name,
                position: playerPosition
              });
            }}
          />
          <div className="absolute -top-1.5 -left-1.5 bg-brand-gold text-brand-blue text-[8px] font-black px-1 rounded border border-brand-blue shadow-sm">
            {displayNumber(totalIdx, mainLimit)}
          </div>
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap min-w-0">
            <p className="text-sm font-black text-slate-900 dark:text-brand-white Oswald uppercase truncate tracking-tight">
              {playerName}
            </p>
            {(isOrganizer || source === 'admin_sync') && (
              <Badge className="bg-brand-gold/20 text-brand-gold border-0 text-[8px] h-3.5 Oswald font-black uppercase rounded-sm" title="Pré-inscrito pela automação de organizadores">
                ORG / PRÉ-INSCRITO
              </Badge>
            )}
          </div>
          
          <div className="flex items-center gap-3 mt-1.5">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button 
                  className="flex items-center gap-1 text-[10px] font-black Oswald uppercase hover:text-brand-gold transition-colors tracking-widest h-3.5"
                  disabled={isPending}
                >
                  {playerPosition ? (
                    <span className="text-brand-gold">{playerPosition}</span>
                  ) : (
                    <span className="text-brand-silver/50">POS?</span>
                  )}
                  <ChevronDown className="w-2.5 h-2.5 opacity-40" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" className="bg-white dark:bg-brand-surface border-slate-200 dark:border-brand-border text-slate-800 dark:text-brand-white Oswald p-1 min-w-[140px]">
                {POSITIONS.map((pos) => (
                  <DropdownMenuItem
                    key={pos.value}
                    className="text-[10px] uppercase font-bold tracking-wider cursor-pointer py-2 hover:bg-pink-50 dark:hover:bg-brand-gold/10 hover:text-pink-600 dark:hover:text-brand-gold"
                    onClick={async () => {
                      const newPos = pos.value === 'undefined' ? null : pos.value;
                      try {
                        await updatePosition({ data: { player_id: reg.player_id, primary_position: newPos } });
                        toast.success(`Posição atualizada: ${pos.label}`);
                        onRefetch();
                      } catch (e) {
                        toast.error("Erro ao atualizar posição");
                      }
                    }}
                  >
                    {pos.label}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
            
            <div className="flex items-center gap-2 text-[9px] text-brand-silver/50 Oswald font-bold uppercase tracking-widest">
              {source === 'admin' ? (
                <span className="flex items-center gap-1"><Shield className="w-2.5 h-2.5 text-brand-gold/60" /> ADMIN</span>
              ) : (
                <span className="flex items-center gap-1"><User className="w-2.5 h-2.5 text-brand-silver/60" /> JOGADOR</span>
              )}
              {registrationTime && <span className="text-brand-silver/40">• {registrationTime}</span>}
            </div>
          </div>
        </div>
      </div>

      <div className="flex items-center gap-1.5 shrink-0 ml-1">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" className="h-8 w-8 text-brand-silver/30 group-hover:text-brand-silver hover:bg-white/5 rounded-lg">
              <MoreVertical className="w-4 h-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="bg-white dark:bg-brand-surface border-slate-200 dark:border-brand-border text-slate-800 dark:text-brand-white Oswald p-1 min-w-[160px]">
            <DropdownMenuItem 
              className="text-[9px] uppercase font-bold tracking-wider cursor-pointer py-2 hover:bg-pink-50 dark:hover:bg-brand-gold/10 hover:text-pink-600 dark:hover:text-brand-gold gap-2"
              onClick={() => onPhotoClick({
                id: reg.player_id,
                name: playerName,
                avatar_path: reg.player?.avatar_path || reg.player_avatar_path,
                phone: reg.player?.phone_normalized,
                group_name: (reg as any).group_name,
                position: playerPosition
              })}
            >
              <User className="w-3.5 h-3.5" />
              Ver Perfil Completo
            </DropdownMenuItem>
            <DropdownMenuSeparator className="bg-slate-200 dark:bg-brand-border/50" />
            <DropdownMenuItem 
              className="text-[9px] uppercase font-bold tracking-wider cursor-pointer py-2 text-red-400 focus:text-red-400 focus:bg-red-400/10 gap-2"
              onClick={() => handleRemove(reg.id, playerName)}
            >
              <Trash2 className="w-3.5 h-3.5" />
              Remover da Rodada
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>
  );
}



  const handleToggleStatus = async () => {
    if (!event?.event || isTogglingStatus) return;
    const nextStatus = event.event.status === "open" ? "closed" : "open";
    
    setIsTogglingStatus(true);
    try {
      await setStatus({ data: { event_id: event.event.id, status: nextStatus } });
      
      const updatedEvent = await getEvent({ data: { group_id: groupId } });
      if (updatedEvent?.event?.status === nextStatus) {
        toast.success(`Lista ${nextStatus === "open" ? "aberta" : "fechada"} com sucesso no servidor!`);
      } else {
        toast.error(`Falha ao alterar status no servidor.`);
      }

      setStatusConfirmOpen(false);
      await qc.invalidateQueries({ queryKey: ["admin-event", groupId] });
      await refetch();
    } catch (e: any) {
      console.error("[OPEN ROUND ERROR UI]:", e);
      const exactMessage = e.message || friendlyError(e) || "Ocorreu um erro ao tentar alterar o status.";
      toast.error(exactMessage);
    } finally {
      setIsTogglingStatus(false);
    }
  };

  const handleArchiveRound = async () => {
    if (!event?.event || isTogglingStatus) return;
    setIsTogglingStatus(true);
    try {
      await setStatus({ data: { event_id: event.event.id, status: 'completed' } });
      const nextRes = await createNext({ data: { group_id: groupId } });
      
      if (nextRes?.status === 'created') {
        toast.success("Rodada arquivada! A próxima rodada já foi preparada com um novo ID.");
      } else if (nextRes?.status === 'already_exists') {
        toast.success("Rodada arquivada! O próximo jogo já estava pré-configurado.");
      } else {
        toast.success("Rodada arquivada, mas houve aviso na criação da próxima: " + nextRes?.message);
      }
      
      setStatusConfirmOpen(false);
      await qc.invalidateQueries({ queryKey: ["admin-event", groupId] });
      await qc.invalidateQueries({ queryKey: ["admin-events-list"] });
      await refetch();
    } catch (e: any) {
      toast.error(e.message || friendlyError(e));
    } finally {
      setIsTogglingStatus(false);
    }
  };

  const handleSyncOrganizers = async () => {
    if (!event?.event) return;
    setIsSyncing(true);
    try {
      const res = await adminAutoEnrollOrganizers({ data: { group_id: groupId!, event_id: event.event.id } });
      if (res.ok) {
        toast.success(res.message);
      } else {
        toast.warning(res.message);
      }
      refetch();
      setSyncConfirmOpen(false);
    } catch (e) {
      toast.error(friendlyError(e));
    } finally {
      setIsSyncing(false);
    }
  };

  const generateShareText = () => {
    if (!event?.event || !event?.settings) return "";

    const eventName = (event?.settings?.event_name || "SE PASSOU, É PONTO").toUpperCase();
    const groupName = ((event?.settings as any)?.group?.name || "").toUpperCase();
    const eventDate = new Date(event.event.event_date + "T12:00:00").toLocaleDateString('pt-BR');
    
    // Obter dia da semana em português
    const dayOfWeek = new Date(event.event.event_date + "T12:00:00")
      .toLocaleDateString('pt-BR', { weekday: 'long' })
      .toUpperCase();

    const mainLimit = (event.event as any).main_limit || 18;
    const { starters: mainList, reserves: waitList } = classifyRegistrations(registrations, mainLimit);
    
    let text = `🏐 *${eventName}*\n`;
    text += `📅 *${dayOfWeek} — ${eventDate}*\n\n`;
    
    text += `✅ *TITULARES — ${mainList.length}/${mainLimit}*\n\n`;
    
    if (mainList.length > 0) {
      mainList.forEach((reg, idx) => {
        const num = String(idx + 1).padStart(2, '0');
        const name = (reg.player?.name || reg.player_name || "Sem nome").trim();
        text += `${num} - ${name}\n`;
      });
    } else {
      text += "Nenhum jogador inscrito.\n";
    }
    
    text += `\n⏳ *RESERVA — ${waitList.length}*\n\n`;
    
    if (waitList.length > 0) {
      waitList.forEach((reg, idx) => {
        const num = String(idx + 1).padStart(2, '0');
        const name = (reg.player?.name || reg.player_name || "Sem nome").trim();
        text += `${num} - ${name}\n`;
      });
    } else {
      text += "Nenhum jogador na reserva.\n";
    }
    
    text += `\n${event.event.status === 'open' ? '🟢 *LISTA ABERTA*' : '🔴 *LISTA FECHADA*'}`;
    
    return text;
  };

  const handleCopyList = () => {
    const text = generateShareText();
    if (!text) return;

    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(() => {
        toast.success("Lista copiada! Agora é só colar no WhatsApp.");
      }).catch((err) => {
        console.error("Erro ao copiar lista:", err);
        toast.error("Erro ao copiar lista");
      });
    } else {
      // Fallback
      const textArea = document.createElement("textarea");
      textArea.value = text;
      document.body.appendChild(textArea);
      textArea.select();
      try {
        document.execCommand('copy');
        toast.success("Lista copiada! Agora é só colar no WhatsApp.");
      } catch (err) {
        toast.error("Erro ao copiar lista");
      }
      document.body.removeChild(textArea);
    }
  };


  const handleRemove = async (regId: string, name: string) => {
    setPlayerToRemove({ id: regId, name });
  };

  const confirmRemove = async () => {
    if (!playerToRemove) return;
    try {
      await removePlayer({ data: { registration_id: playerToRemove.id, force: true } });
      toast.success("Removido com sucesso");
      setPlayerToRemove(null);
      refetch();
    } catch (e: any) {
      console.error("[REMOVE PLAYER ERROR]", {
        code: e?.code,
        message: e?.message,
        details: e?.details,
        hint: e?.hint,
        name: e?.name,
        status: e?.status,
        statusCode: e?.statusCode,
        cause: e?.cause,
        raw: e
      });
      console.error(
        "[REMOVE PLAYER ERROR JSON]",
        JSON.stringify(e, Object.getOwnPropertyNames(e), 2)
      );
      toast.error(friendlyError(e));
    }
  };

  // Removido o check redundante que causava loading infinito se event?.settings existisse mas event?.event não
  // O estado agora é controlado pelo useQuery (isLoading/isError)

  if (!event?.event) {
    return (
      <Card className="p-8 text-center bg-white dark:bg-brand-surface/40 border border-slate-200 dark:border-brand-border space-y-4 shadow-sm dark:shadow-none">
        <p className="text-slate-500 dark:text-brand-silver text-xs italic">Nenhum evento ativo para esta turma.</p>
        <Button 
          onClick={async () => {
            try {
              await createNext({ data: { group_id: groupId } });
              toast.success("Próxima rodada criada!");
              refetch();
            } catch (e) {
              toast.error(friendlyError(e));
            }
          }}
          className="bg-pink-600 hover:bg-pink-700 dark:bg-brand-gold text-white dark:text-brand-blue uppercase font-bold text-[10px]"
        >
          Criar Próxima Rodada
        </Button>
      </Card>
    );
  }


  return (
    <div className="space-y-6 pb-20">
      {/* ROUND STATUS HEADER - CENTRAL DA RODADA STYLE */}
      <Card className="p-0 overflow-hidden bg-white dark:bg-[#020B1B]/60 border-slate-200 dark:border-brand-border/50 backdrop-blur-md shadow-sm dark:shadow-xl">
        <div className="p-4 md:p-6 space-y-6 bg-slate-50/50 dark:bg-transparent">
          <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
            <div className="space-y-1.5">
              <div className="flex items-center gap-2">
                <Badge variant="outline" className={cn(
                  "text-[9px] uppercase font-bold px-2 py-0.5 Oswald border-2 transition-all",
                  event.event.status === 'open' 
                    ? "bg-green-500/10 text-green-400 border-green-500/30" 
                    : "bg-red-500/10 text-red-400 border-red-500/30"
                )}>
                  {event.event.status === 'open' ? 'Rodada Aberta' : 'Rodada Fechada'}
                </Badge>
                <span className="text-[10px] text-slate-400 dark:text-brand-silver/50 uppercase Oswald font-bold tracking-widest flex items-center gap-1">
                  <Calendar className="w-3 h-3" />
                  {new Date(event.event.event_date + "T12:00:00").toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' })}
                </span>
            </div>
            <h2 className="text-2xl md:text-3xl font-black text-slate-900 dark:text-brand-white Oswald uppercase tracking-tight leading-none">
              Gestão da <span className="text-pink-600 dark:text-brand-gold">Lista</span>
              <span className="block text-xs text-slate-500 dark:text-brand-silver/50 tracking-widest mt-2">TURMA: {groupName} | EVENTO: {event.event.id.split('-')[0]}</span>
            </h2>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <Button size="sm" onClick={() => setStatusConfirmOpen(true)} variant="outline" className={cn(
                "h-9 text-[10px] px-3 font-bold uppercase tracking-wider flex items-center gap-1.5 transition-all active:scale-95 bg-white dark:bg-transparent",
                event.event.status === 'open' ? "border-amber-500/30 text-amber-500 dark:text-amber-400 hover:bg-amber-50 dark:hover:bg-amber-500/10" : "border-green-500/30 text-green-600 dark:text-green-400 hover:bg-green-50 dark:hover:bg-green-500/10"
              )} disabled={isTogglingStatus}>
                {isTogglingStatus ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Power className="w-3.5 h-3.5" />}
                {isTogglingStatus ? (event.event.status === "open" ? "Pausando..." : "Abrindo...") : (event.event.status === "open" ? "Pausar Inscrições" : "Abrir Inscrições")}
              </Button>

              <Button size="sm" onClick={handleArchiveRound} variant="outline" className="h-9 text-[10px] border-red-500/30 text-red-500 dark:text-red-400 bg-white dark:bg-transparent px-3 font-bold uppercase flex items-center gap-1.5 transition-all active:scale-95 hover:bg-red-50 dark:hover:bg-red-500/10" disabled={isTogglingStatus}>
                <Trash2 className="w-3.5 h-3.5" />
                Arquivar Rodada
              </Button>

              <Button size="sm" onClick={handleCopyList} variant="outline" className="h-9 text-[10px] border-pink-500/30 dark:border-brand-gold/30 text-pink-600 dark:text-brand-gold bg-white dark:bg-transparent px-3 font-bold uppercase flex items-center gap-1.5 transition-all active:scale-95 hover:bg-pink-50 dark:hover:bg-brand-gold/10">
                <Copy className="w-3.5 h-3.5" />
                Copiar
              </Button>

              <Button size="sm" onClick={() => setAttendanceOpen(true)} variant="outline" className="h-9 text-[10px] border-emerald-500/30 text-emerald-600 dark:text-emerald-400 bg-white dark:bg-transparent px-3 font-bold uppercase flex items-center gap-1.5 transition-all active:scale-95 hover:bg-emerald-50 dark:hover:bg-emerald-500/10">
                <Check className="w-3.5 h-3.5" />
                Presenças
              </Button>

              <AddPlayerModal eventId={event.event.id} onAdded={refetch} />
              
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button size="sm" variant="ghost" className="h-9 w-9 p-0 text-slate-400 dark:text-brand-silver hover:bg-slate-100 dark:hover:bg-white/5 rounded-lg border border-slate-200 dark:border-brand-border/50">
                    <MoreHorizontal className="w-4 h-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="bg-white dark:bg-brand-surface border-slate-200 dark:border-brand-border text-slate-800 dark:text-brand-white Oswald min-w-[180px] p-1 shadow-lg dark:shadow-2xl">
                  <DropdownMenuItem 
                    onClick={() => setSyncConfirmOpen(true)}
                    className="text-[10px] uppercase font-bold tracking-wider hover:bg-pink-50 dark:hover:bg-brand-gold/10 hover:text-pink-600 dark:hover:text-brand-gold cursor-pointer gap-2 py-2.5 px-3"
                  >
                    <RefreshCw className={cn("w-3.5 h-3.5", isSyncing && "animate-spin")} />
                    Sincronizar Organizadores
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>

              <AppConfirmDialog
                open={syncConfirmOpen}
                onOpenChange={setSyncConfirmOpen}
                title={`Sincronizar Organizadores - ${groupName}`}
                description={`Garantir organizadores na rodada atual com prioridade de topo em ${groupName}.`}
                onConfirm={async () => {
                  await handleSyncOrganizers();
                  setSyncConfirmOpen(false);
                }}
                confirmText="Sincronizar"
                cancelText="Cancelar"
                isLoading={isSyncing}
              />
            </div>
          </div>

          {/* OCCUPANCY PROGRESS BAR */}
          <div className="space-y-3 bg-slate-100 dark:bg-white/5 rounded-2xl p-4 border border-slate-200 dark:border-white/5">
            <div className="flex justify-between items-end">
              <div className="space-y-0.5">
                <span className="text-[10px] uppercase font-bold text-brand-silver/50 tracking-widest">Ocupação da Rodada</span>
                <div className="flex items-baseline gap-2">
                  <span className="text-2xl font-black text-brand-gold Oswald leading-none">{registrations.length}</span>
                  <span className="text-[10px] uppercase font-bold text-brand-silver/30 Oswald">Jogadores inscritos</span>
                </div>
              </div>
              <div className="text-right space-y-0.5">
                <span className="text-[10px] uppercase font-bold text-brand-silver/50 tracking-widest">Capacidade</span>
                <p className="text-xs font-bold text-brand-white Oswald leading-none">{mainLimit} Titulares + Reservas</p>
              </div>
            </div>
            
            <div className="relative h-2.5 w-full bg-slate-200 dark:bg-white/5 rounded-full overflow-hidden border border-slate-300 dark:border-white/5">
              <div 
                className={cn(
                  "absolute h-full transition-all duration-500 rounded-full dark:shadow-[0_0_10px_rgba(255,215,0,0.3)]",
                  registrations.length >= mainLimit ? "bg-pink-500 dark:bg-brand-gold" : "bg-pink-400 dark:bg-brand-gold/60"
                )}
                style={{ width: `${Math.min(100, (registrations.length / mainLimit) * 100)}%` }}
              />
            </div>

            <div className="flex justify-between items-center px-1">
              <div className="flex items-center gap-4">
                <div className="flex items-center gap-1.5">
                  <div className="w-2 h-2 rounded-full bg-pink-500 dark:bg-brand-gold" />
                  <span className="text-[9px] uppercase font-bold text-slate-800 dark:text-brand-white Oswald">{Math.min(registrations.length, mainLimit)} Titulares</span>
                </div>
                {registrations.length > mainLimit && (
                  <div className="flex items-center gap-1.5">
                    <div className="w-2 h-2 rounded-full bg-amber-500" />
                    <span className="text-[9px] uppercase font-bold text-amber-600 dark:text-amber-400/80 Oswald">{registrations.length - mainLimit} Reservas</span>
                  </div>
                )}
              </div>
              <span className="text-[9px] uppercase font-black text-pink-600/60 dark:text-brand-gold/40 Oswald tracking-widest">
                {Math.round(Math.min(100, (registrations.length / mainLimit) * 100))}% OCUPAÇÃO
              </span>
            </div>
          </div>
        </div>
      </Card>

      <div className="space-y-4">
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragEnd={handleDragEnd}
          modifiers={[restrictToVerticalAxis, restrictToWindowEdges]}
        >
          {(() => {
            const mainLimit = (event.event as any).main_limit || 18;
            const { starters: mainList, reserves: waitList } = classifyRegistrations(registrations, mainLimit);

            // Determinar se o organizador deve ser exibido com badge (ajuste de performance opcional)
            const organizerIds = new Set((event.organizers || []).map((o: any) => o.player_id));

            return (
              <>
                {mainList.length > 0 && (
                  <div className="space-y-2">
                    <div className="flex items-center justify-between px-1">
                      <h4 className="text-[10px] font-bold text-brand-gold uppercase tracking-widest font-oswald Oswald">
                        Titulares — {mainList.length} / {mainLimit}
                      </h4>
                    </div>
                    <div className="space-y-2">
                      <SortableContext items={mainList.map(r => r.id)} strategy={verticalListSortingStrategy}>
                        {mainList.map((reg, idx) => {
                          const isOrganizer = organizerIds.has(reg.player_id);
                          const isAdmin = reg.registration_source === 'admin_sync' || reg.registration_source === 'admin' || reg.player?.is_admin;

                          return (
                  <PlayerRow
                    key={reg.id}
                    reg={reg}
                    totalIdx={idx}
                    mainLimit={mainLimit}
                    isOrganizer={isOrganizer}
                    isAdmin={isAdmin}
                    onRefetch={refetch}
                    isPending={isPending}
                    updatePosition={updatePosition}
                    handleRemove={handleRemove}
                    onPhotoClick={setSelectedPhoto}
                  />
                          );
                        })}
                      </SortableContext>
                    </div>
                  </div>
                )}

                {waitList.length > 0 && (
                  <div className="space-y-2 pt-2">
                    <div className="flex items-center justify-between px-1">
                      <h4 className="text-[10px] font-bold text-amber-400 uppercase tracking-widest font-oswald Oswald">
                        Reserva — {waitList.length}
                      </h4>
                    </div>
                    <div className="space-y-2">
                      <SortableContext items={waitList.map(r => r.id)} strategy={verticalListSortingStrategy}>
                        {waitList.map((reg, idx) => {
                          const totalIdx = mainLimit + idx;
                          const isOrganizer = organizerIds.has(reg.player_id);
                          const isAdmin = reg.registration_source === 'admin_sync' || reg.registration_source === 'admin' || reg.player?.is_admin;

                          return (
                  <PlayerRow
                    key={reg.id}
                    reg={reg}
                    totalIdx={totalIdx}
                    mainLimit={mainLimit}
                    isOrganizer={isOrganizer}
                    isAdmin={isAdmin}
                    onRefetch={refetch}
                    isPending={isPending}
                    updatePosition={updatePosition}
                    handleRemove={handleRemove}
                    onPhotoClick={setSelectedPhoto}
                  />
                          );
                        })}
                      </SortableContext>
                    </div>
                  </div>
                )}

                {registrations.length === 0 && (
                  <p className="text-center py-8 text-brand-silver italic text-xs Oswald uppercase tracking-tight">Ninguém inscrito ainda.</p>
                )}
              </>
            );
          })()}
        </DndContext>
      </div>

      <div className="flex flex-wrap gap-4 items-center justify-center pt-4 border-t border-slate-200 dark:border-brand-border/30 opacity-60">
        <div className="flex items-center gap-1.5">
          <Badge className="bg-brand-gold/20 text-brand-gold border-0 text-[8px] h-3.5 Oswald font-black uppercase rounded-sm">
            ORG
          </Badge>
          <span className="text-[9px] uppercase font-bold text-slate-600 dark:text-brand-silver Oswald tracking-widest">Organizador</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="text-[9px] uppercase font-black text-pink-600 dark:text-brand-gold Oswald tracking-widest">POS</span>
          <span className="text-[9px] uppercase font-bold text-slate-600 dark:text-brand-silver Oswald tracking-widest">Posição em quadra</span>
        </div>
      </div>

      <AppConfirmDialog
        open={!!playerToRemove}
        onOpenChange={(open) => !open && setPlayerToRemove(null)}
        title={`Remover Jogador - ${groupName}`}
        description={`Remover ${playerToRemove?.name} da rodada de ${eventDateStr} em ${groupName}?`}
        onConfirm={confirmRemove}
        confirmText="Remover"
        cancelText="Cancelar"
      />

      <AppConfirmDialog
        open={statusConfirmOpen}
        onOpenChange={(open) => !isTogglingStatus && setStatusConfirmOpen(open)}
        title={`${event?.event?.status === 'open' ? 'Encerrar' : 'Abrir'} Rodada - ${groupName}`}
        description={`Deseja ${event?.event?.status === 'open' ? 'encerrar' : 'abrir'} a lista da rodada de ${eventDateStr} em ${groupName}?`}
        onConfirm={handleToggleStatus}
        confirmText="Confirmar"
        cancelText="Cancelar"
        isLoading={isTogglingStatus}
      />

      <AdminAttendanceDialog 
        open={attendanceOpen}
        onOpenChange={setAttendanceOpen}
        event={event}
        registrations={registrations}
        onSaved={() => refetch()}
      />
    </div>
  );
}

