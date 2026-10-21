import { useEffect, useMemo, useRef, useState } from "react";
import { Loader2 } from "lucide-react";
import { Input } from "@/components/ui/input";
import { buscarCepsPorEndereco, cepDigits, sanitizeUpper, type EnderecoPaciente } from "@/lib/enderecoPaciente";
import { getMunicipioEndereco } from "@/lib/municipiosIbge";

interface Props {
  value: string;
  municipio: string;
  uf: string;
  cep: string;
  placeholder?: string;
  onChange: (value: string) => void;
  onSelect: (address: EnderecoPaciente) => void;
}
interface SearchState { key: string; status: "idle" | "loading" | "done" | "error"; rows: EnderecoPaciente[] }
const EMPTY: SearchState = { key: "", status: "idle", rows: [] };

/** Rede/resultados ficam neste componente, sem atualizar o formulário pai. */
export default function BuscaCepPorRua({ value, municipio, uf, cep, onChange, onSelect, placeholder }: Props) {
  const [active, setActive] = useState(false);
  const [search, setSearch] = useState<SearchState>(EMPTY);
  const [retry, setRetry] = useState(0);
  const info = useMemo(() => getMunicipioEndereco(municipio, uf), [municipio, uf]);
  const street = value.trim().replace(/\s+/g, " ");
  const locality = info?.ibge || "";
  const previousLocality = useRef(locality);
  useEffect(() => {
    if (previousLocality.current !== locality) setActive(true);
    previousLocality.current = locality;
  }, [locality]);
  const city = info?.nome || "";
  const state = info?.uf || "";
  const key = `${locality}|${sanitizeUpper(street)}`;
  const eligible = active && !!locality && !info?.cep && !cepDigits(cep) && street.length >= 3;
  useEffect(() => {
    if (!eligible) { setSearch(EMPTY); return; }
    const controller = new AbortController();
    let valid = true;
    const timer = setTimeout(async () => {
      setSearch({ key, status: "loading", rows: [] });
      try {
        const rows = await buscarCepsPorEndereco(state, city, street, controller.signal);
        if (valid && !controller.signal.aborted) setSearch({ key, status: "done", rows });
      } catch {
        if (valid && !controller.signal.aborted) setSearch({ key, status: "error", rows: [] });
      }
    }, 600);
    return () => { valid = false; clearTimeout(timer); controller.abort(); };
  }, [eligible, key, city, state, street, retry]);
  const visible = eligible && search.key === key;
  return (
    <div className="space-y-1.5">
      <Input value={value} placeholder={placeholder}
        onFocus={() => setActive(true)}
        onChange={e => { setActive(true); onChange(e.target.value); }} />
      {!!info && !info.cep && !cepDigits(cep) && (!active || street.length < 3) && (
        <p className="text-xs text-muted-foreground">Digite a rua (mínimo 3 letras) para buscar o CEP deste município.</p>
      )}
      {visible && search.status === "loading" && (
        <p role="status" className="flex items-center gap-1.5 text-xs text-[#2A6F97]">
          <Loader2 aria-hidden="true" className="h-3 w-3 animate-spin" />Buscando CEP pela rua…
        </p>
      )}
      {visible && search.status === "error" && (
        <div className="text-xs text-muted-foreground" role="status">
          Busca indisponível. Você pode continuar preenchendo manualmente.{" "}
          <button type="button" className="text-[#2A6F97] underline" onClick={() => setRetry(n => n + 1)}>Tentar novamente</button>
        </div>
      )}
      {visible && search.status === "done" && !search.rows.length && (
        <p role="status" className="text-xs text-muted-foreground">Nenhum CEP encontrado. Refine o nome da rua ou informe o CEP manualmente.</p>
      )}
      {visible && search.rows.length > 0 && (
        <div className="rounded-md border border-[#2A6F97]/25">
          <p className="px-2 py-1 text-xs text-[#2A6F97]">Selecione o endereço para preencher o CEP</p>
          <ul aria-label="Endereços encontrados" className="max-h-48 overflow-y-auto">
            {search.rows.map(row => {
              const code = `${row.cep.slice(0, 5)}-${row.cep.slice(5)}`;
              return <li key={`${row.cep}|${row.logradouro}|${row.bairro}`}>
                <button type="button" className="w-full px-2 py-2 text-left text-sm hover:bg-accent focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#2A6F97]"
                  onClick={() => { setActive(false); onSelect(row); }}>
                  <span className="font-medium">{code}</span>{" — "}{row.logradouro || row.municipio}
                  {row.bairro && <span className="block text-xs text-muted-foreground">{row.bairro}</span>}
                </button>
              </li>;
            })}
          </ul>
        </div>
      )}
    </div>
  );
}
