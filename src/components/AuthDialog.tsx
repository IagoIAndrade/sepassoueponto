import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Loader2, ArrowRight, Camera, ArrowLeft, CheckCircle2, Eye, EyeOff, ShieldAlert, X } from "lucide-react";
import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { VisuallyHidden } from "@/components/ui/visually-hidden";
import { get_current_event_full } from "@/lib/public.functions";
import { player_login, player_reset_pin } from "@/lib/players.functions";
import { friendlyError } from "@/lib/error-messages";

export function AuthDialog({
  open,
  onOpenChange,
  onSuccess,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onSuccess: (mode: "login" | "signup") => void | Promise<void>;
}) {
  const getEvent = useServerFn(get_current_event_full);
  const loginFn = useServerFn(player_login);
  const resetPinFn = useServerFn(player_reset_pin);

  const groupsQ = useQuery({
    queryKey: ["all-groups"],
    queryFn: async () => {
      const res = await getEvent({ data: { group_id: null } });
      return (res as any)?.groups || [];
    },
    staleTime: 5 * 60 * 1000
  });
  const groups = groupsQ.data || [];

  const [tab, setTab] = useState<"login" | "signup">("login");
  const [step, setStep] = useState(1);
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [phone, setPhone] = useState("");
  const [pin, setPin] = useState("");
  const [showPin, setShowPin] = useState(false);
  const [confirmPin, setConfirmPin] = useState("");
  const [selectedGroups, setSelectedGroups] = useState<string[]>([]);
  const [photo, setPhoto] = useState<{ blob: Blob; url: string; path: string } | null>(null);
  const [remember, setRemember] = useState(true);
  const [loading, setLoading] = useState(false);
  const [loadingMessage, setLoadingMessage] = useState("");

  const [needsPinReset, setNeedsPinReset] = useState(false);
  const [newPin, setNewPin] = useState("");
  const [newPin2, setNewPin2] = useState("");

  const reset = () => {
    setFirstName("");
    setLastName("");
    setPhone("");
    setPin("");
    setConfirmPin("");
    setSelectedGroups([]);
    setPhoto(null);
    setRemember(true);
    setLoading(false);
    setLoadingMessage("");
    setNeedsPinReset(false);
    setNewPin("");
    setNewPin2("");
    setShowPin(false);
    setStep(1);
  };

  const submit = async () => {
    if (loading) return;
    setLoading(true);
    try {
      if (tab === "signup") return;
      const res = await loginFn({ data: { phone, pin, remember } });
      if (res.requires_reset) {
        setNeedsPinReset(true);
        toast.info("Você precisa cadastrar uma nova senha para continuar.");
        return;
      }
      const mode = tab;
      reset();
      await onSuccess(mode);
    } catch (e: any) {
      toast.error(friendlyError(e));
    } finally {
      setLoading(false);
    }
  };

  const submitReset = async () => {
    if (loading) return;
    if (newPin.length < 4 || newPin !== newPin2) return;
    setLoading(true);
    try {
      await resetPinFn({ data: { phone, current_pin: pin, new_pin: newPin, remember } });
      reset();
      await onSuccess("login");
    } catch (e) {
      toast.error(friendlyError(e));
    } finally {
      setLoading(false);
    }
  };

  const submitSignup = async () => {
    if (loading) return;
    setLoading(true);
    setLoadingMessage("Enviando cadastro...");
    try {
      const payload = new FormData();
      payload.append("firstName", firstName);
      payload.append("lastName", lastName);
      payload.append("phone", phone);
      payload.append("pin", pin);
      selectedGroups.forEach(gid => payload.append("groupIds", gid));
      if (photo) payload.append("photo", photo.blob);

      const response = await fetch("/api/player-signup", { method: "POST", body: payload });
      const res = await response.json();
      if (!response.ok || !res.success) {
        toast.error(res.userMessage || "Não foi possível concluir o cadastro.");
      } else {
        reset();
        await onSuccess("signup");
      }
    } catch (e) {
      toast.error(friendlyError(e));
    } finally {
      setLoading(false);
      setLoadingMessage("");
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) reset(); onOpenChange(v); }}>
      <DialogContent aria-describedby="auth-dialog-description" className="bg-background border-border max-w-[400px] p-5 sm:p-6">
          <VisuallyHidden><DialogTitle>{needsPinReset ? "Cadastrar nova senha" : tab === "signup" ? "Criar conta" : "Já tenho cadastro"}</DialogTitle></VisuallyHidden>
          <DialogHeader className="pr-8 shrink-0">
            <DialogTitle className="Oswald uppercase font-black tracking-tight">
              {needsPinReset ? "Cadastrar nova senha" : tab === "signup" ? "Criar conta" : "Já tenho cadastro"}
            </DialogTitle>
            <DialogDescription id="auth-dialog-description" className="text-[10px] Oswald uppercase font-bold tracking-widest text-brand-gold/80">
              {needsPinReset ? "Cadastre uma nova senha para continuar." : tab === "signup" ? `Etapa ${step}/4 • Novos cadastros passam por aprovação` : "Digite seu WhatsApp e PIN cadastrados"}
            </DialogDescription>
          </DialogHeader>

          {needsPinReset ? (
            <div className="flex flex-col gap-3 pt-2">
              <div className="space-y-1.5">
                <Label htmlFor="r-newpin">Nova senha (4 a 8 dígitos)</Label>
                <Input id="r-newpin" inputMode="numeric" maxLength={8} type="password" value={newPin} onChange={(e) => setNewPin(e.target.value.replace(/\D/g, ""))} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="r-newpin2">Confirmar nova senha</Label>
                <Input id="r-newpin2" inputMode="numeric" maxLength={8} type="password" value={newPin2} onChange={(e) => setNewPin2(e.target.value.replace(/\D/g, ""))} />
                {newPin2.length > 0 && newPin !== newPin2 && (
                  <p className="text-xs text-red-400">As senhas não coincidem.</p>
                )}
                {newPin.length >= 4 && newPin === pin && (
                  <p className="text-xs text-red-400">A nova senha deve ser diferente da atual.</p>
                )}
                {newPin === "1234" && (
                  <p className="text-xs text-red-400">Você não pode usar a senha padrão "1234".</p>
                )}
              </div>
              <DialogFooter>
                <Button 
                  onClick={submitReset} 
                  disabled={loading || newPin.length < 4 || newPin !== newPin2 || newPin === pin || newPin === "1234"} 
                  className={cn(
                    "h-11 w-full transition-colors disabled:opacity-100 disabled:pointer-events-none font-bold uppercase",
                    (newPin.length < 4 || newPin !== newPin2)
                      ? "!bg-muted !text-muted-foreground"
                      : "!bg-brand-gold !text-brand-blue hover:!bg-brand-gold/90 focus:!bg-brand-gold active:!bg-brand-gold"
                  )}
                >
                  {loading ? <span className="flex items-center justify-center"><Loader2 className="mr-2 h-4 w-4 animate-spin" />Processando...</span> : "Salvar e entrar"}
                </Button>
              </DialogFooter>
            </div>
          ) : (
            <div className="flex flex-col gap-4">
              <Tabs value={tab} onValueChange={(v) => { setTab(v as "login" | "signup"); setStep(1); }} className="w-full flex flex-col gap-4">
                <TabsList className="grid w-full grid-cols-2 bg-muted border border-border p-1 rounded-lg h-10">
                  <TabsTrigger value="login" className="text-[10px] Oswald uppercase font-bold">Já tenho cadastro</TabsTrigger>
                  <TabsTrigger value="signup" className="text-[10px] Oswald uppercase font-bold">Criar conta</TabsTrigger>
                </TabsList>

                <TabsContent value="signup" className="space-y-4 pt-4 outline-none">
                  {step === 1 && (
                    <div className="space-y-3">
                      <div className="grid grid-cols-2 gap-3">
                        <div className="space-y-1.5">
                          <Label htmlFor="firstName">Nome</Label>
                          <Input id="firstName" value={firstName} onChange={(e) => setFirstName(e.target.value)} />
                        </div>
                        <div className="space-y-1.5">
                          <Label htmlFor="lastName">Sobrenome</Label>
                          <Input id="lastName" value={lastName} onChange={(e) => setLastName(e.target.value)} />
                        </div>
                      </div>
                      <div className="space-y-1.5">
                        <Label htmlFor="signup-phone">WhatsApp</Label>
                        <Input id="signup-phone" type="tel" inputMode="tel" value={phone} onChange={(e) => setPhone(e.target.value.replace(/\D/g, ""))} />
                      </div>
                      <div className="grid grid-cols-2 gap-3">
                        <div className="space-y-1.5">
                          <Label htmlFor="signup-pin">PIN</Label>
                          <Input id="signup-pin" inputMode="numeric" maxLength={8} type="password" value={pin} onChange={(e) => setPin(e.target.value.replace(/\D/g, ""))} />
                        </div>
                        <div className="space-y-1.5">
                          <Label htmlFor="confirm-pin">Confirmar PIN</Label>
                          <Input id="confirm-pin" inputMode="numeric" maxLength={8} type="password" value={confirmPin} onChange={(e) => setConfirmPin(e.target.value.replace(/\D/g, ""))} />
                        </div>
                      </div>
                    </div>
                  )}

                  {step === 2 && (
                    <div className="grid grid-cols-1 gap-2">
                      {groupsQ.isLoading ? (
                        <div className="flex items-center justify-center py-6 text-sm text-brand-silver">
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />Carregando turmas...
                        </div>
                      ) : groups.length === 0 ? (
                        <div className="rounded-lg border border-brand-border p-3 text-sm text-brand-silver">Nenhuma turma disponível.</div>
                      ) : (
                        groups.map((g: any) => {
                          const isSelected = selectedGroups.includes(g.id);
                          return (
                            <div 
                              key={g.id} 
                              onClick={() => setSelectedGroups(prev => isSelected ? prev.filter(id => id !== g.id) : [...prev, g.id])} 
                              className={cn(
                                "p-3 rounded-xl cursor-pointer border transition-all flex items-center justify-between gap-2 select-none",
                                isSelected 
                                  ? "border-[#ff2d78] bg-[#ff2d78]/15 text-white ring-1 ring-[#ff2d78]/40" 
                                  : "border-border/60 bg-muted/40 hover:bg-muted/70 text-foreground"
                              )}
                            > 
                              <span className="font-black text-xs uppercase Oswald tracking-wide">{g.name}</span>
                              <div className={cn(
                                "w-5 h-5 rounded-md flex items-center justify-center border transition-colors",
                                isSelected ? "bg-[#ff2d78] border-[#ff2d78] text-white" : "border-border bg-background/50"
                              )}>
                                {isSelected && <CheckCircle2 className="h-3.5 w-3.5" />}
                              </div>
                            </div>
                          );
                        })
                      )}
                    </div>
                  )}

                  {step === 3 && (
                    <div className="flex flex-col items-center gap-2">
                      <div className="w-32 h-32 mt-2 rounded-xl border-2 border-dashed border-brand-border flex items-center justify-center cursor-pointer overflow-hidden" onClick={() => {
                        const input = document.createElement("input");
                        input.type = "file";
                        input.accept = "image/*";
                        input.onchange = (e: Event) => {
                          const target = e.target as HTMLInputElement;
                          const file = target.files?.[0];
                          if (file) setPhoto({ blob: file, url: URL.createObjectURL(file), path: "" });
                        };
                        input.click();
                      }}>
                        {photo ? <img src={photo.url} alt="Foto selecionada" className="h-full w-full object-cover" /> : <Camera className="w-10 h-10" />}
                      </div>
                      {photo ? (
                        <button type="button" onClick={() => setPhoto(null)} className="text-[10px] text-red-400 font-bold uppercase hover:underline">
                          Remover foto
                        </button>
                      ) : (
                        <Badge variant="outline" className="border-brand-border text-brand-silver">Foto do jogador</Badge>
                      )}
                    </div>
                  )}

                  {step === 4 && (
                    <div className="space-y-3 text-sm">
                      <div className="rounded-lg border border-brand-border p-3">
                        <p className="font-bold Oswald uppercase">Confirmação</p>
                        <p className="text-brand-silver">Revise os dados e finalize o cadastro.</p>
                      </div>
                      <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-xs text-amber-300">
                        <p className="font-bold uppercase Oswald tracking-wide">Aviso de aprovação</p>
                        <p className="mt-1 text-[11px] leading-relaxed text-amber-200/90">
                          Novos cadastros precisam ser aprovados pela organização da turma antes de entrar na lista de presença.
                        </p>
                      </div>
                      <div className="grid gap-2 text-brand-silver">
                        <p><span className="text-foreground">Nome:</span> {firstName} {lastName}</p>
                        <p><span className="text-foreground">WhatsApp:</span> {phone}</p>
                        <p><span className="text-foreground">Turmas selecionadas:</span> {selectedGroups.length}</p>
                      </div>
                    </div>
                  )}
                </TabsContent>

                <TabsContent value="login" className="space-y-4 pt-4 outline-none">
                  <div className="space-y-1.5">
                    <Label htmlFor="login-phone">WhatsApp</Label>
                    <Input id="login-phone" type="tel" inputMode="tel" value={phone} onChange={(e) => setPhone(e.target.value.replace(/\D/g, ""))} />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="login-pin">PIN</Label>
                    <div className="relative">
                      <Input id="login-pin" inputMode="numeric" maxLength={8} type={showPin ? "text" : "password"} value={pin} onChange={(e) => setPin(e.target.value.replace(/\D/g, ""))} className="pr-10" />
                      <button type="button" onClick={() => setShowPin((v) => !v)} className="absolute right-3 top-1/2 -translate-y-1/2 text-brand-silver hover:text-foreground" aria-label={showPin ? "Ocultar PIN" : "Mostrar PIN"}>
                        {showPin ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                      </button>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Checkbox id="remember" checked={remember} onCheckedChange={(v) => setRemember(v === true)} />
                    <Label htmlFor="remember" className="text-sm font-normal text-brand-silver">Lembrar aparelho</Label>
                  </div>
                </TabsContent>
              </Tabs>

              {loadingMessage && (
                <div className="flex shrink-0 items-center gap-2 rounded-lg border border-brand-border p-2 text-xs text-brand-silver">
                  <ShieldAlert className="h-4 w-4 text-brand-gold shrink-0" />
                  {loadingMessage}
                </div>
              )}

              <DialogFooter className="flex shrink-0 flex-row gap-2 sm:justify-between mt-2">
                {tab === "signup" && step > 1 && (
                  <Button variant="outline" onClick={() => setStep(step - 1)} disabled={loading}>
                    <ArrowLeft className="mr-2 h-4 w-4" />Voltar
                  </Button>
                )}
                {(() => {
                  const isInvalid = tab === "login" 
                    ? (!phone.replace(/\D/g, "") || pin.length < 4)
                    : (step === 1 ? (!firstName.trim() || !lastName.trim() || phone.replace(/\D/g, "").length < 10 || phone.replace(/\D/g, "").length > 11 || pin.length !== 4 || pin !== confirmPin) :
                       step === 2 ? selectedGroups.length === 0 :
                       step === 3 ? !photo : false);

                  return (
                    <Button 
                      onClick={async () => {
                        if (tab === "login") {
                          await submit();
                        } else if (step < 4) {
                          setStep(step + 1);
                        } else {
                          await submitSignup();
                        }
                      }} 
                      className={cn(
                        "flex-1 transition-colors disabled:opacity-100 disabled:pointer-events-none font-bold uppercase",
                        isInvalid 
                          ? "!bg-muted !text-muted-foreground"
                          : "!bg-brand-gold !text-brand-blue hover:!bg-brand-gold/90 focus:!bg-brand-gold active:!bg-brand-gold"
                      )} 
                      disabled={loading || isInvalid}
                    >
                      {loading ? (
                        <span className="flex items-center justify-center"><Loader2 className="mr-2 h-4 w-4 animate-spin" />Processando...</span>
                      ) : tab === "login" ? (
                        "Entrar"
                      ) : step < 4 ? (
                        <span className="flex items-center justify-center gap-2">Continuar <ArrowRight className="h-4 w-4" /></span>
                      ) : (
                        "Finalizar cadastro"
                      )}
                    </Button>
                  );
                })()}
              </DialogFooter>
            </div>
          )}
      </DialogContent>
    </Dialog>
  );
}
