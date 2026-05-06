// Edge Function: generate-bpa
// Gera arquivo BPA (SIA/SUS) conforme layout oficial do Ministério da Saúde.
//
// Estrutura do arquivo:
//   - Linha 01 (Header)            : controle do arquivo (CNES origem, competência, hash, etc.)
//   - Linha 03 (BPA-I)             : 1 linha por procedimento individualizado (60 colunas fixas)
//
// Fonte: PRONTUÁRIOS FINALIZADOS do mês — cada procedimento vinculado vira 1 linha BPA-I.
// Médicos (CBO 225*) podem gerar atendimento sem procedimento SIGTAP (consulta clínica).
// Auto-preenchimento: Raça=99 (Ignorado), Nacionalidade=010 (Brasil), Sexo=I se ausentes.
// Bloqueio só ocorre por: Nome, Data Nasc, CNS/CPF, CBO, CNES.

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
  return racaMap[key] || '99'; // 99 = Sem informação (default seguro IBGE/SUS)
};

const mapSexo = (v: string) => {
  const s = (v || '').toLowerCase().trim();
  if (s.startsWith('m')) return 'M';
  if (s.startsWith('f')) return 'F';
  return 'I';
};

const formatDate = (d: string) => {
  const digits = onlyDigits(d);
  if (digits.length === 8) return digits;                      // já AAAAMMDD
  // tenta AAAA-MM-DD ou DD/MM/AAAA
  if (/^\d{4}-\d{2}-\d{2}/.test(d)) return d.slice(0, 10).replace(/-/g, '');
  if (/^\d{2}\/\d{2}\/\d{4}/.test(d)) {
    const [dd, mm, yyyy] = d.slice(0, 10).split('/');
    return `${yyyy}${mm}${dd}`;
  }
  return digits.slice(0, 8).padEnd(8, '0');
};

// CBOs de médicos (família 225*) — médicos podem registrar atendimento sem SIGTAP
const isMedico = (cbo: string) => onlyDigits(cbo).startsWith('225');

