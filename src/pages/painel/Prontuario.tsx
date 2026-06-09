import React, { useState, useEffect, useRef, useMemo, useCallback, useDeferredValue } from "react";
import { cn, todayLocalStr } from "@/lib/utils";
import { ModalAgendarSessao } from "@/components/ModalAgendarSessao";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useVirtualizer } from "@tanstack/react-virtual";
import { Skeleton } from "@/components/ui/skeleton";
import FichaPacienteCabecalho from "@/components/FichaPacienteCabecalho";
import { useProntuarioStructure } from "@/hooks/useProntuarioStructure";
import { useProntuarioConfig } from "@/hooks/useProntuarioConfig";
import { useAuth } from "@/contexts/AuthContext";
import { usePermissions } from "@/contexts/PermissionsContext";
import { useData } from "@/contexts/DataContext";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { DebouncedInput } from "@/components/ui/debounced-input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { DebouncedTextarea } from "@/components/ui/debounced-textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Loader2, Plus, FileText, Printer, Pencil, Search, CheckCircle, History, Trash2, Activity, ClipboardList, Heart, AlertTriangle, Clock, ChevronDown, Settings, X, Tag, Pencil as PencilIcon, Eye, MoreVertical, Download, Link2, Send, FlaskConical, ChevronRight, Calendar, User, MapPin, Target, CalendarClock, Eraser, Home } from "lucide-react";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Separator } from "@/components/ui/separator";
import HistoricoPacientePanel from "@/components/prontuario/HistoricoPacientePanel";
import HistoricoCentralList from "@/components/prontuario/HistoricoCentralList";
import { NovoProcedimentoModal } from "@/components/NovoProcedimentoModal";
import { procedureService } from "@/services/procedureService";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Progress } from "@/components/ui/progress";
import { useSearchParams, useNavigate } from "react-router-dom";
import AtendimentoTimer from "@/components/AtendimentoTimer";
import { openPrintDocument } from "@/lib/printLayout";
import { downloadProntuarioPdf } from "@/lib/prontuarioPdf";
import { Lock, FileDown } from "lucide-react";
import { HistoricoClinico } from "@/components/HistoricoClinico";
import { BuscaPaciente } from "@/components/BuscaPaciente";
import GerarDocumentoModal from "@/components/GerarDocumentoModal";
import DocumentosHistorico from "@/components/DocumentosHistorico";

import SolicitacaoExames from "@/components/SolicitacaoExames";
import PrescricaoMedicamentos from "@/components/PrescricaoMedicamentos";
import CamposEspecialidade from "@/components/CamposEspecialidade";
import HistoricoCompletoModal from "@/components/HistoricoCompletoModal";
import EncaminhamentoInternoModal from "@/components/EncaminhamentoInternoModal";
import SoapFieldsAdaptive from "@/components/SoapFieldsAdaptive";
import DynamicProntuarioFields from "@/components/prontuario/DynamicProntuarioFields";
import { isMedico, hasDropdownSoap } from "@/data/soapOptionsByProfession";
import { useSoapCustomOptions } from "@/hooks/useSoapCustomOptions";
import { Stamp } from "lucide-react";
import { getSoapValidationError, normalizeSoapPayload, treatmentService } from "@/services/treatmentService";
import { useRealtimeSubscription } from "@/hooks/useRealtimeSubscription";
import VisitaDomiciliarProntuario from "@/components/visita-domiciliar/VisitaDomiciliarProntuario";

const PTS_SPECIALTIES = [
  'Fisioterapia', 'Fonoaudiologia', 'Psicologia', 'Terapia Ocupacional',
  'Neuropsicologia', 'Psicopedagogia', 'Nutrição', 'Serviço Social', 'Enfermagem',
];

import { FREQUENCY_OPTIONS_NEW, WEEKDAY_LABELS, getMaxWeekdays, isWeekdayFrequency, calculateTotalSessions, generateSessionDates, generateSessionDatesWithInfo, calcEndDateFromSessions, buildBlockedRanges } from '@/lib/treatmentSessionGenerator';

interface ProntuarioDB {
  id: string;
  paciente_id: string;
  paciente_nome: string;
  profissional_id: string;
  profissional_nome: string;
  unidade_id: string;
  sala_id: string;
  setor: string;
  agendamento_id: string;
  data_atendimento: string;
  hora_atendimento: string;
  queixa_principal: string;
  anamnese: string;
  sinais_sintomas: string;
  exame_fisico: string;
  hipotese: string;
  conduta: string;
  prescricao: string;
  solicitacao_exames: string;
  evolucao: string;
  observacoes: string;
  indicacao_retorno: string;
  motivo_alteracao: string;
  procedimentos_texto: string;
  outro_procedimento: string;
  episodio_id: string | null;
  custom_data?: any;
  criado_em: string;
  atualizado_em: string;
}

interface ProcedimentoDB {
  uuid: string;
  id: string;
  nome: string;
  profissao: string;
  especialidade: string;
  profissionais_ids: string[] | null;
  ativo: boolean;
  origem?: 'SIGTAP' | 'PERSONALIZADO';
}

const TIPOS_REGISTRO = [
  { value: 'avaliacao_inicial', label: '🟢 Avaliação Inicial' },
  { value: 'retorno', label: '🔵 Retorno' },
  { value: 'sessao', label: '🟡 Sessão' },
  { value: 'urgencia', label: '🔴 Urgência' },
  { value: 'procedimento', label: '🟣 Procedimento' },
  { value: 'visita_domiciliar', label: '🏠 Visita Domiciliar' },
  { value: 'consulta', label: 'Consulta (legado)' },
  { value: 'reavaliacao', label: 'Reavaliação (legado)' },
  { value: 'avaliacao_enfermagem', label: 'Avaliação de Enfermagem (legado)' },
  { value: 'pts', label: 'PTS (legado)' },
  { value: 'triagem_inicial', label: 'Triagem Inicial (legado)' },
];

const emptyForm = {
  paciente_id: "",
  paciente_nome: "",
  profissional_id: "",
  profissional_nome: "",
  agendamento_id: "",
  data_atendimento: new Date().toISOString().split("T")[0],
  hora_atendimento: "",
  tipo_registro: "consulta",
  queixa_principal: "",
  anamnese: "",
  sinais_sintomas: "",
  exame_fisico: "",
  hipotese: "",
  conduta: "",
  prescricao: "",
  solicitacao_exames: "",
  evolucao: "",
  observacoes: "",
  resultado_exame: "",
  indicacao_retorno: "",
  motivo_alteracao: "",
  procedimentos_texto: "",
  outro_procedimento: "",
  episodio_id: "",
  soap_subjetivo: "",
  soap_objetivo: "",
  soap_avaliacao: "",
  soap_plano: "",
};
