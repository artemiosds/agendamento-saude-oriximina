import React, { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Plus } from "lucide-react";

interface MedOpcao {
  id: string;
  nome: string;
  nome_comercial: string | null;
  principio_ativo: string | null;
  concentracao: string | null;
  forma_farmaceutica: string | null;
  origem: string | null;
}

const normalizar = (s: string) =>
  s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/\s+/g, " ").trim();

let cache: MedOpcao[] | null = null;

export const rotuloMedicamento = (m: MedOpcao) =>
  [m.nome, m.concentracao, m.forma_farmaceutica].filter(Boolean).join(" ");

interface Props {
  onAdd: (texto: string) => void;
}

/** Busca livre por nome/princípio ativo/dosagem nos medicamentos RENAME/REME importados. Aceita texto manual. */
const MedicamentoBusca: React.FC<Props> = ({ onAdd }) => {
  const [texto, setTexto] = useState("");
  const [termo, setTermo] = useState("");
  const [lista, setLista] = useState<MedOpcao[]>(cache ?? []);
  const [aberto, setAberto] = useState(false);
  const boxRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (cache) return;
    supabase
      .from("medications")
      .select("id,nome,nome_comercial,principio_ativo,concentracao,forma_farmaceutica,origem")
      .eq("ativo", true)
      .in("origem", ["rename", "reme"])
      .order("nome")
      .then(({ data }) => {
        cache = (data as MedOpcao[]) || [];
        setLista(cache);
      });
  }, []);

  useEffect(() => {
    const t = setTimeout(() => setTermo(texto), 200);
    return () => clearTimeout(t);
  }, [texto]);

  useEffect(() => {
    const fechar = (e: MouseEvent) => {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setAberto(false);
    };
    document.addEventListener("mousedown", fechar);
    return () => document.removeEventListener("mousedown", fechar);
  }, []);

  const sugestoes = useMemo(() => {
    const tokens = normalizar(termo).split(" ").filter(Boolean);
    if (tokens.length === 0) return [];
    return lista
      .filter((m) => {
        const alvo = normalizar(
          [m.nome, m.nome_comercial, m.principio_ativo, m.concentracao, m.forma_farmaceutica].filter(Boolean).join(" ")
        );
        return tokens.every((t) => alvo.includes(t));
      })
      .slice(0, 12);
  }, [termo, lista]);

  const adicionar = (valor: string) => {
    const v = valor.trim();
    if (!v) return;
    onAdd(v);
    setTexto("");
    setTermo("");
    setAberto(false);
  };

  return (
    <div ref={boxRef} className="relative mt-1">
      <div className="flex gap-2">
        <Input
          value={texto}
          onChange={(e) => {
            setTexto(e.target.value);
            setAberto(true);
          }}
          onFocus={() => setAberto(true)}
          placeholder="Buscar por nome, princípio ativo ou dose (ex.: losartana 50)"
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              adicionar(texto);
            } else if (e.key === "Escape") setAberto(false);
          }}
        />
        <Button type="button" variant="outline" size="icon" onClick={() => adicionar(texto)} aria-label="Adicionar medicamento">
          <Plus className="h-4 w-4" />
        </Button>
      </div>
      {aberto && sugestoes.length > 0 && (
        <ul className="absolute z-50 mt-1 max-h-60 w-full overflow-y-auto rounded-md border bg-popover p-1 shadow-md">
          {sugestoes.map((m) => (
            <li key={m.id}>
              <button
                type="button"
                className="flex w-full flex-col items-start rounded px-2 py-1.5 text-left text-sm hover:bg-accent"
                onClick={() => adicionar(rotuloMedicamento(m))}
              >
                <span className="font-medium">
                  {m.nome} {m.concentracao && <span className="text-primary">{m.concentracao}</span>}
                </span>
                <span className="text-[11px] text-muted-foreground">
                  {[m.forma_farmaceutica, m.nome_comercial, m.origem?.toUpperCase()].filter(Boolean).join(" · ")}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
      <p className="mt-1 text-[10px] text-muted-foreground">
        Escolha uma sugestão RENAME/REME ou digite livremente e pressione Enter.
      </p>
    </div>
  );
};

export default MedicamentoBusca;
