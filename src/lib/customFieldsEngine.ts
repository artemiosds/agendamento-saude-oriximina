import type { CustomFieldDef, CustomFieldCondition } from '@/hooks/useCustomFields';

export interface CustomFieldsContext {
  especialidade?: string;
  tipoProntuario?: string;
  values: Record<string, any>;
}

/** Avalia uma condição de exibição contra os valores correntes. */
export function evaluateCondition(cond: CustomFieldCondition | undefined, values: Record<string, any>): boolean {
  if (!cond?.fieldName) return true;
  const raw = values?.[cond.fieldName];
  const isEmpty = raw === undefined || raw === null || raw === '' || (Array.isArray(raw) && raw.length === 0);
  switch (cond.op) {
    case 'empty':
      return isEmpty;
    case 'notempty':
      return !isEmpty;
    case 'eq':
      return String(raw ?? '') === String(cond.value ?? '');
    case 'neq':
      return String(raw ?? '') !== String(cond.value ?? '');
    case 'in': {
      const arr = Array.isArray(cond.value) ? cond.value : [String(cond.value ?? '')];
      if (Array.isArray(raw)) return raw.some(v => arr.includes(String(v)));
      return arr.includes(String(raw ?? ''));
    }
    case 'notin': {
      const arr = Array.isArray(cond.value) ? cond.value : [String(cond.value ?? '')];
      if (Array.isArray(raw)) return !raw.some(v => arr.includes(String(v)));
      return !arr.includes(String(raw ?? ''));
    }
    default:
      return true;
  }
}

/** Filtra a lista de campos pelo escopo (especialidade/tipo) + condição + ativos. */
export function resolveVisibleFields(fields: CustomFieldDef[], ctx: CustomFieldsContext): CustomFieldDef[] {
  return (fields || [])
    .filter(f => f.ativo)
    .filter(f => {
      const esc = f.escopo;
      if (!esc || esc.global) return true;
      if (esc.especialidades?.length && ctx.especialidade) {
        if (!esc.especialidades.map(s => s.toLowerCase()).includes(ctx.especialidade.toLowerCase())) return false;
      }
      if (esc.tiposProntuario?.length && ctx.tipoProntuario) {
        if (!esc.tiposProntuario.includes(ctx.tipoProntuario)) return false;
      }
      return true;
    })
    .filter(f => evaluateCondition(f.condicao, ctx.values))
    .sort((a, b) => a.ordem - b.ordem);
}

/** Agrupa campos por seção, preservando ordem. */
export function groupBySection(fields: CustomFieldDef[]): { secao: string; fields: CustomFieldDef[] }[] {
  const map = new Map<string, CustomFieldDef[]>();
  for (const f of fields) {
    const k = (f.secao || '').trim() || '__sem_secao__';
    if (!map.has(k)) map.set(k, []);
    map.get(k)!.push(f);
  }
  return Array.from(map.entries()).map(([secao, fields]) => ({
    secao: secao === '__sem_secao__' ? '' : secao,
    fields,
  }));
}

/** Aplica máscara simples no padrão "9" = dígito, "A" = letra, demais = literal. */
export function applyMask(value: string, mask?: string): string {
  if (!mask) return value;
  const v = String(value ?? '');
  let out = '';
  let vi = 0;
  for (let i = 0; i < mask.length && vi < v.length; i++) {
    const m = mask[i];
    const c = v[vi];
    if (m === '9') {
      if (/\d/.test(c)) { out += c; vi++; } else { vi++; i--; }
    } else if (m === 'A') {
      if (/[a-zA-Z]/.test(c)) { out += c; vi++; } else { vi++; i--; }
    } else {
      out += m;
      if (c === m) vi++;
    }
  }
  return out;
}

const MASKS: Record<string, string> = {
  cpf: '999.999.999-99',
  cns: '999 9999 9999 9999',
  phone: '(99) 99999-9999',
};

export function maskForField(f: CustomFieldDef): string | undefined {
  if (f.validacao?.mask) return f.validacao.mask;
  if (f.tipo === 'cpf' || f.tipo === 'cns' || f.tipo === 'phone') return MASKS[f.tipo];
  return undefined;
}

export interface ValidationResult {
  ok: boolean;
  errors: Record<string, string>;
}

export function validateCustomFields(
  fields: CustomFieldDef[],
  values: Record<string, any>,
  ctx?: Partial<CustomFieldsContext>,
): ValidationResult {
  const visible = resolveVisibleFields(fields, {
    especialidade: ctx?.especialidade,
    tipoProntuario: ctx?.tipoProntuario,
    values,
  });
  const errors: Record<string, string> = {};
  for (const f of visible) {
    const v = values?.[f.nome];
    const isEmpty = v === undefined || v === null || v === '' || (Array.isArray(v) && v.length === 0);
    if (f.obrigatorio && isEmpty) {
      errors[f.nome] = `${f.rotulo} é obrigatório`;
      continue;
    }
    if (isEmpty) continue;
    const val = f.validacao;
    if (val) {
      const str = String(v);
      if (val.maxLength != null && str.length > val.maxLength) errors[f.nome] = `Máx. ${val.maxLength} caracteres`;
      if (f.tipo === 'number') {
        const n = Number(v);
        if (val.min != null && n < val.min) errors[f.nome] = `Mínimo ${val.min}`;
        if (val.max != null && n > val.max) errors[f.nome] = `Máximo ${val.max}`;
      }
      if (val.regex) {
        try { if (!new RegExp(val.regex).test(str)) errors[f.nome] = 'Formato inválido'; } catch { /* ignora regex inválida */ }
      }
    }
    if (f.tipo === 'email' && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(v))) errors[f.nome] = 'E-mail inválido';
    if (f.tipo === 'cpf') {
      const digits = String(v).replace(/\D/g, '');
      if (digits.length !== 11) errors[f.nome] = 'CPF deve ter 11 dígitos';
    }
  }
  return { ok: Object.keys(errors).length === 0, errors };
}

const esc = (s: string) => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] as string));

/** Gera HTML estático dos campos personalizados para impressão/PDF. */
export function renderCustomFieldsHtml(
  fields: CustomFieldDef[],
  values: Record<string, any>,
  ctx?: Partial<CustomFieldsContext>,
): string {
  const visible = resolveVisibleFields(fields, {
    especialidade: ctx?.especialidade,
    tipoProntuario: ctx?.tipoProntuario,
    values: values || {},
  });
  if (!visible.length) return '';
  const groups = groupBySection(visible);
  const fmt = (f: CustomFieldDef) => {
    const v = values?.[f.nome];
    if (v === undefined || v === null || v === '') return '<em style="color:#888">Não informado</em>';
    if (Array.isArray(v)) return esc(v.join(', '));
    if (typeof v === 'boolean') return v ? 'Sim' : 'Não';
    return esc(String(v));
  };
  return groups.map(g => `
    ${g.secao ? `<h3 style="font-size:11pt;margin:8pt 0 4pt;border-bottom:1px solid #ccc;padding-bottom:2pt;">${esc(g.secao)}</h3>` : ''}
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:6pt 14pt;margin-bottom:6pt;">
      ${g.fields.map(f => `
        <div>
          <div style="font-size:8pt;color:#555;text-transform:uppercase;letter-spacing:.04em;">${esc(f.rotulo)}</div>
          <div style="font-size:10pt;">${fmt(f)}</div>
        </div>
      `).join('')}
    </div>
  `).join('');
}
