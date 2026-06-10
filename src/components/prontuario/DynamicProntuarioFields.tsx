import React from 'react';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { DebouncedInput } from '@/components/ui/debounced-input';
import { DebouncedTextarea } from '@/components/ui/debounced-textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { ProntuarioField } from '@/hooks/useProntuarioStructure';

interface DynamicProntuarioFieldsProps {
  fields: ProntuarioField[];
  values: any;
  onChange: (key: string, value: any) => void;
  errors?: Record<string, string>;
}

const DynamicProntuarioFields: React.FC<DynamicProntuarioFieldsProps> = ({
  fields,
  values,
  onChange,
  errors
}) => {
  if (!fields || fields.length === 0) return null;

  return (
    <div className="space-y-4">
      {fields.map((field) => {
        const value = values[field.key] || '';
        const error = errors?.[field.key];

        return (
          <div key={field.id} className="space-y-1.5">
            <Label className="flex items-center gap-1">
              {field.label}
              {field.obrigatorio && <span className="text-destructive">*</span>}
            </Label>

            {field.tipo === 'textarea' && (
              <DebouncedTextarea
                rows={3}
                value={value}
                onChange={(e) => onChange(field.key, e.target.value)}
                placeholder={`Informe ${field.label.toLowerCase()}...`}
                className={error ? 'border-destructive' : ''}
              />
            )}

            {(field.tipo === 'text' || field.tipo === 'texto') && (
              <Input
                value={value}
                onChange={(e) => onChange(field.key, e.target.value)}
                placeholder={`Informe ${field.label.toLowerCase()}...`}
                className={error ? 'border-destructive' : ''}
              />
            )}

            {(field.tipo === 'number' || field.tipo === 'numero') && (
              <Input
                type="number"
                value={value}
                onChange={(e) => onChange(field.key, e.target.value)}
                className={error ? 'border-destructive' : ''}
              />
            )}

            {field.tipo === 'data' && (
              <Input
                type="date"
                value={value}
                onChange={(e) => onChange(field.key, e.target.value)}
                className={error ? 'border-destructive' : ''}
              />
            )}

            {field.tipo === 'select' && (
              <Select value={value} onValueChange={(v) => onChange(field.key, v)}>
                <SelectTrigger className={error ? 'border-destructive' : ''}>
                  <SelectValue placeholder="Selecione..." />
                </SelectTrigger>
                <SelectContent>
                  {field.opcoes?.map((opt) => (
                    <SelectItem key={opt} value={opt}>
                      {opt}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}

            {field.tipo === 'checkbox' && (
              <div className="flex flex-wrap gap-3 p-2 border rounded-md bg-muted/20">
                {field.opcoes?.map((opt) => {
                  const currentValues = Array.isArray(value) ? value : [];
                  const checked = currentValues.includes(opt);
                  return (
                    <div key={opt} className="flex items-center gap-2">
                      <Checkbox
                        id={`${field.id}-${opt}`}
                        checked={checked}
                        onCheckedChange={(c) => {
                          const next = c
                            ? [...currentValues, opt]
                            : currentValues.filter((v: string) => v !== opt);
                          onChange(field.key, next);
                        }}
                      />
                      <label htmlFor={`${field.id}-${opt}`} className="text-sm cursor-pointer">
                        {opt}
                      </label>
                    </div>
                  );
                })}
              </div>
            )}

            {error && <p className="text-[10px] text-destructive font-medium">{error}</p>}
          </div>
        );
      })}
    </div>
  );
};

export default DynamicProntuarioFields;
