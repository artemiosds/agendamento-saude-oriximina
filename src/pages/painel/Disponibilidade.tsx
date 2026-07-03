import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { useOperacional } from '@/contexts/OperacionalContext';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Plus, Clock, Calendar, Pencil, Trash2, RefreshCw, Loader2, Info, ClipboardList, Search, Settings2, User, Copy, Save, X } from 'lucide-react';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import { useUnidadeFilter } from '@/hooks/useUnidadeFilter';
import { SlotInfoBadge } from '@/components/SlotInfoBadge';
import type { TurnoDefinition } from '@/components/config/ConfigFluxoAtendimento';

const diasSemanaLabels = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
const diasSemanaFull = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'];

interface BlocoConfig {
  id?: string;
  nome: string;
  tipo: 'padrao' | 'custom';
  horaInicio: string;
  horaFim: string;
  vagas: number;
  ativo: boolean;
}

interface DiaConfig {
  diaSemana: number;
  ativo: boolean;
  blocos: BlocoConfig[];
}

interface DaySchedule {
  ativo: boolean;
  horaInicio: string;
  horaFim: string;
}

interface TurnoDayConfig {
  ativo: boolean;
  turnosAtivos: string[]; // turno ids active for this day
}

interface TurnoVagas {
  [turnoId: string]: number;
}

const defaultDaySchedules: DaySchedule[] = [
  { ativo: false, horaInicio: '08:00', horaFim: '17:00' },
  { ativo: true, horaInicio: '08:00', horaFim: '17:00' },
  { ativo: true, horaInicio: '08:00', horaFim: '17:00' },
  { ativo: true, horaInicio: '08:00', horaFim: '17:00' },
  { ativo: true, horaInicio: '08:00', horaFim: '17:00' },
  { ativo: true, horaInicio: '08:00', horaFim: '17:00' },
  { ativo: false, horaInicio: '08:00', horaFim: '17:00' },
];

const defaultTurnoDays: TurnoDayConfig[] = Array.from({ length: 7 }, (_, i) => ({
  ativo: i >= 1 && i <= 5,
  turnosAtivos: [],
}));

const timeToMin = (t: string) => {
  const [h, m] = t.split(':').map(Number);
  return (h || 0) * 60 + (m || 0);
};

const rangesOverlap = (a1: string, a2: string, b1: string, b2: string) => a1 <= b2 && b1 <= a2;

type ModoDisponibilidade = 'por_hora' | 'por_turno';

const CONFIG_KEY_MODOS = 'config_modos_disponibilidade';

