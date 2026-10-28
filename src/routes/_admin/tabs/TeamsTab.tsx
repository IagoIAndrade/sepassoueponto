import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState, useEffect, useMemo, useRef } from "react";
import { toast } from "sonner";
import { 
  Share2, 
  Save, 
  Lock, 
  Unlock, 
  Shuffle, 
  Zap, 
  Trash2, 
  GripVertical,
  ChevronRight,
  UserPlus,
  Users,
  Search,
  Check,
  RefreshCw,
  MoreVertical,
  X,
  History,
  Calendar,
  MoreHorizontal
} from "lucide-react";
import { TeamShareDialog } from "@/components/TeamShareDialog";
import { useAdminGroup } from "@/lib/admin-group-context";
import { get_admin_event, admin_save_teams } from "@/lib/admin.functions";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { friendlyError } from "@/lib/error-messages";
import { 
  distributePlayers, 
  type TeamNumber, 
  positionLabel, 
  overallLevel 
} from "@/lib/skills";
import { PlayerAvatar } from "@/components/PlayerAvatar";
import { PlayerPhotoModal } from "@/components/PlayerPhotoModal";
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
  DragStartEvent,
  DragOverlay,
} from "@dnd-kit/core";
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
  useSortable,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { AppConfirmDialog } from "@/components/AppDialogs";
import { classifyRegistrations } from "@/lib/registration-classification";
import { useDebounce } from "@/hooks/use-debounce";

interface PlayerData {
  id: string; // registration_id
  player_id: string;
  player_name: string;
  primary_position: string | null;
  avatar_url?: string | null;
  skills?: any;
  phone_normalized?: string | null;
}

interface TeamData {
  team_number: number;
  players: PlayerData[];
}

