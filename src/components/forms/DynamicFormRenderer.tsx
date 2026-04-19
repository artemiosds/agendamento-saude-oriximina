import React, { useMemo } from 'react';
import { useForm, Controller, type DefaultValues } from 'react-hook-form';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import type { FormSchema, FormField } from '@/types/formTemplate';

interface DynamicFormRendererProps {
  schema: FormSchema;
  defaultValues?: Record<string, any>;
  onSubmit: (values: Record<string, any>) => void | Promise<void>;
  submitLabel?: string;
  isSubmitting?: boolean;
  /** Renderiza apenas leitura */
  readOnly?: boolean;
  /** Texto exibido quando o template está vazio */
  emptyMessage?: string;
}

/**
 * Renderiza dinamicamente um formulário a partir de um JSONB schema do form_templates.
 * Usa React Hook Form para validação dos campos required.
 */
export function DynamicFormRenderer({
  schema,
  defaultValues,
  onSubmit,
  submitLabel = 'Salvar',
  isSubmitting,
  readOnly,
  emptyMessage = 'Este formulário ainda não tem campos configurados.',
}: DynamicFormRendererProps) {
  const sections = useMemo(
    () =>
      (schema?.sections ?? [])
        .filter(s => s.enabled)
        .sort((a, b) => a.order - b.order)
        .map(s => ({
          ...s,
          fields: (s.fields ?? [])
            .filter(f => f.enabled)
            .sort((a, b) => a.order - b.order),
        }))
        .filter(s => s.fields.length > 0),
    [schema],
  );

  const initial = useMemo<DefaultValues<Record<string, any>>>(() => {
    const acc: Record<string, any> = {};
    sections.forEach(sec =>
      sec.fields.forEach(f => {
        if (defaultValues && defaultValues[f.key] !== undefined) {
          acc[f.key] = defaultValues[f.key];
        } else if (f.type === 'checkbox') {
          acc[f.key] = [];
        } else {
          acc[f.key] = '';
        }
      }),
    );
    return acc as DefaultValues<Record<string, any>>;
  }, [sections, defaultValues]);

  const form = useForm<Record<string, any>>({ defaultValues: initial, values: initial });

  if (sections.length === 0) {
    return <div className="text-sm text-muted-foreground py-8 text-center">{emptyMessage}</div>;
  }

  const handleSubmit = form.handleSubmit(async values => {
    await onSubmit(values);
  });

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {sections.map(section => (
        <Card key={section.id}>
          <CardHeader>
            <CardTitle className="text-base">{section.title}</CardTitle>
            {section.description ? (
              <p className="text-xs text-muted-foreground">{section.description}</p>
            ) : null}
          </CardHeader>
          <CardContent className="space-y-4">
            {section.fields.map(field => (
              <FieldRenderer key={field.id} field={field} form={form} readOnly={readOnly} />
            ))}
          </CardContent>
        </Card>
      ))}

      {!readOnly && (
        <div className="flex justify-end">
          <Button type="submit" disabled={isSubmitting}>
            {isSubmitting ? 'Salvando…' : submitLabel}
          </Button>
        </div>
      )}
    </form>
  );
}

function FieldRenderer({
  field,
  form,
  readOnly,
}: {
  field: FormField;
  form: ReturnType<typeof useForm<Record<string, any>>>;
  readOnly?: boolean;
}) {
  const error = form.formState.errors[field.key];
  const rules = field.required ? { required: 'Campo obrigatório' } : undefined;

  return (
    <div className="space-y-2">
      <Label className="flex items-center gap-2">
        {field.label}
        {field.required && <Badge variant="destructive" className="text-[10px] py-0">obrigatório</Badge>}
      </Label>

      <Controller
        name={field.key}
        control={form.control}
        rules={rules}
        render={({ field: rhf }) => {
          switch (field.type) {
            case 'textarea':
              return (
                <Textarea
                  {...rhf}
                  placeholder={field.placeholder}
                  disabled={readOnly}
                  className="min-h-[100px]"
                />
              );
            case 'number':
              return <Input type="number" {...rhf} placeholder={field.placeholder} disabled={readOnly} />;
            case 'date':
              return <Input type="date" {...rhf} disabled={readOnly} />;
            case 'select':
              return (
                <Select value={rhf.value || ''} onValueChange={rhf.onChange} disabled={readOnly}>
                  <SelectTrigger>
                    <SelectValue placeholder={field.placeholder || 'Selecione…'} />
                  </SelectTrigger>
                  <SelectContent>
                    {(field.options ?? []).map(opt => (
                      <SelectItem key={opt.value} value={opt.value}>
                        {opt.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              );
            case 'radio':
              return (
                <RadioGroup value={rhf.value || ''} onValueChange={rhf.onChange} disabled={readOnly}>
                  {(field.options ?? []).map(opt => (
                    <div key={opt.value} className="flex items-center space-x-2">
                      <RadioGroupItem value={opt.value} id={`${field.id}-${opt.value}`} />
                      <Label htmlFor={`${field.id}-${opt.value}`} className="font-normal cursor-pointer">
                        {opt.label}
                      </Label>
                    </div>
                  ))}
                </RadioGroup>
              );
            case 'checkbox': {
              const value: string[] = Array.isArray(rhf.value) ? rhf.value : [];
              return (
                <div className="space-y-2">
                  {(field.options ?? []).map(opt => {
                    const checked = value.includes(opt.value);
                    return (
                      <div key={opt.value} className="flex items-center space-x-2">
                        <Checkbox
                          id={`${field.id}-${opt.value}`}
                          checked={checked}
                          disabled={readOnly}
                          onCheckedChange={c => {
                            if (c) rhf.onChange([...value, opt.value]);
                            else rhf.onChange(value.filter(v => v !== opt.value));
                          }}
                        />
                        <Label htmlFor={`${field.id}-${opt.value}`} className="font-normal cursor-pointer">
                          {opt.label}
                        </Label>
                      </div>
                    );
                  })}
                </div>
              );
            }
            case 'text':
            default:
              return <Input {...rhf} placeholder={field.placeholder} disabled={readOnly} />;
          }
        }}
      />

      {field.helper && !error && (
        <p className="text-xs text-muted-foreground">{field.helper}</p>
      )}
      {error && (
        <p className="text-xs text-destructive">{(error as any).message || 'Campo inválido'}</p>
      )}
    </div>
  );
}
