# Recepção e triagem: gravação atômica

A migração `20261023035237_atomic_reception_triage.sql` instala funções em tabelas existentes. Ela não cria tabelas, modifica tipos de colunas, reconcilia registros antigos ou executa exclusões.

## Comportamento

- Chegada: uma RPC bloqueia o agendamento, autentica o funcionário e a unidade, verifica configuração de triagem, grava Agenda/Fila e auditoria na mesma transação. Uma segunda chamada retorna o resultado persistido sem gerar outro log.
- A configuração explícita do profissional (inclusive `false`) prevalece sobre a configuração geral da unidade/global; ausência de configuração mantém atendimento direto.
- Os nomes legados equivalentes de chegada são preservados: Agenda `confirmado_chegada`, Fila `chegada_confirmada`. Na conclusão, ambas recebem exatamente `apto_atendimento` ou `aguardando_enfermagem`.
- Uma ficha aberta para um paciente não pode confirmar outro paciente se o agendamento for reatribuído durante a operação. A identidade esperada é conferida sob o bloqueio do registro.
- Início, rascunho e conclusão da triagem usam o mesmo bloqueio do agendamento. Rascunhos não sobrescrevem uma triagem já confirmada por estas RPCs.
- Validação no formulário e no servidor impede overflow de peso, altura, IMC e demais campos numéricos. Peso em gramas não é presumido; o operador precisa corrigir o valor. Altura em metros é normalizada para centímetros no formulário.
- A auditoria usa a identidade obtida por `auth.uid()` e pelo cadastro ativo do funcionário. Nome enviado pelo navegador não define a autoria. Master de unidade continua limitado à própria unidade; `admin.sms` é global. Permissões por usuário/unidade prevalecem sobre o perfil.
- A função legada de reset de faltas também alterava outras linhas da fila do paciente. A nova chegada reseta apenas os contadores desse paciente na mesma unidade, quando passa por triagem, e preserva as filas históricas.
- A sincronização é uma ação individual e explícita da Recepção/Master. O servidor aceita somente chegadas de hoje ainda pendentes de triagem, com fila ausente ou excluída da triagem, sem ficha confirmada. Não há correção em lote.
- Falha ou RPC indisponível mantém a ficha aberta e mostra o erro. Não existe fallback para a sequência antiga de gravações separadas.

## Instalação e verificação

1. Aplicar a migração no banco identificado por `supabase/config.toml` e registrar a versão no histórico de migrações.
2. Verificar assinaturas, `search_path`, ausência de permissão `EXECUTE` para `PUBLIC`/`anon` e permissões somente nas RPCs públicas para `authenticated`.
3. Publicar o código correspondente, atualizar os terminais e validar um fluxo autorizado de cada configuração de triagem.
4. Conferir no mesmo agendamento o resultado da RPC, fila, ficha (se concluída) e evento em `action_logs`.

A migração é aditiva e compatível com a versão anterior do cliente. Voltar o frontend à versão anterior não exige remover funções nem desfazer dados clínicos. Clientes antigos continuam usando suas rotinas antigas até serem atualizados.

## Testes reproduzíveis

Vitest cobre bloqueio no formulário antes da requisição, normalização, erros recuperáveis, atualização local da Agenda e a ação manual de sincronização:

```sh
npx vitest run src/lib/triageVitals.test.ts src/pages/painel/TriagemFlow.test.tsx src/pages/painel/AgendaArrival.test.tsx src/components/TriageReconciliationPanel.test.tsx src/services/careFlowService.test.ts
```

Os testes SQL usam PostgreSQL real e duas conexões independentes. Exigem um banco **descartável, local, vazio**, com nome terminado em `_test`, e usuário com permissão de criar funções e papéis de teste:

```sh
CARE_FLOW_TEST_DATABASE_URL=postgres://usuario@127.0.0.1:5432/care_flow_test node --test tests/sql/care_flow.test.mjs
```

O teste recusa URLs remotas e bancos sem o sufixo `_test`. As tabelas de fixture reproduzem tipos/defaults do catálogo; não contêm dados de pacientes reais. Triggers de teste injetam falhas na fila e na auditoria. As regras de agendamento existentes em outros triggers devem ser conferidas também no ambiente de validação antes da operação real.
