import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { get_avatar_signed_url, get_avatar_upload_url, confirm_avatar_upload, player_remove_avatar } from "@/lib/avatars.functions";
import { cn } from "@/lib/utils";
import { useState, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Camera, Trash2, Loader2, Upload } from "lucide-react";
import { toast } from "sonner";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { supabase } from "@/integrations/supabase/client";

interface PlayerAvatarEditableProps {
  path?: string | null;
  name: string;
  className?: string;
  size?: "xs" | "sm" | "md" | "lg" | "xl";
}

export function PlayerAvatarEditable({ path, name, className, size = "lg" }: PlayerAvatarEditableProps) {
  const qc = useQueryClient();
  const getUrl = useServerFn(get_avatar_signed_url);
  const getUploadUrl = useServerFn(get_avatar_upload_url);
  const confirmUpload = useServerFn(confirm_avatar_upload);
  const removeAvatar = useServerFn(player_remove_avatar);

  const [isUploading, setIsUploading] = useState(false);
  const [isRemoving, setIsRemoving] = useState(false);
  const [removeConfirmOpen, setRemoveConfirmOpen] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const { data: url, refetch: refetchUrl } = useQuery({
    queryKey: ["avatar-url", path],
    queryFn: async () => {
      if (!path) return null;
      try {
        const res = await getUrl({ data: { path } });
        return res.url;
      } catch (e) {
        console.error("Error fetching avatar url:", e);
        return null;
      }
    },
    enabled: !!path,
    staleTime: 1000 * 60 * 50, // 50 min
  });

  const sizeClasses = {
    xs: "h-5 w-5 text-[8px]",
    sm: "h-6 w-6 text-[10px]",
    md: "h-10 w-10 text-xs",
    lg: "h-24 w-24 text-2xl",
    xl: "h-32 w-32 text-4xl",
  };

  const initials = (name || "")
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map((n) => n[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith("image/")) {
      toast.error("Por favor, selecione apenas imagens (JPEG, PNG, WEBP).");
      return;
    }

    setIsUploading(true);
    const loadingToast = toast.loading("Preparando envio de foto...");

    try {
      // 1. Validar formato e tamanho
      const allowedTypes = ["image/jpeg", "image/jpg", "image/png", "image/webp"];
      if (!allowedTypes.includes(file.type)) {
        throw new Error("Formato não suportado. Use JPEG, PNG ou WEBP.");
      }

      if (file.size > 10 * 1024 * 1024) {
        throw new Error("A imagem é muito grande (limite 10MB).");
      }

      // 2. Compressão opcional (opcional pois já está importado, mas vamos focar na estabilidade)
      // try {
      //   const options = { maxSizeMB: 1.5, maxWidthOrHeight: 1200, useWebWorker: true };
      //   file = await imageCompression(file, options);
      // } catch (e) { console.warn("Compression skipped", e); }

      // 3. Obter URL de upload assinado (Server Function)
      toast.loading("Obtendo autorização...", { id: loadingToast });
      const { signedUrl, token, path: objectPath } = await getUploadUrl({ 
        data: { fileType: file.type, fileSize: file.size } 
      });

      if (!signedUrl || !token) {
        throw new Error("Não foi possível obter autorização de upload.");
      }

      // 4. Upload direto para o Storage via SDK (usando a URL assinada)
      toast.loading("Enviando arquivo...", { id: loadingToast });
      
      const { error: uploadError } = await supabase.storage
        .from('player-avatars')
        .uploadToSignedUrl(objectPath, token, file, {
          upsert: true
        });

      if (uploadError) {
        console.error("[AVATAR UPLOAD] Storage error:", uploadError);
        throw new Error(uploadError.message || "Erro no servidor de arquivos.");
      }

      // 5. Confirmar no banco de dados
      toast.loading("Finalizando...", { id: loadingToast });
      const confirmRes = await confirmUpload({ data: { path: objectPath } });

      if (!confirmRes.ok) {
        throw new Error("Falha ao vincular a foto ao seu perfil.");
      }

      toast.success("Foto atualizada com sucesso!", { id: loadingToast });
      
      await qc.invalidateQueries({ queryKey: ["me"] });
      await qc.invalidateQueries({ queryKey: ["event-full"] });
      
      // Delay para o storage propagar a nova imagem antes do refetch do signed url
      setTimeout(() => refetchUrl(), 1000);
      
    } catch (err: any) {
      console.error("[AVATAR UPLOAD] Full error:", err);
      const msg = err.message || "Tente novamente";
      toast.error(msg === "not_authenticated" ? "Sua sessão expirou. Entre novamente." : msg, { id: loadingToast });
    } finally {
      setIsUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }

  };

  const handleRemove = async () => {
    setIsRemoving(true);
    try {
      await removeAvatar();
      toast.success("Foto removida.");
      await qc.invalidateQueries({ queryKey: ["me"] });
      await qc.invalidateQueries({ queryKey: ["event-full"] });
      setRemoveConfirmOpen(false);
    } catch (err: any) {
      toast.error("Erro ao remover foto.");
    } finally {
      setIsRemoving(false);
    }
  };

  return (
    <div className="flex flex-col items-center gap-4">
      <div className="relative group">
        <Avatar className={cn(sizeClasses[size], "border-2 border-brand-gold bg-brand-surface/50 shadow-xl shadow-black/40")}>
          <AvatarImage src={url || undefined} alt={name} className="object-cover" />
          <AvatarFallback className="bg-brand-blue text-brand-gold font-bold font-oswald uppercase">
            {initials || "?"}
          </AvatarFallback>
        </Avatar>
        
        {isUploading && (
          <div className="absolute inset-0 bg-brand-blue/60 rounded-full flex items-center justify-center backdrop-blur-[2px]">
            <Loader2 className="w-8 h-8 text-brand-gold animate-spin" />
          </div>
        )}
      </div>

      <div className="flex flex-col gap-2 w-full max-w-[200px]">
        <input
          type="file"
          accept="image/jpeg,image/png,image/webp"
          className="hidden"
          ref={fileInputRef}
          onChange={handleFileChange}
          disabled={isUploading}
        />
        
        <Button 
          onClick={() => fileInputRef.current?.click()}
          disabled={isUploading}
          className="w-full bg-brand-gold text-brand-blue hover:bg-brand-gold/90 Oswald font-bold uppercase h-10 gap-2"
        >
          {path ? <Upload className="w-4 h-4" /> : <Camera className="w-4 h-4" />}
          {path ? "Trocar Foto" : "Adicionar Foto"}
        </Button>

        {/* {path && (
          <Button 
            variant="outline"
            onClick={() => setRemoveConfirmOpen(true)}
            disabled={isUploading || isRemoving}
            className="w-full border-red-500/30 text-red-400 hover:bg-red-500/10 Oswald font-bold uppercase h-10 gap-2"
          >
            <Trash2 className="w-4 h-4" />
            Remover Foto
          </Button>
        )} */}
      </div>

      <AlertDialog open={removeConfirmOpen} onOpenChange={setRemoveConfirmOpen}>
        <AlertDialogContent className="bg-brand-blue border-brand-border text-brand-white">
          <AlertDialogHeader>
            <AlertDialogTitle className="Oswald uppercase text-brand-gold">Remover foto de perfil?</AlertDialogTitle>
            <AlertDialogDescription className="text-brand-silver text-xs">
              Sua foto será removida e suas iniciais passarão a ser exibidas em todos os locais do sistema.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="bg-transparent border-brand-border text-brand-silver hover:text-brand-white">Cancelar</AlertDialogCancel>
            <AlertDialogAction 
              onClick={handleRemove}
              className="bg-red-600 text-white hover:bg-red-700 Oswald font-bold uppercase"
              disabled={isRemoving}
            >
              {isRemoving ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
              Remover
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}