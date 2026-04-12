import React, { useState, useMemo, useEffect, useCallback } from 'react';
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
import { Download, FileText, Filter, Clock, Users, CalendarDays, TrendingUp, AlertTriangle, UserCheck, ListOrdered, Printer, BarChart3, HeartPulse, MapPin, Search } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { openPrintDocument } from '@/lib/printLayout';
import { useUnidadeFilter } from '@/hooks/useUnidadeFilter';

const COLORS = ['hsl(199, 89%, 38%)', 'hsl(168, 60%, 42%)', 'hsl(45, 93%, 47%)', 'hsl(0, 72%, 51%)', 'hsl(262, 83%, 58%)', 'hsl(200, 18%, 46%)', 'hsl(280, 60%, 50%)', 'hsl(30, 80%, 50%)'];

const statusLabels: Record<string, string> = {
  pendente: 'Pendente', confirmado: 'Confirmado', confirmado_chegada: 'Chegou',
  em_atendimento: 'Em Atendimento', concluido: 'Concluído', falta: 'Falta',
  cancelado: 'Cancelado', remarcado: 'Remarcado', atraso: 'Atraso',
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
  const { agendamentos, pacientes, funcionarios, unidades, salas, fila } = useData();
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
  const [atendimentosDB, setAtendimentosDB] = useState<AtendimentoDB[]>([]);
  const [filaDB, setFilaDB] = useState<FilaDB[]>([]);
  const [triagensDB, setTriagensDB] = useState<TriagemDB[]>([]);
  const [procedimentosDB, setProcedimentosDB] = useState<{ prontuario_id: string; procedimento_id: string; proc_nome?: string; prof_nome?: string; unidade_id?: string; data?: string }[]>([]);
  const [treatmentCycles, setTreatmentCycles] = useState<any[]>([]);
  const [treatmentSessions, setTreatmentSessions] = useState<any[]>([]);
  const [nursingEvals, setNursingEvals] = useState<any[]>([]);
  const [multiEvals, setMultiEvals] = useState<any[]>([]);
  const [ptsData, setPtsData] = useState<any[]>([]);

  // Mapa de Atendimento state
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

  const setoresUnicos = useMemo(() => {
    const s = new Set([...atendimentosDB.map(a => a.setor), ...agendamentos.map(a => a.tipo)].filter(Boolean));
    return Array.from(s).sort();
  }, [atendimentosDB, agendamentos]);

  const tiposUnicos = useMemo(() => {
    const s = new Set(agendamentos.map(a => a.tipo).filter(Boolean));
    return Array.from(s).sort();
  }, [agendamentos]);

  useEffect(() => {
    const load = async () => {
      try {
        let qAt = supabase.from('atendimentos').select('id,agendamento_id,paciente_id,paciente_nome,profissional_id,profissional_nome,unidade_id,sala_id,setor,procedimento,data,hora_inicio,hora_fim,duracao_minutos,status');
        let qFila = supabase.from('fila_espera').select('id,paciente_id,paciente_nome,unidade_id,profissional_id,setor,prioridade,prioridade_perfil,status,posicao,hora_chegada,hora_chamada,criado_em');
        let qTriage = supabase.from('triage_records').select('id,agendamento_id,tecnico_id,criado_em,confirmado_em,iniciado_em');
        if (user?.role === 'coordenador' && user.unidadeId) {
          qAt = qAt.eq('unidade_id', user.unidadeId);
          qFila = qFila.eq('unidade_id', user.unidadeId);
        }
        if (user?.role === 'recepcao' && user.unidadeId) {
          qAt = qAt.eq('unidade_id', user.unidadeId);
          qFila = qFila.eq('unidade_id', user.unidadeId);
        }
        if (user?.role === 'profissional' && user.id) {
          qAt = qAt.eq('profissional_id', user.id);
          qFila = qFila.eq('profissional_id', user.id);
        }
        if (user?.role === 'tecnico' && user.id) {
          qTriage = qTriage.eq('tecnico_id', user.id);
        }

        let qProc = (supabase as any).from('prontuario_procedimentos')
          .select('prontuario_id, procedimento_id, procedimentos:procedimento_id(nome), prontuarios:prontuario_id(profissional_nome,unidade_id,data_atendimento)');

        let qCycles = supabase.from('treatment_cycles').select('id,patient_id,professional_id,unit_id,specialty,treatment_type,status,total_sessions,sessions_done,frequency,start_date,end_date_predicted,created_at');
        const loadAllTreatmentSessions = async () => {
          const pageSize = 1000;
          let from = 0;
          let allSessions: any[] = [];

          while (true) {
            let query = supabase
              .from('treatment_sessions')
              .select('id,cycle_id,patient_id,professional_id,status,scheduled_date,session_number,absence_type')
              .range(from, from + pageSize - 1);

            if (user?.role === 'profissional') {
              query = query.eq('professional_id', user.id);
            }

            const { data, error } = await query;
            if (error) throw error;
            if (!data || data.length === 0) break;

            allSessions = allSessions.concat(data);

            if (data.length < pageSize) break;
            from += pageSize;
          }

          return allSessions;
        };

        if (user?.role === 'profissional') {
          qCycles = qCycles.eq('professional_id', user.id);
        }
        if ((user?.role === 'coordenador' || user?.role === 'recepcao') && user?.unidadeId) {
          qCycles = qCycles.eq('unit_id', user.unidadeId);
        }

        const [
          { data: atData },
          { data: filaData },
          { data: triageData },
          { data: procData },
          { data: cyclesData },
          sessionsData,
          { data: nursingData },
          { data: multiData },
          { data: ptsDataResult },
        ] = await Promise.all([
          qAt,
          qFila,
          qTriage,
          qProc,
          qCycles,
          loadAllTreatmentSessions(),
          supabase.from('nursing_evaluations').select('id,patient_id,unit_id,evaluation_date,resultado,prioridade,avaliacao_risco,created_at'),
          supabase.from('multiprofessional_evaluations').select('id,patient_id,unit_id,evaluation_date,specialty,parecer,professional_nome,created_at'),
          supabase.from('pts').select('id,patient_id,professional_id,unit_id,status,especialidades_envolvidas,created_at'),
        ]);

        if (atData) setAtendimentosDB(atData);
        if (filaData) setFilaDB(filaData);
        if (triageData) setTriagensDB(triageData as TriagemDB[]);
        if (procData) {
          setProcedimentosDB(procData.map((r: any) => ({
            prontuario_id: r.prontuario_id,
            procedimento_id: r.procedimento_id,
            proc_nome: r.procedimentos?.nome || '',
            prof_nome: r.prontuarios?.profissional_nome || '',
            unidade_id: r.prontuarios?.unidade_id || '',
            data: r.prontuarios?.data_atendimento || '',
          })));
        }
        if (cyclesData) setTreatmentCycles(cyclesData);
        if (sessionsData) setTreatmentSessions(sessionsData);
        if (nursingData) setNursingEvals(nursingData);
        if (multiData) setMultiEvals(multiData);
        if (ptsDataResult) setPtsData(ptsDataResult);
      } catch (err) { console.error('Error loading report data:', err); }
    };
    load();
  }, [user]);

  // === FILTERS ===
  const filtered = useMemo(() => {
    return agendamentos.filter(a => {
      if (filterUnit !== 'all' && a.unidadeId !== filterUnit) return false;
      if (filterProf !== 'all' && a.profissionalId !== filterProf) return false;
      if (filterStatus !== 'all' && a.status !== filterStatus) return false;
      if (filterTipo !== 'all' && a.tipo !== filterTipo) return false;
      if (dateFrom && a.data < dateFrom) return false;
      if (dateTo && a.data > dateTo) return false;
      if (user?.role === 'coordenador' && user.unidadeId && a.unidadeId !== user.unidadeId) return false;
      if (user?.role === 'profissional' && user.id && a.profissionalId !== user.id) return false;
      if (user?.role === 'recepcao' && user.unidadeId && a.unidadeId !== user.unidadeId) return false;
      return true;
    });
  }, [agendamentos, filterUnit, filterProf, filterStatus, filterTipo, dateFrom, dateTo, user]);

  const filteredAtendimentos = useMemo(() => {
    return atendimentosDB.filter(a => {
      if (filterUnit !== 'all' && a.unidade_id !== filterUnit) return false;
      if (filterProf !== 'all' && a.profissional_id !== filterProf) return false;
      if (filterSetor !== 'all' && a.setor !== filterSetor) return false;
      if (dateFrom && a.data < dateFrom) return false;
      if (dateTo && a.data > dateTo) return false;
      return true;
    });
  }, [atendimentosDB, filterUnit, filterProf, filterSetor, dateFrom, dateTo]);

  // === STATS ===
  const stats = useMemo(() => {
    const total = filtered.length;
    const confirmados = filtered.filter(a => a.status === 'confirmado' || a.status === 'confirmado_chegada').length;
    const pendentes = filtered.filter(a => a.status === 'pendente').length;
    const concluidos = filtered.filter(a => a.status === 'concluido').length;
    const emAtendimento = filtered.filter(a => a.status === 'em_atendimento').length;
    const faltas = filtered.filter(a => a.status === 'falta').length;
    const cancelados = filtered.filter(a => a.status === 'cancelado').length;
    const remarcados = filtered.filter(a => a.status === 'remarcado').length;
    const online = filtered.filter(a => a.origem === 'online').length;
    const recepcao = filtered.filter(a => a.origem === 'recepcao').length;
    const retornos = filtered.filter(a => a.tipo === 'Retorno').length;
    const primeiraConsulta = filtered.filter(a => a.tipo === 'Consulta' || a.tipo === 'Primeira Consulta').length;
    const taxaComparecimento = total > 0 ? Math.round(((concluidos + emAtendimento) / (total - pendentes - cancelados || 1)) * 100) : 0;
    const taxaFalta = total > 0 ? Math.round((faltas / (total || 1)) * 100) : 0;
    return { total, confirmados, pendentes, concluidos, emAtendimento, faltas, cancelados, remarcados, online, recepcao, retornos, primeiraConsulta, taxaComparecimento, taxaFalta };
  }, [filtered]);

  const tempoStats = useMemo(() => {
    const finalizados = filteredAtendimentos.filter(a => a.status === 'finalizado' && a.duracao_minutos && a.duracao_minutos > 0);
    const totalMinutos = finalizados.reduce((s, a) => s + (a.duracao_minutos || 0), 0);
    const media = finalizados.length > 0 ? Math.round(totalMinutos / finalizados.length) : 0;
    return { totalAtendimentos: finalizados.length, tempoMedio: media, totalMinutos };
  }, [filteredAtendimentos]);

  // === PRODUCTIVITY BY PROFESSIONAL (unified source for screen + export) ===
  const porProfissional = useMemo(() => {
    const map: Record<string, { id: string; nome: string; role: string; profissao: string; unidade: string; total: number; concluidos: number; faltas: number; cancelados: number; remarcados: number; tempoTotal: number; atendimentos: number; retornos: number; pacientesSet: Set<string> }> = {};
    filtered.forEach(a => {
      const un = unidades.find(u => u.id === a.unidadeId);
      const func = funcionarios.find(f => f.id === a.profissionalId);
      const key = a.profissionalId || a.profissionalNome;
      if (!map[key]) map[key] = { id: a.profissionalId, nome: a.profissionalNome, role: func?.role || 'profissional', profissao: func?.profissao || '', unidade: un?.nome || '', total: 0, concluidos: 0, faltas: 0, cancelados: 0, remarcados: 0, tempoTotal: 0, atendimentos: 0, retornos: 0, pacientesSet: new Set() };
      const m = map[key];
      m.total++;
      m.pacientesSet.add(a.pacienteId);
      if (a.status === 'concluido') m.concluidos++;
      if (a.status === 'falta') m.faltas++;
      if (a.status === 'cancelado') m.cancelados++;
      if (a.status === 'remarcado') m.remarcados++;
      if (a.tipo === 'Retorno') m.retornos++;
      if (!m.unidade && un?.nome) m.unidade = un.nome;
    });
    filteredAtendimentos.forEach(at => {
      const un = unidades.find(u => u.id === at.unidade_id);
      const func = funcionarios.find(f => f.id === at.profissional_id);
      const key = at.profissional_id || at.profissional_nome;
      if (!map[key]) map[key] = { id: at.profissional_id, nome: at.profissional_nome, role: func?.role || 'profissional', profissao: func?.profissao || '', unidade: un?.nome || '', total: 0, concluidos: 0, faltas: 0, cancelados: 0, remarcados: 0, tempoTotal: 0, atendimentos: 0, retornos: 0, pacientesSet: new Set() };
      if (at.duracao_minutos && at.duracao_minutos > 0 && at.status === 'finalizado') {
        map[key].tempoTotal += at.duracao_minutos;
        map[key].atendimentos++;
      }
      map[key].pacientesSet.add(at.paciente_id);
      if (!map[key].unidade && un?.nome) map[key].unidade = un.nome;
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
        atendimentos: d.atendimentos,
        tempoTotal: d.tempoTotal,
        pacientesAtendidos: d.pacientesSet.size,
        tempoMedio: d.atendimentos > 0 ? Math.round(d.tempoTotal / d.atendimentos) : 0,
        taxaConclusao: d.total > 0 ? Math.round((d.concluidos / d.total) * 100) : 0,
        taxaRetorno: d.total > 0 ? Math.round((d.retornos / d.total) * 100) : 0,
      })).sort((a, b) => b.total - a.total);
  }, [filtered, filteredAtendimentos, unidades, funcionarios, filterRoleProd, filterCargoProd]);

  // === CATEGORY CARDS (by profissao) ===
  const normalizarProfissao = (str: string) => {
    if (!str) return '';
    return str.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]/g, '');
  };
  const removeAccents = normalizarProfissao;

  const CATEGORIAS = [
    { key: 'medico', emoji: '👨‍⚕️', label: 'Médicos', cor: '#1B3A5C',
      termos: ['medico', 'medicina', 'doutora', 'doutor', 'clinicogeral', 'cirurgiao', 'cirurgia', 'infectologista', 'infectologia'] },
    { key: 'psicologo', emoji: '🧠', label: 'Psicólogos', cor: '#6B4C9A',
      termos: ['psicologo', 'psicologa', 'psicologia'] },
    { key: 'fonoaudiologo', emoji: '🗣️', label: 'Fonoaudiólogos', cor: '#2E8B8B',
      termos: ['fonoaudiologo', 'fonoaudiologa', 'fonoaudiologia', 'fono'] },
    { key: 'fisioterapeuta', emoji: '🦿', label: 'Fisioterapeutas', cor: '#2D7A4F',
      termos: ['fisioterapeuta', 'fisioterapia', 'fisio'] },
    { key: 'terapeuta_ocupacional', emoji: '🖐️', label: 'T. Ocupacional', cor: '#C17B1A',
      termos: ['terapeutaocupacional', 'terapiaocupacional', 'to'] },
    { key: 'nutricionista', emoji: '🥗', label: 'Nutrição', cor: '#E05A2B',
      termos: ['nutricionista', 'nutricao', 'nutri'] },
    { key: 'enfermeiro', emoji: '👩‍⚕️', label: 'Enfermagem', cor: '#B83232',
      termos: ['enfermeiro', 'enfermeira', 'enfermagem', 'tecnicoenfermagem', 'auxiliarenfermagem'] },
    { key: 'assistente_social', emoji: '👥', label: 'Serviço Social', cor: '#3A6B9A',
      termos: ['assistentesocial', 'servicosocial', 'social'] },
  ];

  const profissionalPertenceCategoria = (profissao: string, cat: typeof CATEGORIAS[0]) => {
    const norm = normalizarProfissao(profissao);
    return cat.termos.some(termo => norm.includes(termo));
  };

  const categoriaCards = useMemo(() => {
    const profMap = new Map(funcionarios.map(f => [f.id, f]));
    const counts: Record<string, { total: number; concluidos: number }> = {};

    filtered.forEach(a => {
      const func = profMap.get(a.profissionalId);
      const profissao = func?.profissao || '';
      for (const cat of CATEGORIAS) {
        if (profissionalPertenceCategoria(profissao, cat)) {
          if (!counts[cat.key]) counts[cat.key] = { total: 0, concluidos: 0 };
          counts[cat.key].total++;
          if (a.status === 'concluido') counts[cat.key].concluidos++;
          break;
        }
      }
    });

    return CATEGORIAS.map(cat => ({
      ...cat,
      total: counts[cat.key]?.total || 0,
      concluidos: counts[cat.key]?.concluidos || 0,
    }));
  }, [filtered, funcionarios]);

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
    filtered.forEach(a => {
      const un = unidades.find(u => u.id === a.unidadeId);
      const name = un?.nome || 'Desconhecida';
      if (!map[name]) map[name] = { nome: name, total: 0, concluidos: 0, faltas: 0, cancelados: 0 };
      map[name].total++;
      if (a.status === 'concluido') map[name].concluidos++;
      if (a.status === 'falta') map[name].faltas++;
      if (a.status === 'cancelado') map[name].cancelados++;
    });
    return Object.values(map).sort((a, b) => b.total - a.total);
  }, [filtered, unidades]);

  // === FALTAS REPORT ===
  const faltasReport = useMemo(() => {
    const faltaAgs = filtered.filter(a => a.status === 'falta');
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

  // === PATIENTS REPORT ===
  const pacientesReport = useMemo(() => {
    const pacIds = new Set(filtered.map(a => a.pacienteId));
    return Array.from(pacIds).map(pid => {
      const pac = pacientes.find(p => p.id === pid);
      const ags = filtered.filter(a => a.pacienteId === pid);
      const concluidos = ags.filter(a => a.status === 'concluido').length;
      const faltas = ags.filter(a => a.status === 'falta').length;
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
      const tec = funcionarios.find(f => f.id === t.tecnico_id);
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
    filtered.forEach(a => {
      if (!map[a.data]) map[a.data] = { data: a.data, agendamentos: 0, concluidos: 0, faltas: 0 };
      map[a.data].agendamentos++;
      if (a.status === 'concluido') map[a.data].concluidos++;
      if (a.status === 'falta') map[a.data].faltas++;
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

  // === TIMELINE GROUPED (dia/semana/mês) ===
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
        key = a.data.substring(0, 7); // YYYY-MM
      }
      if (!map[key]) {
        const label = timelineGroup === 'mes'
          ? d.toLocaleDateString('pt-BR', { month: 'short', year: '2-digit' })
          : timelineGroup === 'semana'
          ? `Sem ${key.substring(5)}`
          : key.substring(5);
        map[key] = { label, concluidos: 0, faltas: 0, cancelados: 0 };
      }
      if (a.status === 'concluido') map[key].concluidos++;
      if (a.status === 'falta') map[key].faltas++;
      if (a.status === 'cancelado') map[key].cancelados++;
    });
    return Object.entries(map).sort(([a], [b]) => a.localeCompare(b)).map(([, v]) => v).slice(-30);
  }, [filtered, timelineGroup]);

  // === PEAK HOURS ===
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

  // === NOVOS VS RETORNO ===
  const novosVsRetorno = useMemo(() => {
    const retornos = filtered.filter(a => a.tipo === 'Retorno').length;
    const novos = filtered.length - retornos;
    return [
      { name: 'Novos', value: novos },
      { name: 'Retorno', value: retornos },
    ].filter(d => d.value > 0);
  }, [filtered]);

  // === FALTAS POR UNIDADE (pie) ===
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

  // === EVOLUÇÃO MENSAL PRODUTIVIDADE ===
  const evolucaoMensal = useMemo(() => {
    const meses = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];
    const map: Record<string, number> = {};
    filtered.filter(a => a.status === 'concluido').forEach(a => {
      const key = a.data.substring(0, 7);
      map[key] = (map[key] || 0) + 1;
    });
    return Object.entries(map).sort(([a], [b]) => a.localeCompare(b)).map(([key, total]) => {
      const [, m] = key.split('-');
      return { mes: meses[parseInt(m) - 1] || key, total };
    });
  }, [filtered]);

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
      const prof = funcionarios.find(f => f.id === c.professional_id);
      const nome = prof?.nome || 'Desconhecido';
      if (!byProf[c.professional_id]) byProf[c.professional_id] = { nome, ativos: 0, finalizados: 0, sessoes: 0 };
      if (c.status === 'em_andamento') byProf[c.professional_id].ativos++;
      if (c.status === 'finalizado_alta') byProf[c.professional_id].finalizados++;
      byProf[c.professional_id].sessoes += c.sessions_done;
    });

    // By unit
    const byUnit: Record<string, { nome: string; total: number; ativos: number }> = {};
    filteredCycles.forEach(c => {
      const un = unidades.find(u => u.id === c.unit_id);
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
        const un = unidades.find(u => u.id === a.unidadeId);
        const at = filteredAtendimentos.find(at => at.agendamento_id === a.id);
        return [a.data, a.hora, a.pacienteNome, a.profissionalNome, un?.nome || '', a.tipo, a.tipo, statusLabels[a.status] || a.status, a.origem, at?.hora_inicio || '', at?.hora_fim || '', at?.duracao_minutos?.toString() || ''];
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
    } else if (type === 'fila') {
      headers = ['Posição', 'Paciente', 'Unidade', 'Setor', 'Prioridade', 'Status', 'Hora Chegada', 'Hora Chamada'];
      rows = filaReport.items.map(f => {
        const un = unidades.find(u => u.id === f.unidade_id);
        return [f.posicao.toString(), f.paciente_nome, un?.nome || '', f.setor, f.prioridade, f.status, f.hora_chegada, f.hora_chamada || ''];
      });
    }

    const csv = [headers, ...rows].map(r => r.map(c => `"${c}"`).join(';')).join('\n');
    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = filename; a.click();
    URL.revokeObjectURL(url);
  }, [filtered, porProfissional, faltasReport, pacientesReport, filaReport, unidades, filteredAtendimentos]);

  // === EXPORT EXCEL (XML Spreadsheet) ===
  const exportExcel = useCallback((type: string) => {
    let headers: string[] = [];
    let rows: string[][] = [];

    if (type === 'agendamentos' || type === 'geral' || type === 'detalhado') {
      headers = ['Data', 'Hora', 'Paciente', 'Profissional', 'Unidade', 'Tipo', 'Status', 'Origem'];
      rows = filtered.map(a => {
        const un = unidades.find(u => u.id === a.unidadeId);
        return [a.data, a.hora, a.pacienteNome, a.profissionalNome, un?.nome || '', a.tipo, statusLabels[a.status] || a.status, a.origem];
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
    } else if (type === 'fila') {
      headers = ['Posição', 'Paciente', 'Unidade', 'Setor', 'Prioridade', 'Status', 'Hora Chegada'];
      rows = filaReport.items.map(f => {
        const un = unidades.find(u => u.id === f.unidade_id);
        return [f.posicao.toString(), f.paciente_nome, un?.nome || '', f.setor, f.prioridade, f.status, f.hora_chegada];
      });
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
  }, [filtered, porProfissional, faltasReport, pacientesReport, filaReport, unidades]);

  // === EXPORT PDF ===
  const exportPDF = useCallback((type: string) => {
    const un = filterUnit !== 'all' ? unidades.find(u => u.id === filterUnit)?.nome : 'Todas';
    const prof = filterProf !== 'all' ? profissionais.find(p => p.id === filterProf)?.nome : 'Todos';
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

    if (type === 'agendamentos' || type === 'geral' || type === 'detalhado') {
      const rows = filtered.map(a => {
        const unName = unidades.find(u => u.id === a.unidadeId)?.nome || '';
        const at = filteredAtendimentos.find(at => at.agendamento_id === a.id);
        return `<tr><td>${a.data}</td><td>${a.hora}</td><td>${a.pacienteNome}</td><td>${a.profissionalNome}</td><td>${unName}</td><td>${a.tipo}</td><td>${statusLabels[a.status] || a.status}</td><td>${at?.hora_inicio || '-'}</td><td>${at?.hora_fim || '-'}</td><td>${at?.duracao_minutos ? at.duracao_minutos + 'min' : '-'}</td></tr>`;
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
    } else if (type === 'fila') {
      const filaRows = filaReport.items.map(f => {
        const unName = unidades.find(u => u.id === f.unidade_id)?.nome || '';
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

    const titleMap: Record<string, string> = { geral: 'Relatório Geral', agendamentos: 'Relatório de Agendamentos', detalhado: 'Relatório Detalhado', produtividade: 'Relatório de Produtividade', faltas: 'Relatório de Faltas', pacientes: 'Relatório de Pacientes', fila: 'Relatório de Fila de Espera' };

    openPrintDocument(
      titleMap[type] || 'Relatório',
      body,
      { 'Período': periodo, 'Unidade': un || 'Todas', 'Profissional': prof || 'Todos' }
    );
  }, [filtered, porProfissional, faltasReport, pacientesReport, filaReport, stats, tempoStats, unidades, filteredAtendimentos, filterUnit, filterProf, dateFrom, dateTo, profissionais]);

  // === MAPA DE ATENDIMENTO ===
  const generateMapa = useCallback(async () => {
    if (!mapaDateFrom || !mapaDateTo) return;
    setMapaLoading(true);
    try {
      let query = supabase
        .from('agendamentos')
        .select('paciente_id, paciente_nome, profissional_id, profissional_nome, data, hora, tipo, setor_id, procedimento_sigtap, nome_procedimento')
        .eq('status', 'concluido')
        .gte('data', mapaDateFrom)
        .lte('data', mapaDateTo)
        .order('data', { ascending: true })
        .limit(2000);

      if (mapaProf !== 'all') {
        query = query.eq('profissional_id', mapaProf);
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
        .select('id, cns, telefone, cid, cpf, data_nascimento, endereco')
        .in('id', pacienteIds);

      const pacMap = new Map((pacs || []).map(p => [p.id, p]));

      // Get profissional specialties from funcionarios
      const profIds = [...new Set(agend.map(a => a.profissional_id).filter(Boolean))];
      const profMap = new Map(funcionarios.filter(f => profIds.includes(f.id)).map(f => [f.id, f]));

      const rows = agend.map((a, i) => {
        const pac = pacMap.get(a.paciente_id);
        const prof = profMap.get(a.profissional_id);
        return {
          num: i + 1,
          paciente_nome: a.paciente_nome || '',
          cns: pac?.cns || '',
          telefone: pac?.telefone || '',
          profissional_nome: a.profissional_nome || '',
          profissional_id: a.profissional_id || '',
          especialidade: prof?.profissao || prof?.setor || a.setor_id || '',
          cid: pac?.cid || '',
          tipo: a.tipo || '',
          cpf: pac?.cpf || '',
          data_nascimento: pac?.data_nascimento || '',
          endereco: pac?.endereco || '',
          procedimento_sigtap: (a as any).procedimento_sigtap || '',
          nome_procedimento: (a as any).nome_procedimento || '',
        };
      });

      setMapaData(rows);
      setMapaGenerated(true);
    } catch (e) {
      console.error('Erro ao gerar mapa:', e);
    } finally {
      setMapaLoading(false);
    }
  }, [mapaDateFrom, mapaDateTo, mapaProf, funcionarios]);

  const formatDateBR = (d: string) => {
    if (!d) return '';
    const [y, m, day] = d.split('-');
    return `${day}/${m}/${y}`;
  };

  const exportMapaPDF = useCallback(() => {
    if (mapaData.length === 0) return;
    const now = new Date().toLocaleString('pt-BR');
    const periodo = `${formatDateBR(mapaDateFrom)} a ${formatDateBR(mapaDateTo)}`;
    const fmtCPF = (c: string) => { if (!c || c.length !== 11) return c || '-'; return c.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4'); };

    const tableRows = mapaData.map((r, i) => {
      const proc = r.procedimento_sigtap ? `${r.procedimento_sigtap}${r.nome_procedimento ? ' - ' + r.nome_procedimento : ''}` : '-';
      return `<tr style="${i % 2 === 1 ? 'background:#f9f9f9;' : ''}"><td style="text-align:center">${String(r.num).padStart(2, '0')}</td><td>${r.paciente_nome}</td><td>${formatDateBR(r.data_nascimento)}</td><td>${fmtCPF(r.cpf)}</td><td>${r.endereco || '-'}</td><td>${r.cns || '-'}</td><td>${r.telefone || '-'}</td><td>${r.profissional_nome}</td><td>${r.especialidade || '-'}</td><td>${proc}</td><td>${r.cid || '-'}</td></tr>`;
    }).join('');

    const body = `
      <h2>Mapa de Atendimentos Concluídos</h2>
      <table>
        <thead><tr>
          <th style="width:30px;text-align:center">Nº</th>
          <th>Paciente</th><th>Dt Nasc</th><th>CPF</th><th>Endereço</th>
          <th>CNS</th><th>Telefone</th><th>Profissional</th>
          <th>Especialidade</th><th>Proc. SIGTAP</th><th style="width:50px">CID</th>
        </tr></thead>
        <tbody>${tableRows}</tbody>
        <tfoot><tr><td colspan="11" style="text-align:right;font-weight:600;padding:8px;">Total: ${mapaData.length} atendimentos</td></tr></tfoot>
      </table>
      <div style="margin-top:20px;font-size:9px;color:#64748b;">Gerado por: ${user?.nome || ''} — ${now}</div>`;

    const printWindow = window.open('', '_blank');
    if (!printWindow) return;

    const logoSrc = '/logo-sms.jpeg';
    const logoUrl = window.location.origin + logoSrc;

    printWindow.document.write(`<!DOCTYPE html>
<html lang="pt-BR"><head><meta charset="UTF-8"><title>Mapa de Atendimentos — SMS Oriximiná</title>
<style>
  @page { size: A4 landscape; margin: 10mm; }
  * { margin:0; padding:0; box-sizing:border-box; }
  body { font-family:'Segoe UI',Arial,sans-serif; padding:16px; color:#1e293b; font-size:10px; line-height:1.4; }
  .doc-header { display:flex; align-items:center; gap:14px; padding:12px 16px; margin-bottom:12px;
    background:linear-gradient(135deg,#0c4a6e,#0369a1); border-radius:6px; color:#fff;
    -webkit-print-color-adjust:exact; print-color-adjust:exact; }
  .doc-header img { width:48px; height:48px; border-radius:8px; object-fit:cover; border:2px solid rgba(255,255,255,.3); }
  .doc-header .header-text { flex:1; }
  .doc-header h1 { font-size:13px; font-weight:700; }
  .doc-header .subtitle { font-size:10px; opacity:.85; margin-top:1px; }
  .doc-header .doc-title { font-size:11px; font-weight:700; margin-top:4px; text-transform:uppercase; }
  .doc-header .emit-date { text-align:right; font-size:8px; opacity:.75; white-space:nowrap; }
  .periodo { text-align:center; font-size:11px; color:#334155; margin-bottom:10px; font-weight:600; }
  h2 { font-size:12px; color:#0369a1; margin:10px 0 6px; padding-bottom:3px; border-bottom:2px solid #e0f2fe; }
  table { width:100%; border-collapse:collapse; margin-bottom:10px; }
  th,td { border:1px solid #e2e8f0; padding:4px 6px; text-align:left; font-size:9px; }
  th { background:#f1f5f9; font-weight:600; color:#334155; -webkit-print-color-adjust:exact; print-color-adjust:exact; }
  tr:nth-child(even) { background:#f9f9f9; -webkit-print-color-adjust:exact; print-color-adjust:exact; }
  tfoot td { border-top:2px solid #0369a1; }
  @media print { body { padding:6px; } .no-print { display:none !important; } }
</style></head><body>
  <div class="doc-header">
    <img src="${logoUrl}" alt="Logo" />
    <div class="header-text">
      <h1>SECRETARIA MUNICIPAL DE SAÚDE DE ORIXIMINÁ</h1>
      <div class="subtitle">CENTRO ESPECIALIZADO EM REABILITAÇÃO II</div>
      <div class="doc-title">Mapa de Atendimentos Concluídos</div>
    </div>
    <div class="emit-date">Data de emissão:<br/>${now}</div>
  </div>
  <div class="periodo">Período: ${periodo}</div>
  ${body}
</body></html>`);

    printWindow.document.close();
    setTimeout(() => { printWindow.focus(); printWindow.print(); }, 400);
  }, [mapaData, mapaDateFrom, mapaDateTo, user]);

  const exportMapaCSV = useCallback(() => {
    if (mapaData.length === 0) return;
    const fmtCPF = (c: string) => { if (!c || c.length !== 11) return c || ''; return c.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4'); };
    const headers = ['Nº', 'Nome do Paciente', 'Data Nascimento', 'CPF', 'Endereço', 'CNS', 'Telefone', 'Profissional', 'Especialidade', 'Proc. SIGTAP', 'CID'];
    const rows = mapaData.map(r => [
      r.num.toString(), r.paciente_nome, formatDateBR(r.data_nascimento), fmtCPF(r.cpf),
      r.endereco || '', r.cns, r.telefone, r.profissional_nome, r.especialidade,
      r.procedimento_sigtap ? `${r.procedimento_sigtap}${r.nome_procedimento ? ' - ' + r.nome_procedimento : ''}` : '',
      r.cid,
    ]);
    const csv = [headers, ...rows].map(r => r.map(c => `"${c}"`).join(';')).join('\n');
    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `mapa-atendimentos-${mapaDateFrom}-a-${mapaDateTo}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }, [mapaData, mapaDateFrom, mapaDateTo]);

  const clearFilters = () => {
    setFilterUnit('all'); setFilterProf('all'); setFilterStatus('all'); setFilterSetor('all'); setFilterTipo('all'); setDateFrom(''); setDateTo('');
  };

  return (
    <div className="space-y-5 animate-fade-in">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold font-display text-foreground flex items-center gap-2">
            <BarChart3 className="w-6 h-6 text-primary" /> Relatórios
          </h1>
          <p className="text-muted-foreground text-sm">{filtered.length} agendamentos · {tempoStats.totalAtendimentos} atendimentos realizados</p>
        </div>
        <div className="flex gap-2 flex-wrap">
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

      {/* Filters */}
      <Card className="shadow-card border-0">
        <CardContent className="p-4">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2"><Filter className="w-4 h-4 text-muted-foreground" /><span className="font-semibold text-foreground text-sm">Filtros</span></div>
            <Button variant="ghost" size="sm" onClick={clearFilters} className="text-xs text-muted-foreground">Limpar filtros</Button>
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
          </div>
        </CardContent>
      </Card>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 lg:grid-cols-10 gap-2">
        {[
          { label: 'Total', value: stats.total, icon: CalendarDays, color: 'text-foreground' },
          { label: 'Concluídos', value: stats.concluidos, icon: UserCheck, color: 'text-success' },
          { label: 'Pendentes', value: stats.pendentes, icon: Clock, color: 'text-warning' },
          { label: 'Faltas', value: stats.faltas, icon: AlertTriangle, color: 'text-destructive' },
          { label: 'Cancelados', value: stats.cancelados, icon: null, color: 'text-muted-foreground' },
          { label: 'Remarcados', value: stats.remarcados, icon: null, color: 'text-warning' },
          { label: 'Retornos', value: stats.retornos, icon: null, color: 'text-info' },
          { label: 'Tempo Médio', value: `${tempoStats.tempoMedio}m`, icon: Clock, color: 'text-primary' },
          { label: 'Comparecim.', value: `${stats.taxaComparecimento}%`, icon: TrendingUp, color: 'text-success' },
          { label: 'Taxa Falta', value: `${stats.taxaFalta}%`, icon: AlertTriangle, color: 'text-destructive' },
        ].map(s => (
          <Card key={s.label} className="shadow-card border-0">
            <CardContent className="p-2.5 text-center">
              <p className={`text-lg font-bold ${s.color}`}>{s.value}</p>
              <p className="text-[10px] text-muted-foreground leading-tight">{s.label}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="w-full justify-start overflow-x-auto flex-nowrap">
          <TabsTrigger value="geral" className="text-xs">Geral</TabsTrigger>
          <TabsTrigger value="produtividade" className="text-xs">Produtividade</TabsTrigger>
          <TabsTrigger value="procedimentos" className="text-xs">Procedimentos</TabsTrigger>
          <TabsTrigger value="faltas" className="text-xs">Faltas</TabsTrigger>
          <TabsTrigger value="pacientes" className="text-xs">Pacientes</TabsTrigger>
          <TabsTrigger value="fila" className="text-xs">Fila de Espera</TabsTrigger>
          <TabsTrigger value="triagem" className="text-xs">Triagem</TabsTrigger>
          <TabsTrigger value="enfermagem" className="text-xs">Enfermagem</TabsTrigger>
          <TabsTrigger value="multiprofissional" className="text-xs">Multiprofissional</TabsTrigger>
          <TabsTrigger value="pts_report" className="text-xs">PTS</TabsTrigger>
          <TabsTrigger value="tratamentos" className="text-xs">Tratamentos</TabsTrigger>
          <TabsTrigger value="detalhado" className="text-xs">Detalhado</TabsTrigger>
          <TabsTrigger value="mapa" className="text-xs"><MapPin className="w-3 h-3 mr-1" />Mapa Atendimento</TabsTrigger>
        </TabsList>

        {/* === GERAL === */}
        <TabsContent value="geral" className="space-y-5 mt-4">
          {/* Gráfico 1 — Timeline com agrupamento */}
          <Card className="shadow-card border-0">
            <CardContent className="p-5">
              <div className="flex items-center justify-between mb-4">
                <h3 className="font-semibold font-display text-foreground">Atendimentos por Período</h3>
                <div className="flex gap-1">
                  {(['dia', 'semana', 'mes'] as const).map(g => (
                    <Button key={g} size="sm" variant={timelineGroup === g ? 'default' : 'outline'} className={timelineGroup === g ? 'gradient-primary text-primary-foreground h-7 text-xs' : 'h-7 text-xs'} onClick={() => setTimelineGroup(g)}>
                      {g === 'dia' ? 'Dia' : g === 'semana' ? 'Semana' : 'Mês'}
                    </Button>
                  ))}
                </div>
              </div>
              {timelineGrouped.length > 0 ? (
                <ResponsiveContainer width="100%" height={260}>
                  <LineChart data={timelineGrouped}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(214,20%,90%)" />
                    <XAxis dataKey="label" tick={{ fontSize: 10 }} />
                    <YAxis tick={{ fontSize: 10 }} />
                    <Tooltip />
                    <Legend />
                    <Line type="monotone" dataKey="concluidos" name="Concluídos" stroke="hsl(152,60%,42%)" strokeWidth={2} dot={{ r: 3 }} />
                    <Line type="monotone" dataKey="faltas" name="Faltas" stroke="hsl(0,72%,51%)" strokeWidth={2} dot={{ r: 3 }} />
                    <Line type="monotone" dataKey="cancelados" name="Cancelados" stroke="hsl(200,18%,46%)" strokeWidth={2} dot={{ r: 3 }} />
                  </LineChart>
                </ResponsiveContainer>
              ) : (
                <p className="text-center text-muted-foreground py-12">Nenhum dado encontrado para o período selecionado</p>
              )}
            </CardContent>
          </Card>

          {/* Gráficos 2 e 3 — Pico + Novos vs Retorno */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
            <Card className="shadow-card border-0">
              <CardContent className="p-5">
                <h3 className="font-semibold font-display text-foreground mb-4">Horários de Pico</h3>
                {peakHoursData.some(d => d.total > 0) ? (
                  <ResponsiveContainer width="100%" height={280}>
                    <BarChart data={peakHoursData}>
                      <CartesianGrid strokeDasharray="3 3" stroke="hsl(214,20%,90%)" />
                      <XAxis dataKey="hora" tick={{ fontSize: 10 }} />
                      <YAxis tick={{ fontSize: 10 }} />
                      <Tooltip />
                      <Bar dataKey="total" name="Agendamentos" fill="hsl(199,89%,38%)" radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                ) : (
                  <p className="text-center text-muted-foreground py-12">Nenhum dado encontrado para o período selecionado</p>
                )}
              </CardContent>
            </Card>

            <Card className="shadow-card border-0">
              <CardContent className="p-5">
                <h3 className="font-semibold font-display text-foreground mb-4">Novos vs Retorno</h3>
                {novosVsRetorno.length > 0 ? (
                  <ResponsiveContainer width="100%" height={280}>
                    <PieChart>
                      <Pie data={novosVsRetorno} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={100} label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`} labelLine={false}>
                        <Cell fill="hsl(199,89%,38%)" />
                        <Cell fill="hsl(152,60%,42%)" />
                      </Pie>
                      <Tooltip />
                      <Legend />
                    </PieChart>
                  </ResponsiveContainer>
                ) : (
                  <p className="text-center text-muted-foreground py-12">Nenhum dado encontrado para o período selecionado</p>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Existing charts */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
            <Card className="shadow-card border-0">
              <CardContent className="p-5">
                <h3 className="font-semibold font-display text-foreground mb-4">Agendamentos por Profissional</h3>
                <ResponsiveContainer width="100%" height={Math.max(200, porProfissional.length * 40)}>
                  <BarChart data={porProfissional} layout="vertical">
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(214,20%,90%)" />
                    <XAxis type="number" tick={{ fontSize: 10 }} />
                    <YAxis dataKey="nome" type="category" width={120} tick={{ fontSize: 11 }} />
                    <Tooltip />
                    <Bar dataKey="concluidos" name="Concluídos" stackId="a" fill="hsl(152,60%,42%)" />
                    <Bar dataKey="faltas" name="Faltas" stackId="a" fill="hsl(0,72%,51%)" />
                    <Bar dataKey="cancelados" name="Cancelados" stackId="a" fill="hsl(200,18%,46%)" />
                    <Legend />
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>

            <Card className="shadow-card border-0">
              <CardContent className="p-5">
                <h3 className="font-semibold font-display text-foreground mb-4">Distribuição por Status</h3>
                <ResponsiveContainer width="100%" height={280}>
                  <PieChart>
                    <Pie data={statusData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={100} label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`} labelLine={false}>
                      {statusData.map((entry, i) => <Cell key={`status-${entry.name}`} fill={COLORS[i % COLORS.length]} />)}
                    </Pie>
                    <Tooltip />
                  </PieChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>

            {porUnidade.length > 1 && (
              <Card className="shadow-card border-0">
                <CardContent className="p-5">
                  <h3 className="font-semibold font-display text-foreground mb-4">Por Unidade</h3>
                  <ResponsiveContainer width="100%" height={220}>
                    <BarChart data={porUnidade}>
                      <CartesianGrid strokeDasharray="3 3" stroke="hsl(214,20%,90%)" />
                      <XAxis dataKey="nome" tick={{ fontSize: 10 }} />
                      <YAxis tick={{ fontSize: 10 }} />
                      <Tooltip />
                      <Legend />
                      <Bar dataKey="concluidos" name="Concluídos" stackId="a" fill="hsl(152,60%,42%)" />
                      <Bar dataKey="faltas" name="Faltas" stackId="a" fill="hsl(0,72%,51%)" />
                      <Bar dataKey="cancelados" name="Cancelados" stackId="a" fill="hsl(200,18%,46%)" />
                    </BarChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>
            )}

            <Card className="shadow-card border-0">
              <CardContent className="p-5">
                <h3 className="font-semibold font-display text-foreground mb-4">Origem dos Agendamentos</h3>
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
          <div className="flex gap-3 overflow-x-auto pb-2">
            {categoriaCards.map(c => {
              const taxa = c.total > 0 ? Math.round((c.concluidos / c.total) * 100) : 0;
              const isActive = filterCargoProd === c.key;
              return (
                <div
                  key={c.key}
                  className={`min-w-[180px] flex-shrink-0 rounded-xl border bg-card cursor-pointer transition-all hover:shadow-md ${isActive ? 'ring-2 shadow-md' : ''}`}
                  style={{
                    borderLeftWidth: '4px',
                    borderLeftColor: c.cor,
                    borderColor: isActive ? c.cor : undefined,
                    backgroundColor: isActive ? c.cor + '08' : undefined,
                  }}
                  onClick={() => setFilterCargoProd(isActive ? 'all' : c.key)}
                >
                  <div className="p-3">
                    <div className="flex items-center gap-2 mb-2">
                      <span className="text-lg">{c.emoji}</span>
                      <span className="text-xs font-semibold text-muted-foreground">{c.label}</span>
                    </div>
                    <div className="flex items-baseline gap-4">
                      <div>
                        <p className="text-xl font-bold" style={{ color: '#1B3A5C' }}>{c.total}</p>
                        <p className="text-[10px] text-muted-foreground">Total</p>
                      </div>
                      <div>
                        <p className="text-xl font-bold" style={{ color: '#2D7A4F' }}>{c.concluidos}</p>
                        <p className="text-[10px] text-muted-foreground">Concluídos</p>
                      </div>
                    </div>
                    <div className="mt-2">
                      <div className="h-1.5 w-full rounded-full bg-muted overflow-hidden">
                        <div className="h-full rounded-full transition-all" style={{ width: `${taxa}%`, backgroundColor: c.cor }} />
                      </div>
                      <p className="text-[10px] text-muted-foreground mt-0.5 text-right">{taxa}%</p>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          <Card className="shadow-card border-0">
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
                  <Button variant="ghost" size="sm" onClick={() => exportPDF('produtividade')}><FileText className="w-3 h-3 mr-1" />PDF</Button>
                  <Button variant="ghost" size="sm" onClick={() => {
                    const now = new Date().toLocaleString('pt-BR');
                    const periodo = `${dateFrom || 'Início'} a ${dateTo || 'Atual'}`;
                    const prodRows = porProfissional.map(p => {
                      const roleLabel = p.role === 'master' ? 'Master' : p.role === 'coordenador' ? 'Coordenador' : 'Profissional';
                      const taxaBadge = p.taxaConclusao >= 70 ? '🟢' : p.taxaConclusao >= 40 ? '🟡' : '🔴';
                      return `<tr><td>${p.nome}</td><td>${roleLabel}</td><td>${p.unidade}</td><td style="text-align:center">${p.total}</td><td style="text-align:center">${p.concluidos}</td><td style="text-align:center">${p.faltas}</td><td style="text-align:center">${p.cancelados}</td><td style="text-align:center">${p.remarcados}</td><td style="text-align:center">${p.retornos}</td><td style="text-align:center">${p.tempoMedio ? p.tempoMedio + 'min' : '-'}</td><td style="text-align:center">${taxaBadge} ${p.taxaConclusao}%</td><td style="text-align:center">${p.taxaRetorno}%</td></tr>`;
                    }).join('');
                    const totalRow = `<tr style="font-weight:700;background:#f1f5f9;"><td colspan="3">TOTAL</td><td style="text-align:center">${prodTotals.total}</td><td style="text-align:center">${prodTotals.concluidos}</td><td style="text-align:center">${prodTotals.faltas}</td><td style="text-align:center">${prodTotals.cancelados}</td><td style="text-align:center">${prodTotals.remarcados}</td><td style="text-align:center">${prodTotals.retornos}</td><td></td><td></td><td></td></tr>`;
                    const printWindow = window.open('', '_blank');
                    if (!printWindow) return;
                    const logoUrl = window.location.origin + '/logo-sms.jpeg';
                    printWindow.document.write(`<!DOCTYPE html><html lang="pt-BR"><head><meta charset="UTF-8"><title>Relatório de Produtividade</title>
<style>@page{size:A4 landscape;margin:10mm;}*{margin:0;padding:0;box-sizing:border-box;}body{font-family:Georgia,serif;padding:16px;color:#1e293b;font-size:10px;}
.header{display:flex;align-items:center;gap:14px;padding:12px 16px;margin-bottom:12px;border-bottom:2px solid #333;}
.header img{width:48px;height:48px;}
.header h1{font-size:13px;font-weight:700;}
.header .sub{font-size:10px;color:#555;margin-top:1px;}
.periodo{text-align:center;font-size:11px;margin-bottom:10px;font-weight:600;}
table{width:100%;border-collapse:collapse;margin-bottom:10px;}
th,td{border:1px solid #ccc;padding:4px 6px;text-align:left;font-size:9px;}
th{background:#f1f5f9;font-weight:600;}
@media print{body{padding:6px;}.no-print{display:none!important;}}</style></head><body>
<div class="header"><img src="${logoUrl}" alt="Logo"/><div><h1>SECRETARIA MUNICIPAL DE SAÚDE DE ORIXIMINÁ</h1><div class="sub">CENTRO ESPECIALIZADO EM REABILITAÇÃO II</div><div style="font-weight:700;margin-top:4px;text-transform:uppercase;">Relatório de Produtividade por Profissional</div></div><div style="margin-left:auto;font-size:8px;text-align:right;">Data: ${now}<br/>Período: ${periodo}</div></div>
<table><thead><tr><th>Profissional</th><th>Perfil</th><th>Unidade</th><th>Total</th><th>Concluídos</th><th>Faltas</th><th>Cancelados</th><th>Remarcados</th><th>Retornos</th><th>Tempo Médio</th><th>Taxa Conclusão</th><th>Taxa Retorno</th></tr></thead><tbody>${prodRows}${totalRow}</tbody></table>
</body></html>`);
                    printWindow.document.close();
                    setTimeout(() => { printWindow.focus(); printWindow.print(); }, 400);
                  }}><Printer className="w-3 h-3 mr-1" />Imprimir</Button>
                </div>
              </div>

              {prodViewMode === 'tabela' ? (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b bg-muted/50">
                        <th className="text-left py-2.5 px-3 text-muted-foreground font-medium">Profissional</th>
                        <th className="text-center py-2.5 px-2 text-muted-foreground font-medium">Total</th>
                        <th className="text-center py-2.5 px-2 text-muted-foreground font-medium">Concluídos</th>
                        <th className="text-center py-2.5 px-2 text-muted-foreground font-medium">Faltas</th>
                        <th className="text-center py-2.5 px-2 text-muted-foreground font-medium">Cancelados</th>
                        <th className="text-center py-2.5 px-2 text-muted-foreground font-medium">Remarcados</th>
                        <th className="text-center py-2.5 px-2 text-muted-foreground font-medium">Retornos</th>
                        <th className="text-center py-2.5 px-2 text-muted-foreground font-medium">Tempo Médio</th>
                        <th className="text-center py-2.5 px-2 text-muted-foreground font-medium">Taxa Conclusão</th>
                        <th className="text-center py-2.5 px-2 text-muted-foreground font-medium">Taxa Retorno</th>
                      </tr>
                    </thead>
                    <tbody>
                      {porProfissional.map(p => {
                        const catMatch = CATEGORIAS.find(cat => profissionalPertenceCategoria(p.profissao, cat));
                        const catBadge = catMatch
                          ? { label: catMatch.label, cor: catMatch.cor }
                          : { label: 'Outros', cor: '#888' };
                        const taxaConcBg = p.taxaConclusao >= 70 ? 'bg-success/10 text-success border-success/30' : p.taxaConclusao >= 40 ? 'bg-warning/10 text-warning border-warning/30' : 'bg-destructive/10 text-destructive border-destructive/30';
                        const taxaRetBg = p.taxaRetorno > 30 ? 'bg-info/10 text-info border-info/30' : '';
                        return (
                          <tr key={p.id || p.nome} className="border-b last:border-0 hover:bg-muted/30">
                            <td className="py-2.5 px-3 text-foreground font-medium">
                              <div className="flex items-center gap-2">
                                {p.nome}
                                <span className="text-[10px] px-1.5 py-0.5 rounded-full font-medium text-white" style={{ backgroundColor: catBadge.cor }}>{catBadge.label}</span>
                              </div>
                            </td>
                            <td className="py-2.5 px-2 text-center font-semibold">{p.total}</td>
                            <td className="py-2.5 px-2 text-center text-success font-medium">{p.concluidos}</td>
                            <td className="py-2.5 px-2 text-center text-destructive">{p.faltas}</td>
                            <td className="py-2.5 px-2 text-center text-muted-foreground">{p.cancelados}</td>
                            <td className="py-2.5 px-2 text-center text-warning">{p.remarcados}</td>
                            <td className="py-2.5 px-2 text-center text-info">{p.retornos}</td>
                            <td className="py-2.5 px-2 text-center text-primary font-medium">{p.tempoMedio ? `${p.tempoMedio}min` : '-'}</td>
                            <td className="py-2.5 px-2 text-center">
                              <span className={`text-xs px-2 py-0.5 rounded-full border ${taxaConcBg}`}>{p.taxaConclusao}%</span>
                            </td>
                            <td className="py-2.5 px-2 text-center">
                              <span className={`text-xs px-2 py-0.5 rounded-full border ${taxaRetBg || 'text-muted-foreground'}`}>{p.taxaRetorno}%</span>
                            </td>
                          </tr>
                        );
                      })}
                      {porProfissional.length === 0 && <tr><td colSpan={10} className="text-center py-8 text-muted-foreground">Nenhum dado encontrado para o período selecionado</td></tr>}
                    </tbody>
                    {porProfissional.length > 0 && (() => {
                      const taxaConcGeral = prodTotals.total > 0 ? Math.round((prodTotals.concluidos / prodTotals.total) * 100) : 0;
                      const taxaRetGeral = prodTotals.total > 0 ? Math.round((prodTotals.retornos / prodTotals.total) * 100) : 0;
                      const taxaConcBgG = taxaConcGeral >= 70 ? 'bg-success/10 text-success border-success/30' : taxaConcGeral >= 40 ? 'bg-warning/10 text-warning border-warning/30' : 'bg-destructive/10 text-destructive border-destructive/30';
                      return (
                        <tfoot>
                          <tr style={{ background: '#F4F6FA', borderTop: '2px solid #1B3A5C' }} className="font-bold">
                            <td className="py-2.5 px-3 text-foreground">TOTAL GERAL</td>
                            <td className="py-2.5 px-2 text-center">{prodTotals.total}</td>
                            <td className="py-2.5 px-2 text-center text-success">{prodTotals.concluidos}</td>
                            <td className="py-2.5 px-2 text-center text-destructive">{prodTotals.faltas}</td>
                            <td className="py-2.5 px-2 text-center text-muted-foreground">{prodTotals.cancelados}</td>
                            <td className="py-2.5 px-2 text-center text-warning">{prodTotals.remarcados}</td>
                            <td className="py-2.5 px-2 text-center text-info">{prodTotals.retornos}</td>
                            <td className="py-2.5 px-2 text-center">-</td>
                            <td className="py-2.5 px-2 text-center">
                              <span className={`text-xs px-2 py-0.5 rounded-full border ${taxaConcBgG}`}>{taxaConcGeral}%</span>
                            </td>
                            <td className="py-2.5 px-2 text-center">
                              <span className="text-xs px-2 py-0.5 rounded-full border text-muted-foreground">{taxaRetGeral}%</span>
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
          <Card className="shadow-card border-0">
            <CardContent className="p-5">
              <h3 className="font-semibold font-display text-foreground mb-4">Evolução Mensal</h3>
              {evolucaoMensal.length > 0 ? (
                <ResponsiveContainer width="100%" height={300}>
                  <AreaChart data={evolucaoMensal}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(214,20%,90%)" />
                    <XAxis dataKey="mes" tick={{ fontSize: 10 }} />
                    <YAxis tick={{ fontSize: 10 }} />
                    <Tooltip />
                    <Area type="monotone" dataKey="total" name="Atendimentos" stroke="hsl(199,89%,38%)" fill="hsl(199,89%,38%)" fillOpacity={0.2} strokeWidth={2} dot={{ r: 4, fill: 'hsl(199,89%,38%)' }} />
                  </AreaChart>
                </ResponsiveContainer>
              ) : (
                <p className="text-center text-muted-foreground py-12">Nenhum dado encontrado para o período selecionado</p>
              )}
            </CardContent>
          </Card>
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
                  <Button variant="ghost" size="sm" onClick={() => exportPDF('faltas')}><FileText className="w-3 h-3 mr-1" />PDF</Button>
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
                  <Button variant="ghost" size="sm" onClick={() => exportPDF('pacientes')}><FileText className="w-3 h-3 mr-1" />PDF</Button>
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
                <h3 className="font-semibold font-display text-foreground">Agendamentos Detalhados ({filtered.length})</h3>
                <div className="flex gap-2">
                  <Button variant="ghost" size="sm" onClick={() => exportCSV('agendamentos')}><Download className="w-3 h-3 mr-1" />CSV</Button>
                  <Button variant="ghost" size="sm" onClick={() => exportPDF('geral')}><FileText className="w-3 h-3 mr-1" />PDF</Button>
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
                    {filtered.slice(0, 200).map(a => {
                      const un = unidades.find(u => u.id === a.unidadeId);
                      const at = atendimentosDB.find(at => at.agendamento_id === a.id);
                      return (
                        <tr key={a.id} className="border-b last:border-0 hover:bg-muted/30">
                          <td className="py-2 px-2 text-foreground">{a.data}</td>
                          <td className="py-2 px-2 text-foreground">{a.hora}</td>
                          <td className="py-2 px-3 text-foreground font-medium">{resolvePaciente(a.pacienteId, a.pacienteNome)}</td>
                          <td className="py-2 px-2 text-muted-foreground">{a.profissionalNome}</td>
                          <td className="py-2 px-2 text-muted-foreground text-xs">{un?.nome || ''}</td>
                          <td className="py-2 px-2"><Badge variant="outline" className="text-xs">{a.tipo}</Badge></td>
                          <td className="py-2 px-2"><Badge variant={a.status === 'concluido' ? 'default' : a.status === 'falta' ? 'destructive' : 'secondary'} className="text-xs">{statusLabels[a.status] || a.status}</Badge></td>
                          <td className="py-2 px-2 text-xs text-muted-foreground">{a.origem}</td>
                          <td className="py-2 px-2 text-xs text-muted-foreground">{at?.hora_inicio || '-'}</td>
                          <td className="py-2 px-2 text-xs text-muted-foreground">{at?.hora_fim || '-'}</td>
                          <td className="py-2 px-2 text-center text-primary font-medium">{at?.duracao_minutos ? `${at.duracao_minutos}min` : '-'}</td>
                        </tr>
                      );
                    })}
                    {filtered.length === 0 && <tr><td colSpan={11} className="text-center py-8 text-muted-foreground">Nenhum agendamento encontrado</td></tr>}
                  </tbody>
                </table>
                {filtered.length > 200 && <p className="text-xs text-muted-foreground text-center mt-2">Mostrando 200 de {filtered.length} — exporte para ver todos</p>}
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
                  <Input type="date" value={mapaDateFrom} onChange={e => { setMapaDateFrom(e.target.value); setMapaGenerated(false); }} className="h-9 w-44" />
                </div>
                <div>
                  <Label className="text-xs">Data Final *</Label>
                  <Input type="date" value={mapaDateTo} onChange={e => { setMapaDateTo(e.target.value); setMapaGenerated(false); }} className="h-9 w-44" />
                </div>
                <div>
                  <Label className="text-xs">Profissional</Label>
                  <Select value={mapaProf} onValueChange={v => { setMapaProf(v); setMapaGenerated(false); }}>
                    <SelectTrigger className="h-9 w-48"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Todos</SelectItem>
                      {profissionais.map(p => <SelectItem key={p.id} value={p.id}>{p.nome}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <Button onClick={generateMapa} disabled={!mapaDateFrom || !mapaDateTo || mapaLoading} className="gradient-primary text-primary-foreground h-9">
                  <Search className="w-4 h-4 mr-1" />{mapaLoading ? 'Gerando...' : 'Gerar Relatório'}
                </Button>
                <Button variant="outline" size="sm" onClick={exportMapaPDF} disabled={!mapaGenerated || mapaData.length === 0} className="h-9">
                  <FileText className="w-4 h-4 mr-1" />PDF
                </Button>
                <Button variant="outline" size="sm" onClick={exportMapaCSV} disabled={!mapaGenerated || mapaData.length === 0} className="h-9">
                  <Download className="w-4 h-4 mr-1" />CSV
                </Button>
                <Button variant="outline" size="sm" disabled={!mapaGenerated || mapaData.length === 0} className="h-9" onClick={() => {
                  const now = new Date().toLocaleString('pt-BR');
                  const periodo = `${formatDateBR(mapaDateFrom)} a ${formatDateBR(mapaDateTo)}`;
                  const formatCPF = (c: string) => { if (!c || c.length !== 11) return c || '-'; return c.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4'); };
                  const tableRows = mapaData.map((r, i) => {
                    const proc = r.procedimento_sigtap ? `${r.procedimento_sigtap}${r.nome_procedimento ? ' - ' + r.nome_procedimento : ''}` : '-';
                    return `<tr style="${i % 2 === 1 ? 'background:#f9f9f9;' : ''}"><td style="text-align:center">${String(r.num).padStart(2, '0')}</td><td>${r.paciente_nome}</td><td>${formatDateBR(r.data_nascimento)}</td><td>${formatCPF(r.cpf)}</td><td>${r.endereco || '-'}</td><td>${r.cns || '-'}</td><td>${r.telefone || '-'}</td><td>${r.profissional_nome}</td><td>${r.especialidade || '-'}</td><td>${proc}</td><td>${r.cid || '-'}</td></tr>`;
                  }).join('');
                  const printWindow = window.open('', '_blank');
                  if (!printWindow) return;
                  const logoUrl = window.location.origin + '/logo-sms.jpeg';
                  printWindow.document.write(`<!DOCTYPE html><html lang="pt-BR"><head><meta charset="UTF-8"><title>Mapa de Atendimentos</title>
<style>@page{size:A4 landscape;margin:10mm;}*{margin:0;padding:0;box-sizing:border-box;}body{font-family:Georgia,serif;padding:16px;color:#1e293b;font-size:10px;}
.header{display:flex;align-items:center;gap:14px;padding:12px 16px;margin-bottom:12px;border-bottom:2px solid #333;}
.header img{width:48px;height:48px;}
.header h1{font-size:13px;font-weight:700;}
.header .sub{font-size:10px;color:#555;margin-top:1px;}
.periodo{text-align:center;font-size:11px;margin-bottom:10px;font-weight:600;}
table{width:100%;border-collapse:collapse;margin-bottom:10px;}
th,td{border:1px solid #ccc;padding:4px 6px;text-align:left;font-size:8px;}
th{background:#f1f5f9;font-weight:600;}
@media print{body{padding:6px;}.no-print{display:none!important;}}</style></head><body>
<div class="header"><img src="${logoUrl}" alt="Logo"/><div><h1>SECRETARIA MUNICIPAL DE SAÚDE DE ORIXIMINÁ</h1><div class="sub">CENTRO ESPECIALIZADO EM REABILITAÇÃO II</div><div style="font-weight:700;margin-top:4px;text-transform:uppercase;">Mapa de Atendimentos Concluídos</div></div><div style="margin-left:auto;font-size:8px;text-align:right;">Data: ${now}<br/>Período: ${periodo}</div></div>
<table><thead><tr><th style="width:30px;text-align:center">Nº</th><th>Paciente</th><th>Dt Nasc</th><th>CPF</th><th>Endereço</th><th>CNS</th><th>Telefone</th><th>Profissional</th><th>Especialidade</th><th>Proc. SIGTAP</th><th>CID</th></tr></thead><tbody>${tableRows}</tbody>
<tfoot><tr><td colspan="11" style="text-align:right;font-weight:600;padding:8px;">Total: ${mapaData.length} atendimentos</td></tr></tfoot></table>
</body></html>`);
                  printWindow.document.close();
                  setTimeout(() => { printWindow.focus(); printWindow.print(); }, 400);
                }}>
                  <Printer className="w-4 h-4 mr-1" />Imprimir
                </Button>
              </div>

              {mapaGenerated && mapaData.length === 0 && (
                <p className="text-center text-muted-foreground py-8">Nenhum atendimento concluído encontrado no período selecionado.</p>
              )}

              {mapaGenerated && mapaData.length > 0 && (
                <div className="overflow-x-auto">
                  <p className="text-xs text-muted-foreground mb-2">Período: {formatDateBR(mapaDateFrom)} a {formatDateBR(mapaDateTo)} — {mapaData.length} atendimentos</p>
                  <table className="w-full text-xs border-collapse">
                    <thead>
                      <tr className="bg-muted/60">
                        <th className="border border-border px-2 py-1.5 text-center w-8">Nº</th>
                        <th className="border border-border px-2 py-1.5 text-center w-10">Foto</th>
                        <th className="border border-border px-2 py-1.5 text-left">Nome do Paciente</th>
                        <th className="border border-border px-2 py-1.5 text-left w-24">Dt Nascimento</th>
                        <th className="border border-border px-2 py-1.5 text-left w-28">CPF</th>
                        <th className="border border-border px-2 py-1.5 text-left">Endereço</th>
                        <th className="border border-border px-2 py-1.5 text-left">CNS</th>
                        <th className="border border-border px-2 py-1.5 text-left">Telefone</th>
                        <th className="border border-border px-2 py-1.5 text-left">Profissional</th>
                        <th className="border border-border px-2 py-1.5 text-left">Especialidade</th>
                        <th className="border border-border px-2 py-1.5 text-left">Proc. SIGTAP</th>
                        <th className="border border-border px-2 py-1.5 text-left w-16">CID</th>
                      </tr>
                    </thead>
                    <tbody>
                      {mapaData.map((r, i) => {
                        const initials = r.profissional_nome.split(' ').filter(Boolean).map(w => w[0]).join('').substring(0, 2).toUpperCase();
                        const hashColor = `hsl(${[...r.profissional_nome].reduce((a, c) => a + c.charCodeAt(0), 0) % 360}, 55%, 50%)`;
                        const formatCPF = (c: string) => { if (!c || c.length !== 11) return c || '-'; return c.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4'); };
                        const procSigtap = r.procedimento_sigtap ? `${r.procedimento_sigtap}${r.nome_procedimento ? ' - ' + r.nome_procedimento : ''}` : '-';
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
                            <td className="border border-border px-2 py-1">{formatDateBR(r.data_nascimento)}</td>
                            <td className="border border-border px-2 py-1">{formatCPF(r.cpf)}</td>
                            <td className="border border-border px-2 py-1">{r.endereco || '-'}</td>
                            <td className="border border-border px-2 py-1">{r.cns || '-'}</td>
                            <td className="border border-border px-2 py-1">{r.telefone || '-'}</td>
                            <td className="border border-border px-2 py-1">{r.profissional_nome}</td>
                            <td className="border border-border px-2 py-1">{r.especialidade || '-'}</td>
                            <td className="border border-border px-2 py-1">{procSigtap}</td>
                            <td className="border border-border px-2 py-1">{r.cid || '-'}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                    <tfoot>
                      <tr className="bg-muted/60 font-semibold">
                        <td colSpan={12} className="border border-border px-2 py-1.5 text-right">Total: {mapaData.length} atendimentos</td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default Relatorios;
