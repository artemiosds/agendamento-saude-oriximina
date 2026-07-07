# Melhorias no Editor de Templates + Novo modelo OCI Ortopedia

## Escopo

1. Ampliar o **RichTextEditor** (usado em "Novo template") com controles de tabela e blocos flutuantes.
2. Adicionar como **template pré-carregado** o documento "OCI AVALIAÇÃO DIAGNÓSTICA EM ORTOPEDIA COM RECURSOS DE RADIOLOGIA E TOMOGRAFIA COMPUTADORIZADA", pronto para gerar no DocumentCenter.

## 1. Controles de Tabela (TipTap já tem as extensões instaladas)

Adicionar botões na barra do `src/components/editor/RichTextEditor.tsx`, ativos apenas quando o cursor está dentro de uma tabela:

- Inserir/Excluir Linha (acima/abaixo)
- Inserir/Excluir Coluna (esquerda/direita)
- Alternar linha de cabeçalho
- Mesclar / dividir células
- Excluir tabela
- Ao inserir tabela, abrir um mini seletor de dimensões (linhas × colunas) via Popover

Comandos TipTap: `addRowBefore/After`, `addColumnBefore/After`, `deleteRow`, `deleteColumn`, `mergeCells`, `splitCell`, `toggleHeaderRow`, `deleteTable`.

## 2. Caixa de texto (Text Box) e Movimentação livre

Como TipTap é um editor de fluxo, "mover qualquer coisa em qualquer lugar" via drag absoluto não é nativo. Duas opções:

- **A. Caixa de texto em fluxo (bloco destacado)** — botão "Inserir Caixa de Texto" cria um `<div class="textbox">` com borda/padding editável inline. Suporta arrastar via **drag-and-drop de blocos** (extensão `@tiptap/extension-drag-handle` — mostra alça `⋮⋮` ao lado de cada bloco para reordenar parágrafos/tabelas/caixas por arrasto).
- **B. Posicionamento absoluto (float livre com x/y)** — exigiria reescrever o editor como canvas (fora de TipTap). Não recomendado pelo custo.

**Recomendação:** implementar **A** — caixa de texto + drag-handle nos blocos, cobrindo "mover qualquer coisa dentro do documento" no modelo de fluxo. Sinalizarei isso na UI.

Adicionar também:
- Botão **Imagem** (upload/URL) — `@tiptap/extension-image` (já leve).
- Botão **Cor do texto** e **tamanho de fonte** — `@tiptap/extension-color` + `@tiptap/extension-text-style` + `@tiptap/extension-font-size` (customizado curto).

## 3. Novo template: OCI Avaliação Diagnóstica em Ortopedia

Adicionar em `src/components/ModelosDocumentos.tsx` (lista de modelos prontos) uma opção que insere um template com:

- Cabeçalho institucional (unidade/CNES via variáveis)
- Seção Identificação do Paciente (nome, sexo, prontuário, CNS, DN, raça/cor, etnia, mãe, telefone, responsável, endereço, município, UF, CEP)
- Justificativa: diagnóstico, CID10 principal/secundário/associadas, observações
- Procedimento principal fixo: "OCI AVALIAÇÃO DIAGNÓSTICA EM ORTOPEDIA COM RECURSOS DE RADIOLOGIA E TOMOGRAFIA COMPUTADORIZADA" + campo Qtde
- Tabela de até 16 procedimentos secundários (código / nome / qtde)
- Bloco Solicitação (profissional, data, assinatura/carimbo, doc CNS/CPF)
- Bloco Autorização (autorizador, cód órgão emissor, nº APAC, doc, data, período de validade)

O HTML usa as variáveis já existentes (`{{paciente.nome}}`, `{{paciente.cns}}`, etc.). Onde não houver variável, deixa `[___]` para preenchimento manual/canetada.

## Detalhes técnicos

**Arquivos alterados:**
- `src/components/editor/RichTextEditor.tsx` — nova toolbar com submenu de tabela (dropdown), botão Caixa de Texto, Imagem, cor, tamanho de fonte. Extensões adicionais: `Image`, `Color`, `TextStyle`, `Dropcursor`. Node customizado leve `TextBox` (div `data-type="textbox"`).
- `src/components/ModelosDocumentos.tsx` — nova entrada "OCI Ortopedia" na lista de modelos prontos, com HTML pré-preenchido.
- `src/index.css` (ou CSS do editor) — estilo `.textbox { border: 1px dashed; padding: 8px; margin: 8px 0; border-radius: 6px; }` e alça de drag.

**Dependências novas:** `@tiptap/extension-image`, `@tiptap/extension-color`, `@tiptap/extension-text-style`, `@tiptap/extension-dropcursor` (drag-handle nativo do TipTap v2 via `Dropcursor` + node draggable).

## Fora do escopo (avisar ao usuário)

- Posicionamento absoluto/livre por coordenadas (arrastar para qualquer pixel) não é viável no TipTap sem reescrita; o drag-handle move blocos inteiros, atendendo o caso prático.
