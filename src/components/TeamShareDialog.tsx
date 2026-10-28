import React, { useRef, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { 
  Share2, 
  Image as ImageIcon, 
  FileText, 
  Copy, 
  Download, 
  Loader2,
  ChevronLeft
} from "lucide-react";
import { toast } from "sonner";
import { useServerFn } from "@tanstack/react-start";
import { get_avatar_signed_url } from "@/lib/avatars.functions";
import { 
  imageUrlToDataUrl, 
  getFriendlyGroupName, 
  renderTeamsShareCanvas,
  generateTeamsPDFFromImage
} from "@/lib/team-share-utils";
import { cn } from "@/lib/utils";

interface PlayerData {
  id: string; // registration_id
  player_id: string;
  player_name: string;
  primary_position: string | null;
  avatar_url?: string | null;
}

interface TeamData {
  team_number: number;
  players: PlayerData[];
}

interface TeamShareDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  teams: TeamData[];
  groupName?: string;
  eventDate?: string;
}

/**
 * Shared layout component for image/PDF export
 * Fixed size: 1080x1350
 */
function TeamExportLayout({ 
  teams, 
  friendlyGroupName, 
  formattedDate, 
  preparedAvatars 
}: { 
  teams: TeamData[], 
  friendlyGroupName: string, 
  formattedDate: string,
  preparedAvatars: Record<string, string | null>
}) {
  const getInitials = (name: string) => {
    return (name || "")
      .trim()
      .split(/\s+/)
      .filter(Boolean)
      .map((n) => n[0])
      .join("")
      .slice(0, 2)
      .toUpperCase();
  };

  const normalizeName = (name: string) => {
    return (name || "").trim().replace(/\s+/g, ' ');
  };

  return (
    <div 
      id="team-export-container"
      data-export-root
      className="flex flex-col bg-[#0B0B0F] text-white overflow-hidden Oswald"
      style={{ 
        width: '1080px', 
        height: '1350px',
        padding: '40px 48px',
        boxSizing: 'border-box',
        display: 'grid',
        gridTemplateRows: '160px 1fr 1fr 1fr 50px',
        gap: '16px'
      }}
    >
      {/* Header - Even more compact */}
      <div className="flex flex-col items-center justify-center text-center">
        <h1 className="text-[60px] font-black uppercase tracking-tighter leading-none m-0">
          SE PASSOU, <span className="text-[#F4149C]">É PONTO</span>
        </h1>
        <div className="flex items-center gap-4 mt-3">
          <div className="h-[2px] w-12 bg-[#F4149C]"></div>
          <h2 className="text-[32px] font-black uppercase tracking-[0.1em] m-0">
            TIMES • <span className="text-[#F4149C]">{friendlyGroupName}</span>
          </h2>
          <div className="h-[2px] w-12 bg-[#F4149C]"></div>
        </div>
        <div className="text-[18px] uppercase font-bold tracking-[0.2em] text-[#A1A1AA] mt-1.5">
          {formattedDate}
        </div>
      </div>

      {/* Teams - Controlled height cards */}
      {teams.map((team, idx) => (
        <div 
          key={idx} 
          data-export-team
          className="bg-[#111111] rounded-3xl border border-[#2A2A2E] px-8 py-5 flex flex-col justify-between"
          style={{ height: '310px' }}
        >
          <div className="flex items-center gap-6 mb-3 shrink-0">
            <div className="bg-[#F4149C] text-white font-black text-[26px] px-6 py-1.5 rounded-xl skew-x-[-10deg] leading-none">
              TIME {team.team_number}
            </div>
            <div className="flex-1 h-[1px] bg-white/10"></div>
            <div className="text-[#A1A1AA] uppercase font-bold text-xs tracking-widest">
              {team.players.length} JOGADORES
            </div>
          </div>

          <div className="grid grid-cols-2 grid-rows-3 gap-x-8 gap-y-3 flex-1">
            {team.players.map((player) => (
              <div key={player.id} className="flex items-center gap-4 min-h-0">
                {/* Avatar Container - Controlled size */}
                <div 
                  className="w-[54px] h-[54px] rounded-full shrink-0 overflow-hidden border-[3px] border-[#F4149C] bg-[#18181B] flex items-center justify-center"
                >
                  {preparedAvatars[player.id] ? (
                    <img 
                      src={preparedAvatars[player.id]!} 
                      alt="" 
                      className="w-full h-full object-cover" 
                    />
                  ) : (
                    <span className="text-[22px] font-black text-[#F4149C]">
                      {getInitials(player.player_name)}
                    </span>
                  )}
                </div>
                
                {/* Name - Controlled font size and line height */}
                <div className="flex-1 min-w-0">
                  <p className="text-[22px] font-black uppercase leading-[1.05] break-words text-white line-clamp-2">
                    {normalizeName(player.player_name)}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      ))}

      {/* Footer - Compact */}
      <div className="flex items-center justify-center border-t border-white/5">
        <p className="text-[16px] uppercase font-bold tracking-[0.4em] text-[#A1A1AA] opacity-50">
          GERADO PELO SE PASSOU, É PONTO
        </p>
      </div>
    </div>
  );
}

export function TeamShareDialog({ open, onOpenChange, teams, groupName, eventDate }: TeamShareDialogProps) {
  const [view, setView] = useState<'menu' | 'image-preview' | 'pdf-preview'>('menu');
  const [generating, setGenerating] = useState(false);
  const [exportImage, setExportImage] = useState<string | null>(null);
  const [preparedAvatars, setPreparedAvatars] = useState<Record<string, string | null>>({});
  const exportRef = useRef<HTMLDivElement>(null);
  const getAvatarUrl = useServerFn(get_avatar_signed_url);

  const friendlyGroupName = getFriendlyGroupName(groupName);
  const formattedDate = eventDate ? new Date(eventDate + "T12:00:00").toLocaleDateString('pt-BR') : "";

  const prepareShareData = async () => {
    setGenerating(true);
    const avatars: Record<string, string | null> = {};
    const allPlayers = teams.flatMap(t => t.players);
    
    await Promise.allSettled(allPlayers.map(async (p) => {
      if (p.avatar_url) {
        try {
          const { url } = await getAvatarUrl({ data: { path: p.avatar_url } });
          const dataUrl = url ? await imageUrlToDataUrl(url) : null;
          avatars[p.id] = dataUrl;
        } catch (e) {
          avatars[p.id] = null;
        }
      } else {
        avatars[p.id] = null;
      }
    }));
    
    setPreparedAvatars(avatars);
    
    // Tiny delay to ensure React renders the hidden export layout with the new avatars
    await new Promise(resolve => setTimeout(resolve, 200));
    
    if (exportRef.current) {
      const exportRoot = exportRef.current.querySelector('[data-export-root]') as HTMLElement;
      if (exportRoot) {
        const teamNodes = exportRoot.querySelectorAll('[data-export-team]');
        const totalPlayers = teams.reduce((acc, t) => acc + t.players.length, 0);

        console.log('[TeamExport] Validation:', {
          teamCount: teamNodes.length,
          playerCount: totalPlayers,
          clientWidth: exportRoot.clientWidth,
          clientHeight: exportRoot.clientHeight,
          scrollWidth: exportRoot.scrollWidth,
          scrollHeight: exportRoot.scrollHeight,
        });

        // Validation against canvas limits
        if (exportRoot.scrollHeight > exportRoot.clientHeight) {
          console.error('[TeamExport] ERRO: conteúdo maior que o canvas', {
            scrollHeight: exportRoot.scrollHeight,
            clientHeight: exportRoot.clientHeight
          });
          toast.error("Erro no layout: O conteúdo ultrapassa o tamanho da imagem.");
          setGenerating(false);
          return;
        }

        const rootRect = exportRoot.getBoundingClientRect();
        let allVisible = true;
        teamNodes.forEach((team, idx) => {
          const rect = team.getBoundingClientRect();
          if (rect.bottom > rootRect.bottom + 1) { // 1px margin for float errors
            allVisible = false;
            console.error(`[TeamExport] Time ${idx + 1} cortado!`, {
              teamBottom: rect.bottom,
              rootBottom: rootRect.bottom
            });
          }
        });

        if (!allVisible) {
          toast.error("Erro no layout: Alguns times estão fora da área visível.");
          setGenerating(false);
          return;
        }
      }

      const dataUrl = await renderTeamsShareCanvas(exportRef.current);
      setExportImage(dataUrl);
    }
    setGenerating(false);
  };

  const handleCopyText = () => {
    if (teams.every(t => t.players.length === 0)) return;
    
    let text = `🏐 *SE PASSOU, É PONTO*\n\n`;
    text += `*TIMES — ${friendlyGroupName}*\n`;
    text += `📅 ${formattedDate}\n\n`;

    teams.forEach(t => {
      if (t.players.length === 0) return;
      text += `*TIME ${t.team_number}*\n`;
      t.players.forEach((p, idx) => {
        text += `${idx + 1}. ${p.player_name.trim().replace(/\s+/g, ' ').toUpperCase()}\n`;
      });
      text += `\n`;
    });

    const finalText = text.trim();
    
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(finalText).then(() => {
        toast.success("Lista copiada! Agora é só colar no WhatsApp.");
      }).catch(() => {
        toast.error("Erro ao copiar.");
      });
    } else {
      // Fallback
      const textArea = document.createElement("textarea");
      textArea.value = finalText;
      document.body.appendChild(textArea);
      textArea.select();
      try {
        document.execCommand('copy');
        toast.success("Lista copiada! Agora é só colar no WhatsApp.");
      } catch (err) {
        toast.error("Erro ao copiar.");
      }
      document.body.removeChild(textArea);
    }
  };

  const startImageExport = async () => {
    setView('image-preview');
    await prepareShareData();
  };

  const startPdfExport = async () => {
    setView('pdf-preview');
    await prepareShareData();
  };

  const downloadImage = () => {
    if (!exportImage) return;
    const link = document.createElement('a');
    link.href = exportImage;
    const fileName = `times-${friendlyGroupName.toLowerCase().replace(/\s+/g, '-')}-${formattedDate.replace(/\//g, '-')}.png`;
    link.download = fileName;
    link.click();
  };

  const downloadPdf = async () => {
    if (!exportImage) return;
    const fileName = `times-${friendlyGroupName.toLowerCase().replace(/\s+/g, '-')}-${formattedDate.replace(/\//g, '-')}.pdf`;
    await generateTeamsPDFFromImage(exportImage, fileName);
    toast.success("PDF baixado com sucesso!");
  };

  const resetView = () => {
    setView('menu');
    setExportImage(null);
  };

  return (
    <Dialog open={open} onOpenChange={(val) => {
      if (!val) resetView();
      onOpenChange(val);
    }}>
      <DialogContent className="max-w-[440px] bg-background border-brand-border p-0 overflow-hidden">
        <DialogHeader className="p-6 border-b border-white/5">
          <DialogTitle className="text-primary Oswald font-black uppercase tracking-widest text-lg flex items-center gap-2">
            <Share2 className="w-5 h-5" /> Compartilhar Times
          </DialogTitle>
          <DialogDescription className="sr-only">Menu de compartilhamento de equipes</DialogDescription>
        </DialogHeader>

        {view === 'menu' && (
          <div className="p-6 space-y-3">
            <Button variant="outline" className="w-full h-16 justify-start gap-4 border-[#22324A] bg-[#071426]/20 hover:bg-[#071426]/40" onClick={handleCopyText}>
              <div className="w-10 h-10 rounded-full bg-emerald-500/10 flex items-center justify-center">
                <Copy className="w-5 h-5 text-emerald-500" />
              </div>
              <div className="text-left">
                <p className="text-white font-bold Oswald uppercase text-sm">Copiar Lista</p>
                <p className="text-[10px] text-[#94A3B8] Oswald uppercase font-medium">Texto pronto para WhatsApp</p>
              </div>
            </Button>

            <Button variant="outline" className="w-full h-16 justify-start gap-4 border-brand-border bg-muted/20 hover:bg-muted/40" onClick={startImageExport}>
              <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
                <ImageIcon className="w-5 h-5 text-primary" />
              </div>
              <div className="text-left">
                <p className="text-white font-bold Oswald uppercase text-sm">Gerar Imagem</p>
                <p className="text-[10px] text-brand-silver Oswald uppercase font-medium">Arte visual 1080 × 1350</p>
              </div>
            </Button>

            <Button variant="outline" className="w-full h-16 justify-start gap-4 border-brand-border bg-muted/20 hover:bg-muted/40" onClick={startPdfExport}>
              <div className="w-10 h-10 rounded-full bg-brand-silver/10 flex items-center justify-center">
                <FileText className="w-5 h-5 text-brand-silver" />
              </div>
              <div className="text-left">
                <p className="text-white font-bold Oswald uppercase text-sm">Gerar PDF</p>
                <p className="text-[10px] text-[#94A3B8] Oswald uppercase font-medium">Documento em alta qualidade</p>
              </div>
            </Button>
          </div>
        )}

        {(view === 'image-preview' || view === 'pdf-preview') && (
          <div className="flex flex-col">
            {generating ? (
              <div className="h-[400px] w-full flex flex-col items-center justify-center gap-4 text-brand-silver">
                <Loader2 className="w-10 h-10 animate-spin text-primary" />
                <p className="Oswald uppercase font-bold text-xs">
                  {view === 'image-preview' ? "Preparando imagem..." : "Preparando PDF..."}
                </p>
              </div>
            ) : (
              <div className="w-full flex flex-col">
                <div className="p-4 bg-muted/20 flex justify-center overflow-y-auto max-h-[450px] w-full">
                  {exportImage && (
                    <div className="relative w-full aspect-[4/5] max-w-[340px]">
                      <img 
                        src={exportImage} 
                        alt="Preview" 
                        className="w-full rounded shadow-2xl border border-brand-border" 
                      />
                    </div>
                  )}
                </div>
                <div className="p-6 bg-background space-y-2 border-t border-white/5">
                  <Button 
                    onClick={view === 'image-preview' ? downloadImage : downloadPdf} 
                    className="w-full bg-primary text-white font-black Oswald uppercase text-xs h-12"
                  >
                    <Download className="w-4 h-4 mr-2" /> 
                    {view === 'image-preview' ? "Baixar Imagem" : "Baixar PDF"}
                  </Button>
                  <Button 
                    variant="ghost" 
                    onClick={resetView} 
                    className="w-full text-brand-silver font-black Oswald uppercase text-xs h-10"
                  >
                    <ChevronLeft className="w-4 h-4 mr-2" /> Voltar
                  </Button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* HIDDEN EXPORT LAYOUT */}
        <div style={{ position: 'absolute', left: '-9999px', top: '-9999px', pointerEvents: 'none' }}>
          <div ref={exportRef}>
            <TeamExportLayout 
              teams={teams}
              friendlyGroupName={friendlyGroupName}
              formattedDate={formattedDate}
              preparedAvatars={preparedAvatars}
            />
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
