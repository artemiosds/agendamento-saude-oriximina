// Edge Function: generate-bpa
// Gera arquivo BPA-I (SIA/SUS) em formato fixed-width a partir dos atendimentos do mês.
// Estratégia: PULAR atendimentos incompletos e retornar relatório de pendências.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

// ─── Utilitários de formatação fixed-width ───────────────────────────────────
const removeAccents = (s: string) =>
  (s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '');

const sanitize = (s: string) =>
  removeAccents(String(s || '')).toUpperCase().replace(/[^A-Z0-9 ]/g, '');

const onlyDigits = (s: string) => String(s || '').replace(/\D/g, '');

// Pad text à direita com espaços (textos)
const padText = (v: string, len: number) => {
  const s = sanitize(v).slice(0, len);
  return s + ' '.repeat(Math.max(0, len - s.length));
};

// Pad números à esquerda com zeros
const padNum = (v: string | number, len: number) => {
  const s = onlyDigits(String(v ?? '')).slice(-len);
  return s.padStart(len, '0');
};

// Mapeamento Raça/Cor (padrão IBGE → BPA)
const racaMap: Record<string, string> = {
  branca: '01', preta: '02', parda: '03', amarela: '04', indigena: '05',
  '01': '01', '02': '02', '03': '03', '04': '04', '05': '05',
};
const mapRaca = (v: string) => racaMap[(v || '').toLowerCase().trim()] || '99';

// Sexo: M / F
const mapSexo = (v: string) => {
  const s = (v || '').toLowerCase().trim();
  if (s.startsWith('m')) return 'M';
  if (s.startsWith('f')) return 'F';
  return 'I';
};

// Data YYYY-MM-DD → YYYYMMDD
const formatDate = (d: string) => onlyDigits(d).slice(0, 8).padEnd(8, '0');

// ─── Validação de atendimento ────────────────────────────────────────────────
interface AtendimentoRow {
  id: string;
  paciente_id: string;
  paciente_nome: string;
  profissional_id: string;
  profissional_nome: string;
  procedimento: string;
  data: string;
  unidade_id: string;
  custom_data?: Record<string, unknown>;
}

interface PacienteRow {
  id: string;
  nome: string;
  cpf: string;
  cns: string;
  data_nascimento: string;
  custom_data?: Record<string, unknown>;
}

interface FuncionarioRow {
  id: string;
  nome: string;
  custom_data?: Record<string, unknown>;
}

interface UnidadeRow {
  id: string;
  nome: string;
  custom_data?: Record<string, unknown>;
}

interface PendingItem {
  atendimento_id: string;
  paciente_nome: string;
  profissional_nome: string;
  motivos: string[];
}

