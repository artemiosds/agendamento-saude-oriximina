import React, { useEffect, useMemo, useState } from "react";
import { Search, Check, Loader2 } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";

interface LogradouroDne {
  codigo: string;
  descricao: string;
}

interface Props {
  value?: string; // descricao selecionada (uppercase)
  codigo?: string; // codigo DNE selecionado
  onChange: (descricao: string, codigo: string) => void;
  required?: boolean;
  placeholder?: string;
}

// Normaliza para busca sem acentos
const normalize = (s: string) =>
  (s || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();

let cache: LogradouroDne[] | null = null;

export default function LogradouroDneAutocomplete({
  value,
  codigo,
  onChange,
  required,
  placeholder = "Pesquisar tipo de logradouro...",
}: Props) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [items, setItems] = useState<LogradouroDne[]>(cache || []);
  const [loading, setLoading] = useState(!cache);

  useEffect(() => {
    if (cache) return;
    let active = true;
    (async () => {
      const { data, error } = await supabase
        .from("logradouros_dne")
        .select("codigo, descricao")
        .order("descricao", { ascending: true });
      if (!active) return;
      if (!error && data) {
        cache = data as LogradouroDne[];
        setItems(cache);
      }
      setLoading(false);
    })();
    return () => {
      active = false;
    };
  }, []);

  const filtered = useMemo(() => {
    const q = normalize(search.trim());
    if (!q) return items.slice(0, 100);
    return items
      .filter(
        (i) => normalize(i.descricao).includes(q) || i.codigo.includes(q),
      )
      .slice(0, 100);
  }, [items, search]);

  const displayLabel = value
    ? codigo
      ? `${codigo} — ${value}`
      : value
    : "";

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className={cn(
            "w-full justify-between font-normal",
            !value && "text-muted-foreground",
          )}
        >
          <span className="flex items-center gap-2 truncate">
            <Search className="w-4 h-4 shrink-0 opacity-50" />
            <span className="truncate">{displayLabel || placeholder}</span>
          </span>
          {required && !value && (
            <span className="text-destructive text-xs ml-2">*</span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent
        className="p-0 w-[--radix-popover-trigger-width] max-h-[320px] overflow-hidden"
        align="start"
      >
        <div className="p-2 border-b bg-background sticky top-0">
          <Input
            autoFocus
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Digite para pesquisar (ex.: RUA, AV, 081)"
            className="h-9"
          />
        </div>
        <div className="max-h-[260px] overflow-y-auto">
          {loading ? (
            <div className="flex items-center justify-center py-6 text-muted-foreground text-sm gap-2">
              <Loader2 className="w-4 h-4 animate-spin" /> Carregando DNE...
            </div>
          ) : filtered.length === 0 ? (
            <div className="py-6 text-center text-sm text-muted-foreground">
              Nenhum resultado encontrado
            </div>
          ) : (
            filtered.map((item) => {
              const selected = value === item.descricao;
              return (
                <button
                  type="button"
                  key={item.codigo}
                  onClick={() => {
                    onChange(item.descricao, item.codigo);
                    setOpen(false);
                    setSearch("");
                  }}
                  className={cn(
                    "w-full flex items-center gap-2 px-3 py-2 text-sm text-left hover:bg-accent hover:text-accent-foreground transition-colors",
                    selected && "bg-accent/50",
                  )}
                >
                  <Check
                    className={cn(
                      "w-4 h-4 shrink-0",
                      selected ? "opacity-100" : "opacity-0",
                    )}
                  />
                  <span className="font-mono text-xs text-muted-foreground w-10 shrink-0">
                    {item.codigo}
                  </span>
                  <span className="flex-1 truncate">{item.descricao}</span>
                </button>
              );
            })
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
