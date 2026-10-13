import { useState } from "react";
import { Megaphone } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { toast } from "sonner";
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

  const enviar = async () => {
    const l = local.trim();
    if (!l) { toast.error("Informe a sala ou consultório."); return; }
    setLocalSalvo(l);
    setEnviando(true);
    const ok = await chamarPaciente(unidadeId, { pacienteNome, local: l, profissionalNome });
    setEnviando(false);
    if (ok) { toast.success("Paciente chamado no painel."); setOpen(false); }
    else toast.error("Não foi possível chamar no painel. O atendimento segue normalmente.");
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button size="sm" variant="ghost" className="h-8 px-2 text-xs" title="Chamar no painel" aria-label="Chamar no painel">
          <Megaphone className="w-3.5 h-3.5" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-64 space-y-2" align="end">
        <p className="text-sm font-medium">Chamar {pacienteNome.split(" ")[0]}</p>
        <Input
          value={local}
          onChange={(e) => setLocal(e.target.value)}
          placeholder="Ex.: Consultório 3"
          onKeyDown={(e) => e.key === "Enter" && enviar()}
          autoFocus
        />
        <Button className="w-full" size="sm" onClick={enviar} disabled={enviando}>
          {enviando ? "Chamando..." : "Chamar no painel"}
        </Button>
      </PopoverContent>
    </Popover>
  );
}
