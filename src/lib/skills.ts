// Lógica compartilhada (cliente + servidor) de avaliação técnica e distribuição de times.

export const SKILL_KEYS = [
  "reception_score",
  "setting_score",
  "attack_score",
  "serve_score",
  "block_score",
  "defense_score",
  "movement_score",
  "positioning_score",
] as const;

export type SkillKey = (typeof SKILL_KEYS)[number];

export const SKILL_LABELS: Record<SkillKey, string> = {
  reception_score: "Recepção/Manchete",
  setting_score: "Levantamento/Toque",
  attack_score: "Ataque",
  serve_score: "Saque",
  block_score: "Bloqueio",
  defense_score: "Defesa",
  movement_score: "Movimentação",
  positioning_score: "Posicionamento/Rodízio",
};

export const POSITIONS = [
  { value: "setter", label: "Levantador" },
  { value: "outside", label: "Ponteiro" },
  { value: "middle", label: "Central" },
  { value: "opposite", label: "Oposto" },
  { value: "libero", label: "Líbero" },
  { value: "tanto_faz", label: "Tanto faz" },
  { value: "undefined", label: "Sem posição definida" },
] as const;

export type PositionValue = (typeof POSITIONS)[number]["value"];

export function positionLabel(v?: string | null): string {
  if (v === "setter") return "Levantador";
  if (v === "outside") return "Ponteiro";
  if (v === "middle") return "Central";
  if (v === "opposite") return "Oposto";
  if (v === "libero") return "Líbero";
  if (v === "tanto_faz") return "Tanto faz";
  return POSITIONS.find((p) => p.value === v)?.label ?? "Sem posição definida";
}

export type SkillWeights = Record<SkillKey, number>;

export const DEFAULT_WEIGHTS: SkillWeights = {
  reception_score: 15,
  setting_score: 15,
  attack_score: 15,
  serve_score: 10,
  block_score: 15,
  defense_score: 15,
  movement_score: 10,
  positioning_score: 5,
};

export type PlayerSkills = {
  player_id: string;
} & Partial<Record<SkillKey, number>> & {
  primary_position: PositionValue | string;
  height_cm: number | null;
  notes: string | null;
  updated_at: string | null;
  updated_by: string | null;
};

export function getMissingSkills(s?: PlayerSkills | null): SkillKey[] {
  if (!s) return [...SKILL_KEYS];
  return SKILL_KEYS.filter((k) => {
    const val = (s as any)[k];
    return val === null || val === undefined || val === "";
  });
}

export function isEvaluated(s?: PlayerSkills | null): boolean {
  return getMissingSkills(s).length === 0;
}

/** Nível geral ponderado (1 casa decimal na exibição). null se não avaliado. */
export function overallLevel(
  s: PlayerSkills | null | undefined,
  w: SkillWeights = DEFAULT_WEIGHTS,
): number | null {
  if (!isEvaluated(s)) return null;
  let totalWeight = 0;
  let weightedSum = 0;
  for (const k of SKILL_KEYS) {
    const weight = w[k] ?? DEFAULT_WEIGHTS[k] ?? 0;
    const val = (s as any)[k];
    const numVal = typeof val === 'string' ? parseFloat(val) : val;
    const score = Math.min(5, Math.max(0, typeof numVal === 'number' && !isNaN(numVal) ? numVal : 0));
    weightedSum += score * weight;
    totalWeight += weight;
  }
  if (totalWeight === 0) return 0;
  return weightedSum / totalWeight;
}

export function fmt1(n: number | null | undefined): string {
  if (n === null || n === undefined || Number.isNaN(n)) return "—";
  return n.toFixed(1).replace(".", ",");
}

// ---------------------------------------------------------------------------
// Distribuição de times
// ---------------------------------------------------------------------------

export type DistributionPlayer = {
  /** id da inscrição (registration_id) */
  id: string;
  player_id: string;
  name: string;
  skills: PlayerSkills | null;
};

