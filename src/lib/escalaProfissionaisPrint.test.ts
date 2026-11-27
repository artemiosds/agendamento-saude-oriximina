import { describe, expect, it } from 'vitest';
import { buildEscalaProfissionaisPrint, type EscalaPrintEntry, type EscalaPrintInput } from './escalaProfissionaisPrint';

const entry = (overrides: Partial<EscalaPrintEntry> = {}): EscalaPrintEntry => ({
  personId: 'p1', person: 'Profissional de teste', place: 'CER de teste · Sala 01', placeGroup: 'CER de teste',
  hours: '08:00–12:00', minutes: 240, mode: 'Por turno', ...overrides,
});
const fixture = (overrides: Partial<EscalaPrintInput> = {}): EscalaPrintInput => ({
  calendar: [{ day: new Date(2026, 10, 2, 12), entries: [entry()] }],
  people: [{ id: 'p1', profession: 'Fisioterapia', registration: 'CREFITO / 123 / PA', cbo: '223605', unit: 'CER de teste' }],
  monthly: true, placeFilter: 'CER de teste', professionalFilter: '', emittedBy: 'Master de teste', ...overrides,
});
function render(input = fixture()) {
  const document = buildEscalaProfissionaisPrint(input);
  const dom = new DOMParser().parseFromString(document.body, 'text/html');
  return { ...document, dom };
}

