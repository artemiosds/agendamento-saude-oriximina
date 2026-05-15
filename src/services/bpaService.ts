import { supabase } from '@/integrations/supabase/client';

export interface LinhaBpaNormalizada {
  key: string;
  origem: 'prontuario' | 'triagem' | 'pts' | 'paciente';
  fonte_procedimento: 'prontuario' | 'paciente' | 'pts' | 'triagem';
  fonte_cid: 'prontuario' | 'procedimento' | 'paciente' | 'pts' | 'vazio';
  prontuario_id?: string;
  pts_id?: string;
  paciente_id: string;
  paciente_nome: string;
  profissional_id: string;
  profissional_nome: string;
  unidade_id: string;
  data: string;
  procedimento_nome: string;
  codigo_sigtap: string;
  cid: string;
  cids_relacionados?: string[];
  carater: string;
  qtd: number;
  status_bpa: 'ok' | 'pendente';
  motivo_pendencia?: string;
  pendenciaTriagemSigtap?: boolean;
}

// Helpers ---------------------------------------------------------------------
const inBatches = async <T,>(ids: string[], batchSize: number, fn: (batch: string[]) => Promise<T[]>): Promise<T[]> => {
  const out: T[] = [];
  for (let i = 0; i < ids.length; i += batchSize) {
    const part = await fn(ids.slice(i, i + batchSize));
    if (part?.length) out.push(...part);
  }
  return out;
};

const extractCidsFromProntuario = (pront: any): string[] => {
  const cids: string[] = [];
  const push = (v: any) => {
    if (!v) return;
    if (Array.isArray(v)) v.forEach(push);
    else if (typeof v === 'string') {
      const code = v.trim().toUpperCase();
      if (code) cids.push(code);
    } else if (typeof v === 'object') {
      push(v.codigo || v.code || v.cid || v.cid10);
    }
  };
  const cd = pront?.custom_data || {};
  push(cd.cid);
  push(cd.cids);
  push(cd.cid_principal);
  push(cd.diagnostico_cid);
  push(cd.hipotese_diagnostica_cid);
  push(pront?.hipotese);
  return [...new Set(cids.filter(Boolean))];
};

const extractCidsFromPaciente = (pac: any): string[] => {
  if (!pac) return [];
  const cids: string[] = [];
  const cd = pac.custom_data || {};
  if (pac.cid) cids.push(String(pac.cid).toUpperCase());
  if (Array.isArray(cd.cids)) cd.cids.forEach((c: any) => c && cids.push(String(c).toUpperCase()));
  if (cd.cid) cids.push(String(cd.cid).toUpperCase());
  return [...new Set(cids.filter(Boolean))];
};