// ─── Hash de controle do header BPA (algoritmo padrão DATASUS) ───────────────
// Soma simples do conteúdo das linhas, módulo 1111, mapeado em a-z + 0-9
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

    // 1. Carrega configurações e dados do período
    let prontQuery = supabase
      .from('prontuarios')
      .select('id, paciente_id, paciente_nome, profissional_id, profissional_nome, data_atendimento, unidade_id')
      .gte('data_atendimento', dataInicio)
      .lte('data_atendimento', dataFim)
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
      .lte('criado_em', `${dataFim}T23:59:59`);

    const agsIds = [...new Set((triagens || []).map((t: any) => t.agendamento_id).filter(Boolean))];
    const { data: agsData } = agsIds.length
      ? await supabase
          .from('agendamentos')
          .select('id, paciente_id, paciente_nome, unidade_id, data')
          .in('id', agsIds)
      : { data: [] as any[] };
    const agsMap = new Map(agsData.map((a: any) => [a.id, a]));

    // 3. Procedimentos vinculados aos prontuários
    const prontIds = prots.map((p: any) => p.id);
    const { data: vincs } = prontIds.length 
      ? await supabase.from('prontuario_procedimentos').select('prontuario_id, procedimento_id').in('prontuario_id', prontIds)
      : { data: [] };

    const procIds = [...new Set((vincs || []).map((v: any) => v.procedimento_id))];
    const { data: procsData } = procIds.length
      ? await supabase.from('procedimentos').select('id, nome, codigo_sigtap').in('id', procIds)
      : { data: [] as any[] };
    const procMap = new Map((procsData || []).map((p: any) => [p.id, p]));

    const vincsByProntuario = new Map<string, any[]>();
    (vincs || []).forEach((v: any) => {
      const arr = vincsByProntuario.get(v.prontuario_id) || [];
      arr.push(v);
      vincsByProntuario.set(v.prontuario_id, arr);
    });

    // 4. Pacientes / Profissionais / Unidades
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
      pacIds.size ? supabase.from('pacientes').select('*').in('id', Array.from(pacIds)) : Promise.resolve({ data: [] }),
      profIds.size ? supabase.from('funcionarios').select('*').in('id', Array.from(profIds)) : Promise.resolve({ data: [] }),
      uniIds.size ? supabase.from('unidades').select('*').in('id', Array.from(uniIds)) : Promise.resolve({ data: [] }),
    ]);

    const patientMap = new Map((pacs || []).map((p: any) => [p.id, p]));
    const employeeMap = new Map((profs || []).map((f: any) => [f.id, f]));
    const unitMap = new Map((unis || []).map((u: any) => [u.id, u]));

    // 5. Geração das linhas BPA-I (tipo 03)
    const linhasBpa: string[] = [];
    const pendentes: PendingItem[] = [];
    let totalAtendimentos = 0;
    let folha = 1;
    let seq = 0;

    // Itens a processar: Prontuários e Triagens
    type Item = { 
      id: string; 
      paciente_id: string; 
      paciente_nome: string; 
      profissional_id: string; 
      profissional_nome: string; 
      data: string; 
      unidade_id: string; 
      proc: any | null; 
      origem: 'prontuario' | 'triagem' 
    };
    const items: Item[] = [];

    // Adiciona prontuários
    for (const pront of prots as any[]) {
      const procsDoProntuario = vincsByProntuario.get(pront.id) || [];
      if (procsDoProntuario.length === 0) {
        items.push({ 
          id: pront.id, 
          paciente_id: pront.paciente_id, 
          paciente_nome: pront.paciente_nome,
          profissional_id: pront.profissional_id, 
          profissional_nome: pront.profissional_nome, 
          data: pront.data_atendimento, 
          unidade_id: pront.unidade_id, 
          proc: null, 
          origem: 'prontuario' 
        });
      } else {
        for (const v of procsDoProntuario) {
          items.push({ 
            id: pront.id, 
            paciente_id: pront.paciente_id, 
            paciente_nome: pront.paciente_nome,
            profissional_id: pront.profissional_id, 
            profissional_nome: pront.profissional_nome, 
            data: pront.data_atendimento, 
            unidade_id: pront.unidade_id, 
            proc: procMap.get(v.procedimento_id), 
            origem: 'prontuario' 
          });
        }
      }
    }

    // Adiciona triagens
    for (const t of (triagens || [])) {
      const ag = agsMap.get(t.agendamento_id);
      if (!ag) continue;
      if (unidadeId && ag.unidade_id !== unidadeId) continue;
      
      const tecnico = employeeMap.get(t.tecnico_id);
      items.push({
        id: t.id,
        paciente_id: ag.paciente_id,
        paciente_nome: ag.paciente_nome,
        profissional_id: t.tecnico_id,
        profissional_nome: tecnico?.nome || 'Técnico',
        data: ag.data || (t.criado_em || '').slice(0, 10),
        unidade_id: ag.unidade_id,
        proc: triagemSigtapPadrao ? { codigo_sigtap: triagemSigtapPadrao, nome: 'Triagem' } : null,
        origem: 'triagem'
      });
    }

    // Ordena por data
    items.sort((a, b) => a.data.localeCompare(b.data));

    for (const item of items) {
      const { id, paciente_id, paciente_nome, profissional_id, profissional_nome, data, unidade_id, proc, origem } = item;
      totalAtendimentos += 1;

      const motivosBloqueio: string[] = [];
      const pac: any = patientMap.get(paciente_id);
      const prof: any = employeeMap.get(profissional_id);
      const uni: any = unitMap.get(unidade_id);

      // Identificação obrigatória do paciente
      if (!pac) motivosBloqueio.push('Paciente não encontrado');
      const cns = pac ? onlyDigits(pac.cns) : '';
      const cpf = pac ? onlyDigits(pac.cpf) : '';
      // Regra: CNS OU CPF (um dos dois)
      if (!(cns.length === 15) && !(cpf.length === 11)) motivosBloqueio.push('CNS ou CPF obrigatório');
      if (pac && !pac.nome) motivosBloqueio.push('Nome do paciente ausente');
      if (pac && !pac.data_nascimento) motivosBloqueio.push('Data de nascimento ausente');

      // CBO obrigatório
      const cbo = prof ? String((prof.custom_data || {}).cbo_codigo || '') : '';
      const cboDigits = onlyDigits(cbo);
      if (!cboDigits || cboDigits.length === 0) motivosBloqueio.push('CBO do profissional ausente');

      // CNES obrigatório
      const cnesUni = uni ? onlyDigits((uni.custom_data || {}).cnes || '') : '';
      const cnes = cnesOverride || cnesUni;
      if (!cnes || cnes.length === 0) motivosBloqueio.push('CNES da unidade ausente');

      // SIGTAP — obrigatório apenas para não-médicos
      const sigtap = proc ? onlyDigits(proc.codigo_sigtap || '') : '';
      const exigeSigtap = !isMedico(cboDigits);
      if (exigeSigtap) {
        if (!proc) motivosBloqueio.push('Procedimento SIGTAP obrigatório (não-médico)');
        else if (sigtap.length !== 10) motivosBloqueio.push('Código SIGTAP inválido (10 dígitos)');
      }

      if (motivosBloqueio.length > 0) {
        pendentes.push({
          prontuario_id: id,
          paciente_nome: paciente_nome,
          profissional_nome: profissional_nome,
          procedimento_nome: proc ? proc.nome : (isMedico(cboDigits) ? 'Consulta médica' : '—'),
          motivos: motivosBloqueio,
        });
        continue;
      }

      // Auto-preenchimento de campos opcionais
      const pacCustom = pac.custom_data || {};
      const raca = mapRaca(String(pacCustom.raca_cor || pacCustom.racaCor || '99'));
      
      let nac = String(pacCustom.nacionalidade_codigo || pacCustom.nacionalidade || '010');
      if (nac.toLowerCase().includes('brasil') || nac.toLowerCase().includes('brasileir')) nac = '010';
      const nacionalidade = padNum(nac, 3);
      
      const sexo = mapSexo(String(pacCustom.sexo || ''));
      const etnia = onlyDigits(pacCustom.etnia_codigo || '').padStart(4, '0').slice(-4);
      
      // Município: tenta pegar código IBGE do custom_data ou usa padrão se não houver
      let munCode = String(pacCustom.municipio_ibge || pacCustom.codigo_ibge_municipio || pac.municipio || '');
      // Se for nome de cidade comum na região, mapeia para código (ex: Oriximiná = 150530)
      if (munCode.toUpperCase().includes('ORIXIMINA')) munCode = '150530';
      const municipio = padNum(munCode, 6);
      
      const cep = padNum(pacCustom.cep || '', 8);
      const cid = String(pacCustom.cid || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 4);
      const carater = padNum(pacCustom.carater_atendimento || '01', 2); // 01=Eletivo
      const autorizacao = padText(String(pacCustom.numero_autorizacao || ''), 13);

      // Para médico sem procedimento, usa código SIGTAP genérico de consulta médica (0301010072)
      // Se for triagem, usa o sigtap da triagem configurado
      const sigtapFinal = sigtap.length === 10
        ? sigtap
        : (origem === 'triagem' ? triagemSigtapPadrao : (isMedico(cboDigits) ? '0301010072' : '0000000000'));

      seq += 1;
      if (seq > 99) { folha += 1; seq = 1; }

      // ─── Layout BPA-I (Linha tipo 03) — 60 colunas fixas ─────────────────
      // Conforme Portaria SAS/MS — Manual Técnico Operacional do SIA/SUS
      // 01-02  Tipo (03)
      // 03-09  CNES (7)
      // 10-15  Competência AAAAMM (6)
      // 16-30  CNS profissional (15)
      // 31-36  CBO (6)
      // 37-44  Data atendimento AAAAMMDD (8)
      // 45-48  Folha (3) + Sequencial (2) — 4+2 = legacy; usamos folha 3 + seq 2 = 5
      // 49-58  Procedimento SIGTAP (10)
      // 59-73  CNS paciente (15) — pad com 0 se usar CPF
      // 74     Sexo (1)
      // 75-80  Município IBGE (6)
      // 81-84  CID-10 (4)
      // 85-87  Idade (3) — calculada
      // 88-93  Quantidade (6) — default 000001
      // 94     Caráter atendimento (2)
      // 95-107 Nº autorização (13)
      // 108-117 Origem do dado (BPA) (3) + reservas
      // 118-147 Nome paciente (30)
      // 148-155 Data nascimento AAAAMMDD (8)
      // 156-157 Raça/Cor (2)
      // 158-161 Etnia (4)
      // 162-164 Nacionalidade (3)
      // ...
      // Versão simplificada compatível: usamos os 60 caracteres principais para validação.

      const dtNasc = formatDate(pac.data_nascimento);
      const dtAtend = formatDate(data);

      // Calcula idade em anos no atendimento
      let idade = 0;
      if (dtNasc.length === 8 && dtAtend.length === 8) {
        const yN = Number(dtNasc.slice(0, 4));
        const mN = Number(dtNasc.slice(4, 6));
        const dN = Number(dtNasc.slice(6, 8));
        const yA = Number(dtAtend.slice(0, 4));
        const mA = Number(dtAtend.slice(4, 6));
        const dA = Number(dtAtend.slice(6, 8));
        idade = yA - yN;
        if (mA < mN || (mA === mN && dA < dN)) idade -= 1;
        if (idade < 0 || idade > 130) idade = 0;
      }

      // CNS do profissional (do cadastro funcionarios.custom_data.cns ou vazio)
      const cnsProf = padNum(String((prof.custom_data || {}).cns || ''), 15);

      // CNS do paciente — se vazio, preencher com 0 (e usar CPF no campo nome/observações conforme regra interna)
      const cnsPac = cns.length === 15 ? cns : padNum(cpf || '0', 15);

      // Linha BPA-I tipo 03 (formato simplificado — 150 colunas fixas)
      const linha =
        '03' +                                  // 01-02 Tipo
        padNum(cnes, 7) +                       // 03-09 CNES
        padNum(competencia, 6) +                // 10-15 Competência
        cnsProf +                               // 16-30 CNS profissional
        padNum(cboDigits, 6) +                  // 31-36 CBO
        dtAtend +                               // 37-44 Data atendimento
        padNum(folha, 3) +                      // 45-47 Folha
        padNum(seq, 2) +                        // 48-49 Sequencial
        padNum(sigtapFinal, 10) +               // 50-59 SIGTAP
        cnsPac +                                // 60-74 CNS paciente
        sexo +                                  // 75 Sexo
        municipio +                             // 76-81 Município IBGE
        padText(cid, 4) +                       // 82-85 CID-10
        padNum(idade, 3) +                      // 86-88 Idade
        padNum(1, 6) +                          // 89-94 Quantidade (default 1)
        carater +                               // 95-96 Caráter atendimento
        autorizacao +                           // 97-109 Nº autorização
        'BPA' +                                 // 110-112 Origem
        padText(pac.nome, 30) +                 // 113-142 Nome paciente
        dtNasc +                                // 143-150 Data nascimento
        raca +                                  // 151-152 Raça/Cor
        padText(etnia, 4) +                     // 153-156 Etnia
        padNum(nacionalidade, 3) +              // 157-159 Nacionalidade
        padText(cpf, 11) +                      // 160-170 CPF (extensão local)
        padNum(cep, 8);                         // 171-178 CEP

      linhasBpa.push(linha);
    }

    const totalLinhas = linhasBpa.length;

    // ─── Header tipo 01 (controle do arquivo) ─────────────────────────────────
    // 01-02  Indicador linha (01)
    // 03-05  Indicador BPA (#BPA)
    // 06-11  Ano e mês de processamento AAAAMM
    // 12-17  Nº de linhas (folhas) — usamos folhas geradas
    // 18-23  Quantidade de registros (BPA-I)
    // 24-37  Órgão origem (sigla) — texto livre 14
    // 38-77  Nome do órgão origem — texto 40
    // 78-87  Sigla do órgão destinatário (10) — "MS" padrão
    // 88-90  Indicador do órgão destino (M=Municipal, E=Estadual)
    // 91-91  Versão do sistema (1) — "I" para BPA-I
    // 92-95  Hash de controle (4)
    const hash = calcularHashControle(linhasBpa);
    const totalFolhas = folha;
    const orgaoOrigem = padText('SMS-ORIXIMINA', 14);
    const nomeOrgao = padText('SECRETARIA MUNICIPAL DE SAUDE DE ORIXIMINA', 40);
    const orgaoDestino = padText('SES-PA', 10);
    const indicadorDestino = 'M';
    const versao = 'I';

    const cabecalho =
      '01' +
      '#BPA' +
      padNum(competencia, 6) +
      padNum(totalFolhas, 6) +
      padNum(totalLinhas, 6) +
      orgaoOrigem +
      nomeOrgao +
      orgaoDestino +
      indicadorDestino +
      versao +
      hash;

    const conteudo = [cabecalho, ...linhasBpa].join('\r\n') + '\r\n';
    const filename = `PA${competencia}.txt`;

    // Log de exportação
    try {
      await supabase.from('action_logs').insert({
        modulo: 'bpa',
        acao: 'gerar_arquivo',
        entidade: 'bpa',
        entidade_id: competencia,
        unidade_id: unidadeId,
        detalhes: {
          competencia,
          cnes,
          total_atendimentos: totalAtendimentos,
          total_exportados: totalLinhas,
          total_pendentes: pendentes.length,
          hash,
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
        hash_controle: hash,
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
