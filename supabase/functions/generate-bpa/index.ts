// Edge Function: generate-bpa
// Gera arquivo BPA-I (SIA/SUS) em formato fixed-width a partir dos PRONTUÁRIOS FINALIZADOS do mês.
// Cada procedimento vinculado ao prontuário (via prontuario_procedimentos) gera 1 linha BPA.
// Estratégia: PULAR registros incompletos e retornar relatório de pendências.

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

const padText = (v: string, len: number) => {
  const s = sanitize(v).slice(0, len);
  return s + ' '.repeat(Math.max(0, len - s.length));
};

const padNum = (v: string | number, len: number) => {
  const s = onlyDigits(String(v ?? '')).slice(-len);
  return s.padStart(len, '0');
};

const racaMap: Record<string, string> = {
  branca: '01', preta: '02', parda: '03', amarela: '04', indigena: '05',
  '01': '01', '02': '02', '03': '03', '04': '04', '05': '05',
};
const mapRaca = (v: string) => racaMap[(v || '').toLowerCase().trim()] || '99';

const mapSexo = (v: string) => {
  const s = (v || '').toLowerCase().trim();
  if (s.startsWith('m')) return 'M';
  if (s.startsWith('f')) return 'F';
  return 'I';
};

const formatDate = (d: string) => onlyDigits(d).slice(0, 8).padEnd(8, '0');

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

    // 1. Prontuários do período
    let prontQuery = supabase
      .from('prontuarios')
      .select('id, paciente_id, paciente_nome, profissional_id, profissional_nome, data_atendimento, unidade_id')
      .gte('data_atendimento', dataInicio)
      .lte('data_atendimento', dataFim)
      .order('data_atendimento', { ascending: true });
    if (unidadeId) prontQuery = prontQuery.eq('unidade_id', unidadeId);

    const { data: prontuarios, error: prontErr } = await prontQuery;
    if (prontErr) throw prontErr;
    const prots = prontuarios || [];

    if (prots.length === 0) {
      return new Response(
        JSON.stringify({ error: 'Nenhum prontuário encontrado no período' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    // 2. Procedimentos vinculados aos prontuários
    const prontIds = prots.map((p: any) => p.id);
    const { data: vincs } = await supabase
      .from('prontuario_procedimentos')
      .select('prontuario_id, procedimento_id')
      .in('prontuario_id', prontIds);

    const procIds = [...new Set((vincs || []).map((v: any) => v.procedimento_id))];
    const { data: procsData } = procIds.length
      ? await supabase
          .from('procedimentos')
          .select('id, nome, codigo_sigtap')
          .in('id', procIds)
      : { data: [] as any[] };
    const procMap = new Map((procsData || []).map((p: any) => [p.id, p]));

    // Agrupa procedimentos por prontuário
    const vincsByProntuario = new Map<string, any[]>();
    (vincs || []).forEach((v: any) => {
      const arr = vincsByProntuario.get(v.prontuario_id) || [];
      arr.push(v);
      vincsByProntuario.set(v.prontuario_id, arr);
    });

    // 3. Pacientes / Profissionais / Unidades
    const pacIds = [...new Set(prots.map((p: any) => p.paciente_id).filter(Boolean))];
    const profIds = [...new Set(prots.map((p: any) => p.profissional_id).filter(Boolean))];
    const uniIds = [...new Set(prots.map((p: any) => p.unidade_id).filter(Boolean))];

    const [{ data: pacs }, { data: profs }, { data: unis }] = await Promise.all([
      pacIds.length
        ? supabase.from('pacientes').select('id, nome, cpf, cns, data_nascimento, custom_data').in('id', pacIds)
        : Promise.resolve({ data: [] }),
      profIds.length
        ? supabase.from('funcionarios').select('id, nome, custom_data').in('id', profIds)
        : Promise.resolve({ data: [] }),
      uniIds.length
        ? supabase.from('unidades').select('id, nome, custom_data').in('id', uniIds)
        : Promise.resolve({ data: [] }),
    ]);

    const pacMap = new Map((pacs || []).map((p: any) => [p.id, p]));
    const profMap = new Map((profs || []).map((f: any) => [f.id, f]));
    const uniMap = new Map((unis || []).map((u: any) => [u.id, u]));

    // 4. Geração
    const linhas: string[] = [];
    const pendentes: PendingItem[] = [];
    let totalAtendimentos = 0;
    let folha = 1;
    let seq = 0;

    for (const pront of prots as any[]) {
      const procsDoProntuario = vincsByProntuario.get(pront.id) || [];
      if (procsDoProntuario.length === 0) {
        // Prontuário sem procedimento — não entra no BPA
        totalAtendimentos += 1;
        pendentes.push({
          prontuario_id: pront.id,
          paciente_nome: pront.paciente_nome,
          profissional_nome: pront.profissional_nome,
          procedimento_nome: '—',
          motivos: ['Prontuário sem procedimento vinculado'],
        });
        continue;
      }

      for (const vinc of procsDoProntuario) {
        totalAtendimentos += 1;
        const motivos: string[] = [];
        const pac = pacMap.get(pront.paciente_id);
        const prof = profMap.get(pront.profissional_id);
        const uni = uniMap.get(pront.unidade_id);
        const proc = procMap.get(vinc.procedimento_id);

        if (!pac) motivos.push('Paciente não encontrado');
        if (!prof) motivos.push('Profissional não encontrado');
        if (!proc) motivos.push('Procedimento não encontrado');

        const cns = pac ? onlyDigits((pac as any).cns) : '';
        if (!cns || cns.length !== 15) motivos.push('CNS inválido ou ausente');

        const cbo = prof ? String(((prof as any).custom_data as any)?.cbo_codigo || '') : '';
        if (!cbo || onlyDigits(cbo).length === 0) motivos.push('CBO ausente');

        const sigtap = proc ? onlyDigits((proc as any).codigo_sigtap || '') : '';
        if (!sigtap || sigtap.length !== 10) motivos.push('Código SIGTAP do procedimento ausente');

        const cnes = cnesOverride || (uni ? onlyDigits(((uni as any).custom_data as any)?.cnes || '') : '');
        if (!cnes || cnes.length === 0) motivos.push('CNES da unidade ausente');

        const pacCustom = pac ? ((pac as any).custom_data as any) || {} : {};
        if (!(pacCustom.raca_cor || pacCustom.racaCor)) motivos.push('Raça/Cor ausente');
        if (!(pacCustom.nacionalidade)) motivos.push('Nacionalidade ausente');

        if (motivos.length > 0) {
          pendentes.push({
            prontuario_id: pront.id,
            paciente_nome: pront.paciente_nome,
            profissional_nome: pront.profissional_nome,
            procedimento_nome: proc ? (proc as any).nome : '—',
            motivos,
          });
          continue;
        }

        seq += 1;
        if (seq > 99) { folha += 1; seq = 1; }

        const cid = String(pacCustom.cid || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
        const raca = mapRaca(String(pacCustom.raca_cor || pacCustom.racaCor || ''));
        const nacionalidade = padNum(pacCustom.nacionalidade_codigo || '010', 3);
        const sexo = mapSexo(String(pacCustom.sexo || ''));

        const linha =
          '02' +
          padNum(cnes, 7) +
          padNum(competencia, 6) +
          padNum(cbo, 6) +
          padNum(folha, 3) +
          padNum(seq, 2) +
          padNum(sigtap, 10) +
          padNum(cns, 15) +
          formatDate((pac as any).data_nascimento) +
          sexo +
          padText(removeAccents((pac as any).nome), 30) +
          formatDate(pront.data_atendimento) +
          '001' +
          padText(cid, 4) +
          padNum('', 13) +
          raca +
          padNum(nacionalidade, 3);

        linhas.push(linha);
      }
    }

    const totalLinhas = linhas.length;
    const cabecalho = '01' + padNum(cnesOverride || '0', 7) + padNum(competencia, 6);
    const rodape = '99' + padNum(totalLinhas, 6);

    const conteudo = [cabecalho, ...linhas, rodape].join('\r\n') + '\r\n';
    const filename = `BPA_${competencia}.txt`;

    try {
      await supabase.from('action_logs').insert({
        modulo: 'bpa',
        acao: 'gerar_arquivo',
        entidade: 'bpa',
        entidade_id: competencia,
        unidade_id: unidadeId,
        detalhes: {
          competencia,
          total_atendimentos: totalAtendimentos,
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
        total_atendimentos: totalAtendimentos,
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