export function TeamsTab() {
  const { groupId } = useAdminGroup();
  const getEvent = useServerFn(get_admin_event);
  const saveTeamsFn = useServerFn(admin_save_teams);
  const [selectedPlayerPhoto, setSelectedPlayerPhoto] = useState<{ id: string; name: string; avatar_path?: string | null; phone?: string | null; group_name?: string | null; position?: string | null } | null>(null);
  
  const [availablePlayers, setAvailablePlayers] = useState<PlayerData[]>([]);
  const [reserves, setReserves] = useState<PlayerData[]>([]);
  const [teams, setTeams] = useState<TeamData[]>([
    { team_number: 1, players: [] },
    { team_number: 2, players: [] },
    { team_number: 3, players: [] },
  ]);
  
  const [activeTeam, setActiveTeam] = useState<1 | 2 | 3>(1);
  const [searchTerm, setSearchTerm] = useState("");
  const [autosaveStatus, setAutosaveStatus] = useState<'saved' | 'saving' | 'error'>('saved');
  const [lockedPlayers, setLockedPlayers] = useState<Record<string, TeamNumber>>({});
  const [isDirty, setIsDirty] = useState(false);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [clearConfirmOpen, setClearConfirmOpen] = useState(false);
  const [shareDialogOpen, setShareDialogOpen] = useState(false);
  const [editingGroupId, setEditingGroupId] = useState<string | null>(null);

  const [lastState, setLastState] = useState<{available: PlayerData[], reserves: PlayerData[], teams: TeamData[]} | null>(null);

  useEffect(() => {
    (window as any).hasUnsavedChanges = isDirty;
    return () => { (window as any).hasUnsavedChanges = false; };
  }, [isDirty]);

  const { data: event, refetch, isLoading } = useQuery({
    queryKey: ["admin-teams", groupId],
    queryFn: () => getEvent({ data: { group_id: groupId } }),
    enabled: !!groupId,
  });

  // Log de entrada para o TeamShareDialog quando o evento carrega
  useEffect(() => {
    if (event) {
      /*
      console.log('[TeamsTab] Data Loaded', {
        eventId: event.event?.id,
        groupId: event.event?.group_id,
        registrationsCount: event.registrations?.length,
        teamsCount: event.teams?.length
      });
      */
    }
  }, [event]);

  // Debounced save
  const debouncedTeams = useDebounce(teams, 1000);
  const debouncedAvailable = useDebounce(availablePlayers, 1000);
  const debouncedReserves = useDebounce(reserves, 1000);

  const initialLoadDone = useRef(false);
  const loadedEventId = useRef<string | null>(null);

  // Ao trocar de turma/evento, recarrega o estado do zero
  useEffect(() => {
    const eid = event?.event?.id ?? null;
    if (eid && loadedEventId.current && loadedEventId.current !== eid) {
      initialLoadDone.current = false;
      setIsDirty(false);
    }
    if (eid) loadedEventId.current = eid;
    if (groupId) setEditingGroupId(groupId);
  }, [event, groupId]);

  // Inicialização do estado a partir do banco
  useEffect(() => {
    if (event && !initialLoadDone.current) {
      const mainLimit = event.event?.main_limit ?? event.settings?.main_limit ?? 18;
      
      // FONTE ÚNICA DE VERDADE: classificação cronológica (created_at ASC)
      const classified = classifyRegistrations((event.registrations || []) as any[], mainLimit);
      const toPlayerData = (list: any[]): PlayerData[] => list.map((p: any) => ({
          id: p.id,
          player_id: p.player_id,
          player_name: (p.player?.name || p.players?.name || "").trim() || "Sem nome",
          primary_position: p.player_skills?.primary_position || null,
          avatar_url: (p.player?.avatar_path || p.player_avatar_path || null),
          skills: p.player_skills || null,
          phone_normalized: (p.player as any)?.phone_normalized
        }));

      const allConfirmed = toPlayerData(classified.all);
      const starters = toPlayerData(classified.starters);
      const initialReserves = toPlayerData(classified.reserves);

      const assignedRegistrationIds = new Set<string>();
      const initialTeams: TeamData[] = [1, 2, 3].map(num => {
        const teamInDb = event.teams?.find((t: any) => t.team_number === num);
        const players = (teamInDb?.team_members || [])
          .map((tm: any) => allConfirmed.find((r) => r.id === tm.registration_id))
          .filter((p): p is PlayerData => !!p);
        
        players.forEach((p) => assignedRegistrationIds.add(p.id));
        return { team_number: num, players };
      });

      setTeams(initialTeams);
      setAvailablePlayers(starters.filter((r) => !assignedRegistrationIds.has(r.id)));
      setReserves(initialReserves.filter((r) => !assignedRegistrationIds.has(r.id)));
      setIsDirty(false);
      initialLoadDone.current = true;

      // Definir activeTeam inicial baseado no preenchimento
      const firstEmptyTeam = initialTeams.find(t => t.players.length < 6);
      if (firstEmptyTeam) setActiveTeam(firstEmptyTeam.team_number as 1 | 2 | 3);
    }
  }, [event]);

  // Logic to switch active team automatically
  useEffect(() => {
    const currentTeamPlayers = teams.find(t => t.team_number === activeTeam)?.players.length || 0;
    if (currentTeamPlayers >= 6) {
      if (activeTeam === 1) setActiveTeam(2);
      else if (activeTeam === 2) setActiveTeam(3);
    }
  }, [teams, activeTeam]);

  // Conjunto de todas inscrições ativas da rodada (titulares + reservas confirmados)
  const validRegistrationIds = useMemo(() => {
    const activeRegs = (event?.registrations || []).filter((r: any) => !r.cancelled_at);
    return new Set<string>(activeRegs.map((p: any) => p.id as string));
  }, [event]);

  // Autosave execution
  useEffect(() => {
    if (initialLoadDone.current && isDirty) {
      const performSave = async () => {
        setAutosaveStatus('saving');
        try {
          const eventId = event?.event?.id;
          if (!eventId) return;

          // Remove apenas inscrições canceladas/inexistentes dos times e disponíveis (não limpa setReserves)
          const hasStale = teams.some(t => t.players.some(p => !validRegistrationIds.has(p.id)));
          if (hasStale) {
            setTeams(prev => prev.map(t => ({
              ...t,
              players: t.players.filter(p => validRegistrationIds.has(p.id)),
            })));
            setAvailablePlayers(prev => prev.filter(p => validRegistrationIds.has(p.id)));
            return; // salva no próximo ciclo com o estado limpo
          }

          const assignments = teams.map(t => ({
            team_number: t.team_number,
            registration_ids: t.players.map(p => p.id)
          }));
          await saveTeamsFn({ data: { event_id: eventId, assignments } });
          setAutosaveStatus('saved');
          setIsDirty(false);
        } catch (e) {
          console.error("Autosave error:", e);
          setAutosaveStatus('error');
          toast.error(`Falha no autosave: ${friendlyError(e)}. Clique para tentar novamente.`, {
            id: "teams-autosave-error",
            action: {
              label: "Tentar novamente",
              onClick: () => handleManualSave()
            }
          });
        }
      };
      
      const timer = setTimeout(performSave, 1000);
      return () => clearTimeout(timer);
    }
  }, [debouncedTeams, debouncedAvailable, debouncedReserves, isDirty, event, validRegistrationIds]);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  const saveHistory = () => {
    setLastState({
      available: [...availablePlayers],
      reserves: [...reserves],
      teams: JSON.parse(JSON.stringify(teams))
    });
  };

  const undo = () => {
    if (lastState) {
      setAvailablePlayers(lastState.available);
      setReserves(lastState.reserves);
      setTeams(lastState.teams);
      setLastState(null);
      setIsDirty(true);
    }
  };

  const handleDragStart = (event: DragStartEvent) => {
    setActiveId(event.active.id as string);
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    setActiveId(null);
    if (!over) return;

    const activeId = active.id as string;
    const overId = over.id as string;

    if (activeId === overId) return;
    saveHistory();

    const all = [...availablePlayers, ...reserves, ...teams.flatMap(t => t.players)];
    const player = all.find(p => p.id === activeId);
    if (!player) return;

    const destId = overId;
    
    setAvailablePlayers(prev => prev.filter(p => p.id !== activeId));
    setReserves(prev => prev.filter(p => p.id !== activeId));
    setTeams(prev => prev.map(t => ({ ...t, players: t.players.filter(p => p.id !== activeId) })));

    if (destId === 'available' || availablePlayers.find(p => p.id === destId)) {
      setAvailablePlayers(prev => {
        const next = [...prev];
        const idx = next.findIndex(p => p.id === destId);
        if (idx !== -1) next.splice(idx, 0, player);
        else next.push(player);
        return next;
      });
    } else if (destId === 'reserves' || reserves.find(p => p.id === destId)) {
      setReserves(prev => {
        const next = [...prev];
        const idx = next.findIndex(p => p.id === destId);
        if (idx !== -1) next.splice(idx, 0, player);
        else next.push(player);
        return next;
      });
    } else {
      const teamNum = destId.startsWith('team-') 
        ? parseInt(destId.split('-')[1]) 
        : (teams.findIndex(t => t.players.find(p => p.id === destId)) + 1);
      
      if (teamNum > 0) {
        setTeams(prev => prev.map(t => {
          if (t.team_number === teamNum) {
            const nextPlayers = [...t.players];
            const idx = nextPlayers.findIndex(p => p.id === destId);
            if (idx !== -1) nextPlayers.splice(idx, 0, player);
            else nextPlayers.push(player);
            return { ...t, players: nextPlayers };
          }
          return t;
        }));
      }
    }
    setIsDirty(true);
  };

  const movePlayerManual = (player: PlayerData, target: 'available' | 'reserves' | 1 | 2 | 3) => {
    saveHistory();
    setAvailablePlayers(prev => prev.filter(p => p.id !== player.id));
    setReserves(prev => prev.filter(p => p.id !== player.id));
    setTeams(prev => prev.map(t => ({ ...t, players: t.players.filter(p => p.id !== player.id) })));

    if (target === 'available') {
      setAvailablePlayers(prev => [...prev, player]);
    } else if (target === 'reserves') {
      setReserves(prev => [...prev, player]);
    } else {
      setTeams(prev => prev.map(t => {
        if (t.team_number === target) return { ...t, players: [...t.players, player] };
        return t;
      }));
    }
    setIsDirty(true);
  };

  const swapPlayers = (p1Id: string, p2Id: string) => {
    saveHistory();
    // Logic to swap two players between teams or pool
    const allPlayers = [...availablePlayers, ...reserves, ...teams.flatMap(t => t.players)];
    const player1 = allPlayers.find(p => p.id === p1Id);
    const player2 = allPlayers.find(p => p.id === p2Id);
    
    if (!player1 || !player2) return;

    // Helper to find and remove
    const removeFromPool = (id: string) => {
      setAvailablePlayers(prev => prev.filter(p => p.id !== id));
      setReserves(prev => prev.filter(p => p.id !== id));
    };

    const removeFromTeams = (id: string) => {
      setTeams(prev => prev.map(t => ({
        ...t,
        players: t.players.filter(p => p.id !== id)
      })));
    };

    // Find targets
    const findTarget = (id: string) => {
      if (availablePlayers.some(p => p.id === id)) return 'available';
      if (reserves.some(p => p.id === id)) return 'reserves';
      const team = teams.find(t => t.players.some(p => p.id === id));
      return team?.team_number;
    };

    const t1 = findTarget(p1Id);
    const t2 = findTarget(p2Id);

    // Remove both
    removeFromPool(p1Id); removeFromPool(p2Id);
    removeFromTeams(p1Id); removeFromTeams(p2Id);

    // Add in swapped positions
    const addTo = (player: PlayerData, target: any) => {
      if (target === 'available') setAvailablePlayers(prev => [...prev, player]);
      else if (target === 'reserves') setReserves(prev => [...prev, player]);
      else if (typeof target === 'number') {
        setTeams(prev => prev.map(t => t.team_number === target ? { ...t, players: [...t.players, player] } : t));
      }
    };

    addTo(player1, t2);
    addTo(player2, t1);
    
    setIsDirty(true);
    toast.success(`Trocado: ${player1.player_name} ⇄ ${player2.player_name}`);
  };

  const handleDistribute = (mode: "balanced" | "random") => {
    saveHistory();
    const allToDistribute = [...availablePlayers, ...teams.flatMap(t => t.players)];
    if (allToDistribute.length === 0) {
      toast.error("Adicione jogadores à lista de disponíveis antes de equilibrar.");
      return;
    }

    const distPlayers = allToDistribute.map(p => ({
      id: p.id,
      player_id: p.player_id,
      name: p.player_name,
      skills: p.skills
    }));

    const result = distributePlayers(distPlayers, {
      mode,
      teamCount: 3,
      locked: lockedPlayers,
      avoidRepeat: true
    });

    const newTeams = [1, 2, 3].map(num => ({
      team_number: num,
      players: allToDistribute.filter(p => result.assign[p.id] === num)
    }));

    const assignedIds = new Set(Object.keys(result.assign));
    setAvailablePlayers(allToDistribute.filter(p => !assignedIds.has(p.id)));
    setTeams(newTeams);
    setIsDirty(true);

    if (result.warnings.length > 0) {
      toast.info(result.warnings[0]);
    }
  };

  const handleManualSave = async () => {
    const eventId = event?.event?.id;
    if (!eventId) return;
    if (groupId !== editingGroupId) {
       toast.error(`A turma foi alterada. Operação cancelada.`);
       return;
    }
    setAutosaveStatus('saving');
    try {
      const assignments = teams.map(t => ({
        team_number: t.team_number,
        registration_ids: t.players.map(p => p.id)
      }));
      await saveTeamsFn({ data: { event_id: eventId, assignments } });
      setAutosaveStatus('saved');
      setIsDirty(false);
      toast.success("Salvo manualmente.");
    } catch (e) {
      setAutosaveStatus('error');
      toast.error(friendlyError(e));
    }
  };

  const handleClear = async () => {
    saveHistory();
    const fromTeams = teams.flatMap(t => t.players);
    setAvailablePlayers(prev => [...prev, ...fromTeams]);
    setTeams(teams.map(t => ({ ...t, players: [] })));
    setLockedPlayers({});
    setIsDirty(true);
    setClearConfirmOpen(false);
  };

  const handleShare = () => {
    setShareDialogOpen(true);
  };

  const toggleLock = (registrationId: string, currentTeam: number) => {
    setLockedPlayers(prev => {
      const next = { ...prev };
      if (next[registrationId]) delete next[registrationId];
      else next[registrationId] = currentTeam as TeamNumber;
      return next;
    });
  };

  const activePlayer = activeId 
    ? [...availablePlayers, ...reserves, ...teams.flatMap(t => t.players)].find(p => p.id === activeId) 
    : null;

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 bg-white dark:bg-background/40 p-5 rounded-2xl border border-slate-200 dark:border-brand-border/50 shadow-sm dark:shadow-xl backdrop-blur-sm">
        <div className="space-y-1.5">
          <div className="flex items-center gap-2">
            <h3 className="text-xl md:text-2xl font-black text-slate-900 dark:text-brand-white uppercase Oswald tracking-tight flex items-center gap-2">
              <Users className="w-6 h-6 text-brand-gold" />
              Gestão de <span className="text-brand-gold">Equipes</span>
              <span className="text-[10px] text-brand-silver/50 ml-2 border-l border-brand-border/50 pl-2">
                Turma: {((event?.settings as any)?.group?.name || "TURMA").toUpperCase()}
              </span>
            </h3>
            {autosaveStatus !== 'saved' && (
              <Badge 
                variant="outline" 
                onClick={autosaveStatus === 'error' ? handleManualSave : undefined}
                className={cn(
                  "text-[8px] Oswald uppercase px-1.5 h-4 border-2 transition-all",
                  autosaveStatus === 'saving' && "text-brand-gold border-brand-gold/20 animate-pulse",
                  autosaveStatus === 'error' && "text-red-400 border-red-400/40 hover:bg-red-500/10 cursor-pointer"
                )}
                title={autosaveStatus === 'error' ? "Erro ao salvar. Clique para tentar novamente" : undefined}
              >
                {autosaveStatus === 'saving' ? 'Sincronizando...' : 'Erro (Repetir)'}
              </Badge>
            )}
          </div>
          {event?.event && (
            <p className="text-[10px] text-brand-silver/50 uppercase Oswald font-bold tracking-[0.2em] flex items-center gap-1.5">
              <Calendar className="w-3 h-3 text-brand-gold/50" />
              Data: {new Date(event.event.event_date + "T12:00:00").toLocaleDateString('pt-BR')}
            </p>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="bg-slate-100 dark:bg-white/5 p-1 rounded-xl border border-slate-200 dark:border-white/5 flex gap-1">
            <Button 
              size="sm" variant="ghost" onClick={() => handleDistribute("balanced")} 
              disabled={isLoading || (availablePlayers.length === 0 && teams.flatMap(t => t.players).length === 0)}
              className="h-9 px-3 text-[10px] text-pink-600 dark:text-brand-gold hover:text-pink-600 dark:hover:text-brand-gold hover:bg-pink-50 dark:hover:bg-brand-gold/10 font-bold Oswald uppercase flex items-center gap-1.5 transition-all active:scale-95"
            >
              <Zap className="w-3.5 h-3.5" /> Equilibrar
            </Button>
            <Button 
              size="sm" variant="ghost" onClick={() => handleDistribute("random")} 
              disabled={isLoading || (availablePlayers.length === 0 && teams.flatMap(t => t.players).length === 0)}
              className="h-9 px-3 text-[10px] text-slate-500 dark:text-brand-silver hover:text-slate-900 dark:hover:text-brand-white hover:bg-slate-200 dark:hover:bg-white/5 font-bold Oswald uppercase flex items-center gap-1.5 transition-all active:scale-95"
            >
              <Shuffle className="w-3.5 h-3.5" /> Aleatório
            </Button>
          </div>

          <div className="flex items-center gap-2">
            {lastState && (
              <Button 
                size="sm" onClick={undo} variant="outline" 
                className="h-9 px-3 text-[10px] border-brand-gold/20 text-brand-gold hover:bg-brand-gold/10 font-bold Oswald uppercase flex items-center gap-1.5 animate-in fade-in zoom-in duration-300"
              >
                <History className="w-3.5 h-3.5" /> Desfazer
              </Button>
            )}
            
            <Button 
              size="sm" 
              onClick={handleManualSave} 
              disabled={autosaveStatus === 'saving' || isLoading}
              className="h-9 px-3.5 text-[10px] bg-pink-600 hover:bg-pink-700 dark:bg-brand-gold dark:hover:bg-brand-gold/90 text-white dark:text-brand-blue font-black Oswald uppercase flex items-center gap-1.5 shadow-sm active:scale-95 transition-all"
            >
              <Save className={cn("w-3.5 h-3.5", autosaveStatus === 'saving' && "animate-spin")} />
              {autosaveStatus === 'saving' ? 'Salvando...' : 'Salvar Agora'}
            </Button>

            <Button size="sm" onClick={() => setShareDialogOpen(true)} variant="outline" 
              disabled={teams.every(t => t.players.length === 0)}
              className="h-9 px-3 text-[10px] border-pink-500/30 dark:border-brand-gold/30 text-pink-600 dark:text-brand-gold hover:bg-pink-50 dark:hover:bg-brand-gold/10 font-bold Oswald uppercase flex items-center gap-1.5 shadow-sm dark:shadow-lg dark:shadow-brand-gold/5"
            >
              <Share2 className="w-3.5 h-3.5" /> Compartilhar
            </Button>

            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button size="sm" variant="ghost" className="h-9 w-9 p-0 text-brand-silver hover:bg-white/5 border border-brand-border/50">
                  <MoreVertical className="w-4 h-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="bg-white dark:bg-brand-surface border-slate-200 dark:border-brand-border text-slate-900 dark:text-brand-white Oswald p-1 min-w-[160px]">
                <DropdownMenuItem 
                  onClick={() => setClearConfirmOpen(true)}
                  className="text-[10px] uppercase font-bold tracking-widest text-red-400 focus:text-red-400 focus:bg-red-400/10 cursor-pointer py-2.5 px-3"
                >
                  <Trash2 className="w-3.5 h-3.5 mr-2" /> Resetar Equipes
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      </div>

      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragStart={handleDragStart}
        onDragEnd={handleDragEnd}
      >
        <div className="flex flex-col lg:flex-row gap-6 items-start">
          {/* Coluna de Disponíveis (28% aprox) */}
          <div className="w-full lg:w-[320px] space-y-4 shrink-0">
            {/* Seletor de Time Ativo */}
            <Card className="p-2 bg-slate-50 dark:bg-brand-surface/60 border-slate-200 dark:border-brand-gold/20 Oswald uppercase shadow-sm dark:shadow-none">
              <p className="text-[9px] font-bold text-slate-500 dark:text-brand-silver mb-2 tracking-wider">Adicionar jogadores em:</p>
              <div className="grid grid-cols-3 gap-2">
                {[1, 2, 3].map((num) => {
                  const count = teams.find(t => t.team_number === num)?.players.length || 0;
                  const isActive = activeTeam === num;
                  return (
                    <Button
                      key={num}
                      variant={isActive ? "default" : "outline"}
                      size="sm"
                      onClick={() => setActiveTeam(num as 1 | 2 | 3)}
                      className={cn(
                        "h-10 flex flex-col items-center justify-center gap-0.5 Oswald text-[10px] transition-all",
                        isActive ? "bg-pink-600 dark:bg-brand-gold text-white border-pink-600 dark:border-brand-gold" : "border-slate-200 dark:border-brand-border text-slate-500 dark:text-brand-silver opacity-60"
                      )}
                    >
                      <div className="flex items-center gap-1">
                        {isActive && <Check className="w-2.5 h-2.5" />}
                        TIME {num}
                      </div>
                      <span className="text-[8px] opacity-70">{count}/6</span>
                    </Button>
                  );
                })}
              </div>
            </Card>

            {/* Disponíveis com Busca e Scroll */}
            <Card className="p-0 bg-white dark:bg-brand-surface/40 border-slate-200 dark:border-brand-border overflow-hidden flex flex-col max-h-[600px] shadow-sm dark:shadow-none">
              <div className="bg-slate-50 dark:bg-muted/30 p-2.5 border-b border-slate-200 dark:border-brand-border space-y-2">
                <div className="flex justify-between items-center">
                  <h4 className="text-[10px] font-bold text-pink-600 dark:text-brand-gold uppercase tracking-widest Oswald">
                    Disponíveis
                  </h4>
                  <Badge variant="outline" className="text-[9px] border-pink-600/20 dark:border-brand-gold/20 text-pink-600 dark:text-brand-gold Oswald">{availablePlayers.length}</Badge>
                </div>
                <div className="relative">
                  <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3 h-3 text-slate-400 dark:text-brand-silver/40" />
                  <Input 
                    placeholder="BUSCAR JOGADOR..." 
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value.toUpperCase())}
                    className="h-7 pl-7 bg-slate-100 dark:bg-brand-surface/50 border-slate-200 dark:border-brand-border/40 text-[9px] Oswald uppercase text-slate-900 dark:text-white placeholder:text-slate-400 dark:placeholder:text-brand-silver/30"
                  />
                </div>
              </div>
              <div className="p-2 overflow-y-auto custom-scrollbar flex-1 min-h-[100px]">
                <SortableContext id="available" items={availablePlayers.map(p => p.id)} strategy={verticalListSortingStrategy}>
                  <div id="available" className="space-y-1">
                    {availablePlayers
                      .filter(p => !searchTerm || p.player_name.toUpperCase().includes(searchTerm))
                      .map((player) => (
                        <PlayerRow 
                          key={player.id} 
                          player={player} 
                          onMove={(target: 'available' | 'reserves' | 1 | 2 | 3) => movePlayerManual(player, target)}
                          onClick={() => movePlayerManual(player, activeTeam)}
                          tooltip={`Adicionar ao Time ${activeTeam}`}
                          onPhotoClick={setSelectedPlayerPhoto}
                        />
                      ))}
                    {availablePlayers.length === 0 && (
                      <div className="flex flex-col items-center justify-center py-8 border-2 border-dashed border-slate-200 dark:border-brand-border/10 rounded">
                        <p className="text-[9px] text-slate-400 dark:text-brand-silver Oswald uppercase opacity-50 dark:opacity-30">Vazio</p>
                      </div>
                    )}
                  </div>
                </SortableContext>
              </div>
            </Card>

            {/* Reservas */}
            {(reserves.length > 0 || isLoading) && (
              <Card className="p-0 bg-slate-50 dark:bg-brand-surface/20 border-slate-200 dark:border-brand-border/40 overflow-hidden shadow-sm dark:shadow-none">
                <div className="bg-slate-100 dark:bg-muted/20 p-2 border-b border-slate-200 dark:border-brand-border/20 flex justify-between items-center">
                  <h4 className="text-[9px] font-bold text-slate-500 dark:text-brand-silver uppercase Oswald">
                    Reservas
                  </h4>
                  <Badge variant="outline" className="text-[8px] border-brand-border/20 text-brand-silver/50 Oswald">{reserves.length}</Badge>
                </div>
                <div className="p-2 max-h-[200px] overflow-y-auto custom-scrollbar">
                  <SortableContext id="reserves" items={reserves.map(p => p.id)} strategy={verticalListSortingStrategy}>
                    <div id="reserves" className="space-y-1">
                      {reserves.map((player) => (
                        <PlayerRow 
                          key={player.id} 
                          player={player} 
                          onMove={(target: 'available' | 'reserves' | 1 | 2 | 3) => movePlayerManual(player, target)}
                          size="compact"
                          onPhotoClick={setSelectedPlayerPhoto}
                        />
                      ))}
                    </div>
                  </SortableContext>
                </div>
              </Card>
            )}
          </div>

          {/* Times (Grid horizontal no Desktop) */}
          <div className="flex-1 grid gap-4 md:grid-cols-3 w-full">
            {teams.map((team) => {
              const isActive = activeTeam === team.team_number;
              return (
                <Card key={team.team_number} className={cn(
                  "p-0 bg-white dark:bg-brand-surface/40 border-slate-200 dark:border-brand-border overflow-hidden transition-all shadow-sm dark:shadow-none",
                  isActive && "ring-2 ring-pink-500 dark:ring-brand-gold ring-inset border-pink-500/40 dark:border-brand-gold/40 shadow-sm dark:shadow-lg dark:shadow-brand-gold/5"
                )}>
                  <div className={cn(
                    "p-2.5 border-b border-slate-200 dark:border-brand-border flex justify-between items-center",
                    isActive ? "bg-pink-50 dark:bg-brand-gold/10" : "bg-slate-50 dark:bg-muted/20"
                  )}>
                    <div className="flex items-center gap-2">
                      <h4 className={cn(
                        "text-[10px] font-bold uppercase tracking-widest Oswald",
                        isActive ? "text-pink-600 dark:text-brand-gold" : "text-slate-500 dark:text-brand-silver"
                      )}>
                        Time {team.team_number}
                      </h4>
                      {isActive && <Badge className="bg-pink-600 dark:bg-brand-gold text-white text-[8px] h-4 px-1 Oswald">ATIVO</Badge>}
                    </div>
                    <Badge variant="outline" className={cn(
                      "text-[9px] border-pink-600/20 dark:border-brand-gold/20 Oswald font-bold",
                      team.players.length > 6 ? "text-red-500 dark:text-red-400 border-red-500/20 dark:border-red-400/20" : "text-pink-600 dark:text-brand-gold"
                    )}>
                      {team.players.length} / 6
                    </Badge>
                  </div>
                  
                  {isActive && team.players.length < 6 && (
                    <div className="bg-pink-50 dark:bg-brand-gold/5 py-1.5 px-2 border-b border-pink-100 dark:border-brand-gold/10 flex items-center justify-center animate-pulse">
                      <p className="text-[8px] text-pink-600/60 dark:text-brand-gold/60 font-bold Oswald uppercase">+ Clique nos jogadores para adicionar</p>
                    </div>
                  )}

                  <div className="p-2 min-h-[300px]">
                    <SortableContext id={`team-${team.team_number}`} items={team.players.map(p => p.id)} strategy={verticalListSortingStrategy}>
                      <div id={`team-${team.team_number}`} className="space-y-1 min-h-[250px]">
                        {team.players.map((player) => (
                          <PlayerRow 
                            key={player.id} 
                            player={player} 
                            isLocked={!!lockedPlayers[player.id]}
                            onToggleLock={() => toggleLock(player.id, team.team_number)}
                            onMove={(target: 'available' | 'reserves' | 1 | 2 | 3) => movePlayerManual(player, target)}
                            isTeamRow
                            currentTeam={team.team_number}
                            onSwap={(otherId: string) => swapPlayers(player.id, otherId)}
                            onPhotoClick={setSelectedPlayerPhoto}
                          />
                        ))}
                        {team.players.length === 0 && (
                          <div className="flex flex-col items-center justify-center py-12 border-2 border-dashed border-slate-300 dark:border-brand-border/10 rounded opacity-50 dark:opacity-20">
                            <Users className="w-6 h-6 mb-2 text-slate-400 dark:text-brand-silver" />
                            <p className="text-[8px] text-slate-400 dark:text-brand-silver Oswald uppercase">Solte ou clique aqui</p>
                          </div>
                        )}
                      </div>
                    </SortableContext>
                  </div>
                </Card>
              );
            })}
          </div>
        </div>

        <DragOverlay>
          {activePlayer ? (
            <div className="flex items-center gap-2 p-2 bg-pink-600 dark:bg-brand-gold text-white rounded shadow-2xl opacity-90 scale-105 transition-transform border border-pink-600 dark:border-brand-gold">
              <GripVertical className="w-3 h-3 opacity-50" />
              <div className="min-w-0 flex-1">
                <p className="text-[10px] font-bold uppercase Oswald truncate">{activePlayer.player_name}</p>
              </div>
            </div>
          ) : null}
        </DragOverlay>
      </DndContext>

      <AppConfirmDialog
        open={clearConfirmOpen}
        onOpenChange={setClearConfirmOpen}
        title={`Limpar times? - ${((event?.settings as any)?.group?.name || "TURMA").toUpperCase()}`}
        description={`Todos os jogadores voltarão para a lista de disponíveis nesta rodada. A formação salva será perdida ao clicar em Salvar depois.`}
        onConfirm={handleClear}
      />
      <TeamShareDialog 
        open={shareDialogOpen} 
        onOpenChange={setShareDialogOpen} 
        teams={teams}
        groupName={event?.settings?.event_name || undefined}
        eventDate={event?.event?.event_date || undefined}
      />

      <PlayerPhotoModal
        open={!!selectedPlayerPhoto}
        onOpenChange={(open) => !open && setSelectedPlayerPhoto(null)}
        player={selectedPlayerPhoto}
      />
    </div>
  );
}

