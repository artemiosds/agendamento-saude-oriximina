import { useEffect, useState } from "react";
import { AlertTriangle, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { supabase } from "@/integrations/supabase/client";
import { todayLocalStr } from "@/lib/utils";
import {
  registerTreatmentDischarge,
  type TreatmentDischargeResult,
  type TreatmentDischargeScope,
  type TreatmentDischargeType,
} from "@/services/treatmentDischargeService";

export interface TreatmentDischargeCycle {
  id: string;
  patient_id: string;
  professional_id: string;
  unit_id: string;
  treatment_type: string;
}

interface AltaTratamentoDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  cycle: TreatmentDischargeCycle | null;
  patientName: string;
  onSuccess: (result: TreatmentDischargeResult, details: { type: TreatmentDischargeType; reason: string }) => Promise<void> | void;
}

export function AltaTratamentoDialog({ open, onOpenChange, cycle, patientName, onSuccess }: AltaTratamentoDialogProps) {
  const [type, setType] = useState<TreatmentDischargeType | "">("");
  const [scope, setScope] = useState<TreatmentDischargeScope>("ciclo");
  const [reason, setReason] = useState("");
  const [finalNotes, setFinalNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const [futureSessions, setFutureSessions] = useState(0);

  useEffect(() => {
    if (!open || !cycle) return;
    let cancelled = false;
    setType("");
    setScope("ciclo");
    setReason("");
    setFinalNotes("");
    setSaving(false);
    void (async () => {
      const { count, error } = await (supabase as any)
        .from("treatment_sessions")
        .select("id", { count: "exact", head: true })
        .eq("cycle_id", cycle.id)
        .gte("scheduled_date", todayLocalStr())
        .in("status", ["pendente_agendamento", "agendada"]);
      if (cancelled) return;
      if (error) {
        console.error("Erro ao consultar sessões futuras do ciclo:", error);
        setFutureSessions(0);
        return;
      }
      setFutureSessions(count || 0);
    })();
    return () => { cancelled = true; };
  }, [cycle, open]);

  const handleSubmit = async () => {
    if (!cycle || !type || !reason.trim()) return;
    setSaving(true);
    let result: TreatmentDischargeResult;
    try {
      if (scope === "geral" && !window.confirm("Confirmar desligamento geral? Todos os agendamentos futuros do paciente nesta unidade serão cancelados.")) {
        setSaving(false);
        return;
      }
      result = await registerTreatmentDischarge({
        cycleId: cycle.id,
        type,
        reason,
        finalNotes,
        scope,
      });
      if (result.cancelled_other_appointments) {
        toast.info(`${result.cancelled_other_appointments} agendamento(s) futuro(s) do paciente na unidade foram cancelados.`);
      }
      if (result.careness?.created && result.careness.release_date) {
        const released = new Date(`${result.careness.release_date}T12:00:00`).toLocaleDateString("pt-BR");
        toast.info(`Carência para ${result.careness.profession || "esta profissão"} registrada até ${released}.`);
      } else if (result.careness?.reason === "other_active_treatment") {
        toast.info("Não foi criada carência: o paciente já possui outro ciclo ativo nesta profissão.");
      }
    } catch (error) {
      console.error("Erro ao registrar alta do tratamento:", error);
      toast.error(error instanceof Error ? error.message : "Não foi possível registrar a alta.");
      setSaving(false);
      return;
    } finally {
      setSaving(false);
    }
    onOpenChange(false);
    try {
      await onSuccess(result, { type, reason: reason.trim() });
    } catch (error) {
      // O RPC já confirmou a alta; uma falha de atualização visual não deve
      // ser apresentada como se a gravação clínica tivesse falhado.
      console.error("Alta registrada, mas a tela não conseguiu atualizar:", error);
      toast.warning("Alta registrada. Atualize a tela para recarregar os dados.");
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader><DialogTitle>Dar Alta</DialogTitle></DialogHeader>
        <div className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Paciente: <strong className="text-foreground">{patientName || "Paciente"}</strong>
            <br />Tratamento: <strong className="text-foreground">{cycle?.treatment_type || "—"}</strong>
          </p>
          {futureSessions > 0 && (
            <div className="flex items-start gap-2 p-3 rounded-lg bg-warning/10 border border-warning/30">
              <AlertTriangle className="w-4 h-4 text-warning mt-0.5 shrink-0" />
              <p className="text-sm text-warning">
                {futureSessions} sessão(ões) futura(s) pendente(s) ou agendada(s) deste ciclo serão removidas da agenda. Sessões realizadas e outros atendimentos serão preservados.
              </p>
            </div>
          )}
          <div className="space-y-2">
            <Label>Abrangência da alta *</Label>
            <RadioGroup value={scope} onValueChange={(v) => setScope(v as TreatmentDischargeScope)} className="space-y-2">
              <label className="flex items-start gap-2 p-3 rounded-lg border cursor-pointer">
                <RadioGroupItem value="ciclo" className="mt-0.5" />
                <span className="text-sm">
                  <strong>Alta desta especialidade / profissional</strong> (recomendado)
                  <br /><span className="text-muted-foreground">Remove só as sessões deste tratamento. Atendimentos com outros profissionais continuam na Agenda.</span>
                </span>
              </label>
              <label className="flex items-start gap-2 p-3 rounded-lg border cursor-pointer">
                <RadioGroupItem value="geral" className="mt-0.5" />
                <span className="text-sm">
                  <strong>Desligamento geral do CER</strong>
                  <br /><span className="text-muted-foreground">Cancela todos os agendamentos futuros do paciente nesta unidade.</span>
                </span>
              </label>
            </RadioGroup>
            {scope === "geral" && (
              <div className="flex items-start gap-2 p-3 rounded-lg bg-destructive/10 border border-destructive/30">
                <AlertTriangle className="w-4 h-4 text-destructive mt-0.5 shrink-0" />
                <p className="text-sm text-destructive">
                  Atenção: isso cancelará TODOS os agendamentos futuros deste paciente na unidade, inclusive de outras especialidades.
                </p>
              </div>
            )}
          </div>
          <div className="space-y-2">
            <Label>Tipo de alta *</Label>
            <Select value={type} onValueChange={(value) => setType(value as TreatmentDischargeType)}>
              <SelectTrigger><SelectValue placeholder="Selecione o tipo" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="conclusao">Conclusão do tratamento</SelectItem>
                <SelectItem value="outro">Outro motivo</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>Motivo da alta *</Label>
            <Input value={reason} onChange={(event) => setReason(event.target.value)} maxLength={500} />
          </div>
          <div className="space-y-2">
            <Label>Observações finais</Label>
            <Textarea value={finalNotes} onChange={(event) => setFinalNotes(event.target.value)} rows={3} maxLength={4000} />
          </div>
          <Button onClick={handleSubmit} className="w-full" variant="destructive" disabled={!type || !reason.trim() || saving}>
            {saving && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
            Confirmar Alta
          </Button>
          <p className="text-xs text-muted-foreground text-center">
            A alta só será registrada após esta confirmação.
          </p>
        </div>
      </DialogContent>
    </Dialog>
  );
}
