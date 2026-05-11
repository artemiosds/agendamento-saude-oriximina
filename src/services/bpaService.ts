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


    // 1) Fetch Prontuários (Paginado para quebrar o limite de 1000/5000)
    const PAGE_SIZE_PRONT = 1000;
    let fromPront = 0;
    let allProntuarios: any[] = [];

    while (true) {
      let qPront = (supabase as any)
        .from('prontuarios')
        .select('id, paciente_id, paciente_nome, profissional_id, profissional_nome, data_atendimento, unidade_id, tipo_registro, custom_data')
        .gte('data_atendimento', dataInicio)
        .lte('data_atendimento', dataFim)
        .range(fromPront, fromPront + PAGE_SIZE_PRONT - 1);
      
      if (unidadeId && unidadeId !== 'all') qPront = qPront.eq('unidade_id', unidadeId);
      if (profissionalId && profissionalId !== 'all') qPront = qPront.eq('profissional_id', profissionalId);

      const { data, error } = await qPront;
      if (error) throw error;
      if (!data || data.length === 0) break;
      allProntuarios.push(...data);
      if (data.length < PAGE_SIZE_PRONT) break;
      fromPront += PAGE_SIZE_PRONT;
    }
    
    const prots = allProntuarios;
    const pacIds = [...new Set(prots.map(p => p.paciente_id))];
    const prontIds = prots.map(p => p.id);

    // 2) Fetch Patients (Persistent data) - Paginado se necessário
    let pacientes: any[] = [];
    if (pacIds.length > 0) {
      for (let i = 0; i < pacIds.length; i += 500) {
        const batch = pacIds.slice(i, i + 500);
        const { data } = await (supabase as any).from('pacientes').select('id, nome, cns, cpf, data_nascimento, cid, custom_data').in('id', batch);
        if (data) pacientes.push(...data);
      }
    }
    const pacMap = new Map<string, any>();
    (pacientes || []).forEach((p: any) => pacMap.set(p.id, p));

    // 3) Fetch Prontuario Procedimentos - Paginado
    let vincs: any[] = [];
    if (prontIds.length > 0) {
      for (let i = 0; i < prontIds.length; i += 500) {
        const batch = prontIds.slice(i, i + 500);
        const { data } = await (supabase as any).from('prontuario_procedimentos').select('prontuario_id, procedimento_id, cids_selecionados, quantidade').in('prontuario_id', batch);
        if (data) vincs.push(...data);
      }
    }

    const procIds = [...new Set((vincs || []).map((v: any) => v.procedimento_id))];
    let procsData: any[] = [];
    if (procIds.length > 0) {
      for (let i = 0; i < procIds.length; i += 500) {
        const batch = procIds.slice(i, i + 500);
        const { data } = await (supabase as any).from('procedimentos').select('id, uuid, nome, codigo_sigtap').in('uuid', batch);
        if (data) procsData.push(...data);
      }
    }
    const procsMap = new Map<string, any>();
    (procsData || []).forEach((p: any) => procsMap.set(p.uuid, p));

    // 4) Fetch PTS (Active) - Paginado
    let ptsData: any[] = [];
    if (pacIds.length > 0) {
      for (let i = 0; i < pacIds.length; i += 500) {
        const batch = pacIds.slice(i, i + 500);
        const { data } = await (supabase as any).from('pts').select('id, patient_id, status').in('patient_id', batch).eq('status', 'ativo');
        if (data) ptsData.push(...data);
      }
    }
    
    const activePtsIds = (ptsData || []).map((p: any) => p.id);
    let ptsCids: any[] = [];
    if (activePtsIds.length > 0) {
      for (let i = 0; i < activePtsIds.length; i += 500) {
        const batch = activePtsIds.slice(i, i + 500);
        const { data } = await (supabase as any).from('pts_cid').select('pts_id, cid_codigo').in('pts_id', batch);
        if (data) ptsCids.push(...data);
      }
    }

    let ptsProcs: any[] = [];
    if (activePtsIds.length > 0) {
      for (let i = 0; i < activePtsIds.length; i += 500) {
        const batch = activePtsIds.slice(i, i + 500);
        const { data } = await (supabase as any).from('pts_sigtap').select('pts_id, procedimento_codigo, procedimento_nome').in('pts_id', batch);
        if (data) ptsProcs.push(...data);
      }
    }

    // 4.5) Fetch Patient Linked Procedures (Persistent) - Paginado
    let patientLinkedProcs: any[] = [];
    if (pacIds.length > 0) {
      for (let i = 0; i < pacIds.length; i += 500) {
        const batch = pacIds.slice(i, i + 500);
        const { data } = await (supabase as any).from('patient_procedures').select('*').in('patient_id', batch);
        if (data) patientLinkedProcs.push(...data);
      }
    }

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
      // CORREÇÃO: Incluir profissional_id no comboKey para não apagar produção válida de profissionais diferentes no mesmo dia/paciente
      const comboKey = `${line.paciente_id}_${line.data}_${line.codigo_sigtap}_${line.cid}_${line.profissional_id}`;
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
      const proc = procsMap.get(v.procedimento_id);
      
      // RESOLVE PROCEDIMENTO
      const sigtap = proc?.codigo_sigtap || '';
      const procNome = proc?.nome || '';

      const cidsToProcess = (v.cids_selecionados && v.cids_selecionados.length > 0) 
        ? v.cids_selecionados 
        : [''];

      cidsToProcess.forEach((cidItem: string) => {
        addLine({
          key: `pron_${pront.id}_${v.procedimento_id}_${cidItem}`,
          origem: 'prontuario',
          fonte_procedimento: 'prontuario',
          fonte_cid: cidItem ? 'prontuario' : 'vazio',
          prontuario_id: pront.id,
          paciente_id: pront.paciente_id,
          paciente_nome: pront.paciente_nome,
          profissional_id: pront.profissional_id,
          profissional_nome: pront.profissional_nome,
          unidade_id: pront.unidade_id,
          data: pront.data_atendimento,
          procedimento_nome: procNome,
          codigo_sigtap: sigtap,
          cid: cidItem,
          carater: '01',
          qtd: v.quantidade || 1,
          status_bpa: 'ok',
        });
      });
    });

    // CORREÇÃO CRÍTICA: Processar Procedimentos Persistentes (patient_procedures) para TODOS os prontuários
    prots.forEach(pront => {
      const pac = pacMap.get(pront.paciente_id);
      const pts = ptsMap.get(pront.paciente_id);
      const linkedProcs = patientProcsMap.get(pront.paciente_id) || [];

      // 1) Adiciona todos os procedimentos persistentes do cadastro do paciente
      linkedProcs.forEach((lp: any) => {
        addLine({
          key: `pac_pers_${pront.id}_${lp.id}`,
          origem: 'prontuario',
          fonte_procedimento: 'paciente',
          fonte_cid: lp.cid ? 'paciente' : 'vazio',
          prontuario_id: pront.id,
          paciente_id: pront.paciente_id,
          paciente_nome: pront.paciente_nome,
          profissional_id: pront.profissional_id,
          profissional_nome: pront.profissional_nome,
          unidade_id: pront.unidade_id,
          data: pront.data_atendimento,
          procedimento_nome: lp.procedimento_nome || 'Procedimento Vinculado',
          codigo_sigtap: lp.sigtap_codigo || '',
          cid: lp.cid || '',
          carater: '01',
          qtd: 1,
          status_bpa: 'ok',
        });
      });

      // 2) Adiciona todos os procedimentos do PTS ativo
      if (pts && pts.procs && pts.procs.length > 0) {
        pts.procs.forEach((pp: any) => {
          addLine({
            key: `pts_pers_${pront.id}_${pp.pts_id}_${pp.procedimento_codigo}`,
            origem: 'prontuario',
            fonte_procedimento: 'pts',
            fonte_cid: pts.cids.length > 0 ? 'pts' : 'vazio',
            prontuario_id: pront.id,
            paciente_id: pront.paciente_id,
            paciente_nome: pront.paciente_nome,
            profissional_id: pront.profissional_id,
            profissional_nome: pront.profissional_nome,
            unidade_id: pront.unidade_id,
            data: pront.data_atendimento,
            procedimento_nome: pp.procedimento_nome || 'Procedimento PTS',
            codigo_sigtap: pp.procedimento_codigo || '',
            cid: pts.cids[0] || '',
            carater: '01',
            qtd: 1,
            status_bpa: 'ok',
          });
        });
      }
    });

    // Handle prontuários that still have no procedure (fallback)
    prots.forEach(pront => {
      const alreadyHas = result.some(r => r.prontuario_id === pront.id && r.codigo_sigtap);
      if (alreadyHas) return;

      addLine({
        key: `pron_fallback_${pront.id}`,
        origem: 'prontuario',
        fonte_procedimento: 'prontuario',
        fonte_cid: 'vazio',
        prontuario_id: pront.id,
        paciente_id: pront.paciente_id,
        paciente_nome: pront.paciente_nome,
        profissional_id: pront.profissional_id,
        profissional_nome: pront.profissional_nome,
        unidade_id: pront.unidade_id,
        data: pront.data_atendimento,
        procedimento_nome: '— sem procedimento —',
        codigo_sigtap: '',
        cid: '',
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
