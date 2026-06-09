import React, { useState, useEffect, useRef, useMemo, useCallback } from "react";
import { cn, todayLocalStr } from "@/lib/utils";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/contexts/AuthContext";
import { usePermissions } from "@/contexts/PermissionsContext";
import { useData } from "@/contexts/DataContext";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Loader2, Save, Printer, Home, User, Calendar, MapPin, ClipboardList } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useSearchParams } from "react-router-dom";
import HistoricoPacientePanel from "@/components/prontuario/HistoricoPacientePanel";
import VisitaDomiciliarProntuario from "@/components/visita-domiciliar/VisitaDomiciliarProntuario";

const TIPOS_REGISTRO = [
  { value: 'avaliacao_inicial', label: '🟢 Avaliação Inicial' },
  { value: 'retorno', label: '🔵 Retorno' },
  { value: 'sessao', label: '🟡 Sessão' },
  { value: 'urgencia', label: '🔴 Urgência' },
  { value: 'procedimento', label: '🟣 Procedimento' },
  { value: 'visita_domiciliar', label: '🏠 Visita Domiciliar' },
];

const ProntuarioPage: React.FC = () => {
  const { user } = useAuth();
  const { pacientes, unidades, agendamentos } = useData();
  const [searchParams] = useSearchParams();
  const queryClient = useQueryClient();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [tipoRegistro, setTipoRegistro] = useState<string>("sessao");
  const [pacienteId, setPacienteId] = useState<string>("");
  const [agendamentoId, setAgendamentoId] = useState<string>("");

  useEffect(() => {
    const pId = searchParams.get("pacienteId");
    const aId = searchParams.get("agendamentoId");
    const tipo = searchParams.get("tipo");
    
    if (pId) {
      setPacienteId(pId);
      setAgendamentoId(aId || "");
      setTipoRegistro(tipo === "Visita Domiciliar" ? "visita_domiciliar" : "sessao");
      setDialogOpen(true);
      setEditId(null);
    }
  }, [searchParams]);

  const pacienteData = useMemo(() => pacientes.find(p => p.id === pacienteId), [pacientes, pacienteId]);
  const unidadeAtual = useMemo(() => unidades.find(u => u.id === user?.unidadeId), [unidades, user]);

  return (
    <div className="p-6">
      <h1 className="text-2xl font-bold mb-6">Prontuários</h1>
      <p className="text-muted-foreground italic">Selecione um paciente na agenda ou na busca para iniciar um atendimento.</p>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-7xl h-[95vh] flex flex-col p-6 gap-0">
          <DialogHeader className="shrink-0 mb-4 pr-12">
            <div className="flex flex-col gap-1">
              <div className="flex items-center gap-2">
                <DialogTitle className="text-2xl font-display font-bold tracking-tight text-foreground">
                  {editId ? "Visualizar Prontuário" : "Novo Atendimento"}
                </DialogTitle>
                {tipoRegistro === 'visita_domiciliar' && (
                  <Badge variant="outline" className="bg-blue-500/10 text-blue-600 border-blue-500/20 gap-1 px-3">
                    <Home className="w-3 h-3" /> Visita Domiciliar
                  </Badge>
                )}
              </div>
              <p className="text-sm text-muted-foreground flex items-center gap-2">
                {pacienteData?.nome} {pacienteData?.cpf && ` · CPF ${pacienteData.cpf}`}
              </p>
            </div>
          </DialogHeader>

          {tipoRegistro === 'visita_domiciliar' ? (
            <div className="flex-1 overflow-hidden">
              <div className="h-full overflow-y-auto pr-2">
                <VisitaDomiciliarProntuario 
                  atendimento_id={agendamentoId}
                  prontuario_id={editId || undefined}
                  paciente={pacienteData}
                  profissional={user}
                  unidade={unidadeAtual}
                  onSaveSuccess={() => {
                    queryClient.invalidateQueries({ queryKey: ["prontuarios"] });
                  }}
                />
              </div>
            </div>
          ) : (
            <div className="flex-1 flex items-center justify-center border-2 border-dashed rounded-lg bg-muted/20">
               <p className="text-muted-foreground">O módulo de prontuário padrão está sendo restaurado. Utilize a Visita Domiciliar para novos registros no momento.</p>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default ProntuarioPage;
