import React, { useState, useMemo, useEffect, useCallback, useRef } from 'react';
import { cn } from "@/lib/utils";
import { usePacienteNomeResolver } from '@/hooks/usePacienteNomeResolver';
import { useData } from '@/contexts/DataContext';
import { useAuth } from '@/contexts/AuthContext';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, LineChart, Line, Legend, AreaChart, Area } from 'recharts';
import { Download, FileText, Filter, Clock, Users, CalendarDays, TrendingUp, AlertTriangle, UserCheck, ListOrdered, Printer, BarChart3, HeartPulse, MapPin, Search, RefreshCw, Stethoscope, Brain, Ear, Dumbbell, Hand, Apple, Heart, Users2, type LucideIcon } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { openPrintDocument } from '@/lib/printLayout';
import logoSmsFallback from '@/assets/logo-sms-oriximina.jpeg';
import logoCerFallback from '@/assets/logo-cer-ii.png';
import { useUnidadeFilter } from '@/hooks/useUnidadeFilter';
import { ChartCard } from '@/components/ChartCard';
import { useRealtimeSubscription } from '@/hooks/useRealtimeSubscription';

const COLORS = ['hsl(199, 89%, 38%)', 'hsl(168, 60%, 42%)', 'hsl(45, 93%, 47%)', 'hsl(0, 72%, 51%)', 'hsl(262, 83%, 58%)', 'hsl(200, 18%, 46%)', 'hsl(280, 60%, 50%)', 'hsl(30, 80%, 50%)'];

const statusLabels: Record<string, string> = {
  pendente: 'Pendente', 
  confirmado: 'Confirmado', 
  confirmado_chegada: 'Chegou',
  em_atendimento: 'Em Atendimento', 
  concluido: 'Concluído', 
  falta: 'Falta',
  cancelado: 'Cancelado', 
  remarcado: 'Remarcado', 
  atraso: 'Atraso',
};

const normalizeStatus = (status: string): string => {
  if (!status) return 'pendente';
  const s = status.toLowerCase().trim();
  
  // Concluídos / Realizados
  if ([
    'concluido', 'concluído', 'finalizado', 'atendido', 'realizado', 
    'atendimento_realizado', 'atendimento_finalizado', 'prontuario_finalizado', 
    'prontuario_concluido', 'finalizada', 'concluida'
  ].includes(s)) {
    return 'concluido';
  }
  // Faltas
  if (['falta', 'faltou', 'ausente', 'nao compareceu', 'nao_compareceu', 'não compareceu'].includes(s)) {
    return 'falta';
  }
  // Cancelados
  if (['cancelado', 'cancelada', 'cancelamento'].includes(s)) {
    return 'cancelado';
  }
  // Remarcados
  if (['remarcado', 'reagendado', 'reagendada'].includes(s)) {
    return 'remarcado';
  }
  // Pendentes / Em andamento
  if ([
    'pendente', 'aguardando', 'confirmado', 'confirmada', 'agendado', 
    'apto', 'apto_atendimento', 'apto_para_atendimento', 'em_atendimento', 
    'aguardando_triagem', 'confirmado_chegada', 'atraso'
  ].includes(s)) {
    return 'pendente';
  }
  return s;
};

interface AgendamentoDB {
  id: string;
  paciente_id: string;
  paciente_nome: string;
  profissional_id: string;
  profissional_nome: string;
  unidade_id: string;
  sala_id: string;
  setor_id: string;
  data: string;
  hora: string;
  status: string;
  tipo: string;
  origem: string;
  unidadeId?: string;
  profissionalId?: string;
  pacienteId?: string;
  pacienteNome?: string;
  profissionalNome?: string;
  setorId?: string;
}

interface AtendimentoDB {
  id: string; agendamento_id: string; paciente_id: string; paciente_nome: string;
  profissional_id: string; profissional_nome: string; unidade_id: string;
  sala_id: string; setor: string; procedimento: string; data: string;
  hora_inicio: string; hora_fim: string; duracao_minutos: number | null; status: string;
}

interface FilaDB {
  id: string; paciente_id: string; paciente_nome: string; unidade_id: string;
  profissional_id: string | null; setor: string; prioridade: string;
  prioridade_perfil: string; status: string; posicao: number;
  hora_chegada: string; hora_chamada: string | null; criado_em: string;
}

interface TriagemDB {
  id: string; agendamento_id: string; tecnico_id: string;
  criado_em: string | null; confirmado_em: string | null; iniciado_em: string | null;
}

