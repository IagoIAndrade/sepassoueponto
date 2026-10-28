import { X, Shield, Phone, Key, UserMinus, ShieldCheck, Zap, Users } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { PlayerAvatar } from "@/components/PlayerAvatar";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { positionLabel, overallLevel, type PlayerSkills, SKILL_KEYS, SKILL_LABELS, fmt1 } from "@/lib/skills";

interface PlayerDrawerProps {
  player: any | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onResetPin: (id: string) => void;
  onDeactivate: (id: string, active: boolean) => void;
  onEditName: (id: string, name: string) => void;
  weights: any;
}

export function PlayerDrawer({ 
  player, 
  open, 
  onOpenChange, 
  onResetPin, 
  onDeactivate, 
  onEditName,
  weights 
}: PlayerDrawerProps) {
  if (!player) return null;

  const skills: PlayerSkills = {
    player_id: player.id,
    primary_position: player.player_skills?.primary_position ?? player.primary_position ?? "undefined",
    height_cm: player.player_skills?.height_cm ?? player.height_cm ?? null,
    notes: player.player_skills?.notes ?? player.notes ?? null,
    updated_at: player.player_skills?.updated_at ?? player.updated_at ?? null,
    updated_by: player.player_skills?.updated_by ?? player.updated_by ?? null,
    ...SKILL_KEYS.reduce((acc, k) => ({ ...acc, [k]: player.player_skills?.[k] ?? player[k] ?? null }), {})
  };

  const level = overallLevel(skills, weights);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-[#13141a] border border-[#262833] text-white w-[calc(100vw-32px)] sm:max-w-md p-0 flex flex-col gap-0 shadow-2xl max-h-[calc(100dvh-32px)] overflow-hidden my-4 mx-auto rounded-2xl [&>button]:hidden">
        <DialogHeader className="px-5 py-4 border-b border-[#262833] bg-[#17181f]/80 space-y-3 shrink-0">
          <div className="flex justify-between items-start">
            <div className="flex items-center gap-3.5">
              <PlayerAvatar path={player.avatar_path} name={player.name} size="lg" className="ring-2 ring-[#ff2d78]/30" />
              <div className="text-left">
                <DialogTitle className="text-lg font-black Oswald uppercase text-white tracking-tight leading-none mb-1">
                  {player.name}
                </DialogTitle>
                <DialogDescription className="text-[10px] text-zinc-400 font-bold uppercase tracking-wider flex items-center gap-1.5">
                  <Phone className="w-3 h-3 text-[#ff2d78]" /> {player.phone_normalized || "Sem telefone"}
                </DialogDescription>
              </div>
            </div>
            <Button variant="ghost" size="icon" onClick={() => onOpenChange(false)} className="text-zinc-400 hover:text-white hover:bg-white/10 h-9 w-9 -mr-1 -mt-1 rounded-lg shrink-0" aria-label="Fechar perfil">
              <X className="w-5 h-5" />
            </Button>
          </div>

          <div className="flex flex-wrap gap-1.5">
            {player.active ? (
              <Badge className="bg-emerald-500/10 text-emerald-400 border-emerald-500/20 text-[9px] uppercase font-bold">Ativo</Badge>
            ) : (
              <Badge className="bg-red-500/10 text-red-400 border-red-500/20 text-[9px] uppercase font-bold">Inativo</Badge>
            )}
            {player.is_admin && (
              <Badge className="bg-[#ff2d78] text-white border-none text-[9px] uppercase font-bold">Administrador</Badge>
            )}
            {player.has_priority !== undefined && (
              <Badge className={cn(
                "text-[9px] uppercase font-bold",
                player.has_priority 
                  ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20" 
                  : "bg-zinc-700/30 text-zinc-400 border-zinc-700/40"
              )}>
                {player.has_priority ? "Com prioridade" : "Sem prioridade"}
              </Badge>
            )}
            <Badge variant="outline" className="border-[#262833] bg-[#181a22] text-zinc-300 text-[9px] uppercase font-bold Oswald">
              {(player.primary_position && player.primary_position !== "undefined" && player.primary_position !== "Sem posição definida") ? positionLabel(player.primary_position) : "Sem posição"}
            </Badge>
          </div>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {/* Nível Técnico */}
          <div className="bg-[#181a22] border border-[#262833] rounded-xl p-4 text-center relative overflow-hidden group">
            <div className="absolute top-0 right-0 p-2 opacity-5">
               <ShieldCheck className="w-12 h-12 text-[#ff2d78]" />
            </div>
            <p className="text-[10px] font-black Oswald uppercase tracking-wider text-zinc-400 mb-0.5">Nível Técnico Global</p>
            <p className="text-4xl font-black Oswald text-white tracking-tight tabular-nums">
              {level !== null ? fmt1(level) : "—"}
            </p>
            <p className="text-[10px] font-bold Oswald uppercase tracking-wider text-[#ff2d78] mt-0.5">
              {level !== null ? "Avaliação Confirmada" : "Sem avaliação"}
            </p>
          </div>

          {/* Grid de Habilidades */}
          <div className="space-y-2">
             <h4 className="text-[10px] font-black Oswald uppercase tracking-wider text-zinc-400 flex items-center gap-1.5 px-1">
                <Zap className="w-3 h-3 text-[#ff2d78]" /> Fundamentos Técnicos
             </h4>
             <div className="grid grid-cols-2 gap-2">
                {SKILL_KEYS.map(k => {
                  const val = (skills as any)[k];
                  return (
                    <div key={k} className="bg-[#181a22] border border-[#262833] rounded-lg p-2.5 flex justify-between items-center">
                      <span className="text-[9px] font-bold uppercase text-zinc-400 Oswald truncate pr-2">
                        {SKILL_LABELS[k].split('/')[0]}
                      </span>
                      <span className={cn(
                        "text-xs font-black Oswald",
                        val !== null && val !== undefined ? "text-white" : "text-zinc-600"
                      )}>
                        {val !== null && val !== undefined ? val : "-"}
                      </span>
                    </div>
                  );
                })}
             </div>
          </div>

          {/* Info Adicional */}
          <div className="bg-[#181a22] rounded-xl p-3.5 space-y-2.5 border border-[#262833]">
            <div className="flex justify-between items-center text-[10px] Oswald uppercase">
              <span className="text-zinc-400 font-bold">Data de Cadastro</span>
              <span className="text-white font-bold">
                {player.created_at ? new Date(player.created_at).toLocaleDateString('pt-BR') : 'Não informado'}
              </span>
            </div>
            <div className="flex justify-between items-center text-[10px] Oswald uppercase pt-2 border-t border-[#262833]">
              <span className="text-zinc-400 font-bold">Altura do Jogador</span>
              <span className="text-white font-bold">{player.height_cm ? `${player.height_cm} cm` : 'Não informado'}</span>
            </div>
          </div>
        </div>

        {/* Ações Rápidas no Rodapé */}
        <div className="p-4 border-t border-[#262833] bg-[#17181f]/90 shrink-0 space-y-2">
          <Button 
            variant="outline" 
            className="w-full h-10 border-[#262833] bg-[#181a22] text-[10px] font-black uppercase tracking-wider text-white hover:bg-[#1f212c] hover:border-[#ff2d78]/40"
            onClick={() => onEditName(player.id, player.name)}
          >
            <Users className="w-3.5 h-3.5 mr-2 text-[#ff2d78]" /> Alterar nome
          </Button>
          <div className="grid grid-cols-2 gap-2">
            <Button 
              variant="outline" 
              className="h-10 border-[#262833] bg-[#181a22] text-[10px] font-black uppercase tracking-wider text-zinc-300 hover:text-white hover:bg-[#1f212c]"
              onClick={() => onResetPin(player.id)}
            >
              <Key className="w-3.5 h-3.5 mr-1.5 text-zinc-400" /> Reset PIN
            </Button>
            <Button 
              variant="outline" 
              className={cn(
                "h-10 border-[#262833] bg-[#181a22] text-[10px] font-black uppercase tracking-wider",
                player.active ? "text-red-400 hover:bg-red-500/10 hover:border-red-500/30" : "text-emerald-400 hover:bg-emerald-500/10 hover:border-emerald-500/30"
              )}
              onClick={() => onDeactivate(player.id, player.active)}
            >
              <UserMinus className="w-3.5 h-3.5 mr-1.5" /> {player.active ? 'Desativar' : 'Reativar'}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
