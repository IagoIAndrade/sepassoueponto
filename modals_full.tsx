


function ApprovalsTab() {
  const list = useServerFn(admin_list_pending_approvals);
  const process = useServerFn(admin_process_group_request);
  const [search, setSearch] = useState("");
  const [busy, setBusy] = useState<string | null>(null);

  const { data, refetch, isLoading } = useQuery({
    queryKey: ["approvals", search],
    queryFn: () => list({ data: { status: "pending", search } }),
  });

  const handleAction = async (player_id: string, group_id: string, status: "approved" | "rejected") => {
    setBusy(`${player_id}-${group_id}`);
    try {
      await process({ data: { player_id, group_id, status } });
      toast.success(status === "approved" ? "Acesso liberado!" : "Solicitação recusada.");
      refetch();
    } catch (e) {
      toast.error(friendlyError(e));
    } finally {
      setBusy(null);
    }
  };

  const pending = data?.approvals ?? [];

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-1">
        <h3 className="text-base font-bold text-brand-white uppercase">Aprovações Pendentes</h3>
        <p className="text-xs text-brand-silver">Novos cadastros ou jogadores solicitando acesso a turmas.</p>
      </div>

      <Input
        placeholder="Buscar por nome ou celular..."
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        className="bg-brand-surface/50"
      />

      {isLoading && <div className="text-center py-8 text-brand-silver">Carregando solicitações...</div>}
      
      {!isLoading && pending.length === 0 && (
        <Card className="p-8 text-center border-dashed border-brand-border bg-transparent">
          <p className="text-brand-silver italic">Nenhuma aprovação pendente no momento.</p>
        </Card>
      )}

      <div className="grid gap-3">
        {pending.map((a) => (
          <Card key={`${a.player_id}-${a.group_id}`} className="p-3 bg-brand-surface/40 border-brand-border hover:border-brand-gold/30 transition-colors">
            <div className="flex items-center justify-between gap-4">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <h4 className="font-bold text-sm text-brand-white truncate">
                    {a.first_name} {a.last_name}
                  </h4>
                  <Badge variant="outline" className="text-[9px] py-0 px-1 border-brand-gold/40 text-brand-gold bg-brand-gold/5">
                    {a.group_name}
                  </Badge>
                </div>
                <p className="text-[11px] text-brand-silver mt-0.5">{a.phone_normalized}</p>
              </div>
              
              <div className="flex gap-2 shrink-0">
                <Button 
                  size="sm" 
                  variant="outline" 
                  className="h-8 px-2 text-[11px] border-red-500/30 text-red-400 hover:bg-red-500/10"
                  disabled={!!busy}
                  onClick={() => handleAction(a.player_id, a.group_id, "rejected")}
                >
                  Recusar
                </Button>
                <Button 
                  size="sm" 
                  className="h-8 px-2 text-[11px] bg-emerald-600 hover:bg-emerald-500 text-white"
                  disabled={!!busy}
                  onClick={() => handleAction(a.player_id, a.group_id, "approved")}
                >
                  {busy === `${a.player_id}-${a.group_id}` ? "..." : "Aprovar"}
                </Button>
              </div>
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}

function AccessReviewTab() {
  const list = useServerFn(admin_list_players_to_review);
  const save = useServerFn(admin_save_reviewed_accesses);
  const getGroups = useServerFn(admin_list_groups);
  const [search, setSearch] = useState("");
  const [selectedPlayers, setSelectedPlayers] = useState<string[]>([]);
  const [targetGroups, setTargetGroups] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);

  const { data: players, refetch, isLoading } = useQuery({
    queryKey: ["access-review", search],
    queryFn: () => list({ data: { search } }),
  });

  const { data: groupsData } = useQuery({
    queryKey: ["admin-groups"],
    queryFn: () => getGroups({ data: undefined }),
  });

  const togglePlayer = (id: string) => {
    setSelectedPlayers(prev => 
      prev.includes(id) ? prev.filter(p => p !== id) : [...prev, id]
    );
  };

  const toggleGroup = (id: string) => {
    setTargetGroups(prev => 
      prev.includes(id) ? prev.filter(g => g !== id) : [...prev, id]
    );
  };

  const handleBulkSave = async () => {
    if (selectedPlayers.length === 0 || targetGroups.length === 0) {
      toast.error("Selecione ao menos um jogador e uma turma.");
      return;
    }
    setBusy(true);
    try {
      await save({ data: { player_ids: selectedPlayers, group_ids: targetGroups } });
      toast.success(`${selectedPlayers.length} jogadores atualizados!`);
      setSelectedPlayers([]);
      refetch();
    } catch (e) {
      toast.error(friendlyError(e));
    } finally {
      setBusy(false);
    }
  };

  const activeGroups = (groupsData?.groups ?? []).filter(g => g.active);

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-1">
        <h3 className="text-base font-bold text-brand-white uppercase">Acessos a Revisar</h3>
        <p className="text-xs text-brand-silver">Jogadores sem nenhuma turma atribuída. Defina seus acessos aqui.</p>
      </div>

      <div className="bg-brand-surface/40 border border-brand-border rounded-lg p-3 space-y-3">
        <Label className="text-[11px] uppercase text-brand-gold font-bold">Turmas de destino (Bulk)</Label>
        <div className="flex flex-wrap gap-2">
          {activeGroups.map(g => (
            <Badge 
              key={g.id}
              variant={targetGroups.includes(g.id) ? "default" : "outline"}
              className={cn(
                "cursor-pointer px-3 py-1 text-[11px]",
                targetGroups.includes(g.id) ? "bg-brand-gold text-brand-black" : "border-brand-border text-brand-silver"
              )}
              onClick={() => toggleGroup(g.id)}
            >
              {g.name}
            </Badge>
          ))}
        </div>
        <div className="pt-2 flex justify-between items-center gap-4">
          <p className="text-[10px] text-brand-silver italic">
            Selecione as turmas acima e os jogadores abaixo para liberar o acesso.
          </p>
          <Button 
            size="sm" 
            className="h-8 bg-brand-gold text-brand-black font-bold hover:bg-brand-gold/80"
            disabled={busy || selectedPlayers.length === 0 || targetGroups.length === 0}
            onClick={handleBulkSave}
          >
            {busy ? "Salvando..." : `Liberar para ${selectedPlayers.length} selecionados`}
          </Button>
        </div>
      </div>

      <Input
        placeholder="Filtrar jogadores..."
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        className="bg-brand-surface/50 h-9 text-sm"
      />

      {isLoading && <div className="text-center py-8 text-brand-silver text-sm italic">Carregando lista...</div>}

      <div className="grid gap-2">
        {(players ?? []).map((p: any) => (
          <div 
            key={p.id} 
            className={cn(
              "flex items-center justify-between p-3 border rounded-lg transition-colors cursor-pointer",
