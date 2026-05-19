import React, { useMemo } from 'react';
import { DebouncedInput } from '@/components/ui/debounced-input';
import { Label } from '@/components/ui/label';
import { DebouncedTextarea } from '@/components/ui/debounced-textarea';
import { Checkbox } from '@/components/ui/checkbox';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { CustomFieldDef } from '@/hooks/useCustomFields';
import { resolveVisibleFields, groupBySection, applyMask, maskForField } from '@/lib/customFieldsEngine';

interface CustomFieldsRendererProps {
  fields: CustomFieldDef[];
  values: Record<string, any>;
  onChange: (fieldName: string, value: any) => void;
  disabled?: boolean;
  readOnly?: boolean;
  /** Para filtro de escopo. */
  especialidade?: string;
  tipoProntuario?: string;
  /** Erros vindos de validateCustomFields(). */
  errors?: Record<string, string>;
  /** Esconde o título "Campos Personalizados". */
  hideTitle?: boolean;
}

const inputTypeFor = (t: CustomFieldDef['tipo']): string => {
  switch (t) {
    case 'number': return 'number';
    case 'date': return 'date';
    case 'time': return 'time';
    case 'email': return 'email';
    case 'phone':
    case 'cpf':
    case 'cns':
    case 'text':
    default: return 'text';
  }
};

const CustomFieldsRenderer: React.FC<CustomFieldsRendererProps> = ({
  fields, values, onChange, disabled, readOnly, especialidade, tipoProntuario, errors, hideTitle,
}) => {
  const visible = useMemo(
    () => resolveVisibleFields(fields, { especialidade, tipoProntuario, values: values || {} }),
    [fields, values, especialidade, tipoProntuario],
  );

  if (visible.length === 0) return null;

  const groups = groupBySection(visible);

  const renderField = (field: CustomFieldDef) => {
    const val = values?.[field.nome] ?? field.valorPadrao ?? (field.tipo === 'multiselect' ? [] : '');
    const err = errors?.[field.nome];
    const labelEl = (
      <Label className="text-sm">
        {field.rotulo}
        {field.obrigatorio && <span className="text-destructive ml-1">*</span>}
      </Label>
    );
    const helper = (field.helpText || err) ? (
      <p className={`text-xs mt-1 ${err ? 'text-destructive' : 'text-muted-foreground'}`}>{err || field.helpText}</p>
    ) : null;

    if (readOnly) {
      const display = Array.isArray(val) ? val.join(', ') : (typeof val === 'boolean' ? (val ? 'Sim' : 'Não') : String(val ?? '—'));
      return (
        <div key={field.id} className={field.tipo === 'textarea' ? 'md:col-span-2' : ''}>
          {labelEl}
          <div className="text-sm py-1.5 px-2 rounded bg-muted/30 border min-h-[34px]">{display || '—'}</div>
          {helper}
        </div>
      );
    }

    switch (field.tipo) {
      case 'textarea':
        return (
          <div key={field.id} className="md:col-span-2">
            {labelEl}
            <DebouncedTextarea
              value={val}
              onChange={e => onChange(field.nome, e.target.value)}
              disabled={disabled}
              rows={3}
              maxLength={field.validacao?.maxLength}
            />
            {helper}
          </div>
        );

      case 'checkbox':
        return (
          <div key={field.id} className="flex items-center gap-2">
            <Checkbox
              id={`cf-${field.id}`}
              checked={!!val}
              onCheckedChange={v => onChange(field.nome, v)}
              disabled={disabled}
            />
            <Label htmlFor={`cf-${field.id}`} className="text-sm cursor-pointer">
              {field.rotulo}
              {field.obrigatorio && <span className="text-destructive ml-1">*</span>}
            </Label>
            {helper}
          </div>
        );

      case 'multiselect': {
        const arr: string[] = Array.isArray(val) ? val : [];
        return (
          <div key={field.id} className="md:col-span-2">
            {labelEl}
            <div className="grid grid-cols-2 md:grid-cols-3 gap-1.5 mt-1">
              {field.opcoes.map(opt => {
                const checked = arr.includes(opt);
                return (
                  <label key={opt} className="flex items-center gap-2 text-sm cursor-pointer">
                    <Checkbox
                      checked={checked}
                      disabled={disabled}
                      onCheckedChange={c => {
                        if (c) onChange(field.nome, [...arr, opt]);
                        else onChange(field.nome, arr.filter(v => v !== opt));
                      }}
                    />
                    {opt}
                  </label>
                );
              })}
            </div>
            {helper}
          </div>
        );
      }

      case 'radio':
        return (
          <div key={field.id} className="md:col-span-2">
            {labelEl}
            <RadioGroup value={String(val ?? '')} onValueChange={v => onChange(field.nome, v)} disabled={disabled} className="mt-1">
              {field.opcoes.map(opt => (
                <div key={opt} className="flex items-center gap-2">
                  <RadioGroupItem value={opt} id={`cf-${field.id}-${opt}`} />
                  <Label htmlFor={`cf-${field.id}-${opt}`} className="text-sm font-normal cursor-pointer">{opt}</Label>
                </div>
              ))}
            </RadioGroup>
            {helper}
          </div>
        );

      case 'select':
        return (
          <div key={field.id}>
            {labelEl}
            <Select value={val || ''} onValueChange={v => onChange(field.nome, v)} disabled={disabled}>
              <SelectTrigger>
                <SelectValue placeholder="Selecione..." />
              </SelectTrigger>
              <SelectContent>
                {field.opcoes.map(opt => (
                  <SelectItem key={opt} value={opt}>{opt}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            {helper}
          </div>
        );

      default: {
        const mask = maskForField(field);
        return (
          <div key={field.id}>
            {labelEl}
            <DebouncedInput
              type={inputTypeFor(field.tipo)}
              value={String(val ?? '')}
              maxLength={field.validacao?.maxLength}
              min={field.validacao?.min}
              max={field.validacao?.max}
              onChange={e => {
                let v: any = e.target.value;
                if (mask) v = applyMask(v, mask);
                if (field.tipo === 'number') v = v === '' ? '' : Number(v);
                onChange(field.nome, v);
              }}
              disabled={disabled}
              required={field.obrigatorio}
            />
            {helper}
          </div>
        );
      }
    }
  };

  return (
    <div className="space-y-4">
      {!hideTitle && (
        <h4 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">Campos Personalizados</h4>
      )}
      {groups.map((g, idx) => (
        <div key={idx} className="space-y-2">
          {g.secao && <h5 className="text-xs font-semibold text-foreground/80 uppercase tracking-wide">{g.secao}</h5>}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {g.fields.map(renderField)}
          </div>
        </div>
      ))}
    </div>
  );
};

export default React.memo(CustomFieldsRenderer);
