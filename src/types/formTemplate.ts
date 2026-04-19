// Tipos do Motor de Formulários Dinâmicos (Dynamic Form Builder)

export type FieldType =
  | 'text'
  | 'textarea'
  | 'number'
  | 'date'
  | 'select'
  | 'radio'
  | 'checkbox'; // múltipla escolha (array de valores)

export interface FormFieldOption {
  /** Valor armazenado no payload */
  value: string;
  /** Texto exibido ao usuário */
  label: string;
}

export interface FormField {
  id: string;
  /** Chave imutável usada no payload JSON. Ex: "queixa_principal" */
  key: string;
  /** Rótulo visível ao usuário (editável) */
  label: string;
  type: FieldType;
  required: boolean;
  enabled: boolean;
  /** Texto auxiliar exibido abaixo do campo */
  helper?: string;
  /** Placeholder para inputs/textareas */
  placeholder?: string;
  /** Apenas para select/radio/checkbox */
  options?: FormFieldOption[];
  order: number;
  /** True quando o campo espelha uma coluna conhecida da tabela `prontuarios` (SOAP, anamnese...) */
  builtin?: boolean;
}

export interface FormSection {
  id: string;
  title: string;
  description?: string;
  enabled: boolean;
  order: number;
  fields: FormField[];
}

export interface FormSchema {
  sections: FormSection[];
}

/** Origem de onde o template foi resolvido (debug/UI) */
export type TemplateOrigin = 'profissional' | 'unidade' | 'global';

export interface FormTemplate {
  id: string;
  unidade_id: string;
  profissional_id: string;
  /** Slug imutável usado pela recepção (ex: 'initial_eval') */
  form_slug: string;
  /** Nome amigável editável pelo Master */
  display_name: string;
  descricao: string;
  schema: FormSchema;
  ativo: boolean;
  versao: number;
  criado_por: string;
  created_at: string;
  updated_at: string;
  /** Adicionado pela RPC resolve_form_template */
  _origem?: TemplateOrigin;
}

/** Slugs canônicos imutáveis (referenciados pelo código da recepção). */
export const CANONICAL_SLUGS = {
  INITIAL_EVAL: 'initial_eval',
  CONSULTA: 'consulta_padrao',
  RETORNO: 'retorno',
  SESSION: 'session',
} as const;

export type CanonicalSlug = (typeof CANONICAL_SLUGS)[keyof typeof CANONICAL_SLUGS];
