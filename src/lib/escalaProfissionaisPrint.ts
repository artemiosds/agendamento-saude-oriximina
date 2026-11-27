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
  monthlyLayout?: 'compact' | 'fortnight';
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
  @page { size: A4 landscape; margin: 9mm 8mm 20mm; }
  .doc-page { font-family: Arial, Helvetica, sans-serif; font-size: 8pt; line-height: 1.25; }
  .doc-header { position: relative; margin-bottom: 6px; padding-bottom: 5px; }
  .doc-header .logos-row { position: static; gap: 8px; }
  .doc-header .header-text { justify-content: center; padding: 0; margin-top: 2px; }
  .doc-header .logo-slot img { height: auto !important; max-height: 38px !important; width: auto !important; max-width: 120px !important; object-fit: contain; }
  .doc-header h1 { font-size: 10pt; color: #163d53; }
  .doc-emit { margin: 2px 0 4px; color: #334155; }
  .doc-header .subtitle, .doc-header .extra-line { font-size: 7pt; }
  .doc-title-bar { color: #163d53; font-size: 12pt; margin: 3px 0; padding: 3px; }
  .doc-meta { display: flex; flex-wrap: wrap; margin-bottom: 7px; padding: 5px 8px; font-size: 7pt; gap: 3px 12px; }
  .doc-meta strong { font-size: 6.5pt; }
  .doc-content { font-size: 8pt; text-align: left; line-height: 1.25; }
  .escala-print { color: #163d53; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  .escala-print p { margin: 3px 0; }
  .escala-summary { display: flex; flex-wrap: wrap; gap: 5px 15px; border: 1px solid #9aafbd; padding: 5px 8px; margin-bottom: 7px; font-size: 8pt; break-inside: avoid; }
  .escala-summary strong { color: #163d53; font-size: 9pt; }
  .escala-table { table-layout: fixed; width: 100%; border-collapse: collapse; margin: 0 0 7px; }
  .escala-section + .escala-section { margin-top: 6px; }
  .escala-section-title { font-size: 9pt; font-weight: bold; margin: 6px 0 4px; break-after: avoid; }
  .escala-table .escala-caption-row th { background: #f2f7fa; color: #163d53; font-size: 7pt; text-align: left; padding: 3px 6px; }
  .escala-table .escala-key-row th { background: #fff; color: #233b4a; text-align: left; padding: 3px 6px; font-weight: normal; font-size: 6.8pt; }
  .escala-key-inline { display: inline-block; margin-right: 7px; white-space: nowrap; }
  .escala-table tbody tr:nth-child(even) .escala-person { background: #f8fafc; }
  .escala-table .escala-missing { color: #566b79; }
  .escala-table .escala-token + .escala-token { margin-top: 1px; }
  .escala-table .escala-marks { display: block; font-size: 5.5pt; line-height: 1; letter-spacing: 0; font-weight: bold; }
  .escala-table thead { display: table-header-group; }
  .escala-table tr { break-inside: avoid; page-break-inside: avoid; }
  .escala-table th, .escala-table td { border: .5px solid #d5e0e7; padding: 3px 2px; font-size: 7pt; text-align: center; vertical-align: middle; line-height: 1.15; hyphens: none; }
  .escala-table .escala-group { background: #e5eff5; color: #2a6f97; text-align: left; padding: 4px 8px; font-size: 8pt; }
  .escala-table .escala-days th { background: #163d53; color: white; }
  .escala-table .escala-person { width: 56mm; text-align: left; padding: 3px 6px; overflow-wrap: anywhere; }
  .escala-person strong { display: block; font-size: 8pt; color: #163d53; }
  .escala-person small { display: block; color: #334155; font-size: 6.8pt; font-weight: normal; margin-top: 1px; }
  .escala-table .escala-total { width: 19mm; background: #f2f7fa; font-weight: bold; font-variant-numeric: tabular-nums; }
  .escala-table .escala-days .escala-total { background: #163d53; color: white; }
  .escala-table .escala-day-number { font-size: 8pt; font-variant-numeric: tabular-nums; }
  .escala-wide .escala-token { font-size: 6.8pt; }
  .escala-readable .escala-token { font-size: 8pt; }
  .escala-day-number, .escala-weekday { display: block; white-space: nowrap; }
  .escala-weekday { font-size: 6pt; margin-top: 2px; font-weight: normal; }
  .escala-table .escala-weekend { background: #f2f5f7; }
  .escala-days .escala-weekend { background: #315c73 !important; }
  .escala-token { display: block; white-space: normal; overflow-wrap: anywhere; font-weight: bold; padding: 2px 0; }
  .escala-m { background: #eaf3fb; color: #245a81; }
  .escala-t { background: #e7f5f1; color: #17685b; }
  .escala-mt, .escala-n, .escala-h { background: #e9ecfa; color: #484e88; }
  .escala-block { background: #fff4dd; color: #8d5915; }
  .escala-conflict { outline: 1px solid #a33c25; outline-offset: -1px; }
  .escala-print sup { font-size: 5pt; }
  .escala-legend { border: 1px solid #aabcc8; padding: 5px 7px; margin: 4px 0 7px; font-size: 7.2pt; }
  .escala-legend strong { display: block; break-after: avoid; }
  .escala-legend-items { margin-top: 2px; }
  .escala-legend-item { display: inline-block; break-inside: avoid; margin: 2px 9px 1px 0; }
  .escala-legend-code { display: inline-block; min-width: 16px; text-align: center; padding: 1px 3px; margin-right: 3px; font-weight: bold; }
  .escala-legend-flags { border-top: .5px solid #cbd5e1; margin-top: 3px; padding-top: 3px; }
  .escala-notes { font-size: 7.2pt; margin: 4px 0; color: #334155; }
  .escala-notes strong { break-after: avoid; }
  .escala-notes li { margin-bottom: 2px; break-inside: avoid; }
  .escala-signatures small { color: #334155; }
  .escala-signatures { display: flex; gap: 22mm; text-align: center; margin: 8mm 9mm 0; break-inside: avoid; }
  .escala-signatures div { flex: 1; border-top: 1px solid #637786; padding-top: 6px; font-size: 8pt; }
  @media screen { .doc-print-document { width: 297mm; min-height: 210mm; padding: 9mm 8mm 20mm; } }
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

  // Keep the original monthly view compact; the optional two-band version uses larger cells.
  const bands = input.monthly && input.monthlyLayout === 'fortnight' && days.length > 15
    ? [days.slice(0,15), days.slice(15)] : [days];
  const flags = ['<span class="escala-key-inline"><b>B</b> Bloqueado</span>','<span class="escala-key-inline"><b>–</b> Sem escala cadastrada</span>',hasInformational?'<span class="escala-key-inline"><b>i</b> Informativa (sem vagas)</span>':'',hasContinuation?'<span class="escala-key-inline"><b>c</b> Continuação do dia anterior</span>':'',notes.length?'<span class="escala-key-inline"><b>*</b> Bloqueio/ajuste</span>':'',conflictDays?'<span class="escala-key-inline"><b>!</b> Conflito</span>':''].filter(Boolean).join('');
  const tables = bands.map((band, bandIndex) => {
    const bandPeriod=`${format(band[0],'dd/MM/yyyy')} a ${format(band[band.length-1],'dd/MM/yyyy')}`;
    const bandKeys=new Set(band.map(dateKey));
    const bandAudits=audits.filter((_,i)=>bandKeys.has(dateKey(days[i])));
    const bandMinutes=bandAudits.reduce((sum,a)=>sum+a.uniqueMinutes,0);
    const bandTables=[...groups].sort(([a], [b]) => a.localeCompare(b, 'pt-BR')).map(([unit, rows]) => {
    const header = band.map(day => `<th scope="col" class="${day.getDay() % 6 === 0 ? 'escala-weekend' : ''}"><span class="escala-day-number">${format(day, 'dd')}</span><span class="escala-weekday">${weekdays[day.getDay()]}</span></th>`).join('');
    const activeRows=[...rows.values()].filter(row=>[...row.dates.keys()].some(key=>bandKeys.has(key)));
    if(!activeRows.length)return '';
    const body = activeRows.sort((a, b) => a.entry.person.localeCompare(b.entry.person, 'pt-BR') || a.entry.place.localeCompare(b.entry.place, 'pt-BR')).map(({ entry, dates }) => {
      const person = people.get(entry.personId);
      // Remove only an exact repeated unit prefix; never infer a sector from free text.
      const local = entry.place.startsWith(unit + ' · ') ? entry.place.slice(unit.length + 3)
        : entry.place.startsWith(unit + ' - ') ? entry.place.slice(unit.length + 3) : entry.place === unit ? '' : entry.place;
      const identity = [person?.registration, `CBO ${person?.cbo || 'não informado'}`].filter(Boolean).join(' · ');
      const modes = [...new Set([...dates].filter(([key])=>bandKeys.has(key)).flatMap(([,entries])=>entries.map(e=>e.mode)))].filter(Boolean).join(' / ');
      const location = [person?.profession, local, modes].filter(Boolean).join(' · ');
      const cells = band.map(day => {
        const entries = dates.get(dateKey(day)) || [];
        const tokens = entries.map(e => {
          const slot = codes.get(e.hours);
          const code = e.minutes > 0 ? slot?.code || 'H' : 'B';
          const css = e.minutes > 0 ? `escala-${(slot?.prefix || 'H').toLowerCase()}` : 'escala-block';
          const marks=[e.informational?'i':'',e.continuation?'c':'',e.reason?'*':'',e.conflict||conflictedEntries.has(e)?'!':''].filter(Boolean).join(' ');
          return `<span class="escala-token ${css}${e.conflict || conflictedEntries.has(e) ? ' escala-conflict' : ''}" title="${escape([e.hours || 'Bloqueado', e.mode, e.reason].filter(Boolean).join(' · '))}">${escape(code)}${marks?`<span class="escala-marks">${marks}</span>`:''}</span>`;
        }).join('');
        return `<td class="${day.getDay() % 6 === 0 ? 'escala-weekend' : ''}">${tokens || '<span class="escala-missing">–</span>'}</td>`;
      }).join('');
      const minutes = [...dates].filter(([key])=>bandKeys.has(key)).reduce((sum, [,entries]) => sum + summarizeEscalaDay(entries).uniqueMinutes, 0);
      const monthMinutes=[...dates.values()].reduce((sum,entries)=>sum+summarizeEscalaDay(entries).uniqueMinutes,0);
      return `<tr><th scope="row" class="escala-person"><strong>${escape(entry.person)}</strong><small>${escape(location)}</small><small>${escape(identity)}</small>${entry.currentInactive ? '<small>Cadastro atualmente inativo</small>' : ''}${person?.unit && person.unit !== unit ? `<small>Lotação: ${escape(person.unit)}</small>` : ''}</th>${cells}<td class="escala-total">${hoursLabel(minutes)}</td>${bands.length>1?`<td class="escala-total escala-month-total">${hoursLabel(monthMinutes)}</td>`:''}</tr>`;
    }).join('');
    const usedHours=new Set(activeRows.flatMap(row=>[...row.dates].filter(([key])=>bandKeys.has(key)).flatMap(([,entries])=>entries.filter(e=>e.minutes>0).map(e=>e.hours))));
    const localCodes=[...codes].filter(([hours])=>usedHours.has(hours));
    // Small legends repeat with the column headers on each continuation page. Larger ones flow below the table.
    const shortLegend=localCodes.length<=8&&localCodes.every(([hours])=>hours.length<=24);
    const renderCodes=localCodes.map(([hours,{code,prefix}])=>`<span class="escala-legend-item"><span class="escala-legend-code escala-${prefix.toLowerCase()}">${escape(code)}</span>${escape(hours)}</span>`).join('');
    const span=band.length+(bands.length>1?3:2);
    return `<table class="escala-table ${band.length>16?'escala-wide':'escala-readable'}" aria-label="Escala de ${escape(unit)}"><colgroup><col style="width:56mm">${band.map(() => '<col>').join('')}<col style="width:19mm">${bands.length>1?'<col style="width:19mm">':''}</colgroup><thead><tr><th colspan="${span}" class="escala-group">${escape(unit)} · ${bandPeriod}</th></tr><tr class="escala-caption-row"><th colspan="${span}">${escape(title)} · ${bands.length>1?'Faixa '+(bandIndex+1)+' de '+bands.length:'Período completo'} · Carga prevista por local</th></tr><tr class="escala-key-row"><th colspan="${span}">${shortLegend?renderCodes:'Horários detalhados na legenda desta unidade, abaixo da grade.'}<div>${flags}</div></th></tr><tr class="escala-days"><th scope="col" class="escala-person">Profissional / local</th>${header}<th scope="col" class="escala-total">${bands.length>1?'Total faixa':'Carga prevista'}</th>${bands.length>1?'<th scope="col" class="escala-total escala-month-total">Mês (local)</th>':''}</tr></thead><tbody>${body}</tbody></table>${!shortLegend?`<div class="escala-legend"><strong>Horários · ${escape(unit)} · ${bandPeriod}</strong><div class="escala-legend-items">${renderCodes}</div></div>`:''}`;
    }).join('');
    return `<section class="escala-section">${bands.length>1?`<h2 class="escala-section-title">${bandIndex+1}ª quinzena · ${bandPeriod} · ${hoursLabel(bandMinutes)} previstos sem dupla contagem</h2>`:''}${bandTables||'<p class="escala-notes">Sem escala cadastrada nesta faixa de datas.</p>'}</section>`;
  }).join('');
  const professionalCount=new Set(input.calendar.flatMap(day=>day.entries.map(e=>e.personId))).size;
  const recordCount=input.calendar.reduce((sum,day)=>sum+day.entries.length,0);
  const body = `${stylesheet}<div class="escala-print"><div class="escala-summary"><span><strong>${professionalCount}</strong> profissionais</span><span><strong>${recordCount}</strong> registros exibidos</span><span><strong>Carga prevista sem dupla contagem: ${hoursLabel(uniqueTotal)}</strong></span>${conflictDays ? `<span><strong>${conflictDays}</strong> dia(s) com sobreposição · ${hoursLabel(overlapTotal)} de registros simultâneos descontados</span>` : ''}</div>${tables}
    ${notes.length ? `<div class="escala-notes"><strong>Bloqueios e ajustes do período</strong><ul>${[...new Set(notes)].map(note => `<li>${escape(note)}</li>`).join('')}</ul></div>` : ''}
    <p class="escala-notes">Carga prevista: união dos intervalos por profissional e dia, com descontos de bloqueio já aplicados. O total geral desconta sobreposições entre locais; os totais de cada linha são por local e não devem ser somados quando há conflitos. ${bands.length>1?' Na impressão por quinzenas, a coluna Mês (local) repete o total mensal daquela linha para consulta; não some essa coluna entre faixas.':''} Registros simultâneos permanecem visíveis para conferência. Este documento não comprova frequência. Sem escala cadastrada não significa folga.</p>
    <div class="escala-signatures"><div>Assinatura do(a) Profissional<br><small>Identificação / conselho profissional</small></div><div>Chefia Imediata / Coordenação SMS<br><small>Identificação / carimbo</small></div></div></div>`;
  return { title, body, meta: {
    Período: period,
    Local: escape(input.placeFilter),
    Formato: input.monthly ? bands.length>1?'A4 paisagem · quinzenas':'A4 paisagem · mês completo' : 'A4 paisagem · semanal',
    Profissional: escape(input.professionalFilter || 'Todos os profissionais do filtro'),
    'Emitido por': escape(input.emittedBy),
  } };
}
