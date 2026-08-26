# Correções de robustez na página de Relatórios

Escopo: apenas `src/pages/painel/Relatorios.tsx` (mais um hook novo de debounce). Nenhuma otimização de query nesta etapa — colunas, índices e agregações ficam para a segunda etapa.

## Confirmações técnicas solicitadas

1. **Versão do cliente:** `package.json` declara `@supabase/supabase-js: ^2.98.0` e a versão instalada é **2.110.1** (postgrest-js 2.110.1). O método existe e está tipado: `abortSignal(signal: AbortSignal): this` em `PostgrestTransformBuilder` (linha 642 do fonte do pacote), disponível também no `.d.mts`. Suporte confirmado.

2. **Paginação:** o `signal` será aplicado **dentro do `while (true)`**, na construção de cada `query` antes do `.range(...)` — ou seja, em toda página de todas as 10 tabelas, não só na primeira. Além disso, cada iteração checa `signal.aborted` antes de continuar o loop, e a query de `cid10_codigos` (que roda depois do `Promise.all`) também recebe o mesmo signal.

## Achado importante antes de começar

O guard atual não faz o que parece. Em `loadReportData` (linha 194) existe `if (isFetching) return;`, mas `isFetching` **não está na lista de dependências** do `useCallback` (linha 338). O callback é recriado a cada mudança de filtro capturando `isFetching = false`, então o guard nunca bloqueia nada. Consequência real: várias buscas rodam em paralelo e **a última que responder sobrescreve o estado**, não a última que o usuário pediu. O sintoma é o inverso do descrito no relatório anterior: não há descarte silencioso, há sobrescrita fora de ordem. A correção com AbortController resolve os dois casos.


## 1. Corrigir a race condition

Substituir o guard por controle explícito de requisição:

- Um `useRef<AbortController|null>`: cada nova execução aborta a anterior (`abortController.abort()`) e cria a sua.
- Passar o `signal` a todas as queries Supabase via `.abortSignal(signal)` (suportado pelo postgrest-js), incluindo o loop de paginação de `fetchAllPages` e a busca de `cid10_codigos`.
- Após cada `await`, se `signal.aborted`, sair sem aplicar nenhum `setState`.
- Erros de abort (`AbortError`) são ignorados silenciosamente; não viram erro visível nem mexem no timestamp.
- Remover `if (isFetching) return;`. Nenhuma mudança de filtro é descartada.

## 2. Loading consumido pela UI

- Usar os componentes já existentes em `src/components/skeletons/`: `DashboardSkeleton` para a carga inicial da página inteira e `TableSkeleton` para as tabelas das abas durante refetch.
- `isInitialLoading` passa a ser realmente usado: enquanto `true`, a página renderiza `DashboardSkeleton` no lugar do conteúdo (cabeçalho de ações e filtros continuam visíveis).
- Durante `isFetching`, os 5 selects (Unidade, Profissional, Status, Tipo, Setor) e os 2 inputs de data recebem `disabled`, e os blocos de KPI/tabelas mostram skeleton em vez de dado antigo sem aviso.
- Manter o texto "Buscando..." do botão Atualizar.

## 3. Debounce nos filtros de data

- Criar `src/hooks/useDebouncedValue.ts` (hook genérico, 400 ms).
- Os inputs de data continuam controlados por `dateFrom`/`dateTo` (digitação/pick responde na hora); `loadReportData` passa a depender de `debouncedDateFrom`/`debouncedDateTo`.
- Os selects continuam disparando imediatamente (sem debounce), como pedido.
- Cuidado necessário: os ~40 `useMemo` que filtram por data no cliente devem passar a usar os valores debounced, para não recortarem por uma data que o fetch ainda não trouxe.

## 4. Unificar `taxaFalta`

Base única adotada: **agendamentos efetivos** = `total - cancelados`. Justificativa: um agendamento cancelado nunca gerou expectativa de presença, então incluí-lo no denominador dilui artificialmente a taxa de falta e a torna incoerente com a taxa de comparecimento, que já usa essa mesma base nos dois lugares.

- Criar helpers puros no módulo (fora do componente): `calcTaxaFalta(faltas, total, cancelados)` e `calcTaxaComparecimento(concluidos, total, cancelados)`.
- `stats` (linha ~420) e `executiveKpis` (linha ~1289) passam a chamar os mesmos helpers. `executiveKpis.taxaFalta` já usa a base correta; o valor que muda é o de `stats`, refletido no card "Taxa Falta" da faixa de KPIs.
- Efeito visível: o percentual de falta na faixa superior sobe um pouco (passa a excluir cancelados) e fica idêntico ao da aba Executivo.

## 5. Falha parcial não pode parecer sucesso

Hoje, quando uma tabela falha, `fetchAllPages` faz `break` silencioso (linhas 257-260), retorna array vazio ou parcial, e `setLastUpdated(new Date())` (linha 331) roda normalmente.

- `fetchAllPages` passa a retornar `{ rows, partial, table }` e a acumular as tabelas que falharam.
- `setLastUpdated` só é chamado quando nenhuma tabela falhou. Em falha parcial, o timestamp da última carga completa é preservado.
- Novo estado `partialTables: string[]`, exibido como aviso ao lado de "Última atualização": faixa/badge em tom de alerta com "Dados parciais — falha ao carregar: <tabelas>" e um botão para tentar novamente.
- Erro geral no `catch` recebe o mesmo tratamento (toast de erro + timestamp preservado).

## Ordem de execução e verificação

Cada item é aplicado e verificado antes do próximo, com relato de arquivo e linha:

1. AbortController → verificar no preview que alternar filtros rapidamente resulta no dado do último filtro selecionado.
2. Skeletons + filtros desabilitados → verificar carga inicial e refetch.
3. Debounce de 400 ms nas datas → verificar que digitar uma data não dispara buscas intermediárias.
4. `taxaFalta` unificada → conferir que o card da faixa e a aba Executivo mostram o mesmo número.
5. Falha parcial → conferir que o aviso aparece e o timestamp antigo permanece.

## Detalhes técnicos

- Arquivos alterados: `src/pages/painel/Relatorios.tsx`; novo `src/hooks/useDebouncedValue.ts`.
- Sem alteração de banco, RLS, edge functions ou regra de negócio de agendamento.
- `.abortSignal()` é aplicado por query; em `Promise.all` de 10 tabelas um único abort encerra todas.
- Nenhuma mudança nas colunas selecionadas (`select('*')` permanece nesta etapa).
