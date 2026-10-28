import { useState, useEffect, useMemo } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Check, X as XIcon, Minus, Loader2 } from "lucide-react";
import { PlayerAvatar } from "@/components/PlayerAvatar";
import { cn } from "@/lib/utils";
import { classifyRegistrations } from "@/lib/registration-classification";
import { useServerFn } from "@tanstack/react-start";
import { admin_save_attendance_fn } from "@/lib/attendance.functions";
import { toast } from "sonner";
import { friendlyError } from "@/lib/error-messages";

export function AdminAttendanceDialog({
  open,
  onOpenChange,
  event,
  registrations,
  onSaved
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  event: any;
  registrations: any[];
  onSaved: () => void;
}) {
  const saveAttendance = useServerFn(admin_save_attendance_fn);
  const [busy, setBusy] = useState(false);
  const [statusMap, setStatusMap] = useState<Record<string, "present" | "absent" | "unverified">>({});

  const mainLimit = event?.event?.main_limit ?? event?.settings?.main_limit ?? 18;
  const { starters, reserves } = useMemo(() => classifyRegistrations(registrations, mainLimit), [registrations, mainLimit]);
  
  useEffect(() => {
    if (open) {
      const initialMap: Record<string, "present" | "absent" | "unverified"> = {};
      registrations.forEach(r => {
        initialMap[r.id] = r.attendance_status || "unverified";
      });
      setStatusMap(initialMap);
    }
  }, [open, registrations]);

  const startersCount = starters.length;
  const checkedStarters = starters.filter(r => statusMap[r.id] === "present" || statusMap[r.id] === "absent").length;
  const progress = startersCount > 0 ? (checkedStarters / startersCount) * 100 : 100;
  const canSave = checkedStarters === startersCount;

  const handleSave = async () => {
    if (!event?.event?.id) return;
    setBusy(true);
    try {
      const attendances = registrations.map(r => ({
        registration_id: r.id,
        status: statusMap[r.id] || "unverified"
      }));
      await saveAttendance({ data: { event_id: event.event.id, attendances } });
      toast.success("Presenças conferidas com sucesso!");
      onSaved();
      onOpenChange(false);
    } catch (e) {
      toast.error(friendlyError(e));
    } finally {
      setBusy(false);
    }
  };

  const handleSetStatus = (id: string, st: "present" | "absent" | "unverified") => {
    setStatusMap(prev => ({ ...prev, [id]: st }));
  };

  const isFuture = event?.event?.event_date ? new Date(event.event.event_date + "T12:00:00") > new Date() : false;
  const isCancelled = event?.event?.status === "cancelled";
  const cannotEdit = isFuture || isCancelled;

  const renderRow = (r: any, isStarter: boolean) => {
    const isGuest = r.player?.is_guest || r.registration_source === 'guest';
    const st = statusMap[r.id] || "unverified";
    
    return (
      <div key={r.id} className="flex items-center justify-between p-2 border-b border-brand-border/30 hover:bg-white/5">
        <div className="flex items-center gap-3">
          <PlayerAvatar 
            path={r.player?.avatar_path || r.player_avatar_path} 
            name={r.player?.name || r.player_name || "Sem Nome"} 
            size="sm" 
          />
          <div className="flex flex-col">
            <span className="text-xs font-bold uppercase Oswald text-brand-white">
              {r.player?.name || r.player_name || "Sem Nome"}
            </span>
            <div className="flex gap-1 mt-0.5">
              {isGuest && <Badge variant="outline" className="text-[8px] bg-brand-blue text-brand-silver/70 border-0 h-4">CONVIDADO</Badge>}
              {!isStarter && <Badge variant="outline" className="text-[8px] bg-amber-500/10 text-amber-500 border-0 h-4">RESERVA</Badge>}
            </div>
          </div>
        </div>
        
        <div className="flex items-center gap-1">
          <Button 
            size="icon" 
            variant={st === "present" ? "default" : "outline"}
            className={cn("h-7 w-8", st === "present" ? "bg-emerald-500 text-white hover:bg-emerald-600" : "text-brand-silver/50 hover:text-emerald-400")}
            onClick={() => handleSetStatus(r.id, "present")}
            disabled={cannotEdit || busy}
          >
            <Check className="w-3 h-3" />
          </Button>
          <Button 
            size="icon" 
            variant={st === "absent" ? "default" : "outline"}
            className={cn("h-7 w-8", st === "absent" ? "bg-red-500 text-white hover:bg-red-600" : "text-brand-silver/50 hover:text-red-400")}
            onClick={() => handleSetStatus(r.id, "absent")}
            disabled={cannotEdit || busy}
          >
            <XIcon className="w-3 h-3" />
          </Button>
          <Button 
            size="icon" 
            variant={st === "unverified" ? "default" : "outline"}
            className={cn("h-7 w-8", st === "unverified" ? "bg-brand-surface border-brand-border text-brand-silver" : "text-brand-silver/30 border-transparent hover:text-brand-silver")}
            onClick={() => handleSetStatus(r.id, "unverified")}
            disabled={cannotEdit || busy}
          >
            <Minus className="w-3 h-3" />
          </Button>
        </div>
      </div>
    );
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg bg-brand-surface border-brand-border max-h-[90vh] flex flex-col p-0 gap-0">
        <DialogHeader className="p-4 border-b border-brand-border/50 shrink-0">
          <DialogTitle className="Oswald uppercase font-black text-brand-gold text-lg">Conferir Presenças</DialogTitle>
          <DialogDescription className="text-brand-silver text-xs Oswald uppercase">
            Data: {event?.event?.event_date ? new Date(event.event.event_date + "T12:00:00").toLocaleDateString('pt-BR') : ""}
          </DialogDescription>
        </DialogHeader>
        
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {cannotEdit ? (
            <div className="p-4 bg-red-500/10 border border-red-500/20 rounded-lg text-red-400 text-xs Oswald uppercase font-bold text-center">
              {isFuture ? "Não é possível conferir presenças de rodadas futuras." : "Rodada cancelada."}
            </div>
          ) : (
            <>
              <div className="space-y-1">
                <div className="flex justify-between text-[10px] font-bold Oswald uppercase text-brand-silver">
                  <span>Progresso (Titulares)</span>
                  <span>{checkedStarters} / {startersCount}</span>
                </div>
                <div className="w-full bg-brand-surface/50 h-2 rounded-full overflow-hidden border border-brand-border">
                  <div className="bg-brand-gold h-full transition-all" style={{ width: `${progress}%` }} />
                </div>
              </div>
              
              <div className="space-y-2">
                <h4 className="text-[10px] font-bold text-brand-gold uppercase tracking-widest Oswald border-b border-brand-border/30 pb-1">Titulares</h4>
                {starters.length === 0 ? (
                  <p className="text-xs text-brand-silver/50 italic Oswald uppercase">Nenhum titular.</p>
                ) : (
                  starters.map(r => renderRow(r, true))
                )}
              </div>

              {reserves.length > 0 && (
                <div className="space-y-2 pt-2">
                  <h4 className="text-[10px] font-bold text-amber-500 uppercase tracking-widest Oswald border-b border-brand-border/30 pb-1">Reservas</h4>
                  {reserves.map(r => renderRow(r, false))}
                </div>
              )}
            </>
          )}
        </div>

        <DialogFooter className="p-4 border-t border-brand-border/50 shrink-0">
          <Button variant="ghost" onClick={() => onOpenChange(false)} className="text-brand-silver Oswald uppercase text-xs" disabled={busy}>
            Cancelar
          </Button>
          <Button 
            className="bg-brand-gold text-brand-blue Oswald uppercase font-bold text-xs" 
            disabled={cannotEdit || !canSave || busy}
            onClick={handleSave}
          >
            {busy ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
            Salvar Presenças
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