const Relatorios: React.FC = () => {
  const { pacientes, funcionarios, unidades } = useData();
  const resolvePaciente = usePacienteNomeResolver();
  const { user } = useAuth();
  const [activeTab, setActiveTab] = useState('geral');
  const [filterRoleProd, setFilterRoleProd] = useState('all');
  const [filterCargoProd, setFilterCargoProd] = useState('all');
  const [prodViewMode, setProdViewMode] = useState<'tabela' | 'grafico'>('tabela');
  const [timelineGroup, setTimelineGroup] = useState<'dia' | 'semana' | 'mes'>('dia');
  const [filterUnit, setFilterUnit] = useState('all');
  const [filterProf, setFilterProf] = useState('all');
  const [filterStatus, setFilterStatus] = useState('all');
  const [filterSetor, setFilterSetor] = useState('all');
  const [filterTipo, setFilterTipo] = useState('all');
  
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');

  const [agendamentosDB, setAgendamentosDB] = useState<AgendamentoDB[]>([]);
  const [totalCountAg, setTotalCountAg] = useState(0);
  const [atendimentosDB, setAtendimentosDB] = useState<AtendimentoDB[]>([]);
  const [filaDB, setFilaDB] = useState<FilaDB[]>([]);
  const [triagensDB, setTriagensDB] = useState<TriagemDB[]>([]);
  const [procedimentosDB, setProcedimentosDB] = useState<{ prontuario_id: string; procedimento_id: string; proc_nome?: string; prof_nome?: string; unidade_id?: string; data?: string }[]>([]);
  const [treatmentCycles, setTreatmentCycles] = useState<any[]>([]);
  const [prontuariosDB, setProntuariosDB] = useState<any[]>([]);
  const [treatmentSessions, setTreatmentSessions] = useState<any[]>([]);
  const [nursingEvals, setNursingEvals] = useState<any[]>([]);
  const [multiEvals, setMultiEvals] = useState<any[]>([]);
  const [ptsData, setPtsData] = useState<any[]>([]);
  
  const [isLoading, setIsLoading] = useState(false);
  const [lastUpdated, setLastUpdated] = useState<Date>(new Date());
  const [lastUpdatedLabel, setLastUpdatedLabel] = useState('agora');

  const [mapaDateFrom, setMapaDateFrom] = useState('');
  const [mapaDateTo, setMapaDateTo] = useState('');
  const [mapaData, setMapaData] = useState<Array<{
    num: number; paciente_nome: string; cns: string; telefone: string;
    profissional_nome: string; profissional_id: string; especialidade: string; cid: string;
    tipo: string; cpf: string; data_nascimento: string; endereco: string;
    procedimento_sigtap: string; nome_procedimento: string;
  }>>([]);
  const [mapaGenerated, setMapaGenerated] = useState(false);
  const [mapaLoading, setMapaLoading] = useState(false);
  const [mapaProf, setMapaProf] = useState('all');

  const { unidadesVisiveis, profissionaisVisiveis } = useUnidadeFilter();
  const profissionais = profissionaisVisiveis;
  const tecnicos = funcionarios.filter(f => f.role === 'tecnico' && f.ativo);

  const isFetchingRef = useRef(false);

  const loadReportData = useCallback(async () => {
    if (isFetchingRef.current) return;
    isFetchingRef.current = true;
    setIsLoading(true);
    try {
      const applyFilters = (query: any, unitCol = 'unidade_id', profCol = 'profissional_id', dateCol = 'data', useZ = true) => {
        let q = query;
        
        // Filter by Unit
        if (filterUnit !== 'all') {
          q = q.eq(unitCol, filterUnit);
        } else {
          // If "All Units" is selected, handle permissions
          const isMasterGlobal = user?.role === 'master' && (!user?.unidadeId || user?.usuario === 'admin.sms');
          if (!isMasterGlobal && user?.unidadeId) {
            q = q.eq(unitCol, user.unidadeId);
          }
        }
        
        // Filter by Professional
        if (filterProf !== 'all') {
          q = q.eq(profCol, filterProf);
        } else if (user?.role === 'profissional' && user.id) {
          q = q.eq(profCol, user.id);
        }

        // Filter by Date Range - ENSURE INCLUSIVE DATES AND HANDLE TIMEZONES
        if (dateFrom) {
          if (dateCol.includes('criado_em') || dateCol.includes('created_at') || dateCol.includes('_at')) {
            q = q.gte(dateCol, `${dateFrom}T00:00:00.000Z`);
          } else {
            q = q.gte(dateCol, dateFrom);
          }
        }
        
        if (dateTo) {
          if (dateCol.includes('criado_em') || dateCol.includes('created_at') || dateCol.includes('_at')) {
            q = q.lte(dateCol, `${dateTo}T23:59:59.999Z`);
          } else {
            q = q.lte(dateCol, dateTo);
          }
        }

        return q;
      };

      const MAX_RECORDS = 50000; 

      // 1. Agendamentos - FETCH FULL COUNT AND DATA
      let qAg = supabase.from('agendamentos').select('*', { count: 'exact' }).order('data', { ascending: false }).limit(MAX_RECORDS);
      qAg = applyFilters(qAg, 'unidade_id', 'profissional_id', 'data');

      // 2. Atendimentos
      let qAt = supabase.from('atendimentos').select('*').order('data', { ascending: false }).limit(MAX_RECORDS);
      qAt = applyFilters(qAt, 'unidade_id', 'profissional_id', 'data');

      // 3. Fila de Espera
      let qFila = supabase.from('fila_espera').select('*').order('criado_em', { ascending: false }).limit(MAX_RECORDS);
      qFila = applyFilters(qFila, 'unidade_id', 'profissional_id', 'criado_em');

      // 4. Triagem
      let qTriage = supabase.from('triage_records').select('*').order('criado_em', { ascending: false }).limit(MAX_RECORDS);
      if (dateFrom) qTriage = qTriage.gte('criado_em', `${dateFrom}T00:00:00.000Z`);
      if (dateTo) qTriage = qTriage.lte('criado_em', `${dateTo}T23:59:59.999Z`);
      if (user?.role === 'tecnico' && user.id) qTriage = qTriage.eq('tecnico_id', user.id);

      // 5. Procedimentos
      let qProc = supabase.from('prontuario_procedimentos')
        .select('prontuario_id, procedimento_id, procedimentos:procedimento_id(nome), prontuarios:prontuario_id(profissional_nome,unidade_id,data_atendimento,profissional_id)')
        .order('criado_em', { ascending: false }).limit(MAX_RECORDS);
      if (dateFrom) qProc = qProc.gte('criado_em', `${dateFrom}T00:00:00.000Z`);
      if (dateTo) qProc = qProc.lte('criado_em', `${dateTo}T23:59:59.999Z`);

      // 6. Prontuários (Primary source for "Atendimentos Realizados")
      let qPront = supabase.from('prontuarios').select('*').order('data_atendimento', { ascending: false }).limit(MAX_RECORDS);
      qPront = applyFilters(qPront, 'unidade_id', 'profissional_id', 'data_atendimento');

      // 7. Treatment Cycles
      let qCycles = supabase.from('treatment_cycles').select('*').order('start_date', { ascending: false }).limit(MAX_RECORDS);
      qCycles = applyFilters(qCycles, 'unit_id', 'professional_id', 'start_date');

      // 8. Treatment Sessions
      let qSessions = supabase.from('treatment_sessions').select('*').order('scheduled_date', { ascending: false }).limit(MAX_RECORDS);
      if (dateFrom) qSessions = qSessions.gte('scheduled_date', dateFrom);
      if (dateTo) qSessions = qSessions.lte('scheduled_date', dateTo);
      if (user?.role === 'profissional') qSessions = qSessions.eq('professional_id', user.id);

      // 9. Nursing Evaluations
      let qNursing = supabase.from('nursing_evaluations').select('*').order('evaluation_date', { ascending: false }).limit(MAX_RECORDS);
      qNursing = applyFilters(qNursing, 'unit_id', 'professional_id', 'evaluation_date', false);

      // 10. Multiprofessional Evaluations
      let qMulti = supabase.from('multiprofessional_evaluations').select('*').order('evaluation_date', { ascending: false }).limit(MAX_RECORDS);
      qMulti = applyFilters(qMulti, 'unit_id', 'professional_id', 'evaluation_date', false);

      // 11. PTS
      let qPts = supabase.from('pts').select('*').order('created_at', { ascending: false }).limit(MAX_RECORDS);
      qPts = applyFilters(qPts, 'unit_id', 'professional_id', 'created_at');

      const results = await Promise.all([
        qAg, qAt, qFila, qTriage, qProc, qPront, qCycles, qSessions, qNursing, qMulti, qPts
      ]);

      if (results[0].data) {
        setAgendamentosDB(results[0].data.map(a => ({
          ...a,
          unidadeId: a.unidade_id,
          profissionalId: a.profissional_id,
          pacienteId: a.paciente_id,
          pacienteNome: a.paciente_nome,
          profissionalNome: a.profissional_nome,
          setorId: a.setor_id
        })));
        setTotalCountAg(results[0].count || results[0].data?.length || 0);
      }
      if (results[1].data) setAtendimentosDB(results[1].data);
      if (results[2].data) setFilaDB(results[2].data);
      if (results[3].data) setTriagensDB(results[3].data as TriagemDB[]);
      if (results[4].data) {
        setProcedimentosDB(results[4].data.map((r: any) => ({
          prontuario_id: r.prontuario_id,
          procedimento_id: r.procedimento_id,
          proc_nome: r.procedimentos?.nome || '',
          prof_nome: r.prontuarios?.profissional_nome || '',
          unidade_id: r.prontuarios?.unidade_id || '',
          data: r.prontuarios?.data_atendimento || '',
        })));
      }
      if (results[5].data) setProntuariosDB(results[5].data);
      if (results[6].data) setTreatmentCycles(results[6].data);
      if (results[7].data) setTreatmentSessions(results[7].data);
      if (results[8].data) setNursingEvals(results[8].data);
      if (results[9].data) setMultiEvals(results[9].data);
      if (results[10].data) setPtsData(results[10].data);
      
      setLastUpdated(new Date());
    } catch (err) { 
      console.error('Error loading report data:', err); 
    } finally {
      setIsLoading(false);
      isFetchingRef.current = false;
    }
  }, [user?.id, user?.role, user?.unidadeId, dateFrom, dateTo, filterUnit, filterProf]);

  useEffect(() => {
    loadReportData();
  }, [loadReportData]);

  useRealtimeSubscription({
    tables: ['agendamentos', 'atendimentos', 'prontuarios', 'fila_espera'],
    onchange: () => {
      // Small delay to avoid rapid successive calls
      setTimeout(() => loadReportData(), 1000);
    },
    enabled: true,
    debounceMs: 5000,
  });

  const generateMapaAtendimento = useCallback(async () => {
    setMapaLoading(true);
    try {
      let query = supabase.from('agendamentos').select('*').order('data', { ascending: true });

      if (mapaDateFrom) query = query.gte('data', mapaDateFrom);
      else if (dateFrom) query = query.gte('data', dateFrom);
      
      if (mapaDateTo) query = query.lte('data', mapaDateTo);
      else if (dateTo) query = query.lte('data', dateTo);

      if (mapaProf !== 'all') query = query.eq('profissional_id', mapaProf);
      else if (filterProf !== 'all') query = query.eq('profissional_id', filterProf);

      if (filterUnit !== 'all') query = query.eq('unidade_id', filterUnit);

      const { data, error } = await query.limit(10000);
      if (error) throw error;

      // Enrich with patient data
      const pacIds = Array.from(new Set(data.map(a => a.paciente_id))).filter(Boolean);
      const { data: pacs } = await supabase.from('pacientes').select('id, cns, telefone, cpf, data_nascimento, endereco').in('id', pacIds);
      const pacMap = new Map(pacs?.map(p => [p.id, p]));

      // Enrich with professional data (for specialty)
      const profIds = Array.from(new Set(data.map(a => a.profissional_id))).filter(Boolean);
      const { data: profs } = await supabase.from('funcionarios').select('id, profissao').in('id', profIds);
      const profMap = new Map(profs?.map(p => [p.id, p]));

      const mapped = data.map((a: any, index: number) => {
        const p = pacMap.get(a.paciente_id);
        const f = profMap.get(a.profissional_id);
        return {
          num: index + 1,
          paciente_nome: a.paciente_nome,
          cns: p?.cns || '',
          telefone: p?.telefone || '',
          profissional_nome: a.profissional_nome,
          profissional_id: a.profissional_id,
          especialidade: f?.profissao || '',
          cid: '',
          tipo: a.tipo,
          cpf: p?.cpf || '',
          data_nascimento: p?.data_nascimento || '',
          endereco: p?.endereco || '',
          procedimento_sigtap: '',
          nome_procedimento: ''
        };
      });

      setMapaData(mapped);
      setMapaGenerated(true);
    } catch (err) {
      console.error('Error generating mapa:', err);
    } finally {
      setMapaLoading(false);
    }
  }, [mapaDateFrom, mapaDateTo, mapaProf, dateFrom, dateTo, filterProf, filterUnit]);

  useEffect(() => {
    const interval = setInterval(() => {
      const diffSec = Math.round((Date.now() - lastUpdated.getTime()) / 1000);
      if (diffSec < 10) setLastUpdatedLabel('agora');
      else if (diffSec < 60) setLastUpdatedLabel(`há ${diffSec}s`);
      else if (diffSec < 3600) setLastUpdatedLabel(`há ${Math.floor(diffSec / 60)}min`);
      else setLastUpdatedLabel(`há ${Math.floor(diffSec / 3600)}h`);
    }, 10000);
    return () => clearInterval(interval);
  }, [lastUpdated]);

  const setoresUnicos = useMemo(() => {
    const s = new Set([...atendimentosDB.map(a => a.setor), ...agendamentosDB.map(a => a.tipo)].filter(Boolean));
    return Array.from(s).sort();
  }, [atendimentosDB, agendamentosDB]);

  const tiposUnicos = useMemo(() => {
    const s = new Set(agendamentosDB.map(a => a.tipo).filter(Boolean));
    return Array.from(s).sort();
  }, [agendamentosDB]);

  const filtered = useMemo(() => {
    return agendamentosDB.filter(a => {
      if (filterStatus !== 'all' && normalizeStatus(a.status) !== filterStatus) return false;
      if (filterTipo !== 'all' && a.tipo !== filterTipo) return false;
      if (filterSetor !== 'all' && (a.setor_id !== filterSetor && a.tipo !== filterSetor)) return false;
      return true;
    });
  }, [agendamentosDB, filterStatus, filterTipo, filterSetor]);

  const filteredAtendimentos = useMemo(() => {
    return atendimentosDB.filter(a => {
      if (filterSetor !== 'all' && a.setor !== filterSetor) return false;
      return true;
    });
  }, [atendimentosDB, filterSetor]);

  const stats = useMemo(() => {
    const total = Math.max(filtered.length, totalCountAg);
    
    // Set of agendamento IDs that resulted in a concluded attendance
    const concludedAgIds = new Set<string>();
    
    // 1. From agendamentos with concluded status
    filtered.forEach(a => {
      if (normalizeStatus(a.status) === 'concluido') {
        concludedAgIds.add(a.id);
      }
    });
    
    // 2. From prontuarios (existence of a prontuario implies completion)
    const filteredPronts = prontuariosDB.filter(p => {
      if (filterUnit !== 'all' && p.unidade_id !== filterUnit) return false;
      if (filterProf !== 'all' && p.profissional_id !== filterProf) return false;
      return true;
    });
    
    filteredPronts.forEach(p => {
      if (p.agendamento_id) {
        concludedAgIds.add(p.agendamento_id);
      }
    });

    // 3. From treatment sessions
    const filteredSess = treatmentSessions.filter(s => {
      if (s.status !== 'realizada') return false;
      if (filterProf !== 'all' && s.professional_id !== filterProf) return false;
      // We don't have unit_id easily in sessions sometimes, but we filter if we do
      return true;
    });

    filteredSess.forEach(s => {
      if (s.appointment_id) {
        concludedAgIds.add(s.appointment_id);
      }
    });

    const concluidosAg = concludedAgIds.size;

    // Count completions that are NOT linked to an agendamento
    const unlinkedPronts = filteredPronts.filter(p => !p.agendamento_id).length;
    const unlinkedSess = filteredSess.filter(s => !s.appointment_id).length;
    
    // Total Realized = Concluded Agendamentos + Extra Prontuarios + Extra Sessions
    const totalConcluidos = concluidosAg + unlinkedPronts + unlinkedSess;
    const concluidos = totalConcluidos;

    const pendentes = filtered.filter(a => {
      const s = normalizeStatus(a.status);
      if (s === 'concluido' || s === 'falta' || s === 'cancelado' || s === 'remarcado') return false;
      // If there's a prontuario for it, it's not pending anymore
      if (concludedAgIds.has(a.id)) return false;
      return true;
    }).length;

    const confirmados = filtered.filter(a => a.status === 'confirmado' || a.status === 'confirmada' || a.status === 'confirmado_chegada').length;
    const emAtendimento = filtered.filter(a => a.status === 'em_atendimento').length;
    const faltas = filtered.filter(a => normalizeStatus(a.status) === 'falta').length;
    const cancelados = filtered.filter(a => normalizeStatus(a.status) === 'cancelado').length;
    const remarcados = filtered.filter(a => normalizeStatus(a.status) === 'remarcado').length;
    
    const retornos = filtered.filter(a => {
      const t = (a.tipo || '').toLowerCase();
      return t.includes('retorno') || t.includes('atendimento_retorno') || t.includes('consulta_retorno');
    }).length;
    
    const primeiraConsulta = filtered.filter(a => {
      const t = (a.tipo || '').toLowerCase();
      return (t.includes('consulta') || t.includes('primeira')) && !t.includes('retorno');
    }).length;
    
    const validTotal = Math.max(1, total - cancelados);
    const taxaComparecimento = Math.min(100, Math.round((concluidos / validTotal) * 100));
    const taxaFalta = Math.min(100, Math.round((faltas / validTotal) * 100));
    
    return { 
      total, confirmados, pendentes, concluidos, emAtendimento, faltas, cancelados, 
      remarcados, online: filtered.filter(a => a.origem === 'online').length, 
      recepcao: filtered.filter(a => a.origem === 'recepcao').length, 
      retornos, primeiraConsulta, taxaComparecimento, 
      taxaFalta, atendimentosRealizados: concluidos
    };
  }, [filtered, totalCountAg, filteredAtendimentos, prontuariosDB, treatmentSessions, filterUnit, filterProf]);

  const tempoStats = useMemo(() => {
    const finalizados = filteredAtendimentos.filter(a => a.status === 'finalizado' && a.duracao_minutos && a.duracao_minutos > 0);
    const totalMinutos = finalizados.reduce((s, a) => s + (a.duracao_minutos || 0), 0);
    const media = finalizados.length > 0 ? Math.round(totalMinutos / finalizados.length) : 0;
    return { totalAtendimentos: finalizados.length, tempoMedio: media, totalMinutos };
  }, [filteredAtendimentos]);

  const porProfissional = useMemo(() => {
    const map: Record<string, { 
      id: string; nome: string; role: string; profissao: string; unidade: string; 
      total: number; concluidos: number; faltas: number; cancelados: number; 
      remarcados: number; tempoTotal: number; atendimentos: number; 
      retornos: number; pacientesSet: Set<string>; 
      concludedAgIds: Set<string>;
    }> = {};
    
    const getMapEntry = (id: string, nome: string, unitId?: string) => {
      const key = id || nome;
      if (!map[key]) {
        const func = funcionarios.find(f => f.id === id);
        const un = unidades.find(u => u.id === unitId);
        map[key] = { 
          id, nome, role: func?.role || 'profissional', 
          profissao: func?.profissao || '', unidade: un?.nome || '', 
          total: 0, concluidos: 0, faltas: 0, cancelados: 0, remarcados: 0, 
          tempoTotal: 0, atendimentos: 0, retornos: 0, 
          pacientesSet: new Set(), concludedAgIds: new Set() 
        };
      }
      return map[key];
    };

    // 1. Process Agendamentos
    filtered.forEach(a => {
      const m = getMapEntry(a.profissionalId, a.profissionalNome, a.unidadeId);
      m.total++;
      m.pacientesSet.add(a.pacienteId);
      const statusNorm = normalizeStatus(a.status);
      if (statusNorm === 'concluido') {
        m.concluidos++;
        m.concludedAgIds.add(a.id);
      }
      if (statusNorm === 'falta') m.faltas++;
      if (statusNorm === 'cancelado') m.cancelados++;
      if (statusNorm === 'remarcado') m.remarcados++;
      if ((a.tipo || '').toLowerCase().includes('retorno')) m.retornos++;
    });

    // 2. Process Prontuários (Primary source for "Realized")
    prontuariosDB.forEach(p => {
      if (filterUnit !== 'all' && p.unidade_id !== filterUnit) return;
      const m = getMapEntry(p.profissional_id, p.profissional_nome, p.unidade_id);
      m.pacientesSet.add(p.paciente_id);
      if (p.agendamento_id) {
        if (!m.concludedAgIds.has(p.agendamento_id)) {
          m.concluidos++;
          m.concludedAgIds.add(p.agendamento_id);
        }
      } else {
        m.concluidos++;
      }
    });

    // 3. Process Treatment Sessions
    treatmentSessions.forEach(s => {
      if (s.status !== 'realizada') return;
      const m = getMapEntry(s.professional_id, 'Profissional', s.unit_id);
      m.pacientesSet.add(s.patient_id);
      if (s.appointment_id) {
        if (!m.concludedAgIds.has(s.appointment_id)) {
          m.concluidos++;
          m.concludedAgIds.add(s.appointment_id);
        }
      } else {
        m.concluidos++;
      }
    });

    // 4. Process Atendimentos (Legacy/Extra source)
    filteredAtendimentos.forEach(at => {
      const m = getMapEntry(at.profissional_id, at.profissional_nome, at.unidade_id);
      m.pacientesSet.add(at.paciente_id);
      const statusNorm = normalizeStatus(at.status);
      if (at.duracao_minutos && at.duracao_minutos > 0 && (statusNorm === 'concluido' || at.status === 'finalizado')) {
        m.tempoTotal += at.duracao_minutos;
        m.atendimentos++;
        if (at.agendamento_id) {
          if (!m.concludedAgIds.has(at.agendamento_id)) {
            m.concluidos++;
            m.concludedAgIds.add(at.agendamento_id);
          }
        } else {
          // If we can't link it, we assume it's a separate completion
          // But usually atendimentos are linked. If not, it's a direct entry.
          m.concluidos++;
        }
      }
    });

    return Object.values(map)
      .filter(d => filterRoleProd === 'all' || d.role === filterRoleProd)
      .filter(d => {
        if (filterCargoProd === 'all') return true;
        const cat = CATEGORIAS.find(c => c.key === filterCargoProd);
        if (!cat) return true;
        return profissionalPertenceCategoria(d.profissao, cat);
      })
      .map(d => ({
        id: d.id,
        nome: d.nome,
        role: d.role,
        profissao: d.profissao,
        unidade: d.unidade,
        total: d.total,
        concluidos: d.concluidos,
        faltas: d.faltas,
        cancelados: d.cancelados,
        remarcados: d.remarcados,
        retornos: d.retornos,
        atendimentos: d.atendimentos || d.concluidos, // Fallback for tempo medio
        tempoTotal: d.tempoTotal,
        pacientesAtendidos: d.pacientesSet.size,
        tempoMedio: d.atendimentos > 0 ? Math.round(d.tempoTotal / d.atendimentos) : 0,
        taxaConclusao: d.total > 0 ? Math.round((d.concluidos / d.total) * 100) : 0,
        taxaRetorno: d.total > 0 ? Math.round((d.retornos / d.total) * 100) : 0,
      })).sort((a, b) => b.total - a.total);
  }, [filtered, filteredAtendimentos, prontuariosDB, treatmentSessions, unidades, funcionarios, filterRoleProd, filterCargoProd, filterUnit]);

  const normalizarProfissao = (str: string) => {
    if (!str) return '';
    return str.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]/g, '');
  };

  const CATEGORIAS: Array<{ key: string; icon: LucideIcon; label: string; cor: string; bgLight: string; termos: string[] }> = [
    { key: 'medico', icon: Stethoscope, label: 'Médicos', cor: '#1B3A5C', bgLight: '#EEF2F7',
      termos: ['medico', 'medicina', 'doutora', 'doutor', 'clinicogeral', 'cirurgiao', 'cirurgia', 'infectologista', 'infectologia'] },
    { key: 'psicologo', icon: Brain, label: 'Psicólogos', cor: '#6B4C9A', bgLight: '#F3EEF9',
      termos: ['psicologo', 'psicologa', 'psicologia'] },
    { key: 'fonoaudiologo', icon: Ear, label: 'Fonoaudiólogos', cor: '#2E8B8B', bgLight: '#EEF7F7',
      termos: ['fonoaudiologo', 'fonoaudiologa', 'fonoaudiologia', 'fono'] },
    { key: 'fisioterapeuta', icon: Dumbbell, label: 'Fisioterapeutas', cor: '#2D7A4F', bgLight: '#EEF7F2',
      termos: ['fisioterapeuta', 'fisioterapia', 'fisio'] },
    { key: 'terapeuta_ocupacional', icon: Hand, label: 'T. Ocupacional', cor: '#C17B1A', bgLight: '#FDF5E8',
      termos: ['terapeutaocupacional', 'terapiaocupacional'] },
    { key: 'nutricionista', icon: Apple, label: 'Nutrição', cor: '#E05A2B', bgLight: '#FDF0EB',
      termos: ['nutricionista', 'nutricao', 'nutri'] },
    { key: 'enfermeiro', icon: Heart, label: 'Enfermagem', cor: '#B83232', bgLight: '#FDEAEA',
      termos: ['enfermeiro', 'enfermeira', 'enfermagem', 'tecnicoenfermagem', 'auxiliarenfermagem'] },
    { key: 'assistente_social', icon: Users2, label: 'Serviço Social', cor: '#3A6B9A', bgLight: '#EEF3F9',
      termos: ['assistentesocial', 'servicosocial'] },
    { key: 'odontologia', icon: Stethoscope, label: 'Odontologia', cor: '#0E7490', bgLight: '#ECFEFF',
      termos: ['odontologo', 'odontologa', 'odontologia', 'odontopediatra', 'odontopediatria', 'dentista'] },
  ];

  const profissionalPertenceCategoria = (profissao: string, cat: typeof CATEGORIAS[0]) => {
    const norm = normalizarProfissao(profissao);
    return cat.termos.some(termo => norm.includes(termo));
  };

  const categoriaCards = useMemo(() => {
    const profMap = new Map(funcionarios.map(f => [f.id, f]));
    const counts: Record<string, { total: number; concluidos: number; concludedAgIds: Set<string> }> = {};

    filtered.forEach(a => {
      const func = profMap.get(a.profissionalId);
      const profissao = func?.profissao || '';
      for (const cat of CATEGORIAS) {
          if (profissionalPertenceCategoria(profissao, cat)) {
            if (!counts[cat.key]) counts[cat.key] = { total: 0, concluidos: 0, concludedAgIds: new Set() };
            counts[cat.key].total++;
            if (normalizeStatus(a.status) === 'concluido') {
              counts[cat.key].concluidos++;
              counts[cat.key].concludedAgIds.add(a.id);
            }
            break;
          }
      }
    });

    // Add Prontuarios to categories
    prontuariosDB.forEach(p => {
      if (filterUnit !== 'all' && p.unidade_id !== filterUnit) return;
      const func = profMap.get(p.profissional_id);
      const profissao = func?.profissao || '';
      for (const cat of CATEGORIAS) {
        if (profissionalPertenceCategoria(profissao, cat)) {
          if (!counts[cat.key]) counts[cat.key] = { total: 0, concluidos: 0, concludedAgIds: new Set() };
          if (p.agendamento_id) {
            if (!counts[cat.key].concludedAgIds.has(p.agendamento_id)) {
              counts[cat.key].concluidos++;
              counts[cat.key].concludedAgIds.add(p.agendamento_id);
            }
          } else {
            counts[cat.key].concluidos++;
          }
          break;
        }
      }
    });

    return CATEGORIAS.map(cat => ({
      ...cat,
      total: counts[cat.key]?.total || 0,
      concluidos: counts[cat.key]?.concluidos || 0,
    }));
  }, [filtered, filteredAtendimentos, funcionarios]);

  const prodTotals = useMemo(() => {
    return porProfissional.reduce((acc, p) => ({
      total: acc.total + p.total,
      concluidos: acc.concluidos + p.concluidos,
      faltas: acc.faltas + p.faltas,
      cancelados: acc.cancelados + p.cancelados,
      remarcados: acc.remarcados + p.remarcados,
      retornos: acc.retornos + p.retornos,
    }), { total: 0, concluidos: 0, faltas: 0, cancelados: 0, remarcados: 0, retornos: 0 });
  }, [porProfissional]);

  const prodChartData = useMemo(() => {
    return porProfissional.filter(p => p.total > 0).map(p => ({
      nome: p.nome.length > 20 ? p.nome.substring(0, 20) + '…' : p.nome,
      nomeCompleto: p.nome,
      concluidos: p.concluidos,
      faltas: p.faltas,
      cancelados: p.cancelados,
      remarcados: p.remarcados,
    }));
  }, [porProfissional]);

  const porUnidade = useMemo(() => {
    const map: Record<string, { nome: string; total: number; concluidos: number; faltas: number; cancelados: number }> = {};
    filtered.forEach(a => {
      const un = unidades.find(u => u.id === a.unidadeId);
      const name = un?.nome || 'Desconhecida';
      if (!map[name]) map[name] = { nome: name, total: 0, concluidos: 0, faltas: 0, cancelados: 0 };
      map[name].total++;
      const statusNorm = normalizeStatus(a.status);
      if (statusNorm === 'concluido') map[name].concluidos++;
      if (statusNorm === 'falta') map[name].faltas++;
      if (statusNorm === 'cancelado') map[name].cancelados++;
    });
    return Object.values(map).sort((a, b) => b.total - a.total);
  }, [filtered, unidades]);

  const faltasReport = useMemo(() => {
    const faltaAgs = filtered.filter(a => normalizeStatus(a.status) === 'falta');
    const porPaciente: Record<string, { nome: string; email: string; telefone: string; profissional: string; unidade: string; datas: string[]; total: number }> = {};
    faltaAgs.forEach(a => {
      const pac = pacientes.find(p => p.id === a.pacienteId);
      const un = unidades.find(u => u.id === a.unidadeId);
      const key = a.pacienteId || a.pacienteNome;
      if (!porPaciente[key]) porPaciente[key] = { nome: a.pacienteNome, email: pac?.email || '', telefone: pac?.telefone || '', profissional: a.profissionalNome, unidade: un?.nome || '', datas: [], total: 0 };
      porPaciente[key].datas.push(a.data);
      porPaciente[key].total++;
    });
    return Object.values(porPaciente).sort((a, b) => b.total - a.total);
  }, [filtered, pacientes, unidades]);

  const pacientesReport = useMemo(() => {
    const pacIds = new Set(filtered.map(a => a.pacienteId));
    return Array.from(pacIds).map(pid => {
      const pac = pacientes.find(p => p.id === pid);
      const ags = filtered.filter(a => a.pacienteId === pid);
      const concluidos = ags.filter(a => normalizeStatus(a.status) === 'concluido').length;
      const faltas = ags.filter(a => normalizeStatus(a.status) === 'falta').length;
      const retornos = ags.filter(a => a.tipo === 'Retorno').length;
      return {
        id: pid,
        nome: pac?.nome || ags[0]?.pacienteNome || 'Desconhecido',
        email: pac?.email || '',
        telefone: pac?.telefone || '',
        totalAgendamentos: ags.length,
        concluidos,
        faltas,
        retornos,
        ultimaConsulta: ags.sort((a, b) => b.data.localeCompare(a.data))[0]?.data || '',
      };
    }).sort((a, b) => b.totalAgendamentos - a.totalAgendamentos);
  }, [filtered, pacientes]);

  const filaReport = useMemo(() => {
    const filteredFila = filaDB.filter(f => {
      if (filterUnit !== 'all' && f.unidade_id !== filterUnit) return false;
      if (filterProf !== 'all' && f.profissional_id !== filterProf) return false;
      return true;
    });
    const aguardando = filteredFila.filter(f => f.status === 'aguardando').length;
    const chamados = filteredFila.filter(f => f.status === 'chamado' || f.status === 'atendido').length;
    const desistencias = filteredFila.filter(f => f.status === 'desistiu' || f.status === 'cancelado').length;
    return { items: filteredFila.sort((a, b) => a.posicao - b.posicao), aguardando, chamados, desistencias, total: filteredFila.length };
  }, [filaDB, filterUnit, filterProf]);

  const triagemReport = useMemo(() => {
    const filteredTriagens = triagensDB.filter(t => {
      if (dateFrom && t.criado_em && t.criado_em < dateFrom) return false;
      if (dateTo && t.criado_em && t.criado_em > dateTo + 'T23:59:59') return false;
      return true;
    });
    const total = filteredTriagens.length;
    const confirmadas = filteredTriagens.filter(t => t.confirmado_em).length;
    const pendentes = total - confirmadas;

    const porTecnico: Record<string, { id: string; nome: string; total: number; confirmadas: number; pendentes: number }> = {};
    filteredTriagens.forEach(t => {
      const tec = funcionarios.find(f => f.id === t.tecnico_id);
      const nome = tec?.nome || 'Desconhecido';
      if (!porTecnico[t.tecnico_id]) porTecnico[t.tecnico_id] = { id: t.tecnico_id, nome, total: 0, confirmadas: 0, pendentes: 0 };
      porTecnico[t.tecnico_id].total++;
      if (t.confirmado_em) porTecnico[t.tecnico_id].confirmadas++;
      else porTecnico[t.tecnico_id].pendentes++;
    });

    return { total, confirmadas, pendentes, porTecnico: Object.values(porTecnico).sort((a, b) => b.total - a.total) };
  }, [triagensDB, funcionarios, dateFrom, dateTo]);

  const timelineData = useMemo(() => {
    const map: Record<string, { data: string; agendamentos: number; concluidos: number; faltas: number }> = {};
    filtered.forEach(a => {
      if (!map[a.data]) map[a.data] = { data: a.data, agendamentos: 0, concluidos: 0, faltas: 0 };
      map[a.data].agendamentos++;
      const statusNorm = normalizeStatus(a.status);
      if (statusNorm === 'concluido') map[a.data].concluidos++;
      if (statusNorm === 'falta') map[a.data].faltas++;
    });
    return Object.values(map).sort((a, b) => a.data.localeCompare(b.data)).slice(-30);
  }, [filtered]);

  const statusData = useMemo(() => [
    { name: 'Confirmados', value: stats.confirmados },
    { name: 'Pendentes', value: stats.pendentes },
    { name: 'Concluídos', value: stats.concluidos },
    { name: 'Em Atendimento', value: stats.emAtendimento },
    { name: 'Faltas', value: stats.faltas },
    { name: 'Cancelados', value: stats.cancelados },
    { name: 'Remarcados', value: stats.remarcados },
  ].filter(d => d.value > 0), [stats]);

  const timelineGrouped = useMemo(() => {
    const map: Record<string, { label: string; concluidos: number; faltas: number; cancelados: number }> = {};
    filtered.forEach(a => {
      let key: string;
      const d = new Date(a.data + 'T12:00:00');
      if (timelineGroup === 'dia') {
        key = a.data;
      } else if (timelineGroup === 'semana') {
        const startOfWeek = new Date(d);
        startOfWeek.setDate(d.getDate() - d.getDay());
        key = startOfWeek.toISOString().split('T')[0];
      } else {
        key = a.data.substring(0, 7);
      }
      if (!map[key]) {
        const label = timelineGroup === 'mes'
          ? d.toLocaleDateString('pt-BR', { month: 'short', year: '2-digit' })
          : timelineGroup === 'semana'
          ? `Sem ${key.substring(5)}`
          : key.substring(5);
        map[key] = { label, concluidos: 0, faltas: 0, cancelados: 0 };
      }
      const statusNorm = normalizeStatus(a.status);
      if (statusNorm === 'concluido') map[key].concluidos++;
      if (statusNorm === 'falta') map[key].faltas++;
      if (statusNorm === 'cancelado') map[key].cancelados++;
    });
    return Object.entries(map).sort(([a], [b]) => a.localeCompare(b)).map(([, v]) => v).slice(-30);
  }, [filtered, timelineGroup]);

  const peakHoursData = useMemo(() => {
    const map: Record<string, number> = {};
    for (let h = 7; h <= 18; h++) {
      const label = `${String(h).padStart(2, '0')}:00`;
      map[label] = 0;
    }
    filtered.forEach(a => {
      const hourKey = (a.hora || '').substring(0, 2);
      const h = parseInt(hourKey);
      if (h >= 7 && h <= 18) {
        const label = `${String(h).padStart(2, '0')}:00`;
        map[label] = (map[label] || 0) + 1;
      }
    });
    return Object.entries(map).map(([hora, total]) => ({ hora, total }));
  }, [filtered]);

  const novosVsRetorno = useMemo(() => {
    const retornos = filtered.filter(a => a.tipo === 'Retorno').length;
    const novos = filtered.length - retornos;
    return [
      { name: 'Novos', value: novos },
      { name: 'Retorno', value: retornos },
    ].filter(d => d.value > 0);
  }, [filtered]);

  const faltasPorUnidade = useMemo(() => {
    const map: Record<string, { name: string; value: number }> = {};
    filtered.filter(a => a.status === 'falta').forEach(a => {
      const un = unidades.find(u => u.id === a.unidadeId);
      const name = un?.nome || 'Desconhecida';
      if (!map[name]) map[name] = { name, value: 0 };
      map[name].value++;
    });
    return Object.values(map).sort((a, b) => b.value - a.value);
  }, [filtered, unidades]);

  const evolucaoMensal = useMemo(() => {
    const meses = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];
    const map: Record<string, number> = {};
    filtered.filter(a => normalizeStatus(a.status) === 'concluido').forEach(a => {
      const key = a.data.substring(0, 7);
      map[key] = (map[key] || 0) + 1;
    });
    return Object.entries(map).sort(([a], [b]) => a.localeCompare(b)).map(([key, total]) => {
      const [, m] = key.split('-');
      return { mes: meses[parseInt(m) - 1] || key, total };
    });
  }, [filtered]);

  const rankingProdutividade = useMemo(() => {
    return porProfissional.map(p => ({
      nome: p.nome,
      total: p.concluidos,
      role: p.role,
      fill: p.role === 'master' ? 'hsl(0,72%,51%)' : p.role === 'coordenador' ? 'hsl(199,89%,38%)' : 'hsl(152,60%,42%)',
    })).filter(p => p.total > 0).sort((a, b) => b.total - a.total);
  }, [porProfissional]);

  const procedimentoStats = useMemo(() => {
    const filteredProcs = procedimentosDB.filter(p => {
      if (filterUnit !== 'all' && p.unidade_id !== filterUnit) return false;
      if (dateFrom && p.data && p.data < dateFrom) return false;
      if (dateTo && p.data && p.data > dateTo) return false;
      return true;
    });
    const byProc: Record<string, number> = {};
    const byProf: Record<string, number> = {};
    const byUnit: Record<string, number> = {};
    filteredProcs.forEach(p => {
      byProc[p.proc_nome || 'Desconhecido'] = (byProc[p.proc_nome || 'Desconhecido'] || 0) + 1;
      byProf[p.prof_nome || 'Desconhecido'] = (byProf[p.prof_nome || 'Desconhecido'] || 0) + 1;
      const un = unidades.find(u => u.id === p.unidade_id);
      byUnit[un?.nome || 'Desconhecida'] = (byUnit[un?.nome || 'Desconhecida'] || 0) + 1;
    });
    return {
      total: filteredProcs.length,
      byProcedure: Object.entries(byProc).map(([nome, total]) => ({ nome, total })).sort((a, b) => b.total - a.total),
      byProfessional: Object.entries(byProf).map(([nome, total]) => ({ nome, total })).sort((a, b) => b.total - a.total),
      byUnit: Object.entries(byUnit).map(([nome, total]) => ({ nome, total })).sort((a, b) => b.total - a.total),
    };
  }, [procedimentosDB, filterUnit, dateFrom, dateTo, unidades]);

  const treatmentStats = useMemo(() => {
    const filteredCycles = treatmentCycles.filter(c => {
      if (filterUnit !== 'all' && c.unit_id !== filterUnit) return false;
      if (filterProf !== 'all' && c.professional_id !== filterProf) return false;
      if (dateFrom && c.start_date < dateFrom) return false;
      if (dateTo && c.start_date > dateTo) return false;
      return true;
    });
    const filteredSessions = treatmentSessions.filter(s => {
      if (filterProf !== 'all' && s.professional_id !== filterProf) return false;
      if (dateFrom && s.scheduled_date < dateFrom) return false;
      if (dateTo && s.scheduled_date > dateTo) return false;
      return true;
    });

    const ativos = filteredCycles.filter(c => c.status === 'em_andamento').length;
    const finalizados = filteredCycles.filter(c => c.status === 'finalizado_alta').length;
    const suspensos = filteredCycles.filter(c => c.status === 'suspenso').length;
    const total = filteredCycles.length;

    const sessRealizadas = filteredSessions.filter(s => s.status === 'realizada').length;
    const sessFaltas = filteredSessions.filter(s => s.status === 'paciente_faltou').length;
    const sessCanceladas = filteredSessions.filter(s => s.status === 'cancelada').length;
    const totalSessions = filteredSessions.length;

    const pacientesMap = new Map<string, number>();
    filteredCycles.forEach(c => pacientesMap.set(c.patient_id, (pacientesMap.get(c.patient_id) || 0) + c.sessions_done));
    const avgSessoesPorPaciente = pacientesMap.size > 0
      ? Math.round(Array.from(pacientesMap.values()).reduce((a, b) => a + b, 0) / pacientesMap.size)
      : 0;

    const taxaAbandono = total > 0 ? Math.round(((suspensos) / total) * 100) : 0;

    const byProf: Record<string, { nome: string; ativos: number; finalizados: number; sessoes: number }> = {};
    filteredCycles.forEach(c => {
      const prof = funcionarios.find(f => f.id === c.professional_id);
      const nome = prof?.nome || 'Desconhecido';
      if (!byProf[c.professional_id]) byProf[c.professional_id] = { nome, ativos: 0, finalizados: 0, sessoes: 0 };
      if (c.status === 'em_andamento') byProf[c.professional_id].ativos++;
      if (c.status === 'finalizado_alta') byProf[c.professional_id].finalizados++;
      byProf[c.professional_id].sessoes += c.sessions_done;
    });

    const byUnit: Record<string, { nome: string; total: number; ativos: number }> = {};
    filteredCycles.forEach(c => {
      const un = unidades.find(u => u.id === c.unit_id);
      const nome = un?.nome || 'Desconhecida';
      if (!byUnit[c.unit_id]) byUnit[c.unit_id] = { nome, total: 0, ativos: 0 };
      byUnit[c.unit_id].total++;
      if (c.status === 'em_andamento') byUnit[c.unit_id].ativos++;
    });

    const byType: Record<string, number> = {};
    filteredCycles.forEach(c => {
      byType[c.treatment_type || 'Outros'] = (byType[c.treatment_type || 'Outros'] || 0) + 1;
    });

    return {
      total, ativos, finalizados, suspensos,
      totalSessions, sessRealizadas, sessFaltas, sessCanceladas,
      avgSessoesPorPaciente, taxaAbandono,
      byProfessional: Object.values(byProf).sort((a, b) => b.sessoes - a.sessoes),
      byUnit: Object.values(byUnit).sort((a, b) => b.total - a.total),
      byType: Object.entries(byType).map(([nome, total]) => ({ nome, total })).sort((a, b) => b.total - a.total),
    };
  }, [treatmentCycles, treatmentSessions, filterUnit, filterProf, dateFrom, dateTo, funcionarios, unidades]);

  const nursingReport = useMemo(() => {
    const filteredNursing = nursingEvals.filter((n: any) => {
      if (filterUnit !== 'all' && n.unit_id !== filterUnit) return false;
      if (dateFrom && n.evaluation_date < dateFrom) return false;
      if (dateTo && n.evaluation_date > dateTo) return false;
      return true;
    });
    const total = filteredNursing.length;
    const aptos = filteredNursing.filter((n: any) => n.resultado === 'apto').length;
    const inaptos = filteredNursing.filter((n: any) => n.resultado === 'inapto').length;
    const multiprof = filteredNursing.filter((n: any) => n.resultado === 'multiprofissional').length;
    const byPriority: Record<string, number> = {};
    filteredNursing.forEach((n: any) => { byPriority[n.prioridade || 'media'] = (byPriority[n.prioridade || 'media'] || 0) + 1; });
    return { total, aptos, inaptos, multiprof, byPriority: Object.entries(byPriority).map(([k, v]) => ({ nome: k === 'alta' ? 'Alta' : k === 'media' ? 'Média' : 'Baixa', total: v })) };
  }, [nursingEvals, filterUnit, dateFrom, dateTo]);

  const multiReport = useMemo(() => {
    const filteredMulti = multiEvals.filter((m: any) => {
      if (filterUnit !== 'all' && m.unit_id !== filterUnit) return false;
      if (dateFrom && m.evaluation_date < dateFrom) return false;
      if (dateTo && m.evaluation_date > dateTo) return false;
      return true;
    });
    const total = filteredMulti.length;
    const bySpecialty: Record<string, number> = {};
    filteredMulti.forEach((m: any) => { bySpecialty[m.specialty || 'Outros'] = (bySpecialty[m.specialty || 'Outros'] || 0) + 1; });
    const byParecer: Record<string, number> = {};
    filteredMulti.forEach((m: any) => { byParecer[m.parecer || 'favoravel'] = (byParecer[m.parecer || 'favoravel'] || 0) + 1; });
    return { total, bySpecialty: Object.entries(bySpecialty).map(([k, v]) => ({ nome: k, total: v })), byParecer: Object.entries(byParecer).map(([k, v]) => ({ nome: k === 'favoravel' ? 'Favorável' : 'Desfavorável', total: v })) };
  }, [multiEvals, filterUnit, dateFrom, dateTo]);

  const ptsReport = useMemo(() => {
    const filteredPts = ptsData.filter((p: any) => {
      if (filterUnit !== 'all' && p.unit_id !== filterUnit) return false;
      return true;
    });
    const total = filteredPts.length;
    const ativos = filteredPts.filter((p: any) => p.status === 'ativo').length;
    const concluidos = filteredPts.filter((p: any) => p.status !== 'ativo').length;
    return { total, ativos, concluidos };
  }, [ptsData, filterUnit]);

  const exportCSV = useCallback((type: string) => {
    let headers: string[] = [];
    let rows: string[][] = [];
    const filename = `relatorio_${type}_${new Date().toISOString().split('T')[0]}.csv`;

    if (type === 'agendamentos' || type === 'geral' || type === 'detalhado') {
      headers = ['Data', 'Hora', 'Paciente', 'Profissional', 'Unidade', 'Setor', 'Tipo', 'Status', 'Origem', 'Hora Início', 'Hora Fim', 'Duração (min)'];
      rows = filtered.map(a => {
        const un = unidades.find(u => u.id === a.unidadeId);
        const at = filteredAtendimentos.find(at => at.agendamento_id === a.id);
        return [a.data, a.hora, a.pacienteNome, a.profissionalNome, un?.nome || '', a.tipo, a.tipo, statusLabels[normalizeStatus(a.status)] || a.status, a.origem, at?.hora_inicio || '', at?.hora_fim || '', at?.duracao_minutos?.toString() || ''];
      });
    } else if (type === 'produtividade') {
      headers = ['Profissional', 'Perfil', 'Unidade', 'Pacientes Atendidos', 'Total Agendamentos', 'Concluídos', 'Faltas', 'Cancelamentos', 'Remarcados', 'Retornos', 'Tempo Médio (min)', 'Taxa Conclusão (%)', 'Taxa Retorno (%)'];
      rows = porProfissional.map(p => {
        const roleLabel = p.role === 'master' ? 'Master' : p.role === 'coordenador' ? 'Coordenador' : 'Profissional';
        return [p.nome, roleLabel, p.unidade, p.pacientesAtendidos.toString(), p.total.toString(), p.concluidos.toString(), p.faltas.toString(), p.cancelados.toString(), p.remarcados.toString(), p.retornos.toString(), p.tempoMedio.toString(), p.taxaConclusao.toString(), p.taxaRetorno.toString()];
      });
    } else if (type === 'faltas') {
      headers = ['Paciente', 'E-mail', 'Telefone', 'Profissional', 'Unidade', 'Total Faltas', 'Datas'];
      rows = faltasReport.map(f => [f.nome, f.email, f.telefone, f.profissional, f.unidade, f.total.toString(), f.datas.join(', ')]);
    } else if (type === 'pacientes') {
      headers = ['Paciente', 'E-mail', 'Telefone', 'Total Agendamentos', 'Concluídos', 'Faltas', 'Retornos', 'Última Consulta'];
      rows = pacientesReport.map(p => [p.nome, p.email, p.telefone, p.totalAgendamentos.toString(), p.concluidos.toString(), p.faltas.toString(), p.retornos.toString(), p.ultimaConsulta]);
    }

    const csv = [headers, ...rows].map(r => r.map(c => `"${c}"`).join(';')).join('\n');
    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  }, [filtered, porProfissional, faltasReport, pacientesReport, unidades, filteredAtendimentos]);

  const exportExcel = useCallback((type: string) => {
    let headers: string[] = [];
    let rows: string[][] = [];

    if (type === 'agendamentos' || type === 'geral' || type === 'detalhado') {
      headers = ['Data', 'Hora', 'Paciente', 'Profissional', 'Unidade', 'Tipo', 'Status', 'Origem'];
      rows = filtered.map(a => {
        const un = unidades.find(u => u.id === a.unidadeId);
        return [a.data, a.hora, a.pacienteNome, a.profissionalNome, un?.nome || '', a.tipo, statusLabels[normalizeStatus(a.status)] || a.status, a.origem];
      });
    } else if (type === 'produtividade') {
      headers = ['Profissional', 'Pacientes', 'Agendamentos', 'Concluídos', 'Faltas', 'Cancelamentos', 'Tempo Médio (min)', 'Taxa Conclusão (%)'];
      rows = porProfissional.map(p => [p.nome, p.pacientesAtendidos.toString(), p.total.toString(), p.concluidos.toString(), p.faltas.toString(), p.cancelados.toString(), p.tempoMedio.toString(), p.taxaConclusao.toString()]);
    } else if (type === 'faltas') {
      headers = ['Paciente', 'Telefone', 'Profissional', 'Total Faltas', 'Datas'];
      rows = faltasReport.map(f => [f.nome, f.telefone, f.profissional, f.total.toString(), f.datas.join(', ')]);
    } else if (type === 'pacientes') {
      headers = ['Paciente', 'Telefone', 'Agendamentos', 'Concluídos', 'Faltas', 'Última Consulta'];
      rows = pacientesReport.map(p => [p.nome, p.telefone, p.totalAgendamentos.toString(), p.concluidos.toString(), p.faltas.toString(), p.ultimaConsulta]);
    }

    const escXml = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    const headerCells = headers.map(h => `<Cell ss:StyleID="header"><Data ss:Type="String">${escXml(h)}</Data></Cell>`).join('');
    const dataRows = rows.map(r =>
      `<Row>${r.map(c => `<Cell><Data ss:Type="String">${escXml(c)}</Data></Cell>`).join('')}</Row>`
    ).join('\n');

    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<?mso-application progid="Excel.Sheet"?>
<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet"
 xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet">
<Styles>
<Style ss:ID="header">
<Font ss:Bold="1" ss:Size="11"/>
<Interior ss:Color="#E8F0FE" ss:Pattern="Solid"/>
</Style>
</Styles>
<Worksheet ss:Name="Relatório">
<Table>
${headers.map(() => '<Column ss:AutoFitWidth="1" ss:Width="120"/>').join('')}
<Row>${headerCells}</Row>
${dataRows}
</Table>
</Worksheet>
</Workbook>`;

    const blob = new Blob([xml], { type: 'application/vnd.ms-excel' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `relatorio_${type}_${new Date().toISOString().split('T')[0]}.xls`;
    a.click();
    URL.revokeObjectURL(url);
  }, [filtered, porProfissional, faltasReport, pacientesReport, unidades]);

  const exportPDF = useCallback((type: string) => {
    const un = filterUnit !== 'all' ? unidades.find(u => u.id === filterUnit)?.nome : 'Todas';
    const prof = filterProf !== 'all' ? profissionais.find(p => p.id === filterProf)?.nome : 'Todos';
    const periodo = `${dateFrom || 'Início'} a ${dateTo || 'Atual'}`;

    let body = '';

    const summaryBlock = `
      <div class="summary">
        <div class="stat"><strong>${stats.total}</strong><small>Total Agendamentos</small></div>
        <div class="stat"><strong>${stats.atendimentosRealizados}</strong><small>Atendimentos</small></div>
        <div class="stat"><strong>${stats.concluidos}</strong><small>Concluídos</small></div>
        <div class="stat"><strong>${stats.faltas}</strong><small>Faltas</small></div>
        <div class="stat"><strong>${stats.cancelados}</strong><small>Cancelados</small></div>
        <div class="stat"><strong>${stats.remarcados}</strong><small>Remarcados</small></div>
        <div class="stat"><strong>${tempoStats.tempoMedio}min</strong><small>Tempo Médio</small></div>
        <div class="stat"><strong>${stats.taxaComparecimento}%</strong><small>Comparecimento</small></div>
      </div>`;

    if (type === 'agendamentos' || type === 'geral' || type === 'detalhado') {
      const rows = filtered.map(a => {
        const unName = unidades.find(u => u.id === a.unidadeId)?.nome || '';
        const at = filteredAtendimentos.find(at => at.agendamento_id === a.id);
        return `<tr><td>${a.data}</td><td>${a.hora}</td><td>${a.pacienteNome}</td><td>${a.profissionalNome}</td><td>${unName}</td><td>${a.tipo}</td><td>${statusLabels[normalizeStatus(a.status)] || a.status}</td><td>${at?.hora_inicio || '-'}</td><td>${at?.hora_fim || '-'}</td><td>${at?.duracao_minutos ? at.duracao_minutos + 'min' : '-'}</td></tr>`;
      }).join('');
      const prodRows = porProfissional.map(p =>
        `<tr><td>${p.nome}</td><td>${p.unidade}</td><td>${p.pacientesAtendidos}</td><td>${p.total}</td><td>${p.concluidos}</td><td>${p.faltas}</td><td>${p.cancelados}</td><td>${p.tempoMedio ? p.tempoMedio + 'min' : '-'}</td><td>${p.taxaConclusao}%</td></tr>`
      ).join('');
      body = `${summaryBlock}
        <h2>Agendamentos Detalhados</h2>
        <table><thead><tr><th>Data</th><th>Hora</th><th>Paciente</th><th>Profissional</th><th>Unidade</th><th>Tipo</th><th>Status</th><th>Início</th><th>Fim</th><th>Duração</th></tr></thead><tbody>${rows}</tbody></table>
        <h2>Produtividade por Profissional</h2>
        <table><thead><tr><th>Profissional</th><th>Unidade</th><th>Pacientes</th><th>Total</th><th>Concluídos</th><th>Faltas</th><th>Cancelados</th><th>Tempo Médio</th><th>Taxa</th></tr></thead><tbody>${prodRows}</tbody></table>`;
    } else if (type === 'produtividade') {
      const prodRows = porProfissional.map(p =>
        `<tr><td>${p.nome}</td><td>${p.unidade}</td><td>${p.pacientesAtendidos}</td><td>${p.total}</td><td>${p.concluidos}</td><td>${p.faltas}</td><td>${p.cancelados}</td><td>${p.remarcados}</td><td>${p.retornos}</td><td>${p.tempoMedio ? p.tempoMedio + 'min' : '-'}</td><td>${p.taxaConclusao}%</td><td>${p.taxaRetorno}%</td></tr>`
      ).join('');
      body = `${summaryBlock}
        <h2>Produtividade por Profissional</h2>
        <table><thead><tr><th>Profissional</th><th>Unidade</th><th>Pacientes</th><th>Total</th><th>Concluídos</th><th>Faltas</th><th>Cancelamentos</th><th>Remarcados</th><th>Retornos</th><th>Tempo Médio</th><th>Taxa Conclusão</th><th>Taxa Retorno</th></tr></thead><tbody>${prodRows}</tbody></table>`;
    } else if (type === 'faltas') {
      const rows = faltasReport.map(f =>
        `<tr><td>${f.nome}</td><td>${f.email}</td><td>${f.telefone}</td><td>${f.profissional}</td><td>${f.unidade}</td><td>${f.total}</td><td>${f.datas.join(', ')}</td></tr>`
      ).join('');
      body = `${summaryBlock}
        <h2>Relatório de Faltas</h2>
        <table><thead><tr><th>Paciente</th><th>E-mail</th><th>Telefone</th><th>Profissional</th><th>Unidade</th><th>Total</th><th>Datas</th></tr></thead><tbody>${rows}</tbody></table>`;
    } else if (type === 'pacientes') {
      const rows = pacientesReport.map(p =>
        `<tr><td>${p.nome}</td><td>${p.email}</td><td>${p.telefone}</td><td>${p.totalAgendamentos}</td><td>${p.concluidos}</td><td>${p.faltas}</td><td>${p.retornos}</td><td>${p.ultimaConsulta}</td></tr>`
      ).join('');
      body = `${summaryBlock}
        <h2>Relatório de Pacientes</h2>
        <table><thead><tr><th>Paciente</th><th>E-mail</th><th>Telefone</th><th>Agendamentos</th><th>Concluídos</th><th>Faltas</th><th>Retornos</th><th>Última Consulta</th></tr></thead><tbody>${rows}</tbody></table>`;
    }

    const titleMap: Record<string, string> = { 
      geral: 'Relatório Geral', 
      agendamentos: 'Relatório de Agendamentos', 
      detalhado: 'Relatório Detalhado', 
      produtividade: 'Relatório de Produtividade', 
      faltas: 'Relatório de Faltas', 
      pacientes: 'Relatório de Pacientes',
      mapa: 'Mapa de Atendimento Mensal'
    };

    if (type === 'mapa' && mapaData.length > 0) {
      const rows = mapaData.map(row => 
        `<tr><td>${row.num}</td><td>${row.paciente_nome}</td><td>${row.cns}</td><td>${row.profissional_nome}</td><td>${row.especialidade}</td><td>${row.tipo}</td><td>${row.cpf}</td><td>${row.data_nascimento}</td></tr>`
      ).join('');
      body = `
        <h2>Mapa de Atendimento Mensal</h2>
        <table>
          <thead>
            <tr><th>Nº</th><th>Paciente</th><th>CNS</th><th>Profissional</th><th>Especialidade</th><th>Tipo</th><th>CPF</th><th>Nascimento</th></tr>
          </thead>
          <tbody>${rows}</tbody>
        </table>`;
    }

    openPrintDocument(
      titleMap[type] || 'Relatório',
      body || '<p>Nenhum dado para exportar nesta aba.</p>',
      { 'Período': periodo, 'Unidade': un || 'Todas', 'Profissional': prof || 'Todos' }
    );
  }, [filtered, porProfissional, faltasReport, pacientesReport, stats, tempoStats, unidades, filteredAtendimentos, filterUnit, filterProf, dateFrom, dateTo, mapaData]);

  const clearFilters = () => {
    setFilterUnit('all'); setFilterProf('all'); setFilterStatus('all'); setFilterSetor('all'); setFilterTipo('all'); setDateFrom(''); setDateTo('');
  };

  return (
    <div className="space-y-5 animate-fade-in">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold font-display text-foreground flex items-center gap-2">
            <BarChart3 className="w-6 h-6 text-primary" /> Relatórios
          </h1>
          <p className="text-muted-foreground text-sm">
            {stats.total} agendamentos · {stats.atendimentosRealizados} atendimentos realizados
          </p>
        </div>
        <div className="flex gap-2 flex-wrap items-center">
          <span className="text-xs flex items-center gap-1 mr-2 text-muted-foreground">
            <RefreshCw className="w-3 h-3" /> Atualizado {lastUpdatedLabel}
          </span>
          <Button variant="outline" size="sm" onClick={() => exportCSV(activeTab === 'geral' ? 'agendamentos' : activeTab)}>
            <Download className="w-4 h-4 mr-1" />CSV
          </Button>
          <Button variant="outline" size="sm" onClick={() => exportPDF(activeTab)}>
            <FileText className="w-4 h-4 mr-1" />PDF
          </Button>
          <Button variant="outline" size="sm" onClick={() => exportExcel(activeTab === 'geral' ? 'agendamentos' : activeTab)}>
            <Download className="w-4 h-4 mr-1" />Excel
          </Button>
          <Button variant="outline" size="sm" onClick={() => exportPDF(activeTab)}>
            <Printer className="w-4 h-4 mr-1" />Imprimir
          </Button>
        </div>
      </div>

      <div className="rounded-xl border p-4 bg-card shadow-sm">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2"><Filter className="w-4 h-4 text-muted-foreground" /><span className="font-semibold text-sm text-foreground">Filtros</span></div>
          <Button variant="ghost" size="sm" onClick={clearFilters} className="text-xs text-muted-foreground">Limpar filtros</Button>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-8 gap-3">
          <div>
            <Label className="text-xs">Unidade</Label>
            <Select value={filterUnit} onValueChange={setFilterUnit}>
              <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
              <SelectContent><SelectItem value="all">Todas</SelectItem>{unidadesVisiveis.map(u => <SelectItem key={u.id} value={u.id}>{u.nome}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs">Profissional</Label>
            <Select value={filterProf} onValueChange={setFilterProf}>
              <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
              <SelectContent><SelectItem value="all">Todos</SelectItem>{profissionais.map(p => <SelectItem key={p.id} value={p.id}>{p.nome}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs">Status</Label>
            <Select value={filterStatus} onValueChange={setFilterStatus}>
              <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos</SelectItem>
                {Object.entries(statusLabels).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs">Tipo</Label>
            <Select value={filterTipo} onValueChange={setFilterTipo}>
              <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
              <SelectContent><SelectItem value="all">Todos</SelectItem>{tiposUnicos.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs">Setor</Label>
            <Select value={filterSetor} onValueChange={setFilterSetor}>
              <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
              <SelectContent><SelectItem value="all">Todos</SelectItem>{setoresUnicos.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div><Label className="text-xs">De</Label><Input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} className="h-9" /></div>
          <div><Label className="text-xs">Até</Label><Input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)} className="h-9" /></div>
          <div className="flex items-end">
            <Button 
              className="w-full h-9 gradient-primary text-primary-foreground gap-2" 
              onClick={loadReportData}
              disabled={isLoading}
            >
              {isLoading ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
              Buscar
            </Button>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-3 sm:grid-cols-5 lg:grid-cols-10 gap-2">
        {[
          { label: 'Total', value: stats.total, color: 'text-primary' },
          { label: 'Concluídos', value: stats.concluidos, color: 'text-success' },
          { label: 'Pendentes', value: stats.pendentes, color: 'text-warning' },
          { label: 'Faltas', value: stats.faltas, color: 'text-destructive' },
          { label: 'Cancelados', value: stats.cancelados, color: 'text-muted-foreground' },
          { label: 'Remarcados', value: stats.remarcados, color: 'text-warning' },
          { label: 'Retornos', value: stats.retornos, color: 'text-primary' },
          { label: 'Tempo Médio', value: `${tempoStats.tempoMedio}m`, color: 'text-info' },
          { label: 'Comparecim.', value: `${stats.taxaComparecimento}%`, color: 'text-success' },
          { label: 'Atend. Realizados', value: stats.atendimentosRealizados, color: 'text-success' },
        ].map(s => (
          <div key={s.label} className="rounded-xl border bg-card text-center px-2 py-3 shadow-sm">
            <p className={`text-lg font-bold font-display leading-none ${s.color}`}>{s.value}</p>
            <p className="text-[9px] uppercase tracking-wider mt-1 text-muted-foreground truncate">{s.label}</p>
          </div>
        ))}
      </div>

      <div className="relative">
        {isLoading && (
          <div className="absolute inset-0 bg-white/50 backdrop-blur-[1px] z-50 flex items-center justify-center rounded-xl min-h-[400px]">
            <div className="flex flex-col items-center gap-3 p-6 bg-white rounded-2xl shadow-xl border animate-in fade-in zoom-in duration-300">
              <RefreshCw className="w-10 h-10 animate-spin text-primary" />
              <div className="text-center">
                <p className="font-bold text-lg text-primary">Buscando dados...</p>
                <p className="text-sm text-muted-foreground">Isso pode levar alguns segundos para relatórios grandes.</p>
              </div>
            </div>
          </div>
        )}
        
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="w-full justify-start overflow-x-auto flex-nowrap bg-transparent border-b rounded-none h-auto p-0 gap-0">
            {[
              { value: 'geral', label: 'Geral' },
              { value: 'produtividade', label: 'Produtividade' },
              { value: 'procedimentos', label: 'Procedimentos' },
              { value: 'faltas', label: 'Faltas' },
              { value: 'pacientes', label: 'Pacientes' },
              { value: 'fila', label: 'Fila de Espera' },
              { value: 'triagem', label: 'Triagem' },
              { value: 'enfermagem', label: 'Enfermagem' },
              { value: 'multiprofissional', label: 'Multiprofissional' },
              { value: 'pts_report', label: 'PTS' },
              { value: 'tratamentos', label: 'Tratamentos' },
              { value: 'detalhado', label: 'Detalhado' },
              { value: 'mapa', label: 'Mapa Atendimento' },
            ].map(tab => (
              <TabsTrigger
                key={tab.value}
                value={tab.value}
                className="px-4 py-2.5 text-sm font-medium whitespace-nowrap transition-colors border-b-2 -mb-px rounded-none data-[state=active]:border-primary data-[state=active]:text-primary data-[state=active]:bg-transparent"
              >
                {tab.label}
              </TabsTrigger>
            ))}
          </TabsList>

          <TabsContent value="geral" className="space-y-5 mt-4">
            <ChartCard
              title="Atendimentos por Período"
              actions={
                <div className="flex gap-1">
                  {(['dia', 'semana', 'mes'] as const).map(g => (
                    <Button key={g} size="sm" variant={timelineGroup === g ? 'default' : 'outline'} className={timelineGroup === g ? 'h-7 text-xs' : 'h-7 text-xs'} onClick={() => setTimelineGroup(g)}>
                      {g === 'dia' ? 'Dia' : g === 'semana' ? 'Semana' : 'Mês'}
                    </Button>
                  ))}
                </div>
              }
            >
              {timelineGrouped.length > 0 ? (
                <ResponsiveContainer width="100%" height={260}>
                  <LineChart data={timelineGrouped}>
                    <CartesianGrid vertical={false} stroke="#f1f5f9" />
                    <XAxis dataKey="label" tick={{ fontSize: 10 }} />
                    <YAxis tick={{ fontSize: 10 }} />
                    <Tooltip />
                    <Legend />
                    <Line type="monotone" dataKey="concluidos" name="Concluídos" stroke="#14b8a6" strokeWidth={2} dot={{ r: 3 }} />
                    <Line type="monotone" dataKey="faltas" name="Faltas" stroke="#f97316" strokeWidth={2} dot={{ r: 3 }} />
                    <Line type="monotone" dataKey="cancelados" name="Cancelados" stroke="#94a3b8" strokeWidth={2} dot={{ r: 3 }} />
                  </LineChart>
                </ResponsiveContainer>
              ) : (
                <p className="text-center text-muted-foreground py-12">Nenhum dado encontrado para o período selecionado</p>
              )}
            </ChartCard>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
              <ChartCard title="Horários de Pico">
                {peakHoursData.some(d => d.total > 0) ? (
                  <ResponsiveContainer width="100%" height={280}>
                    <BarChart data={peakHoursData}>
                      <CartesianGrid vertical={false} stroke="#f1f5f9" />
                      <XAxis dataKey="hora" tick={{ fontSize: 10 }} />
                      <YAxis tick={{ fontSize: 10 }} />
                      <Tooltip />
                      <Bar dataKey="total" name="Agendamentos" fill="#3b82f6" radius={[6, 6, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                ) : (
                  <p className="text-center text-muted-foreground py-12">Nenhum dado encontrado</p>
                )}
              </ChartCard>

              <ChartCard title="Novos vs Retorno">
                {novosVsRetorno.length > 0 ? (
                  <ResponsiveContainer width="100%" height={280}>
                    <PieChart>
                      <Pie data={novosVsRetorno} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={100} label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`} labelLine={false}>
                        <Cell fill="#3b82f6" />
                        <Cell fill="#14b8a6" />
                      </Pie>
                      <Tooltip />
                      <Legend />
                    </PieChart>
                  </ResponsiveContainer>
                ) : (
                  <p className="text-center text-muted-foreground py-12">Nenhum dado encontrado</p>
                )}
              </ChartCard>
            </div>
          </TabsContent>

          <TabsContent value="produtividade" className="space-y-5 mt-4">
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 xl:grid-cols-5 gap-3">
              {categoriaCards.map(c => {
                const taxa = c.total > 0 ? Math.round((c.concluidos / c.total) * 100) : 0;
                const isActive = filterCargoProd === c.key;
                const catDef = CATEGORIAS.find(cat => cat.key === c.key);
                const IconComp = catDef?.icon || Stethoscope;
                return (
                  <div
                    key={c.key}
                    className={cn("cursor-pointer rounded-xl border p-4 transition-all hover:shadow-md", isActive ? "border-primary bg-primary/5" : "bg-card")}
                    onClick={() => setFilterCargoProd(isActive ? 'all' : c.key)}
                  >
                    <div className="flex items-center gap-2.5 mb-3">
                      <div className="w-9 h-9 rounded-full flex items-center justify-center bg-muted">
                        <IconComp className="w-4 h-4" />
                      </div>
                      <span className="text-xs uppercase tracking-wider font-semibold text-muted-foreground">{c.label}</span>
                    </div>
                    <div className="flex items-baseline gap-4">
                      <div><p className="text-2xl font-bold">{c.total}</p><p className="text-[10px] text-muted-foreground">Total</p></div>
                      <div><p className="text-lg font-bold text-success">{c.concluidos}</p><p className="text-[10px] text-muted-foreground">Concluídos</p></div>
                    </div>
                  </div>
                );
              })}
            </div>
            <Card className="shadow-card border-0">
              <CardContent className="p-5">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="font-semibold text-foreground">Produtividade por Profissional</h3>
                  <Button size="sm" variant="outline" onClick={() => setProdViewMode(prodViewMode === 'tabela' ? 'grafico' : 'tabela')}>
                    {prodViewMode === 'tabela' ? 'Ver Gráfico' : 'Ver Tabela'}
                  </Button>
                </div>
                {prodViewMode === 'tabela' ? (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b bg-muted/50">
                          <th className="text-left py-2 px-3">Profissional</th>
                          <th className="text-center py-2 px-2">Total</th>
                          <th className="text-center py-2 px-2">Concluídos</th>
                          <th className="text-center py-2 px-2">Faltas</th>
                          <th className="text-center py-2 px-2">Taxa Conclusão</th>
                        </tr>
                      </thead>
                      <tbody>
                        {porProfissional.map(p => (
                          <tr key={p.id} className="border-b hover:bg-muted/30">
                            <td className="py-2 px-3">{p.nome}</td>
                            <td className="py-2 px-2 text-center">{p.total}</td>
                            <td className="py-2 px-2 text-center text-success">{p.concluidos}</td>
                            <td className="py-2 px-2 text-center text-destructive">{p.faltas}</td>
                            <td className="py-2 px-2 text-center">{p.taxaConclusao}%</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <ResponsiveContainer width="100%" height={400}>
                    <BarChart data={prodChartData} layout="vertical">
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis type="number" />
                      <YAxis dataKey="nome" type="category" width={150} />
                      <Tooltip />
                      <Bar dataKey="concluidos" name="Concluídos" stackId="a" fill="#14b8a6" />
                      <Bar dataKey="faltas" name="Faltas" stackId="a" fill="#f97316" />
                    </BarChart>
                  </ResponsiveContainer>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="procedimentos" className="space-y-5 mt-4">
            <Card className="shadow-card border-0">
              <CardContent className="p-5">
                <h3 className="font-semibold text-foreground mb-4">Procedimentos Mais Realizados</h3>
                <ResponsiveContainer width="100%" height={400}>
                  <BarChart data={procedimentoStats.byProcedure.slice(0, 15)} layout="vertical">
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis type="number" />
                    <YAxis dataKey="nome" type="category" width={200} />
                    <Tooltip />
                    <Bar dataKey="total" fill="#3b82f6" />
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="faltas" className="space-y-5 mt-4">
            <Card className="shadow-card border-0">
              <CardContent className="p-5">
                <h3 className="font-semibold text-foreground mb-4">Faltas por Paciente</h3>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b bg-muted/50">
                        <th className="text-left py-2 px-3">Paciente</th>
                        <th className="text-center py-2 px-2">Total Faltas</th>
                      </tr>
                    </thead>
                    <tbody>
                      {faltasReport.map(f => (
                        <tr key={f.nome} className="border-b hover:bg-muted/30">
                          <td className="py-2 px-3">{f.nome}</td>
                          <td className="py-2 px-2 text-center font-bold text-destructive">{f.total}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="pacientes" className="space-y-5 mt-4">
            <Card className="shadow-card border-0">
              <CardContent className="p-5">
                <h3 className="font-semibold text-foreground mb-4">Pacientes Atendidos</h3>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b bg-muted/50">
                        <th className="text-left py-2 px-3">Paciente</th>
                        <th className="text-center py-2 px-2">Total Agendamentos</th>
                      </tr>
                    </thead>
                    <tbody>
                      {pacientesReport.slice(0, 50).map(p => (
                        <tr key={p.id} className="border-b hover:bg-muted/30">
                          <td className="py-2 px-3">{p.nome}</td>
                          <td className="py-2 px-2 text-center font-bold">{p.totalAgendamentos}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="fila" className="space-y-5 mt-4">
            <Card className="shadow-card border-0">
              <CardContent className="p-5">
                <h3 className="font-semibold text-foreground mb-4">Fila de Espera</h3>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b bg-muted/50">
                        <th className="text-left py-2 px-3">Paciente</th>
                        <th className="text-left py-2 px-2">Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filaReport.items.map(f => (
                        <tr key={f.id} className="border-b hover:bg-muted/30">
                          <td className="py-2 px-3">{f.paciente_nome}</td>
                          <td className="py-2 px-2">{f.status}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="triagem" className="space-y-5 mt-4">
            <Card className="shadow-card border-0">
              <CardContent className="p-5">
                <h3 className="font-semibold text-foreground mb-4">Triagens por Técnico</h3>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b bg-muted/50">
                        <th className="text-left py-2 px-3">Técnico</th>
                        <th className="text-center py-2 px-2">Total</th>
                      </tr>
                    </thead>
                    <tbody>
                      {triagemReport.porTecnico.map(t => (
                        <tr key={t.id} className="border-b hover:bg-muted/30">
                          <td className="py-2 px-3">{t.nome}</td>
                          <td className="py-2 px-2 text-center font-bold">{t.total}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="enfermagem" className="space-y-5 mt-4">
            <Card className="shadow-card border-0">
              <CardContent className="p-5">
                <h3 className="font-semibold text-foreground mb-4">Avaliações de Enfermagem ({nursingEvals.length})</h3>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b bg-muted/50">
                        <th className="text-left py-2 px-3">Data</th>
                        <th className="text-left py-2 px-2">Profissional</th>
                        <th className="text-left py-2 px-2">Paciente</th>
                        <th className="text-left py-2 px-2">Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {nursingEvals.slice(0, 50).map((n, i) => (
                        <tr key={i} className="border-b hover:bg-muted/30">
                          <td className="py-2 px-3">{n.evaluation_date}</td>
                          <td className="py-2 px-2">{n.professional_name || 'Profissional'}</td>
                          <td className="py-2 px-2">{n.patient_name || n.patient_id}</td>
                          <td className="py-2 px-2">{n.status || 'Finalizado'}</td>
                        </tr>
                      ))}
                      {nursingEvals.length === 0 && (
                        <tr><td colSpan={4} className="py-10 text-center text-muted-foreground">Nenhuma avaliação encontrada</td></tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="multiprofissional" className="space-y-5 mt-4">
            <Card className="shadow-card border-0">
              <CardContent className="p-5">
                <h3 className="font-semibold text-foreground mb-4">Avaliações Multiprofissionais ({multiEvals.length})</h3>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b bg-muted/50">
                        <th className="text-left py-2 px-3">Data</th>
                        <th className="text-left py-2 px-2">Especialidade</th>
                        <th className="text-left py-2 px-2">Paciente</th>
                      </tr>
                    </thead>
                    <tbody>
                      {multiEvals.slice(0, 50).map((m, i) => (
                        <tr key={i} className="border-b hover:bg-muted/30">
                          <td className="py-2 px-3">{m.evaluation_date}</td>
                          <td className="py-2 px-2">{m.specialty || 'Geral'}</td>
                          <td className="py-2 px-2">{m.patient_name || m.patient_id}</td>
                        </tr>
                      ))}
                      {multiEvals.length === 0 && (
                        <tr><td colSpan={3} className="py-10 text-center text-muted-foreground">Nenhuma avaliação encontrada</td></tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="pts_report" className="space-y-5 mt-4">
            <Card className="shadow-card border-0">
              <CardContent className="p-5">
                <h3 className="font-semibold text-foreground mb-4">Projetos Terapêuticos Singulares - PTS ({ptsData.length})</h3>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b bg-muted/50">
                        <th className="text-left py-2 px-3">Criado em</th>
                        <th className="text-left py-2 px-2">Profissional</th>
                        <th className="text-left py-2 px-2">Paciente</th>
                      </tr>
                    </thead>
                    <tbody>
                      {ptsData.slice(0, 50).map((p, i) => (
                        <tr key={i} className="border-b hover:bg-muted/30">
                          <td className="py-2 px-3">{new Date(p.created_at).toLocaleDateString('pt-BR')}</td>
                          <td className="py-2 px-2">{p.professional_name || 'Responsável'}</td>
                          <td className="py-2 px-2">{p.patient_name || p.patient_id}</td>
                        </tr>
                      ))}
                      {ptsData.length === 0 && (
                        <tr><td colSpan={3} className="py-10 text-center text-muted-foreground">Nenhum PTS encontrado</td></tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="tratamentos" className="space-y-5 mt-4">
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-5">
              <Card><CardContent className="p-4">
                <p className="text-xs text-muted-foreground uppercase">Ciclos Ativos</p>
                <p className="text-2xl font-bold text-primary">{treatmentStats.ativos}</p>
              </CardContent></Card>
              <Card><CardContent className="p-4">
                <p className="text-xs text-muted-foreground uppercase">Sessões Realizadas</p>
                <p className="text-2xl font-bold text-success">{treatmentStats.sessRealizadas}</p>
              </CardContent></Card>
              <Card><CardContent className="p-4">
                <p className="text-xs text-muted-foreground uppercase">Faltas em Sessões</p>
                <p className="text-2xl font-bold text-destructive">{treatmentStats.sessFaltas}</p>
              </CardContent></Card>
              <Card><CardContent className="p-4">
                <p className="text-xs text-muted-foreground uppercase">Abandono</p>
                <p className="text-2xl font-bold">{treatmentStats.taxaAbandono}%</p>
              </CardContent></Card>
            </div>
            <Card className="shadow-card border-0">
              <CardContent className="p-5">
                <h3 className="font-semibold text-foreground mb-4">Tratamentos por Tipo</h3>
                <ResponsiveContainer width="100%" height={300}>
                  <BarChart data={treatmentStats.byType}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} />
                    <XAxis dataKey="nome" />
                    <YAxis />
                    <Tooltip />
                    <Bar dataKey="total" fill="hsl(199, 89%, 38%)" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="detalhado" className="space-y-5 mt-4">
            <Card className="shadow-card border-0">
              <CardContent className="p-5">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="font-semibold text-foreground">Listagem Detalhada</h3>
                  <Badge variant="outline">{filtered.length} registros</Badge>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b bg-muted/50">
                        <th className="text-left py-2 px-3">Data</th>
                        <th className="text-left py-2 px-2">Hora</th>
                        <th className="text-left py-2 px-2">Paciente</th>
                        <th className="text-left py-2 px-2">Profissional</th>
                        <th className="text-left py-2 px-2">Tipo</th>
                        <th className="text-left py-2 px-2">Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filtered.slice(0, 5000).map(a => (
                        <tr key={a.id} className="border-b hover:bg-muted/30">
                          <td className="py-2 px-3">{a.data}</td>
                          <td className="py-2 px-2">{a.hora}</td>
                          <td className="py-2 px-2 font-medium">{a.pacienteNome}</td>
                          <td className="py-2 px-2">{a.profissionalNome}</td>
                          <td className="py-2 px-2">{a.tipo}</td>
                          <td className="py-2 px-2">
                            <Badge className={cn(
                              normalizeStatus(a.status) === 'concluido' ? "bg-success" : 
                              normalizeStatus(a.status) === 'falta' ? "bg-destructive" :
                              normalizeStatus(a.status) === 'pendente' ? "bg-warning" : ""
                            )}>
                              {statusLabels[normalizeStatus(a.status)] || a.status}
                            </Badge>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="mapa" className="space-y-5 mt-4">
            <Card className="shadow-card border-0">
              <CardContent className="p-5">
                <div className="flex flex-col md:flex-row items-end gap-3 mb-6">
                  <div className="flex-1">
                    <Label className="text-xs">Data De</Label>
                    <Input type="date" value={mapaDateFrom} onChange={e => setMapaDateFrom(e.target.value)} className="h-9" />
                  </div>
                  <div className="flex-1">
                    <Label className="text-xs">Data Até</Label>
                    <Input type="date" value={mapaDateTo} onChange={e => setMapaDateTo(e.target.value)} className="h-9" />
                  </div>
                  <div className="flex-1">
                    <Label className="text-xs">Profissional</Label>
                    <Select value={mapaProf} onValueChange={setMapaProf}>
                      <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">Todos</SelectItem>
                        {profissionais.map(p => <SelectItem key={p.id} value={p.id}>{p.nome}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  <Button className="gradient-primary text-white gap-2 h-9" onClick={generateMapaAtendimento} disabled={mapaLoading}>
                    {mapaLoading ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
                    Gerar Mapa
                  </Button>
                </div>

                {mapaGenerated ? (
                  <div className="overflow-x-auto border rounded-lg">
                    <table className="w-full text-[10px] border-collapse">
                      <thead>
                        <tr className="bg-muted/50 border-b">
                          <th className="border-r p-1 text-center">Nº</th>
                          <th className="border-r p-1 text-left">NOME DO PACIENTE</th>
                          <th className="border-r p-1 text-center">CNS</th>
                          <th className="border-r p-1 text-center">TELEFONE</th>
                          <th className="border-r p-1 text-left">PROFISSIONAL</th>
                          <th className="border-r p-1 text-left">ESPECIALIDADE</th>
                          <th className="border-r p-1 text-center">CID</th>
                          <th className="border-r p-1 text-center">TIPO</th>
                          <th className="border-r p-1 text-center">CPF</th>
                          <th className="border-r p-1 text-center">DATA NASC.</th>
                        </tr>
                      </thead>
                      <tbody>
                        {mapaData.map((row, i) => (
                          <tr key={i} className="border-b hover:bg-muted/30">
                            <td className="border-r p-1 text-center">{row.num}</td>
                            <td className="border-r p-1 text-left font-medium uppercase">{row.paciente_nome}</td>
                            <td className="border-r p-1 text-center">{row.cns}</td>
                            <td className="border-r p-1 text-center">{row.telefone}</td>
                            <td className="border-r p-1 text-left">{row.profissional_nome}</td>
                            <td className="border-r p-1 text-left uppercase">{row.especialidade}</td>
                            <td className="border-r p-1 text-center">{row.cid}</td>
                            <td className="border-r p-1 text-center uppercase">{row.tipo}</td>
                            <td className="border-r p-1 text-center">{row.cpf}</td>
                            <td className="border-r p-1 text-center">{row.data_nascimento}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <div className="py-20 text-center text-muted-foreground border-2 border-dashed rounded-xl">
                    <MapPin className="w-10 h-10 mx-auto mb-3 opacity-20" />
                    <p>Clique em "Gerar Mapa" para visualizar os dados de atendimento.</p>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
};

export default Relatorios;
