async function handleStatusChange(newStatus) {
    console.log('Handling status change...');

    // Validate triage settings and available technicians
    const isTriageEnabled = validateTriageSettings();
    const availableTechnicians = await fetchAvailableTechnicians();
    if (!isTriageEnabled || availableTechnicians.length === 0) {
        console.warn('Triage is not enabled or no available technicians.');
        showToast('Triage is not available at the moment.');
        return;
    }

    // Inserting a record into fila_espera table
    try {
        const filaEsperaEntry = {
            agendamento_id: this.agendamentoId,
            paciente_id: this.pacienteId,
            paciente_nome: this.pacienteNome,
            unidade_id: this.unidadeId,
            status: 'aguardando_triagem',
            hora_chegada: this.horaChegada || new Date().toISOString(),
            criado_em: new Date().toISOString(),
            especialidade_destino: this.especialidadeDestino || '',
            cid: this.cid || '',
            descricao_clinica: this.descricaoClinica || '',
            prioridade: this.prioridade || '',
        };

        await insertFilaEspera(filaEsperaEntry);
        console.log('Inserido na fila_espera com sucesso:', filaEsperaEntry);

        // Update agendamento status
        this.agendamentoStatus = 'aguardando_triagem';
        console.log('Agendamento status atualizado para aguardando_triagem');

        // Notify about status change and sync with Google Calendar (keep existing behavior)
        notifyStatusChange(newStatus);
        syncWithGoogleCalendar();

    } catch (error) {
        console.error('Erro ao inserir na fila_espera:', error);
        showToast('Erro ao confirmar chegada.');
    }
}