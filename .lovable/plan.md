# Fila de Espera por Profissão (CBO), não só por profissional

## Objetivo

Hoje, ao adicionar um paciente à fila, só existe "Profissional (opcional) → Qualquer" ou um profissional individual. A melhoria permite deixar a vaga **aberta por profissão/CBO** (ex.: "Fisioterapeuta • CBO 223605"), de modo que qualquer profissional daquela profissão possa atender.

## O que muda na tela

Nos dois diálogos "Adicionar à Fila de Espera":
- Página **Fila de Espera** (`/painel/fila-espera`)
- Página **Pacientes** (botão de adicionar à fila)

Novo seletor de direcionamento com duas formas de encaminhar, sem remover nada do que já existe:

```text
Direcionar para:  ( ) Profissional específico   (•) Profissão / CBO (qualquer profissional)

Profissão / CBO:  [ Fisioterapeuta • CBO 223605           v ]
```

- Escolhendo **Profissional específico**: comportamento atual, inclusive a opção "Qualquer".
- Escolhendo **Profissão / CBO**: o profissional individual fica vazio (aberto) e a fila registra a profissão de destino.
- A lista de profissões é montada a partir das profissões reais dos funcionários ativos da unidade, com o código CBO já cadastrado no profissional; profissões sem CBO aparecem apenas com o nome.
- O cartão/linha do paciente na fila passa a mostrar a profissão de destino quando não houver profissional individual (ex.: "Aberto para: Fisioterapeuta • CBO 223605") em vez de apenas "Qualquer profissional".

## Detalhes técnicos

- Sem migração de banco: a profissão de destino é gravada no campo já existente `fila_espera.especialidade_destino` (mapeado como `especialidadeDestino` em `FilaContext`), e `profissional_id` fica vazio.
- Arquivos:
  - `src/pages/painel/FilaEspera.tsx` — estado do formulário (`form`, e o mesmo bloco no formulário de importação/novo paciente), novo grupo de seleção, envio de `especialidadeDestino`, e exibição na listagem.
  - `src/pages/painel/Pacientes.tsx` — mesmo bloco no diálogo `filaDialogOpen` (`filaForm`).
  - Novo componente compartilhado `src/components/fila/ProfissaoCboSelect.tsx` para montar as opções (profissão + CBO) a partir dos funcionários, evitando duplicar lógica nas duas páginas.
- Nenhuma alteração de regra de negócio: filtros, ordenação de prioridade, chamada manual, encaixe e RLS permanecem iguais. Registros antigos continuam válidos (campo vazio = "Qualquer").
