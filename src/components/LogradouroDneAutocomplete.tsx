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
  { codigo: "001", descricao: "Acesso" },
  { codigo: "002", descricao: "Adro" },
  { codigo: "004", descricao: "Alameda", abreviacao: "Al" },
  { codigo: "007", descricao: "Atalho" },
  { codigo: "008", descricao: "Avenida", abreviacao: "Av" },
  { codigo: "009", descricao: "Balneário" },
  { codigo: "010", descricao: "Belvedere" },
  { codigo: "011", descricao: "Beco", abreviacao: "Bc" },
  { codigo: "012", descricao: "Bloco" },
  { codigo: "013", descricao: "Bosque" },
  { codigo: "014", descricao: "Boulevard", abreviacao: "Blv" },
  { codigo: "015", descricao: "Baixa" },
  { codigo: "016", descricao: "Cais" },
  { codigo: "017", descricao: "Caminho" },
  { codigo: "019", descricao: "Chapadão" },
  { codigo: "020", descricao: "Conjunto", abreviacao: "Conj" },
  { codigo: "021", descricao: "Colônia" },
  { codigo: "022", descricao: "Corredor" },
  { codigo: "023", descricao: "Campo" },
  { codigo: "024", descricao: "Córrego" },
  { codigo: "027", descricao: "Desvio" },
  { codigo: "028", descricao: "Distrito" },
  { codigo: "030", descricao: "Escada" },
  { codigo: "031", descricao: "Estrada", abreviacao: "Est" },
  { codigo: "032", descricao: "Estação" },
  { codigo: "033", descricao: "Estádio" },
  { codigo: "036", descricao: "Favela" },
  { codigo: "037", descricao: "Fazenda" },
  { codigo: "038", descricao: "Ferrovia" },
  { codigo: "039", descricao: "Fonte" },
  { codigo: "040", descricao: "Feira" },
  { codigo: "043", descricao: "Forte" },
  { codigo: "045", descricao: "Galeria" },
  { codigo: "046", descricao: "Granja" },
  { codigo: "050", descricao: "Ilha" },
  { codigo: "052", descricao: "Jardim", abreviacao: "Jd" },
  { codigo: "053", descricao: "Ladeira", abreviacao: "Lad" },
  { codigo: "054", descricao: "Largo", abreviacao: "Lg" },
  { codigo: "055", descricao: "Lagoa" },
  { codigo: "056", descricao: "Loteamento" },
  { codigo: "059", descricao: "Morro" },
  { codigo: "060", descricao: "Monte" },
  { codigo: "062", descricao: "Paralela" },
  { codigo: "063", descricao: "Passeio" },
  { codigo: "064", descricao: "Pátio" },
  { codigo: "065", descricao: "Praça", abreviacao: "Pç" },
  { codigo: "067", descricao: "Parada" },
  { codigo: "070", descricao: "Praia" },
  { codigo: "071", descricao: "Prolongamento" },
  { codigo: "072", descricao: "Parque" },
  { codigo: "073", descricao: "Passarela" },
  { codigo: "074", descricao: "Passagem", abreviacao: "Pas" },
  { codigo: "076", descricao: "Ponte" },
  { codigo: "077", descricao: "Quadra", abreviacao: "Qd" },
  { codigo: "079", descricao: "Quinta" },
  { codigo: "081", descricao: "Rua", abreviacao: "R" },
  { codigo: "082", descricao: "Ramal" },
  { codigo: "087", descricao: "Recanto" },
  { codigo: "088", descricao: "Retiro" },
  { codigo: "089", descricao: "Reta" },
  { codigo: "090", descricao: "Rodovia", abreviacao: "Rod" },
  { codigo: "091", descricao: "Retorno" },
  { codigo: "092", descricao: "Sítio" },
  { codigo: "094", descricao: "Servidão" },
  { codigo: "095", descricao: "Setor" },
  { codigo: "096", descricao: "Subida" },
  { codigo: "097", descricao: "Trincheira" },
  { codigo: "098", descricao: "Terminal" },
  { codigo: "099", descricao: "Trevo" },
  { codigo: "100", descricao: "Travessa", abreviacao: "Tv" },
  { codigo: "101", descricao: "Via" },
  { codigo: "103", descricao: "Viaduto" },
  { codigo: "104", descricao: "Vila" },
  { codigo: "105", descricao: "Viela" },
  { codigo: "106", descricao: "Vale" },
  { codigo: "108", descricao: "Zigue-zague" },
  { codigo: "452", descricao: "Trecho" },
  { codigo: "453", descricao: "Vereda" },
  { codigo: "465", descricao: "Artéria" },
  { codigo: "468", descricao: "Elevada" },
  { codigo: "469", descricao: "Porto" },
  { codigo: "470", descricao: "Balão" },
  { codigo: "471", descricao: "Paradouro" },
  { codigo: "472", descricao: "Área" },
  { codigo: "473", descricao: "Jardinete" },
  { codigo: "474", descricao: "Esplanada" },
  { codigo: "475", descricao: "Quintas" },
  { codigo: "476", descricao: "Rótula" },
  { codigo: "477", descricao: "Marina" },
  { codigo: "478", descricao: "Descida" },
  { codigo: "479", descricao: "Circular" },
  { codigo: "480", descricao: "Unidade" },
  { codigo: "481", descricao: "Chácara" },
  { codigo: "482", descricao: "Rampa" },
  { codigo: "483", descricao: "Ponta" },
  { codigo: "484", descricao: "Via de Pedestre" },
  { codigo: "485", descricao: "Condomínio" },
  { codigo: "486", descricao: "Habitacional" },
  { codigo: "487", descricao: "Residencial" },
  { codigo: "495", descricao: "Canal" },
  { codigo: "496", descricao: "Buraco" },
  { codigo: "497", descricao: "Módulo" },
  { codigo: "498", descricao: "Estância" },
  { codigo: "499", descricao: "Lago" },
  { codigo: "500", descricao: "Núcleo" },
  { codigo: "501", descricao: "Aeroporto" },
  { codigo: "502", descricao: "Passagem Subterrânea" },
  { codigo: "503", descricao: "Complexo Viário" },
  { codigo: "504", descricao: "Praça de Esportes" },
  { codigo: "505", descricao: "Via Elevada" },
  { codigo: "506", descricao: "Rotatória" },
  { codigo: "564", descricao: "Estacionamento" },
  { codigo: "565", descricao: "Vala" },
  { codigo: "566", descricao: "Rua de Pedestre" },
  { codigo: "567", descricao: "Túnel" },
  { codigo: "568", descricao: "Variante" },
  { codigo: "569", descricao: "Rodo Anel" },
  { codigo: "570", descricao: "Travessa Particular" },
  { codigo: "571", descricao: "Calçada" },
  { codigo: "572", descricao: "Via de Acesso" },
  { codigo: "573", descricao: "Entrada Particular" },
  { codigo: "645", descricao: "Acampamento" },
  { codigo: "646", descricao: "Via Expressa" },
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
