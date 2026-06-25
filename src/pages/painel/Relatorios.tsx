import React, { useState, useMemo, useEffect, useCallback, useRef } from 'react';
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
import { Download, FileText, Filter, Clock, Users, CalendarDays, TrendingUp, AlertTriangle, UserCheck, ListOrdered, Printer, BarChart3, HeartPulse, MapPin, Search, RefreshCw, Stethoscope, Brain, Ear, Dumbbell, Hand, Apple, Heart, Users2, Activity, Info, ChevronRight, ClipboardList, BookOpen, type LucideIcon } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { openPrintDocument, printViaIframe, loadDocumentConfig, loadCarimbo, buildDocumentShell, docCarimbo } from '@/lib/printLayout';
import { toast } from 'sonner';
import { ActionButton } from '@/components/ui/action-button';
import { jsPDF } from 'jspdf';
import { autoTable } from 'jspdf-autotable';
import { saveAs } from 'file-saver';
import { Document, Packer, Paragraph, TextRun, AlignmentType, Table, TableRow, TableCell, WidthType, BorderStyle, HeadingLevel, ImageRun } from 'docx';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import logoSmsFallback from '@/assets/logo-sms-oriximina.jpeg';
import logoCerFallback from '@/assets/logo-cer-ii.png';
import { useUnidadeFilter } from '@/hooks/useUnidadeFilter';
import { ChartCard } from '@/components/ChartCard';
// Realtime removido: relatórios são snapshot estático.
import { CLINICAL_CATEGORIES, getCategoryByCID } from '@/data/clinicalCategories';
import { normalizeSexo } from '@/lib/utils/sexo-normalization';

const COLORS = ['hsl(199, 89%, 38%)', 'hsl(168, 60%, 42%)', 'hsl(45, 93%, 47%)', 'hsl(0, 72%, 51%)', 'hsl(262, 83%, 58%)', 'hsl(200, 18%, 46%)', 'hsl(280, 60%, 50%)', 'hsl(30, 80%, 50%)'];

const statusLabels: Record<string, string> = {
  pendente: 'Pendente', confirmado: 'Confirmado', confirmado_chegada: 'Chegou',
  em_atendimento: 'Em Atendimento', concluido: 'Concluído', falta: 'Falta',
  cancelado: 'Cancelado', remarcado: 'Remarcado', atraso: 'Atraso',
};

