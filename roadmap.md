# Roadmap

- [x] Separar os seis contadores da geração BPA-I e eliminações finais.
- [x] Tornar a deduplicação final específica por agendamento_id, com fallback para prontuario.id e contexto seguro.
- [x] Adicionar diagnóstico de deduplicação somente em desenvolvimento.
- [x] Criar e executar testes A–G de deduplicação.
- [x] Executar build e geração real da competência 202608 pela interface.
- [x] Apresentar causa, chaves antiga/nova, arquivos, testes e contagem final.
- [x] Usar exclusivamente `logradouros_dne` na normalização de endereço do TXT BPA-I.
- [x] Validar os cenários A–J e confirmar Registro 03 com 338 posições.
- [x] Executar geração real sem alterar o cadastro dos pacientes.
- [ ] Validar a serialização BPA-I pelo fluxo normal para qualquer usuário autorizado, sem dependência de perfil, profissional ou sessão especial.
- [ ] Comparar TXT e conferência da competência 202608 e comprovar preservação integral dos registros válidos.
- [ ] Corrigir regressões localizadas do cabeçalho, telefone e validar estabilidade DNE no BPA-I.
- [ ] Comparar os arquivos antigo e atual da competência 202608 e emitir o relatório obrigatório.