// -----------------------------------------------------------------------------
export const bpaService = {
  async resolveBpaProcedimentosECids({
    competencia,
    unidadeId,
    profissionalId,
    triagemSigtapPadrao,
  }: {
    competencia: string;
    unidadeId?: string;
    profissionalId?: string;
    triagemSigtapPadrao?: string;
  }): Promise<LinhaBpaNormalizada[]> {
    const ano = competencia.slice(0, 4);
    const mes = competencia.slice(4, 6);
    const dataInicio = `${ano}-${mes}-01`;
    const lastDay = new Date(Number(ano), Number(mes), 0).getDate();
    const dataFim = `${ano}-${mes}-${String(lastDay).padStart(2, '0')}`;

    console.log('[BPA] competencia', { competencia, dataInicio, dataFim });

    // 1) Prontuários da competência (paginado)
    const PAGE = 1000;
    const allProntuarios: any[] = [];
    for (let from = 0; ; from += PAGE) {
      let q = (supabase as any)
        .from('prontuarios')
        .select('id, paciente_id, paciente_nome, profissional_id, profissional_nome, data_atendimento, unidade_id, tipo_registro, hipotese, custom_data')
        .gte('data_atendimento', dataInicio)
        .lte('data_atendimento', dataFim)
        .range(from, from + PAGE - 1);
      if (unidadeId && unidadeId !== 'all') q = q.eq('unidade_id', unidadeId);
      if (profissionalId && profissionalId !== 'all') q = q.eq('profissional_id', profissionalId);
      const { data, error } = await q;
      if (error) throw error;
      if (!data?.length) break;
      allProntuarios.push(...data);
      if (data.length < PAGE) break;
    }
    const prots = allProntuarios;
    const pacIds = [...new Set(prots.map((p) => p.paciente_id).filter(Boolean))];
    const prontIds = prots.map((p) => p.id);

    // 2) Pacientes em lote (com endereço completo)
    const pacientes = await inBatches(pacIds, 500, async (batch) => {
      const { data } = await (supabase as any)
        .from('pacientes')
        .select('id, nome, cns, cpf, data_nascimento, sexo, raca_cor, nacionalidade, naturalidade, naturalidade_uf, municipio, cep, tipo_logradouro, logradouro, numero, complemento, bairro, uf, telefone, email, endereco, cid, custom_data')
        .in('id', batch);
      return data || [];
    });
    const pacMap = new Map<string, any>();
    pacientes.forEach((p: any) => pacMap.set(p.id, p));

    // 3) Procedimentos vinculados aos prontuários (fonte primária)
    const vincsPront = await inBatches(prontIds, 500, async (batch) => {
      const { data } = await (supabase as any)
        .from('prontuario_procedimentos')
        .select('prontuario_id, procedimento_id, cids_selecionados, quantidade')
        .in('prontuario_id', batch);
      return data || [];
    });

    // 3b) Procedimentos realizados (fonte alternativa, vinculada por paciente+data)
    const realizados = await inBatches(pacIds, 500, async (batch) => {
      const { data } = await (supabase as any)
        .from('procedimentos_realizados')
        .select('paciente_id, procedimento_id, data_atendimento, cids_selecionados, quantidade')
        .in('paciente_id', batch)
        .gte('data_atendimento', dataInicio)
        .lte('data_atendimento', dataFim);
      return data || [];
    });

    // 4) Catálogo de procedimentos — busca em AMBAS as tabelas:
    //    - procedimentos (legado/personalizados)
    //    - sigtap_procedimentos (catálogo oficial SIGTAP — fonte canônica)
    //    A FK do prontuario_procedimentos foi removida; agora o UUID pode vir de qualquer uma.
    const procIds = [...new Set([
      ...vincsPront.map((v: any) => v.procedimento_id),
      ...realizados.map((v: any) => v.procedimento_id),
    ].filter(Boolean))];

    const [procsLegado, procsSigtap] = await Promise.all([
      inBatches(procIds as string[], 500, async (batch) => {
        const { data } = await (supabase as any)
          .from('procedimentos')
          .select('id, nome, codigo_sigtap')
          .in('id', batch);
        return data || [];
      }),
      inBatches(procIds as string[], 500, async (batch) => {
        const { data } = await (supabase as any)
          .from('sigtap_procedimentos')
          .select('id, nome, codigo')
          .in('id', batch);
        return data || [];
      }),
    ]);

    const procsData: any[] = [];
    const procsMap = new Map<string, any>();
    procsLegado.forEach((p: any) => {
      const obj = { id: p.id, nome: p.nome, codigo_sigtap: p.codigo_sigtap || '' };
      procsMap.set(p.id, obj);
      procsData.push(obj);
    });
    procsSigtap.forEach((p: any) => {
      if (procsMap.has(p.id)) return; // legado tem prioridade
      const obj = { id: p.id, nome: p.nome, codigo_sigtap: String(p.codigo || '') };
      procsMap.set(p.id, obj);
      procsData.push(obj);
    });

    // 4b) Fallback SIGTAP por NOME — quando procedimentos.codigo_sigtap está vazio,
    //     tenta resolver no catálogo oficial sigtap_procedimentos por nome normalizado
    const normalizeName = (s: string) =>
      String(s || '')
        .toUpperCase()
        .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
        .replace(/[^A-Z0-9 ]+/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
    const procsSemSigtap = procsData.filter((p: any) => !String(p.codigo_sigtap || '').replace(/\D/g, ''));
    const sigtapByName = new Map<string, { codigo: string; nome: string }>();
    if (procsSemSigtap.length) {
      const { data: sigCat } = await (supabase as any)
        .from('sigtap_procedimentos')
        .select('codigo, nome')
        .eq('ativo', true);
      (sigCat || []).forEach((s: any) => {
        const k = normalizeName(s.nome);
        if (k && !sigtapByName.has(k)) sigtapByName.set(k, { codigo: String(s.codigo || ''), nome: s.nome });
      });
    }
    const resolveSigtap = (proc: any): { codigo: string; nome: string; fonte: 'catalogo' | 'sigtap_nome' | 'vazio' } => {
      const direto = String(proc?.codigo_sigtap || '').replace(/\D/g, '');
      if (direto) return { codigo: direto, nome: proc?.nome || 'Procedimento', fonte: 'catalogo' };
      const k = normalizeName(proc?.nome || '');
      const hit = k ? sigtapByName.get(k) : undefined;
      if (hit) {
        return { codigo: String(hit.codigo).replace(/\D/g, ''), nome: proc?.nome || hit.nome, fonte: 'sigtap_nome' };
      }
      return { codigo: '', nome: proc?.nome || 'Procedimento', fonte: 'vazio' };
    };

    // 4c) Mapa CID por procedimento SIGTAP (fallback de CID)
    const procedimentoCidsMap = new Map<string, string[]>();
    const sigtapCodes = [...new Set(procsData.map((p: any) => String(p.codigo_sigtap || '').replace(/\D/g, '')).filter(Boolean))];
    if (sigtapCodes.length) {
      const cidsLink = await inBatches(sigtapCodes, 500, async (batch) => {
        const { data } = await (supabase as any)
          .from('sigtap_procedimento_cids')
          .select('procedimento_codigo, cid_codigo')
          .in('procedimento_codigo', batch);
        return data || [];
      });
      cidsLink.forEach((r: any) => {
        const arr = procedimentoCidsMap.get(r.procedimento_codigo) || [];
        if (r.cid_codigo) arr.push(String(r.cid_codigo).toUpperCase());
        procedimentoCidsMap.set(r.procedimento_codigo, arr);
      });
    }

    // 5) PTS ativos do paciente (apoio: CID e procedimento fallback)
    const ptsList = await inBatches(pacIds, 500, async (batch) => {
      const { data } = await (supabase as any)
        .from('pts')
        .select('id, patient_id, status')
        .in('patient_id', batch)
        .eq('status', 'ativo');
      return data || [];
    });
    const activePtsIds = ptsList.map((p: any) => p.id);
    const ptsCids = await inBatches(activePtsIds, 500, async (batch) => {
      const { data } = await (supabase as any).from('pts_cid').select('pts_id, cid_codigo').in('pts_id', batch);
      return data || [];
    });
    const ptsProcs = await inBatches(activePtsIds, 500, async (batch) => {
      const { data } = await (supabase as any).from('pts_sigtap').select('pts_id, procedimento_codigo, procedimento_nome').in('pts_id', batch);
      return data || [];
    });
    const ptsByPaciente = new Map<string, { pts_id: string; cids: string[]; procs: any[] }>();
    ptsList.forEach((p: any) => {
      ptsByPaciente.set(p.patient_id, {
        pts_id: p.id,
        cids: ptsCids.filter((c: any) => c.pts_id === p.id).map((c: any) => String(c.cid_codigo || '').toUpperCase()).filter(Boolean),
        procs: ptsProcs.filter((pr: any) => pr.pts_id === p.id),
      });
    });

    // 6) Triagens (linha extra própria)
    const { data: triagens } = await (supabase as any)
      .from('triage_records')
      .select('id, agendamento_id, tecnico_id, criado_em')
      .gte('criado_em', `${dataInicio}T00:00:00`)
      .lte('criado_em', `${dataFim}T23:59:59`);
    const agIds = [...new Set((triagens || []).map((t: any) => t.agendamento_id).filter(Boolean))];
    const agsData = agIds.length
      ? (await (supabase as any).from('agendamentos').select('id, paciente_id, paciente_nome, unidade_id, data').in('id', agIds)).data || []
      : [];
    const agsMap = new Map<string, any>();
    (agsData || []).forEach((a: any) => agsMap.set(a.id, a));

    console.log('[BPA] dados carregados', {
      prots: prots.length, vincsPront: vincsPront.length, realizados: realizados.length,
      procs: procsData.length, pacientes: pacientes.length,
      pts: ptsList.length, triagens: (triagens || []).length,
      sigtapByName: sigtapByName.size,
    });

    // -------------------------------------------------------------------------
    // Montagem de linhas com dedupe estrito por prontuário + procedimento + cid
    const result: LinhaBpaNormalizada[] = [];
    const seen = new Set<string>();
    const pushLine = (l: LinhaBpaNormalizada) => {
      const key = `${l.prontuario_id || l.pts_id || 'rea'}|${l.codigo_sigtap}|${l.cid}|${l.profissional_id}|${l.data}|${l.procedimento_nome}`;
      if (seen.has(key)) return;
      seen.add(key);
      result.push(l);
    };

    // Index: prontuário → vínculos
    const vincsByPront = new Map<string, any[]>();
    vincsPront.forEach((v: any) => {
      const arr = vincsByPront.get(v.prontuario_id) || [];
      arr.push(v);
      vincsByPront.set(v.prontuario_id, arr);
    });

    // Index: paciente+data → realizados (fallback alternativo)
    const realizadosByPacData = new Map<string, any[]>();
    realizados.forEach((r: any) => {
      const k = `${r.paciente_id}|${r.data_atendimento}`;
      const arr = realizadosByPacData.get(k) || [];
      arr.push(r);
      realizadosByPacData.set(k, arr);
    });

    for (const pront of prots) {
      const pac = pacMap.get(pront.paciente_id);
      const pts = ptsByPaciente.get(pront.paciente_id);
      const cidsPront = extractCidsFromProntuario(pront);
      const cidsPaciente = extractCidsFromPaciente(pac);
      const cidsPts = pts?.cids || [];

      // Mescla vínculos do prontuário + procedimentos_realizados (mesmo paciente/data)
      const linhasDoProntuario = [...(vincsByPront.get(pront.id) || [])];
      const realizadosCompat = realizadosByPacData.get(`${pront.paciente_id}|${pront.data_atendimento}`) || [];
      realizadosCompat.forEach((r: any) => {
        const jaExiste = linhasDoProntuario.some((v) => v.procedimento_id === r.procedimento_id);
        if (!jaExiste) linhasDoProntuario.push(r);
      });

      if (linhasDoProntuario.length > 0) {
        for (const v of linhasDoProntuario) {
          const proc = procsMap.get(v.procedimento_id);
          const sig = resolveSigtap(proc);
          const sigtap = sig.codigo;
          const procNome = sig.nome;
          const cidsLinkados = sigtap ? (procedimentoCidsMap.get(sigtap) || []) : [];

          // Resolve CID: 1) cids_selecionados, 2) prontuário, 3) PTS, 4) paciente, 5) link sigtap→cid
          let cidsAlvo: string[] = (v.cids_selecionados || []).map((c: string) => String(c).toUpperCase()).filter(Boolean);
          let fonteCid: LinhaBpaNormalizada['fonte_cid'] = 'procedimento';
          if (cidsAlvo.length === 0 && cidsPront.length) { cidsAlvo = cidsPront; fonteCid = 'prontuario'; }
          if (cidsAlvo.length === 0 && cidsPts.length)   { cidsAlvo = cidsPts;   fonteCid = 'pts'; }
          if (cidsAlvo.length === 0 && cidsPaciente.length) { cidsAlvo = cidsPaciente; fonteCid = 'paciente'; }
          if (cidsAlvo.length === 0 && cidsLinkados.length) { cidsAlvo = cidsLinkados; fonteCid = 'procedimento'; }
          if (cidsAlvo.length === 0) { cidsAlvo = ['']; fonteCid = 'vazio'; }

          const cidPrincipal = cidsAlvo[0] || '';
          const cidsRel = cidsAlvo.filter((c, idx) => idx > 0);

          pushLine({
            key: `pron_${pront.id}_${v.procedimento_id}_${cidPrincipal}`,
            origem: 'prontuario',
            fonte_procedimento: 'prontuario',
            fonte_cid: fonteCid,
            prontuario_id: pront.id,
            pts_id: pts?.pts_id,
            paciente_id: pront.paciente_id,
            paciente_nome: pront.paciente_nome,
            profissional_id: pront.profissional_id,
            profissional_nome: pront.profissional_nome,
            unidade_id: pront.unidade_id,
            data: pront.data_atendimento,
            procedimento_nome: procNome,
            codigo_sigtap: sigtap,
            cid: cidPrincipal,
            cids_relacionados: cidsRel,
            carater: '01',
            qtd: v.quantidade || 1,
            status_bpa: sigtap ? 'ok' : 'pendente',
            motivo_pendencia: sigtap ? undefined : `Procedimento "${procNome}" sem código SIGTAP no catálogo. Cadastre o codigo_sigtap em Procedimentos.`,
          });
        }
      } else if (pts?.procs?.length) {
        // Fallback: prontuário sem procedimento mas há PTS — usa PTS como fonte
        for (const pp of pts.procs) {
          const cidPrincipal = (cidsPront[0] || cidsPts[0] || cidsPaciente[0] || '');
          const fonteCid: LinhaBpaNormalizada['fonte_cid'] = cidsPront[0]
            ? 'prontuario' : cidsPts[0] ? 'pts' : cidsPaciente[0] ? 'paciente' : 'vazio';
          pushLine({
            key: `pron_pts_${pront.id}_${pp.procedimento_codigo}`,
            origem: 'prontuario',
            fonte_procedimento: 'pts',
            fonte_cid: fonteCid,
            prontuario_id: pront.id,
            pts_id: pts.pts_id,
            paciente_id: pront.paciente_id,
            paciente_nome: pront.paciente_nome,
            profissional_id: pront.profissional_id,
            profissional_nome: pront.profissional_nome,
            unidade_id: pront.unidade_id,
            data: pront.data_atendimento,
            procedimento_nome: pp.procedimento_nome || 'Procedimento PTS',
            codigo_sigtap: String(pp.procedimento_codigo || '').replace(/\D/g, ''),
            cid: cidPrincipal,
            carater: '01',
            qtd: 1,
            status_bpa: 'ok',
          });
        }
      } else {
        // Prontuário sem procedimento nem PTS — gera 1 linha com pendência
        const cidPrincipal = cidsPront[0] || cidsPaciente[0] || '';
        const fonteCid: LinhaBpaNormalizada['fonte_cid'] = cidsPront[0] ? 'prontuario' : cidsPaciente[0] ? 'paciente' : 'vazio';
        pushLine({
          key: `pron_empty_${pront.id}`,
          origem: 'prontuario',
          fonte_procedimento: 'prontuario',
          fonte_cid: fonteCid,
          prontuario_id: pront.id,
          paciente_id: pront.paciente_id,
          paciente_nome: pront.paciente_nome,
          profissional_id: pront.profissional_id,
          profissional_nome: pront.profissional_nome,
          unidade_id: pront.unidade_id,
          data: pront.data_atendimento,
          procedimento_nome: '— sem procedimento —',
          codigo_sigtap: '',
          cid: cidPrincipal,
          carater: '01',
          qtd: 1,
          status_bpa: 'pendente',
          motivo_pendencia: 'Prontuário sem procedimento SIGTAP vinculado',
        });
      }
    }

    // Triagens — uma linha cada
    (triagens || []).forEach((t: any) => {
      const ag = agsMap.get(t.agendamento_id);
      if (!ag) return;
      if (unidadeId && unidadeId !== 'all' && ag.unidade_id !== unidadeId) return;
      const pac = pacMap.get(ag.paciente_id);
      const cid = extractCidsFromPaciente(pac)[0] || '';
      pushLine({
        key: `tri_${t.id}`,
        origem: 'triagem',
        fonte_procedimento: 'triagem',
        fonte_cid: cid ? 'paciente' : 'vazio',
        paciente_id: ag.paciente_id,
        paciente_nome: ag.paciente_nome,
        profissional_id: t.tecnico_id || '',
        profissional_nome: 'Técnico de Triagem',
        unidade_id: ag.unidade_id,
        data: ag.data || (t.criado_em || '').slice(0, 10),
        procedimento_nome: triagemSigtapPadrao ? 'Acolhimento com classificação de risco' : '— SIGTAP triagem não configurado —',
        codigo_sigtap: triagemSigtapPadrao || '',
        cid,
        carater: '01',
        qtd: 1,
        status_bpa: triagemSigtapPadrao ? 'ok' : 'pendente',
        motivo_pendencia: triagemSigtapPadrao ? undefined : 'SIGTAP da triagem não configurado',
        pendenciaTriagemSigtap: !triagemSigtapPadrao,
      });
    });

    // Validação final por linha
    result.forEach((row) => {
      const pendencias: string[] = [];
      if (row.motivo_pendencia) pendencias.push(row.motivo_pendencia);
      if (!row.codigo_sigtap) pendencias.push('Procedimento SIGTAP ausente');
      const pac = pacMap.get(row.paciente_id);
      if (!pac?.cns && !pac?.cpf) pendencias.push('Paciente sem CNS ou CPF');
      if (!pac?.nome) pendencias.push('Paciente sem nome');
      if (!pac?.data_nascimento) pendencias.push('Paciente sem data de nascimento');
      if (!pac?.sexo && !(pac?.custom_data?.sexo)) pendencias.push('Paciente sem sexo');
      // CID obrigatório para procedimentos clínicos (0301/0303)
      if (row.codigo_sigtap && (row.codigo_sigtap.startsWith('0301') || row.codigo_sigtap.startsWith('0303')) && !row.cid) {
        pendencias.push('CID obrigatório ausente');
      }
      if (pendencias.length) {
        row.status_bpa = 'pendente';
        row.motivo_pendencia = [...new Set(pendencias)].join(' | ');
      }
    });

    console.log('[BPA] resultado', {
      total: result.length,
      ok: result.filter((r) => r.status_bpa === 'ok').length,
      pendentes: result.filter((r) => r.status_bpa === 'pendente').length,
    });

    return result;
  },
};
