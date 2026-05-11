// Edge Function: generate-bpa
// Gera arquivo BPA (SIA/SUS) conforme layout oficial do Ministério da Saúde.
//
// Estrutura do arquivo:
//   - Linha 01 (Header)            : controle do arquivo (CNES origem, competência, hash, etc.)
//   - Linha 03 (BPA-I)             : 1 linha por procedimento individualizado (250 colunas fixas)
//   - Linha 99 (Trailler)          : rodapé com totais

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

// ─── Utilitários de formatação ───────────────────────────────────────────────
const removeAccents = (s: string) =>
  (s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '');

const sanitize = (s: string) =>
  removeAccents(String(s || '')).toUpperCase().replace(/[^A-Z0-9 ]/g, '');

const onlyDigits = (s: string) => String(s || '').replace(/\D/g, '');

const padText = (v: string, len: number) => {
  const s = sanitize(v).slice(0, len);
  return s + ' '.repeat(Math.max(0, len - s.length));
};

const padNum = (v: string | number, len: number) => {
  const s = onlyDigits(String(v ?? '')).slice(-len);
  return s.padStart(len, '0');
};

const racaMap: Record<string, string> = {
  branca: '01', branco: '01',
  preta: '02', preto: '02', negra: '02', negro: '02',
  parda: '03', pardo: '03',
  amarela: '04', amarelo: '04',
  indigena: '05', indígena: '05',
  '01': '01', '02': '02', '03': '03', '04': '04', '05': '05',
  '99': '99',
};
const mapRaca = (v: string) => {
  const key = removeAccents((v || '').toLowerCase().trim());
  return racaMap[key] || '99'; 
};

const mapSexo = (v: string) => {
  const s = (v || '').toLowerCase().trim();
  if (s.startsWith('m')) return 'M';
  if (s.startsWith('f')) return 'F';
  return 'I';
};

const formatDate = (d: string) => {
  const digits = onlyDigits(d);
  if (digits.length === 8) return digits;
  if (/^\d{4}-\d{2}-\d{2}/.test(d)) return d.slice(0, 10).replace(/-/g, '');
  if (/^\d{2}\/\d{2}\/\d{4}/.test(d)) {
    const [dd, mm, yyyy] = d.slice(0, 10).split('/');
    return `${yyyy}${mm}${dd}`;
  }
  return digits.slice(0, 8).padEnd(8, '0');
};

const isMedico = (cbo: string) => onlyDigits(cbo).startsWith('225');

// ─── Hash de controle do header BPA (algoritmo padrão DATASUS) ───────────────
const calcularHashControle = (linhas: string[]): string => {
  const conteudo = linhas.join('');
  let soma = 0;
  for (let i = 0; i < conteudo.length; i++) {
    soma += conteudo.charCodeAt(i);
  }
  const tabela = 'abcdefghijklmnopqrstuvwxyz0123456789';
  let resto = soma % 1111;
  let hash = '';
  for (let i = 0; i < 4; i++) {
    hash = tabela[resto % 36] + hash;
    resto = Math.floor(resto / 36);
  }
  return hash;
};

