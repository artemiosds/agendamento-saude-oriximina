import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { summarizeEscalaDay } from './escalaInformativa';

export interface EscalaPrintEntry {
  personId: string;
  person: string;
  place: string;
  placeGroup: string;
  hours: string;
  minutes: number;
  reason?: string;
  mode: string;
  informational?: boolean;
  continuation?: boolean;
  conflict?: boolean;
  currentInactive?: boolean;
}

export interface EscalaPrintPerson {
  id: string;
  profession?: string;
  registration?: string;
  cbo?: string;
  unit?: string;
}

export interface EscalaPrintInput {
  calendar: { day: Date; entries: EscalaPrintEntry[] }[];
  people: EscalaPrintPerson[];
  monthly: boolean;
  placeFilter: string;
  professionalFilter: string;
  emittedBy: string;
}

const escape = (value: string) => value.replace(/[&<>"']/g, c => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
})[c]!);
const dateKey = (value: Date) => format(value, 'yyyy-MM-dd');
const weekdays = ['DOM', 'SEG', 'TER', 'QUA', 'QUI', 'SEX', 'SÁB'];
const hoursLabel = (minutes: number) => `${Math.floor(minutes / 60)}h${minutes % 60 ? ` ${minutes % 60}min` : ''}`;
const timeMinutes = (hour: string) => Number(hour.slice(0, 2)) * 60 + Number(hour.slice(3, 5));

function shiftPrefix(hours: string) {
  const times = hours.match(/\d{2}:\d{2}/g);
  if (!times?.length) return 'H';
  const start = timeMinutes(times[0]), end = timeMinutes(times[times.length - 1]);
  if (end <= start) return 'H';
  if (start >= 18 * 60 || end <= 7 * 60) return 'N';
  if (start < 12 * 60 && end <= 12 * 60) return 'M';
  if (start >= 12 * 60 && end <= 18 * 60) return 'T';
  return start < 12 * 60 && end <= 18 * 60 ? 'MT' : 'H';
}

/** This stylesheet is embedded only in the isolated institutional print document. */
const stylesheet = `<style>
  @page { size: A4 landscape; margin: 9mm 8mm 12mm; }
  .doc-page { font-family: Arial, Helvetica, sans-serif; font-size: 8pt; line-height: 1.25; }
  .doc-header { position: relative; margin-bottom: 6px; padding-bottom: 5px; }
  .doc-header .logos-row.cols-2 { position: absolute; top: 0; left: 0; }
  .doc-header .header-text { min-height: 42px; justify-content: center; padding: 0 65px; margin-top: 0; }
  .doc-header .logo-slot img { height: 42px !important; max-height: 42px !important; width: auto !important; }
  .doc-header h1 { font-size: 10pt; }
  .doc-header .subtitle, .doc-header .extra-line { font-size: 7pt; }
  .doc-title-bar { color: #163d53; font-size: 12pt; margin: 3px 0; padding: 3px; }
  .doc-meta { display: flex; flex-wrap: wrap; margin-bottom: 7px; padding: 5px 8px; font-size: 7pt; gap: 3px 12px; }
  .doc-meta strong { font-size: 6.5pt; }
  .doc-content { font-size: 8pt; text-align: left; line-height: 1.25; }
  .escala-print { color: #163d53; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  .escala-print p { margin: 3px 0; }
  .escala-table { table-layout: fixed; margin: 0 0 9px; }
  .escala-table thead { display: table-header-group; }
  .escala-table tr { break-inside: avoid; page-break-inside: avoid; }
  .escala-table th, .escala-table td { border: .5px solid #d5e0e7; padding: 3px 2px; font-size: 6.8pt; text-align: center; vertical-align: middle; line-height: 1.12; hyphens: none; }
  .escala-table .escala-group { background: #e5eff5; color: #2a6f97; text-align: left; padding: 4px 8px; font-size: 8pt; }
  .escala-table .escala-days th { background: #163d53; color: white; }
  .escala-table .escala-person { width: 56mm; text-align: left; padding: 2px 6px; }
  .escala-person strong { display: block; font-size: 7.3pt; }
  .escala-person small { display: block; color: #526a79; font-size: 6.2pt; font-weight: normal; margin-top: 1px; }
  .escala-table .escala-total { width: 15mm; background: #f2f7fa; font-weight: bold; }
  .escala-day-number, .escala-weekday { display: block; white-space: nowrap; }
  .escala-weekday { font-size: 5pt; margin-top: 3px; font-weight: normal; }
  .escala-table .escala-weekend { background: #f2f5f7; }
  .escala-days .escala-weekend { background: #315c73 !important; }
  .escala-token { display: block; white-space: nowrap; font-weight: bold; padding: 2px 0; }
  .escala-m { background: #eaf3fb; color: #245a81; }
  .escala-t { background: #e7f5f1; color: #17685b; }
  .escala-mt, .escala-n, .escala-h { background: #e9ecfa; color: #484e88; }
  .escala-block { background: #fff4dd; color: #8d5915; }
  .escala-conflict { outline: 1px solid #a33c25; outline-offset: -1px; }
  .escala-print sup { font-size: 5pt; }
  .escala-legend { border: 1px solid #d5e0e7; padding: 6px 8px; margin: 7px 0; break-inside: avoid; font-size: 7pt; }
  .escala-legend-items { display: flex; flex-wrap: wrap; gap: 4px 12px; margin-top: 4px; }
  .escala-legend-item { display: inline-block; }
  .escala-legend-code { display: inline-block; min-width: 20px; text-align: center; padding: 2px; margin-right: 4px; font-weight: bold; }
  .escala-notes { font-size: 7pt; margin: 6px 0; }
  .escala-notes li { margin-bottom: 3px; }
  .escala-signatures { display: flex; gap: 22mm; text-align: center; margin: 8mm 9mm 0; break-inside: avoid; }
  .escala-signatures div { flex: 1; border-top: 1px solid #637786; padding-top: 6px; font-size: 8pt; }
  @media screen { .doc-print-document { width: 297mm; min-height: 210mm; padding: 9mm 8mm 12mm; } }
</style>`;

