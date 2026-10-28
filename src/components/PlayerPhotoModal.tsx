import { useEffect, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { User as UserIcon } from "lucide-react";
import { resolveAvatarPublicUrl } from "@/components/PlayerAvatar";

interface PlayerPhotoModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  player: {
    id: string;
    name: string;
    avatar_path?: string | null;
    avatar_url?: string | null;
    url?: string | null;
    phone?: string | null;
    group_name?: string | null;
    position?: string | null;
  } | null;
}

function resolvePhotoUrl(player: PlayerPhotoModalProps["player"]): string | null {
  if (!player) return null;

  for (const field of [player.avatar_url, player.url, player.avatar_path]) {
    const resolved = resolveAvatarPublicUrl(field);
    if (resolved) return resolved;
  }

  return null;
}

export function PlayerPhotoModal({ open, onOpenChange, player }: PlayerPhotoModalProps) {
  const [imgError, setImgError] = useState(false);

  useEffect(() => {
    setImgError(false);
  }, [player?.id, player?.avatar_path, player?.avatar_url, player?.url]);

  if (!player) return null;

  const resolvedUrl = resolvePhotoUrl(player);
  const showImage = !!resolvedUrl && !imgError;

  const initials = (player.name || "")
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map((n) => n[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent 
        className="z-[200] w-[calc(100vw-32px)] max-w-[420px] max-h-[90dvh] overflow-y-auto p-5 border border-[var(--card-border)] bg-[var(--bg)] shadow-2xl rounded-2xl gap-0 mx-auto transition-colors"
        aria-describedby="player-photo-description"
      >
        <DialogHeader className="mb-4 text-left">
          <DialogTitle className="text-sm font-black text-[var(--text)] Oswald uppercase tracking-widest mt-0.5">
            {player.name}
          </DialogTitle>
          <DialogDescription id="player-photo-description" className="sr-only">
            Visualização do perfil de {player.name}
          </DialogDescription>
        </DialogHeader>

        <div className="w-full aspect-[4/5] relative overflow-hidden rounded-xl border border-[var(--card-border)] bg-[color-mix(in_srgb,var(--card-bg)_90%,black_10%)] flex items-center justify-center">
          {showImage ? (
            <img 
              src={resolvedUrl}
              alt={`Foto de perfil de ${player.name}`}
              className="w-full h-full object-cover object-center transition-all duration-200"
              onError={() => setImgError(true)}
              loading="eager"
            />
          ) : (
            <div className="flex flex-col items-center justify-center w-full h-full bg-[color-mix(in_srgb,var(--card-bg)_70%,black_30%)] p-6 text-center select-none">
              <div className="w-24 h-24 rounded-full border-2 border-[var(--card-border)] bg-[var(--card-bg)] flex items-center justify-center shadow-lg mb-3">
                {initials ? (
                  <span className="text-3xl font-black text-[var(--accent-neon)] Oswald tracking-wider">
                    {initials}
                  </span>
                ) : (
                  <UserIcon className="w-12 h-12 text-[var(--text-muted)]" />
                )}
              </div>
              <p className="text-xs font-bold uppercase text-[var(--text-muted)] Oswald tracking-wider">
                Sem foto cadastrada
              </p>
            </div>
          )}
        </div>

        <div className="mt-4 flex flex-col items-center text-center space-y-1">
          <h3 className="text-xl font-black text-[var(--text)] Oswald uppercase tracking-tight">
            {player.name}
          </h3>
          {player.position && player.position !== "Sem posição definida" && (
            <span className="text-xs font-bold Oswald uppercase tracking-widest text-[var(--accent-neon)]">
              {player.position}
            </span>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
