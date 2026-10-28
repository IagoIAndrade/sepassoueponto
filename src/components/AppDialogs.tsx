import * as React from "react";
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
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { Loader2 } from "lucide-react";

/**
 * ConfirmDialog component for destructive or important actions.
 */
interface ConfirmDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: () => Promise<void> | void;
  title: string;
  description: string;
  confirmText?: string;
  cancelText?: string;
  variant?: "default" | "destructive";
  isLoading?: boolean;
}

export function AppConfirmDialog({
  open,
  onOpenChange,
  onConfirm,
  title,
  description,
  confirmText = "Confirmar",
  cancelText = "Cancelar",
  variant = "default",
  isLoading = false,
}: ConfirmDialogProps) {
  const handleConfirm = async (e: React.MouseEvent) => {
    e.preventDefault();
    await onConfirm();
  };

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent className="bg-brand-surface border-brand-border text-brand-white">
        <AlertDialogHeader>
          <AlertDialogTitle className="font-oswald text-xl uppercase tracking-tight">
            {title}
          </AlertDialogTitle>
          <AlertDialogDescription className="text-brand-silver/80">
            {description}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={isLoading} className="border-brand-border hover:bg-brand-surface/50 text-brand-white uppercase font-bold text-[10px]">
            {cancelText}
          </AlertDialogCancel>
          <AlertDialogAction
            onClick={handleConfirm}
            disabled={isLoading}
            className={cn(
              "uppercase font-bold text-[10px]",
              variant === "destructive" ? "bg-red-600 hover:bg-red-700 text-white" : "bg-brand-gold hover:bg-brand-gold/90 text-brand-blue"
            )}
          >
            {isLoading ? <Loader2 className="h-3 w-3 animate-spin mr-2" /> : null}
            {confirmText}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

/**
 * PromptDialog component for quick data entry (like renaming).
 */
interface PromptDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: (value: string) => Promise<void> | void;
  title: string;
  description: string;
  label: string;
  defaultValue?: string;
  placeholder?: string;
  confirmText?: string;
  cancelText?: string;
  isLoading?: boolean;
}

export function AppPromptDialog({
  open,
  onOpenChange,
  onConfirm,
  title,
  description,
  label,
  defaultValue = "",
  placeholder = "",
  confirmText = "Salvar",
  cancelText = "Cancelar",
  isLoading = false,
}: PromptDialogProps) {
  const [value, setValue] = React.useState(defaultValue);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (open) {
      setValue(defaultValue);
      setError(null);
    }
  }, [open, defaultValue]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = value.trim();
    if (!trimmed) {
      setError("Este campo é obrigatório.");
      return;
    }
    await onConfirm(trimmed);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent aria-describedby="prompt-dialog-desc" className="bg-brand-surface border-brand-border text-brand-white sm:max-w-[425px]">
        <form onSubmit={handleSubmit} className="space-y-4">
          <DialogHeader>
            <DialogTitle className="font-oswald text-xl uppercase tracking-tight">{title}</DialogTitle>
            <DialogDescription id="prompt-dialog-desc" className="text-brand-silver/80">{description}</DialogDescription>
          </DialogHeader>
          
          <div className="space-y-2">
            <label className="text-[10px] font-bold uppercase text-brand-gold tracking-widest">{label}</label>
            <Input
              value={value}
              onChange={(e) => {
                setValue(e.target.value);
                if (error) setError(null);
              }}
              placeholder={placeholder}
              autoFocus
              className="bg-brand-blue/30 border-brand-border focus-visible:ring-brand-gold/30 text-brand-white"
              disabled={isLoading}
            />
            {error && <p className="text-[10px] text-red-500 font-medium">{error}</p>}
          </div>

          <DialogFooter className="flex-row justify-end gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={isLoading}
              className="border-brand-border hover:bg-brand-surface/50 text-brand-white uppercase font-bold text-[10px]"
            >
              {cancelText}
            </Button>
            <Button
              type="submit"
              disabled={isLoading}
              className="bg-brand-gold hover:bg-brand-gold/90 text-brand-blue uppercase font-bold text-[10px]"
            >
              {isLoading ? <Loader2 className="h-3 w-3 animate-spin mr-2" /> : null}
              {confirmText}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/**
 * HardConfirmDialog for permanent deletions (requires typing a word).
 */
interface HardConfirmDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: () => Promise<void> | void;
  title: string;
  description: string;
  confirmationWord: string;
  isLoading?: boolean;
}

export function AppHardConfirmDialog({
  open,
  onOpenChange,
  onConfirm,
  title,
  description,
  confirmationWord,
  isLoading = false,
}: HardConfirmDialogProps) {
  const [input, setInput] = React.useState("");

  React.useEffect(() => {
    if (open) setInput("");
  }, [open]);

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent className="bg-brand-surface border-brand-border text-brand-white">
        <AlertDialogHeader>
          <AlertDialogTitle className="font-oswald text-xl uppercase tracking-tight text-red-500">
            {title}
          </AlertDialogTitle>
          <AlertDialogDescription className="text-brand-silver/80">
            {description}
          </AlertDialogDescription>
          <div className="mt-4 space-y-2">
            <p className="text-[10px] font-bold uppercase text-brand-silver/60">Digite {confirmationWord.toUpperCase()} para confirmar:</p>
            <Input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              className="bg-red-500/5 border-red-500/20 focus-visible:ring-red-500/30 text-brand-white"
              placeholder={confirmationWord.toUpperCase()}
            />
          </div>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={isLoading} className="border-brand-border hover:bg-brand-surface/50 text-brand-white uppercase font-bold text-[10px]">
            Cancelar
          </AlertDialogCancel>
          <AlertDialogAction
            onClick={async (e) => {
              e.preventDefault();
              await onConfirm();
            }}
            disabled={isLoading || input.toUpperCase() !== confirmationWord.toUpperCase()}
            className="bg-red-600 hover:bg-red-700 text-white uppercase font-bold text-[10px]"
          >
            {isLoading ? <Loader2 className="h-3 w-3 animate-spin mr-2" /> : null}
            Excluir permanentemente
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
