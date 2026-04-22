import React, { useMemo, useState, useEffect } from "react";
import { Search, Check } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface LogradouroDne {
  codigo: string;
  descricao: string;
  abreviacao?: string;
  aliases?: string[];
}

interface Props {
  value?: string; // descricao selecionada (ex.: "Rua")
  codigo?: string; // codigo DNE selecionado (ex.: "081")
  onChange: (descricao: string, codigo: string) => void;
  required?: boolean;
  placeholder?: string;
}

// Lista padronizada DNE (apenas tipos mais utilizados, alinhada com BPA/e-SUS)
// Formato salvo no banco: codigo (ex.: "081") + descricao (ex.: "Rua")
const TIPOS_LOGRADOURO_DNE: LogradouroDne[] = [
  { codigo: "081", descricao: "Rua", abreviacao: "R", aliases: ["rua", "r"] },
  { codigo: "008", descricao: "Avenida", abreviacao: "Av", aliases: ["avenida", "av", "ave"] },
  { codigo: "100", descricao: "Travessa", abreviacao: "Tv", aliases: ["travessa", "tv", "trav"] },
  { codigo: "011", descricao: "Beco", abreviacao: "Bc", aliases: ["beco", "bc"] },
  { codigo: "082", descricao: "Ramal", aliases: ["ramal"] },
  { codigo: "107", descricao: "Via", aliases: ["via"] },
  { codigo: "109", descricao: "Viela", aliases: ["viela"] },
  { codigo: "035", descricao: "Estrada", abreviacao: "Est", aliases: ["estrada", "est"] },
  { codigo: "072", descricao: "Rodovia", abreviacao: "Rod", aliases: ["rodovia", "rod"] },
  { codigo: "049", descricao: "Largo", aliases: ["largo"] },
  { codigo: "063", descricao: "Praça", abreviacao: "Pç", aliases: ["praca", "praça", "pc", "pç"] },
  { codigo: "028", descricao: "Conjunto", abreviacao: "Conj", aliases: ["conjunto", "conj"] },
  { codigo: "026", descricao: "Condomínio", abreviacao: "Cond", aliases: ["condominio", "condomínio", "cond"] },
];

const normalize = (s: string) =>
  (s || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();

// Resolve um valor legado para a entrada DNE oficial (caso descrição venha em UPPERCASE ou abreviada)
function resolveItem(value?: string, codigo?: string): LogradouroDne | undefined {
  if (codigo) {
    const byCode = TIPOS_LOGRADOURO_DNE.find((i) => i.codigo === codigo);
    if (byCode) return byCode;
  }
  if (value) {
    const v = normalize(value);
    return TIPOS_LOGRADOURO_DNE.find(
      (i) =>
        normalize(i.descricao) === v ||
        normalize(i.abreviacao || "") === v ||
        (i.aliases || []).includes(v),
    );
  }
  return undefined;
}

export default function LogradouroDneAutocomplete({
  value,
  codigo,
  onChange,
  required,
  placeholder = "Selecionar tipo de logradouro...",
}: Props) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");

  // Auto-corrige valores legados (ex.: descrição em UPPERCASE) para o padrão DNE
  const resolved = useMemo(() => resolveItem(value, codigo), [value, codigo]);

  useEffect(() => {
    if (!resolved) return;
    if (resolved.descricao !== value || resolved.codigo !== codigo) {
      onChange(resolved.descricao, resolved.codigo);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resolved?.codigo]);

  const filtered = useMemo(() => {
    const q = normalize(search);
    if (!q) return TIPOS_LOGRADOURO_DNE;
    return TIPOS_LOGRADOURO_DNE.filter(
      (i) =>
        normalize(i.descricao).includes(q) ||
        normalize(i.abreviacao || "").includes(q) ||
        i.codigo.includes(q) ||
        (i.aliases || []).some((a) => a.includes(q)),
    );
  }, [search]);

  const displayLabel = resolved
    ? `${resolved.codigo} — ${resolved.descricao}`
    : value
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
            !resolved && !value && "text-muted-foreground",
          )}
        >
          <span className="flex items-center gap-2 truncate">
            <Search className="w-4 h-4 shrink-0 opacity-50" />
            <span className="truncate">{displayLabel || placeholder}</span>
          </span>
          {required && !resolved && (
            <span className="text-destructive text-xs ml-2">*</span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent
        className="p-0 w-[--radix-popover-trigger-width] max-h-[360px] overflow-hidden"
        align="start"
      >
        <div className="p-2 border-b bg-background">
          <Input
            autoFocus
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Pesquisar (ex.: rua, av, travessa, 081)"
            className="h-9"
          />
        </div>
        <div className="max-h-[300px] overflow-y-auto">
          {filtered.length === 0 ? (
            <div className="py-6 text-center text-sm text-muted-foreground">
              Nenhum resultado encontrado
            </div>
          ) : (
            filtered.map((item) => {
              const selected = resolved?.codigo === item.codigo;
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
                  <span className="flex-1 truncate">
                    {item.descricao}
                    {item.abreviacao && (
                      <span className="text-muted-foreground ml-1">({item.abreviacao})</span>
                    )}
                  </span>
                </button>
              );
            })
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
