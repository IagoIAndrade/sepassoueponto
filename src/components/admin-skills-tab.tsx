import { useEffect, useMemo, useState } from "react";
import { ShieldCheck, Zap, MoreHorizontal, Radar } from "lucide-react";
import * as SliderPrimitive from "@radix-ui/react-slider";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";

import { cn } from "@/lib/utils";
import { PlayerAvatar } from "@/components/PlayerAvatar";
import { SkillScoreSelector } from "./SkillScoreSelector";


import { ConfigSection } from "@/components/admin-config-section";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

import {
  admin_list_player_skills,
  admin_upsert_player_skills,
  admin_clear_player_skills,
  admin_get_player_self_rating,
  admin_get_skill_weights,
  admin_update_skill_weights,
  type AdminSkillRow,
} from "@/lib/admin.functions";
import {
  DEFAULT_WEIGHTS,
  POSITIONS,
  SKILL_KEYS,
  SKILL_LABELS,
  fmt1,
  isEvaluated,
  overallLevel,
  positionLabel,
  type SkillWeights,
  type SkillKey,
  type PlayerSkills,
} from "@/lib/skills";
import { friendlyError } from "@/lib/error-messages";

type EvalFilter = "all" | "yes" | "no";
type StatusFilter = "all" | "active" | "inactive";
type SortKey = "name" | "level_desc" | "level_asc" | "updated_desc" | "updated_asc";

function toSkills(r: AdminSkillRow) {
  const s: any = {
    player_id: r.player_id,
    primary_position: r.primary_position,
    height_cm: r.height_cm,
    notes: r.notes,
    updated_at: r.updated_at,
    updated_by: r.updated_by,
  };
  SKILL_KEYS.forEach((k) => {
    s[k] = (r as any)[k];
  });
  return s as PlayerSkills;
}

function formatDateTime(iso: string | null): string {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleDateString("pt-BR", {
      day: "2-digit",
      month: "2-digit",
      year: "2-digit",
    });
  } catch {
    return "—";
  }
}

