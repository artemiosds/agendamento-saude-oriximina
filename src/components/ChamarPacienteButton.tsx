import { useEffect, useState } from "react";
import { Megaphone } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { chamarPaciente, getLocalSalvo, setLocalSalvo } from "@/lib/painelChamadas";

interface Props {
  unidadeId: string;
  pacienteNome: string;
  profissionalNome?: string;
  defaultLocal?: string;
}

export default function ChamarPacienteButton({ unidadeId, pacienteNome, profissionalNome, defaultLocal }: Props) {
  const [open, setOpen] = useState(false);
  const [local, setLocal] = useState(() => getLocalSalvo() || defaultLocal || "");
  const [enviando, setEnviando] = useState(false);
  const [salas, setSalas] = useState<string[]>([]);
  const [chamadoEm, setChamadoEm] = useState<number | null>(null);

  useEffect(() => {
    if (!open || !unidadeId) return;
    supabase
      .from("salas")
      .select("nome")
      .eq("unidade_id", unidadeId)
      .order("nome")
      .then(({ data }) => {
        setSalas(((data as any[]) || []).map((s) => String(s.nome || "").trim()).filter(Boolean));
      });
  }, [open, unidadeId]);

  const enviar = async () => {
    const l = local.trim();
    if (!l) { toast.error("Informe a sala ou consultório."); return; }
    setLocalSalvo(l);
    setEnviando(true);
    const ok = await chamarPaciente(unidadeId, { pacienteNome, local: l, profissionalNome });
    setEnviando(false);
    if (ok) { toast.success("Paciente chamado no painel."); setOpen(false); setChamadoEm(Date.now()); }
    else toast.error("Não foi possível chamar no painel. O atendimento segue normalmente.");
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          size="sm"
          variant={chamadoEm ? "outline" : "default"}
          className="h-9 px-3 gap-2 text-sm font-semibold shadow-sm"
          title="Chamar paciente no painel"
          aria-label="Chamar paciente no painel"
        >
          <Megaphone className="w-4 h-4" />
          {chamadoEm ? "Chamar de novo" : "Chamar"}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-64 space-y-2" align="end">
        <p className="text-base font-semibold leading-tight">Chamar {pacienteNome}</p>
        {salas.length > 0 ? (
          <Select value={salas.includes(local) ? local : ""} onValueChange={(v) => setLocal(v)}>
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
            onChange={(e) => setLocal(e.target.value)}
            placeholder="Ex.: Consultório 3"
            onKeyDown={(e) => e.key === "Enter" && enviar()}
            autoFocus
          />
        )}
        <Button className="w-full h-11 gap-2 text-base font-semibold" onClick={enviar} disabled={enviando}>
          <Megaphone className="w-5 h-5" />
          {enviando ? "Chamando..." : "Chamar no painel"}
        </Button>
      </PopoverContent>
    </Popover>
  );
}
