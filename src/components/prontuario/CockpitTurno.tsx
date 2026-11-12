import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { nowTimeBrazilStr, todayLocalStr } from "@/lib/utils";
import { Clock, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";

type TurnAppointment = { id: string; paciente_nome: string; hora: string; status: string; hora_chegada?: string };

const arrived = new Set(["confirmado_chegada", "chegada_confirmada", "aguardando_triagem", "aguardando_enfermagem", "triagem_concluida", "aguardando_atendimento", "apto_atendimento", "chamado"]);

function waitMinutes(value: string | undefined, now: string): number | null {
  if (!value || !/^\d{2}:\d{2}/.test(value)) return null;
  const [h, m] = value.slice(0, 5).split(":").map(Number);
  const [nh, nm] = now.slice(0, 5).split(":").map(Number);
  const diff = nh * 60 + nm - h * 60 - m;
  return diff >= 0 && diff < 24 * 60 ? diff : null;
}

/** Leitura do turno do próprio profissional; não altera fila, status ou chamadas. */
export default function CockpitTurno({ professionalId, unitId, enabled }: { professionalId: string; unitId: string; enabled: boolean }) {
  const day = todayLocalStr();
  const { data, error, isPending, refetch, isFetching } = useQuery({
    queryKey: ["cockpit-turno", professionalId, unitId, day],
    enabled: enabled && !!professionalId && !!unitId,
    refetchInterval: 30000,
    refetchOnWindowFocus: true,
    queryFn: async (): Promise<TurnAppointment[]> => {
      const { data: appointments, error: appointmentError } = await supabase.from("agendamentos")
        .select("id,paciente_nome,hora,status").eq("data", day).eq("profissional_id", professionalId)
        .eq("unidade_id", unitId).order("hora", { ascending: true });
      if (appointmentError) throw appointmentError;
      const active = (appointments || []).filter((item) => !["cancelado", "remarcado"].includes(item.status));
      if (!active.length) return [];
      const { data: queue, error: queueError } = await supabase.from("fila_espera")
        .select("id,hora_chegada").in("id", active.map((item) => item.id));
      // Falha na fila não oculta a Agenda; apenas o tempo de chegada fica desconhecido.
      if (queueError) return active.map((item) => ({ ...item }));
      const arrivals = new Map((queue || []).map((item) => [item.id, item.hora_chegada]));
      return active.map((item) => ({ ...item, hora_chegada: arrivals.get(item.id) || undefined }));
    },
  });

  if (!enabled || !professionalId || !unitId) return null;
  const now = nowTimeBrazilStr(new Date());
  return <section aria-label="Situação do turno" className="border-b bg-muted/30 px-4 sm:px-6 py-2">
    <div className="flex items-center justify-between gap-2 mb-2">
      <p className="text-xs font-semibold flex items-center gap-1"><Clock className="h-3.5 w-3.5" /> Meu turno hoje</p>
      <Button type="button" variant="ghost" size="sm" className="h-7 text-xs" onClick={() => void refetch()} disabled={isFetching} aria-label="Atualizar situação do turno"><RefreshCw className="h-3.5 w-3.5 mr-1" /> Atualizar</Button>
    </div>
    {isPending ? <p className="text-xs text-muted-foreground">Consultando agenda…</p>
      : error ? <p role="status" className="text-xs text-destructive">Não foi possível confirmar o turno. Atualize para tentar novamente.</p>
      : data?.length ? <div className="flex gap-2 overflow-x-auto pb-1">
          {data.map((item) => {
            const waiting = arrived.has(item.status) ? waitMinutes(item.hora_chegada, now) : null;
            const status = item.status === "concluido" ? "Atendido" : item.status === "em_atendimento" ? "Em atendimento"
              : arrived.has(item.status) ? "Presente na unidade" : item.status === "atraso" ? "Atraso registrado"
                : item.status === "falta" ? "Falta" : "Confirmado / previsto";
            return <div key={item.id} className="min-w-44 max-w-56 shrink-0 rounded-md border bg-background p-2 text-xs" title={status}>
              <span className="font-semibold">{item.hora?.slice(0, 5)} · {status}</span>
              <p className="truncate" title={item.paciente_nome}>{item.paciente_nome}</p>
              {waiting !== null && <p className={waiting >= 30 ? "text-amber-700 dark:text-amber-300" : "text-muted-foreground"}>Chegou há {waiting} min</p>}
            </div>;
          })}
        </div> : <p className="text-xs text-muted-foreground">Sem agendamentos para hoje.</p>}
    <p className="text-[11px] text-muted-foreground mt-1">Atualiza a cada 30 segundos. A chamada do próximo paciente segue a conferência existente da Agenda.</p>
  </section>;
}
