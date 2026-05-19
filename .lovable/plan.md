# Padronização Global de Impressão, PDF e Preview

## Diagnóstico — Causa raiz

Mapeei 17 pontos do sistema que geram PDF/impressão/preview. Existem **3 problemas estruturais**:

1. **Múltiplos templates concorrentes.** Cada módulo escreve seu próprio HTML com `<style>` embutido (cabeçalho, fontes, margens, rodapé). Mesmo após criar `buildDocumentShell()` em `printLayout.ts`, apenas Ficha Cadastral foi migrada — os demais ignoram a config.
2. **Preview ≠ Print ≠ PDF.** Preview usa CSS de tela (Tailwind, rem), `window.print()` injeta CSS próprio, e `jsPDF` (em `prontuarioPdf.ts`) re-renderiza tudo em pontos (pt) com layout manual. Não compartilham fonte de verdade.
3. **Valores hardcoded.** Font-size em `px`, margens em `mm` arbitrárias, logos com tamanho fixo, cores e bordas embutidas. A config global de Impressão não é lida pela maioria.

## Pontos identificados (17 arquivos, ~12.500 linhas)

| Módulo | Arquivo | Estado atual |
|---|---|---|
| Ficha Paciente | `printFichaPaciente.ts` | ✅ já usa shell global |
| Encaminhamento (regulação) | `referralPrinter.ts` | ❌ HTML próprio |
| Encaminhamento (modal) | `ModalVerEncaminhamento.tsx` | ❌ window.print direto |
| Prontuário PDF | `prontuarioPdf.ts` | ❌ jsPDF manual, ignora config |
| Prontuário Histórico | `HistoricoClinico.tsx` | ❌ template próprio |
| Histórico Completo | `HistoricoCompletoModal.tsx` | ❌ template próprio |
| Documentos (atestado/receita/declaração) | `GerarDocumentoModal.tsx` | ❌ template próprio |
| Documentos Histórico | `DocumentosHistorico.tsx` | ❌ template próprio |
| Receita Médica | `PrescricaoMedicamentos.tsx` | ❌ A5 próprio |
| Solicitação Exames | `SolicitacaoExames.tsx` | ❌ A5 próprio |
| Relatório de Alta CER | `RelatorioAlta.tsx` | ❌ template próprio |
| Ficha Impressão (alternativa) | `FichaImpressao.tsx` | ⚠️ parcial |
| Encaminhamentos (lista) | `Encaminhamentos.tsx` | ❌ window.print |
| Relatórios | `Relatorios.tsx` | ❌ window.print |
| Auditoria | `Auditoria.tsx` | ❌ window.print |
| Funcionários | `Funcionarios.tsx` | ❌ window.print |
| Modelos | `ModelosDocumentos.tsx` | ❌ preview-only |
| Portal Paciente | `PortalPaciente.tsx` | ❌ window.print |
| Config Impressão | `ConfigImpressaoDocumentos.tsx` | ⚠️ preview não usa shell |

## Estratégia — Fonte única de verdade

### 1. Consolidar `src/lib/printLayout.ts`
- `buildDocumentShell(title, body, config, meta, opts?)` aceita:
  - `pageSize`: `'A4' | 'A5'`
  - `orientation`: `'portrait' | 'landscape'`
  - `compactHeader`: boolean (para A5)
  - `extraStyles`: string (CSS específico do documento, opcional)
- Toda a tipografia/margens/cores vem **só** da `DocumentConfig` global (carregada via `loadDocumentConfig()`).
- `@page` size + margins, font-family, font-size base, line-height, cor de texto, cor de bordas — todos vindos da config.
- `printViaIframe(html)` é o único caminho de impressão (substitui `window.print()` direto).
- Adicionar `renderDocumentPreview(html, container)` que injeta o **mesmo HTML** num iframe de preview — garante fidelidade tela = impressão.