export type TeamNumber = 1 | 2 | 3;

export type BalanceStats = {
  count: number;
  overall: number | null;
} & Record<SkillKey, number | null> & {
  setters: number;
  positions: Record<string, number>;
  heightAvg: number | null;
  unrated: number;
};

function avg(nums: number[]): number | null {
  if (nums.length === 0) return null;
  return nums.reduce((a, b) => a + b, 0) / nums.length;
}

export function teamStats(
  players: DistributionPlayer[],
  weights: SkillWeights,
): BalanceStats {
  const rated = players.filter((p) => isEvaluated(p.skills));
  const positions: Record<string, number> = {};
  for (const p of players) {
    const pos = p.skills?.primary_position ?? "undefined";
    positions[pos] = (positions[pos] ?? 0) + 1;
  }
  const heights = players
    .map((p) => p.skills?.height_cm)
    .filter((h): h is number => typeof h === "number");

  const skillAvgs: any = {};
  for (const k of SKILL_KEYS) {
    skillAvgs[k] = avg(rated.map((p) => (p.skills as any)?.[k] as number));
  }

  return {
    count: players.length,
    overall: avg(rated.map((p) => overallLevel(p.skills, weights) as number).filter(v => v !== null)),
    ...skillAvgs,
    setters: players.filter(
      (p) =>
        p.skills?.primary_position === "setter" ||
        (typeof p.skills?.setting_score === "number" && p.skills.setting_score >= 4),
    ).length,
    positions,
    heightAvg: avg(heights),
    unrated: players.length - rated.length,
  };
}

/** Vetor de métricas usado no custo de equilíbrio. */
function metricsOf(
  players: DistributionPlayer[],
  weights: SkillWeights,
  neutral: number,
): number[] {
  const metrics: number[] = new Array(SKILL_KEYS.length + 4).fill(0);
  // metrics: [overall, ...skills, setters*3, tall*2, unrated*2]
  
  let unratedCount = 0;
  let tallCount = 0;
  let setterCount = 0;

  for (const p of players) {
    const s = p.skills;
    
    // REGRA DE HIERARQUIA: Admin > Self > None
    // isEvaluated(s) checa se as notas TÉCNICAS (admin) estão completas.
    if (isEvaluated(s)) {
      metrics[0] += overallLevel(s, weights) ?? neutral;
      SKILL_KEYS.forEach((k, i) => {
        metrics[i + 1] += Math.min(5, (s as any)[k] ?? neutral);
      });
      if (s?.primary_position === "setter" || ((s as any).setting_score as number) >= 4) setterCount += 1;
    } 
    // Se não tiver avaliação técnica, tenta usar a autoavaliação 
    // (O backend deve injetar a autoavaliação em p.skills se a técnica for nula)
    else if (s && SKILL_KEYS.some(k => typeof (s as any)[k] === 'number')) {
       metrics[0] += overallLevel(s, weights) ?? neutral;
       SKILL_KEYS.forEach((k, i) => {
         metrics[i + 1] += Math.min(5, (s as any)[k] ?? neutral);
       });
       if (s?.primary_position === "setter" || ((s as any).setting_score as number) >= 4) setterCount += 1;
    }
    else {
      metrics[0] += neutral;
      SKILL_KEYS.forEach((_, i) => {
        metrics[i + 1] += neutral;
      });
      unratedCount += 1;
    }
    if (typeof s?.height_cm === "number" && s.height_cm >= 185) tallCount += 1;
  }
  
  metrics[SKILL_KEYS.length + 1] = setterCount * 3;
  metrics[SKILL_KEYS.length + 2] = tallCount * 2;
  metrics[SKILL_KEYS.length + 3] = unratedCount * 2;
  
  return metrics;
}

const METRIC_WEIGHTS = [3, 1.5, 1.5, 1.2, 1, 1, 1, 1, 1, 2, 1, 1.5];

