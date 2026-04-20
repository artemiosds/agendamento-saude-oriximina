import React, { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import { Bell, Send, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { whatsappService } from "@/services/whatsappService";
import { useWebhookNotify } from "@/hooks/useWebhookNotify";
import { addDaysToDateStr, todayLocalStr } from "@/lib/utils";

interface Agendamento {
  id: string;
  pacienteId: string;
  pacienteNome: string;
  profissionalNome: string;
  data: string;
  hora: string;
  status: string;
  unidadeId: string;
  tipo: string;
  observacoes?: string;
}

interface Paciente {
  id: string;
  nome: string;
  telefone?: string;
  email?: string;
}

interface Unidade {
  id: string;
  nome: string;
}

interface IndividualProps {
  ag: Agendamento;
  paciente?: Paciente;
  unidade?: Unidade;
}

interface MassaProps {
  agendamentos: Agendamento[];
  pacientes: Paciente[];
  unidades: Unidade[];
  selectedDate: string;
  userUnidadeId?: string;
  userUsuario?: string;
}

const CANCELADOS = new Set(["cancelado", "falta", "concluido"]);

export const AgendaNotificacaoIndividual: React.FC<IndividualProps> = ({ ag, paciente, unidade }) => {
  const [loading, setLoading] = useState(false);
  const { notify } = useWebhookNotify();

  if (CANCELADOS.has(ag.status)) return null;

  const handleAvisar = async () => {
    if (loading) return;
    setLoading(true);
    try {
      const telefone = paciente?.telefone || "";
      const email = paciente?.email || "";

      if (!telefone && !email) {
        toast.error("Paciente sem telefone e sem e-mail cadastrado.");
        return;
      }

      const promises: Promise<any>[] = [];

      // Send WhatsApp if phone available
      if (telefone) {
        promises.push(
          whatsappService.sendDirect({
            tipo: "lembrete_manual",
            telefone,
            paciente_nome: ag.pacienteNome,
            profissional: ag.profissionalNome,
            unidade: unidade?.nome || "",
            unidade_id: ag.unidadeId,
            data_consulta: ag.data,
            hora_consulta: ag.hora,
          })
        );
      }

      // Send email notification
      if (email) {
        promises.push(
          notify({
            evento: "lembrete_1h",
            paciente_nome: ag.pacienteNome,
            telefone,
            email,
            data_consulta: ag.data,
            hora_consulta: ag.hora,
            unidade: unidade?.nome || "",
            profissional: ag.profissionalNome,
            tipo_atendimento: ag.tipo,
            status_agendamento: ag.status,
            id_agendamento: ag.id,
            observacoes: "Lembrete enviado manualmente.",
          })
        );
      }

      await Promise.allSettled(promises);
      toast.success(`📨 Aviso enfileirado para ${ag.pacienteNome} (respeitando delays anti-ban)`);
    } catch (err) {
      console.error("Erro ao enviar aviso:", err);
      toast.error(`❌ Falha ao enviar aviso para ${ag.pacienteNome}`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Button
      size="sm"
      variant="ghost"
      className="h-8 px-2 text-xs"
      onClick={handleAvisar}
      disabled={loading}
      title="Avisar paciente"
    >
      {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Bell className="w-3.5 h-3.5" />}
    </Button>
  );
};

export const AgendaNotificacoesMassa: React.FC<MassaProps> = ({
  agendamentos,
  pacientes,
  unidades,
  selectedDate,
  userUnidadeId,
  userUsuario,
}) => {
  const [loading, setLoading] = useState<string | null>(null);
  const { notify } = useWebhookNotify();

  // Filter by unit (same logic as Agenda) and exclude cancelled/completed
  const agAtivos = React.useMemo(() => {
    return agendamentos.filter((a) => {
      if (CANCELADOS.has(a.status)) return false;
      // Unit isolation: if user has a unit and is not admin.sms, only their unit
      if (userUnidadeId && userUsuario !== "admin.sms" && a.unidadeId !== userUnidadeId) return false;
      return true;
    });
  }, [agendamentos, userUnidadeId, userUsuario]);

  const enviarParaLista = async (lista: Agendamento[], tipo: string) => {
    if (lista.length === 0) {
      toast.info("Nenhum agendamento ativo para enviar aviso.");
      return;
    }

    const confirmou = window.confirm(
      `Enviar aviso para ${lista.length} paciente(s)?`,
    );
    if (!confirmou) return;

    setLoading(tipo);
    let enviados = 0;
    let erros = 0;

    for (const ag of lista) {
      const pac = pacientes.find((p) => p.id === ag.pacienteId);
      const telefone = pac?.telefone || "";
      const email = pac?.email || "";
      const unidade = unidades.find((u) => u.id === ag.unidadeId);

      if (!telefone && !email) {
        erros++;
        continue;
      }

      try {
        const promises: Promise<any>[] = [];

        if (telefone) {
          promises.push(
            whatsappService.sendDirect({
              tipo: "lembrete_manual",
              telefone,
              paciente_nome: ag.pacienteNome,
              profissional: ag.profissionalNome,
              unidade: unidade?.nome || "",
              unidade_id: ag.unidadeId,
              data_consulta: ag.data,
              hora_consulta: ag.hora,
            })
          );
        }

        if (email) {
          promises.push(
            notify({
              evento: "lembrete_1h",
              paciente_nome: ag.pacienteNome,
              telefone,
              email,
              data_consulta: ag.data,
              hora_consulta: ag.hora,
              unidade: unidade?.nome || "",
              profissional: ag.profissionalNome,
              tipo_atendimento: ag.tipo,
              status_agendamento: ag.status,
              id_agendamento: ag.id,
              observacoes: `Lembrete em massa (${tipo}).`,
            })
          );
        }

        await Promise.allSettled(promises);
        enviados++;
      } catch {
        erros++;
      }
    }

    setLoading(null);
    if (erros === 0) {
      toast.success(`📨 ${enviados} aviso(s) enfileirado(s) — serão enviados respeitando os delays anti-ban`);
    } else {
      toast.warning(`Enfileirados: ${enviados} | Erros: ${erros}`);
    }
  };

  const handleHoje = () => {
    const hoje = todayLocalStr();
    const hojeAgs = agAtivos.filter((a) => a.data === hoje);
    enviarParaLista(hojeAgs, "hoje");
  };

  const handleAmanha = () => {
    const amanha = addDaysToDateStr(todayLocalStr(), 1);
    const amanhaAgs = agAtivos.filter((a) => a.data === amanha);
    enviarParaLista(amanhaAgs, "amanha");
  };

  const handle1Hora = () => {
    const agora = new Date();
    const hoje = todayLocalStr();
    const proximos = agAtivos.filter((a) => {
      if (a.data !== hoje) return false;
      const [h, m] = a.hora.split(":").map(Number);
      if (isNaN(h) || isNaN(m)) return false;
      const horaAg = new Date();
      horaAg.setHours(h, m, 0, 0);
      const diff = horaAg.getTime() - agora.getTime();
      return diff > 0 && diff <= 3600000;
    });
    enviarParaLista(proximos, "1hora");
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="sm" disabled={!!loading}>
          {loading ? (
            <Loader2 className="w-4 h-4 mr-2 animate-spin" />
          ) : (
            <Send className="w-4 h-4 mr-2" />
          )}
          {loading ? "Enviando..." : "Avisar Pacientes"}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuItem onClick={handleHoje}>
          📩 Avisar TODOS (Hoje)
        </DropdownMenuItem>
        <DropdownMenuItem onClick={handleAmanha}>
          📅 Avisar TODOS (Amanhã)
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={handle1Hora}>
          ⏰ Avisar próximos (1h antes)
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
};