### 2. Helpers de bloco reutilizáveis
Em `printLayout.ts`, expor utilitários para os geradores montarem corpo sem reescrever CSS:
- `docSection(title, innerHtml)`
- `docField(label, value)`
- `docGrid(fields[], cols)`
- `docSignature(name, role)`
- `docTable(headers, rows)`
- `docParagraph(text)`

### 3. Eliminar `prontuarioPdf.ts` (jsPDF)
Substituir geração via jsPDF por **print-to-PDF do browser** usando o mesmo shell. Vantagens: fidelidade total preview/print/PDF, zero duplicação, respeita config. O botão "Baixar PDF" passa a chamar `printViaIframe()` (usuário escolhe "Salvar como PDF" no diálogo do browser). Documentar essa mudança de UX no commit.

### 4. Migração arquivo-por-arquivo
Cada gerador vira ~20 linhas: monta corpo com helpers + chama `buildDocumentShell` + `printViaIframe`. Sem `<style>` local, sem `window.print()` direto, sem cabeçalho/rodapé manual.

### 5. Config UI fiel
`ConfigImpressaoDocumentos.tsx` renderiza o preview chamando `buildDocumentShell` com dados-exemplo dentro de iframe — o mesmo caminho de produção. Adicionar controles (já parcialmente existentes) para: margens A4/A5, rodapé institucional, tamanho base de fonte.

## Escopo de arquivos (17 edições + 1 novo helper)

**Reforçar/expandir:**
- `src/lib/printLayout.ts` (helpers + suporte A5/landscape + preview iframe)

**Migrar para shell global:**
- `src/lib/referralPrinter.ts`
- `src/lib/prontuarioPdf.ts` (vira wrapper de print)
- `src/components/ModalVerEncaminhamento.tsx`
- `src/components/HistoricoClinico.tsx`
- `src/components/HistoricoCompletoModal.tsx`
- `src/components/GerarDocumentoModal.tsx`
- `src/components/DocumentosHistorico.tsx`
- `src/components/PrescricaoMedicamentos.tsx`
- `src/components/SolicitacaoExames.tsx`
- `src/components/FichaImpressao.tsx`
- `src/components/ModelosDocumentos.tsx`
- `src/components/config/ConfigImpressaoDocumentos.tsx` (preview via shell)
- `src/pages/painel/RelatorioAlta.tsx`
- `src/pages/painel/Encaminhamentos.tsx`
- `src/pages/painel/Relatorios.tsx`
- `src/pages/painel/Auditoria.tsx`
- `src/pages/painel/Funcionarios.tsx`
- `src/pages/PortalPaciente.tsx`

**Não tocar:** lógica clínica, BPA, RLS, agenda, dados.

## Critérios de aceite
- 100% dos pontos listados usando `buildDocumentShell` + `printViaIframe`.
- Zero `<style>` de cabeçalho/rodapé fora de `printLayout.ts`.
- Zero `window.print()` direto fora de `printLayout.ts`.
- Preview renderiza pelo mesmo HTML que vai pro print.
- Alterar config global muda **todos** os documentos.

## Tamanho e risco
- ~12.500 linhas envolvidas; ~600–900 linhas efetivamente reescritas.
- Risco: alterações de layout sutis em documentos hoje "bonitos por acaso". Mitigação: cada documento ganha seção própria via helpers, mantendo conteúdo idêntico — só o chrome (header/footer/fontes) vira global.
- **Estimativa:** 12–18 turnos de edição. Recomendo fazer em 3 lotes:
  1. **Lote A** — `printLayout.ts` (helpers + preview) + `prontuarioPdf.ts` + `referralPrinter.ts` + Config preview.
  2. **Lote B** — Documentos clínicos: Prontuário, Histórico, Receita, Exames, Atestado/Declaração, Relatório Alta.
  3. **Lote C** — Listagens administrativas: Encaminhamentos, Relatórios, Auditoria, Funcionários, Portal, Modelos.

Aprovar para começar pelo **Lote A**?
