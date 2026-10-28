import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Search, DollarSign, User, Info, FileText, CheckCircle2, AlertCircle, Trash2, Clock, Phone } from "lucide-react";
import { toast } from "sonner";
import { useAdminGroup } from "@/lib/admin-group-context";
import { 
  admin_list_fund_participants, 
  admin_get_fund_dashboard,
  admin_set_payment_reported,
  admin_delete_fund_payment
} from "@/lib/admin.functions";
import { admin_add_fund_payment_direct, admin_set_participant_notes } from "@/lib/fund.functions";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { AppConfirmDialog } from "@/components/AppDialogs";
import { cn } from "@/lib/utils";
import { friendlyError } from "@/lib/error-messages";
import { formatBRL } from "@/lib/public-fund-status";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { PlayerAvatar } from "@/components/PlayerAvatar";
import { PlayerPhotoModal } from "@/components/PlayerPhotoModal";
import { AddPlayerModal } from "@/components/AddPlayerModal";

export function FundParticipantsTab() {
  const { groupId, group } = useAdminGroup();
  const list = useServerFn(admin_list_fund_participants);
  const getDashboard = useServerFn(admin_get_fund_dashboard);
  const addPayment = useServerFn(admin_add_fund_payment_direct);
  const setReported = useServerFn(admin_set_payment_reported);
  
  const [confirmDialog, setConfirmDialog] = useState<{ open: boolean; title: string; description: string; onConfirm: () => void }>({
    open: false, title: "", description: "", onConfirm: () => {}
  });

  const [selectedPhoto, setSelectedPhoto] = useState<any>(null);
  const [search, setSearch] = useState("");
  const [selectedParticipant, setSelectedParticipant] = useState<any>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [paymentValue, setPaymentValue] = useState("");

  const { data: dashboard } = useQuery({
    queryKey: ["admin-fund-dashboard", groupId],
    queryFn: () => getDashboard({ data: { group_id: groupId } as any }),
    enabled: !!groupId,
  });

  const fundId = dashboard?.fund?.id;

  const { data: res, isLoading, refetch } = useQuery({
    queryKey: ["admin-fund-participants", groupId, fundId],
    queryFn: () => list({ data: { fund_id: fundId } }),
    enabled: !!fundId,
  });

  const { refetch: dashboardRefetch } = useQuery({
    queryKey: ["admin-fund-dashboard", groupId],
    queryFn: () => getDashboard({ data: { group_id: groupId } as any }),
    enabled: !!groupId,
  });

  const participants = Array.isArray(res?.items) ? res.items.filter((i: any) => 
    i.name?.toLowerCase().includes(search.toLowerCase())
  ) : [];

  const totals = dashboard?.totals;
  const groupName = (group?.name || "TURMA").toUpperCase();
  const [editingGroupId, setEditingGroupId] = useState<string | null>(null);

  useState(() => {
    if (groupId) setEditingGroupId(groupId);
  });

  const handleRegisterPayment = async () => {
    if (groupId !== editingGroupId) {
       toast.error(`Turma alterada. Operação bloqueada.`);
       return;
    }
    if (!paymentValue || isNaN(Number(paymentValue))) {
      toast.error("Informe um valor válido");
      return;
    }

    setBusy(true);
    try {
      await addPayment({
        data: {
          fund_id: fundId!,
          participant_id: selectedParticipant.id,
          amount: Number(paymentValue),
          paid_at: new Date().toISOString(),
          notes: selectedParticipant.notes || `Registrado pelo admin em ${new Date().toLocaleDateString('pt-BR')}`
        }
      });
      toast.success("Pagamento registrado");
      setIsModalOpen(false);
      refetch();
    } catch (e: any) {
      toast.error(friendlyError(e.message));
    } finally {
      setBusy(false);
    }
  };

  const handleMarkAsPaid = async (participant: any) => {
    if (groupId !== editingGroupId) {
       toast.error(`Turma alterada. Operação bloqueada.`);
       return;
    }
    const amountToPay = Math.abs(Number(participant.balance));
    if (amountToPay <= 0) return;
    
    setBusy(true);
    try {
      await addPayment({
        data: {
          fund_id: fundId!,
          participant_id: participant.id,
          amount: amountToPay,
          paid_at: new Date().toISOString(),
        }
      });
      toast.success("Marcado como PAGO");
      refetch();
    } catch (e: any) {
      toast.error(friendlyError(e.message));
    } finally {
      setBusy(false);
    }
  };

  const handleToggleReported = async (participant: any) => {
    if (groupId !== editingGroupId) {
       toast.error(`Turma alterada. Operação bloqueada.`);
       return;
    }
    try {
      await setReported({
        data: {
          participant_id: participant.id,
          value: !participant.payment_reported
        }
      });
      toast.success(participant.payment_reported ? "Aviso removido" : "Avisou que vai pagar!");
      refetch();
    } catch (e: any) {
      toast.error(friendlyError(e.message));
    }
  };

  return (
    <div className="space-y-6">
      {/* Resumo Financeiro */}
      {totals && (
        <div className="space-y-2 mb-4">
          <p className="text-[10px] text-slate-500 dark:text-brand-silver uppercase Oswald font-bold tracking-widest px-1">
            Resumo Geral (Não afetado pela busca)
          </p>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <Card className="p-3 bg-slate-50 dark:bg-brand-surface/30 border-slate-200 dark:border-brand-border">
              <p className="text-[8px] text-slate-500 dark:text-brand-silver uppercase Oswald font-bold">Total Devido</p>
              <p className="text-sm font-bold text-slate-900 dark:text-brand-white Oswald">{formatBRL(totals.total_amount)}</p>
            </Card>
            <Card className="p-3 bg-emerald-50 dark:bg-emerald-500/10 border-emerald-200 dark:border-emerald-500/20">
              <p className="text-[8px] text-emerald-600 dark:text-emerald-500/70 uppercase Oswald font-bold">Total Recebido</p>
              <p className="text-sm font-bold text-emerald-600 dark:text-emerald-400 Oswald">{formatBRL(totals.collected)}</p>
            </Card>
            <Card className="p-3 bg-red-50 dark:bg-red-500/10 border-red-200 dark:border-red-500/20">
              <p className="text-[8px] text-red-600 dark:text-red-500/70 uppercase Oswald font-bold">Total Pendente</p>
              <p className="text-sm font-bold text-red-600 dark:text-red-400 Oswald">{formatBRL(totals.remaining)}</p>
            </Card>
            <Card className="p-3 bg-pink-50 dark:bg-brand-gold/10 border-pink-200 dark:border-brand-gold/20">
              <p className="text-[8px] text-pink-600 dark:text-brand-gold uppercase Oswald font-bold">Situação</p>
              <p className="text-sm font-bold text-pink-600 dark:text-brand-gold Oswald">
                {res?.items?.filter((p: any) => p.status === 'in_full' || p.status === 'overpaid').length || 0} de {res?.items?.length || 0} quitados ({totals.percent.toFixed(0)}%)
              </p>
            </Card>
          </div>
        </div>
      )}

      <div className="space-y-4">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-white dark:bg-brand-surface/20 p-4 rounded-xl border border-slate-200 dark:border-brand-border shadow-sm dark:shadow-none">
          <div className="flex items-center gap-3">
            <div className="flex flex-col">
              <h3 className="text-lg font-black text-slate-900 dark:text-brand-white uppercase Oswald tracking-tight flex items-center gap-2">
                <DollarSign className="w-5 h-5 text-emerald-600 dark:text-brand-gold" />
                Gestão do Rateio
                <span className="text-[10px] text-slate-500 dark:text-brand-silver/50 ml-2 border-l border-slate-200 dark:border-brand-border/50 pl-2 hidden sm:inline">Turma: {groupName}</span>
              </h3>
              <p className="text-[10px] text-slate-500 dark:text-brand-silver/70 font-bold uppercase Oswald tracking-widest sm:pl-7">
                Período: {dashboard?.fund?.title || 'Período não informado'}
              </p>
            </div>
            <div className="ml-2">
              <AddPlayerModal 
                eventId={""} 
                onAdded={() => {
                  refetch();
                  dashboardRefetch();
                }} 
                mode="fund"
                fundId={fundId}
              />
            </div>
          </div>
          <div className="relative flex-1 max-w-xs">
            <Search className="absolute left-2.5 top-2.5 w-3.5 h-3.5 text-slate-400 dark:text-brand-silver/50" />
            <Input 
              placeholder="Buscar participante..." 
              className="pl-8 bg-slate-50 dark:bg-brand-surface/30 border-slate-200 dark:border-brand-border h-8 text-[10px] text-slate-900 dark:text-brand-white Oswald uppercase"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
        </div>
        
          <div className="grid gap-2">
            {participants.map((item: any) => (
              <div 
                key={item.id} 
                className="group flex flex-col md:flex-row md:items-center justify-between gap-3 p-3 bg-white dark:bg-brand-surface/40 border border-slate-200 dark:border-brand-border hover:border-pink-500/30 dark:hover:border-brand-gold/30 transition-all rounded-xl shadow-sm dark:shadow-none"
              >
                <div className="flex items-center gap-3 min-w-0">
                  <div className="relative shrink-0">
                    <PlayerAvatar 
                      path={Array.isArray(item.players) && item.players[0] ? item.players[0].avatar_path : undefined} 
                      name={item.name} 
                      size="sm"
                      className="cursor-pointer border border-brand-border group-hover:border-brand-gold/50 transition-all shadow-md"
                      onClick={(e) => {
                        e.stopPropagation();
                        setSelectedPhoto({
                          id: Array.isArray(item.players) && item.players[0] ? item.players[0].id : item.id,
                          name: item.name,
                          avatar_path: Array.isArray(item.players) && item.players[0] ? item.players[0].avatar_path : undefined,
                          phone: Array.isArray(item.players) && item.players[0] ? item.players[0].phone_normalized : undefined,
                          group_name: "RATEIO OPERACIONAL",
                          position: "PARTICIPANTE"
                        });
                      }}
                    />
                    {item.payment_reported && (
                      <div className="absolute -top-1 -right-1 bg-pink-600 dark:bg-brand-gold text-white dark:text-brand-blue p-0.5 rounded-full border border-white dark:border-brand-blue shadow-sm">
                        <Clock className="w-2 h-2" />
                      </div>
                    )}
                  </div>
                  
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <p className="text-xs font-black text-slate-900 dark:text-brand-white Oswald uppercase truncate tracking-tight">
                        {item.name}
                      </p>
                      {Array.isArray(item.players) && item.players[0] && item.players[0].phone_normalized && (
                        <span className="text-[8px] text-slate-400 dark:text-brand-silver/40 font-mono tracking-tighter">
                          ...{String(item.players[0].phone_normalized).slice(-4)}
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-3 mt-1.5 flex-wrap">
                    <div className="flex flex-col">
                      <span className="text-[7px] text-slate-500 dark:text-brand-silver/50 uppercase Oswald font-bold leading-none mb-0.5">Pago</span>
                      <span className="text-[11px] font-bold text-slate-900 dark:text-brand-white Oswald">{formatBRL(item.total_paid)}</span>
                    </div>
                    <div className="w-px h-6 bg-slate-200 dark:bg-brand-border/30 hidden sm:block" />
                    <div className="flex flex-col">
                      <span className="text-[7px] text-slate-500 dark:text-brand-silver/50 uppercase Oswald font-bold leading-none mb-0.5">Saldo</span>
                      <span className={cn(
                        "text-[11px] font-black Oswald",
                        Number(item.balance) < 0 ? "text-red-500 dark:text-red-400" : "text-emerald-500 dark:text-emerald-400"
                      )}>
                          {Number(item.balance) === 0 ? "QUITADO" : formatBRL(item.balance)}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="flex items-center justify-between md:justify-end gap-3 border-t md:border-t-0 border-brand-border/30 pt-3 md:pt-0 mt-3 md:mt-0">
                  <div className="flex flex-col items-start md:items-end gap-1 min-w-[90px]">
                    <Badge variant="outline" className={cn(
                      "text-[8px] px-1.5 h-4 font-black uppercase tracking-widest border-0 rounded-md shadow-sm w-fit",
                      item.status === 'in_full' || item.status === 'overpaid' ? "bg-emerald-500/20 text-emerald-400" :
                      item.status === 'partial' ? "bg-amber-500/20 text-amber-400" :
                      "bg-red-500/20 text-red-400"
                    )}>
                      {item.status === 'in_full' || item.status === 'overpaid' ? 'QUITADO' : 
                       item.status === 'partial' ? 'PARCIAL' : 'EM ABERTO'}
                    </Badge>
                    <span className="text-[7px] text-slate-400 dark:text-brand-silver/40 font-mono uppercase truncate max-w-[100px]" title={item.external_ref || 'Período não informado'}>
                      REF: {item.external_ref || 'Não informada'}
                    </span>
                  </div>

                  <div className="flex items-center gap-1.5 shrink-0">
                    <Button 
                      size="icon" 
                      variant="outline" 
                      className="h-8 w-8 border-pink-500/20 dark:border-brand-gold/20 text-pink-600 dark:text-brand-gold hover:bg-pink-50 dark:hover:bg-brand-gold/10 rounded-lg shrink-0"
                      onClick={() => {
                        setSelectedParticipant(item);
                        setPaymentValue(Math.abs(Number(item.balance)).toString());
                        setIsModalOpen(true);
                      }}
                      title="Registrar Pagamento Parcial/Avulso"
                      aria-label={`Registrar pagamento para ${item.name}, Turma ${groupName}`}
                    >
                      <DollarSign className="w-4 h-4" />
                    </Button>
                    
                    {Number(item.balance) < 0 && (
                      <Button 
                        size="icon" 
                        variant="outline" 
                        className="h-8 w-8 border-emerald-500/20 text-emerald-500 hover:bg-emerald-500/10 rounded-lg shrink-0"
                        onClick={() => handleMarkAsPaid(item)}
                        disabled={busy}
                        title="Quitar Saldo Total"
                        aria-label={`Quitar saldo total para ${item.name}`}
                      >
                        <CheckCircle2 className="w-4 h-4" />
                      </Button>
                    )}

                    <Button 
                      size="icon" 
                      variant="ghost" 
                      className={cn(
                        "h-8 w-8 rounded-lg transition-all shrink-0",
                        item.payment_reported ? "bg-pink-600 dark:bg-brand-gold text-white dark:text-brand-blue hover:bg-pink-700 dark:hover:bg-brand-gold/80" : "text-slate-400 dark:text-brand-silver/30 hover:bg-slate-100 dark:hover:bg-white/5 hover:text-slate-600 dark:hover:text-brand-silver"
                      )}
                      onClick={() => {
                        if (item.payment_reported) {
                          setConfirmDialog({
                            open: true,
                            title: "Remover aviso",
                            description: `Deseja remover o status de "Avisou" de ${item.name}?`,
                            onConfirm: () => handleToggleReported(item)
                          });
                        } else {
                          handleToggleReported(item);
                        }
                      }}
                      title={item.payment_reported ? "Remover aviso de pagamento" : "Marcar que avisou que vai pagar"}
                      aria-label={item.payment_reported ? `Remover aviso de pagamento para ${item.name}` : `Marcar aviso de pagamento para ${item.name}`}
                    >
                      <Clock className="w-4 h-4" />
                    </Button>
                  </div>
                </div>
              </div>
            ))}
            {participants.length === 0 && !isLoading && (
              <div className="p-12 text-center border-2 border-dashed border-slate-200 dark:border-brand-border/20 bg-slate-50 dark:bg-transparent rounded-2xl">
                <p className="text-slate-400 dark:text-brand-silver/40 italic text-xs Oswald uppercase tracking-[0.2em]">Sem registros financeiros</p>
              </div>
            )}
          </div>
      </div>

      <Dialog open={isModalOpen} onOpenChange={setIsModalOpen}>
        <DialogContent aria-describedby="fund-payment-desc" className="bg-white dark:bg-brand-blue border-slate-200 dark:border-brand-gold/30 text-slate-900 dark:text-brand-white max-w-xs">
          <DialogHeader>
            <DialogTitle className="Oswald uppercase text-pink-600 dark:text-brand-gold">Registrar Pagamento</DialogTitle>
            <DialogDescription id="fund-payment-desc" className="text-slate-500 dark:text-brand-silver text-[10px] uppercase Oswald">
              {selectedParticipant?.name}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label className="text-[10px] uppercase Oswald text-slate-500 dark:text-brand-silver">Valor do Pagamento</Label>
              <div className="relative">
                <span className="absolute left-3 top-2.5 text-xs text-slate-500 dark:text-brand-silver Oswald">R$</span>
                <Input 
                  type="number" 
                  step="0.01"
                  className="pl-8 bg-slate-50 dark:bg-brand-surface border-slate-200 dark:border-brand-border h-10 text-slate-900 dark:text-brand-white Oswald font-bold"
                  value={paymentValue}
                  onChange={(e) => setPaymentValue(e.target.value)}
                  autoFocus
                />
              </div>
              <p className="text-[9px] text-slate-400 dark:text-brand-silver/50 Oswald uppercase">O saldo devedor é {formatBRL(Math.abs(Number(selectedParticipant?.balance || 0)))}</p>
            </div>
            <div className="space-y-2">
              <Label className="text-[10px] uppercase Oswald text-slate-500 dark:text-brand-silver">Observações</Label>
              <Textarea 
                placeholder="Ex: Referência do PIX ou motivo do parcial..."
                className="bg-slate-50 dark:bg-brand-surface border-slate-200 dark:border-brand-border text-xs min-h-[60px] text-slate-900 dark:text-brand-white"
                value={selectedParticipant?.notes || ""}
                onChange={(e) => setSelectedParticipant((prev: any) => ({ ...prev, notes: e.target.value }))}
              />
            </div>
          </div>
          <DialogFooter className="flex-row gap-2">
            <Button variant="ghost" className="flex-1 h-10 Oswald uppercase text-slate-500 dark:text-brand-silver" onClick={() => setIsModalOpen(false)}>Cancelar</Button>
            <Button className="flex-1 h-10 bg-slate-900 dark:bg-brand-gold text-white dark:text-brand-blue Oswald uppercase font-bold" onClick={handleRegisterPayment} disabled={busy}>
              {busy ? "Gravando..." : "Confirmar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <PlayerPhotoModal
        open={!!selectedPhoto}
        onOpenChange={(v) => !v && setSelectedPhoto(null)}
        player={selectedPhoto}
      />
      <AppConfirmDialog {...confirmDialog} onOpenChange={o => setConfirmDialog(prev => ({ ...prev, open: o }))} />
    </div>

  );
}