const Disponibilidade: React.FC = () => {
  const { disponibilidades, addDisponibilidade, updateDisponibilidade, deleteDisponibilidade, funcionarios, unidades, salas, refreshFuncionarios, refreshDisponibilidades } = useOperacional();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editGroupIds, setEditGroupIds] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [manageProfId, setManageProfId] = useState<string | null>(null);

  const profissionais = funcionarios.filter(f => f.role === 'profissional' && f.ativo);
  const { unidadesVisiveis } = useUnidadeFilter();

  // Mode per professional
  const [modosPorProfissional, setModosPorProfissional] = useState<Record<string, ModoDisponibilidade>>({});
  const [turnosGlobais, setTurnosGlobais] = useState<TurnoDefinition[]>([]);
  const [configLoaded, setConfigLoaded] = useState(false);

  const [form, setForm] = useState({
    profissionalId: '', unidadeId: '', salaId: '', dataInicio: '', dataFim: '',
    vagasPorHora: 3, vagasPorDia: 25, duracaoConsulta: 30, intervalo: 0,
  });

  const [modo, setModo] = useState<ModoDisponibilidade>('por_hora');
  const [configDias, setConfigDias] = useState<DiaConfig[]>(
    Array.from({ length: 7 }, (_, i) => ({
      diaSemana: i,
      ativo: i >= 1 && i <= 5,
      blocos: []
    }))
  );
  const [turnoDays, setTurnoDays] = useState<TurnoDayConfig[]>(defaultTurnoDays.map(d => ({ ...d, turnosAtivos: [] })));
  const [turnoVagas, setTurnoVagas] = useState<TurnoVagas>({});

  const [daySchedules, setDaySchedules] = useState<DaySchedule[]>(defaultDaySchedules.map(d => ({ ...d })));
  const dayInputRefs = useRef<(HTMLInputElement | null)[]>([]);

  const todayStr = new Date().toISOString().split('T')[0];
  const isEditing = editGroupIds.length > 0;

  // Load config (modes and turnos)
  const loadConfig = useCallback(async () => {
    const { data } = await supabase.from('system_config').select('configuracoes').eq('id', 'default').maybeSingle();
    const cfg = data?.configuracoes as any;
    if (cfg?.[CONFIG_KEY_MODOS]) setModosPorProfissional(cfg[CONFIG_KEY_MODOS]);
    if (cfg?.config_fluxo_atendimento?.turnos) setTurnosGlobais(cfg.config_fluxo_atendimento.turnos);
    setConfigLoaded(true);
  }, []);

  useEffect(() => {
    refreshFuncionarios();
    refreshDisponibilidades();
    loadConfig();
  }, []);

  const saveModos = async (updated: Record<string, ModoDisponibilidade>) => {
    const { data: existing } = await supabase.from('system_config').select('configuracoes').eq('id', 'default').maybeSingle();
    const existingConfig = (existing?.configuracoes as any) || {};
    await supabase.from('system_config').upsert({
      id: 'default',
      configuracoes: { ...existingConfig, [CONFIG_KEY_MODOS]: updated },
      updated_at: new Date().toISOString(),
    });
    setModosPorProfissional(updated);
  };

  const activeTurnos = turnosGlobais.filter(t => t.ativo);

  const suggestedVagasHora = useMemo(() => {
    const totalMin = form.duracaoConsulta + form.intervalo;
    if (totalMin <= 0) return 1;
    return Math.floor(60 / totalMin) || 1;
  }, [form.duracaoConsulta, form.intervalo]);

  const activeDaysCount = modo === 'por_hora'
    ? daySchedules.filter(ds => ds.ativo).length
    : turnoDays.filter(td => td.ativo).length;

  const groups = useMemo(() => {
    const map = new Map<string, typeof disponibilidades>();
    disponibilidades.forEach(d => {
      const key = `${d.profissionalId}|${d.dataInicio}|${d.dataFim}`;
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(d);
    });
    return map;
  }, [disponibilidades]);

  // Detect if a group is turno-based (vagas_por_hora === 0 convention)
  const isGroupTurno = (records: typeof disponibilidades) => {
    return records.some(r => r.vagasPorHora === 0);
  };

  const openNew = () => {
    setEditGroupIds([]);
    setForm({ profissionalId: '', unidadeId: '', salaId: '', dataInicio: '', dataFim: '', vagasPorHora: 3, vagasPorDia: 25, duracaoConsulta: 30, intervalo: 0 });
    setDaySchedules(defaultDaySchedules.map(d => ({ ...d })));
    setModo('por_hora');
    setConfigDias(Array.from({ length: 7 }, (_, i) => ({
      diaSemana: i,
      ativo: i >= 1 && i <= 5,
      blocos: []
    })));
    setTurnoDays(defaultTurnoDays.map(d => ({ ...d, turnosAtivos: [] })));
    setTurnoVagas({});
    setDialogOpen(true);
  };

  const openEditGroup = (groupKey: string) => {
    const records = groups.get(groupKey);
    if (!records || records.length === 0) return;
    const first = records[0];
    setEditGroupIds(records.map(r => r.id));

    const profModo = modosPorProfissional[first.profissionalId] || 'por_hora';
    const isTurno = isGroupTurno(records);

    setForm({
      profissionalId: first.profissionalId, unidadeId: first.unidadeId, salaId: first.salaId || '',
      dataInicio: first.dataInicio, dataFim: first.dataFim,
      vagasPorHora: first.vagasPorHora, vagasPorDia: first.vagasPorDia,
      duracaoConsulta: first.duracaoConsulta || 30, intervalo: 0,
    });

    if (isTurno) {
      setModo('por_turno');
      // Reconstruct DiaConfig from records
      const newConfigDias: DiaConfig[] = Array.from({ length: 7 }, (_, i) => ({
        diaSemana: i,
        ativo: false,
        blocos: []
      }));

      records.forEach(r => {
        // For turno records, salaId stores the turno ID or custom name
        const turnoId = r.salaId || '';
        const turnoObj = turnosGlobais.find(t => t.id === turnoId);
        const tipo: 'padrao' | 'custom' = turnoObj ? 'padrao' : 'custom';
        
        r.diasSemana.forEach(dayNum => {
          if (dayNum >= 0 && dayNum <= 6) {
            newConfigDias[dayNum].ativo = true;
            newConfigDias[dayNum].blocos.push({
              id: r.id,
              nome: turnoObj?.nome || turnoId || 'Turno',
              tipo,
              horaInicio: r.horaInicio,
              horaFim: r.horaFim,
              vagas: r.vagasPorDia,
              ativo: true
            });
          }
        });
      });

      setConfigDias(newConfigDias);
    } else {
      setModo('por_hora');
      const newSchedules = defaultDaySchedules.map(ds => ({ ...ds, ativo: false }));
      records.forEach(r => {
        r.diasSemana.forEach(dayNum => {
          if (dayNum >= 0 && dayNum <= 6) {
            newSchedules[dayNum] = { ativo: true, horaInicio: r.horaInicio, horaFim: r.horaFim };
          }
        });
      });
      setDaySchedules(newSchedules);
    }
    setDialogOpen(true);
  };

  // Handle professional change - load saved mode
  const handleProfissionalChange = (profId: string) => {
    const prof = profissionais.find(p => p.id === profId);
    setForm(p => ({
      ...p,
      profissionalId: profId,
      unidadeId: prof?.unidadeId || p.unidadeId,
      salaId: prof?.salaId || '',
    }));
    const savedModo = modosPorProfissional[profId] || 'por_hora';
    setModo(savedModo);
  };

  const handleModoChange = async (newModo: ModoDisponibilidade) => {
    setModo(newModo);
    if (form.profissionalId) {
      const updated = { ...modosPorProfissional, [form.profissionalId]: newModo };
      await saveModos(updated);
    }
    // Initialize turno vagas with defaults
    if (newModo === 'por_turno') {
      const activeGlobalTurnos = turnosGlobais.filter(t => t.ativo);
      setConfigDias(prev => prev.map(pd => ({
        ...pd,
        blocos: pd.ativo && pd.blocos.length === 0 
          ? activeGlobalTurnos.map(t => ({
              nome: t.nome,
              tipo: 'padrao',
              horaInicio: t.horaInicio,
              horaFim: t.horaFim,
              vagas: 20,
              ativo: true
            }))
          : pd.blocos
      })));
    }
  };

  // Day validation for por_hora
  const getDayErrors = () => {
    if (modo !== 'por_hora') return {};
    const errors: Record<number, string> = {};
    daySchedules.forEach((ds, i) => {
      if (!ds.ativo) return;
      const startMin = timeToMin(ds.horaInicio);
      const endMin = timeToMin(ds.horaFim);
      if (endMin <= startMin) errors[i] = 'Hora Fim deve ser maior que Hora Início';
      else if (startMin < 360 || endMin > 1320) errors[i] = 'Horário deve estar entre 06:00 e 22:00';
    });
    return errors;
  };

  const dayErrors = getDayErrors();
  const hasDateError = form.dataInicio && form.dataFim && form.dataFim < form.dataInicio;
  const canSave = activeDaysCount > 0 && !hasDateError && Object.keys(dayErrors).length === 0 && !saving && form.profissionalId && form.unidadeId && form.dataInicio && form.dataFim;

  const checkOverlap = (): string | null => {
    for (const [key, records] of groups.entries()) {
      const first = records[0];
      if (first.profissionalId !== form.profissionalId || first.unidadeId !== form.unidadeId) continue;
      const groupIds = records.map(r => r.id);
      if (isEditing && editGroupIds.every(id => groupIds.includes(id))) continue;
      if (rangesOverlap(form.dataInicio, form.dataFim, first.dataInicio, first.dataFim)) {
        return 'Este profissional já possui disponibilidade cadastrada neste período para esta unidade.';
      }
    }
    return null;
  };

  const handleSave = async () => {
    if (!form.profissionalId || !form.unidadeId || !form.dataInicio || !form.dataFim) {
      toast.error('Preencha todos os campos obrigatórios.');
      return;
    }
    if (hasDateError) {
      toast.error('Data Fim deve ser posterior à Data Início.');
      return;
    }

    if (modo === 'por_hora') {
      const activeDays = daySchedules.map((ds, i) => ({ ...ds, dayNum: i })).filter(ds => ds.ativo);
      if (activeDays.length === 0) { toast.error('Ative pelo menos um dia da semana.'); return; }
      if (Object.keys(dayErrors).length > 0) { toast.error('Corrija os erros de horário antes de salvar.'); return; }

      for (const day of activeDays) {
        const startH = parseInt(day.horaInicio.split(':')[0]);
        const endH = parseInt(day.horaFim.split(':')[0]);
        const hoursCount = endH - startH;
        const maxPossible = hoursCount * form.vagasPorHora;
        if (form.vagasPorDia > maxPossible) {
          toast.error(`${diasSemanaFull[day.dayNum]}: Total/dia (${form.vagasPorDia}) excede máximo possível (${maxPossible}).`);
          return;
        }
      }

      const overlapMsg = checkOverlap();
      if (overlapMsg) { toast.error(overlapMsg); return; }

      setSaving(true);
      try {
        if (isEditing) { for (const id of editGroupIds) { await deleteDisponibilidade(id); } }
        for (const day of activeDays) {
          await addDisponibilidade({
            id: `d${Date.now()}_${day.dayNum}`,
            profissionalId: form.profissionalId,
            unidadeId: form.unidadeId,
            salaId: form.salaId,
            dataInicio: form.dataInicio, dataFim: form.dataFim,
            horaInicio: day.horaInicio, horaFim: day.horaFim,
            vagasPorHora: form.vagasPorHora, vagasPorDia: form.vagasPorDia,
            diasSemana: [day.dayNum],
            duracaoConsulta: form.duracaoConsulta,
          });
        }
        toast.success(isEditing ? 'Disponibilidade atualizada!' : `${activeDays.length} registro(s) criado(s)!`);
        setDialogOpen(false);
        await refreshDisponibilidades();
      } catch (err) {
        console.error('Erro ao salvar disponibilidade:', err);
        toast.error('Erro ao salvar disponibilidade.');
      } finally { setSaving(false); }
    } else {
      // Por Turno
      const activeDays = configDias.filter(d => d.ativo && d.blocos.some(b => b.ativo));
      if (activeDays.length === 0) { toast.error('Ative pelo menos um dia com turnos.'); return; }

      const overlapMsg = checkOverlap();
      if (overlapMsg) { toast.error(overlapMsg); return; }

      setSaving(true);
      try {
        if (isEditing) {
          // Rule: identified records to remain, insert new ones, delete removed ones.
          // Since we are replacing the whole group logic, we delete old and add new.
          for (const id of editGroupIds) { await deleteDisponibilidade(id); }
        }

        // Create one record per bloco-day combination
        for (const dia of activeDays) {
          for (const bloco of dia.blocos.filter(b => b.ativo)) {
            // Find if it's a standard turno to keep ID, otherwise use name
            const turnoObj = turnosGlobais.find(t => t.nome === bloco.nome);
            const salaId = bloco.tipo === 'padrao' && turnoObj ? turnoObj.id : bloco.nome;
            
            await addDisponibilidade({
              id: `d${Date.now()}_${dia.diaSemana}_${Math.random().toString(36).substr(2, 4)}`,
              profissionalId: form.profissionalId,
              unidadeId: form.unidadeId,
              salaId: salaId, 
              dataInicio: form.dataInicio, dataFim: form.dataFim,
              horaInicio: bloco.horaInicio, horaFim: bloco.horaFim,
              vagasPorHora: 0, // marker for turno mode
              vagasPorDia: bloco.vagas,
              diasSemana: [dia.diaSemana],
              duracaoConsulta: 0,
            });
          }
        }
        toast.success(isEditing ? 'Disponibilidade atualizada!' : 'Disponibilidade por turno salva!');
        setDialogOpen(false);
        await refreshDisponibilidades();
      } catch (err) {
        console.error('Erro ao salvar disponibilidade:', err);
        toast.error('Erro ao salvar disponibilidade.');
      } finally { setSaving(false); }
    }
  };

  const updateDaySchedule = (dayIndex: number, field: keyof DaySchedule, value: any) => {
    setDaySchedules(prev => prev.map((ds, i) => {
      if (i !== dayIndex) return ds;
      if (field === 'ativo' && !value) return { ...ds, ativo: false, horaInicio: '08:00', horaFim: '17:00' };
      return { ...ds, [field]: value };
    }));
    if (field === 'ativo' && value) {
      setTimeout(() => dayInputRefs.current[dayIndex]?.focus(), 100);
    }
  };

  const toggleDiaConfig = (dayIndex: number, ativo: boolean) => {
    setConfigDias(prev => prev.map((pd, i) => {
      if (i !== dayIndex) return pd;
      // When activating, if it has no blocks, add defaults from global templates
      const activeGlobalTurnos = turnosGlobais.filter(t => t.ativo);
      const newBlocks = (ativo && pd.blocos.length === 0) 
        ? activeGlobalTurnos.map(t => ({
            nome: t.nome,
            tipo: 'padrao' as const,
            horaInicio: t.horaInicio,
            horaFim: t.horaFim,
            vagas: 20,
            ativo: true
          }))
        : pd.blocos;
      return { ...pd, ativo, blocos: newBlocks };
    }));
  };

  const addBlocoToDia = (dayIndex: number) => {
    setConfigDias(prev => prev.map((pd, i) => {
      if (i !== dayIndex) return pd;
      return {
        ...pd,
        blocos: [
          ...pd.blocos,
          { nome: 'Novo Turno', tipo: 'custom', horaInicio: '13:00', horaFim: '18:00', vagas: 10, ativo: true }
        ]
      };
    }));
  };

  const removeBlocoFromDia = (dayIndex: number, blocoIndex: number) => {
    setConfigDias(prev => prev.map((pd, i) => {
      if (i !== dayIndex) return pd;
      return {
        ...pd,
        blocos: pd.blocos.filter((_, bi) => bi !== blocoIndex)
      };
    }));
  };

  const updateBlocoInDia = (dayIndex: number, blocoIndex: number, field: keyof BlocoConfig, value: any) => {
    setConfigDias(prev => prev.map((pd, i) => {
      if (i !== dayIndex) return pd;
      return {
        ...pd,
        blocos: pd.blocos.map((b, bi) => bi === blocoIndex ? { ...b, [field]: value } : b)
      };
    }));
  };

  const copyDayConfig = (fromIndex: number) => {
    const sourceDay = configDias[fromIndex];
    if (!sourceDay.ativo) return;
    
    // For simplicity, copy to ALL other active days or provide a selection? 
    // Here we'll show a toast or just apply to next.
    // User requested: "copy from one day to another", "apply to several days"
    // We'll implement a simple "Apply to all other active days" or just copy to next.
    // Let's implement "Copy to all other active days" for now.
    setConfigDias(prev => prev.map((pd, i) => {
      if (i === fromIndex || !pd.ativo) return pd;
      return { ...pd, blocos: sourceDay.blocos.map(b => ({ ...b, id: undefined })) };
    }));
    toast.success(`Configuração de ${diasSemanaFull[fromIndex]} copiada para os demais dias ativos.`);
  };

  const filteredSalas = salas.filter(s => s.unidadeId === form.unidadeId && s.ativo);

  const handleRefresh = async () => {
    await Promise.all([refreshFuncionarios(), refreshDisponibilidades(), loadConfig()]);
    toast.success('Dados atualizados!');
  };

  // Calculate turno weekly summary
  const turnoWeeklySummary = useMemo(() => {
    if (modo !== 'por_turno') return { totalVagas: 0, diasAtivos: 0, turnosConfig: 0 };
    let totalVagas = 0;
    let diasAtivos = 0;
    let totalTurnos = 0;
    configDias.forEach(pd => {
      if (!pd.ativo) return;
      diasAtivos++;
      pd.blocos.forEach(b => {
        if (!b.ativo) return;
        totalTurnos++;
        totalVagas += b.vagas;
      });
    });
    return { totalVagas, diasAtivos, turnosConfig: totalTurnos };
  }, [modo, configDias]);

  // Group disponibilidades by professional
  const profGroups = useMemo(() => {
    const map = new Map<string, { prof: typeof funcionarios[0] | undefined; groups: [string, typeof disponibilidades][] }>();
    for (const [key, records] of groups.entries()) {
      const profId = records[0].profissionalId;
      if (!map.has(profId)) {
        map.set(profId, { prof: funcionarios.find(f => f.id === profId), groups: [] });
      }
      map.get(profId)!.groups.push([key, records]);
    }
    // Sort alphabetically
    return Array.from(map.entries()).sort((a, b) => {
      const nameA = a[1].prof?.nome || '';
      const nameB = b[1].prof?.nome || '';
      return nameA.localeCompare(nameB, 'pt-BR');
    });
  }, [groups, funcionarios]);

  // Filter by search
  const filteredProfGroups = useMemo(() => {
    if (!searchTerm.trim()) return profGroups;
    const term = searchTerm.toLowerCase().trim();
    return profGroups.filter(([profId, data]) => {
      const nome = data.prof?.nome?.toLowerCase() || '';
      const unidadeId = data.groups[0]?.[1]?.[0]?.unidadeId || '';
      const unidadeNome = unidades.find(u => u.id === unidadeId)?.nome?.toLowerCase() || '';
      return nome.includes(term) || unidadeNome.includes(term);
    });
  }, [profGroups, searchTerm, unidades]);

  const manageProfData = manageProfId ? profGroups.find(([id]) => id === manageProfId) : null;

  const openNewForProf = (profId: string) => {
    const prof = profissionais.find(p => p.id === profId);
    setEditGroupIds([]);
    setForm({
      profissionalId: profId,
      unidadeId: prof?.unidadeId || '',
      salaId: prof?.salaId || '',
      dataInicio: '', dataFim: '',
      vagasPorHora: 3, vagasPorDia: 25, duracaoConsulta: 30, intervalo: 0,
    });
    const savedModo = modosPorProfissional[profId] || 'por_hora';
    setModo(savedModo);
    setDaySchedules(defaultDaySchedules.map(d => ({ ...d })));
    setTurnoDays(defaultTurnoDays.map(d => ({ ...d, turnosAtivos: [] })));
    setTurnoVagas({});
    setDialogOpen(true);
  };

  return (
    <div className="space-y-4 animate-fade-in">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold font-display text-foreground">Disponibilidade</h1>
          <p className="text-muted-foreground text-sm">
            Configurar horários e vagas dos profissionais
            {profGroups.length > 0 && ` • ${profGroups.length} profissional(is) com horários`}
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={handleRefresh} size="sm">
            <RefreshCw className="w-4 h-4 mr-2" />Atualizar
          </Button>
          <Button onClick={openNew} className="gradient-primary text-primary-foreground">
            <Plus className="w-4 h-4 mr-2" />Configurar
          </Button>
        </div>
      </div>

      {/* Search */}
      <div className="relative max-w-md">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Buscar por nome ou unidade..."
          value={searchTerm}
          onChange={e => setSearchTerm(e.target.value)}
          className="pl-9"
        />
      </div>

      {profissionais.length === 0 && (
        <Card className="shadow-card border-0 border-l-4 border-l-warning">
          <CardContent className="p-4 text-sm text-warning">
            Nenhum profissional ativo cadastrado. Cadastre profissionais na tela de Funcionários antes de configurar disponibilidades.
          </CardContent>
        </Card>
      )}

      {/* Dialog (add/edit) */}
      <Dialog open={dialogOpen} onOpenChange={v => { if (!saving) setDialogOpen(v); }}>
        <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle className="font-display">{isEditing ? 'Editar' : 'Configurar'} Disponibilidade</DialogTitle></DialogHeader>
          <div className="space-y-4">
            {/* Profissional + Unidade */}
            <div className="grid grid-cols-2 gap-3">
              <div><Label>Profissional *</Label>
                <Select value={form.profissionalId} onValueChange={handleProfissionalChange}>
                  <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                  <SelectContent>
                    {profissionais.length === 0 ? (
                      <SelectItem value="__none__" disabled>Nenhum profissional cadastrado</SelectItem>
                    ) : (
                      profissionais.map(p => <SelectItem key={p.id} value={p.id}>{p.nome} — {p.cargo}</SelectItem>)
                    )}
                  </SelectContent>
                </Select>
              </div>
              <div><Label>Unidade *</Label>
                <Select value={form.unidadeId} onValueChange={v => setForm(p => ({ ...p, unidadeId: v, salaId: '' }))}>
                  <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                  <SelectContent>{unidadesVisiveis.filter(u => u.ativo).map(u => <SelectItem key={u.id} value={u.id}>{u.nome}</SelectItem>)}</SelectContent>
                </Select>
              </div>
            </div>

            {/* Sala - only for por_hora */}
            {modo === 'por_hora' && filteredSalas.length > 0 && (
              <div><Label>Sala (opcional)</Label>
                <Select value={form.salaId || 'none'} onValueChange={v => setForm(p => ({ ...p, salaId: v === 'none' ? '' : v }))}>
                  <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Nenhuma</SelectItem>
                    {filteredSalas.map(s => <SelectItem key={s.id} value={s.id}>{s.nome}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            )}

            {/* Mode selector */}
            {form.profissionalId && (
              <Card className="border border-border bg-muted/30">
                <CardContent className="p-4">
                  <Label className="text-sm font-semibold mb-3 block">Modo de Disponibilidade</Label>
                  <RadioGroup value={modo} onValueChange={v => handleModoChange(v as ModoDisponibilidade)} className="flex gap-6">
                    <div className="flex items-center gap-2">
                      <RadioGroupItem value="por_hora" id="modo_hora" />
                      <label htmlFor="modo_hora" className="text-sm font-medium flex items-center gap-1.5 cursor-pointer">
                        <Clock className="w-4 h-4 text-primary" />Por Hora
                      </label>
                    </div>
                    <div className="flex items-center gap-2">
                      <RadioGroupItem value="por_turno" id="modo_turno" />
                      <label htmlFor="modo_turno" className="text-sm font-medium flex items-center gap-1.5 cursor-pointer">
                        <ClipboardList className="w-4 h-4 text-primary" />Por Turno
                      </label>
                    </div>
                  </RadioGroup>
                  <p className="text-[11px] text-muted-foreground mt-2">Salvo por profissional — cada um pode ter um modo diferente</p>
                </CardContent>
              </Card>
            )}

            {/* Date range */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Data Início *</Label>
                <Input type="date" value={form.dataInicio} onChange={e => setForm(p => ({ ...p, dataInicio: e.target.value }))} />
              </div>
              <div>
                <Label>Data Fim *</Label>
                <Input type="date" value={form.dataFim} onChange={e => setForm(p => ({ ...p, dataFim: e.target.value }))} />
                {hasDateError && <p className="text-xs text-destructive mt-1">Data Fim deve ser posterior à Data Início.</p>}
              </div>
            </div>

            {/* === POR HORA mode === */}
            {modo === 'por_hora' && (
              <>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  <div>
                    <Label>Vagas/Hora</Label>
                    <Input type="number" min={1} value={form.vagasPorHora} onChange={e => setForm(p => ({ ...p, vagasPorHora: parseInt(e.target.value) || 1 }))} />
                  </div>
                  <div>
                    <Label>Vagas/Dia</Label>
                    <Input type="number" min={1} value={form.vagasPorDia} onChange={e => setForm(p => ({ ...p, vagasPorDia: parseInt(e.target.value) || 1 }))} />
                  </div>
                  <div>
                    <Label>Duração (min)</Label>
                    <Input type="number" min={10} step={5} value={form.duracaoConsulta} onChange={e => setForm(p => ({ ...p, duracaoConsulta: parseInt(e.target.value) || 30 }))} />
                  </div>
                  <div>
                    <Label>Intervalo (min)</Label>
                    <Input type="number" min={0} step={5} value={form.intervalo} onChange={e => setForm(p => ({ ...p, intervalo: parseInt(e.target.value) || 0 }))} />
                  </div>
                </div>
                {(form.duracaoConsulta > 0 || form.intervalo > 0) && (
                  <p className="text-xs text-muted-foreground flex items-center gap-1">
                    <Info className="w-3.5 h-3.5" />
                    Sugestão: <strong>{suggestedVagasHora} vaga(s)/hora</strong>
                    {form.vagasPorHora !== suggestedVagasHora && (
                      <Button variant="link" size="sm" className="h-auto p-0 ml-1 text-xs" onClick={() => setForm(p => ({ ...p, vagasPorHora: suggestedVagasHora }))}>
                        Aplicar
                      </Button>
                    )}
                  </p>
                )}

                {/* Per-day schedule grid */}
                <div>
                  <Label className="mb-2 block">Horário por Dia da Semana</Label>
                  <div className="rounded-lg border border-border overflow-hidden">
                    <div className="grid grid-cols-[1fr_auto_1fr_1fr] gap-0 bg-muted/50 px-3 py-2 text-xs font-medium text-muted-foreground border-b border-border">
                      <span>Dia</span>
                      <span className="text-center px-2">Ativo</span>
                      <span className="text-center">Início</span>
                      <span className="text-center">Fim</span>
                    </div>
                    {daySchedules.map((ds, i) => {
                      const isFds = i === 0 || i === 6;
                      const error = dayErrors[i];
                      return (
                        <div key={i}>
                          <div className={cn(
                            "grid grid-cols-[1fr_auto_1fr_1fr] gap-0 items-center px-3 py-2 border-b border-border last:border-b-0",
                            !ds.ativo && "bg-muted/20",
                            isFds && ds.ativo && "bg-orange-500/5",
                            error && "bg-destructive/5",
                          )}>
                            <span className={cn(
                              "text-sm font-medium",
                              ds.ativo ? "text-foreground" : "text-muted-foreground",
                              isFds && ds.ativo && "text-orange-600 dark:text-orange-400",
                            )}>
                              {diasSemanaFull[i]}
                              {isFds && <span className="text-[10px] ml-1 text-muted-foreground">(FDS)</span>}
                            </span>
                            <div className="flex justify-center px-2">
                              <Switch checked={ds.ativo} onCheckedChange={(checked) => updateDaySchedule(i, 'ativo', checked)} />
                            </div>
                            <div className="px-1">
                              <Input
                                ref={el => { dayInputRefs.current[i] = el; }}
                                type="time" value={ds.horaInicio}
                                onChange={e => updateDaySchedule(i, 'horaInicio', e.target.value)}
                                disabled={!ds.ativo}
                                className={cn("h-8 text-xs", error && "border-destructive")}
                              />
                            </div>
                            <div className="px-1">
                              <Input type="time" value={ds.horaFim}
                                onChange={e => updateDaySchedule(i, 'horaFim', e.target.value)}
                                disabled={!ds.ativo}
                                className={cn("h-8 text-xs", error && "border-destructive")}
                              />
                            </div>
                          </div>
                          {error && <p className="text-[11px] text-destructive px-3 py-1 bg-destructive/5 border-b border-border">{error}</p>}
                        </div>
                      );
                    })}
                  </div>
                  <p className="text-xs text-muted-foreground mt-2">{activeDaysCount} dia(s) ativo(s)</p>
                  {daySchedules.some((ds, i) => ds.ativo && (i === 0 || i === 6)) && (
                    <p className="text-xs text-orange-500 mt-1 flex items-center gap-1">⚠️ Atenção: disponibilidade em fim de semana.</p>
                  )}
                </div>
              </>
            )}

            {/* === POR TURNO mode === */}
            {modo === 'por_turno' && (
              <div className="space-y-4">
                <Accordion type="multiple" className="w-full border rounded-lg overflow-hidden">
                  {configDias.map((dia, diaIndex) => {
                    const isFds = diaIndex === 0 || diaIndex === 6;
                    return (
                      <AccordionItem key={diaIndex} value={`dia-${diaIndex}`} className="border-b last:border-0">
                        <div className={cn(
                          "flex items-center justify-between px-4 py-2",
                          !dia.ativo && "bg-muted/30",
                          isFds && dia.ativo && "bg-orange-500/5"
                        )}>
                          <div className="flex items-center gap-3">
                            <Switch 
                              checked={dia.ativo} 
                              onCheckedChange={(v) => toggleDiaConfig(diaIndex, v)} 
                            />
                            <span className={cn(
                              "font-semibold text-sm",
                              !dia.ativo && "text-muted-foreground",
                              isFds && dia.ativo && "text-orange-600"
                            )}>
                              {diasSemanaFull[diaIndex]}
                              {isFds && <span className="text-[10px] ml-1 opacity-70">(FDS)</span>}
                            </span>
                          </div>
                          <div className="flex items-center gap-2">
                            {dia.ativo && (
                              <>
                                <Badge variant="outline" className="text-[10px]">
                                  {dia.blocos.filter(b => b.ativo).length} bloco(s)
                                </Badge>
                                <Button 
                                  variant="ghost" 
                                  size="icon" 
                                  className="h-8 w-8 text-muted-foreground"
                                  onClick={(e) => { e.stopPropagation(); copyDayConfig(diaIndex); }}
                                  title="Copiar para outros dias"
                                >
                                  <Copy className="h-3.5 w-3.5" />
                                </Button>
                              </>
                            )}
                            <AccordionTrigger className="py-2 hover:no-underline" disabled={!dia.ativo} />
                          </div>
                        </div>
                        <AccordionContent className="p-0">
                          {dia.ativo && (
                            <div className="p-4 space-y-3 bg-muted/20">
                              {dia.blocos.map((bloco, blocoIndex) => (
                                <div key={blocoIndex} className="flex flex-col sm:flex-row gap-2 items-start sm:items-center p-3 bg-background border rounded-md shadow-sm">
                                  <div className="flex-1 w-full">
                                    <Label className="text-[10px] uppercase text-muted-foreground mb-1 block">Nome do Turno</Label>
                                    <Input 
                                      value={bloco.nome} 
                                      onChange={e => updateBlocoInDia(diaIndex, blocoIndex, 'nome', e.target.value)} 
                                      className="h-8 text-sm"
                                    />
                                  </div>
                                  <div className="w-full sm:w-24">
                                    <Label className="text-[10px] uppercase text-muted-foreground mb-1 block">Início</Label>
                                    <Input 
                                      type="time" 
                                      value={bloco.horaInicio} 
                                      onChange={e => updateBlocoInDia(diaIndex, blocoIndex, 'horaInicio', e.target.value)} 
                                      className="h-8 text-sm"
                                    />
                                  </div>
                                  <div className="w-full sm:w-24">
                                    <Label className="text-[10px] uppercase text-muted-foreground mb-1 block">Fim</Label>
                                    <Input 
                                      type="time" 
                                      value={bloco.horaFim} 
                                      onChange={e => updateBlocoInDia(diaIndex, blocoIndex, 'horaFim', e.target.value)} 
                                      className="h-8 text-sm"
                                    />
                                  </div>
                                  <div className="w-full sm:w-20">
                                    <Label className="text-[10px] uppercase text-muted-foreground mb-1 block">Vagas</Label>
                                    <div className="space-y-1">
                                      <Input 
                                        type="number" 
                                        value={bloco.vagas} 
                                        onChange={e => updateBlocoInDia(diaIndex, blocoIndex, 'vagas', parseInt(e.target.value) || 0)} 
                                        className="h-8 text-sm"
                                      />
                                      {(() => {
                                        const turnoQuotas = (window as any).__quotasExternasCached || [];
                                        const reservadasExterno = turnoQuotas
                                          .filter((q: any) => 
                                            q.profissional_interno_id === form.profissionalId && 
                                            q.unidade_id === form.unidadeId &&
                                            q.ativo === true &&
                                            (q.dia_semana === diaIndex || q.dia_semana === undefined) &&
                                            (q.turno?.toLowerCase() === (bloco.horaInicio < '12:00' ? 'manha' : bloco.horaInicio < '18:00' ? 'tarde' : 'noite'))
                                          )
                                          .reduce((acc: number, curr: any) => acc + (curr.vagas_total || 0), 0);
                                        
                                        if (reservadasExterno > 0) {
                                          const disponivelRecepcao = Math.max(0, bloco.vagas - reservadasExterno);
                                          return (
                                            <div className="flex flex-col gap-0.5 mt-1">
                                              <span className="text-[9px] text-primary font-bold">Reserva Ext: {reservadasExterno}</span>
                                              <span className={cn(
                                                "text-[9px] font-bold",
                                                disponivelRecepcao === 0 ? "text-destructive" : "text-success"
                                              )}>Recepção: {disponivelRecepcao}</span>
                                              {reservadasExterno > bloco.vagas && (
                                                <span className="text-[8px] text-destructive leading-tight font-medium">⚠️ Cotas excedem vagas totais!</span>
                                              )}
                                            </div>
                                          );
                                        }
                                        return null;
                                      })()}
                                    </div>
                                  </div>
                                  <div className="flex items-center gap-1 self-end sm:self-center mt-2 sm:mt-5">
                                    <Button 
                                      variant="ghost" 
                                      size="icon" 
                                      className="h-8 w-8 text-destructive hover:bg-destructive/10"
                                      onClick={() => removeBlocoFromDia(diaIndex, blocoIndex)}
                                    >
                                      <Trash2 className="h-4 w-4" />
                                    </Button>
                                  </div>
                                </div>
                              ))}
                              
                              <div className="flex justify-between pt-2">
                                <Button 
                                  variant="outline" 
                                  size="sm" 
                                  className="text-xs h-8 border-dashed"
                                  onClick={() => addBlocoToDia(diaIndex)}
                                >
                                  <Plus className="h-3.5 w-3.5 mr-1" /> Adicionar Bloco
                                </Button>
                                
                                <div className="flex gap-2">
                                  {turnosGlobais.filter(t => t.ativo).map(t => (
                                    <Button 
                                      key={t.id}
                                      variant="secondary" 
                                      size="sm" 
                                      className="text-[10px] h-7 px-2"
                                      onClick={() => {
                                        setConfigDias(prev => prev.map((pd, i) => i === diaIndex ? {
                                          ...pd,
                                          blocos: [...pd.blocos, { 
                                            nome: t.nome, 
                                            tipo: 'padrao', 
                                            horaInicio: t.horaInicio, 
                                            horaFim: t.horaFim, 
                                            vagas: 20, 
                                            ativo: true 
                                          }]
                                        } : pd));
                                      }}
                                    >
                                      + {t.nome}
                                    </Button>
                                  ))}
                                </div>
                              </div>
                            </div>
                          )}
                        </AccordionContent>
                      </AccordionItem>
                    );
                  })}
                </Accordion>

                {/* Summary */}
                <Card className="bg-muted/30 border border-border">
                  <CardContent className="p-4">
                    <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-3">Resumo da Configuração</h4>
                    <div className="grid grid-cols-2 gap-4 text-sm">
                      <div className="flex flex-col">
                        <span className="text-muted-foreground text-[10px] uppercase">Vagas Semanais</span>
                        <span className="font-bold text-lg">{turnoWeeklySummary.totalVagas}</span>
                      </div>
                      <div className="flex flex-col">
                        <span className="text-muted-foreground text-[10px] uppercase">Dias Ativos</span>
                        <span className="font-bold text-lg">{turnoWeeklySummary.diasAtivos} / 7</span>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </div>
            )}

            <Button onClick={handleSave} disabled={!canSave} className="w-full gradient-primary text-primary-foreground">
              {saving ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Salvando...</> : isEditing ? 'Atualizar Disponibilidade' : 'Salvar Disponibilidade'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Management Modal */}
      <Dialog open={!!manageProfId} onOpenChange={v => { if (!v) setManageProfId(null); }}>
        <DialogContent className="sm:max-w-3xl max-h-[90vh] overflow-y-auto">
          {manageProfData && (() => {
            const [profId, data] = manageProfData;
            const prof = data.prof;
            const profUnidade = unidades.find(u => u.id === prof?.unidadeId);
            return (
              <>
                <DialogHeader>
                  <DialogTitle className="font-display flex items-center gap-2">
                    <User className="w-5 h-5 text-primary" />
                    {prof?.nome || 'Profissional'}
                    {profUnidade && <Badge variant="secondary" className="text-xs ml-2">{profUnidade.nome}</Badge>}
                  </DialogTitle>
                </DialogHeader>

                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <p className="text-sm text-muted-foreground">{data.groups.length} disponibilidade(s) cadastrada(s)</p>
                    <Button size="sm" onClick={() => openNewForProf(profId)} className="gradient-primary text-primary-foreground">
                      <Plus className="w-4 h-4 mr-1" />Adicionar
                    </Button>
                  </div>

                  {data.groups.map(([key, records]) => {
                    const first = records[0];
                    const unidade = unidades.find(u => u.id === first.unidadeId);
                    const isTurno = isGroupTurno(records);
                    const sala = first.salaId && !isTurno ? salas.find(s => s.id === first.salaId) : null;
                    const allIds = records.map(r => r.id);

                    if (isTurno) {
                      const turnoBlocks: { bloco: BlocoConfig; dayNum: number }[] = [];
                      records.forEach(r => {
                        const tId = r.salaId || '';
                        const turnoObj = turnosGlobais.find(t => t.id === tId);
                        r.diasSemana.forEach(d => {
                          turnoBlocks.push({
                            dayNum: d,
                            bloco: {
                              nome: turnoObj?.nome || tId || 'Turno',
                              tipo: turnoObj ? 'padrao' : 'custom',
                              horaInicio: r.horaInicio,
                              horaFim: r.horaFim,
                              vagas: r.vagasPorDia,
                              ativo: true
                            }
                          });
                        });
                      });

                      return (
                        <Card key={key} className="border border-border">
                          <CardContent className="p-4">
                            <div className="flex items-start justify-between mb-2">
                              <div>
                                <div className="flex items-center gap-2 mb-1">
                                  <Badge variant="secondary" className="text-[10px] gap-1"><ClipboardList className="w-3 h-3" />Por Turno</Badge>
                                  {unidade && <span className="text-xs text-muted-foreground">{unidade.nome}</span>}
                                </div>
                                <p className="text-xs text-muted-foreground"><Calendar className="w-3.5 h-3.5 inline mr-1" />{first.dataInicio} a {first.dataFim}</p>
                              </div>
                              <div className="flex gap-1">
                                <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => openEditGroup(key)}><Pencil className="w-3.5 h-3.5" /></Button>
                                <AlertDialog>
                                  <AlertDialogTrigger asChild><Button size="icon" variant="ghost" className="h-8 w-8 text-destructive"><Trash2 className="w-3.5 h-3.5" /></Button></AlertDialogTrigger>
                                  <AlertDialogContent>
                                    <AlertDialogHeader><AlertDialogTitle>Excluir disponibilidade?</AlertDialogTitle><AlertDialogDescription>Todos os registros serão removidos.</AlertDialogDescription></AlertDialogHeader>
                                    <AlertDialogFooter><AlertDialogCancel>Cancelar</AlertDialogCancel><AlertDialogAction onClick={async () => { for (const r of records) { await deleteDisponibilidade(r.id); } toast.success('Disponibilidade excluída!'); }}>Excluir</AlertDialogAction></AlertDialogFooter>
                                  </AlertDialogContent>
                                </AlertDialog>
                              </div>
                            </div>
                            <div className="space-y-1">
                              {turnoBlocks.sort((a, b) => a.dayNum - b.dayNum || a.bloco.horaInicio.localeCompare(b.bloco.horaInicio)).map((tb, idx) => (
                                <div key={idx} className="flex items-center gap-2 text-xs">
                                  <Badge variant="outline" className="text-[10px] min-w-[32px] justify-center">{diasSemanaLabels[tb.dayNum]}</Badge>
                                  <span className="font-medium">{tb.bloco.nome}</span>
                                  <span className="text-muted-foreground">{tb.bloco.horaInicio}–{tb.bloco.horaFim}</span>
                                  <span className="font-medium">{tb.bloco.vagas} vagas</span>
                                </div>
                              ))}
                            </div>
                            {todayStr >= first.dataInicio && todayStr <= first.dataFim && (
                              <div className="mt-2"><SlotInfoBadge profissionalId={first.profissionalId} unidadeId={first.unidadeId} date={todayStr} /></div>
                            )}
                          </CardContent>
                        </Card>
                      );
                    }

                    // Por Hora
                    const dayEntries = records.flatMap(r => r.diasSemana.map(dayNum => ({ dayNum, horaInicio: r.horaInicio, horaFim: r.horaFim }))).sort((a, b) => a.dayNum - b.dayNum);

                    return (
                      <Card key={key} className="border border-border">
                        <CardContent className="p-4">
                          <div className="flex items-start justify-between mb-2">
                            <div>
                              <div className="flex items-center gap-2 mb-1">
                                <Badge variant="secondary" className="text-[10px] gap-1"><Clock className="w-3 h-3" />Por Hora</Badge>
                                {unidade && <span className="text-xs text-muted-foreground">{unidade.nome}</span>}
                                {sala && <span className="text-xs text-muted-foreground">• {sala.nome}</span>}
                              </div>
                              <p className="text-xs text-muted-foreground"><Calendar className="w-3.5 h-3.5 inline mr-1" />{first.dataInicio} a {first.dataFim}</p>
                            </div>
                            <div className="flex gap-1">
                              <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => openEditGroup(key)}><Pencil className="w-3.5 h-3.5" /></Button>
                              <AlertDialog>
                                <AlertDialogTrigger asChild><Button size="icon" variant="ghost" className="h-8 w-8 text-destructive"><Trash2 className="w-3.5 h-3.5" /></Button></AlertDialogTrigger>
                                <AlertDialogContent>
                                  <AlertDialogHeader><AlertDialogTitle>Excluir disponibilidade?</AlertDialogTitle><AlertDialogDescription>Todos os {records.length} registro(s) serão removidos.</AlertDialogDescription></AlertDialogHeader>
                                  <AlertDialogFooter><AlertDialogCancel>Cancelar</AlertDialogCancel><AlertDialogAction onClick={async () => { for (const id of allIds) { await deleteDisponibilidade(id); } toast.success('Disponibilidade excluída!'); }}>Excluir</AlertDialogAction></AlertDialogFooter>
                                </AlertDialogContent>
                              </AlertDialog>
                            </div>
                          </div>
                          <div className="flex flex-wrap gap-1.5 mb-2">
                            {dayEntries.map((de, i) => (
                              <span key={i} className={cn(
                                "inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full border",
                                (de.dayNum === 0 || de.dayNum === 6)
                                  ? "bg-orange-100 text-orange-700 border-orange-200 dark:bg-orange-500/15 dark:text-orange-400 dark:border-orange-500/30"
                                  : "bg-primary/10 text-primary border-primary/20"
                              )}>
                                {diasSemanaLabels[de.dayNum]} {de.horaInicio}–{de.horaFim}
                              </span>
                            ))}
                          </div>
                          <div className="flex items-center gap-3 text-xs text-muted-foreground">
                            <span>{first.vagasPorHora} vagas/hora</span>
                            <span>•</span>
                            <span>{first.vagasPorDia} vagas/dia</span>
                            <span>•</span>
                            <span>{first.duracaoConsulta || 30}min</span>
                          </div>
                          {todayStr >= first.dataInicio && todayStr <= first.dataFim && (
                            <div className="mt-2"><SlotInfoBadge profissionalId={first.profissionalId} unidadeId={first.unidadeId} date={todayStr} /></div>
                          )}
                        </CardContent>
                      </Card>
                    );
                  })}
                </div>
              </>
            );
          })()}
        </DialogContent>
      </Dialog>

      {/* Professional Cards List */}
      {disponibilidades.length === 0 ? (
        <Card className="shadow-card border-0"><CardContent className="p-8 text-center text-muted-foreground">
          <Clock className="w-12 h-12 mx-auto mb-3 text-muted-foreground/30" />
          Nenhuma disponibilidade configurada.
        </CardContent></Card>
      ) : filteredProfGroups.length === 0 ? (
        <Card className="shadow-card border-0"><CardContent className="p-8 text-center text-muted-foreground">
          <Search className="w-12 h-12 mx-auto mb-3 text-muted-foreground/30" />
          Nenhum profissional encontrado para "{searchTerm}".
        </CardContent></Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          {filteredProfGroups.map(([profId, data]) => {
            const prof = data.prof;
            const totalDisp = data.groups.length;
            const firstUnidadeId = data.groups[0]?.[1]?.[0]?.unidadeId || '';
            const unidade = unidades.find(u => u.id === (prof?.unidadeId || firstUnidadeId));
            const hasTurno = data.groups.some(([_, records]) => isGroupTurno(records));
            const hasHora = data.groups.some(([_, records]) => !isGroupTurno(records));

            return (
              <Card key={profId} className="shadow-card border-0 hover:shadow-elevated transition-shadow">
                <CardContent className="p-4">
                  <div className="flex items-start gap-3">
                    <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                      <User className="w-5 h-5 text-primary" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <h3 className="font-semibold text-foreground truncate">{prof?.nome || 'Profissional'}</h3>
                      <p className="text-xs text-muted-foreground truncate">{prof?.profissao || prof?.cargo || ''}</p>
                      {unidade && <p className="text-xs text-muted-foreground truncate">{unidade.nome}</p>}
                    </div>
                  </div>

                  <div className="flex items-center gap-2 mt-3">
                    <Badge variant="outline" className="text-xs">
                      <Clock className="w-3 h-3 mr-1" />
                      {totalDisp} horário{totalDisp !== 1 ? 's' : ''}
                    </Badge>
                    {hasTurno && <Badge variant="secondary" className="text-[10px]">Turno</Badge>}
                    {hasHora && <Badge variant="secondary" className="text-[10px]">Hora</Badge>}
                  </div>

                  <Button
                    variant="outline"
                    size="sm"
                    className="w-full mt-3"
                    onClick={() => setManageProfId(profId)}
                  >
                    <Settings2 className="w-4 h-4 mr-1.5" />
                    Gerenciar
                  </Button>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default Disponibilidade;