import { ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu, DropdownMenuTrigger, DropdownMenuContent,
  DropdownMenuCheckboxItem, DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import { UNKNOWN_BPA_BLOCK, toggleBpaBlockSelection } from "@/lib/bpaAttendanceBlock";

interface Props {
  value: string[];
  options: Array<{ key: string; label: string }>;
  onChange: (value: string[]) => void;
  disabled?: boolean;
}

export default function BpaBlockMultiSelect({ value, options, onChange, disabled }: Props) {
  const all = value.length === 0;
  const labels = value.map(key => key === UNKNOWN_BPA_BLOCK ? "Sem bloco identificado" : options.find(o => o.key === key)?.label || key);
  const summary = all ? "Todos os blocos" : value.length === 1 ? labels[0] : `${value.length} blocos selecionados`;
  return (
    <div className="space-y-2 min-w-0">
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button id="bloco_atendimento" type="button" variant="outline" disabled={disabled}
            className="w-full justify-between font-normal min-w-0" title={labels.join("; ") || summary}>
            <span className="truncate">{summary}</span><ChevronDown className="h-4 w-4 shrink-0 opacity-50" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-[var(--radix-dropdown-menu-trigger-width)] max-h-72 overflow-y-auto">
          <DropdownMenuCheckboxItem checked={all} onSelect={e => e.preventDefault()} onCheckedChange={() => onChange([])}>
            Todos os blocos
          </DropdownMenuCheckboxItem>
          <DropdownMenuSeparator />
          {options.map(option => (
            <DropdownMenuCheckboxItem key={option.key} checked={value.includes(option.key)}
              onSelect={e => e.preventDefault()} onCheckedChange={() => onChange(toggleBpaBlockSelection(value, option.key))}>
              <span className="whitespace-normal break-words">{option.label}</span>
            </DropdownMenuCheckboxItem>
          ))}
          <DropdownMenuCheckboxItem checked={value.includes(UNKNOWN_BPA_BLOCK)} onSelect={e => e.preventDefault()}
            onCheckedChange={() => onChange(toggleBpaBlockSelection(value, UNKNOWN_BPA_BLOCK))}>
            Sem bloco identificado
          </DropdownMenuCheckboxItem>
        </DropdownMenuContent>
      </DropdownMenu>
      {!all && <p className="text-xs text-muted-foreground break-words" aria-live="polite">{labels.join("; ")}</p>}
    </div>
  );
}
