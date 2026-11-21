import { memo, useEffect, useMemo, useState } from "react";
import { Check, ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import type { User } from "@/types";

const normalize = (text: string) => text.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim();

function professionalSubtitle(professional: User) {
  const role = professional.profissao || professional.cargo;
  const registration = [professional.tipoConselho, professional.numeroConselho].filter(Boolean).join(" ");
  const council = registration && professional.ufConselho ? `${registration}/${professional.ufConselho}` : registration;
  return [role, council].filter(Boolean).join(" · ");
}

export default memo(function AgendaProfessionalFilter({ professionals, unitId, value, onChange }: {
  professionals: readonly User[];
  unitId: string;
  value: string;
  onChange: (value: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [appliedSearch, setAppliedSearch] = useState("");
  useEffect(() => {
    if (!open) return;
    const timer = window.setTimeout(() => setAppliedSearch(normalize(search)), 150);
    return () => window.clearTimeout(timer);
  }, [search, open]);

  const grouped = useMemo(() => {
    const groups = new Map<string, { id: string; name: string; subtitle: string; search: string }[]>();
    const sorted = professionals.filter(professional => unitId === "all" || professional.unidadeId === unitId)
      .sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));
    for (const professional of sorted) {
      const category = professional.profissao || professional.cargo || "Outros";
      const subtitle = professionalSubtitle(professional);
      const group = groups.get(category) ?? [];
      group.push({ id: professional.id, name: professional.nome, subtitle, search: normalize(`${professional.nome} ${subtitle}`) });
      groups.set(category, group);
    }
    return Array.from(groups);
  }, [professionals, unitId]);

  const matches = useMemo(() => appliedSearch
    ? grouped.map(([category, entries]) => [category, entries.filter(entry => entry.search.includes(appliedSearch))] as const)
      .filter(([, entries]) => entries.length)
    : grouped, [grouped, appliedSearch]);

  const selected = useMemo(() => professionals.find(professional => professional.id === value), [professionals, value]);
  const selectedName = selected
    ? [selected.nome, professionalSubtitle(selected)].filter(Boolean).join(" · ")
    : value === "all" ? "Todos os profissionais" : "Selecionar profissional";

  function changeOpen(nextOpen: boolean) {
    setOpen(nextOpen);
    if (!nextOpen) {
      setSearch("");
      setAppliedSearch("");
    }
  }

  function select(next: string) {
    changeOpen(false);
    onChange(next);
  }

  return <div className="w-full space-y-1.5 md:w-80">
    <Label className="ml-1 text-xs font-semibold text-muted-foreground">Profissional</Label>
    <Popover open={open} onOpenChange={changeOpen}>
      <PopoverTrigger asChild>
        <Button type="button" variant="outline" role="combobox" aria-expanded={open} aria-label={`Profissional · ${selectedName}`}
          className="h-11 w-full justify-between gap-2 text-sm font-medium">
          <span className="truncate text-left" title={selectedName}>{selectedName}</span>
          <ChevronDown className="h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[var(--radix-popover-trigger-width)] p-0" align="start">
        <Command shouldFilter={false}>
          <CommandInput placeholder="Buscar profissional, profissão ou conselho…" value={search} onValueChange={setSearch} />
          <CommandList className="max-h-[350px]">
            <CommandEmpty>Nenhum profissional encontrado.</CommandEmpty>
            {!appliedSearch && <CommandGroup>
              <CommandItem value="all" onSelect={select} className={cn("justify-between", value === "all" && "bg-primary/10")}>
                Todos os profissionais
                {value === "all" && <Check aria-label="Selecionado" className="h-4 w-4 text-primary" />}
              </CommandItem>
            </CommandGroup>}
            {matches.map(([category, entries]) => <CommandGroup key={category} heading={category}>
              {entries.map(entry => <CommandItem key={entry.id} value={entry.id} onSelect={select}
                keywords={[entry.name, entry.subtitle]} className={cn("items-center justify-between gap-2 py-2.5", value === entry.id && "bg-primary/10")}>
                <div className="min-w-0">
                  <p className="break-words font-medium">{entry.name}</p>
                  {entry.subtitle && <p className="break-words text-xs text-muted-foreground">{entry.subtitle}</p>}
                </div>
                {value === entry.id && <Check aria-label="Selecionado" className="h-4 w-4 shrink-0 text-primary" />}
              </CommandItem>)}
            </CommandGroup>)}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  </div>;
});
