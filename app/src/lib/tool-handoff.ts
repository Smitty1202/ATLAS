export interface HandoffSubject {
  speciesId: string;
  speciesName: string;
  instanceId?: string;
  instanceLabel?: string;
}

export interface IvTargets {
  hp: number;
  attack: number;
  defense: number;
}

export interface SolverHandoff {
  destination: "solver";
  source: "pal-intelligence";
  subject: HandoffSubject;
  requiredPassives: string[];
  reason: string;
}

export interface IvLabHandoff {
  destination: "ivlab";
  source: "pal-intelligence";
  subject: HandoffSubject;
  suggestedIvs?: IvTargets;
  reason: string;
}

export type ToolHandoff = SolverHandoff | IvLabHandoff;

function cleanSubject(subject: HandoffSubject | null): HandoffSubject | null {
  if (!subject) return null;
  const speciesId = subject.speciesId.trim();
  const speciesName = subject.speciesName.trim();
  if (!speciesId || !speciesName) return null;
  const instanceId = subject.instanceId?.trim();
  const instanceLabel = subject.instanceLabel?.trim();
  return {
    speciesId,
    speciesName,
    ...(instanceId ? { instanceId } : {}),
    ...(instanceLabel ? { instanceLabel } : {}),
  };
}

function cleanReason(reason: string | undefined, fallback: string): string {
  const value = reason?.trim();
  return value || fallback;
}

export function buildSolverHandoff(
  subject: HandoffSubject | null,
  options: { requiredPassives?: string[]; reason?: string } = {},
): SolverHandoff | null {
  const clean = cleanSubject(subject);
  if (!clean) return null;
  const requiredPassives = [
    ...new Set(
      (options.requiredPassives ?? [])
        .map((value) => value.trim())
        .filter(Boolean),
    ),
  ];
  return {
    destination: "solver",
    source: "pal-intelligence",
    subject: clean,
    requiredPassives,
    reason: cleanReason(
      options.reason,
      "Selected species from Pal Intelligence.",
    ),
  };
}

function cleanIv(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(100, Math.round(value)));
}

export function buildIvLabHandoff(
  subject: HandoffSubject | null,
  options: { suggestedIvs?: IvTargets; reason?: string } = {},
): IvLabHandoff | null {
  const clean = cleanSubject(subject);
  if (!clean) return null;
  const suggested = options.suggestedIvs
    ? {
        hp: cleanIv(options.suggestedIvs.hp),
        attack: cleanIv(options.suggestedIvs.attack),
        defense: cleanIv(options.suggestedIvs.defense),
      }
    : null;
  return {
    destination: "ivlab",
    source: "pal-intelligence",
    subject: clean,
    ...(suggested && (suggested.hp > 0 || suggested.attack > 0 || suggested.defense > 0)
      ? { suggestedIvs: suggested }
      : {}),
    reason: cleanReason(
      options.reason,
      "Selected species from Pal Intelligence.",
    ),
  };
}

export function handoffView(handoff: ToolHandoff): "solver" | "ivlab" {
  return handoff.destination;
}
