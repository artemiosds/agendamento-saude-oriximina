import React, { useEffect, useMemo, useRef, useState } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Plus } from "lucide-react";

interface AlergiaOpcao {
  nome: string;
  grupo: string;
}

/**
 * Catálogo local das alergias mais comuns na rotina do SUS (padrão e-SUS/PEC),
 * organizado nos 4 grupos clássicos: Medicamentos, Alimentos, Ambientais e Outros.
 * Roda 100% em memória — leve, sem consulta ao banco e sem licenças externas.
 */
const CATALOGO_ALERGIAS: AlergiaOpcao[] = [
  // Medicamentos
  { nome: "Dipirona (Metamizol)", grupo: "Medicamento" },
  { nome: "Penicilina", grupo: "Medicamento" },
  { nome: "Amoxicilina", grupo: "Medicamento" },
  { nome: "Ampicilina", grupo: "Medicamento" },
  { nome: "Cefalosporinas", grupo: "Medicamento" },
  { nome: "Sulfas (Sulfametoxazol)", grupo: "Medicamento" },
  { nome: "AAS (Ácido Acetilsalicílico)", grupo: "Medicamento" },
  { nome: "Anti-inflamatórios (AINEs)", grupo: "Medicamento" },
  { nome: "Ibuprofeno", grupo: "Medicamento" },
  { nome: "Diclofenaco", grupo: "Medicamento" },
  { nome: "Nimesulida", grupo: "Medicamento" },
  { nome: "Paracetamol", grupo: "Medicamento" },
  { nome: "Contraste iodado", grupo: "Medicamento" },
  { nome: "Anestésicos locais (Lidocaína)", grupo: "Medicamento" },
  { nome: "Insulina", grupo: "Medicamento" },
  { nome: "Anticonvulsivantes (Fenitoína/Carbamazepina)", grupo: "Medicamento" },
  { nome: "Alopurinol", grupo: "Medicamento" },
  // Alimentos
  { nome: "Leite (proteína do leite de vaca)", grupo: "Alimento" },
  { nome: "Ovo", grupo: "Alimento" },
  { nome: "Amendoim", grupo: "Alimento" },
  { nome: "Castanhas e nozes", grupo: "Alimento" },
  { nome: "Frutos do mar", grupo: "Alimento" },
  { nome: "Peixe", grupo: "Alimento" },
  { nome: "Camarão", grupo: "Alimento" },
  { nome: "Soja", grupo: "Alimento" },
  { nome: "Trigo / Glúten", grupo: "Alimento" },
  { nome: "Chocolate", grupo: "Alimento" },
  { nome: "Morango", grupo: "Alimento" },
  // Ambientais
  { nome: "Poeira (ácaros)", grupo: "Ambiental" },
  { nome: "Pólen", grupo: "Ambiental" },
  { nome: "Pelo de animal (gato/cão)", grupo: "Ambiental" },
  { nome: "Mofo / fungos", grupo: "Ambiental" },
  { nome: "Picada de inseto (abelha/vespa)", grupo: "Ambiental" },
  // Outros
  { nome: "Látex", grupo: "Outro" },
  { nome: "Iodo", grupo: "Outro" },
  { nome: "Perfumes / cosméticos", grupo: "Outro" },
  { nome: "Protetor solar", grupo: "Outro" },
];

const normalizar = (s: string) =>
  s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/\s+/g, " ").trim();

interface Props {
  onAdd: (texto: string) => void;
}

/** Busca com sugestões do catálogo de alergias comuns + digitação livre (Enter ou +). */
const AlergiaBusca: React.FC<Props> = ({ onAdd }) => {
  const [texto, setTexto] = useState("");
  const [termo, setTermo] = useState("");
  const [aberto, setAberto] = useState(false);
  const boxRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const t = setTimeout(() => setTermo(texto), 150);
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
    return CATALOGO_ALERGIAS.filter((a) => {
      const alvo = normalizar(`${a.nome} ${a.grupo}`);
      return tokens.every((t) => alvo.includes(t));
    }).slice(0, 10);
  }, [termo]);

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
          placeholder="Buscar alergia (ex.: dipirona, penicilina, frutos do mar)"
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              adicionar(texto);
            } else if (e.key === "Escape") setAberto(false);
          }}
        />
        <Button type="button" variant="outline" size="icon" onClick={() => adicionar(texto)} aria-label="Adicionar alergia">
          <Plus className="h-4 w-4" />
        </Button>
      </div>
      {aberto && sugestoes.length > 0 && (
        <ul className="absolute z-50 mt-1 max-h-56 w-full overflow-y-auto rounded-md border bg-popover p-1 shadow-md">
          {sugestoes.map((a) => (
            <li key={a.nome}>
              <button
                type="button"
                className="flex w-full items-center justify-between rounded px-2 py-1.5 text-left text-sm hover:bg-accent"
                onClick={() => adicionar(a.nome)}
              >
                <span className="font-medium">{a.nome}</span>
                <span className="text-[11px] text-muted-foreground">{a.grupo}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
      <p className="mt-1 text-[10px] text-muted-foreground">
        Escolha uma sugestão ou digite livremente e pressione Enter.
      </p>
    </div>
  );
};

export default AlergiaBusca;