describe('impressão institucional da escala', () => {
  it('monta a matriz de 30 dias com identificação, sala, resumo e assinatura sem criar dados', () => {
    const input = fixture({ calendar: Array.from({ length: 30 }, (_, index) => ({ day: new Date(2026, 10, index + 1, 12), entries: index === 1 ? [entry()] : [] })) });
    const before = structuredClone(input);
    const { dom, title, body, meta } = render(input);
    expect(title).toBe('ESCALA MENSAL DOS PROFISSIONAIS - NOVEMBRO / 2026');
    expect(dom.querySelectorAll('.escala-days th')).toHaveLength(32);
    expect(dom.querySelectorAll('.escala-weekday')).toHaveLength(30);
    expect([...dom.querySelectorAll('.escala-weekday')].every(day => day.textContent!.length === 3)).toBe(true);
    expect(dom.querySelectorAll('tbody tr')).toHaveLength(1);
    expect(dom.querySelector('.escala-person[scope="row"]')?.textContent).toContain('CREFITO / 123 / PA');
    expect(dom.querySelector('.escala-person[scope="row"]')?.textContent).toContain('CBO 223605');
    expect(dom.querySelector('tbody .escala-total')?.textContent).toBe('4h');
    expect(dom.querySelector('.escala-signatures')?.textContent).toContain('Assinatura do(a) Profissional');
    expect(meta.Período).toBe('01/11/2026 a 30/11/2026');
    expect(body).toContain('size: A4 landscape');
    expect(body).toContain('table-header-group');
    expect(input).toEqual(before);
  });

  it('distingue horários de manhã e não aplica um horário fixo a toda categoria', () => {
    const { dom } = render(fixture({ calendar: [
      { day: new Date(2026, 10, 2), entries: [entry({ hours: '07:00–11:00' })] },
      { day: new Date(2026, 10, 3), entries: [entry({ hours: '08:00–12:00' })] },
    ] }));
    expect([...dom.querySelectorAll('tbody .escala-token')].map(e => e.textContent)).toEqual(['M1', 'M2']);
    expect(dom.querySelector('.escala-key-row')?.textContent).toContain('M107:00–11:00');
    expect(dom.querySelector('.escala-key-row')?.textContent).toContain('M208:00–12:00');
    expect(dom.querySelector('tbody .escala-total')?.textContent).toBe('8h');
  });

  it('mantém bloqueio integral, horário remanescente e motivo visíveis, sem contar hora bloqueada', () => {
    const { dom } = render(fixture({ calendar: [
      { day: new Date(2026, 10, 2), entries: [entry({ hours: '', minutes: 0, reason: 'Feriado cadastrado' })] },
      { day: new Date(2026, 10, 3), entries: [entry({ hours: '10:00–12:00', minutes: 120, reason: 'Folga parcial' })] },
    ] }));
    expect(dom.querySelector('.escala-block')?.textContent).toBe('B*');
    expect(dom.querySelector('tbody .escala-total')?.textContent).toBe('2h');
    expect(dom.querySelector('.escala-notes')?.textContent).toContain('Feriado cadastrado (bloqueado)');
    expect(dom.querySelector('.escala-notes')?.textContent).toContain('horário remanescente: 10:00–12:00');
    expect(dom.querySelector('.escala-key-row')?.textContent).toContain('Sem escala cadastrada');
  });

  it('separa locais e salas, preserva escala informativa e horas de continuação dentro do recorte', () => {
    const { dom } = render(fixture({ calendar: [{ day: new Date(2026, 11, 1), entries: [
      entry({ place: 'Hospital de teste · Observação', placeGroup: 'Hospital de teste', hours: '00:00–07:00', minutes: 420, informational: true, continuation: true, mode: 'Manual · Continuação' }),
      entry({ place: 'CER de teste · Sala 02', hours: '13:00–15:30', minutes: 150 }),
      entry({ place: 'CER de teste · Sala 03', hours: '16:00–17:00', minutes: 60 }),
    ] }] }));
    expect(dom.querySelectorAll('table')).toHaveLength(2);
    expect(dom.querySelectorAll('tbody tr')).toHaveLength(3);
    expect([...dom.querySelectorAll('tbody .escala-total')].map(e => e.textContent)).toEqual(['2h 30min', '1h', '7h']);
    expect(dom.querySelector('.escala-key-row')?.textContent).toContain('Informativa (sem vagas)');
    expect(dom.querySelector('.escala-key-row')?.textContent).toContain('Continuação do dia anterior');
  });

  it('suporta semana que atravessa mês e não imprime profissionais sem entrada no calendário filtrado', () => {
    const { dom, title, meta } = render(fixture({ monthly: false,
      people: [...fixture().people, { id: 'outside', profession: 'NÃO EXIBIR' }],
      calendar: Array.from({ length: 7 }, (_, index) => ({ day: new Date(2026, 10, 30 + index, 12), entries: index === 0 ? [entry()] : [] })),
    }));
    expect(title).toBe('ESCALA SEMANAL DOS PROFISSIONAIS - 30/11/2026 a 06/12/2026');
    expect(meta.Período).toBe('30/11/2026 a 06/12/2026');
    expect(dom.querySelectorAll('.escala-days th')).toHaveLength(9);
    expect(dom.body.textContent).not.toContain('NÃO EXIBIR');
  });

  it('escapa cadastro, filtro, título de unidade e motivos contra injeção HTML', () => {
    const malicious = '<img src=x onerror="alert(1)">';
    const { dom, meta } = render(fixture({
      placeFilter: malicious, professionalFilter: malicious, emittedBy: malicious,
      calendar: [{ day: new Date(2026, 10, 2), entries: [entry({ person: malicious, place: malicious, placeGroup: malicious, reason: malicious })] }],
    }));
    expect(dom.querySelectorAll('img, script, [onerror]')).toHaveLength(0);
    expect(dom.querySelector('.escala-person[scope="row"]')?.textContent).toContain(malicious);
    expect(meta.Local).toContain('&lt;img');
    expect(meta['Emitido por']).not.toContain('<img');
  });

  it('rejeita períodos e resultados vazios sem emitir documento incompleto', () => {
    expect(() => buildEscalaProfissionaisPrint(fixture({ calendar: [] }))).toThrow('Selecione um período');
    expect(() => buildEscalaProfissionaisPrint(fixture({ calendar: [{ day: new Date(), entries: [] }] }))).toThrow('Não há escala');
  });

  it('mantém os 31 dias no formato compacto e separa as quinzenas sem perder registros', () => {
    const calendar = Array.from({length:31},(_,i)=>({day:new Date(2026,11,i+1,12),entries:[0,14,15,30].includes(i)?[entry()]:[]}));
    const input=fixture({calendar});
    const compact=render(input), split=render({...input,monthlyLayout:'fortnight'});
    expect(compact.dom.querySelectorAll('.escala-day-number')).toHaveLength(31);
    expect(split.dom.querySelectorAll('.escala-section')).toHaveLength(2);
    expect([...split.dom.querySelectorAll('table')].map(t=>t.querySelectorAll('.escala-day-number').length)).toEqual([15,16]);
    expect(split.dom.querySelectorAll('tbody .escala-token')).toHaveLength(4);
    expect([...split.dom.querySelectorAll('tbody .escala-total:not(.escala-month-total)')].map(e=>e.textContent)).toEqual(['8h','8h']);
    expect([...split.dom.querySelectorAll('tbody .escala-month-total')].map(e=>e.textContent)).toEqual(['16h','16h']);
    expect(split.dom.querySelector('.escala-summary')?.textContent).toContain('Carga prevista sem dupla contagem: 16h');
    expect(split.meta.Formato).toContain('quinzenas');
  });

  it('preserva faixas sem registros, não inventa folga e não cria linha vazia',()=>{
    const {dom}=render(fixture({monthlyLayout:'fortnight',calendar:Array.from({length:28},(_,i)=>({day:new Date(2027,1,i+1,12),entries:i===0?[entry()]:[]}))}));
    expect(dom.querySelectorAll('.escala-section')).toHaveLength(2);
    expect(dom.querySelectorAll('tbody tr')).toHaveLength(1);
    expect(dom.body.textContent).toContain('Sem escala cadastrada nesta faixa de datas');
    expect(dom.body.textContent).toContain('não significa folga');
  });

  it('mantém conflitos entre locais e desconta horas simultâneas do total geral',()=>{
    const {dom}=render(fixture({calendar:[{day:new Date(2026,10,2,12),entries:[
      entry(),entry({place:'Hospital de teste',placeGroup:'Hospital de teste',hours:'10:00–14:00',informational:true}),
    ]}]}));
    expect(dom.querySelectorAll('.escala-token.escala-conflict')).toHaveLength(2);
    expect(dom.querySelector('.escala-summary')?.textContent).toContain('Carga prevista sem dupla contagem: 6h');
    expect(dom.querySelector('.escala-summary')?.textContent).toContain('2h de registros simultâneos descontados');
    expect(dom.querySelectorAll('tbody .escala-token')).toHaveLength(2);
  });

  it('repete códigos pequenos no cabeçalho e usa legenda fluida para horários numerosos',()=>{
    const short=render();
    expect(short.dom.querySelector('thead .escala-legend-code')?.textContent).toBe('M');
    const calendar=Array.from({length:10},(_,i)=>({day:new Date(2026,10,i+1,12),entries:[entry({hours:'08:'+String(i).padStart(2,'0')+'–12:'+String(i).padStart(2,'0')})]}));
    const long=render(fixture({calendar}));
    expect(long.dom.querySelectorAll('.escala-legend .escala-legend-code')).toHaveLength(10);
    expect(long.dom.querySelector('thead .escala-key-row')?.textContent).toContain('abaixo da grade');
  });

  it('separa marcas visuais do código sem alterar horário, e rejeita duração inválida',()=>{
    const {dom}=render(fixture({calendar:[{day:new Date(2026,10,2,12),entries:[entry({hours:'00:00–07:00',minutes:420,informational:true,continuation:true,reason:'Ajuste'})]}]}));
    expect(dom.querySelector('.escala-marks')?.textContent).toBe('i c *');
    expect(dom.querySelector('.escala-token')?.getAttribute('title')).toContain('00:00–07:00');
    expect(()=>render(fixture({calendar:[{day:new Date(2026,10,2,12),entries:[entry({minutes:1})]}]}))).toThrow('horários inválidos');
  });

});
