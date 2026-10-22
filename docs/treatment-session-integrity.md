# Integridade de sessões de tratamento

Esta alteração não faz reparo nem preenchimento de registros históricos. Abrir a
Gestão de Tratamentos passa a ser somente leitura: não vincula sessões à Agenda.

## Problemas confirmados no código anterior

- A criação gravava o ciclo antes das sessões, ignorava o erro de inserção e
  anunciava sucesso mesmo assim. O Prontuário tinha outro caminho com o mesmo risco.
- A extensão executava três gravações independentes sem conferir seus erros.
- A inclusão intermediária renumerava registros antigos e podia falhar entre as
  gravações. Agora a inclusão é explícita ao final, com motivo obrigatório.
- O gerador manual/mensal podia deslocar uma data bloqueada sobre a próxima data
  planejada. O gerador semanal podia terminar antes de gerar a quantidade solicitada.
- A classificação de agendamentos candidatos não excluía vínculos de outras sessões.

## Comportamento

- `validateTreatmentCycle` confere quantidade real, sequência, datas ativas únicas,
  identidade e vínculos reutilizados, sem modificar as entradas.
- Criação e extensão usam `save_treatment_cycle_plan`: uma transação inclui o plano,
  todas as sessões novas, a extensão quando aplicável e a auditoria. Só retorna
  confirmação depois de conferir as linhas efetivamente gravadas.
- Extensões bloqueiam planos históricos inconsistentes para revisão; não completam
  quantidades faltantes nem renumeram o histórico. A inclusão unitária também usa
  esse caminho transacional e recebe o próximo número.
- Canceladas/remarcadas continuam visíveis e não reservam uma data ativa.
- Datas/vínculos só mudam por uma ação manual explícita com justificativa e auditoria.
  Sessões realizadas preservam a data histórica; a edição de notas exige motivo.
- O ciclo mostra a quantidade real, como `6 de 7 sessões registradas`, e os avisos
  de quantidade, sequência, data e vínculo. A lista Master é paginada, sob demanda,
  sem ações de reparo automático, e tem autorização também no servidor.
- A conclusão confere integridade. Uma alta por conclusão com sessões futuras
  pendentes é recusada para impedir sua remoção silenciosa. Outros motivos de alta
  mantêm o fluxo clínico explícito existente.

## Implantação coordenada

**Não publicar o frontend antes de ativar a migração no banco correto.**

1. Revisar/aplicar `20261022113512_treatment_cycle_integrity.sql` pelo acesso
   administrativo Supabase autorizado para o projeto. A migração só cria funções e
   gatilhos; não cria tabelas/colunas nem executa atualização de dados históricos.
2. Conferir funções, gatilhos, permissões e advisors no ambiente real. Os bloqueios
   do calendário e os RPCs existentes continuam sendo utilizados nas operações.
3. Publicar o código correspondente. Sessões históricas devem manter seus IDs,
   datas, números, prontuários, faltas, vínculos e produção.
4. Fazer a conferência visual autenticada por unidade/perfil. Testes clínicos com
   gravação em produção não fazem parte desta verificação.

Nenhum arquivo de layout ou geração TXT BPA-I é alterado.

## Testes

Executar Vitest e o typecheck do projeto. Os testes SQL abaixo usam exclusivamente
registros fictícios e devem rodar em **banco PostgreSQL vazio e isolado**, nunca no
ambiente de produção:

```sh
psql "$TEST_DATABASE_URL" -v ON_ERROR_STOP=1 \
  -f supabase/tests/fixtures/treatment_integrity_schema.sql \
  -f supabase/migrations/20261022113512_treatment_cycle_integrity.sql \
  -f supabase/tests/treatment_cycle_integrity.test.sql
```

Também são executáveis com PostgreSQL WASM (`@electric-sql/pglite` 0.5.11) carregando
os mesmos três arquivos em ordem. Cobrem gravação real de sete sessões, erro na
sétima linha com rollback integral, duplicidade de data, liberação de datas
canceladas/remarcadas, vínculo único, extensão sem reescrever o histórico,
concorrência por versão esperada, rejeição de renumeração e conclusão inconsistente,
revisão Master e isolamento de unidade/profissional. O ensaio de versão esperada
não substitui um teste de concorrência com duas conexões PostgreSQL reais.

## Regularização manual e continuidade do trabalho

- A migração `20261022123911_treatment_manual_regularization.sql` permite data nula
  exclusivamente em sessão pendente sem agendamento, por CHECK validado. Não
  atualiza registros antigos, nem cria tabelas ou colunas.
- O profissional autorizado regulariza seu próprio ciclo com confirmação e motivo.
  A retirada de uma data duplicada protege a sessão que possui agendamento válido.
  A sessão mantida sem data aparece como “Aguarda agendamento”.
- A reposição é individual pelo número faltante; repetir a mesma solicitação retorna
  o registro existente. Nenhum preenchimento ocorre ao abrir a tela.
- Uma pendência histórica em outra sessão não bloqueia uma marcação válida. O alvo
  continua sujeito às regras de data, vínculo, paciente, profissional e unidade.
- Prontuário e Gestão usam a mesma gravação atômica de sessão e agendamento.
  Trocas de data exigem motivo e auditoria. Sugestões dependem da disponibilidade
  conhecida e só são gravadas após confirmação humana.
- A listagem aplica o escopo também no servidor. O filtro de integridade é exclusivo
  do Master; admin.sms mantém alcance global e outros perfis respeitam sua unidade.

Para o ensaio isolado completo, carregar nesta ordem: fixture de schema, primeira
migração, `fixtures/treatment_booking_rpc.sql`, segunda migração, teste original
e `treatment_manual_regularization.test.sql`. Nunca executar fixtures em produção.
