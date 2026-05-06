import React, { useEffect, useMemo, useState } from "react";
import { Check, ChevronsUpDown, Plus, Search, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

// Static catalog (always available — covers reabilitação, médicas, odonto, exames, outros)
const STATIC_CATALOG: Record<string, string[]> = {
  "Reabilitação / CER": [
    "Fisioterapia", "Fisioterapia Motora", "Fisioterapia Neurológica", "Fisioterapia Respiratória",
    "Terapia Ocupacional", "Fonoaudiologia", "Psicologia", "Neuropsicologia",
    "Serviço Social", "Enfermagem", "Avaliação Multiprofissional",
    "Estimulação Precoce", "Reabilitação Física", "Reabilitação Intelectual",
    "Reabilitação Auditiva", "Reabilitação Visual",
  ],
  "Especialidades Médicas": [
    "Clínica Geral", "Medicina de Família e Comunidade", "Pediatria", "Neurologia", "Neuropediatria",
    "Ortopedia", "Traumatologia", "Psiquiatria", "Geriatria", "Ginecologia", "Obstetrícia",
    "Cardiologia", "Endocrinologia", "Pneumologia", "Gastroenterologia", "Dermatologia",
    "Oftalmologia", "Otorrinolaringologia", "Urologia", "Nefrologia", "Reumatologia",
    "Infectologia", "Hematologia", "Oncologia", "Cirurgia Geral", "Cirurgia Vascular", "Cirurgia Pediátrica",
  ],
  "Saúde Bucal": [
    "Odontologia", "Odontopediatria", "Cirurgia Bucomaxilofacial", "Periodontia", "Endodontia", "Prótese Dentária",
  ],
  "Exames / Avaliações": [
    "Audiometria", "Imitanciometria", "BERA / PEATE", "Exame Oftalmológico",
    "Avaliação Funcional", "Avaliação Postural", "Avaliação de Marcha",
    "Avaliação de Linguagem", "Avaliação Psicológica", "Avaliação Cognitiva",
  ],
  "Outras Áreas": [
    "Nutrição", "Farmácia", "Educação Física", "Assistência Social", "Saúde Mental",
    "CAPS", "Regulação", "UBS", "Especialidade Externa", "Outro",
  ],
};

interface DbEspecialidade { id: string; nome: string; ativo: boolean; }

interface Props {
  value: string; // stores nome (text) for backward compatibility
  onChange: (nome: string) => void;
  placeholder?: string;
  className?: string;
}

const norm = (s: string) =>
  (s || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();

export const EspecialidadeDestinoCombobox: React.FC<Props> = ({ value, onChange, placeholder = "Selecione a especialidade", className }) => {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [dbItems, setDbItems] = useState<DbEspecialidade[]>([]);
  const [adding, setAdding] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data } = await supabase
        .from("especialidades")
        .select("id, nome, ativo")
        .eq("ativo", true)
        .order("nome");
      if (!cancelled && data) setDbItems(data as any);
    })();
    return () => { cancelled = true; };
  }, []);

  const groups = useMemo(() => {
    const dbNames = dbItems.map(d => d.nome);
    const seen = new Set<string>();
    const result: { label: string; items: string[] }[] = [];

    // Add DB group first if any extras
    const staticAll = new Set(Object.values(STATIC_CATALOG).flat().map(norm));
    const customDb = dbNames.filter(n => !staticAll.has(norm(n)));
    if (customDb.length) {
      result.push({ label: "Cadastradas (Sistema)", items: customDb });
      customDb.forEach(n => seen.add(norm(n)));
    }

    for (const [label, items] of Object.entries(STATIC_CATALOG)) {
      const filtered = items.filter(i => !seen.has(norm(i)));
      filtered.forEach(i => seen.add(norm(i)));
      if (filtered.length) result.push({ label, items: filtered });
    }
    return result;
  }, [dbItems]);

  const filteredGroups = useMemo(() => {
    const q = norm(search);
    if (!q) return groups;
    return groups
      .map(g => ({ ...g, items: g.items.filter(i => norm(i).includes(q)) }))
      .filter(g => g.items.length > 0);
  }, [groups, search]);

  const exactMatch = useMemo(() => {
    const q = norm(search);
    if (!q) return true;
    return groups.some(g => g.items.some(i => norm(i) === q));
  }, [groups, search]);

  const handleSelect = (nome: string) => {
    onChange(nome);
    setOpen(false);
    setSearch("");
  };

  const handleAddCustom = async () => {
    const nome = search.trim();
    if (!nome) return;
    setAdding(true);
    try {
      // try to persist to especialidades; if fails (RLS), still use locally
      const { data, error } = await supabase
        .from("especialidades")
        .insert({ nome, ativo: true } as any)
        .select("id, nome, ativo")
        .single();
      if (!error && data) {
        setDbItems(prev => [...prev, data as any]);
        toast.success("Especialidade adicionada");
      } else {
        toast.message("Especialidade aplicada (somente neste encaminhamento)");
      }
      handleSelect(nome);
    } catch {
      toast.message("Especialidade aplicada (somente neste encaminhamento)");
      handleSelect(nome);
    } finally {
      setAdding(false);
    }
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className={cn("w-full justify-between font-normal", !value && "text-muted-foreground", className)}
        >
          <span className="truncate flex items-center gap-2">
            <Search className="w-3.5 h-3.5 opacity-60" />
            {value || placeholder}
          </span>
          <span className="flex items-center gap-1">
            {value && (
              <X
                className="w-3.5 h-3.5 opacity-60 hover:opacity-100"
                onClick={(e) => { e.stopPropagation(); onChange(""); }}
              />
            )}
            <ChevronsUpDown className="w-3.5 h-3.5 opacity-50" />
          </span>
        </Button>
      </PopoverTrigger>
      <PopoverContent className="p-0 w-[--radix-popover-trigger-width] min-w-[280px]" align="start">
        <Command shouldFilter={false}>
          <CommandInput placeholder="Buscar especialidade..." value={search} onValueChange={setSearch} />
          <CommandList className="max-h-[320px]">
            <CommandEmpty>
              <div className="p-2 text-sm text-muted-foreground">
                Nenhuma encontrada.
                {search.trim() && (
                  <Button type="button" size="sm" variant="ghost" className="mt-1 w-full gap-1" onClick={handleAddCustom} disabled={adding}>
                    <Plus className="w-3.5 h-3.5" /> Adicionar "{search.trim()}"
                  </Button>
                )}
              </div>
            </CommandEmpty>
            {filteredGroups.map(g => (
              <CommandGroup key={g.label} heading={g.label}>
                {g.items.map(item => (
                  <CommandItem key={item} value={item} onSelect={() => handleSelect(item)}>
                    <Check className={cn("mr-2 h-4 w-4", value === item ? "opacity-100" : "opacity-0")} />
                    {item}
                  </CommandItem>
                ))}
              </CommandGroup>
            ))}
            {search.trim() && !exactMatch && filteredGroups.length > 0 && (
              <CommandGroup heading="Personalizada">
                <CommandItem onSelect={handleAddCustom} disabled={adding}>
                  <Plus className="mr-2 h-4 w-4" /> Adicionar "{search.trim()}"
                </CommandItem>
              </CommandGroup>
            )}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
};

export default EspecialidadeDestinoCombobox;
