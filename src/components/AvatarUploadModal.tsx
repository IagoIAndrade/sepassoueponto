import React, { useState, useCallback, useRef } from "react";
import { VisuallyHidden } from "@radix-ui/react-visually-hidden";
import Cropper from "react-easy-crop";
import imageCompression from "browser-image-compression";
import { supabase } from "@/integrations/supabase/client";
import { useServerFn } from "@tanstack/react-start";
import { get_avatar_upload_url, confirm_avatar_upload } from "@/lib/avatars.functions";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { Camera, Upload, Check, X, Loader2, Image as ImageIcon } from "lucide-react";
import { cn } from "@/lib/utils";

interface AvatarUploadModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  playerId: string;
  onSuccess?: () => void;
  mandatory?: boolean;
}

export function AvatarUploadModal({ open, onOpenChange, playerId, onSuccess, mandatory = false }: AvatarUploadModalProps) {
  const [image, setImage] = useState<string | null>(null);
  const [crop, setCrop] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [croppedAreaPixels, setCroppedAreaPixels] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  
  const fileInputRef = useRef<HTMLInputElement>(null);
  const getUploadUrl = useServerFn(get_avatar_upload_url);
  const confirmUpload = useServerFn(confirm_avatar_upload);

  const onCropComplete = useCallback((_croppedArea: any, croppedAreaPixels: any) => {
    setCroppedAreaPixels(croppedAreaPixels);
  }, []);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      const reader = new FileReader();
      reader.addEventListener("load", () => {
        setImage(reader.result as string);
      });
      reader.readAsDataURL(e.target.files[0]);
    }
  };

  const getCroppedImg = async (imageSrc: string, pixelCrop: any): Promise<Blob | null> => {
    const canvas = document.createElement("canvas");
    const img = new Image();
    img.src = imageSrc;
    await new Promise((resolve) => {
      img.onload = resolve;
    });

    canvas.width = pixelCrop.width;
    canvas.height = pixelCrop.height;
    const ctx = canvas.getContext("2d");

    if (!ctx) return null;

    ctx.drawImage(
      img,
      pixelCrop.x,
      pixelCrop.y,
      pixelCrop.width,
      pixelCrop.height,
      0,
      0,
      pixelCrop.width,
      pixelCrop.height
    );

    return new Promise((resolve) => {
      canvas.toBlob((blob) => {
        resolve(blob);
      }, "image/jpeg", 0.9);
    });
  };

  const handleUpload = async () => {
    if (!image || !croppedAreaPixels) return;
    setLoading(true);
    try {
      const croppedBlob = await getCroppedImg(image, croppedAreaPixels);
      if (!croppedBlob) throw new Error("Falha ao gerar imagem cortada");
      
      // Compress
      const options = {
        maxSizeMB: 0.2,
        maxWidthOrHeight: 800,
        useWebWorker: true
      };
      
      // browser-image-compression espera um File, Blob também serve
      const compressedFile = await imageCompression(croppedBlob as File, options);

      // 1. Get Authorized Upload URL
      const { signedUrl, token, path: objectPath } = await getUploadUrl({ 
        data: { 
          fileType: compressedFile.type,
          fileSize: compressedFile.size
        } 
      });

      // 2. Upload using signed URL
      const response = await fetch(signedUrl, {
        method: 'PUT',
        body: compressedFile,
        headers: {
          'Content-Type': compressedFile.type,
          'x-upsert': 'true'
        }
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || "Falha no upload via URL assinada");
      }

      // 3. Confirm with server
      await confirmUpload({ data: { path: objectPath } });

      toast.success("Foto de perfil enviada para aprovação!");
      onSuccess?.();
      setImage(null);
      if (!mandatory) onOpenChange(false);
    } catch (e: any) {
      console.error("Erro completo no upload:", e);
      
      let errorMsg = "Erro ao enviar foto";
      if (e.message?.includes("row-level security")) {
        errorMsg = "Erro de permissão no servidor (RLS)";
      } else if (e.message) {
        errorMsg += ": " + e.message;
      }

      toast.error(errorMsg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={mandatory ? () => {} : onOpenChange}>
      <DialogContent className={cn("bg-brand-surface border-brand-border text-brand-white sm:max-w-[500px] p-0 overflow-hidden", mandatory && "[&>button]:hidden")}>
        <DialogHeader className="p-6 pb-2">
          <DialogTitle className="font-oswald text-2xl uppercase tracking-tight flex items-center gap-2">
            <Camera className="w-6 h-6 text-brand-gold" />
            {mandatory ? "Foto Obrigatória" : "Alterar Foto"}
          </DialogTitle>
          <DialogDescription className="text-brand-silver">
            {mandatory 
              ? "Para continuar utilizando o sistema, você precisa definir uma foto de perfil real para identificação nas listas e times."
              : "Escolha uma foto clara onde seu rosto esteja visível."}
          </DialogDescription>
        </DialogHeader>

        <div className="p-6 pt-0 space-y-6">
          {!image ? (
            <div 
              onClick={() => fileInputRef.current?.click()}
              className="group relative flex flex-col items-center justify-center border-2 border-dashed border-brand-border rounded-xl aspect-square bg-brand-blue/20 hover:bg-brand-blue/30 hover:border-brand-gold/50 cursor-pointer transition-all duration-300"
            >
              <div className="flex flex-col items-center gap-3">
                <div className="w-16 h-16 rounded-full bg-brand-gold/10 flex items-center justify-center text-brand-gold group-hover:scale-110 transition-transform">
                  <Upload className="w-8 h-8" />
                </div>
                <div className="text-center">
                  <p className="font-bold text-sm uppercase tracking-wider text-brand-white">Selecionar Foto</p>
                  <p className="text-[10px] text-brand-silver mt-1">JPG ou PNG, máx. 5MB</p>
                </div>
              </div>
              <input 
                type="file" 
                ref={fileInputRef} 
                onChange={handleFileChange} 
                className="hidden" 
                accept="image/*" 
              />
            </div>
          ) : (
            <div className="space-y-4">
              <div className="relative aspect-square rounded-xl overflow-hidden border border-brand-border bg-black">
                <Cropper
                  image={image}
                  crop={crop}
                  zoom={zoom}
                  aspect={1}
                  onCropChange={setCrop}
                  onCropComplete={onCropComplete}
                  onZoomChange={setZoom}
                />
              </div>
              
              <div className="space-y-2">
                <label className="text-[10px] font-bold uppercase text-brand-silver tracking-widest flex justify-between">
                  <span>Zoom</span>
                  <span className="text-brand-gold">{Math.round(zoom * 100)}%</span>
                </label>
                <input
                  type="range"
                  value={zoom}
                  min={1}
                  max={3}
                  step={0.1}
                  aria-labelledby="Zoom"
                  onChange={(e) => setZoom(Number(e.target.value))}
                  className="w-full accent-brand-gold h-1.5 bg-brand-border rounded-lg appearance-none cursor-pointer"
                />
              </div>

              <div className="flex gap-2 pt-2">
                <Button 
                  variant="outline" 
                  onClick={() => setImage(null)}
                  className="flex-1 border-brand-border hover:bg-red-500/10 hover:text-red-400"
                >
                  <X className="w-4 h-4 mr-2" /> Alterar arquivo
                </Button>
                <Button 
                  onClick={handleUpload}
                  disabled={loading}
                  className="flex-1 bg-brand-gold text-brand-blue font-bold hover:bg-brand-gold/90"
                >
                  {loading ? (
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  ) : (
                    <Check className="w-4 h-4 mr-2" />
                  )}
                  Confirmar Foto
                </Button>
              </div>
            </div>
          )}
        </div>

        {mandatory && (
          <div className="bg-brand-gold/10 p-4 border-t border-brand-gold/20 flex items-start gap-3">
            <div className="p-1.5 bg-brand-gold/20 rounded-full text-brand-gold shrink-0 mt-0.5">
              <ImageIcon className="w-3.5 h-3.5" />
            </div>
            <p className="text-[10px] text-brand-gold leading-relaxed">
              <strong>Nota:</strong> Sua foto passará por aprovação administrativa. Fotos de paisagens, objetos ou celebridades serão recusadas.
            </p>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