interface PendingItem {
  prontuario_id: string;
  paciente_nome: string;
  profissional_nome: string;
  procedimento_nome: string;
  motivos: string[];
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, serviceKey);

    const body = await req.json();
    const competencia: string = onlyDigits(String(body?.competencia || '')).slice(0, 6);
    const unidadeId: string = String(body?.unidade_id || '');
    const cnesOverride: string = onlyDigits(String(body?.cnes || ''));

    if (competencia.length !== 6) {
      return new Response(JSON.stringify({ error: 'competencia inválida (AAAAMM)' }), { 
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      });
    }

    const ano = competencia.slice(0, 4);
    const mes = competencia.slice(4, 6);
    const dataInicio = `${ano}-${mes}-01`;
    const end = new Date(Number(ano), Number(mes), 0, 23, 59, 59, 999);
    const dataFim = end.toISOString().split('T')[0];
    
    console.log("[generate-bpa] competencia resolvida", { competencia, dataInicio, dataFim });


    // 1. Carrega configurações e dados do período com limites maiores
    let prontQuery = supabase
      .from('prontuarios')
      .select('id, paciente_id, paciente_nome, profissional_id, profissional_nome, data_atendimento, unidade_id')
      .gte('data_atendimento', dataInicio)
      .lte('data_atendimento', dataFim)
      .limit(5000)
      .order('data_atendimento', { ascending: true });
    
    if (unidadeId) prontQuery = prontQuery.eq('unidade_id', unidadeId);

    const [{ data: configData }, { data: prontuarios, error: prontErr }] = await Promise.all([
      supabase.from('system_config').select('configuracoes').limit(1).maybeSingle(),
      prontQuery
    ]);

    const cfg = configData?.configuracoes || {};
    const triagemSigtapPadrao = String(cfg.bpa_triagem_sigtap || '').replace(/\D/g, '');

    if (prontErr) throw prontErr;
    const prots = prontuarios || [];

    // 2. Triagens do período
    const { data: triagens } = await supabase
      .from('triage_records')
      .select('id, agendamento_id, tecnico_id, criado_em')
      .gte('criado_em', `${dataInicio}T00:00:00`)
      .lte('criado_em', `${dataFim}T23:59:59`)
      .limit(5000);

    const agsIds = [...new Set((triagens || []).map((t: any) => t.agendamento_id).filter(Boolean))];
    const { data: agsData } = agsIds.length
      ? await supabase.from('agendamentos').select('id, paciente_id, paciente_nome, unidade_id, data').in('id', agsIds).limit(5000)
      : { data: [] as any[] };
    const agsMap = new Map(agsData.map((a: any) => [a.id, a]));

    // 3. Procedimentos vinculados
    const prontIds = prots.map((p: any) => p.id);
    const { data: vincs } = prontIds.length 
      ? await supabase.from('prontuario_procedimentos').select('prontuario_id, procedimento_id').in('prontuario_id', prontIds).limit(5000)
      : { data: [] };

    const procIds = [...new Set((vincs || []).map((v: any) => v.procedimento_id))];
    const { data: procsData } = procIds.length
      ? await supabase.from('procedimentos').select('id, nome, codigo_sigtap').in('id', procIds).limit(1000)
      : { data: [] as any[] };
    const procMap = new Map((procsData || []).map((p: any) => [p.id, p]));

    const vincsByProntuario = new Map<string, any[]>();
    (vincs || []).forEach((v: any) => {
      const arr = vincsByProntuario.get(v.prontuario_id) || [];
      arr.push(v);
      vincsByProntuario.set(v.prontuario_id, arr);
    });

    // 4. Mapas auxiliares
    const pacIds = new Set<string>();
    const profIds = new Set<string>();
    const uniIds = new Set<string>();

    prots.forEach((p: any) => {
      if (p.paciente_id) pacIds.add(p.paciente_id);
      if (p.profissional_id) profIds.add(p.profissional_id);
      if (p.unidade_id) uniIds.add(p.unidade_id);
    });
    
    (triagens || []).forEach((t: any) => {
      const ag = agsMap.get(t.agendamento_id);
      if (ag) {
        if (ag.paciente_id) pacIds.add(ag.paciente_id);
        if (ag.unidade_id) uniIds.add(ag.unidade_id);
      }
      if (t.tecnico_id) profIds.add(t.tecnico_id);
    });

    const [{ data: pacs }, { data: profs }, { data: unis }] = await Promise.all([
      pacIds.size ? supabase.from('pacientes').select('*').in('id', Array.from(pacIds)).limit(5000) : Promise.resolve({ data: [] }),
      profIds.size ? supabase.from('funcionarios').select('*').in('id', Array.from(profIds)).limit(1000) : Promise.resolve({ data: [] }),
      uniIds.size ? supabase.from('unidades').select('*').in('id', Array.from(uniIds)).limit(100) : Promise.resolve({ data: [] }),
    ]);

    const patientMap = new Map((pacs || []).map((p: any) => [p.id, p]));
    const employeeMap = new Map((profs || []).map((f: any) => [f.id, f]));
    const unitMap = new Map((unis || []).map((u: any) => [u.id, u]));

    // 5. Processamento
    const linhasBpa: string[] = [];
    const pendentes: PendingItem[] = [];
    let totalAtendimentos = 0;
    let folha = 1;
    let seq = 0;

    type Item = { 
      id: string; paciente_id: string; paciente_nome: string; profissional_id: string; 
      profissional_nome: string; data: string; unidade_id: string; proc: any | null; origem: 'prontuario' | 'triagem' 
    };
    const items: Item[] = [];

    for (const pront of prots as any[]) {
      const procsDoProntuario = vincsByProntuario.get(pront.id) || [];
      if (procsDoProntuario.length === 0) {
        items.push({ 
          id: pront.id, paciente_id: pront.paciente_id, paciente_nome: pront.paciente_nome,
          profissional_id: pront.profissional_id, profissional_nome: pront.profissional_nome, 
          data: pront.data_atendimento, unidade_id: pront.unidade_id, proc: null, origem: 'prontuario' 
        });
      } else {
        for (const v of procsDoProntuario) {
          items.push({ 
            id: pront.id, paciente_id: pront.paciente_id, paciente_nome: pront.paciente_nome,
            profissional_id: pront.profissional_id, profissional_nome: pront.profissional_nome, 
            data: pront.data_atendimento, unidade_id: pront.unidade_id, proc: procMap.get(v.procedimento_id), origem: 'prontuario' 
          });
        }
      }
    }

    for (const t of (triagens || [])) {
      const ag = agsMap.get(t.agendamento_id);
      if (!ag) continue;
      if (unidadeId && ag.unidade_id !== unidadeId) continue;
      const tecnico = employeeMap.get(t.tecnico_id);
      items.push({
        id: t.id, paciente_id: ag.paciente_id, paciente_nome: ag.paciente_nome,
        profissional_id: t.tecnico_id, profissional_nome: tecnico?.nome || 'Técnico',
        data: ag.data || (t.criado_em || '').slice(0, 10), unidade_id: ag.unidade_id,
        proc: triagemSigtapPadrao ? { codigo_sigtap: triagemSigtapPadrao, nome: 'Triagem' } : null, origem: 'triagem'
      });
    }

    items.sort((a, b) => a.data.localeCompare(b.data));

    for (const item of items) {
      const { id, paciente_id, paciente_nome, profissional_id, profissional_nome, data, unidade_id, proc, origem } = item;
      totalAtendimentos += 1;

      const motivos: string[] = [];
      const pac: any = patientMap.get(paciente_id);
      const prof: any = employeeMap.get(profissional_id);
      const uni: any = unitMap.get(unidade_id);

      if (!pac) motivos.push('Paciente não encontrado');
      const cns = pac ? onlyDigits(pac.cns) : '';
      const cpf = pac ? onlyDigits(pac.cpf) : '';
      if (cns.length !== 15 && cpf.length !== 11) motivos.push('CNS ou CPF obrigatório');
      if (pac && !pac.nome) motivos.push('Nome ausente');
      if (pac && !pac.data_nascimento) motivos.push('Data nasc. ausente');

      const cbo = prof ? String((prof.custom_data || {}).cbo_codigo || '') : '';
      const cboDigits = onlyDigits(cbo);
      if (!cboDigits) motivos.push('CBO ausente');

      const cnesUni = uni ? onlyDigits((uni.custom_data || {}).cnes || '') : '';
      const cnes = cnesOverride || cnesUni;
      if (!cnes) motivos.push('CNES ausente');

      const sigtap = proc ? onlyDigits(proc.codigo_sigtap || '') : '';
      const exigeSigtap = !isMedico(cboDigits);
      if (exigeSigtap && (!proc || sigtap.length !== 10)) motivos.push('SIGTAP obrigatório');

      if (motivos.length > 0) {
        pendentes.push({ 
          prontuario_id: id, paciente_nome, profissional_nome, 
          procedimento_nome: proc?.nome || (isMedico(cboDigits) ? 'Consulta' : '—'), motivos 
        });
        continue;
      }

      const pacCustom = pac.custom_data || {};
      const raca = mapRaca(String(pacCustom.raca_cor || pacCustom.racaCor || '99'));
      let nac = String(pacCustom.nacionalidade_codigo || pacCustom.nacionalidade || '010');
      if (nac.toLowerCase().includes('brasil') || nac.toLowerCase().includes('brasileir')) nac = '010';
      const nacionalidade = padNum(nac, 3);
      const sexo = mapSexo(String(pacCustom.sexo || ''));
      const etnia = onlyDigits(pacCustom.etnia_codigo || '').padStart(4, '0').slice(-4);
      let munCode = String(pacCustom.municipio_ibge || pacCustom.codigo_ibge_municipio || pac.municipio || '');
      if (munCode.toUpperCase().includes('ORIXIMINA')) munCode = '150530';
      const municipio = padNum(munCode, 6);
      const cep = padNum(pacCustom.cep || '', 8);
      const cid = String(pacCustom.cid || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 4);
      const carater = padNum(pacCustom.carater_atendimento || '01', 2);
      const autorizacao = padText(String(pacCustom.numero_autorizacao || ''), 13);
      const sigtapFinal = sigtap.length === 10 ? sigtap : (origem === 'triagem' ? triagemSigtapPadrao : '0301010072');

      seq += 1;
      if (seq > 99) { folha += 1; seq = 1; }

      const dtNasc = formatDate(pac.data_nascimento);
      const dtAtend = formatDate(data);
      let idade = 0;
      if (dtNasc.length === 8 && dtAtend.length === 8) {
        const yN = Number(dtNasc.slice(0, 4)), mN = Number(dtNasc.slice(4, 6)), dN = Number(dtNasc.slice(6, 8));
        const yA = Number(dtAtend.slice(0, 4)), mA = Number(dtAtend.slice(4, 6)), dA = Number(dtAtend.slice(6, 8));
        idade = yA - yN;
        if (mA < mN || (mA === mN && dA < dN)) idade -= 1;
        if (idade < 0) idade = 0;
      }

      const cnsProf = padNum(String((prof.custom_data || {}).cns || ''), 15);
      const cnsPac = cns.length === 15 ? cns : padNum(cpf, 15);

      // Linha tipo 03 (Individualizado) - 250 colunas (Padrão SIA/SUS)
      const linha =
        '03' +                                  // 1-2
        padNum(cnes, 7) +                       // 3-9
        padNum(competencia, 6) +                // 10-15
        cnsProf +                               // 16-30
        padNum(cboDigits, 6) +                  // 31-36
        dtAtend +                               // 37-44
        padNum(folha, 3) +                      // 45-47
        padNum(seq, 2) +                        // 48-49
        padNum(sigtapFinal, 10) +               // 50-59
        cnsPac +                                // 60-74
        sexo +                                  // 75
        municipio +                             // 76-81
        padText(cid, 4) +                       // 82-85
        padNum(idade, 3) +                      // 86-88
        padNum(1, 6) +                          // 89-94
        carater +                               // 95-96
        autorizacao +                           // 97-109
        'BPA' +                                 // 110-112
        padText(pac.nome, 30) +                 // 113-142
        dtNasc +                                // 143-150
        raca +                                  // 151-152
        padText(etnia, 4) +                     // 153-156
        padNum(nacionalidade, 3) +              // 157-159
        padText(cpf, 11) +                      // 160-170
        padNum(cep, 8) +                        // 171-178
        ' '.repeat(72);                         // 179-250 (Filler)

      linhasBpa.push(linha);
    }

    // ─── Header tipo 01 ────────────────────────────────────────────────────────
    const hash = calcularHashControle(linhasBpa);
    const cabecalho = 
      '01' + '#BPA' + padNum(competencia, 6) + padNum(folha, 6) + padNum(linhasBpa.length, 6) +
      padText('SMS', 14) + padText('SECRETARIA DE SAUDE', 40) + padText('MS', 10) + 'M' + 'I' + hash +
      ' '.repeat(159); // Padded to 250

    // ─── Trailler tipo 99 ──────────────────────────────────────────────────────
    const rodape = '99' + padNum(linhasBpa.length, 6) + ' '.repeat(242); // Padded to 250

    const conteudo = [cabecalho, ...linhasBpa, rodape].join('\r\n') + '\r\n';
    
    return new Response(JSON.stringify({
      success: true, filename: `PA${competencia}.txt`, conteudo,
      total_atendimentos: totalAtendimentos, total_exportados: linhasBpa.length, total_pendentes: pendentes.length, pendentes
    }), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

  } catch (err) {
    console.error(err);
    return new Response(JSON.stringify({ error: String(err) }), { 
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
    });
  }
});
