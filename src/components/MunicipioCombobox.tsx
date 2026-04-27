import { useEffect, useMemo, useRef, useState } from "react";
import { Check, ChevronsUpDown, Search, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";

export interface MunicipioItem {
  n: string; // nome
  u: string; // UF
}

interface MunicipioComboboxProps {
  /** Valor exibido. Formato preferido: "Cidade - UF". */
  value?: string;
  uf?: string;
  onChange: (cidade: string, uf: string) => void;
  placeholder?: string;
  disabled?: boolean;
  className?: string;
  id?: string;
}

let _cache: MunicipioItem[] | null = null;
async function loadMunicipios(): Promise<MunicipioItem[]> {
  if (_cache) return _cache;
  const mod = await import("@/data/municipiosIbge.json");
  _cache = (mod.default as MunicipioItem[]) || [];
  return _cache;
}

/**
 * Combobox de municípios brasileiros (IBGE, 5570+) com busca por nome ou UF.
 * Carrega a lista sob demanda (lazy) e renderiza no máximo 200 itens por vez
 * para evitar travamento.
 */
export function MunicipioCombobox({
  value,
  uf,
  onChange,
  placeholder = "Selecione o município",
  disabled,
  className,
  id,
}: MunicipioComboboxProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [items, setItems] = useState<MunicipioItem[]>([]);
  const [loading, setLoading] = useState(false);
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (!open || items.length > 0) return;
    setLoading(true);
    loadMunicipios()
      .then((data) => setItems(data))
      .finally(() => setLoading(false));
  }, [open, items.length]);

  useEffect(() => {
    if (open) {
      setTimeout(() => inputRef.current?.focus(), 50);
    } else {
      setQuery("");
    }
  }, [open]);

  const filtered = useMemo(() => {
    if (!items.length) return [];
    const q = query.trim().toLowerCase();
    if (!q) return items.slice(0, 200);
    const norm = (s: string) =>
      s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
    const nq = norm(q);
    const result: MunicipioItem[] = [];
    for (const it of items) {
      if (norm(it.n).includes(nq) || it.u.toLowerCase().includes(nq)) {
        result.push(it);
        if (result.length >= 200) break;
      }
    }
    return result;
  }, [items, query]);

  const display = value
    ? (uf && !value.includes(" - ") ? `${value} - ${uf}` : value)
    : "";

  return (
    <Popover open={open} onOpenChange={(o) => !disabled && setOpen(o)}>
      <PopoverTrigger asChild>
        <Button
          id={id}
          type="button"
          variant="outline"
          role="combobox"
          aria-expanded={open}
          disabled={disabled}
          className={cn(
            "w-full justify-between h-11 sm:h-10 font-normal text-base sm:text-sm",
            !display && "text-muted-foreground",
            className,
          )}
        >
          <span className="truncate">{display || placeholder}</span>
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        className="p-0 w-[--radix-popover-trigger-width] min-w-[280px]"
        align="start"
      >
        <div className="flex items-center gap-2 border-b px-3 py-2">
          <Search className="h-4 w-4 text-muted-foreground shrink-0" />
          <Input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Buscar por nome ou UF (ex: Orix, PA)…"
            className="h-8 border-0 shadow-none focus-visible:ring-0 px-0"
          />
          {query && (
            <button
              type="button"
              onClick={() => setQuery("")}
              className="text-muted-foreground hover:text-foreground"
              aria-label="Limpar"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
        <div className="max-h-72 overflow-y-auto py-1">
          {loading && items.length === 0 ? (
            <div className="px-3 py-6 text-center text-sm text-muted-foreground">
              Carregando municípios…
            </div>
          ) : filtered.length === 0 ? (
            <div className="px-3 py-6 text-center text-sm text-muted-foreground">
              Nenhum município encontrado.
            </div>
          ) : (
            filtered.map((it) => {
              const label = `${it.n} - ${it.u}`;
              const selected = display === label;
              return (
                <button
                  key={`${it.n}-${it.u}`}
                  type="button"
                  onClick={() => {
                    onChange(it.n, it.u);
                    setOpen(false);
                  }}
                  className={cn(
                    "w-full text-left px-3 py-2 text-sm hover:bg-accent flex items-center gap-2",
                    selected && "bg-accent/60",
                  )}
                >
                  <Check
                    className={cn(
                      "h-4 w-4 shrink-0",
                      selected ? "opacity-100" : "opacity-0",
                    )}
                  />
                  <span className="truncate">{label}</span>
                </button>
              );
            })
          )}
          {!loading && query.trim() && filtered.length === 200 && (
            <div className="px-3 py-2 text-[11px] text-muted-foreground text-center border-t">
              Refine a busca para ver mais resultados.
            </div>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}

export default MunicipioCombobox;
