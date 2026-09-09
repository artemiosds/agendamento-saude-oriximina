# Abertura instantânea do "Novo Agendamento"

## O que está causando a lentidão (confirmado)

Dentro do formulário de Novo Agendamento existe, além da busca de paciente, uma segunda caixa "ou selecione pela lista" que monta **um item para cada paciente cadastrado** (dezenas de milhares de linhas hoje). Toda vez que o formulário abre, o computador precisa desenhar essa lista inteira — é isso que trava a tela em máquinas mais fracas.

A busca por nome/CPF/telefone que já existe no formulário, por outro lado, já consulta o banco sob demanda (a partir de 2 letras) e traz poucos resultados — está correta.

## O que será feito

1. **Trocar a lista gigante por busca sob demanda**
   A caixa "ou selecione pela lista" deixa de montar todos os pacientes. A seleção passa a ser feita pela busca já existente, que consulta apenas quando o usuário digita, com espera de 300 ms e no máximo 20 resultados.

2. **Não carregar a lista completa de pacientes só para o formulário**
   O formulário passa a não depender do vetor completo de pacientes; a seleção resolve o paciente escolhido individualmente (comportamento que a busca já faz hoje).

3. **Evitar redesenho da grade da Agenda ao abrir/fechar o formulário**
   Os cartões e listas da Agenda passam a ser memoizados e os callbacks do formulário estabilizados, para que abrir a janela não force a agenda do dia a se redesenhar.

4. **Cache das listas auxiliares**
   Profissionais, salas e especialidades continuam vindo do contexto já carregado, com validade de cache de 5 minutos, sem nova consulta ao banco a cada abertura.

## O que NÃO muda

- Nenhuma regra de validação, conferência de dados do paciente, bloqueio de horário/vaga, encaixe ou salvamento.
- Nenhuma alteração no banco, políticas de acesso ou funções.
- O fluxo visível continua idêntico: escolher paciente, conferir dados, profissional, data, hora, salvar.

## Detalhes técnicos

- `src/pages/painel/Agenda.tsx`: remover o `<Select>` que faz `pacientes.map(...)` (linhas ~2503-2516) e manter o `BuscaPaciente` como único seletor; ajustar textos auxiliares.
- `src/components/BuscaPaciente.tsx`: `limit(10)` → `limit(20)`, debounce 250 ms → 300 ms, mínimo de 2 caracteres mantido; a prop `pacientes` passa a ser opcional (apenas atalho de cache local).
- `React.memo` + `useCallback` nos handlers do formulário e nos itens de lista da Agenda que ainda não estão memoizados.
- Sobre `React.lazy` no modal: o conteúdo do diálogo (Radix) já é desmontado quando fechado, então o ganho real vem do item 1; o código do formulário está no mesmo arquivo da Agenda, e extraí-lo para um módulo separado é uma refatoração grande e arriscada num arquivo de ~3.900 linhas. Fica fora deste escopo, com a lentidão resolvida pelos itens acima.
- Verificação: typecheck/build e abertura do formulário na pré-visualização.
