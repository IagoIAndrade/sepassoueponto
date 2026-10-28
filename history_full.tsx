              selectedPlayers.includes(p.id) 
                ? "bg-brand-gold/10 border-brand-gold/40" 
                : "bg-brand-surface/30 border-brand-border"
            )}
            onClick={() => togglePlayer(p.id)}
          >
            <div className="min-w-0">
              <p className="text-sm font-bold text-brand-white truncate">{p.name}</p>
              <p className="text-[10px] text-brand-silver">{p.phone_normalized}</p>
            </div>
            {selectedPlayers.includes(p.id) ? (
              <Badge className="bg-brand-gold text-brand-black">Selecionado</Badge>
            ) : (
              <Badge variant="outline" className="border-brand-border text-brand-silver">Aguardando</Badge>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}


