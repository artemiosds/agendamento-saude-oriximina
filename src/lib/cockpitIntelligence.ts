import { cockpitDay, cockpitLabel, elapsedMinutes } from './unitCockpit';

type Waiting = { profession: string; arrival: string | null; clearedAt: string | null };
type Completion = { profession: string; completedAt: string | null };
type InProgress = { start: string | null; linkedRoom: boolean };
type Group = { key: string; name: string; waiting: number; waitingTimed: number; waitTotal: number; longest: number | null; aboveLimit: number; clearedTimed: number; clearedTotal: number; completed: number };
const hour = new Intl.DateTimeFormat('pt-BR', { timeZone: 'America/Sao_Paulo', hour: '2-digit', hourCycle: 'h23' });
const collator = new Intl.Collator('pt-BR', { numeric: true });

/** Administrative snapshot. All counts refer to appointment records, not unique people,
 * staff availability, clinical urgency, or a forecast. No data is written or fetched. */
export function cockpitIntelligence(input: {
  ready: readonly Waiting[]; completed: readonly Completion[]; inProgress: readonly InProgress[];
  waitingTotal: number; waitingTimed: number; day: string; now: number; waitLimit: number; visitLimit: number;
}) {
  const groups = new Map<string, Group>();
  const hourly = new Map<string, number>();
  const groupFor = (profession: string) => {
    const name = profession.trim();
    const key = cockpitLabel(name);
    let group = groups.get(key);
    if (!group) {
      group = { key, name: key ? name : 'Profissão não informada', waiting: 0, waitingTimed: 0, waitTotal: 0, longest: null, aboveLimit: 0, clearedTimed: 0, clearedTotal: 0, completed: 0 };
      groups.set(key, group);
    }
    return group;
  };
  let missingClearance = 0, missingProfession = 0, missingCompletion = 0, delayed = 0, missingStart = 0, missingRoom = 0;
  for (const row of input.ready) {
    const group = groupFor(row.profession);
    group.waiting++;
    if (!group.key) missingProfession++;
    const wait = elapsedMinutes(row.arrival, input.now);
    if (wait !== null) {
      group.waitingTimed++; group.waitTotal += wait;
      group.longest = Math.max(group.longest ?? 0, wait);
      if (wait > input.waitLimit) group.aboveLimit++;
    }
    const cleared = elapsedMinutes(row.clearedAt, input.now);
    if (cleared === null) missingClearance++;
    else { group.clearedTimed++; group.clearedTotal += cleared; }
  }
  for (const row of input.completed) {
    groupFor(row.profession).completed++;
    const time = Date.parse(row.completedAt || '');
    if (!Number.isFinite(time) || time > input.now || cockpitDay(time) !== input.day) { missingCompletion++; continue; }
    const label = hour.format(time);
    hourly.set(label, (hourly.get(label) ?? 0) + 1);
  }
  for (const row of input.inProgress) {
    const duration = elapsedMinutes(row.start, input.now);
    if (duration === null) missingStart++;
    else if (duration > input.visitLimit) delayed++;
    if (!row.linkedRoom) missingRoom++;
  }
  const professions = [...groups.values()].map(g => ({
    key: g.key, name: g.name, waiting: g.waiting, aboveLimit: g.aboveLimit, completed: g.completed,
    waitingTimed: g.waitingTimed, average: g.waitingTimed ? Math.round(g.waitTotal / g.waitingTimed) : null,
    longest: g.longest, clearedTimed: g.clearedTimed,
    averageCleared: g.clearedTimed ? Math.round(g.clearedTotal / g.clearedTimed) : null,
  })).sort((a, b) => b.aboveLimit - a.aboveLimit || b.waiting - a.waiting || b.completed - a.completed || collator.compare(a.name, b.name));
  const hours = [...hourly].sort(([a], [b]) => a.localeCompare(b)).map(([hour, count]) => ({ hour, count }));
  const peak = Math.max(0, ...hours.map(h => h.count));
  return {
    professions, hours, peak, busiest: hours.filter(h => h.count === peak).map(h => h.hour),
    delayed, covered: input.completed.length - missingCompletion,
    quality: { missingArrival: Math.max(0, input.waitingTotal - input.waitingTimed), missingClearance, missingProfession, missingCompletion, missingStart, missingRoom },
  };
}