// ─── Handler ─────────────────────────────────────────────────────────────────
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
      return new Response(
        JSON.stringify({ error: 'competencia inválida (esperado AAAAMM)' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    const ano = competencia.slice(0, 4);
    const mes = competencia.slice(4, 6);
    const dataInicio = `${ano}-${mes}-01`;
    const ultDia = new Date(Number(ano), Number(mes), 0).getDate();
    const dataFim = `${ano}-${mes}-${String(ultDia).padStart(2, '0')}`;

    // 1. Buscar atendimentos do período
    let atQuery = supabase
      .from('atendimentos')
      .select('id, paciente_id, paciente_nome, profissional_id, profissional_nome, procedimento, data, unidade_id, custom_data')
      .gte('data', dataInicio)
      .lte('data', dataFim)
      .order('data', { ascending: true });
    if (unidadeId) atQuery = atQuery.eq('unidade_id', unidadeId);

    const { data: atendimentos, error: atErr } = await atQuery;
    if (atErr) throw atErr;
    const ats = (atendimentos || []) as AtendimentoRow[];

    if (ats.length === 0) {
      return new Response(
        JSON.stringify({ error: 'Nenhum atendimento encontrado no período' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    // 2. Carregar pacientes, profissionais e unidades referenciados
    const pacIds = [...new Set(ats.map(a => a.paciente_id).filter(Boolean))];
    const profIds = [...new Set(ats.map(a => a.profissional_id).filter(Boolean))];
    const uniIds = [...new Set(ats.map(a => a.unidade_id).filter(Boolean))];

    const [{ data: pacs }, { data: profs }, { data: unis }] = await Promise.all([
      supabase.from('pacientes').select('id, nome, cpf, cns, data_nascimento, custom_data').in('id', pacIds),
      supabase.from('funcionarios').select('id, nome, custom_data').in('id', profIds),
      supabase.from('unidades').select('id, nome, custom_data').in('id', uniIds),
    ]);

    const pacMap = new Map((pacs || []).map((p: PacienteRow) => [p.id, p]));
    const profMap = new Map((profs || []).map((f: FuncionarioRow) => [f.id, f]));
    const uniMap = new Map((unis || []).map((u: UnidadeRow) => [u.id, u]));

    // 3. Validar e separar válidos × pendentes
    const linhas: string[] = [];
    const pendentes: PendingItem[] = [];

    let folha = 1;
    let seq = 0;

    for (const at of ats) {
      const motivos: string[] = [];
      const pac = pacMap.get(at.paciente_id);
      const prof = profMap.get(at.profissional_id);
      const uni = uniMap.get(at.unidade_id);

      if (!pac) motivos.push('Paciente não encontrado');
      if (!prof) motivos.push('Profissional não encontrado');

      const cns = pac ? onlyDigits(pac.cns) : '';
      if (!cns || cns.length !== 15) motivos.push('CNS inválido ou ausente');

      const cbo = prof ? String((prof.custom_data as any)?.cbo_codigo || '') : '';
      if (!cbo || onlyDigits(cbo).length === 0) motivos.push('CBO ausente');

      const sigtap = onlyDigits(at.procedimento || '');
      if (!sigtap || sigtap.length === 0) motivos.push('Procedimento SIGTAP ausente');

      const cnes = cnesOverride || (uni ? onlyDigits((uni.custom_data as any)?.cnes || '') : '');
      if (!cnes || cnes.length === 0) motivos.push('CNES da unidade ausente');

      if (motivos.length > 0) {
        pendentes.push({
          atendimento_id: at.id,
          paciente_nome: at.paciente_nome,
          profissional_nome: at.profissional_nome,
          motivos,
        });
        continue;
      }

      // Construir linha BPA-I (tipo 02 — Individualizado)
      seq += 1;
      if (seq > 99) { folha += 1; seq = 1; }

      const pacCustom = (pac!.custom_data as any) || {};
      const cid = String(pacCustom.cid || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
      const raca = mapRaca(String(pacCustom.raca_cor || pacCustom.racaCor || ''));
      const nacionalidade = padNum(pacCustom.nacionalidade_codigo || '010', 3); // 010 = Brasileiro
      const sexo = mapSexo(String(pacCustom.sexo || ''));

      const linha =
        '02' +                                       // tipo registro (2)
        padNum(cnes, 7) +                            // CNES (7)
        padNum(competencia, 6) +                     // competência (6)
        padNum(cbo, 6) +                             // CBO (6)
        padNum(folha, 3) +                           // folha (3)
        padNum(seq, 2) +                             // sequência (2)
        padNum(sigtap, 10) +                         // procedimento SIGTAP (10)
        padNum(cns, 15) +                            // CNS paciente (15)
        formatDate(pac!.data_nascimento) +           // nascimento (8)
        sexo +                                       // sexo (1)
        padText(removeAccents(pac!.nome), 30) +      // nome paciente (30)
        formatDate(at.data) +                        // data atendimento (8)
        '001' +                                      // quantidade (3)
        padText(cid, 4) +                            // CID (4)
        padNum('', 13) +                             // autorização (13)
        raca +                                       // raça (2)
        padNum(nacionalidade, 3);                    // nacionalidade (3)

      linhas.push(linha);
    }

    // 4. Cabeçalho e rodapé
    const totalLinhas = linhas.length;
    const cabecalho = '01' + padNum(cnesOverride || '0', 7) + padNum(competencia, 6);
    const rodape = '99' + padNum(totalLinhas, 6);

    const conteudo = [cabecalho, ...linhas, rodape].join('\r\n') + '\r\n';
    const filename = `BPA_${competencia}.txt`;

    // 5. Log de exportação
    try {
      await supabase.from('action_logs').insert({
        modulo: 'bpa',
        acao: 'gerar_arquivo',
        entidade: 'bpa',
        entidade_id: competencia,
        unidade_id: unidadeId,
        detalhes: {
          competencia,
          total_atendimentos: ats.length,
          total_exportados: totalLinhas,
          total_pendentes: pendentes.length,
        },
        status: 'sucesso',
      });
    } catch (e) {
      console.error('log error', e);
    }

    return new Response(
      JSON.stringify({
        success: true,
        filename,
        conteudo,
        total_atendimentos: ats.length,
        total_exportados: totalLinhas,
        total_pendentes: pendentes.length,
        pendentes,
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  } catch (err) {
    console.error('generate-bpa error', err);
    return new Response(
      JSON.stringify({ error: String((err as Error).message || err) }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  }
});
