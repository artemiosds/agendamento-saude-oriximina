import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, UserCheck, FileText, UserX, Zap } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { nowTimeBrazilStr, todayLocalStr } from "@/lib/utils";
import { ausenciasDetectadas, TOLERANCIA_MINUTOS } from "@/lib/radarBalcao";

type Ag = { id: string; data: string; hora: string; status: string; pacienteNome?: string; profissionalNome?: string; tipo?: string };

/** Hook de relógio: atualiza a cada 30 s para a fita de tolerância. */
export function useRelogioBalcao() {
  const [agora, setAgora] = useState(() => nowTimeBrazilStr().slice(0, 5));
  useEffect(() => { const t = globalThis.setInterval(() => setAgora(nowTimeBrazilStr().slice(0, 5)), 30000); return () => globalThis.clearInterval(t); }, []);
  return agora;
}

/** Barra no topo da Agenda + lista rápida. As ações usam os fluxos oficiais (chegada e falta). */
export function RadarBalcaoBar({ agendamentos, agora, onChegou, onFalta }: {
  agendamentos: readonly Ag[]; agora: string;
  onChegou: (id: string) => void; onFalta: (id: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const itens = useMemo(() => ausenciasDetectadas(agendamentos, todayLocalStr(), agora), [agendamentos, agora]);
  if (!itens.length) return null;
  return <>
    <button type="button" onClick={() => setOpen(true)}
      className="w-full flex items-center justify-between gap-2 rounded-xl border border-destructive/30 bg-destructive/5 px-3 py-2 text-left text-sm hover:bg-destructive/10">
      <span className="flex items-center gap-2 text-foreground"><AlertTriangle className="h-4 w-4 text-destructive" />
        <strong>{itens.length}</strong> {itens.length === 1 ? "paciente ultrapassou" : "pacientes ultrapassaram"} o horário sem confirmação de chegada (+{TOLERANCIA_MINUTOS} min)</span>
      <span className="text-xs font-medium text-destructive">Revisar ausências</span>
    </button>
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Radar de Balcão · ausências detectadas</DialogTitle>
          <DialogDescription>Nada é registrado sozinho. Cada botão abre a confirmação oficial da Agenda.</DialogDescription>
        </DialogHeader>
        <ul className="space-y-2">
          {itens.map(({ ag, atrasoMin }) => <li key={ag.id} className="rounded-lg border p-3 space-y-2">
            <p className="text-sm"><strong>{ag.hora?.slice(0, 5)}</strong> · {ag.pacienteNome || "Paciente"}
              <span className="text-muted-foreground"> ({ag.tipo || "Atendimento"}{ag.profissionalNome ? ` | ${ag.profissionalNome}` : ""})</span>
              <span className="ml-2 inline-flex rounded-full bg-destructive/10 px-2 text-xs font-semibold text-destructive">+{atrasoMin} min</span></p>
            <div className="flex flex-wrap gap-2">
              <Button size="sm" variant="outline" onClick={() => { setOpen(false); onChegou(ag.id); }}><UserCheck className="h-4 w-4 mr-1" /> Chegou com atraso</Button>
              <Button size="sm" variant="outline" onClick={() => { setOpen(false); onFalta(ag.id); }}><FileText className="h-4 w-4 mr-1" /> Justificar falta</Button>
              <Button size="sm" variant="destructive" onClick={() => { setOpen(false); onFalta(ag.id); }}><UserX className="h-4 w-4 mr-1" /> Confirmar falta</Button>
            </div>
          </li>)}
        </ul>
      </DialogContent>
    </Dialog>
  </>;
}

/** Oferta de encaixe após a falta: só pré-preenche o Novo Agendamento oficial. */
export function EncaixeBalcaoDialog({ vaga, onClose, onEncaixar }: {
  vaga: { hora: string; profissionalNome?: string } | null; onClose: () => void; onEncaixar: () => void;
}) {
  return <Dialog open={!!vaga} onOpenChange={(o) => !o && onClose()}>
    <DialogContent className="max-w-md">
      <DialogHeader>
        <DialogTitle className="flex items-center gap-2"><Zap className="h-5 w-5 text-primary" /> Vaga liberada por falta</DialogTitle>
        <DialogDescription>A vaga das <strong>{vaga?.hora?.slice(0, 5)}</strong>{vaga?.profissionalNome ? <> com <strong>{vaga.profissionalNome}</strong></> : null} está livre. Deseja encaixar um paciente que está esperando no balcão?</DialogDescription>
      </DialogHeader>
      <p className="text-xs text-muted-foreground">Abre o Novo Agendamento com profissional e horário preenchidos. Escolha ou cadastre o paciente e depois confirme a chegada normalmente.</p>
      <DialogFooter className="gap-2">
        <Button variant="outline" onClick={onClose}>Agora não</Button>
        <Button onClick={onEncaixar}><Zap className="h-4 w-4 mr-1" /> Encaixar paciente</Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>;
}
