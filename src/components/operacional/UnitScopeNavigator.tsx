import { Building2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

interface UnitScopeNavigatorProps {
  units: Array<{ id: string; nome: string }>;
  value: string;
  onChange: (unitId: string) => void;
}

/** One unit scope across the operational pages; the URL carries the chosen unit. */
export function UnitScopeNavigator({ units, value, onChange }: UnitScopeNavigatorProps) {
  if (!units.length) return null;

  return (
    <nav aria-label="Visão por unidade" className="space-y-2">
      <div className="sm:hidden">
        <Select value={value} onValueChange={onChange}>
          <SelectTrigger aria-label="Selecionar unidade para visualização">
            <SelectValue placeholder="Selecione a unidade" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Visão geral · Todas as unidades</SelectItem>
            {units.map(unit => <SelectItem key={unit.id} value={unit.id}>{unit.nome}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>
      <div className="hidden sm:flex gap-2 overflow-x-auto pb-2" role="group" aria-label="Filtrar por unidade">
        <Button type="button" size="sm" variant={value === 'all' ? 'default' : 'outline'} aria-pressed={value === 'all'} className="shrink-0" onClick={() => onChange('all')}>
          <Building2 className="mr-1.5 h-4 w-4" />Visão geral
        </Button>
        {units.map(unit => (
          <Button key={unit.id} type="button" size="sm" variant={value === unit.id ? 'default' : 'outline'} aria-pressed={value === unit.id} className="shrink-0" onClick={() => onChange(unit.id)}>
            {unit.nome}
          </Button>
        ))}
      </div>
    </nav>
  );
}
