import { supabase } from '@/integrations/supabase/client';

export interface LinhaBpaNormalizada {
  key: string;
  origem: 'prontuario' | 'triagem' | 'pts' | 'paciente';
  fonte_procedimento: 'prontuario' | 'paciente' | 'pts' | 'triagem';
  fonte_cid: 'prontuario' | 'paciente' | 'pts' | 'vazio';
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
  carater: string;
  qtd: number;
  status_bpa: 'ok' | 'pendente';
  motivo_pendencia?: string;
  pendenciaTriagemSigtap?: boolean;
}

export const bpaService = {
  async resolveBpaProcedimentosECids({
    competencia,
    unidadeId,
    profissionalId,
    triagemSigtapPadrao
  }: {
    competencia: string;
    unidadeId?: string;
    profissionalId?: string;
    triagemSigtapPadrao?: string;
  }): Promise<LinhaBpaNormalizada[]> {
    const ano = competencia.slice(0, 4);
    const mes = competencia.slice(4, 6);
    
    // Função para calcular range correto em formato ISO
    const start = new Date(Number(ano), Number(mes) - 1, 1);
    const end = new Date(Number(ano), Number(mes), 0, 23, 59, 59, 999);
    
    const dataInicio = start.toISOString().split('T')[0];
    const dataFim = end.toISOString().split('T')[0];
    
    console.log("[BPA] competencia resolvida", { competencia, dataInicio, dataFim });


    // 1) Fetch Prontuários
    let qPront = (supabase as any)
      .from('prontuarios')
      .select('id, paciente_id, paciente_nome, profissional_id, profissional_nome, data_atendimento, unidade_id, tipo_registro, custom_data')
      .gte('data_atendimento', dataInicio)
      .lte('data_atendimento', dataFim)
      .limit(5000);
    
    if (unidadeId && unidadeId !== 'all') qPront = qPront.eq('unidade_id', unidadeId);
    if (profissionalId && profissionalId !== 'all') qPront = qPront.eq('profissional_id', profissionalId);

    const { data: prontuarios, error: errorPront } = await qPront;
    if (errorPront) throw errorPront;

    const prots = (prontuarios || []) as any[];
    const pacIds = [...new Set(prots.map(p => p.paciente_id))];
    const prontIds = prots.map(p => p.id);

    // 2) Fetch Patients (Persistent data)
    const { data: pacientes } = pacIds.length 
      ? await (supabase as any).from('pacientes').select('id, nome, cns, cpf, data_nascimento, cid, custom_data').in('id', pacIds)
      : { data: [] };
    const pacMap = new Map<string, any>();
    (pacientes || []).forEach((p: any) => pacMap.set(p.id, p));

    // 3) Fetch Prontuario Procedimentos
    const { data: vincs } = prontIds.length
      ? await (supabase as any).from('prontuario_procedimentos').select('prontuario_id, procedimento_id, cids_selecionados, quantidade').in('prontuario_id', prontIds)
      : { data: [] };

    const procIds = [...new Set((vincs || []).map((v: any) => v.procedimento_id))];
    const { data: procsData } = procIds.length
      ? await (supabase as any).from('procedimentos').select('id, uuid, nome, codigo_sigtap').in('uuid', procIds)
      : { data: [] };
    const procsMap = new Map<string, any>();
    (procsData || []).forEach((p: any) => procsMap.set(p.uuid, p));

    // 4) Fetch PTS (Active)
    const { data: ptsData } = pacIds.length
      ? await (supabase as any).from('pts').select('id, patient_id, status').in('patient_id', pacIds).eq('status', 'ativo')
      : { data: [] };
    
    const activePtsIds = (ptsData || []).map((p: any) => p.id);
    const { data: ptsCids } = activePtsIds.length
      ? await (supabase as any).from('pts_cid').select('pts_id, cid_codigo').in('pts_id', activePtsIds)
      : { data: [] };
    const { data: ptsProcs } = activePtsIds.length
      ? await (supabase as any).from('pts_sigtap').select('pts_id, procedimento_codigo, procedimento_nome').in('pts_id', activePtsIds)
      : { data: [] };

    // 4.5) Fetch Patient Linked Procedures (Persistent)
    const { data: patientLinkedProcs } = pacIds.length
      ? await (supabase as any).from('patient_procedures').select('*').in('patient_id', pacIds)
      : { data: [] };

    const ptsMap = new Map<string, any>();
    (ptsData || []).forEach((p: any) => {
      ptsMap.set(p.patient_id, {
        pts_id: p.id,
        cids: (ptsCids || []).filter((c: any) => c.pts_id === p.id).map((c: any) => c.cid_codigo),
        procs: (ptsProcs || []).filter((pr: any) => pr.pts_id === p.id)
      });
    });

    const patientProcsMap = new Map<string, any[]>();
    (patientLinkedProcs || []).forEach((p: any) => {
      const arr = patientProcsMap.get(p.patient_id) || [];
      arr.push(p);
      patientProcsMap.set(p.patient_id, arr);
    });


    // 5) Fetch Triagens
    let qTri = (supabase as any)
      .from('triage_records')
      .select('id, agendamento_id, tecnico_id, criado_em')
      .gte('criado_em', `${dataInicio}T00:00:00`)
      .lte('criado_em', `${dataFim}T23:59:59`);
    
    const { data: triagens } = await qTri;
    const agIds = [...new Set((triagens || []).map((t: any) => t.agendamento_id).filter(Boolean))];
    const { data: agsData } = agIds.length
      ? await (supabase as any).from('agendamentos').select('id, paciente_id, paciente_nome, unidade_id, data').in('id', agIds)
      : { data: [] };
    const agsMap = new Map<string, any>();
    (agsData || []).forEach((a: any) => agsMap.set(a.id, a));

    console.log("[BPA] resolucao da producao - pre-processamento", {
      competencia,
      totalProntuarios: prots.length,
      totalTriagens: (triagens || []).length,
      totalPacientes: pacMap.size,
      totalPts: ptsMap.size
    });

    const result: LinhaBpaNormalizada[] = [];
    const usedCombinations = new Set<string>(); // paciente_id + data + sigtap + cid


    // Function to add a line with deduplication
    const addLine = (line: LinhaBpaNormalizada) => {
      const comboKey = `${line.paciente_id}_${line.data}_${line.codigo_sigtap}_${line.cid}`;
      if (usedCombinations.has(comboKey)) return;
      usedCombinations.add(comboKey);
      result.push(line);
    };

    // Process Prontuários with Procedures
    const prontMap = new Map<string, any>();
    prots.forEach(p => prontMap.set(p.id, p));

    (vincs || []).forEach((v: any) => {
      const pront = prontMap.get(v.prontuario_id);
      if (!pront) return;
      const pac = pacMap.get(pront.paciente_id);
      const proc = procsMap.get(v.procedimento_id);
      const pts = ptsMap.get(pront.paciente_id);
      const linkedProcs = patientProcsMap.get(pront.paciente_id);

      // RESOLVE PROCEDIMENTO
      let sigtap = proc?.codigo_sigtap || '';
      let procNome = proc?.nome || '';
      let fonteProc: 'prontuario' | 'paciente' | 'pts' | 'triagem' = 'prontuario';

      if (!sigtap) {
        // Try patient persistent (linkedProcs table first)
        if (linkedProcs && linkedProcs.length > 0) {
          sigtap = linkedProcs[0].sigtap_codigo;
          procNome = linkedProcs[0].procedimento_nome || 'Procedimento Vinculado';
          fonteProc = 'paciente';
        } else {
          // Try patient persistent (custom_data)
          const pacCd = pac?.custom_data || {};
          if (pacCd.sigtap_codigo) {
            sigtap = pacCd.sigtap_codigo;
            procNome = pacCd.procedimento_nome || 'Procedimento do Paciente';
            fonteProc = 'paciente';
          } else if (pts && pts.procs.length > 0) {
            // Try PTS
            sigtap = pts.procs[0].procedimento_codigo;
            procNome = pts.procs[0].procedimento_nome;
            fonteProc = 'pts';
          }
        }
      }

      // RESOLVE CID
      let cid = (v.cids_selecionados && v.cids_selecionados[0]) || '';
      let fonteCid: 'prontuario' | 'paciente' | 'pts' | 'vazio' = cid ? 'prontuario' : 'vazio';

      if (!cid) {
        // Try patient persistent (linkedProcs table)
        if (linkedProcs && linkedProcs.length > 0 && linkedProcs[0].cid) {
          cid = linkedProcs[0].cid;
          fonteCid = 'paciente';
        } else if (pac?.cid) {
          // Try patient persistent (main cid field)
          cid = pac.cid;
          fonteCid = 'paciente';
        } else if (pts && pts.cids.length > 0) {
          // Try PTS
          cid = pts.cids[0];
          fonteCid = 'pts';
        }
      }


      addLine({
        key: `pron_${pront.id}_${v.procedimento_id}`,
        origem: 'prontuario',
        fonte_procedimento: fonteProc,
        fonte_cid: fonteCid,
        prontuario_id: pront.id,
        paciente_id: pront.paciente_id,
        paciente_nome: pront.paciente_nome,
        profissional_id: pront.profissional_id,
        profissional_nome: pront.profissional_nome,
        unidade_id: pront.unidade_id,
        data: pront.data_atendimento,
        procedimento_nome: procNome,
        codigo_sigtap: sigtap,
        cid: cid,
        carater: '01',
        qtd: v.quantidade || 1,
        status_bpa: 'ok',
      });
    });

    // Process Prontuários without procedures
    prots.forEach(pront => {
      const pac = pacMap.get(pront.paciente_id);
      const pts = ptsMap.get(pront.paciente_id);
      
      // If no procedure was added for this prontuario yet
      const alreadyHas = result.some(r => r.prontuario_id === pront.id);
      if (alreadyHas) return;

      // RESOLVE PROCEDIMENTO (Priority: Patient -> PTS)
      let sigtap = '';
      let procNome = '';
      let fonteProc: 'prontuario' | 'paciente' | 'pts' | 'triagem' = 'prontuario';

      const linkedProcs = patientProcsMap.get(pront.paciente_id);
      const pacCd = pac?.custom_data || {};

      if (linkedProcs && linkedProcs.length > 0) {
        sigtap = linkedProcs[0].sigtap_codigo;
        procNome = linkedProcs[0].procedimento_nome || 'Procedimento Vinculado';
        fonteProc = 'paciente';
      } else if (pacCd.sigtap_codigo) {
        sigtap = pacCd.sigtap_codigo;
        procNome = pacCd.procedimento_nome || 'Procedimento do Paciente';
        fonteProc = 'paciente';
      } else if (pts && pts.procs.length > 0) {
        sigtap = pts.procs[0].procedimento_codigo;
        procNome = pts.procs[0].procedimento_nome;
        fonteProc = 'pts';
      }

      // RESOLVE CID
      let cid = '';
      let fonteCid: 'prontuario' | 'paciente' | 'pts' | 'vazio' = 'vazio';

      if (linkedProcs && linkedProcs.length > 0 && linkedProcs[0].cid) {
        cid = linkedProcs[0].cid;
        fonteCid = 'paciente';
      } else if (pac?.cid) {
        cid = pac.cid;
        fonteCid = 'paciente';
      } else if (pts && pts.cids.length > 0) {
        cid = pts.cids[0];
        fonteCid = 'pts';
      }


      addLine({
        key: `pron_empty_${pront.id}`,
        origem: 'prontuario',
        fonte_procedimento: sigtap ? fonteProc : 'prontuario',
        fonte_cid: cid ? fonteCid : 'vazio',
        prontuario_id: pront.id,
        paciente_id: pront.paciente_id,
        paciente_nome: pront.paciente_nome,
        profissional_id: pront.profissional_id,
        profissional_nome: pront.profissional_nome,
        unidade_id: pront.unidade_id,
        data: pront.data_atendimento,
        procedimento_nome: procNome || '— sem procedimento —',
        codigo_sigtap: sigtap,
        cid: cid,
        carater: '01',
        qtd: 1,
        status_bpa: 'ok',
      });
    });

    // Process Triagens
    (triagens || []).forEach((t: any) => {
      const ag = agsMap.get(t.agendamento_id);
      if (!ag) return;
      if (unidadeId && unidadeId !== 'all' && ag.unidade_id !== unidadeId) return;
      
      const pac = pacMap.get(ag.paciente_id);
      const cid = pac?.cid || '';

      addLine({
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
        procedimento_nome: triagemSigtapPadrao ? 'Acolhimento com classificação de risco' : '— SIGTAP Triagem não configurado —',
        codigo_sigtap: triagemSigtapPadrao || '',
        cid: cid,
        carater: '01',
        qtd: 1,
        status_bpa: 'ok',
      });
    });

    // Final Validation and Status
    result.forEach(row => {
      const pendencias: string[] = [];
      if (!row.codigo_sigtap) pendencias.push("Procedimento SIGTAP não encontrado no Prontuário, no Paciente ou no PTS.");
      
      // Basic requirements for BPA lines
      const pac = pacMap.get(row.paciente_id);
      if (!pac?.cns && !pac?.cpf) pendencias.push("Paciente sem CNS ou CPF.");
      if (!pac?.nome) pendencias.push("Paciente sem nome.");
      if (!pac?.data_nascimento) pendencias.push("Paciente sem data de nascimento.");
      
      // CID mandatory check
      if (row.codigo_sigtap && (row.codigo_sigtap.startsWith('0301') || row.codigo_sigtap.startsWith('0303')) && !row.cid) {
         pendencias.push("CID obrigatório não encontrado no Prontuário, no Paciente ou no PTS.");
      }

      if (pendencias.length > 0) {
        row.status_bpa = 'pendente';
        row.motivo_pendencia = pendencias.join(' | ');
      }
    });

    console.log("[BPA] resolucao da producao - final", {
      competencia,
      totalValidos: result.filter(r => r.status_bpa === 'ok').length,
      totalPendentes: result.filter(r => r.status_bpa === 'pendente').length
    });

    return result;
  }
};
