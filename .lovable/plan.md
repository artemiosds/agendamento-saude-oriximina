## Sub-fase 1B — Tela de Modelos + Editor com Variáveis + Aplicação do novo cabeçalho

Continuação direta da Sub-fase 1A (já concluída: cabeçalho 3 logos + carimbo + preview A4 + impressão fiel). Agora vou reformar a tela de Modelos de Documentos, criar um editor com inserção de variáveis dinâmicas, e aplicar o novo cabeçalho institucional nos modais de geração de documento e histórico completo.

### O que será entregue

**1. Tela `ModelosDocumentos.tsx` repaginada (cards + filtros + busca + responsivo)**
- Layout em cards (substitui lista atual), com badges visuais de tipo (Atestado, Receita, Declaração, Encaminhamento, Relatório), escopo (Global/Unidade/Pessoal) e status (Ativo/Inativo).
- Barra de filtros: tipo, escopo, perfil permitido, busca por nome.
- Mobile-first: cards empilham em <640px, grid 2 colunas em md, 3 em lg.
- Ações por card: Editar, Duplicar, Visualizar (preview A4), Ativar/Desativar, Excluir (com confirmação).
- Vazio elegante (EmptyState) e skeletons durante carregamento.

**2. Editor de modelo profissional (`EditorModeloDocumento.tsx` — novo)**
- Reaproveita `RichTextEditor` existente.
- **Botão "Inserir variável"** com dropdown agrupado:
  - Paciente: `{{paciente.nome}}`, `{{paciente.cpf}}`, `{{paciente.cns}}`, `{{paciente.data_nascimento}}`, `{{paciente.idade}}`, `{{paciente.endereco}}`, `{{paciente.nome_mae}}`
  - Profissional: `{{profissional.nome}}`, `{{profissional.conselho}}` (ex: CRM-PA 12345), `{{profissional.cbo}}`, `{{profissional.cns}}`, `{{profissional.especialidade}}`
  - Unidade/Clínica: `{{clinica.nome}}`, `{{clinica.cnes}}`, `{{clinica.endereco}}`, `{{unidade.nome}}`
  - Atendimento: `{{atendimento.data}}`, `{{atendimento.cid}}`, `{{atendimento.procedimento}}`
  - Sistema: `{{data.hoje}}`, `{{data.extenso}}`, `{{cidade_uf}}`
- Toggles: incluir cabeçalho institucional, incluir rodapé, incluir carimbo final, incluir 3 logos.
- Escopo do modelo: Global / Unidade / Pessoal (respeita RLS existente em `document_templates`).
- Painel lateral de **Preview A4 ao vivo** usando o mesmo motor de `printLayout.ts`, com dados de exemplo (paciente fictício "JOÃO DA SILVA" etc.).
- Salva versão anterior em `document_templates.versoes` (até 5 — já é o padrão).

**3. Aplicação do novo cabeçalho/rodapé**
- `GerarDocumentoModal.tsx`: substitui o header atual pelo bloco oficial (3 logos + bloco institucional + rodapé + carimbo do profissional logado). Usa `documento_config_<unidadeId>` (fallback global) + `funcionarios.custom_data.carimbo`.
- `HistoricoCompletoModal.tsx`: envolve o conteúdo de impressão com o mesmo cabeçalho oficial e carimbo final do profissional que está imprimindo, sem alterar o conteúdo da timeline.
- Substituição da função de render é feita via helper já criado em `printLayout.ts` na Sub-fase 1A.

### Detalhes técnicos

- **Sem novas tabelas**: tudo persiste em `document_templates` (já existente). Variáveis ficam embutidas no campo `conteudo` (texto com `{{...}}`); toggles e escopo em campos existentes (`tipo_modelo`, `unidade_id`, `perfis_permitidos`, `blocos_clinicos` JSON).
- **Resolução de variáveis**: novo helper `src/lib/templateVariables.ts` com função `resolveVariables(template, context)` que substitui `{{...}}` por valores reais no momento de gerar o documento. Não toca no banco.
- **Preview**: componente `A4Preview` reutilizado da Sub-fase 1A, recebe HTML resolvido com dados mock.
- **Permissões**: respeita RLS atual de `document_templates` (Master gerencia globais/unidade; profissional gerencia os próprios). UI esconde ações conforme `useAuth` + `usePermissions`.
- **Mobile**: `backdrop-filter: blur` desabilitado em <768px (regra de memória já aplicada no projeto).
- **Sem mock data, sem auto-gerar registros, sem novos buckets** — usa `document-logos` e `carimbos` já existentes.

### Arquivos afetados

- editar `src/components/ModelosDocumentos.tsx` (refator visual completo, mantém lógica de save/load)
- criar `src/components/EditorModeloDocumento.tsx`
- criar `src/lib/templateVariables.ts`
- editar `src/components/GerarDocumentoModal.tsx` (aplicar header/footer/carimbo oficiais + resolução de variáveis)
- editar `src/components/HistoricoCompletoModal.tsx` (envolver impressão com header/carimbo oficiais)

### Fora do escopo desta fase

- Editor visual WYSIWYG novo (continuamos com `RichTextEditor` atual).
- Assinatura digital ICP-Brasil (mantemos hash SHA-256 atual).
- Novas tabelas ou campos de banco.

Posso seguir com essa entrega?