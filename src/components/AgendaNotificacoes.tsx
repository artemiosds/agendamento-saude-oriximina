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
import { supabase } from "@/integrations/supabase/client";

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

      // Trigger notification via webhook-notify (handles both Webhook and WhatsApp)
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
  unidades,
  userUnidadeId,
  userUsuario,
}) => {
  const [loading, setLoading] = useState<string | null>(null);
  const { notify } = useWebhookNotify();

  const consultarDestinatarios = async (date: string, filtro?: (ag: Agendamento) => boolean) => {
    if (userUsuario !== 'admin.sms' && !userUnidadeId) throw new Error('Unidade indisponível');
    const rows: Agendamento[] = [];
    for (let from = 0; ; from += 1000) {
      let query = supabase.from('agendamentos').select('id,paciente_id,paciente_nome,profissional_nome,data,hora,status,unidade_id,tipo,observacoes')
        .eq('data', date).order('data', { ascending: false }).order('id', { ascending: true })
        .range(from, from + 999);
      if (userUsuario !== 'admin.sms') query = query.eq('unidade_id', userUnidadeId);
      const { data, error } = await query;
      if (error || !data) throw error || new Error('Resposta de agendamentos ausente');
      rows.push(...data.map(a => ({ id: a.id, pacienteId: a.paciente_id,
        pacienteNome: a.paciente_nome, profissionalNome: a.profissional_nome,
        data: a.data, hora: a.hora, status: a.status, unidadeId: a.unidade_id,
        tipo: a.tipo, observacoes: a.observacoes || '' })));
      if (data.length < 1000) break;
    }
    const active = rows.filter(a => !CANCELADOS.has(a.status) && (!filtro || filtro(a)));
    const contacts = new Map<string, Paciente>();
    const ids = [...new Set(active.map(a => a.pacienteId))];
    for (let from = 0; from < ids.length; from += 100) {
      let query = supabase.from('pacientes').select('id,nome,telefone,email,unidade_id')
        .in('id', ids.slice(from, from + 100));
      if (userUsuario !== 'admin.sms') query = query.or(`unidade_id.eq.${userUnidadeId},unidade_id.is.null,unidade_id.eq.`);
      const { data, error } = await query;
      if (error || !data) throw error || new Error('Resposta de pacientes ausente');
      data.forEach(p => contacts.set(p.id, p));
    }
    if (ids.some(id => !contacts.has(id))) throw new Error('Contato de paciente indisponível');
    return { active, contacts };
  };

  const enviarParaLista = async (date: string, tipo: string, filtro?: (ag: Agendamento) => boolean) => {
    if (loading) return;
    setLoading(tipo);
    let lista: Agendamento[];
    let contacts: Map<string, Paciente>;
    try {
      const result = await consultarDestinatarios(date, filtro);
      lista = result.active;
      contacts = result.contacts;
    } catch (error) {
      console.error('Erro ao consultar destinatários:', error);
      toast.error('Não foi possível consultar os destinatários. Tente novamente.');
      setLoading(null);
      return;
    }
    if (lista.length === 0) {
      setLoading(null);
      toast.info("Nenhum agendamento ativo para enviar aviso.");
      return;
    }

    const confirmou = window.confirm(
      `Enviar aviso para ${lista.length} paciente(s)?`,
    );
    if (!confirmou) { setLoading(null); return; }

    setLoading(tipo);
    let enviados = 0;
    let erros = 0;

    for (const ag of lista) {
      const pac = contacts.get(ag.pacienteId);
      const telefone = pac?.telefone || "";
      const email = pac?.email || "";
      const unidade = unidades.find((u) => u.id === ag.unidadeId);

      if (!telefone && !email) {
        erros++;
        continue;
      }

      try {
        const promises: Promise<any>[] = [];

        // Trigger notification via webhook-notify (handles both Webhook and WhatsApp)
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
    void enviarParaLista(hoje, "hoje");
  };

  const handleAmanha = () => {
    const amanha = addDaysToDateStr(todayLocalStr(), 1);
    void enviarParaLista(amanha, "amanha");
  };

  const handle1Hora = () => {
    const agora = new Date();
    const hoje = todayLocalStr();
    const filtro = (a: Agendamento) => {
      const [h, m] = a.hora.split(":").map(Number);
      if (isNaN(h) || isNaN(m)) return false;
      const horaAg = new Date();
      horaAg.setHours(h, m, 0, 0);
      const diff = horaAg.getTime() - agora.getTime();
      return diff > 0 && diff <= 3600000;
    };
    void enviarParaLista(hoje, "1hora", filtro);
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
