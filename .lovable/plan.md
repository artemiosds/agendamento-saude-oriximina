# Personalização Dinâmica do Prontuário — Plano

Vou evoluir a página **Configuração de Campos** para virar um motor completo de personalização do prontuário, sem mexer em nenhuma outra parte do sistema (apenas estender o que já existe em `useCustomFields` + `CustomFieldsRenderer` + telas do prontuário).

---

## 1. Fonte única de verdade (modelo de dados)

Estende a estrutura atual `system_config.id='custom_fields_config'` (zero migration, zero quebra). Adiciono campos opcionais ao `CustomFieldDef` — os antigos continuam válidos via defaults.

```ts
// src/hooks/useCustomFields.ts (extensão retrocompatível)
export type CustomFieldType =
  | 'text' | 'textarea' | 'number' | 'date'
  | 'select' | 'multiselect' | 'checkbox' | 'radio'
  | 'phone' | 'cpf' | 'cns' | 'email' | 'time';

export interface CustomFieldValidation {
  min?: number;          // num/data/length
  max?: number;
  maxLength?: number;
  mask?: string;         // ex: '999.999.999-99'
  regex?: string;
}

export interface CustomFieldCondition {
  fieldName: string;     // campo de referência (nativo OU custom)
  op: 'eq' | 'neq' | 'in' | 'notin' | 'empty' | 'notempty';
  value?: string | string[];
}

export interface CustomFieldScope {
  especialidades?: string[];     // [] = todas
  tiposProntuario?: string[];    // 'primeira_consulta' | 'retorno' | ...; [] = todos
  global?: boolean;              // true = sempre aparece (independente dos outros filtros)
}

export interface CustomFieldDef {
  id: string;
  nome: string;
  rotulo: string;
  tipo: CustomFieldType;
  opcoes: string[];
  obrigatorio: boolean;
  ativo: boolean;
  ordem: number;
  valorPadrao: string;
  mostrarListagem: boolean;
  // NOVOS (todos opcionais → não quebra dados antigos):
  secao?: string;                          // agrupador visual
  validacao?: CustomFieldValidation;
  condicao?: CustomFieldCondition;         // exibição condicional
  escopo?: CustomFieldScope;               // onde aparece
  helpText?: string;
}
```

Persistência continua em `system_config.configuracoes[screen][unidadeId]`. Valores preenchidos continuam em `custom_data jsonb` das tabelas existentes (`pacientes`, `prontuarios`, etc.) — chave é `field.nome`.

---

## 2. Aplicação de especialidade / tipo / regras condicionais

Crio um único helper puro que decide se um campo deve renderizar:

```ts
// src/lib/customFieldsEngine.ts (novo, sem dependências)
export function resolveVisibleFields(
  fields: CustomFieldDef[],
  ctx: {
    especialidade?: string;
    tipoProntuario?: string;
    values: Record<string, any>;
  }
): CustomFieldDef[];

export function validateCustomFields(
  fields: CustomFieldDef[],
  values: Record<string, any>,
  ctx
): { ok: boolean; errors: Record<string, string> };

export function applyMask(value: string, mask?: string): string;
```

Regras:
- **Escopo**: `global=true` sempre passa. Senão, se `especialidades` definido, precisa bater; idem `tiposProntuario`.
- **Condição**: avalia `op` contra `values[condicao.fieldName]`.
- **Validação**: obrigatório + min/max + maxLength + mask + regex.

---

## 3. Reflexo automático em todas as telas do prontuário

Já existe `CustomFieldsRenderer`. Estendo ele para:
- Suportar novos tipos (`multiselect`, `radio`, `phone`, `cpf`, `cns`, `email`, `time`).
- Usar `resolveVisibleFields` + `validateCustomFields` internamente.
- Agrupar por `secao`.
- Aceitar props `especialidade` e `tipoProntuario` para o filtro de escopo.
- Modo `readOnly` (para visualização) e modo `print` (HTML estático).

Adiciono função `renderCustomFieldsHtml(fields, values, ctx)` em `src/lib/customFieldsEngine.ts` para impressão/PDF — consumida pelo `printLayout.ts` já existente, dentro do shell global. Assim:

- **Novo prontuário** → `<CustomFieldsRenderer screen="prontuario" especialidade={X} tipoProntuario={Y} />`
- **Editar** → idem, com `values` populados.
- **Visualização** → mesmo componente em `readOnly`.
- **Impressão/PDF** → `renderCustomFieldsHtml(...)` injetado no shell.

Uma única função de render = zero divergência.

---

## 4. Compatibilidade com dados antigos

- Campos novos no `CustomFieldDef` são todos opcionais → configs antigas carregam normalmente.
- Valores em `custom_data` são preservados mesmo se o campo for desativado/removido (apenas não renderiza; nada é deletado).
- Se um campo mudar de tipo, o renderer faz fallback seguro (`String(val)`).
- Versionamento leve: cada save grava `updatedAt` (já existe via `updated_at`).

---

## 5. UI da página `ConfigPersonalizarCampos`

Mantenho a tela atual (lista por screen + dnd-kit), e adiciono no modal "Novo/Editar Campo":
- Seletor de **Tipo** com os novos tipos.
- Seção **"Onde aparece"**: switch global / multi-select especialidades / multi-select tipos prontuário.
- Seção **"Validações"**: min, max, maxLength, máscara.
- Seção **"Regra condicional"**: campo + operador + valor.
- Campo **Seção** (agrupador).
- Campo **Help text**.

---

## Arquivos tocados (escopo enxuto)

1. `src/hooks/useCustomFields.ts` — estende tipos (retrocompat).
2. `src/lib/customFieldsEngine.ts` — **novo**: resolveVisible, validate, applyMask, renderCustomFieldsHtml.
3. `src/components/CustomFieldsRenderer.tsx` — novos tipos, agrupamento, escopo/condição, readOnly.
4. `src/components/config/ConfigPersonalizarCampos.tsx` — UI do modal de campo (novos selects/validações/condições).
5. Telas de prontuário que já usam o renderer → recebem props `especialidade`/`tipoProntuario` (mudança mínima, 1 linha cada).
6. `src/lib/prontuarioPdf.ts` / fluxo de impressão → chama `renderCustomFieldsHtml` dentro do shell global já existente.

**Nada fora desse escopo será alterado.** Sem mexer em agenda, BPA, auth, RLS, ou outras configs.

---

## 6. Extras úteis (incluídos)

- **Duplicar campo** (botão no card).
- **Importar/Exportar** definição em JSON (botão na toolbar).
- **Preview ao vivo** no modal (renderiza o campo enquanto edita).
- **Badge "condicional"** / **"por especialidade"** no card da lista.
- Tipos `phone`/`cpf`/`cns` com máscara automática.

---

## Critérios de aceite

- Criar campo "Escala de Dor" tipo `select`, escopo especialidade=Fisioterapia, tipo prontuário=Avaliação Inicial → aparece **só** lá, em novo/editar/visualizar/PDF.
- Criar campo condicional "Detalhe da dor" visível se "Escala de Dor" ≥ 5 → some/aparece dinamicamente.
- Desativar um campo antigo → some das telas, valores antigos permanecem no banco.
- Imprimir prontuário → campos personalizados aparecem agrupados por seção, no shell institucional global.
