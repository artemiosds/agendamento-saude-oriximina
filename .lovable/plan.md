# Padrão Institucional Global para Documentos

## Objetivo
Garantir que TODOS os documentos do sistema (Prontuário, Ficha do Paciente, Atestado, Receituário, Exames, Encaminhamento, Relatório de Alta, etc.) usem o mesmo cabeçalho + rodapé institucional configurado em **Configurações → Impressão de Documentos**, com logos esquerda/centro/direita, tamanho independente, formato redondo, e fiel entre Preview, Impressão e PDF.

## Arquitetura

### 1. Fonte única de verdade (já existente, será reforçada)
- `src/lib/printLayout.ts` já contém `DocumentConfig` com `logosConfig` (left/center/right) + `altura` + `redonda` + `ativo`, e a função `docHeader()` que gera o HTML do cabeçalho com distribuição inteligente (1/2/3 logos).
- Vou adicionar `docFooter()` no mesmo arquivo (rodapé institucional global com endereço, telefone, CNES, data/hora, "página X").
- Vou adicionar `buildDocumentShell(title, bodyHtml, config)` que monta documento A4 completo com CSS `@page`, `@media print`, cabeçalho global e rodapé global. Esse será o **DocumentShell** central.

### 2. Refatorar geradores existentes para usar `buildDocumentShell`
Trocar templates ad-hoc por chamadas ao shell único:

| Arquivo | Documento | Ação |
|---|---|---|
| `src/lib/printFichaPaciente.ts` | Ficha Cadastral do Paciente | Reescrever para usar `buildDocumentShell` + blocos: Identificação, Endereço, Contato, Complementares/SUS, Anexos |
| `src/lib/prontuarioPdf.ts` | Prontuário Clínico | Substituir cabeçalho/rodapé pelo shell global |
| `src/lib/referralPrinter.ts` | Encaminhamento | Substituir cabeçalho pelo shell global |
| `src/components/SolicitacaoExames.tsx` (impressão A5) | Solicitação de Exames | Manter A5 mas adotar cabeçalho compacto da config |
| `src/components/PrescricaoMedicamentos.tsx` | Receituário | Idem |
| `src/components/GerarDocumentoModal.tsx` | Atestado/Declaração/Termo | Usar shell global |
| `src/pages/painel/RelatorioAlta.tsx` | Relatório de Alta | Usar shell global com título correto |
| `src/components/FichaImpressao.tsx` | Impressão alternativa de ficha | Usar shell global |

### 3. Página de Configuração (`src/components/config/ConfigImpressaoDocumentos.tsx`)
- Já existe com 3 slots de logos, sliders de altura e switch de redonda.
- Adicionar: **seção Rodapé** (endereço, telefone, e-mail, CNES, switches "mostrar página X/Y" e "mostrar data/hora").
- Adicionar: **margens A4** (top/right/bottom/left em mm).
- Preview renderiza usando o **mesmo `buildDocumentShell`** (não HTML manual) para garantir fidelidade.
- Toasts de loading/sucesso/erro já existem via `useConfiguracao` (manter).

### 4. Storage
- Bucket `document-logos` já existe e é público. Usar para as 3 logos.

### 5. Ficha Cadastral do Paciente (foco crítico)
Reescrita do template em `printFichaPaciente.ts`:
- Cabeçalho global (`docHeader`)
- Título: **FICHA CADASTRAL DO PACIENTE**
- Bloco 1 — Identificação (nome, mãe, nascimento, idade, sexo, CPF, CNS, naturalidade, nacionalidade, raça/cor)
- Bloco 2 — Endereço (CEP, logradouro, número, complemento, bairro, município/UF)
- Bloco 3 — Contato (telefones, e-mail)
- Bloco 4 — Complementares/SUS (unidade, especialidade destino, origem, CID complementar, observações, dados BPA)
- Bloco 5 — Anexos (apenas lista de nomes)
- Rodapé global (`docFooter`)
- Campos vazios renderizam como "Não informado"
- Botão de impressão na página Pacientes invoca essa função única

### 6. CSS A4 unificado
Embutido em `buildDocumentShell`:
```
@page { size: A4; margin: <config>mm; }
@media print { .no-print { display:none!important } .doc-section { break-inside: avoid } }
.document-page { width: 210mm; min-height: 297mm; }
```

## Escopo de arquivos

**Editar:**
- `src/lib/printLayout.ts` — adicionar `docFooter()`, `buildDocumentShell()`, tipos de rodapé
- `src/components/config/ConfigImpressaoDocumentos.tsx` — seção rodapé + margens, preview via shell
- `src/lib/printFichaPaciente.ts` — reescrever usando shell
- `src/lib/prontuarioPdf.ts` — usar shell
- `src/lib/referralPrinter.ts` — usar shell
- `src/components/GerarDocumentoModal.tsx` — usar shell
- `src/components/SolicitacaoExames.tsx` — adotar cabeçalho da config
- `src/components/PrescricaoMedicamentos.tsx` — adotar cabeçalho da config
- `src/pages/painel/RelatorioAlta.tsx` — usar shell, título correto
- `src/components/FichaImpressao.tsx` — usar shell

**Não tocar:** lógica clínica, BPA, agenda, cadastro de paciente, RLS, dados.

## Fora de escopo (preparado para futuro, não implementado agora)
- Overrides por unidade/tipo de documento/profissional — arquitetura permite mas usaremos sempre global.
- Auditoria de impressão/PDF — apontamento para futuro.

## Riscos
- Documentos A5 (receita/exames) hoje têm layout próprio; vou preservar tamanho A5 mas trocar o cabeçalho pelo gerado da config (versão compacta).
- Alguns geradores chamam `window.print` direto em iframes — vou manter o fluxo mas trocar o conteúdo HTML.

## Entrega
1. Shell único + rodapé global no `printLayout.ts`
2. Config UI com rodapé/margens e preview fiel
3. Ficha do Paciente reescrita
4. Prontuário, Relatório de Alta, Encaminhamento, Atestado/Receita/Exames migrados
5. Smoke test visual em cada documento