export function SkillsTab() {
  const qc = useQueryClient();
  const list = useServerFn(admin_list_player_skills);
  const getWeights = useServerFn(admin_get_skill_weights);
  const upsert = useServerFn(admin_upsert_player_skills);
  const clear = useServerFn(admin_clear_player_skills);

  const [query, setQuery] = useState("");
  const [status, setStatus] = useState<StatusFilter>("all");
  const [evaluated, setEvaluated] = useState<EvalFilter>("all");
  const [sort, setSort] = useState<SortKey>("name");
  const [editing, setEditing] = useState<AdminSkillRow | null>(null);
  const [confirmClear, setConfirmClear] = useState<AdminSkillRow | null>(null);
  const [busy, setBusy] = useState(false);

  const weightsQ = useQuery({
    queryKey: ["skill-weights"],
    queryFn: () => getWeights(),
    staleTime: 60_000,
  });
  const weights: SkillWeights = (weightsQ.data?.weights as SkillWeights) ?? DEFAULT_WEIGHTS;

  const listQ = useQuery({
    queryKey: ["player-skills", query, status, evaluated],
    queryFn: () => list({ data: { query, status, evaluated, sort: "name" } }),
  });

  const rows = useMemo(() => {
    const arr = [...(listQ.data?.players ?? [])];
    const lvl = (r: AdminSkillRow) => overallLevel(toSkills(r) as any, weights) ?? 0;
    arr.sort((a, b) => {
      switch (sort) {
        case "level_desc":
          return (lvl(b) ?? -1) - (lvl(a) ?? -1);
        case "level_asc":
          return (lvl(a) ?? 99) - (lvl(b) ?? 99);
        case "updated_desc":
          return (b.updated_at ?? "").localeCompare(a.updated_at ?? "");
        case "updated_asc":
          return (a.updated_at ?? "9999").localeCompare(b.updated_at ?? "9999");
        default:
          return a.name.localeCompare(b.name, "pt-BR");
      }
    });
    return arr;
  }, [listQ.data, sort, weights]);

  async function handleSave(form: EditForm) {
    setBusy(true);
    try {
      const payload: any = {
        player_id: form.player_id,
        primary_position: form.primary_position as any,
        height_cm: form.height_cm,
        notes: form.notes || null,
      };
      SKILL_KEYS.forEach((k) => {
        payload[k] = (form as any)[k];
      });
      await upsert({ data: payload });
      toast.success("Avaliação salva.");
      setEditing(null);
      await listQ.refetch();
      qc.invalidateQueries({ queryKey: ["admin-players-global"] });
    } catch (e) {
      toast.error(friendlyError(e));
    } finally {
      setBusy(false);
    }
  }

  async function handleClear() {
    if (!confirmClear) return;
    setBusy(true);
    try {
      await clear({ data: { player_id: confirmClear.player_id } });
      toast.success("Avaliação removida.");
      setConfirmClear(null);
      await listQ.refetch();
      qc.invalidateQueries({ queryKey: ["admin-players-global"] });
    } catch (e) {
      toast.error(friendlyError(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-3">
      <div>
        <h3 className="font-display text-base font-bold uppercase tracking-wide text-brand-white">
          Habilidades dos jogadores
        </h3>
        <p className="text-[11px] text-muted-foreground">
          A avaliação é única por jogador e vale para todas as turmas.
        </p>
      </div>

      <div className="flex flex-col gap-3 p-4 bg-brand-surface/30 border border-brand-border rounded-xl">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <div className="space-y-1.5">
            <Label className="text-[10px] uppercase font-bold text-brand-silver Oswald tracking-widest">Busca de jogador</Label>
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Nome ou WhatsApp"
              className="bg-brand-background border-brand-border"
            />
          </div>

          <div className="space-y-1.5">
            <Label className="text-[10px] uppercase font-bold text-brand-silver Oswald tracking-widest">Situação</Label>
            <Select value={`${status}|${evaluated}`} onValueChange={(v) => {
              const [s, e] = v.split("|");
              setStatus(s as StatusFilter);
              setEvaluated(e as EvalFilter);
            }}>
              <SelectTrigger className="text-xs bg-brand-background border-brand-border">
                <SelectValue placeholder="Filtro" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all|all">Todos os jogadores</SelectItem>
                <SelectItem value="all|yes">Com avaliação técnica</SelectItem>
                <SelectItem value="all|no">Sem avaliação técnica</SelectItem>
                <SelectItem value="active|all">Apenas Ativos</SelectItem>
                <SelectItem value="inactive|all">Apenas Inativos</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label className="text-[10px] uppercase font-bold text-brand-silver Oswald tracking-widest">Ordenação</Label>
            <Select value={sort} onValueChange={(v) => setSort(v as SortKey)}>
              <SelectTrigger className="text-xs bg-brand-background border-brand-border">
                <SelectValue placeholder="Ordenar por" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="name">Ordem alfabética</SelectItem>
                <SelectItem value="level_desc">Maior nível geral</SelectItem>
                <SelectItem value="level_asc">Menor nível geral</SelectItem>
                <SelectItem value="updated_desc">Atualizados recentemente</SelectItem>
                <SelectItem value="updated_asc">Atualizados há mais tempo</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
      </div>

      {listQ.isLoading && <p className="text-sm text-muted-foreground">Carregando…</p>}
      {!listQ.isLoading && rows.length === 0 && (
        <p className="text-sm text-muted-foreground">Nenhum jogador encontrado.</p>
      )}

      <div className="space-y-2">
        {rows.map((r) => {
          const s = toSkills(r) as any;
          const selfRatingRaw = (r as any).self_rating;
          const selfLevel = selfRatingRaw ? overallLevel(selfRatingRaw, weights) : null;
          const lvl = overallLevel(s, weights);
          return (
            <Card key={r.player_id} className="p-4 border border-brand-border bg-brand-surface/40 hover:bg-brand-surface/60 transition-colors">
              <div className="flex items-start justify-between gap-4">
                <div className="flex items-center gap-3 min-w-0">
                  <PlayerAvatar path={(r as any).avatar_path} name={r.name} size="sm" />
                  <div className="min-w-0">
                    <p className="text-sm font-black Oswald uppercase text-brand-white truncate">{r.name}</p>
                    <p className="text-[10px] font-bold text-brand-silver uppercase Oswald">
                      {(r.primary_position && r.primary_position !== "undefined" && r.primary_position !== "Sem posição definida") ? positionLabel(r.primary_position) : ""}
                      {r.height_cm ? ` · ${r.height_cm}cm` : ""}
                    </p>
                  </div>
                </div>
                
                <div className="flex flex-col items-end gap-1 shrink-0">
                  {lvl !== null ? (
                    <div className="flex flex-col items-end gap-1">
                      <Badge variant="outline" className="border-brand-gold/50 bg-brand-gold/15 text-brand-gold Oswald text-[10px] font-black px-2 py-0.5 whitespace-nowrap">
                        TÉCNICO: {fmt1(lvl)}
                      </Badge>
                      {selfLevel !== null && (
                        <Badge variant="outline" className="border-brand-silver/50 bg-brand-silver/10 text-brand-silver Oswald text-[10px] font-bold px-2 py-0.5 whitespace-nowrap">
                          AUTO: {fmt1(selfLevel)}
                        </Badge>
                      )}
                    </div>
                  ) : (
                    <div className="flex flex-col items-end gap-1">
                      <Badge variant="outline" className="border-brand-border bg-brand-surface/50 text-brand-silver/30 Oswald text-[10px] font-bold px-2 py-0.5 whitespace-nowrap">
                        {SKILL_KEYS.every(k => s[k] === null || s[k] === undefined) 
                          ? "NÃO AVALIADO" 
                          : `INCOMPLETA (${8 - SKILL_KEYS.filter(k => s[k] === null || s[k] === undefined).length}/8)`}
                      </Badge>
                      {selfLevel !== null && (
                        <Badge variant="outline" className="border-brand-silver/50 bg-brand-silver/10 text-brand-silver Oswald text-[10px] font-bold px-2 py-0.5 whitespace-nowrap">
                          AUTO: {fmt1(selfLevel)}
                        </Badge>
                      )}
                    </div>
                  )}
                </div>
              </div>

              <div className="mt-3 grid grid-cols-4 gap-1.5 md:grid-cols-8">
                {SKILL_KEYS.map((k) => (
                  <div key={k} className="rounded-md bg-brand-background/40 p-1.5 border border-brand-border/50 text-center">
                    <p className="text-[8px] font-black uppercase text-brand-silver/60 Oswald truncate mb-0.5">
                      {SKILL_LABELS[k].split("/")[0]}
                    </p>
                    <p className={cn("text-xs font-black Oswald", typeof s[k] === 'number' ? "text-brand-white" : "text-brand-silver/30")}>
                      {typeof s[k] === 'number' ? s[k] : "—"}
                    </p>
                  </div>
                ))}
              </div>

              <div className="mt-3 flex items-center justify-between pt-2 border-t border-brand-border/30">
                <span className="text-[9px] font-bold text-brand-silver/50 Oswald uppercase">
                  {r.updated_at ? `Última: ${formatDateTime(r.updated_at)}` : "Sem histórico"}
                </span>
                <div className="flex gap-2">
                  {(lvl !== null || r.updated_at) && (
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-7 text-[9px] font-black Oswald uppercase text-brand-error/60 hover:text-brand-error hover:bg-brand-error/10"
                      onClick={() => setConfirmClear(r)}
                    >
                      Excluir avaliação
                    </Button>
                  )}
                  <Button 
                    size="sm" 
                    variant="secondary" 
                    className="h-7 text-[9px] font-black Oswald uppercase bg-brand-gold/10 text-brand-gold hover:bg-brand-gold hover:text-brand-blue border-none"
                    onClick={() => setEditing(r)}
                  >
                    {lvl !== null ? "Editar avaliação" : "Avaliar"}
                  </Button>
                </div>
              </div>
            </Card>
          );
        })}
      </div>

      {editing && (
        <SkillDialog
          row={editing}
          weights={weights}
          busy={busy}
          onCancel={() => (busy ? null : setEditing(null))}
          onSave={handleSave}
        />
      )}


      <AlertDialog
        open={!!confirmClear}
        onOpenChange={(o) => !o && !busy && setConfirmClear(null)}
      >
        <AlertDialogContent className="bg-brand-surface border-brand-border text-brand-white">
          <AlertDialogHeader>
            <AlertDialogTitle className="font-oswald text-xl uppercase tracking-tight text-red-500">Excluir avaliação</AlertDialogTitle>
            <AlertDialogDescription className="text-brand-silver">
              As notas da avaliação técnica de {confirmClear?.name} serão apagadas. A autoavaliação do jogador não será afetada.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busy} className="border-brand-border text-brand-white hover:bg-brand-surface/50">Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleClear} disabled={busy} className="bg-red-600 hover:bg-red-700 text-white">
              {busy ? "Excluindo…" : "Excluir avaliação"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

type EditForm = {
  player_id: string;
} & Partial<Record<SkillKey, number | null>> & {
  primary_position: string;
  height_cm: number | null;
  notes: string;
} & { [K in SkillKey]?: number | null };

const SCORE_BANDS: Array<{ max: number; label: string; fill: string; text: string }> = [
  { max: 1, label: "Muito fraco", fill: "bg-red-500", text: "text-red-400" },
  { max: 2, label: "Fraco", fill: "bg-red-500", text: "text-amber-400" },
  { max: 3, label: "Médio", fill: "bg-amber-400", text: "text-amber-300" },
  { max: 4, label: "Bom", fill: "bg-sky-500", text: "text-sky-400" },
  { max: 5, label: "Excelente", fill: "bg-emerald-500", text: "text-emerald-400" },
];

function scoreLabel(v: number): string {
  return SCORE_BANDS.find((b) => v <= b.max)?.label ?? "—";
}

function scoreFill(v: number): string {
  if (v <= 1) return "bg-red-500";
  if (v <= 3) return "bg-amber-400";
  if (v <= 4) return "bg-sky-500";
  return "bg-emerald-500";
}

function scoreText(v: number): string {
  if (v <= 1) return "text-red-400";
  if (v <= 3) return "text-amber-300";
  if (v <= 4) return "text-sky-400";
  return "text-emerald-400";
}

// Legacy ScoreSlider replaced by SkillScoreSelector in new dialog


function SkillDialog({
  row,
  weights,
  busy,
  onCancel,
  onSave,
}: {
  row: AdminSkillRow;
  weights: SkillWeights;
  busy: boolean;
  onCancel: () => void;
  onSave: (f: EditForm) => void;
}) {
  const getSelfRating = useServerFn(admin_get_player_self_rating);
  const { data: selfRatingRes } = useQuery({
    queryKey: ["admin-view-self-rating", row.player_id],
    queryFn: () => getSelfRating({ data: { player_id: row.player_id } }),
  });
  const selfRating = selfRatingRes?.rating;
  const selfLevel = selfRating ? overallLevel(selfRating as any, weights) : null;

  const [form, setForm] = useState<EditForm>(() => {
    const f: any = {
      player_id: row.player_id,
      primary_position: row.primary_position || "undefined",
      height_cm: row.height_cm,
      notes: row.notes ?? "",
    };
    SKILL_KEYS.forEach((k) => {
      f[k] = (row as any)[k];
    });
    return f as EditForm;
  });
  const [heightRaw, setHeightRaw] = useState<string>(
    row.height_cm === null || row.height_cm === undefined ? "" : String(row.height_cm),
  );
  const [showErrors, setShowErrors] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const set = (k: keyof EditForm, v: any) => setForm((f) => ({ ...f, [k]: v } as EditForm));

  /** Erro por nota técnica (as cinco são obrigatórias). */
  const scoreErrors = useMemo(() => {
    const out: Partial<Record<(typeof SKILL_KEYS)[number], string>> = {};
    for (const k of SKILL_KEYS) {
      const v = (form as any)[k] as number | null;
      if (v !== null && v !== undefined) {
        if (!Number.isInteger(v) || v < 0 || v > 5) {
          out[k] = "A nota deve ser um número inteiro entre 0 e 5.";
        }
      }
    }
    return out;
  }, [form]);

  /** Altura é opcional; quando preenchida deve ser plausível (100–250 cm). */
  const heightError = useMemo(() => {
    const raw = heightRaw.trim();
    if (raw === "") return null;
    const n = Number(raw);
    if (!Number.isFinite(n) || !Number.isInteger(n) || n < 100 || n > 250) {
      return "Informe uma altura válida em centímetros.";
    }
    return null;
  }, [heightRaw]);

  const scoresValid = Object.keys(scoreErrors).length === 0;
  const canSave = scoresValid && !heightError && !busy;

  const live = useMemo(() => {
    const s: any = { ...form };
    const raw = heightRaw.trim();
    s.height_cm = raw === "" ? null : Math.trunc(Number(raw));
    return overallLevel(s as PlayerSkills, weights);
  }, [form, weights, heightRaw]);

  function submit() {
    setShowErrors(true);
    if (!scoresValid) {
      setError("Corrija os erros nas notas técnicas para salvar.");
      return;
    }
    if (heightError) {
      setError(heightError);
      return;
    }
    setError(null);
    const raw = heightRaw.trim();
    onSave({ ...form, height_cm: raw === "" ? null : Math.trunc(Number(raw)) });
  }


  return (
    <Dialog open onOpenChange={(o) => !o && onCancel()}>
      <DialogContent aria-describedby="skill-dialog-desc" className="max-h-[90dvh] overflow-hidden sm:max-w-4xl p-0 border-brand-border bg-brand-surface shadow-2xl flex flex-col">
        <DialogHeader className="p-6 pb-2 shrink-0 border-b border-white/5">
          <div className="flex items-center justify-between">
             <div>
                <DialogTitle className="font-display uppercase text-brand-white text-lg">Avaliar: {row.name}</DialogTitle>
                <DialogDescription id="skill-dialog-desc" className="text-[10px] text-brand-silver uppercase font-bold tracking-widest mt-1">
                  Ajuste as habilidades técnicas e a posição do jogador.
                </DialogDescription>
             </div>
             <div className="text-right pr-6 sm:pr-8">
                <p className="text-[10px] font-black Oswald uppercase tracking-widest text-brand-gold mb-0.5">Nível Técnico</p>
                <Badge className="bg-brand-gold text-brand-blue font-black text-xl px-4 py-0.5 Oswald border-none">
                  {fmt1(live)}
                </Badge>
             </div>
          </div>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto p-6 space-y-8 no-scrollbar">
           <div className="grid md:grid-cols-2 gap-8 items-start">
              {/* Lado Esquerdo: Autoavaliação e Dados Gerais */}
              <div className="space-y-6">
                 <div className="bg-white/5 border border-white/10 rounded-xl p-5 space-y-4">
                    <h4 className="text-xs font-black Oswald uppercase text-brand-silver/50 tracking-widest flex items-center gap-2">
                       <Zap className="w-3.5 h-3.5" /> Autoavaliação do Jogador
                    </h4>
                    {selfRating ? (
                       <div className="space-y-4">
                          <div className="flex items-center justify-between bg-brand-gold/10 p-3 rounded-lg border border-brand-gold/20">
                             <span className="text-[10px] font-bold Oswald uppercase text-brand-gold">Nível Autoestimado</span>
                             <span className="text-2xl font-black Oswald text-brand-white">{fmt1(selfLevel)}</span>
                          </div>
                          <div className="grid grid-cols-2 gap-2">
                             {SKILL_KEYS.map(k => (
                                <div key={k} className="flex justify-between items-center p-2 bg-brand-background/40 rounded border border-white/5">
                                   <span className="text-[8px] font-bold uppercase text-brand-silver/40 truncate pr-2">{SKILL_LABELS[k].split('/')[0]}</span>
                                   <span className="text-[10px] font-black Oswald text-brand-white">{(selfRating as any)[k] ?? '—'}</span>
                                </div>
                             ))}
                           </div>
                           <div className="pt-2 border-t border-white/5 space-y-2">
                              <div className="flex justify-between items-center text-[10px] Oswald uppercase">
                                 <span className="text-brand-silver/50 font-bold">Posição informada</span>
                                 <span className="text-brand-white font-black">{positionLabel(selfRating.primary_position)}</span>
                              </div>
                              <div className="flex justify-between items-center text-[10px] Oswald uppercase">
                                 <span className="text-brand-silver/50 font-bold">Altura informada</span>
                                 <span className="text-brand-white font-black">{selfRating.height_cm ? `${selfRating.height_cm} cm` : '—'}</span>
                              </div>
                           </div>
                        </div>
                    ) : (
                       <div className="py-8 text-center border border-dashed border-white/10 rounded-lg">
                          <p className="text-[10px] font-bold Oswald text-brand-silver/30 uppercase italic">O jogador ainda não se avaliou</p>
                       </div>
                    )}
                 </div>

                 <div className="space-y-4 bg-white/5 border border-white/10 rounded-xl p-5">
                    <h4 className="text-xs font-black Oswald uppercase text-brand-silver/50 tracking-widest mb-4">Dados Físicos e Táticos</h4>
                    <div className="grid grid-cols-2 gap-4">
                       <div className="space-y-1.5">
                          <Label className="text-[10px] uppercase font-black text-brand-silver Oswald tracking-widest">Posição Principal</Label>
                          <Select 
                            value={form.primary_position} 
                            onValueChange={(v) => set("primary_position", v)}
                          >
                             <SelectTrigger className="bg-brand-surface border-brand-border h-10 text-xs Oswald uppercase">
                                <SelectValue />
                             </SelectTrigger>
                             <SelectContent className="bg-brand-surface border-brand-border text-brand-white Oswald">
                                {POSITIONS.map(p => (
                                   <SelectItem key={p.value} value={p.value} className="text-xs uppercase focus:bg-brand-gold/10 focus:text-brand-gold">
                                      {p.label}
                                   </SelectItem>
                                ))}
                             </SelectContent>
                          </Select>
                       </div>
                       <div className="space-y-1.5">
                          <Label className="text-[10px] uppercase font-black text-brand-silver Oswald tracking-widest">Altura (cm)</Label>
                          <Input 
                            type="number" 
                            value={heightRaw} 
                            onChange={e => setHeightRaw(e.target.value)}
                            className="bg-brand-surface border-brand-border h-10 text-xs font-bold Oswald"
                            placeholder="Ex: 185"
                          />
                          {heightError && <p className="text-[9px] text-red-400 Oswald font-bold uppercase">{heightError}</p>}
                       </div>
                    </div>
                 </div>

                 <div className="space-y-4 bg-white/5 border border-white/10 rounded-xl p-5">
                    <div className="flex items-center justify-between mb-2">
                      <h4 className="text-xs font-black Oswald uppercase text-brand-silver/50 tracking-widest">Anotações Administrativas</h4>
                      <Badge variant="outline" className="text-[8px] bg-brand-gold/10 text-brand-gold border-brand-gold/20 Oswald uppercase tracking-widest">
                        Apenas Organização
                      </Badge>
                    </div>
                    <div className="space-y-1.5">
                       <Textarea 
                         value={form.notes}
                         onChange={e => set("notes", e.target.value)}
                         className="bg-brand-surface border-brand-border text-xs min-h-[80px]"
                         placeholder="Observações privadas do administrador. Os jogadores não têm acesso."
                       />
                    </div>
                 </div>
              </div>

              {/* Lado Direito: Avaliação Técnica */}
              <div className="space-y-4">
                 <div className="flex items-center justify-between px-1">
                   <h4 className="text-xs font-black Oswald uppercase text-brand-silver/50 tracking-widest flex items-center gap-2">
                      <ShieldCheck className="w-3.5 h-3.5" /> Avaliação Administrativa
                   </h4>
                   <Badge variant="outline" className="text-[8px] bg-brand-gold/10 text-brand-gold border-brand-gold/20 Oswald uppercase tracking-widest hidden sm:inline-flex">
                     Escala de 0 a 5
                   </Badge>
                 </div>
                 <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {SKILL_KEYS.map((k) => (
                      <SkillScoreSelector
                        key={k}
                        label={SKILL_LABELS[k]}
                        value={(form as any)[k]}
                        onChange={(v) => set(k, v)}
                      />
                    ))}
                 </div>
                 
                 <div className="rounded-lg border border-brand-gold/20 bg-brand-gold/5 p-3 text-center flex flex-col items-center gap-1">
                    <p className={cn("text-[10px] Oswald uppercase font-bold tracking-widest", live !== null ? "text-brand-gold" : "text-brand-silver/50")}>
                       {live !== null ? `Classificação: ${scoreLabel(live)}` : 
                         (SKILL_KEYS.every(k => form[k] === null || form[k] === undefined) 
                           ? "NÃO AVALIADO (0/8 FUNDAMENTOS)" 
                           : `AVALIAÇÃO INCOMPLETA — ${8 - SKILL_KEYS.filter(k => form[k] === null || form[k] === undefined).length}/8 FUNDAMENTOS`)}
                    </p>
                    {live === null && SKILL_KEYS.some(k => form[k] !== null && form[k] !== undefined) && (
                      <p className="text-[9px] text-red-400 Oswald font-bold uppercase">
                        Falta avaliar: {SKILL_KEYS.filter(k => form[k] === null || form[k] === undefined).map(k => SKILL_LABELS[k].split("/")[0]).join(", ")}
                      </p>
                    )}
                 </div>
              </div>
           </div>
           
           {error && (
             <div className="bg-red-500/10 border border-red-500/20 p-3 rounded-lg text-red-400 text-xs font-bold Oswald uppercase text-center">
                {error}
             </div>
           )}
        </div>

        <DialogFooter className="p-6 border-t border-white/5 bg-brand-surface/50 shrink-0">
          <div className="flex items-center justify-end gap-3 w-full">
             <Button variant="ghost" onClick={onCancel} disabled={busy} className="h-10 px-6 Oswald uppercase font-bold text-brand-silver hover:text-white">
                Cancelar
             </Button>
             <Button 
               onClick={submit} 
               disabled={!canSave} 
               className="h-10 px-8 bg-brand-gold text-brand-blue Oswald font-black uppercase tracking-widest hover:scale-105 transition-transform"
             >
                {busy ? "Salvando..." : "Salvar Avaliação"}
             </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function SkillWeightsCard({
  onDirtyChange,
}: {
  onDirtyChange?: (dirty: boolean) => void;
}) {
  const getWeights = useServerFn(admin_get_skill_weights);
  const update = useServerFn(admin_update_skill_weights);
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState<SkillWeights | null>(null);

  const q = useQuery({
    queryKey: ["skill-weights"],
    queryFn: () => getWeights(),
    staleTime: 60_000,
  });

  const saved = (q.data?.weights as SkillWeights) ?? DEFAULT_WEIGHTS;
  const current = form ?? saved;
  const total = SKILL_KEYS.reduce((acc, k) => acc + (current[k] ?? 0), 0);

  const fields: Array<[SkillKey, string, string]> = SKILL_KEYS.map(k => [
    k, 
    SKILL_LABELS[k],
    "" // No description available for all 8 now
  ]);

  const dirty =
    !!form &&
    fields.some(([k]) => (form as any)?.[k] !== (saved as any)?.[k]);

  useEffect(() => {
    onDirtyChange?.(dirty);
  }, [dirty, onDirtyChange]);

  async function save() {
    if (total !== 100) return;
    setBusy(true);
    try {
      await update({ data: current });
      toast.success("Pesos atualizados.");
      await q.refetch();
      setForm(null);
      onDirtyChange?.(false);
    } catch (e) {
      toast.error(friendlyError(e));
    } finally {
      setBusy(false);
    }
  }

  const pct = Math.min(100, Math.max(0, total));

  return (
    <ConfigSection
      title="Pesos do nível geral"
      description="Define quanto cada habilidade influencia o nível geral usado na distribuição automática dos times. A soma precisa ser exatamente 100."
      scope="Global"
      dirty={dirty}
      actions={
        <>
          <Button
            variant="outline"
            size="sm"
            disabled={busy || !dirty}
            onClick={() => {
              setForm(null);
              onDirtyChange?.(false);
            }}
          >
            Cancelar
          </Button>
          <Button
            variant="outline"
            size="sm"
            disabled={busy}
            onClick={() => setForm({ ...DEFAULT_WEIGHTS })}
          >
            Restaurar padrão
          </Button>
          <Button size="sm" onClick={save} disabled={busy || total !== 100 || !dirty}>
            {busy ? "Salvando…" : "Salvar pesos"}
          </Button>
        </>
      }
    >
      {fields.map(([k, label, hint]) => (
        <div key={k} className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3">
          <div className="min-w-0">
            <Label className="text-sm">{label}</Label>
            <p className="text-[11px] leading-snug text-muted-foreground">{hint}</p>
          </div>
          <Input
            type="number"
            min={0}
            max={100}
            inputMode="numeric"
            className="w-24 shrink-0 text-center"
            value={(current as any)[k]}
            onChange={(e) => setForm({ ...current, [k]: Math.trunc(Number(e.target.value) || 0) } as SkillWeights)}
          />
        </div>
      ))}

      <div className="space-y-1">
        <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
          <div
            className={`h-full transition-all ${total === 100 ? "bg-emerald-500" : "bg-red-500"}`}
            style={{ width: `${pct}%` }}
          />
        </div>
        <p className={`text-xs ${total === 100 ? "text-muted-foreground" : "text-red-400"}`}>
          Soma atual: {total}
          {total === 100 ? " — pronto para salvar." : " — ajuste até chegar a 100."}
        </p>
      </div>
    </ConfigSection>
  );
}