const formatDateBR = (d: string | null | undefined): string => {
  if (!d || d === '0001-01-01' || d.startsWith('0001') || d === 'undefined' || d === 'null') return 'Não informado';
  try {
    // Trata datas que podem vir com tempo (ISO ou formatadas)
    const dateOnly = d.split('T')[0].split(' ')[0];
    const parts = dateOnly.split('-');
    if (parts.length < 3) {
      // Tenta padrão brasileiro se não for ISO
      if (d.includes('/')) return d;
      return d || 'Não informado';
    }
    const [y, m, day] = parts;
    // Validação extra para ano 0001 ou outros valores residuais
    if (y === '0001' || parseInt(y) < 1900) return 'Não informado';
    return `${day}/${m}/${y}`;
  } catch (e) {
    return d || 'Não informado';
  }
};

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
  const { pacientes, funcionarios, unidades, salas, fila } = useData();
  const resolvePaciente = usePacienteNomeResolver();
  const { user } = useAuth();
  const [activeTab, setActiveTab] = useState('executivo');
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
  const [atendimentosDB, setAtendimentosDB] = useState<AtendimentoDB[]>([]);
  const [filaDB, setFilaDB] = useState<FilaDB[]>([]);
  const [triagensDB, setTriagensDB] = useState<TriagemDB[]>([]);
  const [procedimentosDB, setProcedimentosDB] = useState<any[]>([]);
  const [cid10Descriptions, setCid10Descriptions] = useState<Record<string, string>>({});
  const [treatmentCycles, setTreatmentCycles] = useState<any[]>([]);
  const [treatmentSessions, setTreatmentSessions] = useState<any[]>([]);
  const [nursingEvals, setNursingEvals] = useState<any[]>([]);
  const [multiEvals, setMultiEvals] = useState<any[]>([]);
  const [ptsData, setPtsData] = useState<any[]>([]);
  const [lastUpdated, setLastUpdated] = useState<Date>(new Date());
  const [lastUpdatedLabel, setLastUpdatedLabel] = useState('agora');
  const [clinicalSearch, setClinicalSearch] = useState('');


  const [mapaData, setMapaData] = useState<Array<{
    num: number;
    paciente_nome: string;
    data_atendimento: string;
    data_nascimento: string;
    cpf: string;
    cns: string;
    telefone: string;
    tipo_logradouro: string;
    logradouro: string;
    numero: string;
    complemento: string;
    bairro: string;
    municipio: string;
    endereco_completo: string;
    profissional_nome: string;
    profissional_id: string;
    especialidade: string;
    procedimentos_realizados: string;
    procedimento_sigtap: string;
    cid: string;
    observacoes: string;
  }>>([]);
  const [mapaGenerated, setMapaGenerated] = useState(false);
  const [mapaLoading, setMapaLoading] = useState(false);
  const [mapaProf, setMapaProf] = useState('all');

  const { unidadesVisiveis, profissionaisVisiveis } = useUnidadeFilter();
  const profissionais = profissionaisVisiveis;
  const tecnicos = funcionarios.filter(f => f.role === 'tecnico' && f.ativo);

  const [isInitialLoading, setIsInitialLoading] = useState(true);
  const [isFetching, setIsFetching] = useState(false);
  const [agendamentosFull, setAgendamentosFull] = useState<any[]>([]);
  const [prontuariosFull, setProntuariosFull] = useState<any[]>([]);

  const normalizeStatus = useCallback((status: string): 'concluido' | 'pendente' | 'falta' | 'cancelado' | 'remarcado' | 'retorno' | string => {
    if (!status) return 'pendente';
    const s = status.toLowerCase().trim();
    
    const concluidos = ['concluido', 'concluído', 'finalizado', 'atendido', 'realizado', 'atendimento_realizado', 'atendimento_finalizado', 'prontuario_finalizado', 'prontuario_concluido'];
    const pendentes = ['pendente', 'aguardando', 'confirmado', 'confirmada', 'agendado', 'apto', 'apto_atendimento', 'apto_para_atendimento', 'em_atendimento', 'aguardando_triagem', 'confirmado_chegada'];
    const faltas = ['faltou', 'falta', 'ausente', 'nao_compareceu', 'não compareceu'];
    const cancelados = ['cancelado', 'cancelada', 'cancelamento'];
    const remarcados = ['remarcado', 'reagendado', 'reagendada'];
    const retornos = ['retorno', 'consulta_retorno', 'atendimento_retorno'];

    if (concluidos.includes(s)) return 'concluido';
    if (pendentes.includes(s)) return 'pendente';
    if (faltas.includes(s)) return 'falta';
    if (cancelados.includes(s)) return 'cancelado';
    if (remarcados.includes(s)) return 'remarcado';
    if (retornos.includes(s)) return 'retorno';
    
    return s;
  }, []);

  const setoresUnicos = useMemo(() => {
    // Definimos uma lista fixa de setores para garantir consistência se os dados filtrados forem vazios
    const setoresBase = ['Ambulatório', 'Fisioterapia', 'Fonoaudiologia', 'Neuropediatria', 'Odontologia', 'Psicologia', 'Psicopedagogia', 'Serviço Social', 'Terapia Ocupacional', 'Triagem'];
    const s = new Set([...setoresBase, ...atendimentosDB.map(a => a.setor), ...agendamentosFull.map(a => a.tipo)].filter(Boolean));
    return Array.from(s).sort();
  }, [atendimentosDB, agendamentosFull]);

  const tiposUnicos = useMemo(() => {
    const s = new Set(agendamentosFull.map(a => a.tipo).filter(Boolean));
    return Array.from(s).sort();
  }, [agendamentosFull]);

  // Block 2 — Performance: O(1) lookup maps replace repeated .find() scans
  const unidadesMap = useMemo(() => new Map((unidades || []).map((u: any) => [u.id, u])), [unidades]);
  const funcionariosMap = useMemo(() => new Map((funcionarios || []).map((f: any) => [f.id, f])), [funcionarios]);
  const pacientesMap = useMemo(() => new Map((pacientes || []).map((p: any) => [p.id, p])), [pacientes]);
  const profissionaisMap = useMemo(() => new Map((profissionais || []).map((p: any) => [p.id, p])), [profissionais]);
  // categoriasMap declared after CATEGORIAS to avoid TDZ — see below.

  const loadReportData = useCallback(async (isAutoRefresh = false) => {
    if (isFetching) return;
    setIsFetching(true);
    
    try {
      const filters = { 
        unit: filterUnit, 
        prof: filterProf, 
        status: filterStatus, 
        type: filterTipo, 
        setor: filterSetor,
        dateFrom, 
        dateTo 
      };
      console.log(`[Relatórios] ${isAutoRefresh ? 'Auto-refresh' : 'Buscando'} dados com filtros:`, filters);

      const fetchAllPages = async (table: string, dateField?: string) => {
        let allData: any[] = [];
        let from = 0;
        const PAGE_SIZE = 1000;
        
        while (true) {
          let query = (supabase.from(table as any) as any).select('*').range(from, from + PAGE_SIZE - 1);
          
          if (dateField) {
            if (dateFrom) {
              // Se for TIMESTAMPTZ, garante que comece no início do dia
              const fromVal = dateField.includes('em') || dateField.includes('at') || dateField === 'criado_em' 
                ? `${dateFrom}T00:00:00` 
                : dateFrom;
              query = query.gte(dateField, fromVal);
            }
            if (dateTo) {
              // Se for TIMESTAMPTZ, garante que termine no final do dia
              const toVal = dateField.includes('em') || dateField.includes('at') || dateField === 'criado_em' 
                ? `${dateTo}T23:59:59` 
                : dateTo;
              query = query.lte(dateField, toVal);
            }
          }

          if (user?.unidadeId && user?.usuario !== 'admin.sms') {
            query = query.eq('unidade_id', user.unidadeId);
          }
          
          if (table === 'agendamentos') {
            if (filterUnit !== 'all') query = query.eq('unidade_id', filterUnit);
            if (filterProf !== 'all') query = query.eq('profissional_id', filterProf);
            if (filterStatus !== 'all') query = query.eq('status', filterStatus);
            if (filterTipo !== 'all') query = query.eq('tipo', filterTipo);
            if (filterSetor !== 'all') query = query.eq('tipo', filterSetor);
          } else if (table === 'prontuarios') {
            if (filterUnit !== 'all') query = query.eq('unidade_id', filterUnit);
            if (filterProf !== 'all') query = query.eq('profissional_id', filterProf);
          } else if (['triage_records', 'nursing_evaluations', 'multiprofessional_evaluations', 'pts'].includes(table)) {
            // These tables might have unidade_id or profissional_id
            // We should apply unit filter if applicable
            if (filterUnit !== 'all') {
              // Note: check if field exists, but most have it
              query = query.eq('unidade_id', filterUnit);
            }
          }

          const { data, error } = await query;
          if (error) {
            console.error(`Error fetching ${table}:`, error);
            break;
          };
          if (!data || data.length === 0) break;
          
          allData = allData.concat(data);
          if (data.length < PAGE_SIZE) break;
          from += PAGE_SIZE;
        }
        return allData;
      };

      const [
        ags, 
        prons, 
        filaRes, 
        triageRes, 
        cyclesRes, 
        sessRes, 
        nursingRes, 
        multiRes, 
        ptsRes,
        proceduresRes
      ] = await Promise.all([
        fetchAllPages('agendamentos', 'data'),
        fetchAllPages('prontuarios', 'data_atendimento'),
        fetchAllPages('fila_espera', 'criado_em'),
        fetchAllPages('triage_records', 'criado_em'),
        fetchAllPages('treatment_cycles', 'created_at'),
        fetchAllPages('treatment_sessions', 'data'),
        fetchAllPages('nursing_evaluations', 'created_at'),
        fetchAllPages('multiprofessional_evaluations', 'created_at'),
        fetchAllPages('pts', 'created_at'),
        fetchAllPages('patient_procedures', 'data'),
      ]);

      setAgendamentosFull(ags || []);
      setProntuariosFull(prons || []);
      setFilaDB(filaRes || []);
      setTriagensDB(triageRes as any as TriagemDB[] || []);
      setTreatmentCycles(cyclesRes || []);
      setTreatmentSessions(sessRes || []);
      setNursingEvals(nursingRes || []);
      setMultiEvals(multiRes || []);
      setPtsData(ptsRes || []);
      setProcedimentosDB(proceduresRes || []);

      // Extract all CIDs to fetch official descriptions
      const allCids = new Set<string>();
      (prons || []).forEach(p => {
        if (p.cid_codigo) p.cid_codigo.split(/[,;\s]+/).filter(Boolean).forEach((c: string) => allCids.add(c.toUpperCase()));
      });
      (ptsRes || []).forEach((p: any) => {
        if (p.cid_primario) allCids.add(p.cid_primario.toUpperCase());
        if (p.cid_secundario) allCids.add(p.cid_secundario.toUpperCase());
      });
      (proceduresRes || []).forEach((p: any) => {
        if (p.cid) allCids.add(p.cid.toUpperCase());
      });
      
      if (allCids.size > 0) {
        const { data: cidData } = await supabase
          .from('cid10_codigos')
          .select('codigo, descricao')
          .in('codigo', Array.from(allCids));
        
        if (cidData) {
          const descMap: Record<string, string> = {};
          cidData.forEach(c => { descMap[c.codigo] = c.descricao; });
          setCid10Descriptions(descMap);
        }
      }
      
      setLastUpdated(new Date());
      setIsInitialLoading(false);
    } catch (err) { 
      console.error('Error loading report data:', err); 
    } finally {
      setIsFetching(false);
    }
  }, [user, filterUnit, filterProf, filterStatus, filterTipo, filterSetor, dateFrom, dateTo]);

  useEffect(() => {
    loadReportData();
  }, [loadReportData]);

  const handleRefresh = () => {
    loadReportData();
  };

  // Snapshot estático: sem realtime, sem auto-refresh.
  // Atualizar o rótulo "Última atualização" sempre que lastUpdated mudar.
  useEffect(() => {
    const d = lastUpdated;
    const pad = (n: number) => String(n).padStart(2, '0');
    setLastUpdatedLabel(
      `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}`
    );
  }, [lastUpdated]);

  const filtered = useMemo(() => {
    return agendamentosFull.map(a => ({
      ...a,
      status: normalizeStatus(a.status),
      unidadeId: a.unidade_id,
      profissionalId: a.profissional_id,
      profissionalNome: a.profissional_nome,
      pacienteId: a.paciente_id,
      pacienteNome: a.paciente_nome,
    }));
  }, [agendamentosFull, normalizeStatus]);

  const consolidatedData = useMemo(() => {
    const ags = filtered;
    const prons = prontuariosFull;
    
    // Identifica quais prontuários estão vinculados a agendamentos
    const agendamentoIdsComProntuario = new Set(prons.map(p => p.agendamento_id).filter(Boolean));
    
    // Mapeia agendamentos e marca os que têm prontuário
    const result = ags.map(a => ({
      ...a,
      hasProntuario: agendamentoIdsComProntuario.has(a.id)
    }));
    
    // Adiciona prontuários "órfãos" (sem agendamento ou cujo agendamento não está no filtro atual)
    const agIdsNoFiltro = new Set(ags.map(a => a.id));
    const pronsOrfaos = prons.filter(p => !p.agendamento_id || !agIdsNoFiltro.has(p.agendamento_id));
    
    pronsOrfaos.forEach(p => {
      result.push({
        id: `pron-${p.id}`,
        agendamento_id: p.agendamento_id,
        pacienteId: p.paciente_id,
        pacienteNome: p.paciente_nome,
        profissionalId: p.profissional_id,
        profissionalNome: p.profissional_nome,
        unidadeId: p.unidade_id,
        status: 'concluido',
        data: p.data_atendimento,
        tipo: 'Atendimento (S/ Agend.)',
        hasProntuario: true,
        origem: 'prontuario'
      } as any);
    });
    
    return result;
  }, [filtered, prontuariosFull]);

  const stats = useMemo(() => {
    const data = consolidatedData;
    
    const totalAgendamentos = data.length;
    
    // Consideramos "concluído" se o status for concluído OU se existir um prontuário vinculado
    const concluidos = data.filter(d => d.status === 'concluido' || d.hasProntuario).length;
    const pendentes = data.filter(d => d.status === 'pendente' && !d.hasProntuario).length;
    const faltas = data.filter(d => d.status === 'falta').length;
    const cancelados = data.filter(d => d.status === 'cancelado').length;
    const remarcados = data.filter(d => d.status === 'remarcado').length;
    const retornos = data.filter(d => d.status === 'retorno' || d.tipo === 'Retorno').length;
    
    const taxaComparecimento = totalAgendamentos > 0 ? Math.round((concluidos / (totalAgendamentos - cancelados || 1)) * 100) : 0;
    const taxaFalta = totalAgendamentos > 0 ? Math.round((faltas / totalAgendamentos) * 100) : 0;
    
    const primeiraConsulta = data.filter(d => d.tipo === 'Consulta' || d.tipo === 'Primeira Consulta').length;
    const online = data.filter(d => d.origem === 'online').length;
    const recepcao = data.filter(d => d.origem === 'recepcao').length;

    console.log("[Relatórios] stats calculados (consolidado)", { totalAgendamentos, concluidos, pendentes, faltas });

    return { 
      total: totalAgendamentos, 
      concluidos, 
      pendentes, 
      faltas, 
      cancelados, 
      remarcados, 
      retornos, 
      primeiraConsulta, 
      taxaComparecimento, 
      taxaFalta,
      online,
      recepcao,
      emAtendimento: data.filter(d => d.status === 'em_atendimento').length
    };
  }, [consolidatedData]);

  const tempoStats = useMemo(() => {
    // Considera apenas atendimentos concluídos com duração resolvível
    const toMin = (t: string) => {
      const [h, m] = (t || '').split(':').map(n => parseInt(n, 10));
      if (Number.isNaN(h) || Number.isNaN(m)) return null;
      return h * 60 + m;
    };
    const duracoes: number[] = [];
    consolidatedData.forEach((d: any) => {
      const concluido = d.status === 'concluido' || d.hasProntuario;
      if (!concluido) return;
      let dur: number | null = null;
      if (typeof d.duracao_minutos === 'number' && d.duracao_minutos > 0) {
        dur = d.duracao_minutos;
      } else if (d.hora_inicio && d.hora_fim) {
        const ini = toMin(d.hora_inicio);
        const fim = toMin(d.hora_fim);
        if (ini != null && fim != null && fim > ini) dur = fim - ini;
      }
      if (dur && dur > 0 && dur < 600) duracoes.push(dur);
    });
    const total = duracoes.reduce((s, n) => s + n, 0);
    const tempoMedio = duracoes.length ? Math.round(total / duracoes.length) : 0;
    return {
      totalAtendimentos: stats.concluidos,
      tempoMedio,
      tempoMinimo: duracoes.length ? Math.min(...duracoes) : 0,
      tempoMaximo: duracoes.length ? Math.max(...duracoes) : 0,
      totalMinutos: total,
    };
  }, [consolidatedData, stats.concluidos]);

  const porProfissional = useMemo(() => {
    const map: Record<string, { id: string; nome: string; role: string; profissao: string; unidade: string; total: number; concluidos: number; faltas: number; cancelados: number; remarcados: number; tempoTotal: number; atendimentos: number; retornos: number; pacientesSet: Set<string> }> = {};
    
    consolidatedData.forEach(d => {
      const func = funcionariosMap.get(d.profissionalId);
      const un = unidadesMap.get(d.unidadeId);
      const key = d.profissionalId || d.profissionalNome || 'Não Identificado';
      
      if (!map[key]) {
        map[key] = { 
          id: d.profissionalId, 
          nome: d.profissionalNome || 'Não Identificado', 
          role: func?.role || 'profissional', 
          profissao: func?.profissao || '', 
          unidade: un?.nome || '', 
          total: 0, 
          concluidos: 0, 
          faltas: 0, 
          cancelados: 0, 
          remarcados: 0, 
          tempoTotal: 0, 
          atendimentos: 0, 
          retornos: 0, 
          pacientesSet: new Set() 
        };
      }
      
      const m = map[key];
      m.total++;
      m.pacientesSet.add(d.pacienteId);
      
      if (d.status === 'concluido' || d.hasProntuario) m.concluidos++;
      if (d.status === 'falta') m.faltas++;
      if (d.status === 'cancelado') m.cancelados++;
      if (d.status === 'remarcado') m.remarcados++;
      if (d.status === 'retorno' || d.tipo === 'Retorno') m.retornos++;
    });

    return Object.values(map)
      .filter(d => filterRoleProd === 'all' || d.role === filterRoleProd)
      .filter(d => {
        if (filterCargoProd === 'all') return true;
        const cat = categoriasMap.get(filterCargoProd);
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
        atendimentos: d.atendimentos,
        tempoTotal: d.tempoTotal,
        pacientesAtendidos: d.pacientesSet.size,
        tempoMedio: d.atendimentos > 0 ? Math.round(d.tempoTotal / d.atendimentos) : 0,
        taxaConclusao: d.total > 0 ? Math.round((d.concluidos / d.total) * 100) : 0,
        taxaRetorno: d.total > 0 ? Math.round((d.retornos / d.total) * 100) : 0,
      })).sort((a, b) => b.total - a.total);
  }, [consolidatedData, unidades, funcionarios, filterRoleProd, filterCargoProd]);

  // === CATEGORY CARDS (by profissao) ===
  const normalizarProfissao = (str: string) => {
    if (!str) return '';
    return str.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]/g, '');
  };
  const removeAccents = normalizarProfissao;

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

  const categoriasMap = useMemo(() => new Map(CATEGORIAS.map((c: any) => [c.key, c])), []);



  const profissionalPertenceCategoria = (profissao: string, cat: typeof CATEGORIAS[0]) => {
    const norm = normalizarProfissao(profissao);
    return cat.termos.some(termo => norm.includes(termo));
  };

  const categoriaCards = useMemo(() => {
    const profMap = new Map(funcionarios.map(f => [f.id, f]));
    const counts: Record<string, { total: number; concluidos: number }> = {};

    consolidatedData.forEach(d => {
      const func = profMap.get(d.profissionalId);
      const profissao = func?.profissao || '';
      for (const cat of CATEGORIAS) {
        if (profissionalPertenceCategoria(profissao, cat)) {
          if (!counts[cat.key]) counts[cat.key] = { total: 0, concluidos: 0 };
          counts[cat.key].total++;
          if (d.status === 'concluido' || d.hasProntuario) counts[cat.key].concluidos++;
          break;
        }
      }
    });

    return CATEGORIAS.map(cat => ({
      ...cat,
      total: counts[cat.key]?.total || 0,
      concluidos: counts[cat.key]?.concluidos || 0,
    }));
  }, [consolidatedData, funcionarios]);

  // === PROD TOTALS ===
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

  // === SEGMENTED BAR CHART DATA ===
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

  // === BY UNIT ===
  const porUnidade = useMemo(() => {
    const map: Record<string, { nome: string; total: number; concluidos: number; faltas: number; cancelados: number }> = {};
    consolidatedData.forEach(d => {
      const un = unidadesMap.get(d.unidadeId);
      const name = un?.nome || 'Desconhecida';
      if (!map[name]) map[name] = { nome: name, total: 0, concluidos: 0, faltas: 0, cancelados: 0 };
      map[name].total++;
      if (d.status === 'concluido' || d.hasProntuario) map[name].concluidos++;
      if (d.status === 'falta') map[name].faltas++;
      if (d.status === 'cancelado') map[name].cancelados++;
    });
    return Object.values(map).sort((a, b) => b.total - a.total);
  }, [consolidatedData, unidades]);

  // === FALTAS REPORT ===
  const faltasReport = useMemo(() => {
    const faltaAgs = consolidatedData.filter(d => d.status === 'falta');
    const porPaciente: Record<string, { nome: string; email: string; telefone: string; profissional: string; unidade: string; datas: string[]; total: number }> = {};
    faltaAgs.forEach(d => {
      const pac = pacientesMap.get(d.pacienteId);
      const un = unidadesMap.get(d.unidadeId);
      const key = d.pacienteId || d.pacienteNome;
      if (!porPaciente[key]) porPaciente[key] = { nome: d.pacienteNome, email: pac?.email || '', telefone: pac?.telefone || '', profissional: d.profissionalNome, unidade: un?.nome || '', datas: [], total: 0 };
      porPaciente[key].datas.push(d.data);
      porPaciente[key].total++;
    });
    return Object.values(porPaciente).sort((a, b) => b.total - a.total);
  }, [consolidatedData, pacientes, unidades]);

  // === PATIENTS REPORT ===
  const pacientesReport = useMemo(() => {
    const pacIds = new Set(consolidatedData.map(d => d.pacienteId));
    return Array.from(pacIds).map(pid => {
      const pac = pacientesMap.get(pid);
      const ags = consolidatedData.filter(d => d.pacienteId === pid);
      const concluidos = ags.filter(d => d.status === 'concluido' || d.hasProntuario).length;
      const faltas = ags.filter(d => d.status === 'falta').length;
      const retornos = ags.filter(d => d.tipo === 'Retorno').length;
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
  }, [consolidatedData, pacientes]);

  // === CLINICAL ANALYSIS REPORT ===
  const clinicalReport = useMemo(() => {
    const pacMap = new Map(pacientes.map(p => [p.id, p]));
    
    const patientStats: Record<string, {
      id: string;
      nome: string;
      cids: Set<string>;
      categories: Set<string>;
      atendimentos: number;
      procedimentos: Set<string>;
      datas: string[];
      profissionais: Set<string>;
      origens: Set<'prontuario' | 'pts' | 'cadastro' | 'procedimento'>;
    }> = {};

    const getOrCreatePatient = (id: string, name?: string) => {
      if (!patientStats[id]) {
        const pac = pacMap.get(id);
        patientStats[id] = {
          id,
          nome: name || pac?.nome || "Paciente",
          cids: new Set(),
          categories: new Set(),
          atendimentos: 0,
          procedimentos: new Set(),
          datas: [],
          profissionais: new Set(),
          origens: new Set()
        };
        
        // Add CID from patient registration
        if (pac?.cid) {
          const cids = pac.cid.split(/[,;\s]+/).filter(Boolean);
          cids.forEach(c => {
            const cid = c.toUpperCase();
            patientStats[id].cids.add(cid);
            patientStats[id].origens.add('cadastro');
          });
        }
      }
      return patientStats[id];
    };

    // 1. Process medical records
    prontuariosFull.forEach(p => {
      const ps = getOrCreatePatient(p.paciente_id, p.paciente_nome);
      ps.origens.add('prontuario');
      ps.atendimentos++;
      ps.datas.push(p.data_atendimento);
      if (p.profissional_id || p.profissional_nome) {
        ps.profissionais.add(p.profissional_id || p.profissional_nome);
      }

      if (p.cid_codigo) {
        const cids = p.cid_codigo.split(/[,;\s]+/).filter(Boolean);
        cids.forEach(c => ps.cids.add(c.toUpperCase()));
      }

      if (p.procedimentos_texto) {
        const procs = p.procedimentos_texto.split(/[,;]+/).filter(Boolean);
        procs.forEach(pr => ps.procedimentos.add(pr.trim()));
      }
    });

    // 2. Process PTS
    ptsData.forEach(p => {
      const ps = getOrCreatePatient(p.paciente_id, p.paciente_nome);
      ps.origens.add('pts');
      if (p.cid_primario) ps.cids.add(p.cid_primario.toUpperCase());
      if (p.cid_secundario) ps.cids.add(p.cid_secundario.toUpperCase());
      if (p.objetivos_curto_prazo) ps.procedimentos.add("Objetivo PTS: " + p.objetivos_curto_prazo);
    });

    // 3. Process linked procedures
    procedimentosDB.forEach(p => {
      const ps = getOrCreatePatient(p.patient_id);
      ps.origens.add('procedimento');
      if (p.procedimento_nome) ps.procedimentos.add(p.procedimento_nome);
      if (p.cid) ps.cids.add(p.cid.toUpperCase());
    });

    // Derive categories with intelligence
    Object.values(patientStats).forEach(ps => {
      ps.cids.forEach(cid => {
        const description = cid10Descriptions[cid];
        const cats = getCategoryByCID(cid, description);
        cats.forEach(cat => ps.categories.add(cat.name));
      });
    });

    let patientsList = Object.values(patientStats);

    if (clinicalSearch) {
      const term = clinicalSearch.toUpperCase().trim();
      const normTerm = term.replace('.', '');
      
      patientsList = patientsList.filter(ps => {
        const matchesName = ps.nome.toUpperCase().includes(term);
        const matchesCid = Array.from(ps.cids).some(c => {
          const normC = c.replace('.', '');
          return normC.startsWith(normTerm) || normTerm.startsWith(normC);
        });
        return matchesName || matchesCid;
      });
    }


    const byCategory: Record<string, {
      name: string;
      pacientes: number;
      atendimentos: number;
      procedimentos: number;
      pacientesIds: string[];
    }> = {};

    CLINICAL_CATEGORIES.forEach(cat => {
      byCategory[cat.name] = { name: cat.name, pacientes: 0, atendimentos: 0, procedimentos: 0, pacientesIds: [] };
    });

    patientsList.forEach(p => {
      p.categories.forEach(catName => {
        if (byCategory[catName]) {
          byCategory[catName].pacientes++;
          byCategory[catName].atendimentos += p.atendimentos;
          byCategory[catName].procedimentos += p.procedimentos.size;
          byCategory[catName].pacientesIds.push(p.id);
        }
      });
    });

    const cidFrequency: Record<string, number> = {};
    patientsList.forEach(p => {
      p.cids.forEach(c => {
        cidFrequency[c] = (cidFrequency[c] || 0) + 1;
      });
    });

    const totalPatients = patientsList.length || 1;
    const topCidsAll = Object.entries(cidFrequency)
      .map(([cid, count]) => ({
        cid,
        count,
        descricao: cid10Descriptions[cid] || "Descrição não carregada",
        percent: +((count / totalPatients) * 100).toFixed(1),
      }))
      .sort((a, b) => b.count - a.count);
    const topCids = topCidsAll.slice(0, 10);
    const topCids20 = topCidsAll.slice(0, 20);

    // ===== Sexo =====
    const sexoCount = { masculino: 0, feminino: 0, naoInformado: 0 };
    // ===== Faixa etária =====
    const faixas = [
      { name: '0-3 anos', min: 0, max: 3, count: 0 },
      { name: '4-6 anos', min: 4, max: 6, count: 0 },
      { name: '7-12 anos', min: 7, max: 12, count: 0 },
      { name: '13-17 anos', min: 13, max: 17, count: 0 },
      { name: '18-59 anos', min: 18, max: 59, count: 0 },
      { name: '60+ anos', min: 60, max: 200, count: 0 },
    ];
    let semIdade = 0;
    const today = new Date();
    patientsList.forEach(p => {
      const pac: any = pacMap.get(p.id);
      const sx = normalizeSexo(pac?.custom_data?.sexo || (pac as any)?.sexo);
      if (sx === 'masculino') sexoCount.masculino++;
      else if (sx === 'feminino') sexoCount.feminino++;
      else sexoCount.naoInformado++;

      const dn = pac?.dataNascimento || pac?.data_nascimento;
      if (dn) {
        const d = new Date(dn);
        if (!isNaN(d.getTime())) {
          let age = today.getFullYear() - d.getFullYear();
          const m = today.getMonth() - d.getMonth();
          if (m < 0 || (m === 0 && today.getDate() < d.getDate())) age--;
          const f = faixas.find(fx => age >= fx.min && age <= fx.max);
          if (f) f.count++; else semIdade++;
        } else semIdade++;
      } else semIdade++;
    });
    const sexoDist = [
      { name: 'Masculino', value: sexoCount.masculino },
      { name: 'Feminino', value: sexoCount.feminino },
      { name: 'Não informado', value: sexoCount.naoInformado },
    ];
    const faixaEtariaDist = faixas.map(f => ({ name: f.name, value: f.count }));

    // ===== Evolução temporal (diagnósticos por mês) =====
    const monthCount: Record<string, number> = {};
    prontuariosFull.forEach(pr => {
      if (!pr.cid_codigo || !pr.data_atendimento) return;
      const key = String(pr.data_atendimento).slice(0, 7); // YYYY-MM
      const n = pr.cid_codigo.split(/[,;\s]+/).filter(Boolean).length || 0;
      monthCount[key] = (monthCount[key] || 0) + n;
    });
    const evolucaoTemporal = Object.entries(monthCount)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([month, value]) => ({ month, value }));

    // ===== Múltiplos CIDs =====
    const comMulti = patientsList.filter(p => p.cids.size > 1);
    const totalCidsSoma = patientsList.reduce((acc, p) => acc + p.cids.size, 0);
    const mediaCidPorPaciente = patientsList.length ? +(totalCidsSoma / patientsList.length).toFixed(2) : 0;

    // ===== Deficiência Múltipla (>= 2 categorias PCD) =====
    const PCD_CATS = new Set(['TEA / Autismo', 'Pessoa Surda', 'Deficiência Auditiva', 'Deficiência Visual', 'Deficiência Física', 'Deficiência Intelectual']);
    const deficienciaMultipla = patientsList.filter(p => {
      let n = 0;
      p.categories.forEach(c => { if (PCD_CATS.has(c)) n++; });
      return n >= 2;
    }).length;

    const kpis = {
      totalPacientesComCID: patientsList.length,
      tea: byCategory['TEA / Autismo']?.pacientes || 0,
      surdez: (byCategory['Pessoa Surda']?.pacientes || 0) + (byCategory['Deficiência Auditiva']?.pacientes || 0),
      auditiva: byCategory['Deficiência Auditiva']?.pacientes || 0,
      visual: byCategory['Deficiência Visual']?.pacientes || 0,
      fisica: byCategory['Deficiência Física']?.pacientes || 0,
      intelectual: byCategory['Deficiência Intelectual']?.pacientes || 0,
      multipla: deficienciaMultipla,
      multiplosCids: comMulti.length,
      multiplosCidsPercent: patientsList.length ? +((comMulti.length / patientsList.length) * 100).toFixed(1) : 0,
      mediaCidPorPaciente,
      semIdade,
      totalAtendimentos: patientsList.reduce((acc, p) => acc + p.atendimentos, 0),
      totalProcedimentos: patientsList.reduce((acc, p) => acc + p.procedimentos.size, 0)
    };

    return {
      patients: patientsList,
      byCategory: Object.values(byCategory).sort((a, b) => b.pacientes - a.pacientes),
      topCids,
      topCids20,
      sexoDist,
      faixaEtariaDist,
      evolucaoTemporal,
      kpis
    };
  }, [prontuariosFull, pacientes, ptsData, procedimentosDB, cid10Descriptions, clinicalSearch]);


  // === FILA REPORT ===
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

  // === TRIAGEM REPORT ===
  const triagemReport = useMemo(() => {
    const filteredTriagens = triagensDB.filter(t => {
      if (dateFrom && t.criado_em && t.criado_em < dateFrom) return false;
      if (dateTo && t.criado_em && t.criado_em > dateTo + 'T23:59:59') return false;
      return true;
    });
    const total = filteredTriagens.length;
    const confirmadas = filteredTriagens.filter(t => t.confirmado_em).length;
    const pendentes = total - confirmadas;

    // Por técnico
    const porTecnico: Record<string, { id: string; nome: string; total: number; confirmadas: number; pendentes: number }> = {};
    filteredTriagens.forEach(t => {
      const tec = funcionariosMap.get(t.tecnico_id);
      const nome = tec?.nome || 'Desconhecido';
      if (!porTecnico[t.tecnico_id]) porTecnico[t.tecnico_id] = { id: t.tecnico_id, nome, total: 0, confirmadas: 0, pendentes: 0 };
      porTecnico[t.tecnico_id].total++;
      if (t.confirmado_em) porTecnico[t.tecnico_id].confirmadas++;
      else porTecnico[t.tecnico_id].pendentes++;
    });

    return { total, confirmadas, pendentes, porTecnico: Object.values(porTecnico).sort((a, b) => b.total - a.total) };
  }, [triagensDB, funcionarios, dateFrom, dateTo]);

  // === TIMELINE DATA ===
  const timelineData = useMemo(() => {
    const map: Record<string, { data: string; agendamentos: number; concluidos: number; faltas: number }> = {};
    consolidatedData.forEach(d => {
      if (!map[d.data]) map[d.data] = { data: d.data, agendamentos: 0, concluidos: 0, faltas: 0 };
      map[d.data].agendamentos++;
      if (d.status === 'concluido' || d.hasProntuario) map[d.data].concluidos++;
      if (d.status === 'falta') map[d.data].faltas++;
    });
    return Object.values(map).sort((a, b) => a.data.localeCompare(b.data)).slice(-30);
  }, [consolidatedData]);

  const statusData = useMemo(() => [
    { name: 'Concluídos', value: stats.concluidos },
    { name: 'Pendentes', value: stats.pendentes },
    { name: 'Faltas', value: stats.faltas },
    { name: 'Cancelados', value: stats.cancelados },
    { name: 'Remarcados', value: stats.remarcados },
  ].filter(d => d.value > 0), [stats]);

  // === TIMELINE GROUPED (dia/semana/mês) ===
  const timelineGrouped = useMemo(() => {
    const map: Record<string, { label: string; concluidos: number; faltas: number; cancelados: number }> = {};
    consolidatedData.forEach(d => {
      let key: string;
      const dateVal = new Date(d.data + 'T12:00:00');
      if (timelineGroup === 'dia') {
        key = d.data;
      } else if (timelineGroup === 'semana') {
        const startOfWeek = new Date(dateVal);
        startOfWeek.setDate(dateVal.getDate() - dateVal.getDay());
        key = startOfWeek.toISOString().split('T')[0];
      } else {
        key = d.data.substring(0, 7); // YYYY-MM
      }
      if (!map[key]) {
        const label = timelineGroup === 'mes'
          ? dateVal.toLocaleDateString('pt-BR', { month: 'short', year: '2-digit' })
          : timelineGroup === 'semana'
          ? `Sem ${key.substring(5)}`
          : key.substring(5);
        map[key] = { label, concluidos: 0, faltas: 0, cancelados: 0 };
      }
      if (d.status === 'concluido' || d.hasProntuario) map[key].concluidos++;
      if (d.status === 'falta') map[key].faltas++;
      if (d.status === 'cancelado') map[key].cancelados++;
    });
    return Object.entries(map).sort(([a], [b]) => a.localeCompare(b)).map(([, v]) => v).slice(-30);
  }, [consolidatedData, timelineGroup]);

  // === PEAK HOURS ===
  const peakHoursData = useMemo(() => {
    const map: Record<string, number> = {};
    for (let h = 7; h <= 18; h++) {
      const label = `${String(h).padStart(2, '0')}:00`;
      map[label] = 0;
    }
    consolidatedData.forEach(d => {
      // Fallback: hora_inicio → hora → timestamp da data
      let raw: string = (d as any).hora_inicio || d.hora || '';
      if (!raw && d.data) {
        const dt = new Date(d.data);
        if (!Number.isNaN(dt.getTime())) raw = `${String(dt.getHours()).padStart(2, '0')}:00`;
      }
      const hourKey = (raw || '').substring(0, 2);
      const h = parseInt(hourKey);
      if (h >= 7 && h <= 18) {
        const label = `${String(h).padStart(2, '0')}:00`;
        map[label] = (map[label] || 0) + 1;
      }
    });
    return Object.entries(map).map(([hora, total]) => ({ hora, total }));
  }, [consolidatedData]);


  const municipioReport = useMemo(() => {
    const pacMap = new Map(pacientes.map(p => [p.id, p]));
    const muniMap: Record<string, { 
      municipio: string; 
      pacientesCount: number; 
      atendimentos: number;
      concluidos: number;
      pendentes: number;
      faltas: number;
      cancelados: number;
      remarcados: number;
      retornos: number;
      pacientesIds: Set<string>;
    }> = {};

    const getMuniKey = (muni: string | null | undefined) => {
      if (!muni || muni.trim() === '') return 'Não informado';
      return muni.trim();
    };

    // Initialize with all patients to get patient counts per municipality
    pacientes.forEach(p => {
      const muni = getMuniKey((p as any).naturalidade);
      if (!muniMap[muni]) {
        muniMap[muni] = { 
          municipio: muni, 
          pacientesCount: 0, 
          atendimentos: 0, 
          concluidos: 0, 
          pendentes: 0, 
          faltas: 0, 
          cancelados: 0, 
          remarcados: 0, 
          retornos: 0,
          pacientesIds: new Set() 
        };
      }
      muniMap[muni].pacientesCount++;
      muniMap[muni].pacientesIds.add(p.id);
    });

    // Add attendance data based on consolidated data
    consolidatedData.forEach(d => {
      const pac = pacMap.get(d.pacienteId);
      const muni = getMuniKey((pac as any)?.naturalidade);
      
      if (!muniMap[muni]) {
        muniMap[muni] = { 
          municipio: muni, 
          pacientesCount: 0, 
          atendimentos: 0, 
          concluidos: 0, 
          pendentes: 0, 
          faltas: 0, 
          cancelados: 0, 
          remarcados: 0, 
          retornos: 0,
          pacientesIds: new Set() 
        };
      }
      
      muniMap[muni].atendimentos++;
      if (d.status === 'concluido' || d.hasProntuario) muniMap[muni].concluidos++;
      else if (d.status === 'pendente') muniMap[muni].pendentes++;
      else if (d.status === 'falta') muniMap[muni].faltas++;
      else if (d.status === 'cancelado') muniMap[muni].cancelados++;
      else if (d.status === 'remarcado') muniMap[muni].remarcados++;
      
      if (d.status === 'retorno' || d.tipo === 'Retorno') muniMap[muni].retornos++;
    });

    return Object.values(muniMap).map(m => {
      const totalAgendamentos = m.atendimentos;
      const taxaComparecimento = totalAgendamentos > 0 ? Math.round((m.concluidos / (totalAgendamentos - m.cancelados || 1)) * 100) : 0;
      const taxaFalta = totalAgendamentos > 0 ? Math.round((m.faltas / totalAgendamentos) * 100) : 0;
      
      return {
        ...m,
        taxaComparecimento,
        taxaFalta
      };
    }).sort((a, b) => b.atendimentos - a.atendimentos);
  }, [consolidatedData, pacientes]);

  const municipioStats = useMemo(() => {
    const list = municipioReport;
    const totalMunicipios = list.filter(m => m.municipio !== 'Não informado').length;
    const muniComMaisPacientes = list.length > 0 ? list[0] : null;
    const muniComMaisAtendimentos = [...list].sort((a, b) => b.atendimentos - a.atendimentos)[0];
    const totalComNaturalidade = pacientes.filter(p => (p as any).naturalidade && (p as any).naturalidade.trim() !== '').length;
    const totalSemNaturalidade = pacientes.length - totalComNaturalidade;

    return {
      totalMunicipios,
      muniComMaisPacientes,
      muniComMaisAtendimentos,
      totalComNaturalidade,
      totalSemNaturalidade
    };
  }, [municipioReport, pacientes]);


  // === NOVOS VS RETORNO ===
  const novosVsRetorno = useMemo(() => {
    const retornos = consolidatedData.filter(d => d.tipo === 'Retorno').length;
    const novos = consolidatedData.length - retornos;
    return [
      { name: 'Novos', value: novos },
      { name: 'Retorno', value: retornos },
    ].filter(d => d.value > 0);
  }, [consolidatedData]);

  // === FALTAS POR UNIDADE (pie) ===
  const faltasPorUnidade = useMemo(() => {
    const map: Record<string, { name: string; value: number }> = {};
    consolidatedData.filter(d => d.status === 'falta').forEach(d => {
      const un = unidadesMap.get(d.unidadeId);
      const name = un?.nome || 'Desconhecida';
      if (!map[name]) map[name] = { name, value: 0 };
      map[name].value++;
    });
    return Object.values(map).sort((a, b) => b.value - a.value);
  }, [consolidatedData, unidades]);

  // === EVOLUÇÃO MENSAL PRODUTIVIDADE ===
  const evolucaoMensal = useMemo(() => {
    const meses = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];
    const map: Record<string, number> = {};
    consolidatedData.filter(d => d.status === 'concluido' || d.hasProntuario).forEach(d => {
      const key = d.data.substring(0, 7);
      map[key] = (map[key] || 0) + 1;
    });
    return Object.entries(map).sort(([a], [b]) => a.localeCompare(b)).map(([key, total]) => {
      const [, m] = key.split('-');
      return { mes: meses[parseInt(m) - 1] || key, total };
    });
  }, [consolidatedData]);

  // === RANKING PRODUTIVIDADE (barras horizontais) ===
  const rankingProdutividade = useMemo(() => {
    return porProfissional.map(p => ({
      nome: p.nome,
      total: p.concluidos,
      role: p.role,
      fill: p.role === 'master' ? 'hsl(0,72%,51%)' : p.role === 'coordenador' ? 'hsl(199,89%,38%)' : 'hsl(152,60%,42%)',
    })).filter(p => p.total > 0).sort((a, b) => b.total - a.total);
  }, [porProfissional]);

  // === PROCEDURE STATS ===
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
      const un = unidadesMap.get(p.unidade_id);
      byUnit[un?.nome || 'Desconhecida'] = (byUnit[un?.nome || 'Desconhecida'] || 0) + 1;
    });
    return {
      total: filteredProcs.length,
      byProcedure: Object.entries(byProc).map(([nome, total]) => ({ nome, total })).sort((a, b) => b.total - a.total),
      byProfessional: Object.entries(byProf).map(([nome, total]) => ({ nome, total })).sort((a, b) => b.total - a.total),
      byUnit: Object.entries(byUnit).map(([nome, total]) => ({ nome, total })).sort((a, b) => b.total - a.total),
    };
  }, [procedimentosDB, filterUnit, dateFrom, dateTo, unidades]);

  // === TREATMENT STATS ===
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

    // Average sessions per patient
    const pacientesMap = new Map<string, number>();
    filteredCycles.forEach(c => pacientesMap.set(c.patient_id, (pacientesMap.get(c.patient_id) || 0) + c.sessions_done));
    const avgSessoesPorPaciente = pacientesMap.size > 0
      ? Math.round(Array.from(pacientesMap.values()).reduce((a, b) => a + b, 0) / pacientesMap.size)
      : 0;

    // Abandonment rate: cycles that were active but patient stopped (no sessions in last 30 days for active cycles)
    const taxaAbandono = total > 0 ? Math.round(((suspensos) / total) * 100) : 0;

    // By professional
    const byProf: Record<string, { nome: string; ativos: number; finalizados: number; sessoes: number }> = {};
    filteredCycles.forEach(c => {
      const prof = funcionariosMap.get(c.professional_id);
      const nome = prof?.nome || 'Desconhecido';
      if (!byProf[c.professional_id]) byProf[c.professional_id] = { nome, ativos: 0, finalizados: 0, sessoes: 0 };
      if (c.status === 'em_andamento') byProf[c.professional_id].ativos++;
      if (c.status === 'finalizado_alta') byProf[c.professional_id].finalizados++;
      byProf[c.professional_id].sessoes += c.sessions_done;
    });

    // By unit
    const byUnit: Record<string, { nome: string; total: number; ativos: number }> = {};
    filteredCycles.forEach(c => {
      const un = unidadesMap.get(c.unit_id);
      const nome = un?.nome || 'Desconhecida';
      if (!byUnit[c.unit_id]) byUnit[c.unit_id] = { nome, total: 0, ativos: 0 };
      byUnit[c.unit_id].total++;
      if (c.status === 'em_andamento') byUnit[c.unit_id].ativos++;
    });

    // By treatment type
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

  // === BLOCK 3: EXECUTIVE DASHBOARD KPIs ===
  const executiveKpis = useMemo(() => {
    const total = stats.total || 0;
    const efetivos = total - stats.cancelados;
    const taxaComparecimento = efetivos > 0 ? Math.round((stats.concluidos / efetivos) * 100) : 0;
    const taxaFalta = efetivos > 0 ? Math.round((stats.faltas / efetivos) * 100) : 0;
    const taxaCancelamento = total > 0 ? Math.round((stats.cancelados / total) * 100) : 0;
    const taxaRetorno = total > 0 ? Math.round((stats.retornos / total) * 100) : 0;

    const pacientesUnicos = new Set(consolidatedData.map((d: any) => d.pacienteId).filter(Boolean)).size;
    const profissionaisAtivos = new Set(consolidatedData.map((d: any) => d.profissionalId).filter(Boolean)).size;
    const unidadesAtivas = new Set(consolidatedData.map((d: any) => d.unidadeId).filter(Boolean)).size;

    // Fila — tempo médio de espera (chegada→chamada) em minutos
    const espTempos: number[] = [];
    (filaReport.items || []).forEach((f: any) => {
      if (!f.hora_chegada || !f.hora_chamada) return;
      const toMin = (t: string) => { const [h,m] = (t||'').split(':').map(Number); return Number.isFinite(h) && Number.isFinite(m) ? h*60+m : null; };
      const a = toMin(f.hora_chegada), b = toMin(f.hora_chamada);
      if (a != null && b != null && b > a) espTempos.push(b - a);
    });
    const tempoEsperaMedio = espTempos.length ? Math.round(espTempos.reduce((s,n)=>s+n,0)/espTempos.length) : 0;

    // Triagem: taxa de confirmação
    const triagemTotal = triagemReport.total || 0;
    const taxaConfirmacaoTriagem = triagemTotal > 0 ? Math.round(((triagemReport.confirmadas || 0) / triagemTotal) * 100) : 0;

    // Tratamentos
    const ciclosAtivos = treatmentStats.ativos || 0;
    const taxaConclusaoCiclos = treatmentStats.total > 0 ? Math.round((treatmentStats.finalizados / treatmentStats.total) * 100) : 0;

    // Ocupação aproximada: concluidos / efetivos
    const taxaOcupacao = efetivos > 0 ? Math.round(((stats.concluidos + stats.emAtendimento) / efetivos) * 100) : 0;

    // Tendência: média diária no período
    const dias = (() => {
      if (!dateFrom || !dateTo) return 1;
      const d = (new Date(dateTo).getTime() - new Date(dateFrom).getTime()) / 86400000 + 1;
      return Math.max(1, Math.round(d));
    })();
    const mediaDiaria = total > 0 ? Math.round(total / dias) : 0;

    return {
      total, pacientesUnicos, profissionaisAtivos, unidadesAtivas,
      taxaComparecimento, taxaFalta, taxaCancelamento, taxaRetorno, taxaOcupacao,
      tempoMedio: tempoStats.tempoMedio, tempoEsperaMedio,
      ciclosAtivos, taxaConclusaoCiclos, taxaAbandono: treatmentStats.taxaAbandono,
      filaAguardando: filaReport.aguardando, filaTotal: filaReport.total,
      triagemTotal, taxaConfirmacaoTriagem,
      mediaDiaria, dias,
    };
  }, [stats, consolidatedData, filaReport, triagemReport, treatmentStats, tempoStats, dateFrom, dateTo]);

  // === NURSING EVALUATIONS REPORT ===
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

  // === MULTIPROFESSIONAL EVALUATIONS REPORT ===
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

  // === PTS REPORT ===
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
        const un = unidadesMap.get(a.unidadeId);
        // We use mock/empty fields for start/end/duration as they were usually from atendimentosDB
        return [a.data, a.hora, a.pacienteNome, a.profissionalNome, un?.nome || '', a.tipo, a.tipo, statusLabels[a.status] || a.status, a.origem, '', '', ''];
      });
    } else if (type === 'municipios') {
      headers = ['Município', 'Total de Pacientes', 'Total de Atendimentos', 'Concluídos', 'Pendentes', 'Faltas', 'Cancelados', 'Remarcados', 'Retornos', 'Taxa de Comparecimento (%)', 'Taxa de Falta (%)'];
      rows = municipioReport.map(m => [
        m.municipio, 
        m.pacientesCount.toString(), 
        m.atendimentos.toString(), 
        m.concluidos.toString(), 
        m.pendentes.toString(), 
        m.faltas.toString(), 
        m.cancelados.toString(), 
        m.remarcados.toString(), 
        m.retornos.toString(), 
        m.taxaComparecimento.toString(), 
        m.taxaFalta.toString()
      ]);

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
    } else if (type === 'fila') {
      headers = ['Posição', 'Paciente', 'Unidade', 'Setor', 'Prioridade', 'Status', 'Hora Chegada', 'Hora Chamada'];
      rows = filaReport.items.map(f => {
        const un = unidadesMap.get(f.unidade_id);
        return [f.posicao.toString(), f.paciente_nome, un?.nome || '', f.setor, f.prioridade, f.status, f.hora_chegada, f.hora_chamada || ''];
      });
    } else if (type === 'clinico') {
      headers = ['Bloco', 'Item', 'Quantidade', 'Percentual'];
      const tot = clinicalReport.kpis.totalPacientesComCID || 1;
      const blocks: string[][] = [];
      blocks.push(['KPI', 'Total com CID', String(clinicalReport.kpis.totalPacientesComCID), '100%']);
      blocks.push(['KPI', 'TEA/Autismo', String(clinicalReport.kpis.tea), `${((clinicalReport.kpis.tea/tot)*100).toFixed(1)}%`]);
      blocks.push(['KPI', 'Def. Física', String(clinicalReport.kpis.fisica), `${((clinicalReport.kpis.fisica/tot)*100).toFixed(1)}%`]);
      blocks.push(['KPI', 'Def. Intelectual', String(clinicalReport.kpis.intelectual), `${((clinicalReport.kpis.intelectual/tot)*100).toFixed(1)}%`]);
      blocks.push(['KPI', 'Def. Auditiva', String(clinicalReport.kpis.auditiva), `${((clinicalReport.kpis.auditiva/tot)*100).toFixed(1)}%`]);
      blocks.push(['KPI', 'Def. Visual', String(clinicalReport.kpis.visual), `${((clinicalReport.kpis.visual/tot)*100).toFixed(1)}%`]);
      blocks.push(['KPI', 'Def. Múltipla', String(clinicalReport.kpis.multipla), `${((clinicalReport.kpis.multipla/tot)*100).toFixed(1)}%`]);
      blocks.push(['KPI', 'Múltiplos CIDs', String(clinicalReport.kpis.multiplosCids), `${clinicalReport.kpis.multiplosCidsPercent}%`]);
      blocks.push(['KPI', 'Média CID/paciente', String(clinicalReport.kpis.mediaCidPorPaciente), '-']);
      clinicalReport.byCategory.forEach(c => blocks.push(['Categoria', c.name, String(c.pacientes), `${((c.pacientes/tot)*100).toFixed(1)}%`]));
      clinicalReport.topCids20.forEach((c, i) => blocks.push([`Top CID ${i+1}`, `${c.cid} — ${c.descricao}`, String(c.count), `${c.percent}%`]));
      clinicalReport.sexoDist.forEach(s => blocks.push(['Sexo', s.name, String(s.value), `${((s.value/tot)*100).toFixed(1)}%`]));
      clinicalReport.faixaEtariaDist.forEach(f => blocks.push(['Faixa Etária', f.name, String(f.value), `${((f.value/tot)*100).toFixed(1)}%`]));
      clinicalReport.evolucaoTemporal.forEach(e => blocks.push(['Evolução Mensal', e.month, String(e.value), '-']));
      rows = blocks;
    }



    const csv = [headers, ...rows].map(r => r.map(c => `"${c}"`).join(';')).join('\n');
    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = filename; a.click();
    URL.revokeObjectURL(url);
  }, [filtered, porProfissional, faltasReport, pacientesReport, filaReport, unidades]);

  // === EXPORT EXCEL (XML Spreadsheet) ===
  const exportExcel = useCallback((type: string) => {
    let headers: string[] = [];
    let rows: string[][] = [];

    if (type === 'agendamentos' || type === 'geral' || type === 'detalhado') {
      headers = ['Data', 'Hora', 'Paciente', 'Profissional', 'Unidade', 'Tipo', 'Status', 'Origem'];
      rows = consolidatedData.map(d => {
        const un = unidadesMap.get(d.unidadeId);
        return [d.data, d.hora || '-', d.pacienteNome, d.profissionalNome, un?.nome || '', d.tipo, statusLabels[d.status] || d.status, d.origem || ''];
      });
    } else if (type === 'municipios') {
      headers = ['Município', 'Total Pacientes', 'Total Atendimentos', 'Concluídos', 'Pendentes', 'Faltas', 'Cancelados', 'Remarcados', 'Retornos', 'Taxa Comparecimento (%)', 'Taxa Falta (%)'];
      rows = municipioReport.map(m => [
        m.municipio, 
        m.pacientesCount.toString(), 
        m.atendimentos.toString(), 
        m.concluidos.toString(), 
        m.pendentes.toString(), 
        m.faltas.toString(), 
        m.cancelados.toString(), 
        m.remarcados.toString(), 
        m.retornos.toString(), 
        m.taxaComparecimento.toString(), 
        m.taxaFalta.toString()
      ]);

    } else if (type === 'produtividade') {
      headers = ['Profissional', 'Pacientes', 'Agendamentos', 'Concluídos', 'Faltas', 'Cancelamentos', 'Tempo Médio (min)', 'Taxa Conclusão (%)'];
      rows = porProfissional.map(p => [p.nome, p.pacientesAtendidos.toString(), p.total.toString(), p.concluidos.toString(), p.faltas.toString(), p.cancelados.toString(), p.tempoMedio.toString(), p.taxaConclusao.toString()]);
    } else if (type === 'faltas') {
      headers = ['Paciente', 'Telefone', 'Profissional', 'Total Faltas', 'Datas'];
      rows = faltasReport.map(f => [f.nome, f.telefone, f.profissional, f.total.toString(), f.datas.join(', ')]);
    } else if (type === 'pacientes') {
      headers = ['Paciente', 'Telefone', 'Agendamentos', 'Concluídos', 'Faltas', 'Última Consulta'];
      rows = pacientesReport.map(p => [p.nome, p.telefone, p.totalAgendamentos.toString(), p.concluidos.toString(), p.faltas.toString(), p.ultimaConsulta]);
    } else if (type === 'fila') {
      headers = ['Posição', 'Paciente', 'Unidade', 'Setor', 'Prioridade', 'Status', 'Hora Chegada'];
      rows = filaReport.items.map(f => {
        const un = unidadesMap.get(f.unidade_id);
        return [f.posicao.toString(), f.paciente_nome, un?.nome || '', f.setor, f.prioridade, f.status, f.hora_chegada];
      });
    } else if (type === 'clinico') {
      headers = ['Bloco', 'Item', 'Quantidade', 'Percentual'];
      const tot = clinicalReport.kpis.totalPacientesComCID || 1;
      const blocks: string[][] = [];
      blocks.push(['KPI', 'Total com CID', String(clinicalReport.kpis.totalPacientesComCID), '100%']);
      blocks.push(['KPI', 'TEA/Autismo', String(clinicalReport.kpis.tea), `${((clinicalReport.kpis.tea/tot)*100).toFixed(1)}%`]);
      blocks.push(['KPI', 'Def. Física', String(clinicalReport.kpis.fisica), `${((clinicalReport.kpis.fisica/tot)*100).toFixed(1)}%`]);
      blocks.push(['KPI', 'Def. Intelectual', String(clinicalReport.kpis.intelectual), `${((clinicalReport.kpis.intelectual/tot)*100).toFixed(1)}%`]);
      blocks.push(['KPI', 'Def. Auditiva', String(clinicalReport.kpis.auditiva), `${((clinicalReport.kpis.auditiva/tot)*100).toFixed(1)}%`]);
      blocks.push(['KPI', 'Def. Visual', String(clinicalReport.kpis.visual), `${((clinicalReport.kpis.visual/tot)*100).toFixed(1)}%`]);
      blocks.push(['KPI', 'Def. Múltipla', String(clinicalReport.kpis.multipla), `${((clinicalReport.kpis.multipla/tot)*100).toFixed(1)}%`]);
      blocks.push(['KPI', 'Múltiplos CIDs', String(clinicalReport.kpis.multiplosCids), `${clinicalReport.kpis.multiplosCidsPercent}%`]);
      blocks.push(['KPI', 'Média CID/paciente', String(clinicalReport.kpis.mediaCidPorPaciente), '-']);
      clinicalReport.byCategory.forEach(c => blocks.push(['Categoria', c.name, String(c.pacientes), `${((c.pacientes/tot)*100).toFixed(1)}%`]));
      clinicalReport.topCids20.forEach((c, i) => blocks.push([`Top CID ${i+1}`, `${c.cid} — ${c.descricao}`, String(c.count), `${c.percent}%`]));
      clinicalReport.sexoDist.forEach(s => blocks.push(['Sexo', s.name, String(s.value), `${((s.value/tot)*100).toFixed(1)}%`]));
      clinicalReport.faixaEtariaDist.forEach(f => blocks.push(['Faixa Etária', f.name, String(f.value), `${((f.value/tot)*100).toFixed(1)}%`]));
      clinicalReport.evolucaoTemporal.forEach(e => blocks.push(['Evolução Mensal', e.month, String(e.value), '-']));
      rows = blocks;
    }



    // Build XML Spreadsheet (Excel-compatible)
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
  }, [consolidatedData, porProfissional, faltasReport, pacientesReport, filaReport, unidades, municipioReport, clinicalReport]);

  // === DOWNLOAD PDF REAL ===
  const downloadPDF = useCallback(async (type: string) => {
    const isEmpty =
      (type === 'agendamentos' || type === 'geral' || type === 'detalhado') ? (consolidatedData.length === 0 && porProfissional.length === 0) :
      type === 'produtividade' ? porProfissional.length === 0 :
      type === 'municipios' ? municipioReport.length === 0 :
      type === 'faltas' ? faltasReport.length === 0 :
      type === 'pacientes' ? pacientesReport.length === 0 :
      type === 'clinico' ? clinicalReport.byCategory.length === 0 :
      type === 'fila' ? filaReport.items.length === 0 : false;

    if (isEmpty) {
      toast.warning('Não há dados para exportar', { description: 'Ajuste os filtros e tente novamente.' });
      return;
    }

    const loadingId = toast.loading('Gerando arquivo PDF...', { description: 'Montando o documento para download.' });
    try {
      await new Promise(r => requestAnimationFrame(() => r(null)));
      const titleMap: Record<string, string> = { geral: 'Relatório Geral', agendamentos: 'Relatório de Agendamentos', detalhado: 'Relatório Detalhado', produtividade: 'Relatório de Produtividade', municipios: 'Relatório por Município', faltas: 'Relatório de Faltas', pacientes: 'Relatório de Pacientes', fila: 'Relatório de Fila de Espera', clinico: 'Relatório de Análise Clínica' };
      const title = titleMap[type] || 'Relatório';
      const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
      const un = filterUnit !== 'all' ? unidadesMap.get(filterUnit)?.nome : 'Todas';
      const prof = filterProf !== 'all' ? profissionaisMap.get(filterProf)?.nome : 'Todos';
      const periodo = `${dateFrom || 'Início'} a ${dateTo || 'Atual'}`;
      const generatedAt = new Date().toLocaleString('pt-BR');
      const ROW_LIMIT = 3000;
      let truncated = false;
      const cap = <T,>(arr: T[]): T[] => {
        if (arr.length > ROW_LIMIT) { truncated = true; return arr.slice(0, ROW_LIMIT); }
        return arr;
      };

      doc.setProperties({ title, subject: 'Relatório SMS Oriximiná' });
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(13);
      doc.text(title, 14, 14);
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(8);
      doc.text(`Período: ${periodo}   Unidade: ${un || 'Todas'}   Profissional: ${prof || 'Todos'}`, 14, 20);
      doc.text(`Emitido em: ${generatedAt}`, 14, 25);

      const summaryRows = [
        ['Total Agendamentos', String(stats.total), 'Atendimentos', String(tempoStats.totalAtendimentos), 'Concluídos', String(stats.concluidos), 'Faltas', String(stats.faltas)],
        ['Cancelados', String(stats.cancelados), 'Remarcados', String(stats.remarcados), 'Tempo Médio', `${tempoStats.tempoMedio}min`, 'Comparecimento', `${stats.taxaComparecimento}%`],
      ];
      autoTable(doc, {
        startY: 31,
        body: summaryRows,
        theme: 'grid',
        styles: { fontSize: 8, cellPadding: 2, overflow: 'linebreak' },
        alternateRowStyles: { fillColor: [248, 250, 252] },
      });

      let y = ((doc as any).lastAutoTable?.finalY || 31) + 6;
      const addTable = (subtitle: string, head: string[], bodyRows: (string | number)[][]) => {
        if (!bodyRows.length) return;
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(10);
        doc.text(subtitle, 14, y);
        autoTable(doc, {
          startY: y + 3,
          head: [head],
          body: bodyRows,
          theme: 'grid',
          styles: { fontSize: 7, cellPadding: 1.6, overflow: 'linebreak', valign: 'middle' },
          headStyles: { fillColor: [42, 111, 151], textColor: [255, 255, 255], fontStyle: 'bold' },
          alternateRowStyles: { fillColor: [248, 250, 252] },
          margin: { left: 10, right: 10 },
        });
        y = ((doc as any).lastAutoTable?.finalY || y) + 7;
      };

      if (type === 'agendamentos' || type === 'geral' || type === 'detalhado') {
        addTable('Agendamentos Detalhados', ['Data', 'Hora', 'Paciente', 'Profissional', 'Unidade', 'Tipo', 'Status'], cap(consolidatedData).map(a => [a.data || '', a.hora || '-', a.pacienteNome || '', a.profissionalNome || '', unidadesMap.get(a.unidadeId)?.nome || '', a.tipo || '', statusLabels[a.status] || a.status || '']));
        addTable('Produtividade por Profissional', ['Profissional', 'Unidade', 'Pacientes', 'Total', 'Concluídos', 'Faltas', 'Cancelados', 'Tempo Médio', 'Taxa'], cap(porProfissional).map(p => [p.nome, p.unidade, p.pacientesAtendidos, p.total, p.concluidos, p.faltas, p.cancelados, p.tempoMedio ? `${p.tempoMedio}min` : '-', `${p.taxaConclusao}%`]));
      } else if (type === 'produtividade') {
        addTable('Produtividade por Profissional', ['Profissional', 'Unidade', 'Pacientes', 'Total', 'Concluídos', 'Faltas', 'Cancelamentos', 'Remarcados', 'Retornos', 'Tempo Médio', 'Taxa Conclusão', 'Taxa Retorno'], cap(porProfissional).map(p => [p.nome, p.unidade, p.pacientesAtendidos, p.total, p.concluidos, p.faltas, p.cancelados, p.remarcados, p.retornos, p.tempoMedio ? `${p.tempoMedio}min` : '-', `${p.taxaConclusao}%`, `${p.taxaRetorno}%`]));
      } else if (type === 'municipios') {
        addTable('Relatório por Município', ['Município', 'Pacientes', 'Atendimentos', 'Concluídos', 'Pendentes', 'Faltas', 'Cancelados', 'Remarcados', 'Retornos', 'Comparecim.', 'Taxa Falta'], cap(municipioReport).map(m => [m.municipio, m.pacientesCount, m.atendimentos, m.concluidos, m.pendentes, m.faltas, m.cancelados, m.remarcados, m.retornos, `${m.taxaComparecimento}%`, `${m.taxaFalta}%`]));

      } else if (type === 'faltas') {
        addTable('Relatório de Faltas', ['Paciente', 'E-mail', 'Telefone', 'Profissional', 'Unidade', 'Total', 'Datas'], cap(faltasReport).map(f => [f.nome, f.email, f.telefone, f.profissional, f.unidade, f.total, f.datas.join(', ')]));
      } else if (type === 'pacientes') {
        addTable('Relatório de Pacientes', ['Paciente', 'E-mail', 'Telefone', 'Agendamentos', 'Concluídos', 'Faltas', 'Retornos', 'Última Consulta'], cap(pacientesReport).map(p => [p.nome, p.email, p.telefone, p.totalAgendamentos, p.concluidos, p.faltas, p.retornos, p.ultimaConsulta]));
      } else if (type === 'fila') {
        addTable('Fila de Espera', ['Posição', 'Paciente', 'Unidade', 'Setor', 'Prioridade', 'Status', 'Chegada', 'Chamada'], cap(filaReport.items).map(f => [f.posicao, f.paciente_nome, unidadesMap.get(f.unidade_id)?.nome || '', f.setor, f.prioridade, f.status, f.hora_chegada, f.hora_chamada || '-']));
      } else if (type === 'clinico') {
        const k = clinicalReport.kpis;
        const tot = k.totalPacientesComCID || 1;
        addTable('Indicadores CER II', ['Indicador', 'Quantidade', '% sobre total'], [
          ['Total com CID', k.totalPacientesComCID, '100%'],
          ['TEA / Autismo', k.tea, `${((k.tea/tot)*100).toFixed(1)}%`],
          ['Deficiência Física', k.fisica, `${((k.fisica/tot)*100).toFixed(1)}%`],
          ['Deficiência Intelectual', k.intelectual, `${((k.intelectual/tot)*100).toFixed(1)}%`],
          ['Deficiência Auditiva', k.auditiva, `${((k.auditiva/tot)*100).toFixed(1)}%`],
          ['Deficiência Visual', k.visual, `${((k.visual/tot)*100).toFixed(1)}%`],
          ['Deficiência Múltipla', k.multipla, `${((k.multipla/tot)*100).toFixed(1)}%`],
          ['Pacientes com Múltiplos CIDs', k.multiplosCids, `${k.multiplosCidsPercent}%`],
          ['Média de CID por paciente', k.mediaCidPorPaciente, '-'],
        ]);
        addTable('Análise Clínica por Categoria', ['Categoria Clínica', 'Pacientes Únicos', 'Total Atendimentos', 'Total Procedimentos'], cap(clinicalReport.byCategory).map(c => [c.name, c.pacientes, c.atendimentos, c.procedimentos]));
        addTable('Top 20 CID-10', ['#', 'Código', 'Descrição', 'Quantidade', '%'], cap(clinicalReport.topCids20).map((c, i) => [i + 1, c.cid, c.descricao, c.count, `${c.percent}%`]));
        addTable('Distribuição por Sexo', ['Sexo', 'Pacientes', '%'], clinicalReport.sexoDist.map(s => [s.name, s.value, `${((s.value/tot)*100).toFixed(1)}%`]));
        addTable('Distribuição por Faixa Etária', ['Faixa', 'Pacientes', '%'], clinicalReport.faixaEtariaDist.map(f => [f.name, f.value, `${((f.value/tot)*100).toFixed(1)}%`]));
        addTable('Evolução Temporal dos Diagnósticos', ['Mês', 'Diagnósticos'], cap(clinicalReport.evolucaoTemporal).map(e => [e.month, e.value]));
      }



      if (truncated) {
        toast.warning(`PDF limitado a ${ROW_LIMIT} linhas`, { description: 'Para o conjunto completo, use Excel.' });
      }
      doc.save(`relatorio_${type}_${new Date().toISOString().split('T')[0]}.pdf`);
      toast.success('PDF gerado com sucesso', { description: 'O download do arquivo foi iniciado.' });
    } catch (err) {
      console.error('[downloadPDF] erro:', err);
      toast.error('Não foi possível gerar o PDF', { description: 'Verifique os filtros e tente novamente.' });
    } finally {
      toast.dismiss(loadingId);
    }
  }, [filtered, porProfissional, faltasReport, pacientesReport, filaReport, stats, tempoStats, unidades, filterUnit, filterProf, dateFrom, dateTo, profissionais]);

  // === EXPORT PDF ===
  const exportPDF = useCallback(async (type: string) => {
    try {
      // Empty-data guard per tab
      const isEmpty =
        (type === 'agendamentos' || type === 'geral' || type === 'detalhado') ? (consolidatedData.length === 0 && porProfissional.length === 0) :
        type === 'produtividade' ? porProfissional.length === 0 :
        type === 'municipios' ? municipioReport.length === 0 :
        type === 'faltas' ? faltasReport.length === 0 :
        type === 'pacientes' ? pacientesReport.length === 0 :
        type === 'fila' ? filaReport.items.length === 0 : false;
      if (isEmpty) {
        toast.warning('Não há dados para exportar', { description: 'Ajuste os filtros e tente novamente.' });
        return;
      }
      const loadingId = toast.loading('Gerando PDF...', { description: 'Preparando documento para impressão / salvar como PDF.' });
      await new Promise(r => requestAnimationFrame(() => r(null))); // yield UI
    const un = filterUnit !== 'all' ? unidadesMap.get(filterUnit)?.nome : 'Todas';
    const prof = filterProf !== 'all' ? profissionaisMap.get(filterProf)?.nome : 'Todos';
    const periodo = `${dateFrom || 'Início'} a ${dateTo || 'Atual'}`;

    let body = '';

    const summaryBlock = `
      <div class="summary">
        <div class="stat"><strong>${stats.total}</strong><small>Total Agendamentos</small></div>
        <div class="stat"><strong>${tempoStats.totalAtendimentos}</strong><small>Atendimentos</small></div>
        <div class="stat"><strong>${stats.concluidos}</strong><small>Concluídos</small></div>
        <div class="stat"><strong>${stats.faltas}</strong><small>Faltas</small></div>
        <div class="stat"><strong>${stats.cancelados}</strong><small>Cancelados</small></div>
        <div class="stat"><strong>${stats.remarcados}</strong><small>Remarcados</small></div>
        <div class="stat"><strong>${tempoStats.tempoMedio}min</strong><small>Tempo Médio</small></div>
        <div class="stat"><strong>${stats.taxaComparecimento}%</strong><small>Comparecimento</small></div>
      </div>`;

    // Limite de linhas por documento para evitar "Out of Memory" no navegador.
    // Acima disso, sugerimos exportar em Excel.
    const ROW_LIMIT = 3000;
    let truncated = false;
    const cap = <T,>(arr: T[]): T[] => {
      if (arr.length > ROW_LIMIT) { truncated = true; return arr.slice(0, ROW_LIMIT); }
      return arr;
    };

    if (type === 'agendamentos' || type === 'geral' || type === 'detalhado') {
      const rows = cap(consolidatedData).map(a => {
        const unName = unidadesMap.get(a.unidadeId)?.nome || '';
        return `<tr><td>${a.data}</td><td>${a.hora || '-'}</td><td>${a.pacienteNome}</td><td>${a.profissionalNome}</td><td>${unName}</td><td>${a.tipo}</td><td>${statusLabels[a.status] || a.status}</td><td>-</td><td>-</td><td>-</td></tr>`;
      }).join('');
      const prodRows = cap(porProfissional).map(p =>
        `<tr><td>${p.nome}</td><td>${p.unidade}</td><td>${p.pacientesAtendidos}</td><td>${p.total}</td><td>${p.concluidos}</td><td>${p.faltas}</td><td>${p.cancelados}</td><td>${p.tempoMedio ? p.tempoMedio + 'min' : '-'}</td><td>${p.taxaConclusao}%</td></tr>`
      ).join('');
      body = `${summaryBlock}
        <h2>Agendamentos Detalhados</h2>
        <table><thead><tr><th>Data</th><th>Hora</th><th>Paciente</th><th>Profissional</th><th>Unidade</th><th>Tipo</th><th>Status</th><th>Início</th><th>Fim</th><th>Duração</th></tr></thead><tbody>${rows}</tbody></table>
        <h2>Produtividade por Profissional</h2>
        <table><thead><tr><th>Profissional</th><th>Unidade</th><th>Pacientes</th><th>Total</th><th>Concluídos</th><th>Faltas</th><th>Cancelados</th><th>Tempo Médio</th><th>Taxa</th></tr></thead><tbody>${prodRows}</tbody></table>`;
    } else if (type === 'produtividade') {
      const prodRows = cap(porProfissional).map(p =>
        `<tr><td>${p.nome}</td><td>${p.unidade}</td><td>${p.pacientesAtendidos}</td><td>${p.total}</td><td>${p.concluidos}</td><td>${p.faltas}</td><td>${p.cancelados}</td><td>${p.remarcados}</td><td>${p.retornos}</td><td>${p.tempoMedio ? p.tempoMedio + 'min' : '-'}</td><td>${p.taxaConclusao}%</td><td>${p.taxaRetorno}%</td></tr>`
      ).join('');
      body = `${summaryBlock}
        <h2>Produtividade por Profissional</h2>
        <table><thead><tr><th>Profissional</th><th>Unidade</th><th>Pacientes</th><th>Total</th><th>Concluídos</th><th>Faltas</th><th>Cancelamentos</th><th>Remarcados</th><th>Retornos</th><th>Tempo Médio</th><th>Taxa Conclusão</th><th>Taxa Retorno</th></tr></thead><tbody>${prodRows}</tbody></table>`;
    } else if (type === 'municipios') {
      const muniRows = cap(municipioReport).map(m =>
        `<tr><td>${m.municipio}</td><td>${m.pacientesCount}</td><td>${m.atendimentos}</td><td>${m.concluidos}</td><td>${m.pendentes}</td><td>${m.faltas}</td><td>${m.cancelados}</td><td>${m.remarcados}</td><td>${m.retornos}</td><td>${m.taxaComparecimento}%</td><td>${m.taxaFalta}%</td></tr>`
      ).join('');
      body = `${summaryBlock}
        <h2>Relatório por Município</h2>
        <table><thead><tr><th>Município</th><th>Pacientes</th><th>Atendimentos</th><th>Concluídos</th><th>Pendentes</th><th>Faltas</th><th>Cancelados</th><th>Remarcados</th><th>Retornos</th><th>Comparecim.</th><th>Taxa Falta</th></tr></thead><tbody>${muniRows}</tbody></table>`;



    } else if (type === 'faltas') {
      const rows = cap(faltasReport).map(f =>
        `<tr><td>${f.nome}</td><td>${f.email}</td><td>${f.telefone}</td><td>${f.profissional}</td><td>${f.unidade}</td><td>${f.total}</td><td>${f.datas.join(', ')}</td></tr>`
      ).join('');
      body = `${summaryBlock}
        <h2>Relatório de Faltas</h2>
        <table><thead><tr><th>Paciente</th><th>E-mail</th><th>Telefone</th><th>Profissional</th><th>Unidade</th><th>Total</th><th>Datas</th></tr></thead><tbody>${rows}</tbody></table>`;
    } else if (type === 'pacientes') {
      const rows = cap(pacientesReport).map(p =>
        `<tr><td>${p.nome}</td><td>${p.email}</td><td>${p.telefone}</td><td>${p.totalAgendamentos}</td><td>${p.concluidos}</td><td>${p.faltas}</td><td>${p.retornos}</td><td>${p.ultimaConsulta}</td></tr>`
      ).join('');
      body = `${summaryBlock}
        <h2>Relatório de Pacientes</h2>
        <table><thead><tr><th>Paciente</th><th>E-mail</th><th>Telefone</th><th>Agendamentos</th><th>Concluídos</th><th>Faltas</th><th>Retornos</th><th>Última Consulta</th></tr></thead><tbody>${rows}</tbody></table>`;
    } else if (type === 'fila') {
      const filaRows = cap(filaReport.items).map(f => {
        const unName = unidadesMap.get(f.unidade_id)?.nome || '';
        return `<tr><td>${f.posicao}</td><td>${f.paciente_nome}</td><td>${unName}</td><td>${f.setor}</td><td>${f.prioridade}</td><td>${f.status}</td><td>${f.hora_chegada}</td><td>${f.hora_chamada || '-'}</td></tr>`;
      }).join('');
      body = `
        <div class="summary">
          <div class="stat"><strong>${filaReport.total}</strong><small>Total na Fila</small></div>
          <div class="stat"><strong>${filaReport.aguardando}</strong><small>Aguardando</small></div>
          <div class="stat"><strong>${filaReport.chamados}</strong><small>Chamados</small></div>
          <div class="stat"><strong>${filaReport.desistencias}</strong><small>Desistências</small></div>
        </div>
        <h2>Fila de Espera</h2>
        <table><thead><tr><th>Posição</th><th>Paciente</th><th>Unidade</th><th>Setor</th><th>Prioridade</th><th>Status</th><th>Chegada</th><th>Chamada</th></tr></thead><tbody>${filaRows}</tbody></table>`;
    }

    if (truncated) {
      body += `<p style="margin-top:12px;font-size:9pt;color:#b45309;"><strong>Aviso:</strong> resultado limitado às primeiras ${ROW_LIMIT} linhas para impressão. Use a exportação em Excel para o conjunto completo.</p>`;
      toast.warning(`Mostrando ${ROW_LIMIT} linhas no PDF`, { description: 'Para o conjunto completo, exporte em Excel.' });
    }

    const titleMap: Record<string, string> = { geral: 'Relatório Geral', agendamentos: 'Relatório de Agendamentos', detalhado: 'Relatório Detalhado', produtividade: 'Relatório de Produtividade', faltas: 'Relatório de Faltas', pacientes: 'Relatório de Pacientes', fila: 'Relatório de Fila de Espera' };

      await openPrintDocument(
        titleMap[type] || 'Relatório',
        body,
        { 'Período': periodo, 'Unidade': un || 'Todas', 'Profissional': prof || 'Todos' }
      );
      toast.dismiss(loadingId);
      toast.success('Documento pronto', { description: 'A janela de impressão foi aberta. Use "Salvar como PDF" para baixar.' });
    } catch (err) {
      console.error('[exportPDF] erro:', err);
      toast.error('Não foi possível gerar o PDF', { description: 'Tente novamente em instantes.' });
    }
  }, [filtered, porProfissional, faltasReport, pacientesReport, filaReport, stats, tempoStats, unidades, filterUnit, filterProf, dateFrom, dateTo, profissionais]);

  // === MAPA DE ATENDIMENTO ===
  const generateMapa = useCallback(async () => {
    if (!dateFrom || !dateTo) {
      toast.warning('Selecione o período para o mapa');
      return;
    }
    setMapaLoading(true);
    try {
      let query = supabase
        .from('agendamentos')
        .select('id, paciente_id, paciente_nome, profissional_id, profissional_nome, data, hora, tipo, setor_id, procedimento_sigtap, nome_procedimento, cid_concluido')
        .eq('status', 'concluido')
        .gte('data', dateFrom)
        .lte('data', dateTo)
        .order('data', { ascending: true });

      if (mapaProf !== 'all') {
        query = query.eq('profissional_id', mapaProf);
      }
      if (user?.unidadeId && user?.usuario !== 'admin.sms') {
        query = query.eq('unidade_id', user.unidadeId);
      }

      const { data: agend } = await query;

      if (!agend || agend.length === 0) {
        setMapaData([]);
        setMapaGenerated(true);
        setMapaLoading(false);
        return;
      }

      const pacienteIds = [...new Set(agend.map(a => a.paciente_id).filter(Boolean))];
      const { data: pacs } = await supabase
        .from('pacientes')
        .select('id, cns, telefone, cid, cpf, data_nascimento, endereco, logradouro, numero, complemento, bairro, municipio, tipo_logradouro, custom_data')
        .in('id', pacienteIds);

      const pacMap = new Map((pacs || []).map(p => [p.id, p]));
      const profIds = [...new Set(agend.map(a => a.profissional_id).filter(Boolean))];
      const profMap = new Map(funcionarios.filter(f => profIds.includes(f.id)).map(f => [f.id, f]));

      // Buscar CIDs e Procedimentos dos prontuários concluídos para os agendamentos encontrados
      const agendIds = agend.map(a => a.id);
      const { data: prons } = await supabase
        .from('prontuarios')
        .select('id, agendamento_id, hipotese, outro_procedimento, procedimentos_texto, queixa_principal')

        .in('agendamento_id', agendIds);

      const pronIds = prons?.map(p => p.id) || [];
      const { data: pronProcs } = await supabase
        .from('prontuario_procedimentos')
        .select('prontuario_id, procedimento_id, cids_selecionados')
        .in('prontuario_id', pronIds);

      // Fetch procedures from both tables to map IDs to SIGTAP codes and names
      const [{ data: legacyProcs }, { data: sigtapProcs }] = await Promise.all([
        supabase.from('procedimentos').select('id, codigo_sigtap, nome'),
        supabase.from('sigtap_procedimentos').select('id, codigo, nome')
      ]);

      const proceduresMap = new Map();
      (legacyProcs || []).forEach(p => {
        proceduresMap.set(p.id, { codigo: p.codigo_sigtap, nome: p.nome });
      });
      (sigtapProcs || []).forEach(p => {
        proceduresMap.set(p.id, { codigo: p.codigo, nome: p.nome });
      });


      const pronsMap = new Map<string, any[]>();
      prons?.forEach(p => {
        if (p.agendamento_id) {
          const list = pronsMap.get(p.agendamento_id) || [];
          list.push(p);
          pronsMap.set(p.agendamento_id, list);
        }
      });

      const pronProcsGrouped = new Map<string, any[]>();
      pronProcs?.forEach(pp => {
        const list = pronProcsGrouped.get(pp.prontuario_id) || [];
        list.push(pp);
        pronProcsGrouped.set(pp.prontuario_id, list);
      });

      // Consolidar registros por Paciente + Data + Profissional
      const groups = new Map<string, any[]>();
      agend.forEach(a => {
        const key = `${a.paciente_id}-${a.data}-${a.profissional_id}`;
        const group = groups.get(key) || [];
        group.push(a);
        groups.set(key, group);
      });

      const rows: any[] = [];
      let counter = 1;

      groups.forEach((groupAgend, key) => {
        const a = groupAgend[0]; 
        const pac = pacMap.get(a.paciente_id);
        const prof = profMap.get(a.profissional_id);
        
        // Montar dados de endereço a partir do paciente e seu custom_data
        const cd = (pac?.custom_data as any) || {};
        const tipo_logradouro = pac?.tipo_logradouro || cd.tipo_logradouro_dne || cd.tipoLogradouroDne || cd.tipoLogradouro || '';
        const logradouro = pac?.logradouro || cd.logradouro || '';
        const numero = pac?.numero || cd.numero || '';
        const complemento = pac?.complemento || cd.complemento || '';
        const bairro = pac?.bairro || cd.bairro || '';
        const municipio = pac?.municipio || cd.municipio || '';

        let enderecoComp = 'Não informado';
        if (pac) {
          const hasMainInfo = logradouro || numero || bairro;
          if (hasMainInfo) {
            const addrParts = [];
            const logradouroFull = `${tipo_logradouro} ${logradouro}`.trim();
            if (logradouroFull) addrParts.push(logradouroFull);
            if (numero) addrParts.push(`Nº ${numero}`);
            if (complemento) addrParts.push(complemento);
            if (bairro) addrParts.push(bairro);
            if (municipio) addrParts.push(municipio);
            enderecoComp = addrParts.join(', ');
          } else if (municipio) {
            enderecoComp = `Endereço incompleto (${municipio})`;
          } else if (pac.endereco && pac.endereco.trim()) {
             enderecoComp = pac.endereco;
          }
        }

        const procsRealizadosList = new Set<string>();
        const procsSigtapList = new Set<string>();
        const cidsList = new Set<string>();
        const obsList = new Set<string>();

        groupAgend.forEach(ag => {
          // 1. SIGTAP do agendamento
          if (ag.procedimento_sigtap) {
            procsSigtapList.add(`${ag.procedimento_sigtap}${ag.nome_procedimento ? ' - ' + ag.nome_procedimento : ''}`);
            if (ag.nome_procedimento) procsRealizadosList.add(ag.nome_procedimento);
          }
          if (ag.cid_concluido) {
            ag.cid_concluido.split(/[,;\s]+/).forEach((c: string) => {
              const cleaned = c.trim().toUpperCase();
              if (cleaned) cidsList.add(cleaned);
            });
          }

          // 2. Dados do prontuário vinculado ao agendamento
          const relatedProns = pronsMap.get(ag.id) || [];
          relatedProns.forEach(pron => {
            if (pron.queixa_principal) obsList.add(pron.queixa_principal);
            if (pron.hipotese) {
              pron.hipotese.split(/[,;\s]+/).forEach((c: string) => {
                const cleaned = c.trim().toUpperCase();
                if (cleaned) cidsList.add(cleaned);
              });
            }
            
            // 3. Procedimentos detalhados do prontuário
            const pProcs = pronProcsGrouped.get(pron.id) || [];
            pProcs.forEach(pp => {
              const procInfo = proceduresMap.get(pp.procedimento_id);
              if (procInfo) {
                const sigtapLabel = `${procInfo.codigo || ''}${procInfo.nome ? ' - ' + procInfo.nome : ''}`;
                procsSigtapList.add(sigtapLabel);
                if (procInfo.nome) procsRealizadosList.add(procInfo.nome);
              }
              
              if (Array.isArray(pp.cids_selecionados)) {
                pp.cids_selecionados.forEach((c: string) => {
                  const cleaned = c.trim().toUpperCase();
                  if (cleaned) cidsList.add(cleaned);
                });
              }
            });

            if (pron.outro_procedimento) {
              procsRealizadosList.add(pron.outro_procedimento);
              procsSigtapList.add(pron.outro_procedimento);
            }
          });
        });

        rows.push({
          num: counter++,
          paciente_nome: a.paciente_nome || '',
          data_atendimento: a.data,
          data_nascimento: pac?.data_nascimento || '',
          cpf: pac?.cpf || '',
          cns: pac?.cns || '',
          telefone: pac?.telefone || '',
          tipo_logradouro,
          logradouro,
          numero,
          complemento,
          bairro,
          municipio,
          endereco_completo: enderecoComp,
          profissional_nome: a.profissional_nome || '',
          profissional_id: a.profissional_id || '',
          especialidade: prof?.profissao || prof?.setor || a.setor_id || '',
          procedimentos_realizados: Array.from(procsRealizadosList).filter(Boolean).sort().join('; ') || 'Não informado',
          procedimento_sigtap: Array.from(procsSigtapList).filter(Boolean).sort().join('; ') || 'Não informado',
          cid: Array.from(cidsList).filter(Boolean).sort().join(', ') || 'Não informado',
          observacoes: Array.from(obsList).filter(Boolean).join('; ') || ''
        });
      });


      setMapaData(rows);

      setMapaGenerated(true);
    } catch (e) {
      console.error('Erro ao gerar mapa:', e);
    } finally {
      setMapaLoading(false);
    }
  }, [dateFrom, dateTo, mapaProf, funcionarios]);


  const exportMapaPDF = useCallback(async () => {
    if (mapaData.length === 0) {
      toast.warning('Não há dados para exportar', { description: 'Gere o relatório primeiro.' });
      return;
    }
    const loadingId = toast.loading('Gerando arquivo PDF...', { description: 'Montando mapa de atendimentos para download.' });
    try {
      await new Promise(r => requestAnimationFrame(() => r(null)));
      const now = new Date().toLocaleString('pt-BR');
      const periodo = `${formatDateBR(dateFrom)} a ${formatDateBR(dateTo)}`;
      const fmtCPF = (c: string) => { if (!c || c.length !== 11) return c || '-'; return c.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4'); };
      const fmtCNS = (c: string) => { const d = (c || '').replace(/\D/g, ''); if (d.length !== 15) return c || '-'; return `${d.slice(0,3)} ${d.slice(3,7)} ${d.slice(7,11)} ${d.slice(11)}`; };
      const ROW_LIMIT = 3000;
      const rows = mapaData.slice(0, ROW_LIMIT).map(r => {
        return [
          String(r.num).padStart(2, '0'), 
          r.paciente_nome || '', 
          formatDateBR(r.data_atendimento), 
          formatDateBR(r.data_nascimento), 
          fmtCPF(r.cpf), 
          r.cns || '-',
          r.telefone || '-',
          r.tipo_logradouro || '-',
          r.logradouro || '-',
          r.numero || '-',
          r.complemento || '-',
          r.bairro || '-',
          r.municipio || '-',
          r.profissional_nome || '', 
          r.especialidade || '-', 
          r.procedimentos_realizados || '-',
          r.procedimento_sigtap || '-', 
          r.cid || '-',
          r.observacoes || '-'
        ];
      });

      const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
      doc.setProperties({ title: 'Mapa de Atendimentos', subject: 'Relatório SMS Oriximiná' });
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(12);
      doc.text('SECRETARIA MUNICIPAL DE SAÚDE DE ORIXIMINÁ', 14, 13);
      doc.setFontSize(10);
      doc.text('Mapa de Atendimentos Concluídos', 14, 19);
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(8);
      doc.text(`Período: ${periodo}   Emitido em: ${now}`, 14, 25);
      doc.text(`Gerado por: ${user?.nome || '-'}`, 14, 30);

      autoTable(doc, {
        startY: 36,
        head: [['Nº', 'Paciente', 'Dt Atend', 'Dt Nasc', 'CPF', 'CNS', 'Telefone', 'Tipo Logr', 'Logradouro', 'Nº', 'Compl', 'Bairro', 'Município', 'Endereço Completo', 'Profissional', 'Especialidade', 'Procs Realizados', 'Proc. SIGTAP', 'CID', 'Obs']],
        body: rows,
        theme: 'grid',
        styles: { fontSize: 4.5, cellPadding: 0.8, overflow: 'linebreak', valign: 'middle' },
        headStyles: { fillColor: [42, 111, 151], textColor: [255, 255, 255], fontStyle: 'bold' },
        alternateRowStyles: { fillColor: [248, 250, 252] },
        margin: { left: 4, right: 4 },
      });


      const finalY = ((doc as any).lastAutoTable?.finalY || 36) + 6;
      doc.setFontSize(8);
      doc.text(`Total: ${mapaData.length} atendimentos`, 14, Math.min(finalY, 200));
      if (mapaData.length > ROW_LIMIT) {
        toast.warning(`PDF limitado a ${ROW_LIMIT} linhas`, { description: 'Para o conjunto completo, use CSV.' });
      }
      doc.save(`mapa_atendimentos_${new Date().toISOString().split('T')[0]}.pdf`);
      toast.success('PDF gerado com sucesso', { description: 'O download do arquivo foi iniciado.' });
    } catch (err) {
      console.error('[exportMapaPDF] erro:', err);
      toast.error('Não foi possível gerar o PDF', { description: 'Tente novamente em instantes.' });
    } finally {
      toast.dismiss(loadingId);
    }
  }, [mapaData, dateFrom, dateTo, user]);

  const exportMapaCSV = useCallback(() => {
    if (mapaData.length === 0) return;
    const fmtCPF = (c: string) => { if (!c || c.length !== 11) return c || ''; return c.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4'); };
    const headers = ['Nº', 'Nome do Paciente', 'Data Atendimento', 'Data Nascimento', 'CPF', 'CNS', 'Telefone', 'Tipo de Logradouro', 'Logradouro', 'Número', 'Complemento', 'Bairro', 'Município', 'Profissional', 'Especialidade', 'Procedimentos Realizados', 'Proc. SIGTAP', 'CID', 'Observações'];
    const rows = mapaData.map(r => [
      r.num.toString(), 
      r.paciente_nome, 
      formatDateBR(r.data_atendimento), 
      formatDateBR(r.data_nascimento), 
      fmtCPF(r.cpf),
      r.cns || '',
      r.telefone || '',
      r.tipo_logradouro || '',
      r.logradouro || '',
      r.numero || '',
      r.complemento || '',
      r.bairro || '',
      r.municipio || '',
      r.profissional_nome, 
      r.especialidade,
      r.procedimentos_realizados || '',
      r.procedimento_sigtap || '',
      r.cid,
      r.observacoes || ''
    ]);

    const csv = [headers, ...rows].map(r => r.map(c => `"${c}"`).join(';')).join('\n');
    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `mapa-atendimentos-${dateFrom}-a-${dateTo}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }, [mapaData, dateFrom, dateTo]);

  const clearFilters = () => {
    setFilterUnit('all'); setFilterProf('all'); setFilterStatus('all'); setFilterSetor('all'); setFilterTipo('all'); setDateFrom(''); setDateTo('');
  };

  // === ESCOPO DINÂMICO DO RELATÓRIO ===
  // Contextualiza títulos, conclusão e cabeçalhos com base nos filtros aplicados.
  const buildEscopo = useCallback(() => {
    const unObj = filterUnit !== 'all' ? unidadesMap.get(filterUnit) : null;
    const un = unObj?.nome || 'Todas';
    const profObj: any = filterProf !== 'all' ? profissionaisMap.get(filterProf) : null;
    const prof = profObj?.nome || 'Todos';
    const especialidade = profObj
      ? (profObj.especialidade || profObj.cargo || profObj.profissao || 'Não informada')
      : (filterTipo !== 'all' ? filterTipo : 'Todas');
    const status = filterStatus !== 'all' ? (statusLabels[filterStatus] || filterStatus) : 'Todos';
    const setor = filterSetor !== 'all' ? filterSetor : 'Todos';
    const tipo = filterTipo !== 'all' ? filterTipo : 'Todos';
    const municipio = 'Todos'; // sem filtro global por município
    const periodo = (dateFrom && dateTo)
      ? `${formatDateBR(dateFrom)} a ${formatDateBR(dateTo)}`
      : dateFrom ? `a partir de ${formatDateBR(dateFrom)}`
      : dateTo ? `até ${formatDateBR(dateTo)}`
      : 'Todo o período';

    let titulo = 'Relatório Institucional CER II';
    let conclusaoSujeito = 'pelo CER II';
    if (filterProf !== 'all' && profObj) {
      titulo = `Relatório de Produtividade Profissional — ${prof}`;
      conclusaoSujeito = `pelo(a) profissional ${prof}`;
    } else if (filterTipo !== 'all') {
      titulo = `Relatório da Especialidade de ${tipo}`;
      conclusaoSujeito = `na especialidade de ${tipo}`;
    } else if (filterSetor !== 'all') {
      titulo = `Relatório do Setor ${setor}`;
      conclusaoSujeito = `no setor ${setor}`;
    } else if (filterUnit !== 'all') {
      titulo = `Relatório Assistencial — ${un}`;
      conclusaoSujeito = `pela unidade ${un}`;
    }

    const escopo: Record<string, string> = {
      'Período': periodo,
      'Unidade': un,
      'Profissional': prof,
      'Especialidade': especialidade,
      'Município': municipio,
      'Status': status,
      'Setor': setor,
      'Tipo': tipo,
    };
    return { titulo, conclusaoSujeito, escopo, periodo, un, prof, especialidade, municipio, status, setor, tipo };
  }, [filterUnit, filterProf, filterStatus, filterSetor, filterTipo, dateFrom, dateTo, unidadesMap, profissionaisMap]);

  const [clinicalDetailDialog, setClinicalDetailDialog] = useState<{ open: boolean, category?: string }>({ open: false });


  const exportCompleteReport = useCallback(async (format: 'pdf' | 'docx') => {
    const loadingId = toast.loading(`Gerando relatório completo (${format.toUpperCase()})...`, { description: 'Preparando análise e formatação ABNT.' });
    try {
      const config = await loadDocumentConfig();
      const carimbo = user?.id ? await loadCarimbo(user.id) : null;
      const esc = buildEscopo();
      const un = esc.un;
      const profFilter = esc.prof;
      const periodo = esc.periodo;
      const tituloDinamico = esc.titulo;

      const intro = `Este documento apresenta o ${tituloDinamico}, referente ao período de ${periodo}. ` +
        `Os dados consolidados refletem os agendamentos, atendimentos e procedimentos registrados no sistema institucional, ` +
        `restritos ao escopo definido pelos filtros aplicados (unidade: ${esc.un}; profissional: ${esc.prof}; especialidade: ${esc.especialidade}; município: ${esc.municipio}; status: ${esc.status}), ` +
        `servindo como base para análise de desempenho e tomada de decisão institucional.`;

      const metodologia = `Os dados foram extraídos da base de dados do sistema de gestão, considerando exatamente os filtros listados na seção “Escopo do Relatório”. ` +
        `A análise utiliza indicadores de produtividade, taxa de absenteísmo, fluxo de pacientes por município e análises clínicas baseadas em CID-10 e categorias de reabilitação.`;

      const analiseExecutiva = `No período de ${periodo}, foram realizados ${stats.concluidos} atendimentos ${esc.conclusaoSujeito}, ` +
        `a partir de ${stats.total} agendamentos registrados, resultando em uma taxa de comparecimento de ${stats.taxaComparecimento}%. ` +
        `As faltas totalizaram ${stats.faltas} (${stats.taxaFalta}% do total). ` +
        `Foram identificados ${clinicalReport.kpis.totalPacientesComCID} pacientes com diagnósticos clínicos ativos, sendo ${clinicalReport.kpis.tea} casos de TEA.`;

      const escopoHtmlRows = Object.entries(esc.escopo).map(([k, v]) =>
        `<tr><td style="padding:4px 10px; border:1px solid #cbd5e1; font-weight:bold; width:35%;">${k}</td><td style="padding:4px 10px; border:1px solid #cbd5e1;">${v}</td></tr>`
      ).join('');
      const escopoHtml = `
        <section class="section" style="page-break-after: always;">
          <h2>Escopo do Relatório</h2>
          <p>Os indicadores, tabelas e análises a seguir refletem exatamente os filtros abaixo aplicados no momento da geração deste documento.</p>
          <table style="width:100%; border-collapse:collapse; font-size:11pt; margin-top:8px;">
            <tbody>${escopoHtmlRows}</tbody>
          </table>
        </section>`;

      const renderSection = (title: string, content: string, hasData: boolean = true) => `
        <section class="section">
          <h2>${title}</h2>
          ${hasData ? content : '<p style="color: #64748b; font-style: italic;">Sem dados disponíveis para o período filtrado.</p>'}
        </section>
      `;

      // ABNT cover + folha de rosto + sumário (apenas para PDF)
      const anoMes = new Date().toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' }).toUpperCase();
      const responsavelNome = user?.nome || 'Responsável Técnico';
      const responsavelCargo = user?.cargo || user?.profissao || '';
      const capaHtml = `
        <section style="height: 247mm; display: flex; flex-direction: column; justify-content: space-between; text-align: center; page-break-after: always; font-family: 'Times New Roman', Times, serif;">
          <div>
            <p style="font-size: 14pt; font-weight: bold; text-transform: uppercase; margin-bottom: 4px;">Prefeitura Municipal de Oriximiná – PA</p>
            <p style="font-size: 13pt; font-weight: bold; text-transform: uppercase;">Secretaria Municipal de Saúde</p>
            <p style="font-size: 12pt; font-weight: bold; text-transform: uppercase; margin-top: 4px;">Centro Especializado em Reabilitação – CER II</p>
          </div>
          <div>
            <h1 style="font-size: 18pt; font-weight: bold; text-transform: uppercase; margin-bottom: 24px;">${tituloDinamico}</h1>
            <p style="font-size: 13pt;">Unidade: <strong>${un}</strong></p>
            <p style="font-size: 13pt;">Período de referência: <strong>${periodo}</strong></p>
            <p style="font-size: 12pt; margin-top: 8px;">Profissional/Filtro: ${profFilter}</p>
          </div>
          <div>
            <p style="font-size: 12pt; font-weight: bold;">Oriximiná – Pará</p>
            <p style="font-size: 12pt; font-weight: bold;">${anoMes}</p>
          </div>
        </section>
        <section style="height: 247mm; display: flex; flex-direction: column; text-align: center; page-break-after: always; font-family: 'Times New Roman', Times, serif;">
          <div style="margin-top: 30mm;">
            <p style="font-size: 12pt; font-weight: bold; text-transform: uppercase;">${responsavelNome}</p>
          </div>
          <div style="margin: auto 0;">
            <h2 style="font-size: 16pt; font-weight: bold; text-transform: uppercase; margin-bottom: 14px;">Relatório Gerencial de Atendimentos</h2>
            <p style="font-size: 12pt; max-width: 130mm; margin: 0 auto; text-align: justify; text-indent: 1.25cm;">
              Documento institucional emitido pelo Centro Especializado em Reabilitação – CER II
              da Secretaria Municipal de Saúde de Oriximiná/PA, contendo a consolidação dos
              atendimentos, indicadores de produtividade, fluxo de pacientes e análise clínica
              referentes ao período de ${periodo}.
            </p>
          </div>
          <div style="margin-bottom: 10mm;">
            <p style="font-size: 12pt;">Responsável Técnico: ${responsavelNome}${responsavelCargo ? ' – ' + responsavelCargo : ''}</p>
            <p style="font-size: 12pt; font-weight: bold; margin-top: 18mm;">Oriximiná – Pará</p>
            <p style="font-size: 12pt; font-weight: bold;">${anoMes}</p>
          </div>
        </section>
        <section style="page-break-after: always; font-family: 'Times New Roman', Times, serif;">
          <h2 style="text-align: center; font-size: 14pt; font-weight: bold; text-transform: uppercase; margin-bottom: 18px;">Sumário</h2>
          <ol style="list-style: none; padding: 0; font-size: 12pt; line-height: 1.8;">
            ${['Introdução','Metodologia','Resumo Executivo','Indicadores Gerais por Categoria','Atendimentos por Período','Horários de Pico','Novos vs Retorno','Produtividade por Profissional','Faltas e Absenteísmo','Pacientes Atendidos','Fila de Espera','Triagem','Enfermagem','Avaliação Multiprofissional','Projeto Terapêutico Singular','Tratamentos','Análise Clínica','Análise Geográfica','Mapa de Atendimento','Relatório Detalhado','Considerações Finais'].map((t,i) => `
              <li style="display:flex; justify-content: space-between; border-bottom: 1px dotted #94a3b8; padding: 2px 0;">
                <span>${i+1}. ${t}</span><span>${i+4}</span>
              </li>
            `).join('')}
          </ol>
        </section>
      `;

      const bodyHtml = `
        ${capaHtml}
        ${escopoHtml}
        <div style="text-align: justify; font-family: 'Times New Roman', Times, serif; font-size: 12pt; line-height: 1.5;">

          ${renderSection("1. Introdução", `<p>${intro}</p>`)}
          ${renderSection("2. Metodologia", `<p>${metodologia}</p>`)}
          
          ${renderSection("3. Resumo Executivo", `
            <p>${analiseExecutiva}</p>
            <div class="summary">
              <div class="stat"><strong>${stats.total}</strong><small>Agendamentos</small></div>
              <div class="stat"><strong>${stats.concluidos}</strong><small>Atendimentos</small></div>
              <div class="stat"><strong>${stats.faltas}</strong><small>Faltas</small></div>
              <div class="stat"><strong>${stats.taxaComparecimento}%</strong><small>Comparecimento</small></div>
              <div class="stat"><strong>${clinicalReport.kpis.totalPacientesComCID}</strong><small>Pacientes Clínicos</small></div>
            </div>
          `)}

          ${renderSection("4. Indicadores Gerais por Categoria", `
            <table>
              <thead>
                <tr><th>Categoria</th><th>Total Agendados</th><th>Concluídos</th><th>Taxa</th></tr>
              </thead>
              <tbody>
                ${categoriaCards.map(c => `
                  <tr>
                    <td>${c.label}</td>
                    <td>${c.total}</td>
                    <td>${c.concluidos}</td>
                    <td>${c.total > 0 ? Math.round((c.concluidos / c.total) * 100) : 0}%</td>
                  </tr>
                `).join('')}
              </tbody>
            </table>
          `, categoriaCards.some(c => c.total > 0))}

          ${renderSection("5. Atendimentos por Período", `
            <p>Distribuição temporal dos atendimentos realizados no período.</p>
            <table>
              <thead>
                <tr><th>Data</th><th>Agendamentos</th><th>Concluídos</th><th>Faltas</th></tr>
              </thead>
              <tbody>
                ${timelineData.map(t => `
                  <tr>
                    <td>${formatDateBR(t.data)}</td>
                    <td>${t.agendamentos}</td>
                    <td>${t.concluidos}</td>
                    <td>${t.faltas}</td>
                  </tr>
                `).join('')}
              </tbody>
            </table>
          `, timelineData.length > 0)}

          ${renderSection("6. Horários de Pico", `
            <p>Análise de fluxo por faixa horária (07:00 às 18:00).</p>
            <table>
              <thead>
                <tr><th>Horário</th><th>Volume de Atendimentos</th></tr>
              </thead>
              <tbody>
                ${peakHoursData.map(h => `
                  <tr><td>${h.hora}</td><td>${h.total}</td></tr>
                `).join('')}
              </tbody>
            </table>
          `, peakHoursData.some(h => h.total > 0))}

          ${renderSection("7. Novos vs Retorno", `
            <div class="summary">
              ${novosVsRetorno.map(d => `
                <div class="stat"><strong>${d.value}</strong><small>${d.name}</small></div>
              `).join('')}
            </div>
          `, novosVsRetorno.length > 0)}

          ${renderSection("8. Produtividade por Profissional", `
            <table>
              <thead>
                <tr>
                  <th>Profissional</th>
                  <th>Pacientes</th>
                  <th>Total</th>
                  <th>Concluídos</th>
                  <th>Faltas</th>
                  <th>Taxa</th>
                </tr>
              </thead>
              <tbody>
                ${porProfissional.slice(0, 40).map(p => `
                  <tr>
                    <td>${p.nome}</td>
                    <td>${p.pacientesAtendidos}</td>
                    <td>${p.total}</td>
                    <td>${p.concluidos}</td>
                    <td>${p.faltas}</td>
                    <td>${p.taxaConclusao}%</td>
                  </tr>
                `).join('')}
              </tbody>
            </table>
          `, porProfissional.length > 0)}

          ${renderSection("9. Procedimentos Realizados", `
            <table>
              <thead>
                <tr><th>Procedimento</th><th>Quantidade</th></tr>
              </thead>
              <tbody>
                ${procedimentoStats.byProcedure.slice(0, 20).map(p => `
                  <tr><td>${p.nome}</td><td>${p.total}</td></tr>
                `).join('')}
              </tbody>
            </table>
          `, procedimentoStats.total > 0)}

          ${renderSection("10. Análise de Absenteísmo (Faltas)", `
            <p>Pacientes com maior recorrência de faltas no período.</p>
            <table>
              <thead>
                <tr><th>Paciente</th><th>Telefone</th><th>Profissional</th><th>Total Faltas</th></tr>
              </thead>
              <tbody>
                ${faltasReport.slice(0, 15).map(f => `
                  <tr><td>${f.nome}</td><td>${f.telefone}</td><td>${f.profissional}</td><td>${f.total}</td></tr>
                `).join('')}
              </tbody>
            </table>
          `, faltasReport.length > 0)}

          ${renderSection("11. Fila de Espera", `
            <div class="summary">
              <div class="stat"><strong>${filaReport.aguardando}</strong><small>Aguardando</small></div>
              <div class="stat"><strong>${filaReport.chamados}</strong><small>Chamados/Atendidos</small></div>
              <div class="stat"><strong>${filaReport.desistencias}</strong><small>Desistências</small></div>
            </div>
          `, filaReport.total > 0)}

          ${renderSection("12. Triagem e Acolhimento", `
            <p>Produtividade da equipe de triagem.</p>
            <table>
              <thead>
                <tr><th>Técnico</th><th>Total</th><th>Confirmadas</th><th>Pendentes</th></tr>
              </thead>
              <tbody>
                ${triagemReport.porTecnico.map(t => `
                  <tr><td>${t.nome}</td><td>${t.total}</td><td>${t.confirmadas}</td><td>${t.pendentes}</td></tr>
                `).join('')}
              </tbody>
            </table>
          `, triagemReport.total > 0)}

          ${renderSection("13. Avaliações de Enfermagem", `
            <div class="summary">
              <div class="stat"><strong>${nursingReport.total}</strong><small>Total</small></div>
              <div class="stat"><strong>${nursingReport.aptos}</strong><small>Aptos</small></div>
              <div class="stat"><strong>${nursingReport.inaptos}</strong><small>Inaptos</small></div>
            </div>
          `, nursingReport.total > 0)}

          ${renderSection("14. Avaliações Multiprofissionais", `
            <table>
              <thead>
                <tr><th>Especialidade</th><th>Quantidade</th></tr>
              </thead>
              <tbody>
                ${multiReport.bySpecialty.map(s => `<tr><td>${s.nome}</td><td>${s.total}</td></tr>`).join('')}
              </tbody>
            </table>
          `, multiReport.total > 0)}

          ${renderSection("15. Projetos Terapêuticos Singulares (PTS)", `
            <div class="summary">
              <div class="stat"><strong>${ptsReport.total}</strong><small>Total PTS</small></div>
              <div class="stat"><strong>${ptsReport.ativos}</strong><small>Ativos</small></div>
              <div class="stat"><strong>${ptsReport.concluidos}</strong><small>Concluídos/Inativos</small></div>
            </div>
          `, ptsReport.total > 0)}

          ${renderSection("16. Gestão de Tratamentos", `
            <p>Monitoramento de ciclos de reabilitação e sintonização de sessões.</p>
            <div class="summary">
              <div class="stat"><strong>${treatmentStats.ativos}</strong><small>Ciclos Ativos</small></div>
              <div class="stat"><strong>${treatmentStats.sessRealizadas}</strong><small>Sessões Realizadas</small></div>
              <div class="stat"><strong>${treatmentStats.taxaAbandono}%</strong><small>Taxa de Abandono</small></div>
            </div>
          `, treatmentStats.total > 0)}

          ${renderSection("17. Análise Clínica e Diagnóstica", `
            <p>Distribuição dos 10 principais diagnósticos (CID-10) identificados.</p>
            <table>
              <thead>
                <tr><th>CID-10</th><th>Descrição</th><th>Frequência</th></tr>
              </thead>
              <tbody>
                ${clinicalReport.topCids.map(c => `
                  <tr><td>${c.cid}</td><td>${c.descricao}</td><td>${c.count}</td></tr>
                `).join('')}
              </tbody>
            </table>
            <p>Distribuição por Categorias Clínicas:</p>
            <table>
              <thead>
                <tr><th>Categoria</th><th>Pacientes</th><th>Atendimentos</th></tr>
              </thead>
              <tbody>
                ${clinicalReport.byCategory.filter(c => c.pacientes > 0).slice(0, 10).map(c => `
                  <tr><td>${c.name}</td><td>${c.pacientes}</td><td>${c.atendimentos}</td></tr>
                `).join('')}
              </tbody>
            </table>
          `, clinicalReport.patients.length > 0)}

          ${renderSection("18. Análise Geográfica (Naturalidade)", `
            <p>Distribuição de pacientes e atendimentos por município de origem.</p>
            <table>
              <thead>
                <tr><th>Município</th><th>Pacientes</th><th>Atendimentos</th><th>Comparecimento</th></tr>
              </thead>
              <tbody>
                ${municipioReport.slice(0, 20).map(m => `
                  <tr>
                    <td>${m.municipio}</td>
                    <td>${m.pacientesCount}</td>
                    <td>${m.atendimentos}</td>
                    <td>${m.taxaComparecimento}%</td>
                  </tr>
                `).join('')}
              </tbody>
            </table>
          `, municipioReport.length > 0)}

          ${renderSection("19. Mapa de Atendimento", `
            <p>Resumo do mapa de atendimentos concluídos para o período.</p>
            <div class="summary">
              <div class="stat"><strong>${mapaData.length}</strong><small>Atendimentos Mapeados</small></div>
            </div>
            ${mapaData.length > 0 ? `
              <table>
                <thead>
                  <tr><th>Nº</th><th>Paciente</th><th>Profissional</th><th>Procedimento</th></tr>
                </thead>
                <tbody>
                  ${mapaData.slice(0, 15).map(m => `
                    <tr><td>${m.num}</td><td>${m.paciente_nome}</td><td>${m.profissional_nome}</td><td>${m.procedimento_sigtap}</td></tr>
                  `).join('')}
                </tbody>
              </table>
              <p><small>* Exibindo os 15 primeiros registros. Para o mapa completo, utilize a exportação específica na aba Mapa.</small></p>
            ` : ''}
          `, mapaData.length > 0)}

          ${renderSection("20. Relatório Detalhado de Agendamentos", `
            <p>Relação dos agendamentos registrados no período (exibindo os 30 mais recentes).</p>
            <table>
              <thead>
                <tr><th>Data</th><th>Hora</th><th>Paciente</th><th>Status</th></tr>
              </thead>
              <tbody>
                ${filtered.slice(0, 30).map(a => `
                  <tr>
                    <td>${formatDateBR(a.data)}</td>
                    <td>${a.hora}</td>
                    <td>${a.pacienteNome}</td>
                    <td>${statusLabels[a.status] || a.status}</td>
                  </tr>
                `).join('')}
              </tbody>
            </table>
          `, filtered.length > 0)}

          ${renderSection("21. Considerações Finais", `
            <p>O presente relatório consolida as atividades assistenciais e administrativas realizadas no período. Observa-se um volume operacional ${stats.concluidos > 500 ? 'elevado' : 'estável'}, com destaque para a atuação da equipe multiprofissional. Recomenda-se a análise contínua dos indicadores de absenteísmo e o fortalecimento das estratégias de acolhimento e triagem para otimizar o fluxo de atendimento.</p>
          `)}

          <div style="margin-top: 60px;">
            ${docCarimbo(carimbo, { nome: user?.nome || '', especialidade: user?.cargo || user?.profissao || '' })}
          </div>
        </div>
      `;

      if (format === 'pdf') {
        const fullHtml = buildDocumentShell("Relatório Institucional Completo", bodyHtml, config, {
          "Unidade": un,
          "Profissional": profFilter,
          "Período": periodo,
          "Tipo": "Relatório ABNT"
        });
        printViaIframe(fullHtml);
        toast.success("Relatório gerado", { description: "O documento foi preparado para impressão/PDF." });
      } else {
        // DOCX institucional completo (espelha as seções do PDF)
        const H1 = (t: string) => new Paragraph({ text: t, heading: HeadingLevel.HEADING_1, spacing: { before: 240, after: 120 } });
        const P = (t: string) => new Paragraph({ children: [new TextRun(t || '-')], alignment: AlignmentType.JUSTIFIED, spacing: { after: 120 } });
        const cellBorder = { style: BorderStyle.SINGLE, size: 4, color: 'BFBFBF' };
        const cellBorders = { top: cellBorder, bottom: cellBorder, left: cellBorder, right: cellBorder };
        const mkCell = (text: string, opts: { bold?: boolean; bg?: string } = {}) =>
          new TableCell({
            borders: cellBorders,
            shading: opts.bg ? { fill: opts.bg, type: 'clear' as any, color: 'auto' } : undefined,
            margins: { top: 60, bottom: 60, left: 80, right: 80 },
            children: [new Paragraph({ children: [new TextRun({ text: String(text ?? '-'), bold: !!opts.bold, size: 18 })] })],
          });
        const mkTable = (headers: string[], rows: (string | number)[][]) => {
          const colCount = headers.length;
          const colW = Math.floor(9000 / colCount);
          return new Table({
            width: { size: 9000, type: WidthType.DXA },
            columnWidths: Array(colCount).fill(colW),
            rows: [
              new TableRow({ children: headers.map(h => mkCell(h, { bold: true, bg: 'E8EEF4' })) }),
              ...rows.slice(0, 60).map(r => new TableRow({ children: r.map(c => mkCell(String(c ?? '-'))) })),
            ],
          });
        };

        const indicadoresRows: (string | number)[][] = [
          ['Total de Agendamentos', (stats as any).total ?? (stats as any).totalAgendamentos ?? 0],
          ['Concluídos', stats.concluidos],
          ['Faltas', stats.faltas],
          ['Cancelados', stats.cancelados],
          ['Remarcados', stats.remarcados],
          ['Retornos', stats.retornos],
          ['Taxa de Comparecimento', `${stats.taxaComparecimento}%`],
          ['Taxa de Falta', `${stats.taxaFalta}%`],
          ['Tempo Médio', `${tempoStats.tempoMedio} min`],
          ['Tempo Mínimo', `${tempoStats.tempoMinimo} min`],
          ['Tempo Máximo', `${tempoStats.tempoMaximo} min`],
          ['Total de Minutos', `${tempoStats.totalMinutos} min`],
        ];

        const PageBreakP = () => new Paragraph({ children: [new TextRun({ text: '', break: 1 })], pageBreakBefore: true });
        const Center = (text: string, opts: { bold?: boolean; size?: number; upper?: boolean; spacing?: number } = {}) =>
          new Paragraph({
            alignment: AlignmentType.CENTER,
            spacing: { after: opts.spacing ?? 120, line: 360 },
            children: [new TextRun({ text: opts.upper ? text.toUpperCase() : text, bold: opts.bold, size: opts.size ?? 24, font: 'Arial' })],
          });
        const Spacer = (n: number = 1) => Array.from({ length: n }, () => new Paragraph({ children: [new TextRun('')], spacing: { line: 360 } }));

        const sections: any[] = [
          // ===== CAPA ABNT =====
          ...Spacer(1),
          Center('PREFEITURA MUNICIPAL DE ORIXIMINÁ – PA', { bold: true, size: 28, upper: true }),
          Center('SECRETARIA MUNICIPAL DE SAÚDE', { bold: true, size: 26, upper: true }),
          Center('CENTRO ESPECIALIZADO EM REABILITAÇÃO – CER II', { bold: true, size: 24, upper: true, spacing: 400 }),
          ...Spacer(6),
          Center('RELATÓRIO GERENCIAL DE ATENDIMENTOS', { bold: true, size: 36, upper: true, spacing: 400 }),
          ...Spacer(2),
          Center(`Unidade: ${un}`, { size: 26 }),
          Center(`Período de referência: ${periodo}`, { size: 26 }),
          Center(`Filtro de profissional: ${profFilter}`, { size: 24, spacing: 400 }),
          ...Spacer(8),
          Center('Oriximiná – Pará', { bold: true, size: 24 }),
          Center(anoMes, { bold: true, size: 24 }),
          PageBreakP(),

          // ===== FOLHA DE ROSTO =====
          Center(responsavelNome, { bold: true, size: 24, upper: true, spacing: 400 }),
          ...Spacer(10),
          Center('RELATÓRIO GERENCIAL DE ATENDIMENTOS', { bold: true, size: 30, upper: true, spacing: 300 }),
          ...Spacer(2),
          new Paragraph({
            alignment: AlignmentType.JUSTIFIED,
            indent: { left: 4500 },
            spacing: { line: 360, after: 200 },
            children: [new TextRun({
              text: `Documento institucional emitido pelo Centro Especializado em Reabilitação – CER II da Secretaria Municipal de Saúde de Oriximiná/PA, contendo a consolidação dos atendimentos, indicadores de produtividade, fluxo de pacientes e análise clínica referentes ao período de ${periodo}.`,
              size: 22, font: 'Arial',
            })],
          }),
          ...Spacer(8),
          Center(`Responsável Técnico: ${responsavelNome}${responsavelCargo ? ' – ' + responsavelCargo : ''}`, { size: 22 }),
          ...Spacer(4),
          Center('Oriximiná – Pará', { bold: true, size: 24 }),
          Center(anoMes, { bold: true, size: 24 }),
          PageBreakP(),

          // ===== SUMÁRIO =====
          Center('SUMÁRIO', { bold: true, size: 28, upper: true, spacing: 300 }),
          ...['1. Introdução','2. Metodologia','3. Indicadores Gerais','4. Produtividade por Profissional','5. Relatório por Município','6. Fila de Espera','7. Triagem','8. Análise Clínica','9. Tratamentos','10. Conclusão','11. Recomendações'].map(t =>
            new Paragraph({
              spacing: { line: 360, after: 80 },
              tabStops: [{ type: 'right' as any, position: 9000, leader: 'dot' as any }],
              children: [
                new TextRun({ text: t, size: 22, font: 'Arial' }),
                new TextRun({ text: '\t', size: 22, font: 'Arial' }),
              ],
            })
          ),
          PageBreakP(),

          // ===== CONTEÚDO =====
          H1('1. Introdução'), P(intro),
          H1('2. Metodologia'), P(metodologia),

          H1('3. Indicadores Gerais'),
          mkTable(['Indicador', 'Valor'], indicadoresRows),

          H1('4. Produtividade por Profissional'),
          mkTable(
            ['Profissional', 'Unidade', 'Pacientes', 'Total', 'Concluídos', 'Faltas', 'Tempo Médio', 'Taxa'],
            porProfissional.map((p: any) => [p.nome, p.unidade, p.pacientesAtendidos, p.total, p.concluidos, p.faltas, p.tempoMedio ? `${p.tempoMedio}min` : '-', `${p.taxaConclusao}%`])
          ),

          H1('5. Relatório por Município'),
          mkTable(
            ['Município', 'Pacientes', 'Atendimentos', 'Concluídos', 'Faltas', 'Comparecim.'],
            municipioReport.map((m: any) => [m.municipio, m.pacientesCount, m.atendimentos, m.concluidos, m.faltas, `${m.taxaComparecimento}%`])
          ),

          H1('6. Fila de Espera'),
          mkTable(
            ['Posição', 'Paciente', 'Setor', 'Prioridade', 'Status', 'Chegada'],
            (filaReport?.items || []).map((f: any) => [f.posicao, f.paciente_nome, f.setor, f.prioridade, f.status, f.hora_chegada])
          ),

          H1('7. Triagem'),
          mkTable(
            ['Indicador', 'Valor'],
            [
              ['Total de Triagens', (triagemReport as any)?.total ?? 0],
              ['Aguardando', (triagemReport as any)?.aguardando ?? 0],
              ['Concluídas', (triagemReport as any)?.concluidas ?? 0],
            ]
          ),

          H1('8. Análise Clínica'),
          mkTable(
            ['CID', 'Descrição', 'Quantidade'],
            ((clinicalReport as any)?.topCids || (clinicalReport as any)?.cids || []).slice(0, 20).map((c: any) => [c.codigo || c.cid || '-', c.descricao || '-', c.quantidade ?? c.total ?? 0])
          ),

          H1('9. Tratamentos'),
          mkTable(
            ['Indicador', 'Valor'],
            [
              ['Ciclos Ativos', (treatmentStats as any)?.ciclosAtivos ?? (treatmentStats as any)?.ativos ?? 0],
              ['Sessões Totais', (treatmentStats as any)?.sessoesTotais ?? (treatmentStats as any)?.total ?? 0],
              ['Sessões Concluídas', (treatmentStats as any)?.sessoesConcluidas ?? (treatmentStats as any)?.concluidas ?? 0],
            ]
          ),

          H1('10. Conclusão'), P(analiseExecutiva),

          H1('11. Recomendações'),
          P('• Reforçar confirmação por WhatsApp para reduzir faltas.'),
          P('• Revisar filas críticas e ampliar equipe nas especialidades com maior demanda.'),
          P('• Monitorar continuamente os indicadores de absenteísmo e tempo médio de atendimento.'),

          new Paragraph({ text: '', spacing: { after: 600 } }),
          new Paragraph({ text: '_______________________________________', alignment: AlignmentType.CENTER }),
          new Paragraph({ text: responsavelNome, alignment: AlignmentType.CENTER }),
          responsavelCargo ? new Paragraph({ text: responsavelCargo, alignment: AlignmentType.CENTER }) : new Paragraph({ text: '' }),
        ];

        const doc = new Document({
          styles: {
            default: {
              document: { run: { font: 'Arial', size: 24 }, paragraph: { spacing: { line: 360 } } },
            },
            paragraphStyles: [
              { id: 'Heading1', name: 'Heading 1', basedOn: 'Normal', next: 'Normal', quickFormat: true,
                run: { size: 28, bold: true, font: 'Arial' },
                paragraph: { spacing: { before: 240, after: 120, line: 360 }, outlineLevel: 0 } },
            ],
          },
          sections: [{
            properties: { page: { margin: { top: 1701, right: 1134, bottom: 1134, left: 1701 } } },
            children: sections,
          }],
        });


        const buffer = await Packer.toBlob(doc);
        saveAs(buffer, `Relatorio_Completo_${new Date().toISOString().split('T')[0]}.docx`);
        toast.success('Documento Word gerado', { description: 'O download foi iniciado.' });
      }
    } catch (err) {
      console.error("[exportCompleteReport] erro:", err);
      toast.error("Erro ao gerar relatório", { description: "Não foi possível consolidar os dados." });
    } finally {
      toast.dismiss(loadingId);
    }
  }, [stats, clinicalReport, categoriaCards, timelineData, peakHoursData, novosVsRetorno, porProfissional, procedimentoStats, faltasReport, filaReport, triagemReport, nursingReport, multiReport, ptsReport, treatmentStats, municipioReport, mapaData, consolidatedData, user, filterUnit, filterProf, dateFrom, dateTo, unidades, profissionais]);


  return (
    <div className="space-y-5 animate-fade-in">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold font-display flex items-center gap-2" style={{ color: '#1B3A5C' }}>
            <BarChart3 className="w-6 h-6" style={{ color: '#2E8B8B' }} /> Relatórios
          </h1>
          <p className="text-sm mt-0.5" style={{ color: '#6B7280' }}>
            {stats.total} agendamentos · {stats.concluidos} atendimentos realizados
          </p>
        </div>
        <div className="flex gap-2 flex-wrap items-center">
          <ActionButton
            variant="default"
            size="sm"
            className="bg-primary hover:bg-primary/90 shadow-sm"
            onClick={() => exportCompleteReport('pdf')}
            loadingText="Gerando..."
          >
            <BookOpen className="w-4 h-4 mr-2" />
            Relatório Completo ABNT
          </ActionButton>

          <div className="h-8 w-px bg-border mx-1 hidden sm:block" />

          <span className="text-xs flex items-center gap-1 mr-2" style={{ color: '#6B7280' }}>
            <RefreshCw className="w-3 h-3" /> Última atualização: {lastUpdatedLabel}
          </span>
          <Button variant="outline" size="sm" className="hover:bg-accent/50" onClick={handleRefresh}>
            <RefreshCw className="w-4 h-4 mr-1" />{isFetching ? 'Buscando...' : 'Atualizar Dados'}
          </Button>
          <Button variant="outline" size="sm" className="hover:bg-accent/50" onClick={() => exportCSV(activeTab === 'geral' ? 'agendamentos' : activeTab)}>
            <Download className="w-4 h-4 mr-1" />CSV
          </Button>
          <ActionButton variant="outline" size="sm" className="hover:bg-accent/50" onClick={() => activeTab === 'mapa' ? exportMapaPDF() : downloadPDF(activeTab)} loadingText="Gerando PDF...">
            <FileText className="w-4 h-4 mr-1" />PDF
          </ActionButton>
          <Button variant="outline" size="sm" className="hover:bg-accent/50" onClick={() => exportExcel(activeTab === 'geral' ? 'agendamentos' : activeTab)}>
            <Download className="w-4 h-4 mr-1" />Excel
          </Button>
          <ActionButton variant="outline" size="sm" className="hover:bg-accent/50" onClick={() => exportPDF(activeTab)} loadingText="Preparando impressão...">
            <Printer className="w-4 h-4 mr-1" />Imprimir
          </ActionButton>
        </div>
      </div>

      {/* Filters */}
      <div className="rounded-xl border p-4" style={{ borderColor: '#DDE3ED', background: '#FFFFFF', boxShadow: '0 1px 4px rgba(0,0,0,0.05)' }}>
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2"><Filter className="w-4 h-4" style={{ color: '#6B7280' }} /><span className="font-semibold text-sm" style={{ color: '#1B3A5C' }}>Filtros</span></div>
          <Button variant="ghost" size="sm" onClick={clearFilters} className="text-xs" style={{ color: '#6B7280' }}>Limpar filtros</Button>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-3">
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
                {Object.entries(statusLabels).map(([k, v]) => <SelectItem key={k as any} value={k as any}>{v as any}</SelectItem>)}
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
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-3 sm:grid-cols-5 lg:grid-cols-10 gap-2">
        {[
          { label: 'Total', value: stats.total, color: '#1B3A5C' },
          { label: 'Concluídos', value: stats.concluidos, color: '#2D7A4F' },
          { label: 'Pendentes', value: stats.pendentes, color: '#C17B1A' },
          { label: 'Faltas', value: stats.faltas, color: '#B83232' },
          { label: 'Cancelados', value: stats.cancelados, color: '#6B7280' },
          { label: 'Remarcados', value: stats.remarcados, color: '#C17B1A' },
          { label: 'Retornos', value: stats.retornos, color: '#1B3A5C' },
          { label: 'Tempo Médio', value: `${tempoStats.tempoMedio}m`, color: '#2E8B8B' },
          { label: 'Comparecim.', value: `${stats.taxaComparecimento}%`, color: '#2D7A4F' },
          { label: 'Taxa Falta', value: `${stats.taxaFalta}%`, color: '#B83232' },
        ].map(s => (
          <div
            key={s.label}
            className="rounded-xl border border-border/60 bg-card text-center px-2 py-3 shadow-sm"
          >
            <p className="text-lg font-bold font-display leading-none" style={{ color: s.color }}>{s.value}</p>
            <p className="text-[9px] uppercase tracking-wider mt-1 text-muted-foreground truncate">{s.label}</p>
          </div>
        ))}
      </div>

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="w-full justify-start overflow-x-auto flex-nowrap bg-transparent border-b rounded-none h-auto p-0 gap-0">
          {[
            { value: 'executivo', label: '⭐ Dashboard Executivo' },
            { value: 'geral', label: 'Geral' },
            { value: 'produtividade', label: 'Produtividade' },
            { value: 'procedimentos', label: 'Procedimentos' },
            { value: 'municipios', label: 'Municípios' },
            { value: 'faltas', label: 'Faltas' },
            { value: 'pacientes', label: 'Pacientes' },
            { value: 'fila', label: 'Fila de Espera' },
            { value: 'triagem', label: 'Triagem' },
            { value: 'enfermagem', label: 'Enfermagem' },
            { value: 'multiprofissional', label: 'Multiprofissional' },
            { value: 'pts_report', label: 'PTS' },
            { value: 'tratamentos', label: 'Tratamentos' },
            { value: 'detalhado', label: 'Detalhado' },
            { value: 'clinico', label: '🧬 Análise Clínica' },
            { value: 'mapa', label: '📍 Mapa Atendimento' },
          ].map(tab => (
            <button
              key={tab.value}
              onClick={() => setActiveTab(tab.value)}
              className="px-4 py-2.5 text-sm font-medium whitespace-nowrap transition-colors border-b-2 -mb-px"
              style={{
                color: activeTab === tab.value ? '#1B3A5C' : '#6B7280',
                borderBottomColor: activeTab === tab.value ? '#2E8B8B' : 'transparent',
                fontWeight: activeTab === tab.value ? 600 : 500,
              }}
            >
              {tab.label}
            </button>
          ))}
        </TabsList>

        {/* === DASHBOARD EXECUTIVO (Bloco 3) === */}
        <TabsContent value="executivo" className="space-y-5 mt-4">
          {(() => {
            const k = executiveKpis;
            const kpiCards: { label: string; value: string | number; suffix?: string; icon: any; color: string; bg: string; hint?: string }[] = [
              { label: 'Total de Atendimentos', value: k.total, icon: CalendarDays, color: '#1B3A5C', bg: '#EEF2F7', hint: `${k.mediaDiaria}/dia · ${k.dias} dia(s)` },
              { label: 'Pacientes Únicos', value: k.pacientesUnicos, icon: Users, color: '#0E7490', bg: '#ECFEFF' },
              { label: 'Taxa de Comparecimento', value: k.taxaComparecimento, suffix: '%', icon: UserCheck, color: '#0F766E', bg: '#ECFDF5' },
              { label: 'Taxa de Falta', value: k.taxaFalta, suffix: '%', icon: AlertTriangle, color: '#B45309', bg: '#FFFBEB' },
              { label: 'Taxa de Cancelamento', value: k.taxaCancelamento, suffix: '%', icon: AlertTriangle, color: '#9CA3AF', bg: '#F3F4F6' },
              { label: 'Taxa de Retorno', value: k.taxaRetorno, suffix: '%', icon: RefreshCw, color: '#3A6B9A', bg: '#EEF3F9' },
              { label: 'Tempo Médio (min)', value: k.tempoMedio, icon: Clock, color: '#7C3AED', bg: '#F5F3FF', hint: 'por atendimento concluído' },
              { label: 'Espera Média Fila (min)', value: k.tempoEsperaMedio, icon: Clock, color: '#DB2777', bg: '#FDF2F8', hint: 'chegada → chamada' },
              { label: 'Profissionais Ativos', value: k.profissionaisAtivos, icon: Stethoscope, color: '#1B3A5C', bg: '#EEF2F7' },
              { label: 'Unidades Ativas', value: k.unidadesAtivas, icon: MapPin, color: '#0E7490', bg: '#ECFEFF' },
              { label: 'Ciclos em Andamento', value: k.ciclosAtivos, icon: Activity, color: '#14B8A6', bg: '#F0FDFA', hint: `${k.taxaConclusaoCiclos}% concluídos` },
              { label: 'Taxa de Abandono Trat.', value: k.taxaAbandono, suffix: '%', icon: TrendingUp, color: '#DC2626', bg: '#FEF2F2' },
            ];
            return (
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
                {kpiCards.map(c => {
                  const Icon = c.icon;
                  return (
                    <Card key={c.label} className="border-0 shadow-[0_4px_12px_rgba(0,0,0,0.05)] rounded-2xl">
                      <CardContent className="p-4">
                        <div className="flex items-start justify-between mb-2">
                          <div className="w-9 h-9 rounded-xl flex items-center justify-center" style={{ background: c.bg }}>
                            <Icon className="w-5 h-5" style={{ color: c.color }} />
                          </div>
                        </div>
                        <p className="text-2xl font-bold text-foreground leading-none">{c.value}{c.suffix || ''}</p>
                        <p className="text-xs text-muted-foreground mt-1">{c.label}</p>
                        {c.hint && <p className="text-[10px] text-muted-foreground/80 mt-0.5">{c.hint}</p>}
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            );
          })()}

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
            <Card className="border-0 shadow-[0_4px_12px_rgba(0,0,0,0.05)] rounded-2xl lg:col-span-2">
              <CardContent className="p-5">
                <h3 className="font-semibold font-display text-foreground text-[16px] mb-4 flex items-center gap-2">
                  <TrendingUp className="w-5 h-5 text-primary" /> Evolução de Atendimentos
                </h3>
                {timelineGrouped.length > 0 ? (
                  <ResponsiveContainer width="100%" height={240}>
                    <LineChart data={timelineGrouped}>
                      <CartesianGrid vertical={false} stroke="#f1f5f9" />
                      <XAxis dataKey="label" tick={{ fontSize: 10 }} />
                      <YAxis tick={{ fontSize: 10 }} />
                      <Tooltip />
                      <Legend />
                      <Line type="monotone" dataKey="concluidos" name="Concluídos" stroke="#14b8a6" strokeWidth={2} dot={false} />
                      <Line type="monotone" dataKey="faltas" name="Faltas" stroke="#f97316" strokeWidth={2} dot={false} />
                      <Line type="monotone" dataKey="cancelados" name="Cancelados" stroke="#94a3b8" strokeWidth={2} dot={false} />
                    </LineChart>
                  </ResponsiveContainer>
                ) : (
                  <p className="text-center text-muted-foreground py-12">Sem dados no período</p>
                )}
              </CardContent>
            </Card>

            <Card className="border-0 shadow-[0_4px_12px_rgba(0,0,0,0.05)] rounded-2xl">
              <CardContent className="p-5">
                <h3 className="font-semibold font-display text-foreground text-[16px] mb-4 flex items-center gap-2">
                  <Activity className="w-5 h-5 text-primary" /> Distribuição por Status
                </h3>
                <ResponsiveContainer width="100%" height={240}>
                  <PieChart>
                    <Pie data={statusData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={90} label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`} labelLine={false}>
                      {statusData.map((entry, i) => <Cell key={`exec-status-${entry.name}`} fill={COLORS[i % COLORS.length]} />)}
                    </Pie>
                    <Tooltip />
                  </PieChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          </div>

          <Card className="border-0 shadow-[0_4px_12px_rgba(0,0,0,0.05)] rounded-2xl">
            <CardContent className="p-5">
              <h3 className="font-semibold font-display text-foreground text-[16px] mb-4 flex items-center gap-2">
                <Info className="w-5 h-5 text-primary" /> Resumo Operacional
              </h3>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                <div><p className="text-muted-foreground">Fila Aguardando</p><p className="text-xl font-semibold text-foreground">{executiveKpis.filaAguardando} <span className="text-xs text-muted-foreground">/ {executiveKpis.filaTotal}</span></p></div>
                <div><p className="text-muted-foreground">Triagens no Período</p><p className="text-xl font-semibold text-foreground">{executiveKpis.triagemTotal}</p><p className="text-[11px] text-muted-foreground">{executiveKpis.taxaConfirmacaoTriagem}% confirmadas</p></div>
                <div><p className="text-muted-foreground">Taxa de Ocupação</p><p className="text-xl font-semibold text-foreground">{executiveKpis.taxaOcupacao}%</p></div>
                <div><p className="text-muted-foreground">Em Atendimento Agora</p><p className="text-xl font-semibold text-foreground">{stats.emAtendimento}</p></div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* === GERAL === */}
        <TabsContent value="geral" className="space-y-5 mt-4">
          <ChartCard
            title="Atendimentos por Período"
            actions={
              <div className="flex gap-1">
                {(['dia', 'semana', 'mes'] as const).map(g => (
                  <Button key={g} size="sm" variant={timelineGroup === g ? 'default' : 'outline'} className={timelineGroup === g ? 'gradient-primary text-primary-foreground h-7 text-xs' : 'h-7 text-xs'} onClick={() => setTimelineGroup(g)}>
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

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
            <ChartCard title="Agendamentos por Profissional">
              <ResponsiveContainer width="100%" height={Math.max(200, porProfissional.length * 40)}>
                <BarChart data={porProfissional} layout="vertical">
                  <CartesianGrid vertical={false} stroke="#f1f5f9" />
                  <XAxis type="number" tick={{ fontSize: 10 }} />
                  <YAxis dataKey="nome" type="category" width={120} tick={{ fontSize: 11 }} />
                  <Tooltip />
                  <Bar dataKey="concluidos" name="Concluídos" stackId="a" fill="#14b8a6" />
                  <Bar dataKey="faltas" name="Faltas" stackId="a" fill="#f97316" />
                  <Bar dataKey="cancelados" name="Cancelados" stackId="a" fill="#94a3b8" />
                  <Legend />
                </BarChart>
              </ResponsiveContainer>
            </ChartCard>

            <ChartCard title="Distribuição por Status">
              <ResponsiveContainer width="100%" height={280}>
                <PieChart>
                  <Pie data={statusData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={100} label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`} labelLine={false}>
                    {statusData.map((entry, i) => <Cell key={`status-${entry.name}`} fill={COLORS[i % COLORS.length]} />)}
                  </Pie>
                  <Tooltip />
                </PieChart>
              </ResponsiveContainer>
            </ChartCard>

            {porUnidade.length > 1 && (
              <ChartCard title="Por Unidade">
                <ResponsiveContainer width="100%" height={220}>
                  <BarChart data={porUnidade}>
                    <CartesianGrid vertical={false} stroke="#f1f5f9" />
                    <XAxis dataKey="nome" tick={{ fontSize: 10 }} />
                    <YAxis tick={{ fontSize: 10 }} />
                    <Tooltip />
                    <Legend />
                    <Bar dataKey="concluidos" name="Concluídos" stackId="a" fill="#14b8a6" />
                    <Bar dataKey="faltas" name="Faltas" stackId="a" fill="#f97316" />
                    <Bar dataKey="cancelados" name="Cancelados" stackId="a" fill="#94a3b8" />
                  </BarChart>
                </ResponsiveContainer>
              </ChartCard>
            )}

            <Card className="group relative rounded-2xl border-0 shadow-[0_4px_12px_rgba(0,0,0,0.05)]">
              <CardContent className="p-5">
                <h3 className="font-semibold font-display text-foreground text-[16px] mb-4">Origem dos Agendamentos</h3>
                <div className="grid grid-cols-2 gap-4">
                  <div className="text-center p-4 bg-accent rounded-xl">
                    <p className="text-2xl font-bold text-foreground">{stats.online}</p>
                    <p className="text-sm text-muted-foreground">Online</p>
                    <p className="text-xs text-muted-foreground">{stats.total > 0 ? Math.round((stats.online / stats.total) * 100) : 0}%</p>
                  </div>
                  <div className="text-center p-4 bg-muted rounded-xl">
                    <p className="text-2xl font-bold text-foreground">{stats.recepcao}</p>
                    <p className="text-sm text-muted-foreground">Recepção</p>
                    <p className="text-xs text-muted-foreground">{stats.total > 0 ? Math.round((stats.recepcao / stats.total) * 100) : 0}%</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* === PRODUTIVIDADE === */}
        <TabsContent value="produtividade" className="space-y-5 mt-4">
          {/* Category cards */}
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 xl:grid-cols-5 gap-3">
            {categoriaCards.map(c => {
              const taxa = c.total > 0 ? Math.round((c.concluidos / c.total) * 100) : 0;
              const isActive = filterCargoProd === c.key;
              const catDef = categoriasMap.get(c.key);
              const IconComp = catDef?.icon || Stethoscope;
              const bgLight = catDef?.bgLight || '#F8FAFC';
              return (
                <div
                  key={c.key}
                  className="cursor-pointer rounded-xl border transition-all duration-200 hover:shadow-md hover:-translate-y-0.5"
                  style={{
                    borderColor: isActive ? c.cor : 'hsl(var(--border))',
                    borderLeftWidth: 4,
                    borderLeftColor: c.cor,
                    padding: '16px 18px',
                    background: isActive ? bgLight : 'hsl(var(--card))',
                    boxShadow: isActive ? `0 4px 16px ${c.cor}30` : '0 1px 4px rgba(0,0,0,0.05)',
                  }}
                  onClick={() => setFilterCargoProd(isActive ? 'all' : c.key)}
                >
                  <div className="flex items-center gap-2.5 mb-3">
                    <div className="w-9 h-9 rounded-full flex items-center justify-center" style={{ backgroundColor: `${c.cor}15` }}>
                      <IconComp className="w-[18px] h-[18px]" style={{ color: c.cor }} />
                    </div>
                    <span className="text-xs uppercase tracking-wider font-semibold font-display text-muted-foreground leading-tight">{c.label}</span>
                  </div>
                  <div className="flex items-baseline gap-4">
                    <div>
                      <p className="text-3xl font-bold font-display leading-none" style={{ color: 'hsl(var(--foreground))' }}>{c.total}</p>
                      <p className="text-[10px] text-muted-foreground mt-0.5">Total</p>
                    </div>
                    <div>
                      <p className="text-lg font-bold" style={{ color: '#2D7A4F' }}>{c.concluidos}</p>
                      <p className="text-[10px] text-muted-foreground mt-0.5">Concluídos</p>
                    </div>
                  </div>
                  <div className="mt-2.5">
                    <div className="w-full overflow-hidden rounded-full" style={{ height: 4, background: 'hsl(var(--muted))' }}>
                      <div style={{ height: '100%', width: `${taxa}%`, backgroundColor: c.cor, borderRadius: 9999, transition: 'width 0.3s' }} />
                    </div>
                    <p className="text-right mt-0.5 text-[11px] text-muted-foreground">{taxa}%</p>
                  </div>
                </div>
              );
            })}
          </div>

          <Card className="group rounded-2xl border-0 shadow-[0_4px_12px_rgba(0,0,0,0.05)]">
            <CardContent className="p-5">
              <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 mb-4">
                <h3 className="font-semibold font-display text-foreground flex items-center gap-2"><TrendingUp className="w-5 h-5 text-primary" /> Produtividade por Profissional</h3>
                <div className="flex items-center gap-2 flex-wrap">
                  <Select value={filterRoleProd} onValueChange={setFilterRoleProd}>
                    <SelectTrigger className="w-44 h-8 text-xs"><SelectValue placeholder="Filtrar perfil" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Todos os perfis</SelectItem>
                      <SelectItem value="profissional">Profissional</SelectItem>
                      <SelectItem value="coordenador">Coordenador</SelectItem>
                      <SelectItem value="master">Master</SelectItem>
                    </SelectContent>
                  </Select>
                  <Button
                    variant={prodViewMode === 'tabela' ? 'default' : 'outline'}
                    size="sm"
                    className="h-8 text-xs"
                    onClick={() => setProdViewMode(prodViewMode === 'tabela' ? 'grafico' : 'tabela')}
                  >
                    {prodViewMode === 'tabela' ? <><BarChart3 className="w-3 h-3 mr-1" />Ver gráfico</> : <><ListOrdered className="w-3 h-3 mr-1" />Ver tabela</>}
                  </Button>
                  <Button variant="ghost" size="sm" onClick={() => exportCSV('produtividade')}><Download className="w-3 h-3 mr-1" />CSV</Button>
                  <ActionButton variant="ghost" size="sm" loadingText="Gerando..." onClick={() => downloadPDF('produtividade')}><FileText className="w-3 h-3 mr-1" />PDF</ActionButton>
                  <ActionButton variant="ghost" size="sm" loadingText="Preparando..." onClick={() => {
                    if (porProfissional.length === 0) { toast.warning('Não há dados para exportar'); return; }
                    try {
                      const now = new Date().toLocaleString('pt-BR');
                      const periodo = `${dateFrom || 'Início'} a ${dateTo || 'Atual'}`;
                      const prodRows = porProfissional.map(p => {
                        const roleLabel = p.role === 'master' ? 'Master' : p.role === 'coordenador' ? 'Coordenador' : 'Profissional';
                        const taxaBadge = p.taxaConclusao >= 70 ? '🟢' : p.taxaConclusao >= 40 ? '🟡' : '🔴';
                        return `<tr><td>${p.nome}</td><td>${roleLabel}</td><td>${p.unidade}</td><td style="text-align:center">${p.total}</td><td style="text-align:center">${p.concluidos}</td><td style="text-align:center">${p.faltas}</td><td style="text-align:center">${p.cancelados}</td><td style="text-align:center">${p.remarcados}</td><td style="text-align:center">${p.retornos}</td><td style="text-align:center">${p.tempoMedio ? p.tempoMedio + 'min' : '-'}</td><td style="text-align:center">${taxaBadge} ${p.taxaConclusao}%</td><td style="text-align:center">${p.taxaRetorno}%</td></tr>`;
                      }).join('');
                      const totalRow = `<tr style="font-weight:700;background:#f1f5f9;"><td colspan="3">TOTAL</td><td style="text-align:center">${prodTotals.total}</td><td style="text-align:center">${prodTotals.concluidos}</td><td style="text-align:center">${prodTotals.faltas}</td><td style="text-align:center">${prodTotals.cancelados}</td><td style="text-align:center">${prodTotals.remarcados}</td><td style="text-align:center">${prodTotals.retornos}</td><td></td><td></td><td></td></tr>`;
                      const logoUrl = logoSmsFallback;
                      const logoUrlRight = logoCerFallback;
                      const html = `<!DOCTYPE html><html lang="pt-BR"><head><meta charset="UTF-8"><title>Relatório de Produtividade</title>
<style>@page{size:A4 landscape;margin:10mm;}*{margin:0;padding:0;box-sizing:border-box;}body{font-family:Arial,sans-serif;padding:16px;color:#1e293b;font-size:10px;}
.header{display:flex;align-items:center;gap:14px;padding:12px 16px;margin-bottom:12px;border-bottom:2px solid #0369a1;}
.header img{max-height:48px;max-width:90px;object-fit:contain;}
.header h1{font-size:13px;font-weight:700;}
.header .sub{font-size:10px;color:#555;margin-top:1px;}
.periodo{text-align:center;font-size:11px;margin-bottom:10px;font-weight:600;}
table{width:100%;border-collapse:collapse;margin-bottom:10px;}
th,td{border:1px solid #ccc;padding:4px 6px;text-align:left;font-size:9px;}
th{background:#f1f5f9;font-weight:600;}
@media print{body{padding:6px;}.no-print{display:none!important;}}</style></head><body>
<div class="header"><img src="${logoUrl}" alt="Logo SMS"/><div style="flex:1;text-align:center;"><h1>SECRETARIA MUNICIPAL DE SAÚDE DE ORIXIMINÁ</h1><div class="sub">CENTRO ESPECIALIZADO EM REABILITAÇÃO NÍVEL II</div><div style="font-weight:700;margin-top:4px;text-transform:uppercase;">Relatório de Produtividade por Profissional</div></div><img src="${logoUrlRight}" alt="Logo CER II"/><div style="margin-left:12px;font-size:8px;text-align:right;">Data: ${now}<br/>Período: ${periodo}</div></div>
<table><thead><tr><th>Profissional</th><th>Perfil</th><th>Unidade</th><th>Total</th><th>Concluídos</th><th>Faltas</th><th>Cancelados</th><th>Remarcados</th><th>Retornos</th><th>Tempo Médio</th><th>Taxa Conclusão</th><th>Taxa Retorno</th></tr></thead><tbody>${prodRows}${totalRow}</tbody></table>
</body></html>`;
                      printViaIframe(html);
                      toast.success('Documento pronto', { description: 'Use "Salvar como PDF" para baixar.' });
                    } catch (err) {
                      console.error(err);
                      toast.error('Não foi possível iniciar a impressão');
                    }
                  }}><Printer className="w-3 h-3 mr-1" />Imprimir</ActionButton>
                </div>
              </div>

              {prodViewMode === 'tabela' ? (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr style={{ background: '#F4F6FA' }}>
                        <th className="text-left py-3 px-4 uppercase tracking-wider font-semibold font-display" style={{ color: '#1B3A5C', fontSize: 13 }}>Profissional</th>
                        <th className="text-center py-3 px-2 uppercase tracking-wider font-semibold font-display" style={{ color: '#1B3A5C', fontSize: 13 }}>Total</th>
                        <th className="text-center py-3 px-2 uppercase tracking-wider font-semibold font-display" style={{ color: '#1B3A5C', fontSize: 13 }}>Concluídos</th>
                        <th className="text-center py-3 px-2 uppercase tracking-wider font-semibold font-display" style={{ color: '#1B3A5C', fontSize: 13 }}>Faltas</th>
                        <th className="text-center py-3 px-2 uppercase tracking-wider font-semibold font-display" style={{ color: '#1B3A5C', fontSize: 13 }}>Cancelados</th>
                        <th className="text-center py-3 px-2 uppercase tracking-wider font-semibold font-display" style={{ color: '#1B3A5C', fontSize: 13 }}>Remarcados</th>
                        <th className="text-center py-3 px-2 uppercase tracking-wider font-semibold font-display" style={{ color: '#1B3A5C', fontSize: 13 }}>Retornos</th>
                        <th className="text-center py-3 px-2 uppercase tracking-wider font-semibold font-display" style={{ color: '#1B3A5C', fontSize: 13 }}>Tempo Médio</th>
                        <th className="text-center py-3 px-2 uppercase tracking-wider font-semibold font-display" style={{ color: '#1B3A5C', fontSize: 13 }}>Taxa Conclusão</th>
                        <th className="text-center py-3 px-2 uppercase tracking-wider font-semibold font-display" style={{ color: '#1B3A5C', fontSize: 13 }}>Taxa Retorno</th>
                      </tr>
                    </thead>
                    <tbody>
                      {porProfissional.map((p, idx) => {
                        const catMatch = CATEGORIAS.find(cat => profissionalPertenceCategoria(p.profissao, cat));
                        const catBadge = catMatch
                          ? { label: catMatch.label, cor: catMatch.cor }
                          : { label: 'Outros', cor: '#888' };
                        const taxaConcStyle = p.taxaConclusao >= 70
                          ? { background: '#ECFDF5', color: '#2D7A4F' }
                          : p.taxaConclusao >= 40
                          ? { background: '#FFFBEB', color: '#C17B1A' }
                          : { background: '#FEF2F2', color: '#B83232' };
                        const taxaRetStyle = p.taxaRetorno > 30
                          ? { background: '#EEF2F7', color: '#1B3A5C' }
                          : {};
                        return (
                          <tr
                            key={p.id || p.nome}
                            className="border-b last:border-0 transition-colors"
                            style={{ background: idx % 2 === 1 ? '#FAFBFD' : '#FFFFFF' }}
                            onMouseEnter={e => (e.currentTarget.style.background = '#EEF2F7')}
                            onMouseLeave={e => (e.currentTarget.style.background = idx % 2 === 1 ? '#FAFBFD' : '#FFFFFF')}
                          >
                            <td className="py-3 px-4 font-medium" style={{ color: '#1B3A5C' }}>
                              <div className="flex items-center gap-2">
                                {p.nome}
                                <span className="text-[10px] px-1.5 py-0.5 rounded-full font-medium text-white" style={{ backgroundColor: catBadge.cor }}>{catBadge.label}</span>
                              </div>
                            </td>
                            <td className="py-3 px-2 text-center font-semibold" style={{ color: '#1B3A5C' }}>{p.total}</td>
                            <td className="py-3 px-2 text-center font-medium" style={{ color: '#2D7A4F' }}>{p.concluidos}</td>
                            <td className="py-3 px-2 text-center" style={{ color: '#B83232' }}>{p.faltas}</td>
                            <td className="py-3 px-2 text-center" style={{ color: '#6B7280' }}>{p.cancelados}</td>
                            <td className="py-3 px-2 text-center" style={{ color: '#C17B1A' }}>{p.remarcados}</td>
                            <td className="py-3 px-2 text-center" style={{ color: '#1B3A5C' }}>{p.retornos}</td>
                            <td className="py-3 px-2 text-center font-medium" style={{ color: '#2E8B8B' }}>{p.tempoMedio ? `${p.tempoMedio}min` : '-'}</td>
                            <td className="py-3 px-2 text-center">
                              <span className="text-xs px-2.5 py-1 rounded-full font-medium" style={{ ...taxaConcStyle, borderRadius: 20 }}>{p.taxaConclusao}%</span>
                            </td>
                            <td className="py-3 px-2 text-center">
                              <span className="text-xs px-2.5 py-1 rounded-full font-medium" style={{ ...taxaRetStyle, borderRadius: 20, color: taxaRetStyle.color || '#6B7280' }}>{p.taxaRetorno}%</span>
                            </td>
                          </tr>
                        );
                      })}
                      {porProfissional.length === 0 && <tr><td colSpan={10} className="text-center py-8" style={{ color: '#6B7280' }}>Nenhum dado encontrado para o período selecionado</td></tr>}
                    </tbody>
                    {porProfissional.length > 0 && (() => {
                      const taxaConcGeral = prodTotals.total > 0 ? Math.round((prodTotals.concluidos / prodTotals.total) * 100) : 0;
                      const taxaRetGeral = prodTotals.total > 0 ? Math.round((prodTotals.retornos / prodTotals.total) * 100) : 0;
                      const taxaConcGeralStyle = taxaConcGeral >= 70
                        ? { background: '#ECFDF5', color: '#2D7A4F' }
                        : taxaConcGeral >= 40
                        ? { background: '#FFFBEB', color: '#C17B1A' }
                        : { background: '#FEF2F2', color: '#B83232' };
                      return (
                        <tfoot>
                          <tr style={{ background: '#F4F6FA', borderTop: '2px solid #1B3A5C' }} className="font-bold">
                            <td className="py-3 px-4" style={{ color: '#1B3A5C' }}>TOTAL GERAL</td>
                            <td className="py-3 px-2 text-center" style={{ color: '#1B3A5C' }}>{prodTotals.total}</td>
                            <td className="py-3 px-2 text-center" style={{ color: '#2D7A4F' }}>{prodTotals.concluidos}</td>
                            <td className="py-3 px-2 text-center" style={{ color: '#B83232' }}>{prodTotals.faltas}</td>
                            <td className="py-3 px-2 text-center" style={{ color: '#6B7280' }}>{prodTotals.cancelados}</td>
                            <td className="py-3 px-2 text-center" style={{ color: '#C17B1A' }}>{prodTotals.remarcados}</td>
                            <td className="py-3 px-2 text-center" style={{ color: '#1B3A5C' }}>{prodTotals.retornos}</td>
                            <td className="py-3 px-2 text-center">-</td>
                            <td className="py-3 px-2 text-center">
                              <span className="text-xs px-2.5 py-1 rounded-full font-medium" style={{ ...taxaConcGeralStyle, borderRadius: 20 }}>{taxaConcGeral}%</span>
                            </td>
                            <td className="py-3 px-2 text-center">
                              <span className="text-xs px-2.5 py-1 rounded-full font-medium" style={{ color: '#6B7280', borderRadius: 20 }}>{taxaRetGeral}%</span>
                            </td>
                          </tr>
                        </tfoot>
                      );
                    })()}
                  </table>
                </div>
              ) : (
                <div>
                  {prodChartData.length > 0 ? (
                    <ResponsiveContainer width="100%" height={Math.max(300, prodChartData.length * 45)}>
                      <BarChart data={prodChartData} layout="vertical" margin={{ left: 10 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="hsl(214,20%,90%)" />
                        <XAxis type="number" tick={{ fontSize: 10 }} />
                        <YAxis dataKey="nome" type="category" width={140} tick={{ fontSize: 10 }} />
                        <Tooltip content={({ active, payload }) => {
                          if (!active || !payload?.length) return null;
                          const d = payload[0]?.payload;
                          return (
                            <div className="bg-background border border-border p-2 rounded shadow text-xs">
                              <p className="font-semibold mb-1">{d?.nomeCompleto}</p>
                              {payload.map((p: any) => (
                                <p key={p.name} style={{ color: p.color }}>{p.name}: {p.value}</p>
                              ))}
                            </div>
                          );
                        }} />
                        <Legend />
                        <Bar dataKey="concluidos" name="Concluídos" stackId="a" fill="hsl(152,60%,42%)" />
                        <Bar dataKey="faltas" name="Faltas" stackId="a" fill="hsl(0,72%,51%)" />
                        <Bar dataKey="cancelados" name="Cancelados" stackId="a" fill="hsl(200,18%,46%)" />
                        <Bar dataKey="remarcados" name="Remarcados" stackId="a" fill="hsl(45,93%,47%)" />
                      </BarChart>
                    </ResponsiveContainer>
                  ) : (
                    <p className="text-center text-muted-foreground py-12">Nenhum dado encontrado</p>
                  )}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Gráfico — Evolução Mensal */}
          <ChartCard title="Evolução Mensal">
            {evolucaoMensal.length > 0 ? (
              <ResponsiveContainer width="100%" height={300}>
                <AreaChart data={evolucaoMensal}>
                  <CartesianGrid vertical={false} stroke="#f1f5f9" />
                  <XAxis dataKey="mes" tick={{ fontSize: 10 }} />
                  <YAxis tick={{ fontSize: 10 }} />
                  <Tooltip />
                  <Area type="monotone" dataKey="total" name="Atendimentos" stroke="#3b82f6" fill="#3b82f6" fillOpacity={0.1} strokeWidth={2} dot={{ r: 3, fill: '#3b82f6' }} />
                </AreaChart>
              </ResponsiveContainer>
            ) : (
              <p className="text-center text-muted-foreground py-12">Nenhum dado encontrado</p>
            )}
          </ChartCard>

          {/* Ranking + Tendência */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
            <ChartCard title="Ranking de Produtividade (Top 5)">
              {rankingProdutividade.length > 0 ? (
                <ResponsiveContainer width="100%" height={280}>
                  <BarChart data={rankingProdutividade.slice(0, 5)} layout="vertical" margin={{ left: 10 }}>
                    <CartesianGrid vertical={false} stroke="#f1f5f9" />
                    <XAxis type="number" tick={{ fontSize: 10 }} />
                    <YAxis dataKey="nome" type="category" width={130} tick={{ fontSize: 11 }} />
                    <Tooltip />
                    <Bar dataKey="total" name="Concluídos" fill="#14b8a6" radius={[0, 6, 6, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <p className="text-center text-muted-foreground py-12">Nenhum dado encontrado</p>
              )}
            </ChartCard>

            <ChartCard title="Tendência de Concluídos (Últimos 6 meses)">
              {evolucaoMensal.length > 0 ? (
                <ResponsiveContainer width="100%" height={280}>
                  <LineChart data={evolucaoMensal.slice(-6)}>
                    <CartesianGrid vertical={false} stroke="#f1f5f9" />
                    <XAxis dataKey="mes" tick={{ fontSize: 10 }} />
                    <YAxis tick={{ fontSize: 10 }} />
                    <Tooltip />
                    <Line type="monotone" dataKey="total" name="Concluídos" stroke="#3b82f6" strokeWidth={2.5} dot={{ r: 4, fill: '#3b82f6', stroke: '#fff', strokeWidth: 2 }} />
                  </LineChart>
                </ResponsiveContainer>
              ) : (
                <p className="text-center text-muted-foreground py-12">Nenhum dado encontrado</p>
              )}
            </ChartCard>
          </div>
        </TabsContent>


        {/* === FALTAS === */}
        <TabsContent value="faltas" className="space-y-5 mt-4">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <Card className="shadow-card border-0"><CardContent className="p-4 text-center"><p className="text-2xl font-bold text-destructive">{stats.faltas}</p><p className="text-xs text-muted-foreground">Total de Faltas</p></CardContent></Card>
            <Card className="shadow-card border-0"><CardContent className="p-4 text-center"><p className="text-2xl font-bold text-foreground">{faltasReport.length}</p><p className="text-xs text-muted-foreground">Pacientes com Faltas</p></CardContent></Card>
            <Card className="shadow-card border-0"><CardContent className="p-4 text-center"><p className="text-2xl font-bold text-destructive">{stats.taxaFalta}%</p><p className="text-xs text-muted-foreground">Taxa de Faltas</p></CardContent></Card>
          </div>
          <Card className="shadow-card border-0">
            <CardContent className="p-5">
              <div className="flex items-center justify-between mb-4">
                <h3 className="font-semibold font-display text-foreground flex items-center gap-2"><AlertTriangle className="w-5 h-5 text-destructive" /> Faltas por Paciente</h3>
                <div className="flex gap-2">
                  <Button variant="ghost" size="sm" onClick={() => exportCSV('faltas')}><Download className="w-3 h-3 mr-1" />CSV</Button>
                  <ActionButton variant="ghost" size="sm" loadingText="Gerando..." onClick={() => downloadPDF('faltas')}><FileText className="w-3 h-3 mr-1" />PDF</ActionButton>
                </div>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b bg-muted/50">
                      <th className="text-left py-2.5 px-3 text-muted-foreground font-medium">Paciente</th>
                      <th className="text-left py-2.5 px-2 text-muted-foreground font-medium">E-mail</th>
                      <th className="text-left py-2.5 px-2 text-muted-foreground font-medium">Telefone</th>
                      <th className="text-left py-2.5 px-2 text-muted-foreground font-medium">Profissional</th>
                      <th className="text-left py-2.5 px-2 text-muted-foreground font-medium">Unidade</th>
                      <th className="text-center py-2.5 px-2 text-muted-foreground font-medium">Total</th>
                      <th className="text-left py-2.5 px-2 text-muted-foreground font-medium">Datas</th>
                    </tr>
                  </thead>
                  <tbody>
                    {faltasReport.map((f) => (
                      <tr key={`falta-${f.nome}-${f.profissional}`} className="border-b last:border-0 hover:bg-muted/30">
                        <td className="py-2.5 px-3 text-foreground font-medium">{f.nome}</td>
                        <td className="py-2.5 px-2 text-muted-foreground text-xs">{f.email || '-'}</td>
                        <td className="py-2.5 px-2 text-muted-foreground text-xs">{f.telefone || '-'}</td>
                        <td className="py-2.5 px-2 text-muted-foreground">{f.profissional}</td>
                        <td className="py-2.5 px-2 text-muted-foreground">{f.unidade}</td>
                        <td className="py-2.5 px-2 text-center"><Badge variant="destructive">{f.total}</Badge></td>
                        <td className="py-2.5 px-2 text-xs text-muted-foreground">{f.datas.join(', ')}</td>
                      </tr>
                    ))}
                    {faltasReport.length === 0 && <tr><td colSpan={7} className="text-center py-8 text-muted-foreground">Nenhuma falta registrada no período</td></tr>}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>

          {/* Gráfico 6 — Faltas por Unidade */}
          {faltasPorUnidade.length > 0 && (
            <Card className="shadow-card border-0">
              <CardContent className="p-5">
                <h3 className="font-semibold font-display text-foreground mb-4">Faltas por Unidade</h3>
                <ResponsiveContainer width="100%" height={300}>
                  <PieChart>
                    <Pie data={faltasPorUnidade} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={100} label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`} labelLine={true}>
                      {faltasPorUnidade.map((entry, i) => <Cell key={`unidade-${entry.name}`} fill={COLORS[i % COLORS.length]} />)}
                    </Pie>
                    <Tooltip formatter={(value: number) => [`${value} faltas`, 'Total']} />
                    <Legend />
                  </PieChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        {/* === PACIENTES === */}
        <TabsContent value="pacientes" className="space-y-5 mt-4">
          <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
            <Card className="shadow-card border-0"><CardContent className="p-4 text-center"><p className="text-2xl font-bold text-foreground">{pacientesReport.length}</p><p className="text-xs text-muted-foreground">Pacientes no Período</p></CardContent></Card>
            <Card className="shadow-card border-0"><CardContent className="p-4 text-center"><p className="text-2xl font-bold text-info">{stats.primeiraConsulta}</p><p className="text-xs text-muted-foreground">Primeira Consulta</p></CardContent></Card>
            <Card className="shadow-card border-0"><CardContent className="p-4 text-center"><p className="text-2xl font-bold text-secondary">{stats.retornos}</p><p className="text-xs text-muted-foreground">Retornos</p></CardContent></Card>
            <Card className="shadow-card border-0"><CardContent className="p-4 text-center"><p className="text-2xl font-bold text-foreground">{pacientesReport.length > 0 ? (filtered.length / pacientesReport.length).toFixed(1) : 0}</p><p className="text-xs text-muted-foreground">Agend./Paciente</p></CardContent></Card>
          </div>
          <Card className="shadow-card border-0">
            <CardContent className="p-5">
              <div className="flex items-center justify-between mb-4">
                <h3 className="font-semibold font-display text-foreground flex items-center gap-2"><Users className="w-5 h-5 text-primary" /> Pacientes</h3>
                <div className="flex gap-2">
                  <Button variant="ghost" size="sm" onClick={() => exportCSV('pacientes')}><Download className="w-3 h-3 mr-1" />CSV</Button>
                  <ActionButton variant="ghost" size="sm" loadingText="Gerando..." onClick={() => downloadPDF('pacientes')}><FileText className="w-3 h-3 mr-1" />PDF</ActionButton>
                </div>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b bg-muted/50">
                      <th className="text-left py-2.5 px-3 text-muted-foreground font-medium">Paciente</th>
                      <th className="text-left py-2.5 px-2 text-muted-foreground font-medium">E-mail</th>
                      <th className="text-left py-2.5 px-2 text-muted-foreground font-medium">Telefone</th>
                      <th className="text-center py-2.5 px-2 text-muted-foreground font-medium">Agendamentos</th>
                      <th className="text-center py-2.5 px-2 text-muted-foreground font-medium">Concluídos</th>
                      <th className="text-center py-2.5 px-2 text-muted-foreground font-medium">Faltas</th>
                      <th className="text-center py-2.5 px-2 text-muted-foreground font-medium">Retornos</th>
                      <th className="text-left py-2.5 px-2 text-muted-foreground font-medium">Última Consulta</th>
                    </tr>
                  </thead>
                  <tbody>
                    {pacientesReport.slice(0, 100).map(p => (
                      <tr key={p.id} className="border-b last:border-0 hover:bg-muted/30">
                        <td className="py-2.5 px-3 text-foreground font-medium">{p.nome}</td>
                        <td className="py-2.5 px-2 text-muted-foreground text-xs">{p.email || '-'}</td>
                        <td className="py-2.5 px-2 text-muted-foreground text-xs">{p.telefone || '-'}</td>
                        <td className="py-2.5 px-2 text-center font-semibold">{p.totalAgendamentos}</td>
                        <td className="py-2.5 px-2 text-center text-success">{p.concluidos}</td>
                        <td className="py-2.5 px-2 text-center text-destructive">{p.faltas}</td>
                        <td className="py-2.5 px-2 text-center text-info">{p.retornos}</td>
                        <td className="py-2.5 px-2 text-muted-foreground">{p.ultimaConsulta}</td>
                      </tr>
                    ))}
                    {pacientesReport.length === 0 && <tr><td colSpan={8} className="text-center py-8 text-muted-foreground">Nenhum paciente encontrado</td></tr>}
                  </tbody>
                </table>
                {pacientesReport.length > 100 && <p className="text-xs text-muted-foreground text-center mt-2">Mostrando 100 de {pacientesReport.length} — exporte para ver todos</p>}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* === FILA DE ESPERA === */}
        <TabsContent value="fila" className="space-y-5 mt-4">
          <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
            <Card className="shadow-card border-0"><CardContent className="p-4 text-center"><p className="text-2xl font-bold text-foreground">{filaReport.total}</p><p className="text-xs text-muted-foreground">Total na Fila</p></CardContent></Card>
            <Card className="shadow-card border-0"><CardContent className="p-4 text-center"><p className="text-2xl font-bold text-warning">{filaReport.aguardando}</p><p className="text-xs text-muted-foreground">Aguardando</p></CardContent></Card>
            <Card className="shadow-card border-0"><CardContent className="p-4 text-center"><p className="text-2xl font-bold text-success">{filaReport.chamados}</p><p className="text-xs text-muted-foreground">Chamados / Atendidos</p></CardContent></Card>
            <Card className="shadow-card border-0"><CardContent className="p-4 text-center"><p className="text-2xl font-bold text-destructive">{filaReport.desistencias}</p><p className="text-xs text-muted-foreground">Desistências</p></CardContent></Card>
          </div>
          <Card className="shadow-card border-0">
            <CardContent className="p-5">
              <h3 className="font-semibold font-display text-foreground flex items-center gap-2 mb-4"><ListOrdered className="w-5 h-5 text-primary" /> Registros da Fila</h3>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b bg-muted/50">
                      <th className="text-center py-2.5 px-2 text-muted-foreground font-medium">#</th>
                      <th className="text-left py-2.5 px-3 text-muted-foreground font-medium">Paciente</th>
                      <th className="text-left py-2.5 px-2 text-muted-foreground font-medium">Setor</th>
                      <th className="text-left py-2.5 px-2 text-muted-foreground font-medium">Prioridade</th>
                      <th className="text-left py-2.5 px-2 text-muted-foreground font-medium">Status</th>
                      <th className="text-left py-2.5 px-2 text-muted-foreground font-medium">Chegada</th>
                      <th className="text-left py-2.5 px-2 text-muted-foreground font-medium">Chamada</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filaReport.items.map(f => (
                      <tr key={f.id} className="border-b last:border-0 hover:bg-muted/30">
                        <td className="py-2.5 px-2 text-center text-muted-foreground">{f.posicao}</td>
                        <td className="py-2.5 px-3 text-foreground font-medium">{f.paciente_nome}</td>
                        <td className="py-2.5 px-2 text-muted-foreground">{f.setor || '-'}</td>
                        <td className="py-2.5 px-2">
                          <Badge variant={f.prioridade === 'urgente' ? 'destructive' : f.prioridade === 'alta' ? 'default' : 'secondary'} className="text-xs">{f.prioridade_perfil || f.prioridade}</Badge>
                        </td>
                        <td className="py-2.5 px-2">
                          <Badge variant={f.status === 'aguardando' ? 'outline' : f.status === 'atendido' ? 'default' : 'secondary'} className="text-xs">{f.status}</Badge>
                        </td>
                        <td className="py-2.5 px-2 text-muted-foreground text-xs">{f.hora_chegada}</td>
                        <td className="py-2.5 px-2 text-muted-foreground text-xs">{f.hora_chamada || '-'}</td>
                      </tr>
                    ))}
                    {filaReport.items.length === 0 && <tr><td colSpan={7} className="text-center py-8 text-muted-foreground">Nenhum registro na fila</td></tr>}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* === TRIAGEM === */}
        <TabsContent value="triagem" className="space-y-5 mt-4">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <Card className="shadow-card border-0">
              <CardContent className="p-3 text-center">
                <p className="text-2xl font-bold text-primary">{triagemReport.total}</p>
                <p className="text-xs text-muted-foreground">Total Triagens</p>
              </CardContent>
            </Card>
            <Card className="shadow-card border-0">
              <CardContent className="p-3 text-center">
                <p className="text-2xl font-bold text-success">{triagemReport.confirmadas}</p>
                <p className="text-xs text-muted-foreground">Confirmadas</p>
              </CardContent>
            </Card>
            <Card className="shadow-card border-0">
              <CardContent className="p-3 text-center">
                <p className="text-2xl font-bold text-warning">{triagemReport.pendentes}</p>
                <p className="text-xs text-muted-foreground">Pendentes/Rascunho</p>
              </CardContent>
            </Card>
            <Card className="shadow-card border-0">
              <CardContent className="p-3 text-center">
                <p className="text-2xl font-bold text-info">{tecnicos.length}</p>
                <p className="text-xs text-muted-foreground">Técnicos Ativos</p>
              </CardContent>
            </Card>
          </div>

          <Card className="shadow-card border-0">
            <CardContent className="p-5">
              <h3 className="font-semibold font-display text-foreground mb-4 flex items-center gap-2">
                <HeartPulse className="w-5 h-5 text-primary" /> Produtividade por Técnico de Enfermagem
              </h3>
              {triagemReport.porTecnico.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-6">Nenhum registro de triagem encontrado no período.</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b bg-muted/50">
                        <th className="text-left py-2.5 px-3 text-muted-foreground font-medium">Técnico(a)</th>
                        <th className="text-center py-2.5 px-2 text-muted-foreground font-medium">Total</th>
                        <th className="text-center py-2.5 px-2 text-muted-foreground font-medium">Confirmadas</th>
                        <th className="text-center py-2.5 px-2 text-muted-foreground font-medium">Pendentes</th>
                        <th className="text-center py-2.5 px-2 text-muted-foreground font-medium">Taxa Conclusão</th>
                      </tr>
                    </thead>
                    <tbody>
                      {triagemReport.porTecnico.map(t => (
                        <tr key={t.id} className="border-b last:border-0 hover:bg-muted/30">
                          <td className="py-2.5 px-3 font-medium text-foreground">{t.nome}</td>
                          <td className="text-center py-2.5 px-2 text-foreground font-semibold">{t.total}</td>
                          <td className="text-center py-2.5 px-2 text-success font-medium">{t.confirmadas}</td>
                          <td className="text-center py-2.5 px-2 text-warning font-medium">{t.pendentes}</td>
                          <td className="text-center py-2.5 px-2">
                            <Badge variant="outline" className="text-xs">
                              {t.total > 0 ? Math.round((t.confirmadas / t.total) * 100) : 0}%
                            </Badge>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>

          {triagemReport.porTecnico.length > 0 && (
            <Card className="shadow-card border-0">
              <CardContent className="p-5">
                <h3 className="font-semibold font-display text-foreground mb-4">Triagens por Técnico</h3>
                <ResponsiveContainer width="100%" height={250}>
                  <BarChart data={triagemReport.porTecnico}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(214,20%,90%)" />
                    <XAxis dataKey="nome" tick={{ fontSize: 10 }} />
                    <YAxis tick={{ fontSize: 10 }} />
                    <Tooltip />
                    <Legend />
                    <Bar dataKey="confirmadas" name="Confirmadas" fill="hsl(152,60%,42%)" />
                    <Bar dataKey="pendentes" name="Pendentes" fill="hsl(45,93%,47%)" />
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        {/* === DETALHADO === */}
        <TabsContent value="detalhado" className="space-y-5 mt-4">
          <Card className="shadow-card border-0">
            <CardContent className="p-5">
              <div className="flex items-center justify-between mb-4">
                <h3 className="font-semibold font-display text-foreground">Agendamentos Detalhados ({consolidatedData.length})</h3>
                <div className="flex gap-2">
                  <Button variant="ghost" size="sm" onClick={() => exportCSV('agendamentos')}><Download className="w-3 h-3 mr-1" />CSV</Button>
                  <ActionButton variant="ghost" size="sm" loadingText="Gerando..." onClick={() => downloadPDF('geral')}><FileText className="w-3 h-3 mr-1" />PDF</ActionButton>
                </div>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b bg-muted/50">
                      <th className="text-left py-2.5 px-2 text-muted-foreground font-medium">Data</th>
                      <th className="text-left py-2.5 px-2 text-muted-foreground font-medium">Hora</th>
                      <th className="text-left py-2.5 px-3 text-muted-foreground font-medium">Paciente</th>
                      <th className="text-left py-2.5 px-2 text-muted-foreground font-medium">Profissional</th>
                      <th className="text-left py-2.5 px-2 text-muted-foreground font-medium">Unidade</th>
                      <th className="text-left py-2.5 px-2 text-muted-foreground font-medium">Tipo</th>
                      <th className="text-left py-2.5 px-2 text-muted-foreground font-medium">Status</th>
                      <th className="text-left py-2.5 px-2 text-muted-foreground font-medium">Origem</th>
                      <th className="text-left py-2.5 px-2 text-muted-foreground font-medium">Início</th>
                      <th className="text-left py-2.5 px-2 text-muted-foreground font-medium">Fim</th>
                      <th className="text-center py-2.5 px-2 text-muted-foreground font-medium">Duração</th>
                    </tr>
                  </thead>
                  <tbody>
                    {consolidatedData.slice(0, 200).map(d => {
                      const un = unidadesMap.get(d.unidadeId);
                      return (
                        <tr key={d.id} className="border-b last:border-0 hover:bg-muted/30">
                          <td className="py-2 px-2 text-foreground">{d.data}</td>
                          <td className="py-2 px-2 text-foreground">{d.hora || '-'}</td>
                          <td className="py-2 px-3 text-foreground font-medium">{resolvePaciente(d.pacienteId, d.pacienteNome)}</td>
                          <td className="py-2 px-2 text-muted-foreground">{d.profissionalNome}</td>
                          <td className="py-2 px-2 text-muted-foreground text-xs">{un?.nome || ''}</td>
                          <td className="py-2 px-2"><Badge variant="outline" className="text-xs">{d.tipo}</Badge></td>
                          <td className="py-2 px-2"><Badge variant={d.status === 'concluido' || d.hasProntuario ? 'default' : d.status === 'falta' ? 'destructive' : 'secondary'} className="text-xs">{statusLabels[d.status] || d.status}</Badge></td>
                          <td className="py-2 px-2 text-xs text-muted-foreground">{d.origem}</td>
                          <td className="py-2 px-2 text-xs text-muted-foreground">-</td>
                          <td className="py-2 px-2 text-xs text-muted-foreground">-</td>
                          <td className="py-2 px-2 text-center text-primary font-medium">-</td>
                        </tr>
                      );
                    })}
                    {consolidatedData.length === 0 && <tr><td colSpan={11} className="text-center py-8 text-muted-foreground">Nenhum agendamento encontrado</td></tr>}
                  </tbody>
                </table>
                {consolidatedData.length > 200 && <p className="text-xs text-muted-foreground text-center mt-2">Mostrando 200 de {consolidatedData.length} — exporte para ver todos</p>}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* === PROCEDIMENTOS === */}
        <TabsContent value="procedimentos" className="space-y-5 mt-4">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <Card className="shadow-card border-0">
              <CardContent className="p-4 text-center">
                <p className="text-2xl font-bold text-primary">{procedimentoStats.total}</p>
                <p className="text-xs text-muted-foreground">Total de Procedimentos</p>
              </CardContent>
            </Card>
            <Card className="shadow-card border-0">
              <CardContent className="p-4 text-center">
                <p className="text-2xl font-bold text-success">{procedimentoStats.byProcedure.length}</p>
                <p className="text-xs text-muted-foreground">Tipos Diferentes</p>
              </CardContent>
            </Card>
            <Card className="shadow-card border-0">
              <CardContent className="p-4 text-center">
                <p className="text-2xl font-bold text-info">{procedimentoStats.byProfessional.length}</p>
                <p className="text-xs text-muted-foreground">Profissionais</p>
              </CardContent>
            </Card>
          </div>

          {/* Ranking by procedure */}
          <Card className="shadow-card border-0">
            <CardContent className="p-5">
              <h3 className="font-semibold font-display text-foreground mb-4">Procedimentos Mais Realizados</h3>
              {procedimentoStats.byProcedure.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-4">Nenhum procedimento registrado no período.</p>
              ) : (
                <ResponsiveContainer width="100%" height={Math.max(200, procedimentoStats.byProcedure.length * 35)}>
                  <BarChart data={procedimentoStats.byProcedure.slice(0, 15)} layout="vertical" margin={{ left: 120 }}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis type="number" />
                    <YAxis type="category" dataKey="nome" tick={{ fontSize: 11 }} width={110} />
                    <Tooltip />
                    <Bar dataKey="total" fill="hsl(var(--primary))" radius={[0, 4, 4, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </CardContent>
          </Card>

          {/* By professional */}
          <Card className="shadow-card border-0">
            <CardContent className="p-5">
              <h3 className="font-semibold font-display text-foreground mb-4">Procedimentos por Profissional</h3>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead><tr className="border-b">
                    <th className="text-left py-2 px-2 text-xs text-muted-foreground">Profissional</th>
                    <th className="text-center py-2 px-2 text-xs text-muted-foreground">Total</th>
                  </tr></thead>
                  <tbody>
                    {procedimentoStats.byProfessional.map(p => (
                      <tr key={p.nome} className="border-b border-border/50">
                        <td className="py-2 px-2">{p.nome}</td>
                        <td className="py-2 px-2 text-center font-semibold text-primary">{p.total}</td>
                      </tr>
                    ))}
                    {procedimentoStats.byProfessional.length === 0 && (
                      <tr><td colSpan={2} className="text-center py-4 text-muted-foreground">Sem dados</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>

          {/* By unit */}
          {procedimentoStats.byUnit.length > 0 && (
            <Card className="shadow-card border-0">
              <CardContent className="p-5">
                <h3 className="font-semibold font-display text-foreground mb-4">Procedimentos por Unidade</h3>
                <ResponsiveContainer width="100%" height={250}>
                  <PieChart>
                    <Pie data={procedimentoStats.byUnit} dataKey="total" nameKey="nome" cx="50%" cy="50%" outerRadius={90} label={({ nome, total }) => `${nome}: ${total}`}>
                      {procedimentoStats.byUnit.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                    </Pie>
                    <Tooltip />
                  </PieChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        {/* === MUNICÍPIOS === */}
        <TabsContent value="municipios" className="space-y-5 mt-4">
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
            <Card className="shadow-card border-0">
              <CardContent className="p-4 text-center">
                <p className="text-2xl font-bold text-[#1B3A5C]">{municipioStats.totalMunicipios}</p>
                <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">Total de Municípios</p>
              </CardContent>
            </Card>
            <Card className="shadow-card border-0">
              <CardContent className="p-4 text-center">
                <p className="text-lg font-bold text-[#2D7A4F] truncate" title={municipioStats.muniComMaisPacientes?.municipio}>
                  {municipioStats.muniComMaisPacientes?.municipio || '-'}
                </p>
                <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">Mais Pacientes</p>
                <p className="text-xs font-semibold">{municipioStats.muniComMaisPacientes?.pacientesCount || 0} pacientes</p>
              </CardContent>
            </Card>
            <Card className="shadow-card border-0">
              <CardContent className="p-4 text-center">
                <p className="text-lg font-bold text-[#1B3A5C] truncate" title={municipioStats.muniComMaisAtendimentos?.municipio}>
                  {municipioStats.muniComMaisAtendimentos?.municipio || '-'}
                </p>
                <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">Mais Atendimentos</p>
                <p className="text-xs font-semibold">{municipioStats.muniComMaisAtendimentos?.atendimentos || 0} atendimentos</p>
              </CardContent>
            </Card>
            <Card className="shadow-card border-0">
              <CardContent className="p-4 text-center">
                <p className="text-2xl font-bold text-[#2D7A4F]">{municipioStats.totalComNaturalidade}</p>
                <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">Com Naturalidade</p>
              </CardContent>
            </Card>
            <Card className="shadow-card border-0 border-l-4 border-l-[#B83232]">
              <CardContent className="p-4 text-center">
                <p className="text-2xl font-bold text-[#B83232]">{municipioStats.totalSemNaturalidade}</p>
                <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">Sem Naturalidade</p>
              </CardContent>
            </Card>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
            <Card className="shadow-card border-0">
              <CardContent className="p-5">
                <h3 className="font-semibold font-display text-[#1B3A5C] mb-4">Top 10 Municípios (Pacientes)</h3>
                <ResponsiveContainer width="100%" height={300}>
                  <BarChart data={municipioReport.slice(0, 10)} layout="vertical" margin={{ left: 80 }}>
                    <CartesianGrid strokeDasharray="3 3" horizontal={true} vertical={false} stroke="#EEF2F7" />
                    <XAxis type="number" hide />
                    <YAxis dataKey="municipio" type="category" width={75} tick={{ fontSize: 10, fill: '#6B7280' }} />
                    <Tooltip cursor={{ fill: '#F8FAFC' }} contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }} />
                    <Bar dataKey="pacientesCount" name="Pacientes" fill="#2E8B8B" radius={[0, 4, 4, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>

            <Card className="shadow-card border-0">
              <CardContent className="p-5">
                <h3 className="font-semibold font-display text-[#1B3A5C] mb-4">Top 10 Municípios (Atendimentos)</h3>
                <ResponsiveContainer width="100%" height={300}>
                  <BarChart data={[...municipioReport].sort((a, b) => b.atendimentos - a.atendimentos).slice(0, 10)} layout="vertical" margin={{ left: 80 }}>
                    <CartesianGrid strokeDasharray="3 3" horizontal={true} vertical={false} stroke="#EEF2F7" />
                    <XAxis type="number" hide />
                    <YAxis dataKey="municipio" type="category" width={75} tick={{ fontSize: 10, fill: '#6B7280' }} />
                    <Tooltip cursor={{ fill: '#F8FAFC' }} contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }} />
                    <Bar dataKey="atendimentos" name="Atendimentos" fill="#1B3A5C" radius={[0, 4, 4, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          </div>

          <Card className="shadow-card border-0">
            <CardContent className="p-0">
              <div className="p-5 flex items-center justify-between border-b">
                <h3 className="font-semibold font-display text-[#1B3A5C]">Relatório por Município</h3>
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" onClick={() => exportCSV('municipios')}><Download className="w-4 h-4 mr-1" />CSV</Button>
                  <Button variant="outline" size="sm" onClick={() => exportExcel('municipios')}><Download className="w-4 h-4 mr-1" />Excel</Button>
                </div>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-muted/50 border-b">
                    <tr>
                      <th className="text-left py-3 px-4 text-muted-foreground font-medium">Município</th>
                      <th className="text-center py-3 px-2 text-muted-foreground font-medium">Pacientes</th>
                      <th className="text-center py-3 px-2 text-muted-foreground font-medium">Atendimentos</th>
                      <th className="text-center py-3 px-2 text-muted-foreground font-medium">Concluídos</th>
                      <th className="text-center py-3 px-2 text-muted-foreground font-medium">Pendentes</th>
                      <th className="text-center py-3 px-2 text-muted-foreground font-medium">Faltas</th>
                      <th className="text-center py-3 px-2 text-muted-foreground font-medium">Cancelados</th>
                      <th className="text-center py-3 px-2 text-muted-foreground font-medium">Remarcados</th>
                      <th className="text-center py-3 px-2 text-muted-foreground font-medium">Retornos</th>
                      <th className="text-center py-3 px-2 text-muted-foreground font-medium">Comparecimento</th>
                      <th className="text-center py-3 px-2 text-muted-foreground font-medium">Taxa Falta</th>
                    </tr>
                  </thead>
                  <tbody>
                    {municipioReport.map((m, idx) => (
                      <tr key={idx} className="border-b last:border-0 hover:bg-muted/30 transition-colors">
                        <td className="py-3 px-4 font-medium text-foreground">{m.municipio}</td>
                        <td className="text-center py-3 px-2 font-semibold text-[#1B3A5C]">{m.pacientesCount}</td>
                        <td className="text-center py-3 px-2 text-[#1B3A5C]">{m.atendimentos}</td>
                        <td className="text-center py-3 px-2 text-[#2D7A4F]">{m.concluidos}</td>
                        <td className="text-center py-3 px-2 text-[#C17B1A]">{m.pendentes}</td>
                        <td className="text-center py-3 px-2 text-[#B83232] font-medium">{m.faltas}</td>
                        <td className="text-center py-3 px-2 text-muted-foreground">{m.cancelados}</td>
                        <td className="text-center py-3 px-2 text-[#C17B1A]">{m.remarcados}</td>
                        <td className="text-center py-3 px-2 font-medium">{m.retornos}</td>
                        <td className="text-center py-3 px-2">
                          <Badge variant="outline" className="font-mono text-[10px] bg-[#EEF7F2] text-[#2D7A4F] border-[#2D7A4F]/20">
                            {m.taxaComparecimento}%
                          </Badge>
                        </td>
                        <td className="text-center py-3 px-2">
                          <Badge variant="outline" className="font-mono text-[10px] bg-[#FDEAEA] text-[#B83232] border-[#B83232]/20">
                            {m.taxaFalta}%
                          </Badge>
                        </td>
                      </tr>
                    ))}
                    {municipioReport.length === 0 && (
                      <tr><td colSpan={11} className="text-center py-12 text-muted-foreground">Nenhum dado encontrado</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>


        {/* === TRATAMENTOS === */}
        <TabsContent value="tratamentos" className="space-y-5 mt-4">
          <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 gap-2">
            {[
              { label: 'Total Ciclos', value: treatmentStats.total, color: 'text-foreground' },
              { label: 'Ativos', value: treatmentStats.ativos, color: 'text-success' },
              { label: 'Finalizados', value: treatmentStats.finalizados, color: 'text-muted-foreground' },
              { label: 'Suspensos', value: treatmentStats.suspensos, color: 'text-destructive' },
              { label: 'Méd. Sessões/Pac.', value: treatmentStats.avgSessoesPorPaciente, color: 'text-primary' },
              { label: 'Taxa Abandono', value: `${treatmentStats.taxaAbandono}%`, color: 'text-warning' },
            ].map(s => (
              <Card key={s.label} className="shadow-card border-0">
                <CardContent className="p-2.5 text-center">
                  <p className={`text-lg font-bold ${s.color}`}>{s.value}</p>
                  <p className="text-[10px] text-muted-foreground leading-tight">{s.label}</p>
                </CardContent>
              </Card>
            ))}
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            {[
              { label: 'Total Sessões', value: treatmentStats.totalSessions },
              { label: 'Realizadas', value: treatmentStats.sessRealizadas },
              { label: 'Faltas', value: treatmentStats.sessFaltas },
              { label: 'Canceladas', value: treatmentStats.sessCanceladas },
            ].map(s => (
              <Card key={s.label} className="shadow-card border-0">
                <CardContent className="p-2.5 text-center">
                  <p className="text-lg font-bold text-foreground">{s.value}</p>
                  <p className="text-[10px] text-muted-foreground">{s.label}</p>
                </CardContent>
              </Card>
            ))}
          </div>

          {treatmentStats.byType.length > 0 && (
            <Card className="shadow-card border-0">
              <CardContent className="p-5">
                <h3 className="font-semibold font-display text-foreground mb-4">Tratamentos por Tipo</h3>
                <ResponsiveContainer width="100%" height={250}>
                  <BarChart data={treatmentStats.byType} layout="vertical">
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis type="number" />
                    <YAxis type="category" dataKey="nome" width={150} tick={{ fontSize: 11 }} />
                    <Tooltip />
                    <Bar dataKey="total" fill="hsl(199, 89%, 38%)" radius={[0, 4, 4, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          )}

          {treatmentStats.byProfessional.length > 0 && (
            <Card className="shadow-card border-0">
              <CardContent className="p-5">
                <h3 className="font-semibold font-display text-foreground mb-4">Tratamentos por Profissional</h3>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead><tr className="border-b">
                      <th className="text-left py-2 px-2">Profissional</th>
                      <th className="text-center py-2 px-2">Ativos</th>
                      <th className="text-center py-2 px-2">Finalizados</th>
                      <th className="text-center py-2 px-2">Sessões</th>
                    </tr></thead>
                    <tbody>
                      {treatmentStats.byProfessional.map((p, i) => (
                        <tr key={i} className="border-b last:border-0">
                          <td className="py-2 px-2 font-medium">{p.nome}</td>
                          <td className="py-2 px-2 text-center text-success">{p.ativos}</td>
                          <td className="py-2 px-2 text-center text-muted-foreground">{p.finalizados}</td>
                          <td className="py-2 px-2 text-center font-bold">{p.sessoes}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          )}

          {treatmentStats.byUnit.length > 0 && (
            <Card className="shadow-card border-0">
              <CardContent className="p-5">
                <h3 className="font-semibold font-display text-foreground mb-4">Tratamentos por Unidade</h3>
                <ResponsiveContainer width="100%" height={250}>
                  <PieChart>
                    <Pie data={treatmentStats.byUnit} dataKey="total" nameKey="nome" cx="50%" cy="50%" outerRadius={90} label={({ nome, total }) => `${nome}: ${total}`}>
                      {treatmentStats.byUnit.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                    </Pie>
                    <Tooltip />
                  </PieChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        {/* === ENFERMAGEM === */}
        <TabsContent value="enfermagem" className="space-y-5 mt-4">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {[
              { label: 'Total Avaliações', value: nursingReport.total },
              { label: 'Aptos', value: nursingReport.aptos },
              { label: 'Inaptos', value: nursingReport.inaptos },
              { label: 'Multiprofissional', value: nursingReport.multiprof },
            ].map(s => (
              <Card key={s.label} className="shadow-card border-0">
                <CardContent className="p-2.5 text-center">
                  <p className="text-lg font-bold text-foreground">{s.value}</p>
                  <p className="text-[10px] text-muted-foreground">{s.label}</p>
                </CardContent>
              </Card>
            ))}
          </div>
          {nursingReport.byPriority.length > 0 && (
            <Card className="shadow-card border-0">
              <CardContent className="p-5">
                <h3 className="font-semibold font-display text-foreground mb-4">Avaliações por Prioridade</h3>
                <ResponsiveContainer width="100%" height={250}>
                  <PieChart>
                    <Pie data={nursingReport.byPriority} dataKey="total" nameKey="nome" cx="50%" cy="50%" outerRadius={90} label={({ nome, total }) => `${nome}: ${total}`}>
                      {nursingReport.byPriority.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                    </Pie>
                    <Tooltip />
                  </PieChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        {/* === CLÍNICO === */}
        <TabsContent value="clinico" className="space-y-5 mt-4">
          <Card className="shadow-sm border-0 mb-4 bg-muted/30">
            <CardContent className="p-4 flex flex-col md:flex-row items-end gap-4">
              <div className="flex-1 w-full">
                <Label className="text-xs font-semibold mb-1.5 flex items-center gap-2">
                  <Search className="w-3 h-3 text-primary" /> Busca Ampla (Nome ou CID-10)
                </Label>
                <div className="relative">
                  <Input 
                    placeholder="Ex: F84 ou Nome do Paciente..." 
                    value={clinicalSearch}
                    onChange={(e) => setClinicalSearch(e.target.value)}
                    className="h-10 pl-9 bg-white shadow-sm focus:ring-2 focus:ring-primary/20"
                  />
                  <Search className="w-4 h-4 absolute left-3 top-3 text-muted-foreground" />
                  {clinicalSearch && (
                    <Button 
                      variant="ghost" 
                      size="sm" 
                      className="h-6 w-6 p-0 absolute right-2 top-2 rounded-full hover:bg-muted"
                      onClick={() => setClinicalSearch('')}
                    >
                      <span className="text-lg">×</span>
                    </Button>
                  )}
                </div>
                <p className="text-[10px] text-muted-foreground mt-1.5 ml-1">
                  💡 A busca é inteligente: ao digitar <strong>F84</strong> o sistema encontrará pacientes com <strong>F84.0, F84.5</strong>, etc.
                </p>
              </div>
              <div className="flex gap-2">
                <Button 
                  variant="outline" 
                  size="sm" 
                  className="h-10 px-4 bg-white"
                  onClick={() => setClinicalSearch('')}
                  disabled={!clinicalSearch}
                >
                  Limpar
                </Button>
              </div>
            </CardContent>
          </Card>

          <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 xl:grid-cols-10 gap-2">
            {[
              { label: 'Total com CID', value: clinicalReport.kpis.totalPacientesComCID, icon: Activity, color: 'text-primary' },
              { label: 'TEA/Autismo', value: clinicalReport.kpis.tea, icon: Brain, color: 'text-indigo-600' },
              { label: 'Def. Auditiva', value: clinicalReport.kpis.auditiva, icon: Ear, color: 'text-blue-600' },
              { label: 'Def. Visual', value: clinicalReport.kpis.visual, icon: Activity, color: 'text-amber-600' },
              { label: 'Def. Física', value: clinicalReport.kpis.fisica, icon: Dumbbell, color: 'text-green-600' },
              { label: 'Def. Intelectual', value: clinicalReport.kpis.intelectual, icon: Brain, color: 'text-purple-600' },
              { label: 'Def. Múltipla', value: clinicalReport.kpis.multipla, icon: Users2, color: 'text-rose-600' },
              { label: `Múlt. CIDs (${clinicalReport.kpis.multiplosCidsPercent}%)`, value: clinicalReport.kpis.multiplosCids, icon: ListOrdered, color: 'text-orange-600' },
              { label: 'Atendimentos', value: clinicalReport.kpis.totalAtendimentos, icon: CalendarDays, color: 'text-slate-600' },
              { label: 'Procedimentos', value: clinicalReport.kpis.totalProcedimentos, icon: ClipboardList, color: 'text-slate-600' },
            ].map(k => (
              <Card key={k.label} className="shadow-card border-0">
                <CardContent className="p-3 text-center">
                  <k.icon className={`w-4 h-4 mx-auto mb-1 ${k.color} opacity-80`} />
                  <p className="text-xl font-bold text-foreground leading-none">{k.value}</p>
                  <p className="text-[10px] text-muted-foreground mt-1 leading-tight">{k.label}</p>
                </CardContent>
              </Card>
            ))}
          </div>


          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
            <Card className="shadow-card border-0">
              <CardContent className="p-5">
                <h3 className="font-semibold font-display text-foreground mb-4 flex items-center gap-2">
                  <BarChart3 className="w-4 h-4 text-primary" /> Pacientes por Categoria Clínica
                </h3>
                <ResponsiveContainer width="100%" height={300}>
                  <BarChart data={clinicalReport.byCategory} layout="vertical" margin={{ left: 100 }}>
                    <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                    <XAxis type="number" />
                    <YAxis type="category" dataKey="name" width={120} tick={{ fontSize: 11 }} />
                    <Tooltip />
                    <Bar dataKey="pacientes" fill="hsl(199, 89%, 38%)" radius={[0, 4, 4, 0]} name="Pacientes" />
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>

            <Card className="shadow-card border-0">
              <CardContent className="p-5">
                <h3 className="font-semibold font-display text-foreground mb-4 flex items-center gap-2">
                  <Activity className="w-4 h-4 text-primary" /> CIDs Mais Frequentes
                </h3>
                <ResponsiveContainer width="100%" height={300}>
                  <BarChart data={clinicalReport.topCids}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} />
                    <XAxis dataKey="cid" tick={{ fontSize: 11 }} />
                    <YAxis />
                    <Tooltip content={({ active, payload }) => {
                      if (active && payload && payload.length) {
                        return (
                          <div className="bg-white p-2 border rounded shadow-sm text-xs">
                            <p className="font-bold">{payload[0].payload.cid}</p>
                            <p className="text-muted-foreground mb-1">{payload[0].payload.descricao}</p>
                            <p className="text-primary font-medium">{payload[0].value} pacientes</p>
                          </div>
                        );
                      }
                      return null;
                    }} />
                    <Bar dataKey="count" fill="hsl(168, 60%, 42%)" radius={[4, 4, 0, 0]} name="Frequência" />
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          </div>

          {/* Top 20 CID-10 */}
          <Card className="shadow-card border-0">
            <CardContent className="p-5">
              <h3 className="font-semibold font-display text-foreground mb-4 flex items-center gap-2">
                <ListOrdered className="w-4 h-4 text-primary" /> Top 20 CID-10
              </h3>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b bg-muted/50">
                      <th className="text-left py-2 px-3 text-muted-foreground font-medium">#</th>
                      <th className="text-left py-2 px-3 text-muted-foreground font-medium">Código</th>
                      <th className="text-left py-2 px-3 text-muted-foreground font-medium">Descrição</th>
                      <th className="text-center py-2 px-3 text-muted-foreground font-medium">Quantidade</th>
                      <th className="text-center py-2 px-3 text-muted-foreground font-medium">%</th>
                    </tr>
                  </thead>
                  <tbody>
                    {clinicalReport.topCids20.map((c, i) => (
                      <tr key={c.cid} className="border-b last:border-0 hover:bg-muted/30">
                        <td className="py-1.5 px-3 text-muted-foreground">{i + 1}</td>
                        <td className="py-1.5 px-3 font-bold text-primary">{c.cid}</td>
                        <td className="py-1.5 px-3">{c.descricao}</td>
                        <td className="py-1.5 px-3 text-center font-medium">{c.count}</td>
                        <td className="py-1.5 px-3 text-center text-muted-foreground">{c.percent}%</td>
                      </tr>
                    ))}
                    {clinicalReport.topCids20.length === 0 && (
                      <tr><td colSpan={5} className="py-4 text-center text-muted-foreground">Sem dados</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>

          {/* Sexo + Faixa Etária */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
            <Card className="shadow-card border-0">
              <CardContent className="p-5">
                <h3 className="font-semibold font-display text-foreground mb-4 flex items-center gap-2">
                  <Users className="w-4 h-4 text-primary" /> Distribuição por Sexo
                </h3>
                <ResponsiveContainer width="100%" height={260}>
                  <PieChart>
                    <Pie data={clinicalReport.sexoDist} dataKey="value" nameKey="name" outerRadius={90} label={(e: any) => `${e.name}: ${e.value}`}>
                      {clinicalReport.sexoDist.map((_, i) => (
                        <Cell key={i} fill={['#3b82f6', '#ec4899', '#94a3b8'][i % 3]} />
                      ))}
                    </Pie>
                    <Tooltip />
                    <Legend />
                  </PieChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>

            <Card className="shadow-card border-0">
              <CardContent className="p-5">
                <h3 className="font-semibold font-display text-foreground mb-4 flex items-center gap-2">
                  <BarChart3 className="w-4 h-4 text-primary" /> Distribuição por Faixa Etária
                </h3>
                <ResponsiveContainer width="100%" height={260}>
                  <BarChart data={clinicalReport.faixaEtariaDist}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} />
                    <XAxis dataKey="name" tick={{ fontSize: 10 }} />
                    <YAxis />
                    <Tooltip />
                    <Bar dataKey="value" fill="hsl(199, 89%, 38%)" radius={[4, 4, 0, 0]} name="Pacientes" />
                  </BarChart>
                </ResponsiveContainer>
                {clinicalReport.kpis.semIdade > 0 && (
                  <p className="text-[10px] text-muted-foreground mt-2">Sem data de nascimento: {clinicalReport.kpis.semIdade}</p>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Evolução Temporal + Múltiplos CIDs */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
            <Card className="shadow-card border-0 lg:col-span-2">
              <CardContent className="p-5">
                <h3 className="font-semibold font-display text-foreground mb-4 flex items-center gap-2">
                  <TrendingUp className="w-4 h-4 text-primary" /> Evolução Temporal dos Diagnósticos
                </h3>
                <ResponsiveContainer width="100%" height={260}>
                  <LineChart data={clinicalReport.evolucaoTemporal}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="month" tick={{ fontSize: 10 }} />
                    <YAxis />
                    <Tooltip />
                    <Line type="monotone" dataKey="value" stroke="hsl(168, 60%, 42%)" strokeWidth={2} dot name="Diagnósticos" />
                  </LineChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>

            <Card className="shadow-card border-0">
              <CardContent className="p-5 space-y-3">
                <h3 className="font-semibold font-display text-foreground flex items-center gap-2">
                  <ListOrdered className="w-4 h-4 text-primary" /> Pacientes com Múltiplos CIDs
                </h3>
                <div className="space-y-2 pt-2">
                  <div className="flex justify-between border-b pb-2">
                    <span className="text-sm text-muted-foreground">Quantidade</span>
                    <span className="text-2xl font-bold text-primary">{clinicalReport.kpis.multiplosCids}</span>
                  </div>
                  <div className="flex justify-between border-b pb-2">
                    <span className="text-sm text-muted-foreground">Percentual</span>
                    <span className="text-2xl font-bold text-orange-600">{clinicalReport.kpis.multiplosCidsPercent}%</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-sm text-muted-foreground">Média CID/paciente</span>
                    <span className="text-2xl font-bold text-indigo-600">{clinicalReport.kpis.mediaCidPorPaciente}</span>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>



          <Card className="shadow-card border-0">
            <CardContent className="p-5">
              <div className="flex items-center justify-between mb-4">
                <h3 className="font-semibold font-display text-foreground">Distribuição por Categoria e Volume</h3>
                <div className="flex gap-2">
                  <Button variant="ghost" size="sm"><Download className="w-3 h-3 mr-1" />Exportar</Button>
                </div>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b bg-muted/50">
                      <th className="text-left py-2.5 px-3 text-muted-foreground font-medium">Categoria</th>
                      <th className="text-center py-2.5 px-2 text-muted-foreground font-medium">Pacientes Únicos</th>
                      <th className="text-center py-2.5 px-2 text-muted-foreground font-medium">Total Atendimentos</th>
                      <th className="text-center py-2.5 px-2 text-muted-foreground font-medium">Total Procedimentos</th>
                      <th className="text-right py-2.5 px-3 text-muted-foreground font-medium">Ações</th>
                    </tr>
                  </thead>
                  <tbody>
                    {clinicalReport.byCategory.map((cat, idx) => (
                      <tr key={idx} className="border-b last:border-0 hover:bg-muted/30 transition-colors">
                        <td className="py-2.5 px-3 text-foreground font-medium">{cat.name}</td>
                        <td className="py-2.5 px-2 text-center text-primary font-bold">{cat.pacientes}</td>
                        <td className="py-2.5 px-2 text-center text-muted-foreground">{cat.atendimentos}</td>
                        <td className="py-2.5 px-2 text-center text-muted-foreground">{cat.procedimentos}</td>
                        <td className="py-2.5 px-3 text-right">
                          <Button 
                            variant="ghost" 
                            size="sm" 
                            className="h-8 text-xs gap-1"
                            onClick={() => setClinicalDetailDialog({ open: true, category: cat.name })}
                          >
                            <Info className="w-3 h-3" /> Ver Pacientes
                          </Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* === MULTIPROFISSIONAL === */}
        <TabsContent value="multiprofissional" className="space-y-5 mt-4">
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            <Card className="shadow-card border-0">
              <CardContent className="p-2.5 text-center">
                <p className="text-lg font-bold text-foreground">{multiReport.total}</p>
                <p className="text-[10px] text-muted-foreground">Total Avaliações</p>
              </CardContent>
            </Card>
          </div>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
            {multiReport.bySpecialty.length > 0 && (
              <Card className="shadow-card border-0">
                <CardContent className="p-5">
                  <h3 className="font-semibold font-display text-foreground mb-4">Por Especialidade</h3>
                  <ResponsiveContainer width="100%" height={250}>
                    <BarChart data={multiReport.bySpecialty}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="nome" tick={{ fontSize: 10 }} />
                      <YAxis tick={{ fontSize: 10 }} />
                      <Tooltip />
                      <Bar dataKey="total" fill="hsl(262, 83%, 58%)" radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>
            )}
            {multiReport.byParecer.length > 0 && (
              <Card className="shadow-card border-0">
                <CardContent className="p-5">
                  <h3 className="font-semibold font-display text-foreground mb-4">Por Parecer</h3>
                  <ResponsiveContainer width="100%" height={250}>
                    <PieChart>
                      <Pie data={multiReport.byParecer} dataKey="total" nameKey="nome" cx="50%" cy="50%" outerRadius={90} label={({ nome, total }) => `${nome}: ${total}`}>
                        {multiReport.byParecer.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                      </Pie>
                      <Tooltip />
                    </PieChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>
            )}
          </div>
        </TabsContent>

        {/* === PTS === */}
        <TabsContent value="pts_report" className="space-y-5 mt-4">
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            {[
              { label: 'Total PTS', value: ptsReport.total },
              { label: 'Ativos', value: ptsReport.ativos },
              { label: 'Concluídos', value: ptsReport.concluidos },
            ].map(s => (
              <Card key={s.label} className="shadow-card border-0">
                <CardContent className="p-2.5 text-center">
                  <p className="text-lg font-bold text-foreground">{s.value}</p>
                  <p className="text-[10px] text-muted-foreground">{s.label}</p>
                </CardContent>
              </Card>
            ))}
          </div>
          {ptsReport.total === 0 && (
            <Card className="shadow-card border-0">
              <CardContent className="p-8 text-center text-muted-foreground">
                Nenhum PTS registrado no período selecionado.
              </CardContent>
            </Card>
          )}
        </TabsContent>

        {/* === MAPA DE ATENDIMENTO === */}
        <TabsContent value="mapa" className="space-y-5 mt-4">
          <Card className="shadow-card border-0">
            <CardContent className="p-5">
              <h3 className="font-semibold font-display text-foreground mb-4 flex items-center gap-2">
                <MapPin className="w-4 h-4 text-primary" /> Mapa de Atendimentos Concluídos
              </h3>
              <div className="flex flex-wrap items-end gap-3 mb-4">
                <div>
                  <Label className="text-xs">Data Inicial *</Label>
                  <Input type="date" value={dateFrom} onChange={e => { setDateFrom(e.target.value); setMapaGenerated(false); }} className="h-9 w-44" />
                </div>
                <div>
                  <Label className="text-xs">Data Final *</Label>
                  <Input type="date" value={dateTo} onChange={e => { setDateTo(e.target.value); setMapaGenerated(false); }} className="h-9 w-44" />
                </div>
                <div>
                  <Label className="text-xs">Profissional</Label>
                  <Select value={mapaProf} onValueChange={v => { setMapaProf(v); setMapaGenerated(false); }}>
                    <SelectTrigger className="h-9 w-48"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Todos</SelectItem>
                      {[...profissionais, ...tecnicos]
                        .sort((a, b) => a.nome.localeCompare(b.nome))
                        .map(p => <SelectItem key={p.id} value={p.id}>{p.nome}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <Button onClick={generateMapa} disabled={!dateFrom || !dateTo || mapaLoading} className="gradient-primary text-primary-foreground h-9">
                  <Search className="w-4 h-4 mr-1" />{mapaLoading ? 'Gerando...' : 'Gerar Relatório'}
                </Button>
                <ActionButton variant="outline" size="sm" onClick={exportMapaPDF} disabled={!mapaGenerated || mapaData.length === 0} className="h-9" loadingText="Gerando PDF...">
                  <FileText className="w-4 h-4 mr-1" />PDF
                </ActionButton>
                <Button variant="outline" size="sm" onClick={exportMapaCSV} disabled={!mapaGenerated || mapaData.length === 0} className="h-9">
                  <Download className="w-4 h-4 mr-1" />CSV
                </Button>
                <ActionButton variant="outline" size="sm" disabled={!mapaGenerated || mapaData.length === 0} className="h-9" loadingText="Preparando..." onClick={() => {
                  if (mapaData.length === 0) { toast.warning('Não há dados para exportar'); return; }
                  try {
                    const now = new Date().toLocaleString('pt-BR');
                    const periodo = `${formatDateBR(dateFrom)} a ${formatDateBR(dateTo)}`;
                    const formatCPF = (c: string) => { if (!c || c.length !== 11) return c || '-'; return c.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4'); };
                    const formatCNS = (c: string) => { const d = (c || '').replace(/\D/g, ''); if (d.length !== 15) return c || '-'; return `${d.slice(0,3)} ${d.slice(3,7)} ${d.slice(7,11)} ${d.slice(11)}`; };
                    const tableRows = mapaData.map((r, i) => {
                      return `<tr style="${i % 2 === 1 ? 'background:#f9f9f9;' : ''}">
                        <td style="text-align:center">${String(r.num).padStart(2, '0')}</td>
                        <td>${r.paciente_nome}</td>
                        <td>${formatDateBR(r.data_atendimento)}</td>
                        <td>${formatDateBR(r.data_nascimento)}</td>
                        <td>${formatCPF(r.cpf)}</td>
                        <td>${r.cns || '-'}</td>
                        <td>${r.telefone || '-'}</td>
                        <td>${r.tipo_logradouro || '-'}</td>
                        <td>${r.logradouro || '-'}</td>
                        <td>${r.numero || '-'}</td>
                        <td>${r.complemento || '-'}</td>
                        <td>${r.bairro || '-'}</td>
                        <td>${r.municipio || '-'}</td>
                        <td>${r.profissional_nome}</td>
                        <td>${r.especialidade || '-'}</td>
                        <td>${r.procedimentos_realizados || '-'}</td>
                        <td>${r.procedimento_sigtap || '-'}</td>
                        <td>${r.cid || '-'}</td>
                        <td>${r.observacoes || '-'}</td>
                      </tr>`;
                    }).join('');
                    const logoUrl = logoSmsFallback;
                    const logoUrlRight = logoCerFallback;
                    const html = `<!DOCTYPE html><html lang="pt-BR"><head><meta charset="UTF-8"><title>Mapa de Atendimentos</title>
<style>@page{size:A4 landscape;margin:5mm;}*{margin:0;padding:0;box-sizing:border-box;}body{font-family:Arial,sans-serif;padding:10px;color:#1e293b;font-size:8px;}
.header{display:flex;align-items:center;gap:14px;padding:8px 12px;margin-bottom:8px;border-bottom:2px solid #0369a1;}
.header img{max-height:40px;max-width:80px;object-fit:contain;}
.header h1{font-size:11px;font-weight:700;}
.header .sub{font-size:8px;color:#555;margin-top:1px;}
.periodo{text-align:center;font-size:9px;margin-bottom:8px;font-weight:600;}
table{width:100%;border-collapse:collapse;margin-bottom:8px;}
th,td{border:1px solid #ccc;padding:2px 3px;text-align:left;font-size:6px;}
th{background:#f1f5f9;font-weight:600;}
@media print{body{padding:0;}.no-print{display:none!important;}}</style></head><body>
<div class="header"><img src="${logoUrl}" alt="Logo SMS"/><div style="flex:1;text-align:center;"><h1>SECRETARIA MUNICIPAL DE SAÚDE DE ORIXIMINÁ</h1><div class="sub">CENTRO ESPECIALIZADO EM REABILITAÇÃO NÍVEL II</div><div style="font-weight:700;margin-top:2px;text-transform:uppercase;">Mapa de Atendimentos Concluídos</div></div><img src="${logoUrlRight}" alt="Logo CER II"/><div style="margin-left:8px;font-size:7px;text-align:right;">Data: ${now}<br/>Período: ${periodo}</div></div>
<table><thead><tr><th style="width:20px;text-align:center">Nº</th><th>Paciente</th><th>Dt Atend</th><th>Dt Nasc</th><th>CPF</th><th>CNS</th><th>Tel</th><th>Tipo</th><th>Logr</th><th>Nº</th><th>Compl</th><th>Bairro</th><th>Mun</th><th>Profissional</th><th>Espec</th><th>Procs Realizados</th><th>SIGTAP</th><th>CID</th><th>Obs</th></tr></thead><tbody>${tableRows}</tbody>
<tfoot><tr><td colspan="19" style="text-align:right;font-weight:600;padding:4px;">Total: ${mapaData.length} atendimentos</td></tr></tfoot></table>
</body></html>`;
                    printViaIframe(html);
                    toast.success('Documento pronto', { description: 'Use "Salvar como PDF" para baixar.' });
                  } catch (err) {
                    console.error(err);
                    toast.error('Não foi possível iniciar a impressão');
                  }
                }}>

                  <Printer className="w-4 h-4 mr-1" />Imprimir
                </ActionButton>
              </div>

              {mapaGenerated && mapaData.length === 0 && (
                <p className="text-center text-muted-foreground py-8">Nenhum atendimento concluído encontrado no período selecionado.</p>
              )}

              {mapaGenerated && mapaData.length > 0 && (
                <div className="overflow-x-auto rounded-lg border border-border/60">
                  <p className="text-xs text-muted-foreground px-3 py-2 bg-muted/30">Período: {formatDateBR(dateFrom)} a {formatDateBR(dateTo)} — {mapaData.length} atendimentos</p>
                  <table className="w-full text-xs border-collapse">
                    <thead>
                      <tr className="bg-muted/60">
                        <th className="border border-border px-2 py-1.5 text-center w-8">Nº</th>
                        <th className="border border-border px-2 py-1.5 text-center w-10">Foto</th>
                        <th className="border border-border px-2 py-1.5 text-left">Nome do Paciente</th>
                        <th className="border border-border px-2 py-1.5 text-left w-24">Dt Atendimento</th>
                        <th className="border border-border px-2 py-1.5 text-left w-24">Dt Nascimento</th>
                        <th className="border border-border px-2 py-1.5 text-left w-28">CPF</th>
                        <th className="border border-border px-2 py-1.5 text-left">CNS</th>
                        <th className="border border-border px-2 py-1.5 text-left">Telefone</th>
                        <th className="border border-border px-2 py-1.5 text-left">Tipo Logr.</th>
                        <th className="border border-border px-2 py-1.5 text-left">Logradouro</th>
                        <th className="border border-border px-2 py-1.5 text-left">Nº</th>
                        <th className="border border-border px-2 py-1.5 text-left">Compl.</th>
                        <th className="border border-border px-2 py-1.5 text-left">Bairro</th>
                        <th className="border border-border px-2 py-1.5 text-left">Município</th>
                        <th className="border border-border px-2 py-1.5 text-left">Profissional</th>
                        <th className="border border-border px-2 py-1.5 text-left">Especialidade</th>
                        <th className="border border-border px-2 py-1.5 text-left">Procedimentos Realizados</th>
                        <th className="border border-border px-2 py-1.5 text-left">Proc. SIGTAP</th>
                        <th className="border border-border px-2 py-1.5 text-left w-16">CID</th>
                        <th className="border border-border px-2 py-1.5 text-left">Obs</th>
                      </tr>

                    </thead>
                    <tbody>
                      {mapaData.map((r, i) => {
                        const initials = r.profissional_nome.split(' ').filter(Boolean).map(w => w[0]).join('').substring(0, 2).toUpperCase();
                        const hashColor = `hsl(${[...r.profissional_nome].reduce((a, c) => a + c.charCodeAt(0), 0) % 360}, 55%, 50%)`;
                        const formatCPF = (c: string) => { if (!c || c.length !== 11) return c || '-'; return c.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4'); };
                        return (
                          <tr key={i} className={i % 2 === 1 ? 'bg-muted/30' : ''}>
                            <td className="border border-border px-2 py-1 text-center font-medium">{String(r.num).padStart(2, '0')}</td>
                            <td className="border border-border px-2 py-1 text-center">
                              <div className="relative group inline-block">
                                <div className="w-8 h-8 rounded-full flex items-center justify-center text-[10px] font-bold text-white mx-auto" style={{ backgroundColor: hashColor }} title={r.profissional_nome}>
                                  {initials}
                                </div>
                                <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1 px-2 py-1 bg-foreground text-background text-[10px] rounded whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-10">
                                  {r.profissional_nome}
                                </div>
                              </div>
                            </td>
                            <td className="border border-border px-2 py-1">{r.paciente_nome}</td>
                            <td className="border border-border px-2 py-1">{formatDateBR(r.data_atendimento)}</td>
                            <td className="border border-border px-2 py-1">{formatDateBR(r.data_nascimento)}</td>
                            <td className="border border-border px-2 py-1">{formatCPF(r.cpf)}</td>
                            <td className="border border-border px-2 py-1">{r.cns || '-'}</td>
                            <td className="border border-border px-2 py-1">{r.telefone || '-'}</td>
                            <td className="border border-border px-2 py-1">{r.tipo_logradouro || '-'}</td>
                            <td className="border border-border px-2 py-1">{r.logradouro || '-'}</td>
                            <td className="border border-border px-2 py-1">{r.numero || '-'}</td>
                            <td className="border border-border px-2 py-1">{r.complemento || '-'}</td>
                            <td className="border border-border px-2 py-1">{r.bairro || '-'}</td>
                            <td className="border border-border px-2 py-1">{r.municipio || '-'}</td>
                            <td className="border border-border px-2 py-1">{r.profissional_nome}</td>
                            <td className="border border-border px-2 py-1">{r.especialidade || '-'}</td>
                            <td className="border border-border px-2 py-1">{r.procedimentos_realizados || '-'}</td>
                            <td className="border border-border px-2 py-1">{r.procedimento_sigtap || '-'}</td>
                            <td className="border border-border px-2 py-1">{r.cid || '-'}</td>
                            <td className="border border-border px-2 py-1">{r.observacoes || '-'}</td>
                          </tr>
                        );
                      })}

                    </tbody>
                    <tfoot>
                      <tr className="bg-muted/60 font-semibold">
                        <td colSpan={20} className="border border-border px-2 py-1.5 text-right">Total: {mapaData.length} atendimentos</td>
                      </tr>

                    </tfoot>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Clinical Detail Dialog */}
      <Dialog 
        open={clinicalDetailDialog.open} 
        onOpenChange={(open) => setClinicalDetailDialog({ open, category: clinicalDetailDialog.category })}
      >
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Activity className="w-5 h-5 text-primary" />
              Pacientes - {clinicalDetailDialog.category}
            </DialogTitle>
          </DialogHeader>
          <div className="py-4">
            <div className="overflow-x-auto rounded-lg border">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-muted/50 border-b">
                    <th className="text-left py-2 px-3 font-medium">Paciente</th>
                    <th className="text-left py-2 px-3 font-medium">CIDs</th>
                    <th className="text-center py-2 px-3 font-medium">Atendimentos</th>
                    <th className="text-left py-2 px-3 font-medium">Últimos Procedimentos</th>
                  </tr>
                </thead>
                <tbody>
                  {clinicalReport.patients
                    .filter(p => clinicalDetailDialog.category ? p.categories.has(clinicalDetailDialog.category) : true)
                    .map((p, idx) => (
                      <tr key={idx} className="border-b last:border-0 hover:bg-muted/20">
                        <td className="py-2 px-3">
                          <div className="font-medium">{p.nome}</div>
                          <div className="flex gap-1 mt-1">
                            {Array.from(p.origens).map(o => (
                              <span key={o} className="text-[9px] uppercase px-1 rounded bg-muted text-muted-foreground">{o}</span>
                            ))}
                          </div>
                        </td>
                        <td className="py-2 px-3">
                          <div className="flex flex-wrap gap-1">
                            {Array.from(p.cids).map(c => (
                              <Badge 
                                key={c} 
                                variant="outline" 
                                className="text-[10px] cursor-help" 
                                title={cid10Descriptions[c] || "Descrição não carregada"}
                              >
                                {c}
                              </Badge>
                            ))}
                          </div>
                          {Array.from(p.cids).length === 1 && (
                            <div className="text-[10px] text-muted-foreground mt-1 truncate max-w-[200px]">
                              {cid10Descriptions[Array.from(p.cids)[0]]}
                            </div>
                          )}
                        </td>
                        <td className="py-2 px-3 text-center">{p.atendimentos}</td>
                        <td className="py-2 px-3 text-xs text-muted-foreground">
                          {Array.from(p.procedimentos).slice(0, 3).join(", ")}
                          {p.procedimentos.size > 3 && "..."}
                        </td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default Relatorios;
