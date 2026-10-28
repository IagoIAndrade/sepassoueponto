import { useState } from "react";
import { X, Smartphone, Share, PlusSquare } from "lucide-react";
import { Button } from "@/components/ui/button";
import { usePwaInstall } from "@/hooks/use-pwa-install";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";

export function PwaInstallCard() {
  const { canInstall, isIOS, install, dismiss } = usePwaInstall();
  const [showIosInstructions, setShowIosInstructions] = useState(false);

  if (!canInstall) return null;

  const handleInstallClick = () => {
    if (isIOS) {
      setShowIosInstructions(true);
    } else {
      install();
    }
  };

  return (
    <>
      <div className="mx-4 mb-4 flex items-center justify-between bg-brand-blue border border-brand-gold/30 rounded-lg px-4 py-3 h-[70px] shadow-lg animate-in fade-in slide-in-from-top-4 duration-300">
        <div className="flex items-center gap-3 overflow-hidden">
          <div className="flex-shrink-0 w-10 h-10 bg-brand-gold/10 rounded-full flex items-center justify-center border border-brand-gold/20">
            <Smartphone className="w-5 h-5 text-brand-gold" />
          </div>
          <div className="flex flex-col min-w-0">
            <span className="text-sm font-bold text-white Oswald uppercase tracking-wider truncate">
              📱 Instalar o Vôlei
            </span>
            <span className="text-[10px] text-brand-silver/80 Oswald truncate">
              Acesso mais rápido pelo celular
            </span>
          </div>
        </div>
        
        <div className="flex items-center gap-2 flex-shrink-0 ml-2">
          <Button
            size="sm"
            onClick={handleInstallClick}
            className="h-8 bg-brand-gold hover:bg-brand-gold/90 text-brand-blue font-bold Oswald text-[11px] px-3 uppercase transition-all active:scale-95"
          >
            Instalar
          </Button>
          <button 
            onClick={dismiss}
            className="p-1 text-brand-silver/40 hover:text-white transition-colors"
            aria-label="Dispensar"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      <Dialog open={showIosInstructions} onOpenChange={setShowIosInstructions}>
        <DialogContent className="bg-brand-surface border-brand-border sm:max-w-xs p-6">
          <DialogHeader>
            <DialogTitle className="text-xl font-bold text-brand-silver Oswald uppercase text-center flex flex-col items-center gap-2">
              <Smartphone className="w-8 h-8 text-brand-gold" />
              Instalar o Vôlei no iPhone
            </DialogTitle>
            <DialogDescription className="text-brand-silver/60 text-center py-4 text-sm leading-relaxed">
              Siga estes passos para adicionar o aplicativo à sua tela de início:
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-6 py-2">
            <div className="flex items-start gap-4">
              <div className="bg-brand-gold/10 p-2 rounded-lg flex-shrink-0">
                <Share className="w-5 h-5 text-brand-gold" />
              </div>
              <div className="flex flex-col">
                <span className="text-sm font-bold text-brand-silver Oswald uppercase tracking-tight">Passo 1</span>
                <span className="text-xs text-brand-silver/70">Toque no botão Compartilhar do Safari</span>
              </div>
            </div>

            <div className="flex items-start gap-4">
              <div className="bg-brand-gold/10 p-2 rounded-lg flex-shrink-0">
                <PlusSquare className="w-5 h-5 text-brand-gold" />
              </div>
              <div className="flex flex-col">
                <span className="text-sm font-bold text-brand-silver Oswald uppercase tracking-tight">Passo 2</span>
                <span className="text-xs text-brand-silver/70">Escolha "Adicionar à Tela de Início"</span>
              </div>
            </div>

            <div className="flex items-start gap-4">
              <div className="bg-brand-gold/10 p-2 rounded-lg flex-shrink-0">
                <div className="w-5 h-5 flex items-center justify-center font-bold text-brand-gold">3</div>
              </div>
              <div className="flex flex-col">
                <span className="text-sm font-bold text-brand-silver Oswald uppercase tracking-tight">Passo 3</span>
                <span className="text-xs text-brand-silver/70">Confirme em "Adicionar"</span>
              </div>
            </div>
          </div>

          <DialogFooter className="mt-6">
            <Button
              onClick={() => setShowIosInstructions(false)}
              className="w-full bg-brand-gold text-brand-blue font-bold Oswald uppercase hover:bg-brand-gold/90 h-12"
            >
              Entendi
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
