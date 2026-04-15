import React from 'react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { CustomFieldDef } from '@/hooks/useCustomFields';

interface CustomFieldsRendererProps {
  fields: CustomFieldDef[];
  values: Record<string, any>;
  onChange: (fieldName: string, value: any) => void;
  disabled?: boolean;
}

const CustomFieldsRenderer: React.FC<CustomFieldsRendererProps> = ({ fields, values, onChange, disabled }) => {
  const activeFields = fields.filter(f => f.ativo).sort((a, b) => a.ordem - b.ordem);

  if (activeFields.length === 0) return null;

  return (
    <div className="space-y-3">
      <h4 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">Campos Personalizados</h4>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {activeFields.map(field => {
          const val = values[field.nome] ?? field.valorPadrao ?? '';

          switch (field.tipo) {
            case 'text':
            case 'number':
            case 'date':
              return (
                <div key={field.id}>
                  <Label className="text-sm">
                    {field.rotulo}
                    {field.obrigatorio && <span className="text-destructive ml-1">*</span>}
                  </Label>
                  <Input
                    type={field.tipo === 'number' ? 'number' : field.tipo === 'date' ? 'date' : 'text'}
                    value={val}
                    onChange={e => onChange(field.nome, field.tipo === 'number' ? Number(e.target.value) : e.target.value)}
                    disabled={disabled}
                    required={field.obrigatorio}
                  />
                </div>
              );

            case 'textarea':
              return (
                <div key={field.id} className="md:col-span-2">
                  <Label className="text-sm">
                    {field.rotulo}
                    {field.obrigatorio && <span className="text-destructive ml-1">*</span>}
                  </Label>
                  <Textarea
                    value={val}
                    onChange={e => onChange(field.nome, e.target.value)}
                    disabled={disabled}
                    rows={3}
                  />
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
                  </Label>
                </div>
              );

            case 'select':
              return (
                <div key={field.id}>
                  <Label className="text-sm">
                    {field.rotulo}
                    {field.obrigatorio && <span className="text-destructive ml-1">*</span>}
                  </Label>
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
                </div>
              );

            default:
              return null;
          }
        })}
      </div>
    </div>
  );
};

export default CustomFieldsRenderer;
