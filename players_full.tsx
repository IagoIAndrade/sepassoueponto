              {event.event.status === "open" ? "Fechar Lista" : "Abrir Lista"}
            </Button>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4 text-center border-t border-brand-border pt-4">
          <div>
            <p className="text-[9px] uppercase text-brand-silver font-bold">Inscritos</p>
            <p className="text-xl font-display text-brand-gold">{event.registrations.length}</p>
          </div>
          <div>
            <p className="text-[9px] uppercase text-brand-silver font-bold">Limite</p>
            <p className="text-xl font-display text-brand-white">{event.event.max_players || "--"}</p>
          </div>
        </div>
      </Card>

      <div className="space-y-2">
        <h4 className="text-[10px] font-bold text-brand-silver uppercase px-1">Jogadores na Lista</h4>
        {event.registrations.map((reg, idx) => (
          <div key={reg.id} className="flex items-center justify-between p-2.5 bg-brand-surface/30 border border-brand-border rounded-lg group">
            <div className="flex items-center gap-2 min-w-0">
              <span className="text-[10px] font-mono text-brand-gold/50 w-4">{idx + 1}.</span>
              <div className="min-w-0">
                <p className="text-xs font-bold text-brand-white truncate">{reg.player_name}</p>
                <p className="text-[9px] text-brand-silver uppercase">{reg.position || "Sem posição"}</p>
              </div>
            </div>
            <Button 
              variant="ghost" 
              size="icon" 
              className="h-7 w-7 text-red-400 hover:bg-red-500/10 md:opacity-0 group-hover:opacity-100 transition-opacity"
              onClick={() => handleRemove(reg.id, reg.player_name)}
            >
              <Trash2 className="w-3.5 h-3.5" />
            </Button>
          </div>
        ))}
        {event.registrations.length === 0 && (
          <p className="text-center py-8 text-brand-silver italic text-xs">Ninguém inscrito ainda.</p>
        )}
      </div>
    </div>
  );
}

function PlayersTab() {
  const { groupId } = useAdminGroup();
  const listPlayers = useServerFn(admin_list_players);
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);

  const { data, isLoading } = useQuery({
    queryKey: ["admin-players", search, page, groupId],
    queryFn: () => listPlayers({ data: { search, page, limit: 15, group_id: groupId } }),
  });

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-brand-silver" />
          <Input 
            placeholder="Buscar por nome ou celular..." 
            className="pl-9 bg-brand-surface/50 border-brand-border h-9 text-sm"
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1); }}
          />
        </div>
      </div>

      <div className="grid gap-2">
        {data?.players.map(p => (
          <Card key={p.id} className="p-3 bg-brand-surface/40 border-brand-border hover:border-brand-gold/20 transition-colors">
            <div className="flex items-center justify-between">
              <div className="min-w-0">
                <h4 className="text-sm font-bold text-brand-white truncate">{p.name}</h4>
                <div className="flex items-center gap-2 mt-0.5">
                  <span className="text-[10px] text-brand-silver">{p.phone_normalized}</span>
                  {p.is_admin && <Badge className="h-3.5 text-[8px] bg-brand-gold text-brand-black px-1">ADM</Badge>}
                </div>
              </div>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="icon" className="h-8 w-8 text-brand-silver">
                    <MoreVertical className="w-4 h-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="bg-brand-surface border-brand-border min-w-[140px]">
                  <DropdownMenuItem className="text-[11px] gap-2">
                    <Edit2 className="w-3.5 h-3.5" /> Editar dados
                  </DropdownMenuItem>
                  <DropdownMenuItem className="text-[11px] gap-2">
                    <Key className="w-3.5 h-3.5" /> Resetar PIN
                  </DropdownMenuItem>
                  <DropdownMenuSeparator className="bg-brand-border" />
                  <DropdownMenuItem className="text-[11px] gap-2 text-red-400 focus:text-red-400">
                    <UserMinus className="w-3.5 h-3.5" /> Desativar
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </Card>
        ))}
      </div>
      {isLoading && <div className="text-center py-8 text-brand-silver text-xs italic">Carregando jogadores...</div>}
    </div>
  );
}
