# Agenda de Exames — Fase 3: revisão de segurança e condições de homologação

## Estado verificado
- Fase 2 publicada no Vercel; commit a051d027d12821651a522bcf7cf91680c1f479de.
- Primeira blindagem da página publicada no Vercel; commit c359ab58c89aafc3bd11e7db8748023258b661b1.
- Banco consultado em modo leitura: 194 exames comuns, nenhum exame identificado como aparelho diagnóstico e nenhum aparelho configurado na última conferência. Não converter registros históricos.
- `agendamentos.atualizado_em` é timestamp com fuso, NOT NULL, atualizado pelo trigger existente. A interface usa comparação de versão e confirma a linha devolvida antes de notificar.
- 12 testes locais com Node.js sobre a biblioteca TypeScript, cópia com blob SHA ebce9f5c48c0b9c38e827cbc19bbb7f94df14bbe, todos aprovados. Verificação isolada tsc --strict --noEmit aprovada. Não equivale a executar a suíte Vitest completa nem ao teste de integração.
- Não foram aplicadas migrations, RLS, triggers, nem realizadas operações em pacientes reais.

## Proteção transacional — proposta, não implantada
1. Identificar exclusivamente tipo Exame/exame com marcador explícito custom_data.sala_tipo = aparelho_diagnostico e vínculo válido da sala à unidade. Não usar nome, SIGTAP ou tipo isolado para classificar exames antigos.
2. Uma operação de reserva por aparelho/unidade/data deve serializar as alterações de ocupação relevantes de ambos os caminhos de agendamento, inclusive remarcações, e verificar interseção de intervalos dentro da mesma transação. Um SELECT seguido de INSERT no cliente não é garantia de exclusão concorrente.
3. Antes de escolher o mecanismo, auditar caminhos de escrita (incluindo agenda geral, portal, edição e serviços), regras atuais de ocupação, duração dos registros não diagnósticos e concorrência. Não presumir duração inexistente. Definir comportamento conservador para ocupação ambígua sem bloquear consultas comuns. Considerar locks ordenados para mudança de sala/data e proteção contra corrida entre escritores que não passam pelo mesmo RPC; validar sob concorrência real em ambiente isolado.
4. Reutilizar autenticação, papéis e regras existentes. Validar, no servidor, vínculo ativo do ator à unidade, ação autorizada, modalidade, horário, profissional responsável e identidade do paciente. Não ampliar permissões nem contornar RLS. O desenho final deve analisar RLS permissivas e funções existentes, sem mudança global de políticas nesta fase.
5. Para etapas técnicas, verificar versão e transição permitida; preservar metadados não relacionados (inclusive procedimentos_agendados), registros clínicos e laudos liberados. Validar identidade e CRM ativo do laudista no servidor. Não inferir execução ou laudo a partir do status clínico geral. Definir o encaminhamento de chegada com a unidade antes de qualquer sincronização transacional que toque a fila clínica.
6. A entrega de notificações deve ser idempotente por agendamento, laudo e canal; o sucesso da gravação não depende do sucesso de entrega. Validar a natureza da assinatura eletrônica antes de declarar conformidade jurídica.
7. Preparar migração candidata somente após revisão do esquema e autorização específica; testar em base isolada, definir rollback que preserve os dados e confirmar diferenças antes/depois. Este documento não é migration e não contém comandos de escrita.

## Critérios de aceite
- Duas reservas simultâneas para intervalos sobrepostos: no máximo uma confirmada; horários adjacentes e aparelhos distintos independentes.
- Duas liberações simultâneas: apenas uma mudança de etapa confirmada; não sobrescrever laudo liberado.
- Chegada, falta, cancelamento e remarcação coerentes nas interfaces; não reabrir atendimento nem enviar paciente à fila errada.
- Permissões por perfil e unidade testadas; usuário sem autorização não consegue executar a ação por acesso direto à API.
- Novo agendamento comum com SIGTAP (inclusive ECG) continua selecionando procedimento no Prontuário; múltiplos procedimentos preservados. Sem contabilizar agendamento como produção realizada.
- Consultas, tratamentos, Triagem, Enfermagem, filas, Painel de Chamadas, Portal, BPA-I e históricos sem regressão.
- Homologação com aparelho de teste e registros fictícios; nenhum teste de escrita com paciente real.
- Build Vercel não substitui teste de integração nem comprova sincronização da prévia Lovable.

## Decisão
Blindagem da aplicação implementada e regras puras verificadas. Proteção transacional no banco e homologação operacional pendentes. Não ativar rotina transacional sem autorização e evidências de regressão. Modernização visual pode ser trabalhada de forma isolada, sem declarar o módulo apto a uso operacional completo.