function PlayerRow({ 
  player, 
  isLocked, 
  onToggleLock, 
  onMove,
  onClick,
  size = "default",
  tooltip,
  isTeamRow,
  currentTeam,
  onSwap,
  onPhotoClick
}: { 
  player: PlayerData; 
  isLocked?: boolean; 
  onToggleLock?: () => void;
  onMove: (target: 'available' | 'reserves' | 1 | 2 | 3) => void;
  onClick?: () => void;
  size?: "default" | "compact";
  tooltip?: string;
  isTeamRow?: boolean;
  currentTeam?: number;
  onSwap?: (otherId: string) => void;
  onPhotoClick?: (player: any) => void;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging
  } = useSortable({ id: player.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.3 : 1,
    zIndex: isDragging ? 50 : undefined
  };

  const level = overallLevel(player.skills) ?? 0;
  const pos = player.primary_position ? positionLabel(player.primary_position) : null;

  return (
    <div
      ref={setNodeRef}
      style={style}
      onClick={onClick}
      title={tooltip}
      className={cn(
        "group flex items-center justify-between gap-2 p-2 rounded-xl transition-all duration-200 border",
        isTeamRow 
          ? "bg-slate-50 dark:bg-background/40 border-slate-200 dark:border-brand-border/30 hover:border-pink-500/30 dark:hover:border-brand-gold/30" 
          : "bg-white dark:bg-white/5 border-slate-200 dark:border-transparent hover:border-pink-500/20 dark:hover:border-brand-gold/20 hover:bg-slate-50 dark:hover:bg-white/10",
        size === "compact" ? "p-1.5" : "p-2",
        isDragging && "scale-[1.02] shadow-2xl z-50 border-brand-gold bg-brand-surface",
        onClick && "cursor-pointer"
      )}
    >
      <div className="flex items-center gap-2 min-w-0 flex-1">
        <div 
          className="cursor-grab active:cursor-grabbing p-1 text-slate-300 dark:text-brand-silver/20 group-hover:text-pink-500/40 dark:group-hover:text-brand-gold/40 transition-colors"
          {...attributes} 
          {...listeners}
          onClick={(e) => e.stopPropagation()}
        >
          <GripVertical className="w-3.5 h-3.5" />
        </div>

        <div className="relative shrink-0">
          <PlayerAvatar 
            path={player.avatar_url} 
            name={player.player_name} 
            size={size === "compact" ? "xs" : "sm"}
            className="h-[30px] w-[30px] min-w-[30px] min-h-[30px] rounded-full border border-brand-border group-hover:border-brand-gold/50 transition-all cursor-pointer shrink-0"
            onClick={(e) => {
              e.stopPropagation();
              onPhotoClick?.({
                id: player.player_id || player.id,
                name: player.player_name,
                avatar_path: player.avatar_url,
                phone: player.phone_normalized,
                group_name: "EQUIPES DA RODADA",
                position: pos
              });
            }}
          />
          {level > 0 && (
            <div className="absolute -top-1 -right-1 bg-pink-600 dark:bg-brand-gold text-white text-[7px] font-black px-1 rounded-full border border-background shadow-sm">
              {level.toFixed(1)}
            </div>
          )}
        </div>

        <div className="min-w-0 flex-1">
          <p className={cn(
            "text-[10px] md:text-[11px] font-bold uppercase Oswald truncate tracking-tight",
            isTeamRow ? "text-brand-white" : "text-brand-silver group-hover:text-brand-white"
          )}>
            {player.player_name}
          </p>
          {pos && (
            <p className="text-[8px] text-pink-600/60 dark:text-brand-gold/60 font-black Oswald uppercase tracking-widest leading-none mt-0.5">
              {pos}
            </p>
          )}
        </div>
      </div>

      <div className="flex items-center gap-1 shrink-0 ml-1">
        {isTeamRow && onToggleLock && (
          <Button
            variant="ghost"
            size="icon"
            onClick={(e) => { e.stopPropagation(); onToggleLock(); }}
            className={cn(
              "h-7 w-7 rounded-lg transition-all",
              isLocked ? "text-brand-gold bg-brand-gold/10" : "text-brand-silver/30 hover:text-brand-gold hover:bg-brand-gold/10"
            )}
          >
            {isLocked ? <Lock className="w-3 h-3" /> : <Unlock className="w-3 h-3" />}
          </Button>
        )}

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" className="h-7 w-7 text-brand-silver/30 group-hover:text-brand-silver hover:bg-white/5 rounded-lg" onClick={(e) => e.stopPropagation()}>
              <MoreHorizontal className="w-3.5 h-3.5" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="bg-white dark:bg-brand-surface border-slate-200 dark:border-brand-border text-slate-900 dark:text-brand-white Oswald p-1 min-w-[140px]">
            <div className="px-2 py-1.5 text-[8px] font-black text-brand-silver/50 uppercase tracking-widest border-b border-brand-border/50 mb-1">
              Mover Jogador
            </div>
            <DropdownMenuItem onClick={() => onMove('available')} className="text-[9px] uppercase font-bold tracking-wider cursor-pointer py-2 hover:bg-brand-gold/10 hover:text-brand-gold">
              Lista Disponíveis
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => onMove('reserves')} className="text-[9px] uppercase font-bold tracking-wider cursor-pointer py-2 hover:bg-brand-gold/10 hover:text-brand-gold">
              Lista Reservas
            </DropdownMenuItem>
            <DropdownMenuSeparator className="bg-brand-border/50" />
            {[1, 2, 3].map(num => (
              <DropdownMenuItem 
                key={num} 
                onClick={() => onMove(num as 1 | 2 | 3)} 
                disabled={currentTeam === num}
                className="text-[9px] uppercase font-bold tracking-wider cursor-pointer py-2 hover:bg-brand-gold/10 hover:text-brand-gold"
              >
                Time {num} {currentTeam === num && "(Atual)"}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>
  );
}
