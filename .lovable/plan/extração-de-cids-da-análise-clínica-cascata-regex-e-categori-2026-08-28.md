# Extração de CIDs da Análise Clínica — cascata, regex e categorias

## Observação importante verificada no banco

Consultei `cid10_codigos`: os códigos estão gravados **sem ponto** (`F840`, `F841`, `F849`).
Portanto a consulta `.in('codigo', ...)` precisa usar a forma **sem ponto**, e o ponto entra apenas
na exibição (`F84.0`). Farei a normalização nos dois sentidos: chave canônica sem ponto para
comparação/consulta, e rótulo com ponto para telas, impressão e exportações.

## O que muda

### 1. Motor de extração (novo utilitário em `src/data/clinicalCategories.ts`)

- `extractCids(texto)`: aplica `/\b([A-Z][0-9]{2}(?:\.?[0-9]{1,2})?)\b/gi` — nada de `split(' ')`.
- Descarta vazios, `—`, `-`, `null`, `undefined`, `N/A` e palavras avulsas ("AUTISMO", "INFANTIL", "DA", "DE"),
  pois só sobrevive o que casa com o padrão de CID.
- `normalizeCid(c)` → forma canônica sem ponto (`F84.0` → `F840`).
- `formatCid(c)` → forma de exibição com ponto quando houver subcategoria (`F840` → `F84.0`).

### 2. Cascata de fontes por paciente (`clinicalReport` em `Relatorios.tsx`)

Um `Set` de CIDs canônicos por `paciente_id`, alimentado nesta ordem, sem duplicar código:

1. `prontuarios.cid_codigo` (atendimentos clínicos)
2. `pts.cid_primario` + `pts.cid_secundario`
3. `patient_procedures.cid`
4. `pacientes.cid` (cadastro base) — usado como complemento/fallback

Cada paciente registra também de quais fontes o CID veio (já existe `origens`), agora preenchido
por CID válido de fato, não por presença de registro.

### 3. Consulta de descrições oficiais

A coleta de códigos em `loadReportData` passa a usar o mesmo motor de regex (hoje usa
`split(/[,;\s]+/)`, que gera lixo), inclui os CIDs do cadastro dos pacientes e consulta
`cid10_codigos` pela forma sem ponto. O mapa de descrições fica indexado pela forma canônica.

### 4. Categorias clínicas

Regras revisadas em `CLINICAL_CATEGORIES`:

- **TEA / Autismo**: qualquer `F84*`
- **Deficiência Intelectual**: `F70`–`F79`
- **Deficiência Física**: `G80`–`G83`, `Q65`–`Q74`, sequelas motoras e amputações
- **Transtornos de Fala e Linguagem**: `F80*`, `R47*`
- Auditiva / Surdez / Visual / demais categorias permanecem
- **Novo: "Outros Diagnósticos"** — recebe o paciente cujo CID válido não cai em nenhuma
  categoria acima, para que a soma das categorias feche com o "Total com CID"

A classificação passa a comparar sempre pela forma canônica (hoje há dupla remoção de ponto
inconsistente). O casamento por palavra-chave na descrição continua, mas só como reforço da
categoria de um CID já validado — nunca cria categoria a partir de texto solto.

### 5. Cards e gráficos

- **Pacientes com Múltiplos CIDs**: apenas quem tem ≥ 2 códigos válidos e distintos no `Set`.
- **Top 20 CID-10**: código exibido formatado (`F84.0`) + descrição oficial de `cid10_codigos`.
- **Evolução Temporal**: volume mensal (`YYYY-MM`) por `prontuarios.data_atendimento`, contando
  apenas CIDs válidos extraídos pelo regex.
- KPIs, busca por CID, exportações (Excel/PDF/impressão) passam a usar a forma canônica na
  comparação e a formatada na exibição, mantendo consistência entre tela e documento.

## Escopo técnico

- Arquivos alterados: `src/data/clinicalCategories.ts`, `src/pages/painel/Relatorios.tsx`.
- Nenhuma alteração no banco, em RLS, em edge functions ou em regras de negócio de outras telas.
- Nenhum dado gerado artificialmente: tudo continua vindo dos registros reais.
- Validação: build/typecheck e conferência dos totais (soma das categorias = Total com CID)
  com os dados reais do período padrão.
