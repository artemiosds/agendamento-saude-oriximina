# Regularização pelo profissional

Profissionais ativos podem executar a gestão dos próprios tratamentos na unidade
permitida, sem depender do sinalizador redundante `tratamento.can_execute`.
Recepção e demais perfis mantêm a resolução atual de permissões. Não há alteração
de permissões cadastrais nem acesso a ciclos de outro profissional/unidade.

## Ação Liberar para agendar

A ação individual exige confirmação e envia ID, vínculo e data esperados.
A função bloqueia sessão, ciclo e reserva, revalida autoria/escopo, identidade,
estado, dados clínicos e concorrência antes de gravar:

- Reserva compartilhada: retira somente o vínculo da sessão escolhida, preservando
  a reserva e as demais sessões, inclusive de outros ciclos.
- Reserva exclusiva ainda não recebida: retira o vínculo e exclui a reserva no
  mesmo pacote transacional, liberando o horário.
- Sem reserva: retira a data administrativa para permitir nova marcação.
- Mantém ID, número, quantidade planejada e histórico; não cria sessão substituta.
- Prontuário, atendimento, triagem, fila ou conteúdo clínico impedem a exclusão.
- Falha de auditoria desfaz toda a operação. Repetição com snapshot atualizado
  não duplica o log.

A tela mostra o número original da sessão. Identifica vínculos compartilhados
usando a consulta de vínculos já existente, sem nova consulta por linha.
Pendências históricas em outras linhas não impedem agendamento válido.

## Limites deliberados

Não existe exclusão em lote, renumeração nem correção automática de duplicidades.
Sessões com registros clínicos e ciclos com alta continuam protegidos. A liberação
é uma etapa explícita; depois o profissional escolhe data/horário no modal normal.
Sincronização de data mantém o botão existente e suas verificações.

A migration não altera registros históricos durante a implantação. Os testes SQL
são exclusivos do PostgreSQL isolado, não devem ser executados em produção.