function cost(teams: DistributionPlayer[][], weights: SkillWeights, neutral: number): number {
  const mats = teams.map((t) => metricsOf(t, weights, neutral));
  let total = 0;
  for (let m = 0; m < METRIC_WEIGHTS.length; m++) {
    const vals = mats.map((v) => v[m]);
    const max = Math.max(...vals);
    const min = Math.min(...vals);
    total += (max - min) * METRIC_WEIGHTS[m];
  }
  return total;
}

export type DistributeOptions = {
  mode: "balanced" | "random";
  teamCount: number;
  /** ids de inscrição fixados (não são movidos) */
  locked?: Record<string, TeamNumber | undefined>;
  /** formação da rodada anterior: registration_id -> team_number */
  previous?: Record<string, number> | null;
  avoidRepeat?: boolean;
  weights?: SkillWeights;
};

export type DistributeResult = {
  assign: Record<string, TeamNumber>;
  warnings: string[];
};

export function distributePlayers(
  players: DistributionPlayer[],
  opts: DistributeOptions,
): DistributeResult {
  const weights = opts.weights ?? DEFAULT_WEIGHTS;
  const teamCount = Math.max(1, opts.teamCount);
  const warnings: string[] = [];
  const locked = opts.locked ?? {};

  const teams: DistributionPlayer[][] = Array.from({ length: teamCount }, () => []);
  const free: DistributionPlayer[] = [];

  for (const p of players) {
    const l = locked[p.id];
    if (l && l >= 1 && l <= teamCount) teams[l - 1].push(p);
    else free.push(p);
  }

  const ratedAll = players.filter((p) => isEvaluated(p.skills));
  const neutral = 3.0; // Escala 0-5: Média neutra é 3.0, não 5.5.

  if (opts.mode === "random") {
    const shuffled = [...free].sort(() => Math.random() - 0.5);
    shuffled.forEach((p, i) => teams[i % teamCount].push(p));
  } else {
    const rated = free.filter((p) => isEvaluated(p.skills));
    const unrated = free.filter((p) => !isEvaluated(p.skills));
    rated.sort(
      (a, b) =>
        (overallLevel(b.skills, weights) ?? neutral) - (overallLevel(a.skills, weights) ?? neutral),
    );

    // Etapa 5 — serpentina
    let idx = 0;
    let dir = 1;
    for (const p of rated) {
      teams[idx].push(p);
      if (dir === 1) {
        if (idx === teamCount - 1) dir = -1;
        else idx += 1;
      } else {
        if (idx === 0) dir = 1;
        else idx -= 1;
      }
    }

    // Etapa 8 — não avaliados alternados, começando pelo time menor
    for (const p of unrated) {
      const target = teams.reduce(
        (best, t, i) => (t.length < teams[best].length ? i : best),
        0,
      );
      teams[target].push(p);
    }

    // Etapa 6 — otimização por trocas
    const lockedIds = new Set(Object.keys(locked).filter((k) => locked[k]));
    let best = cost(teams, weights, neutral);
    for (let pass = 0; pass < 60; pass++) {
      let improved = false;
      for (let a = 0; a < teamCount; a++) {
        for (let b = a + 1; b < teamCount; b++) {
          for (let i = 0; i < teams[a].length; i++) {
            for (let j = 0; j < teams[b].length; j++) {
              const pa = teams[a][i];
              const pb = teams[b][j];
              if (lockedIds.has(pa.id) || lockedIds.has(pb.id)) continue;
              teams[a][i] = pb;
              teams[b][j] = pa;
              const c = cost(teams, weights, neutral);
              if (c < best - 0.0001) {
                best = c;
                improved = true;
              } else {
                teams[a][i] = pa;
                teams[b][j] = pb;
              }
            }
          }
        }
      }
      if (!improved) break;
    }

    // Etapa 10 — garantir ao menos um levantador por time quando possível
    const isSetter = (p: DistributionPlayer) =>
      p.skills?.primary_position === "setter" ||
      (typeof p.skills?.setting_score === "number" && p.skills.setting_score >= 7);
    const totalSetters = players.filter(isSetter).length;
    for (let round = 0; round < teamCount; round++) {
      const without = teams.findIndex((t) => !t.some(isSetter));
      if (without === -1) break;
      const donor = teams.findIndex((t) => t.filter(isSetter).length > 1);
      if (donor === -1) break;
      const si = teams[donor].findIndex(
        (p) => isSetter(p) && !lockedIds.has(p.id),
      );
      const ri = teams[without].findIndex((p) => !isSetter(p) && !lockedIds.has(p.id));
      if (si === -1 || ri === -1) break;
      const sp = teams[donor][si];
      const rp = teams[without][ri];
      teams[donor][si] = rp;
      teams[without][ri] = sp;
    }
    if (totalSetters < teamCount) {
      const missingEvals = players.filter(p => !isEvaluated(p.skills) && (!p.skills?.primary_position || p.skills.primary_position === 'undefined')).length;
      if (missingEvals > 0) {
        warnings.push(`Faltam levantadores confirmados, mas há ${missingEvals} jogador(es) sem avaliação ou posição cadastrada.`);
      } else {
        warnings.push("Não existem jogadores com perfil de levantador suficientes para todos os times.");
      }
    }

    const unratedCount = players.filter((p) => !isEvaluated(p.skills)).length;
    if (unratedCount > 0) {
      warnings.push(
        `Existem ${unratedCount} jogador(es) sem avaliação (usando média neutra).`,
      );
    }
  }

  // Avisos gerais
  const sizes = teams.map((t) => t.length);
  if (Math.max(...sizes) - Math.min(...sizes) > 1) {
    warnings.push("A distribuição ficou com times desiguais devido às restrições/bloqueios.");
  }
  const attacks = teams.map((t) => (teamStats(t, weights) as any).attack_score ?? 0);
  if (Math.max(...attacks) - Math.min(...attacks) >= 1) {
    warnings.push("Um dos times ficou com capacidade de ataque bem abaixo dos demais.");
  }

  const assign: Record<string, TeamNumber> = {};
  teams.forEach((t, i) => {
    for (const p of t) assign[p.id] = (i + 1) as TeamNumber;
  });

  // Evitar repetir a formação anterior (troca simples entre dois times)
  if (opts.avoidRepeat && opts.previous && Object.keys(opts.previous).length > 0) {
    const same = players.filter((p) => opts.previous![p.id] === assign[p.id]).length;
    if (players.length > 0 && same / players.length > 0.8 && teamCount > 1) {
      const movable = players.filter((p) => !locked[p.id]);
      if (movable.length >= 2) {
        const a = movable[0];
        const b = movable.find((p) => assign[p.id] !== assign[a.id]);
        if (b) {
          const tmp = assign[a.id];
          assign[a.id] = assign[b.id];
          assign[b.id] = tmp;
        }
      }
    }
  }

  return { assign, warnings };
}

export type BalanceStatus = "Excelente" | "Bom" | "Regular" | "Desequilibrado";

export function balanceStatus(stats: BalanceStats[]): {
  status: BalanceStatus;
  overallDiff: number;
  maxDiff: number;
} {
  const pick = (f: (s: BalanceStats) => number | null) => {
    const vals = stats.map(f).filter((v): v is number => typeof v === "number");
    if (vals.length < 2) return 0;
    return Math.max(...vals) - Math.min(...vals);
  };
  const overallDiff = pick((s) => s.overall);
  const diffs = [
    overallDiff,
    ...SKILL_KEYS.map(k => pick((s) => (s as any)[k]))
  ];
  const maxDiff = Math.max(...diffs.filter((v): v is number => typeof v === 'number'));
  const status: BalanceStatus =
    maxDiff <= 0.6
      ? "Excelente"
      : maxDiff <= 1.2
        ? "Bom"
        : maxDiff <= 2
          ? "Regular"
          : "Desequilibrado";
  return { status, overallDiff, maxDiff };
}
