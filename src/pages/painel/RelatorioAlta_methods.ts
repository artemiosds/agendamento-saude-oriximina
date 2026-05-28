  const loadMultiData = async (pid: string) => {
    if (!user?.id) return;
    setLoading(true);
    try {
      const { data: existingDraft } = await supabase
        .from("prontuarios")
        .select("*")
        .eq("paciente_id", pid)
        .eq("status", "rascunho")
        .eq("tipo_registro", "alta_multiprofissional")
        .maybeSingle();

      if (existingDraft) {
        setReportId(existingDraft.id);
        setStatus("rascunho");
        const data = JSON.parse(existingDraft.observacoes);
        
        setModalidades(data.modalidades || []);
        setCid10(data.cid10 || "");
        setMultiCid10Secundario(data.multiCid10Secundario || "");
        setMultiDiagClinico(data.multiDiagClinico || "");
        setMultiDiagFuncional(data.multiDiagFuncional || "");
        setMultiContextoBiopsicossocial(data.multiContextoBiopsicossocial || "");
        setCifFuncoes(data.cifFuncoes || "");
        setCifAtividades(data.cifAtividades || "");
        setCifFatores(data.cifFatores || "");
        setMultiBarreiras(data.multiBarreiras || "");
        setMultiPotencialidades(data.multiPotencialidades || "");
        setMultiFatoresContextuais(data.multiFatoresContextuais || "");
        setMultiObjetivosGerais(data.multiObjetivosGerais || "");
        setMultiPlanoExecutado(data.multiPlanoExecutado || "");
        setProfSections(data.profissionais || []);
        setMotivoAlta(data.motivoAlta || "");
        setMultiTipoAlta(data.multiTipoAlta || "");
        setMultiMotivoDetalhe(data.motivoDetalhe || "");
        setCondicaoFuncional(data.condicaoFuncional || "");
        setNivelIndep(data.nivelIndep || "");
        setMultiComparacaoFuncional(data.multiComparacaoFuncional || "");
        setMultiGanhosPrincipais(data.multiGanhosPrincipais || "");
        setMultiLimitacoesPersistentes(data.multiLimitacoesPersistentes || "");
        setMultiRiscoRegressao(data.multiRiscoRegressao || "");
        setMultiFatoresAlerta(data.multiFatoresAlerta || "");
        setOrientacoesUsuario(data.orientacoesUsuario || "");
        setOrientacoesUbs(data.orientacoesUbs || "");
        setMultiOrientacoesEscola(data.multiOrientacoesEscola || "");
        setMultiPontosAtencao(data.multiPontosAtencao || "");
        setEncaminhamentos(data.encaminhamentos || []);
        setFreqAps(data.freqAps || "");
        setMultiContinuarTerapia(data.multiContinuarTerapia || "");
        setMultiPrazoRetorno(data.multiPrazoRetorno || "");
        setMultiResponsavelTecnico(data.multiResponsavelTecnico || "");
        setDataAlta(existingDraft.data_atendimento || new Date().toISOString().split("T")[0]);
        
        toast.info("Rascunho multiprofissional carregado.");
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const loadIndividualData = async (pid: string) => {
    if (!user?.id) return;
    setLoading(true);
    try {
      // 1. Check for existing draft
      const { data: existingDraft } = await supabase
        .from("prontuarios")
        .select("*")
        .eq("paciente_id", pid)
        .eq("profissional_id", user.id)
        .eq("status", "rascunho")
        .eq("tipo_registro", "alta_individual")
        .maybeSingle();

      if (existingDraft) {
        setReportId(existingDraft.id);
        setStatus("rascunho");
        const data = JSON.parse(existingDraft.observacoes);
        // Load all data from draft
        setIndDiagCid(data.diagCid || "");
        setIndCif(data.cif || "");
        setIndDiagClinico(data.diagClinico || "");
        setIndDiagFuncional(data.diagFuncional || "");
        setIndNivelComprometimento(data.nivelComprometimento || "");
        setIndObsDiagnosticas(data.obsDiagnosticas || "");
        setIndQueixaPrincipal(data.queixaPrincipal || "");
        setIndMotivoEncaminhamento(data.motivoEncaminhamento || "");
        setIndContextoFamiliar(data.contextoFamiliar || "");
        setIndComorbidades(data.comorbidades || "");
        setIndMedicacao(data.medicacao || "");
        setIndObjetivos(data.objetivos || "");
        setIndIntervencoes(data.intervencoes || "");
        setIndEvolucao(data.evolucao || "");
        setIndMetas(data.metas || "totalmente");
        setIndMetasJust(data.metasJust || "");
        setIndTA(data.ta || "");
        setIndFrequenciaAtendimento(data.frequenciaAtendimento || "");
        setIndAdesaoTratamento(data.adesaoTratamento || "");
        setIndEvolucaoGlobal(data.evolucaoGlobal || "");
        setIndIntercorrencias(data.intercorrencias || "");
        setIndIntercorrenciasObs(data.intercorrenciasObs || "");
        setIndRespostaTerapeutica(data.respostaTerapeutica || "");
        setIndComparacaoInicioAlta(data.comparacaoInicioAlta || "");
        setIndMotivo(data.motivo || "");
        setIndTipoAlta(data.tipoAlta || "");
        setIndMotivoDet(data.motivoDet || "");
        setIndOrientacoes(data.orientacoes || "");
        setIndEncaminhamento(data.encaminhamento || "");
        setIndModalidade(data.modalidade || "");
        setIndDataAlta(existingDraft.data_atendimento || new Date().toISOString().split("T")[0]);
        setIndSessoes(data.sessoes || 0);
        setIndFaltas(data.faltas || 0);
        setIndPeriodoInicio(data.periodoInicio || "");
        setIndPeriodoFim(data.periodoFim || "");
        setIndContinuarTerapia(data.continuarTerapia || "");
        setIndRiscoRegressao(data.riscoRegressao || "");
        setIndPrazoReavaliacao(data.prazoReavaliacao || "");
        
        toast.info("Rascunho carregado com sucesso.");
        setLoading(false);
        return;
      }

      // 2. Load fresh data if no draft
      const { data: pronts } = await supabase
        .from("prontuarios")
        .select("data_atendimento, hipotese, procedimentos_texto, queixa_principal, evolucao, conduta")
        .eq("paciente_id", pid)
        .eq("profissional_id", user.id)
        .order("data_atendimento", { ascending: true });

      if (pronts && pronts.length > 0) {
        setIndPeriodoInicio(pronts[0].data_atendimento);
        setIndPeriodoFim(pronts[pronts.length - 1].data_atendimento);
        setIndQueixaPrincipal(pronts[0].queixa_principal || "");
        
        const lastPront = pronts[pronts.length - 1];
        setIndDiagCid(lastPront.hipotese || "");
        setIndIntervencoes(lastPront.procedimentos_texto || "");
        setIndEvolucao(lastPront.evolucao || "");
        setIndOrientacoes(lastPront.conduta || "");
      }

      // Load sessions and absences
      const { data: sessions } = await supabase
        .from("treatment_sessions")
        .select("status")
        .eq("patient_id", pid)
        .eq("professional_id", user.id);

      const realizada = sessions?.filter(s => s.status === "realizada").length || 0;
      const faltas = sessions?.filter(s => s.status === "falta").length || 0;
      setIndSessoes(realizada);
      setIndFaltas(faltas);

      // Load PTS
      const { data: activePts } = await supabase
        .from("pts")
        .select("*")
        .eq("patient_id", pid)
        .eq("status", "ativo")
        .maybeSingle();

      if (activePts) {
        setIndDiagFuncional(activePts.diagnostico_funcional || "");
        setIndObjetivos(activePts.objetivos_terapeuticos || "");
        setIndMotivoEncaminhamento(activePts.motivo_encaminhamento || "");
        
        const { data: metas } = await supabase
          .from("pts_metas")
          .select("id, titulo, status")
          .eq("pts_id", activePts.id);
        
        if (metas) setPtsMetas(metas);
      }

      const pat = pacientes.find(p => p.id === pid);
      if (pat?.cid && !indDiagCid) setIndDiagCid(pat.cid);

    } catch (error) {
      console.error("Error loading individual data:", error);
    } finally {
      setLoading(false);
    }
  };
