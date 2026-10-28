import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Search, Plus, Loader2 } from "lucide-react";
import { useServerFn } from "@tanstack/react-start";
import { admin_search_players, admin_add } from "@/lib/admin.functions";
import { toast } from "sonner";
import { friendlyError } from "@/lib/error-messages";
import { useAdminGroup } from "@/lib/admin-group-context";

export function AddPlayerModal({ eventId, onAdded, mode = "event", fundId }: { eventId?: string, onAdded: () => void, mode?: "event" | "fund", fundId?: string }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<any[]>([]);
  const [searching, setSearching] = useState(false);
  const { groupId } = useAdminGroup();
  const searchPlayers = useServerFn(admin_search_players);
  const addPlayer = useServerFn(admin_add);

  const handleSearch = async () => {
    if (query.length < 2) return;
    setSearching(true);
    try {
      const { players } = await searchPlayers({ data: { query, group_id: groupId } });
      setResults(players || []);
    } catch (e) {
      toast.error(friendlyError(e));
    } finally {
      setSearching(false);
    }
  };

  const handleAdd = async (player: any) => {
    try {
      if (mode === "fund" && fundId) {
        // Usar RPC p_fund_id
        const { supabase } = await import("@/integrations/supabase/client");
        const { error } = await supabase.from("fund_participants" as any).upsert({
          fund_id: fundId,
          player_id: player.id,
          name: player.name,
          active: true
        } as any, { onConflict: 'fund_id,player_id' } as any);
        
        if (error) throw error;
        toast.success(`${player.name} adicionado ao rateio!`);
      } else if (eventId) {
        let payload = { event_id: eventId, player_id: player.id, list_type: "main" as const, force: false, override_reason: "" };
        let result: any;
        try {
          result = await addPlayer({ data: payload });
        } catch (err: any) {
          if (err.message?.includes("Você está bloqueado") || err.message?.includes("bloqueado nesta turma")) {
            const reason = window.prompt(err.message + "\n\nPara exceção administrativa, digite o motivo da liberação:");
            if (reason && reason.trim().length > 0) {
              payload.force = true;
              payload.override_reason = reason;
              result = await addPlayer({ data: payload });
            } else if (reason !== null) {
              toast.error("Motivo obrigatório para inclusão de bloqueado.");
              return;
            } else {
              return;
            }
          } else {
            throw err;
          }
        }
        
        if (result) {
          toast.success(`${player.name} adicionado com sucesso!`);
          setOpen(false);
          onAdded();
        }
      }
    } catch (e: any) {
      console.error("[ADMIN ADD] ERRO CAPTURADO:", e);
      if (e instanceof Error) {
        console.error({
          message: e.message,
          stack: e.stack,
          // Se for erro de RPC via TanStack Start, pode estar em campos específicos
          ...(e as any).data
        });
      }

      if (e.message?.includes("already_registered")) {
        toast.error(`${player.name} já está na lista.`);
      } else if (e.message?.includes("main_full")) {
        toast.error("O limite de jogadores principais foi atingido (regra do servidor).");
      } else if (e.message?.includes("Você está bloqueado nesta turma")) {
        toast.error(e.message);
      } else {
        toast.error(friendlyError(e));
      }
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant="outline" className="h-7 text-[10px] border-brand-gold/30 text-brand-gold px-2 font-bold uppercase">
          + ADICIONAR JOGADOR
        </Button>
      </DialogTrigger>
      <DialogContent aria-describedby="add-player-desc" className="sm:max-w-md bg-brand-surface border-brand-border">
        <DialogHeader>
          <DialogTitle className="Oswald text-brand-white uppercase">
            {mode === "fund" ? "Adicionar ao Rateio" : "Adicionar Jogador à Lista"}
          </DialogTitle>
          <DialogDescription id="add-player-desc">Busque um jogador cadastrado para adicionar manualmente à lista ou ao rateio.</DialogDescription>
        </DialogHeader>
        <div className="flex gap-2 mb-4">
          <Input 
            placeholder="Buscar por nome ou WhatsApp..." 
            value={query} 
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleSearch()}
            className="bg-brand-surface/50 border-brand-border"
          />
          <Button onClick={handleSearch} disabled={searching} className="bg-brand-gold text-brand-blue">
            {searching ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
          </Button>
        </div>
        <div className="space-y-2 max-h-[60vh] overflow-y-auto">
          {results.map((p) => (
            <div key={p.id} className="flex items-center justify-between p-3 bg-brand-surface/50 rounded-lg border border-brand-border">
              <div>
                <p className="text-sm font-bold text-brand-white Oswald">{p.name}</p>
                <p className="text-xs text-brand-silver">
                  •••• {p.phone_normalized ? p.phone_normalized.slice(-4) : "****"}
                </p>
                <p className="text-[10px] uppercase text-brand-gold">
                  {p.group_status === "approved" ? "Aprovado na Turma" : "Sem Acesso à Turma"}
                </p>
              </div>
              <Button size="sm" onClick={() => handleAdd(p)} className="bg-brand-gold text-brand-blue uppercase font-bold text-[10px]">
                {p.group_status === "approved" ? "Adicionar" : "Liberar e Adicionar"}
              </Button>
            </div>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}
