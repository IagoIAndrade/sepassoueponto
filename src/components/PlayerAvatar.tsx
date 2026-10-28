import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { get_avatar_signed_url } from "@/lib/avatars.functions";
import { cn } from "@/lib/utils";

export interface PlayerAvatarProps {
  path?: string | null;
  url?: string | null;
  avatarUrl?: string | null;

  name: string;
  className?: string;
  size?: "xs" | "sm" | "md" | "lg" | "xl";
  imageClassName?: string;
  onClick?: (e: React.MouseEvent) => void;

  previewable?: boolean;
}

import { supabase } from "@/integrations/supabase/client";
import { useState, useEffect, useMemo } from "react";

export function resolveAvatarPublicUrl(input?: string | null): string | null {
  if (!input) return null;
  const clean = input.trim();
  if (!clean || clean === "null" || clean === "undefined") return null;

  // Preservar URLs absolutas válidas
  if (
    clean.startsWith("http://") ||
    clean.startsWith("https://") ||
    clean.startsWith("data:") ||
    clean.startsWith("blob:")
  ) {
    return clean;
  }

  // Caminho relativo no bucket player-avatars: remove barras iniciais e prefixos duplicados
  const cleanPath = clean
    .replace(/^\/+/, "")
    .replace(/^player-avatars\//, "")
    .replace(/^avatars\//, "");

  if (!cleanPath || cleanPath === "null" || cleanPath === "undefined") {
    return null;
  }

  const { data } = supabase.storage
    .from("player-avatars")
    .getPublicUrl(cleanPath);

  return data?.publicUrl || null;
}

export function PlayerAvatar({ path, url: initialUrl, avatarUrl, name, className, size = "md", imageClassName, onClick, previewable }: PlayerAvatarProps) {
  const getUrl = useServerFn(get_avatar_signed_url);
  const [imgError, setImgError] = useState(false);

  const candidate = initialUrl || avatarUrl || path || null;
  const resolvedUrl = useMemo(() => resolveAvatarPublicUrl(candidate), [candidate]);

  useEffect(() => {
    setImgError(false);
  }, [resolvedUrl, candidate]);

  const { data: finalUrl } = useQuery({
    queryKey: ["avatar-url", candidate, resolvedUrl],
    queryFn: async () => {
      if (resolvedUrl) return resolvedUrl;
      const cleanPath = (path || candidate)?.trim();
      if (!cleanPath || cleanPath === "undefined" || cleanPath === "null") return null;
      try {
        const res = await getUrl({ data: { path: cleanPath } });
        return res?.url || null;
      } catch {
        return null;
      }
    },
    enabled: !resolvedUrl && !!candidate && candidate !== "undefined" && candidate !== "null",
    initialData: resolvedUrl || undefined,
    staleTime: 1000 * 60 * 50,
    refetchOnWindowFocus: false,
  });

  const url = resolvedUrl || finalUrl;


  const sizeClasses = {
    xs: "h-5 w-5 text-[8px]",
    sm: "h-6 w-6 text-[10px]",
    md: "h-10 w-10 text-xs",
    lg: "h-14 w-14 text-lg",
    xl: "h-16 w-16 text-xl",
  };

  const initials = (name || "")
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map((n) => n.charAt(0))
    .join("")
    .slice(0, 2)
    .toUpperCase();

  const rawPath = path?.trim() || null;
  const effectivePath = rawPath && rawPath !== "null" && rawPath !== "undefined" ? rawPath : null;
  const rawDirectUrl = (initialUrl || avatarUrl)?.trim() || null;
  const directUrl = rawDirectUrl && rawDirectUrl !== "null" && rawDirectUrl !== "undefined"
    ? rawDirectUrl
    : null;

  const isClickable = Boolean(onClick || previewable);
  const hasPhoto = !imgError && Boolean(url || effectivePath || directUrl);

  return (
    <Avatar 
      className={cn(
        sizeClasses[size], 
        "border border-brand-border bg-brand-surface/50 transition-all", 
        isClickable && hasPhoto && "cursor-pointer hover:ring-2 hover:ring-brand-gold/50 active:scale-95 hover:scale-105 shadow-md",
        className
      )}
      onClick={isClickable && hasPhoto ? (e) => {
        e.stopPropagation();
        e.preventDefault();
        if (onClick) onClick(e);
      } : undefined}
      tabIndex={isClickable && hasPhoto ? 0 : undefined}
      onKeyDown={isClickable && hasPhoto ? (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          e.stopPropagation();
          if (onClick) onClick(e as any);
        }
      } : undefined}
    >
      {url && !imgError && (
        <AvatarImage 
          src={url} 
          alt={`Foto de perfil de ${name}`} 
          className={cn("object-cover", imageClassName)} 
          onError={() => setImgError(true)}
        />
      )}
      <AvatarFallback className="bg-brand-blue text-brand-gold font-bold font-oswald uppercase">
        {initials || "?"}
      </AvatarFallback>
    </Avatar>
  );
}