/** Uses only the already scoped, projected calendar; never fetches or writes data. */
export function buildEscalaProfissionaisPrint(input: EscalaPrintInput) {
  if (!input.calendar.length) throw new Error('Selecione um período para imprimir a escala.');
  const people = new Map(input.people.map(p => [p.id, p]));
  const days = input.calendar.map(d => d.day);
  const audits=input.calendar.map(day=>summarizeEscalaDay(day.entries));
  if(audits.some(a=>a.invalid)) throw new Error('Há horários inválidos na escala. Confira antes de imprimir.');
  const uniqueTotal=audits.reduce((sum,a)=>sum+a.uniqueMinutes,0);
  const overlapTotal=audits.reduce((sum,a)=>sum+a.overlapMinutes,0);
  const conflictDays=audits.filter(a=>a.conflicts.size>0).length;
  const conflictedEntries=new Set(input.calendar.flatMap((day,i)=>[...audits[i].conflicts].map(index=>day.entries[index])));
  const period = `${format(days[0], 'dd/MM/yyyy')} a ${format(days[days.length - 1], 'dd/MM/yyyy')}`;
  const reference = input.monthly ? format(days[0], 'MMMM / yyyy', { locale: ptBR }).toUpperCase() : period;
  const title = `ESCALA ${input.monthly ? 'MENSAL' : 'SEMANAL'} DOS PROFISSIONAIS - ${reference}`;
  const schedules = [...new Set(input.calendar.flatMap(d => d.entries.filter(e => e.minutes > 0 && e.hours).map(e => e.hours)))].sort();
  const prefixCounts = new Map<string, number>();
  for (const hours of schedules) {
    const prefix = shiftPrefix(hours);
    prefixCounts.set(prefix, (prefixCounts.get(prefix) || 0) + 1);
  }
  const indexes = new Map<string, number>();
  const codes = new Map(schedules.map(hours => {
    const prefix = shiftPrefix(hours), index = (indexes.get(prefix) || 0) + 1;
    indexes.set(prefix, index);
    return [hours, { code: prefix + (prefixCounts.get(prefix)! > 1 ? index : ''), prefix }];
  }));
  const notes: string[] = [];
  const groups = new Map<string, Map<string, { entry: EscalaPrintEntry; dates: Map<string, EscalaPrintEntry[]> }>>();
  let hasInformational = false, hasContinuation = false;
  for (const { day, entries } of input.calendar) for (const entry of entries) {
    const unit = entry.placeGroup || entry.place || 'Local não informado';
    const rows = groups.get(unit) || new Map();
    groups.set(unit, rows);
    const key = JSON.stringify([entry.personId, entry.place]);
    const row = rows.get(key) || { entry, dates: new Map<string, EscalaPrintEntry[]>() };
    rows.set(key, row);
    row.dates.set(dateKey(day), [...(row.dates.get(dateKey(day)) || []), entry]);
    hasInformational ||= !!entry.informational;
    hasContinuation ||= !!entry.continuation;
    if (entry.reason) notes.push(`${format(day, 'dd/MM')} · ${entry.person} · ${entry.place}: ${entry.reason}${entry.minutes > 0 ? ` (horário remanescente: ${entry.hours})` : ' (bloqueado)'}`);
  }
  if (!groups.size) throw new Error('Não há escala nos filtros selecionados.');

  const tables = [...groups].sort(([a], [b]) => a.localeCompare(b, 'pt-BR')).map(([unit, rows]) => {
    const header = days.map(day => `<th scope="col" class="${day.getDay() % 6 === 0 ? 'escala-weekend' : ''}"><span class="escala-day-number">${format(day, 'dd')}</span><span class="escala-weekday">${weekdays[day.getDay()]}</span></th>`).join('');
    const body = [...rows.values()].sort((a, b) => a.entry.person.localeCompare(b.entry.person, 'pt-BR') || a.entry.place.localeCompare(b.entry.place, 'pt-BR')).map(({ entry, dates }) => {
      const person = people.get(entry.personId);
      // Remove only an exact repeated unit prefix; never infer a sector from free text.
      const local = entry.place.startsWith(unit + ' · ') ? entry.place.slice(unit.length + 3)
        : entry.place.startsWith(unit + ' - ') ? entry.place.slice(unit.length + 3) : entry.place === unit ? '' : entry.place;
      const identity = [person?.registration, `CBO ${person?.cbo || 'não informado'}`].filter(Boolean).join(' · ');
      const modes = [...new Set([...dates.values()].flat().map(e => e.mode))].filter(Boolean).join(' / ');
      const location = [person?.profession, local, modes].filter(Boolean).join(' · ');
      const cells = days.map(day => {
        const entries = dates.get(dateKey(day)) || [];
        const tokens = entries.map(e => {
          const slot = codes.get(e.hours);
          const code = e.minutes > 0 ? slot?.code || 'H' : 'B';
          const css = e.minutes > 0 ? `escala-${(slot?.prefix || 'H').toLowerCase()}` : 'escala-block';
          return `<span class="escala-token ${css}${e.conflict || conflictedEntries.has(e) ? ' escala-conflict' : ''}" title="${escape([e.hours || 'Bloqueado', e.mode, e.reason].filter(Boolean).join(' · '))}">${escape(code)}${e.informational ? '<sup>i</sup>' : ''}${e.continuation ? '<sup>c</sup>' : ''}${e.reason ? '<sup>*</sup>' : ''}${e.conflict || conflictedEntries.has(e) ? '<sup>!</sup>' : ''}</span>`;
        }).join('');
        return `<td class="${day.getDay() % 6 === 0 ? 'escala-weekend' : ''}">${tokens || '-'}</td>`;
      }).join('');
      const minutes = [...dates.values()].reduce((sum, entries) => sum + summarizeEscalaDay(entries).uniqueMinutes, 0);
      return `<tr><th scope="row" class="escala-person"><strong>${escape(entry.person)}</strong><small>${escape(location)}</small><small>${escape(identity)}</small>${entry.currentInactive ? '<small>Cadastro atualmente inativo</small>' : ''}${person?.unit && person.unit !== unit ? `<small>Lotação: ${escape(person.unit)}</small>` : ''}</th>${cells}<td class="escala-total">${hoursLabel(minutes)}</td></tr>`;
    }).join('');
    return `<table class="escala-table" aria-label="Escala de ${escape(unit)}"><colgroup><col style="width:56mm">${days.map(() => '<col>').join('')}<col style="width:15mm"></colgroup><thead><tr><th colspan="${days.length + 2}" class="escala-group">${escape(unit)} · ${period}</th></tr><tr class="escala-days"><th scope="col" class="escala-person">Profissional / local</th>${header}<th scope="col" class="escala-total">Carga prevista</th></tr></thead><tbody>${body}</tbody></table>`;
  }).join('');
  const legend = [...codes].map(([hours, { code, prefix }]) => `<span class="escala-legend-item"><span class="escala-legend-code escala-${prefix.toLowerCase()}">${escape(code)}</span>${escape(hours)}</span>`).join('');
  const body = `${stylesheet}<div class="escala-print"><p><strong>Carga prevista sem dupla contagem: ${hoursLabel(uniqueTotal)}</strong>${conflictDays ? ` · ${conflictDays} dia(s) com sobreposição · ${hoursLabel(overlapTotal)} de registros simultâneos descontados` : ''}</p>${tables}
    <div class="escala-legend"><strong>Legenda dos horários cadastrados</strong><div class="escala-legend-items">${legend}<span><b>B</b> Bloqueado</span><span><b>-</b> Sem escala cadastrada</span>${hasInformational ? '<span><b>i</b> Escala informativa; não oferece vagas</span>' : ''}${hasContinuation ? '<span><b>c</b> Continuação do dia anterior</span>' : ''}${notes.length ? '<span><b>*</b> Conferir bloqueio abaixo</span>' : ''}${conflictDays ? '<span><b>!</b> Horários simultâneos: conferir</span>' : ''}</div></div>
    ${notes.length ? `<div class="escala-notes"><strong>Bloqueios e ajustes do período</strong><ul>${[...new Set(notes)].map(note => `<li>${escape(note)}</li>`).join('')}</ul></div>` : ''}
    <p class="escala-notes">Carga prevista: união dos intervalos por profissional e dia, com descontos de bloqueio já aplicados. O total geral desconta sobreposições entre locais; os totais de cada linha são por local e não devem ser somados quando há conflitos. Registros simultâneos permanecem visíveis para conferência. Este documento não comprova frequência. Sem escala cadastrada não significa folga.</p>
    <div class="escala-signatures"><div>Assinatura do(a) Profissional<br><small>Identificação / conselho profissional</small></div><div>Chefia Imediata / Coordenação SMS<br><small>Identificação / carimbo</small></div></div></div>`;
  return { title, body, meta: {
    Período: period,
    Local: escape(input.placeFilter),
    Profissional: escape(input.professionalFilter || 'Todos os profissionais do filtro'),
    'Emitido por': escape(input.emittedBy),
  } };
}
