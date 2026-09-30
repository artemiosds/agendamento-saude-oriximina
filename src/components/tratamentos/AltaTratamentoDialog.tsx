import { useEffect, useState } from "react";
import { AlertTriangle, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { todayLocalStr } from "@/lib/utils";
import {
  registerTreatmentDischarge,
  type TreatmentDischargeResult,
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
  const [reason, setReason] = useState("");
  const [finalNotes, setFinalNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const [futureSessions, setFutureSessions] = useState(0);

  useEffect(() => {
    if (!open || !cycle) return;
    let cancelled = false;
    setType("");
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
      result = await registerTreatmentDischarge({
        cycleId: cycle.id,
        type,
        reason,
        finalNotes,
      });
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
            <Label>Tipo de alta *</Label>
            <Select value={type} onValueChange={(value) => setType(value as TreatmentDischargeType)}>
              <SelectTrigger><SelectValue placeholder="Selecione o tipo" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="conclusao">Conclusão do tratamento</SelectItem>
                <SelectItem value="falta">Falta/abandono (decisão manual)</SelectItem>
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
