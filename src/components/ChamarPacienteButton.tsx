import { useEffect, useRef, useState } from "react";
import { Megaphone } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { solicitarChamada, getLocalSalvo, setLocalSalvo } from "@/lib/painelChamadas";
import { cn } from "@/lib/utils";

interface Props {
  unidadeId: string;
  pacienteNome: string;
  profissionalNome?: string;
  defaultLocal?: string;
  priorizarSalaPadrao?: boolean;
  className?: string;
}

export default function ChamarPacienteButton({ unidadeId, pacienteNome, profissionalNome, defaultLocal, priorizarSalaPadrao = false, className }: Props) {
  const [open, setOpen] = useState(false);
  const localInicial = () => (priorizarSalaPadrao && defaultLocal) ? defaultLocal : getLocalSalvo(unidadeId, defaultLocal) || defaultLocal || "";
  const [local, setLocal] = useState(localInicial);
  const [enviando, setEnviando] = useState(false);
  const [salas, setSalas] = useState<string[]>([]);
  const [chamadoEm, setChamadoEm] = useState<number | null>(null);
  const [carregandoSalas, setCarregandoSalas] = useState(false);
  const locked = useRef(false);
  const scope = `${unidadeId}|${defaultLocal || ''}|${pacienteNome}`;
  const scopeRef = useRef(scope); scopeRef.current = scope;
  useEffect(() => {
    setLocal(localInicial());
    setSalas([]); setChamadoEm(null);
  }, [unidadeId, defaultLocal, pacienteNome, priorizarSalaPadrao]);

  useEffect(() => {
    if (!open || !unidadeId) return;
    let active = true;
    setCarregandoSalas(true);
    supabase
      .from("salas")
      .select("nome")
      .eq("unidade_id", unidadeId)
      .eq("ativo", true)
      .order("nome")
      .then(({ data, error }) => {
        if (!active) return;
        setCarregandoSalas(false);
        if (error) { toast.warning('Não foi possível listar as salas. Informe o local manualmente.'); setSalas([]); return; }
        const names = [...new Set([...(data || []).map(s => String(s.nome || '').trim()).filter(Boolean), ...(defaultLocal ? [defaultLocal] : [])])];
        setSalas(names);
        if (names.length) setLocal(value => names.includes(value) ? value : '');
      });
    return () => { active = false; };
  }, [open, unidadeId, defaultLocal]);

  const enviar = async () => {
    if (locked.current || carregandoSalas) return;
    const l = local.trim();
    if (!unidadeId || (salas.length > 0 && !salas.includes(l))) { toast.error('Selecione uma sala válida desta unidade.'); return; }
    if (!l) { toast.error("Informe a sala ou consultório."); return; }
    setLocalSalvo(l, unidadeId, defaultLocal);
    locked.current = true;
    const requestedScope = scope;
    setEnviando(true);
    try {
      const result = await solicitarChamada(unidadeId, { pacienteNome, local: l, profissionalNome });
      if (scopeRef.current !== requestedScope) return;
      if (result === 'recebida' || result === 'recebida_sem_audio') {
        if (result === 'recebida') toast.success('TV confirmou o recebimento da chamada.');
        else toast.warning('TV recebeu a chamada, mas o som está inativo. Confira o painel.');
        setOpen(false); setChamadoEm(Date.now());
      } else if (result === 'ocupado') toast.warning('Painel com fila cheia. A chamada não foi incluída. Tente novamente.');
      else if (result === 'nao_confirmada') toast.warning('A TV não confirmou o recebimento. Confira a conexão e a versão aberta na TV antes de chamar novamente.');
      else toast.error('Não foi possível enviar a chamada. O atendimento segue normalmente.');
    } catch { toast.error('Falha ao enviar a chamada. Confira o painel.'); }
    finally { locked.current = false; setEnviando(false); }
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          size="sm"
          variant={chamadoEm ? "outline" : "default"}
          className={cn("h-9 px-3 gap-2 text-sm font-semibold shadow-sm", className)}
          title="Chamar paciente no painel"
          aria-label="Chamar paciente no painel"
          disabled={enviando || !unidadeId}
        >
          <Megaphone className="w-4 h-4" />
          {chamadoEm ? "Chamar de novo" : "Chamar"}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-64 space-y-2" align="end">
        <p className="text-base font-semibold leading-tight">Chamar {pacienteNome}</p>
        {salas.length > 0 ? (
          <Select disabled={enviando || carregandoSalas} value={salas.includes(local) ? local : ""} onValueChange={(v) => setLocal(v)}>
            <SelectTrigger>
              <SelectValue placeholder="Selecione a sala" />
            </SelectTrigger>
            <SelectContent>
              {salas.map((s) => (
                <SelectItem key={s} value={s}>{s}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        ) : (
          <Input
            value={local}
            disabled={enviando || carregandoSalas}
            onChange={(e) => setLocal(e.target.value)}
            placeholder="Ex.: Consultório 3"
            onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); void enviar(); } }}
            autoFocus
          />
        )}
        <Button className="w-full h-11 gap-2 text-base font-semibold" onClick={enviar} disabled={enviando || carregandoSalas}>
          <Megaphone className="w-5 h-5" />
          {enviando ? "Chamando..." : "Chamar no painel"}
        </Button>
      </PopoverContent>
    </Popover>
  );
}
