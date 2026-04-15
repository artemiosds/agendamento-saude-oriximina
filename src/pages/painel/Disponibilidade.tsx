import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { useData } from '@/contexts/DataContext';
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
import { Plus, Clock, Calendar, Pencil, Trash2, RefreshCw, Loader2, Info, ClipboardList, Search, Settings2, User } from 'lucide-react';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import { useUnidadeFilter } from '@/hooks/useUnidadeFilter';
import { SlotInfoBadge } from '@/components/SlotInfoBadge';
import type { TurnoDefinition } from '@/components/config/ConfigFluxoAtendimento';

const diasSemanaLabels = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
const diasSemanaFull = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'];

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
  const { disponibilidades, addDisponibilidade, updateDisponibilidade, deleteDisponibilidade, funcionarios, unidades, salas, refreshFuncionarios, refreshDisponibilidades } = useData();
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
      // Reconstruct turno days from records
      const newTurnoDays: TurnoDayConfig[] = Array.from({ length: 7 }, () => ({ ativo: false, turnosAtivos: [] }));
      const vagasMap: TurnoVagas = {};

      records.forEach(r => {
        // For turno records, salaId stores the turno ID
        const turnoId = r.salaId || '';
        if (turnoId) {
          vagasMap[turnoId] = r.vagasPorDia;
          r.diasSemana.forEach(dayNum => {
            if (dayNum >= 0 && dayNum <= 6) {
              newTurnoDays[dayNum].ativo = true;
              if (!newTurnoDays[dayNum].turnosAtivos.includes(turnoId)) {
                newTurnoDays[dayNum].turnosAtivos.push(turnoId);
              }
            }
          });
        }
      });

      setTurnoDays(newTurnoDays);
      setTurnoVagas(vagasMap);
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
      const defaultVagas: TurnoVagas = {};
      activeTurnos.forEach(t => { defaultVagas[t.id] = turnoVagas[t.id] || 20; });
      setTurnoVagas(defaultVagas);
      // Set default turnosAtivos for active days
      setTurnoDays(prev => prev.map(td => ({
        ...td,
        turnosAtivos: td.ativo && td.turnosAtivos.length === 0 ? activeTurnos.map(t => t.id) : td.turnosAtivos,
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
      const activeDays = turnoDays.map((td, i) => ({ ...td, dayNum: i })).filter(td => td.ativo && td.turnosAtivos.length > 0);
      if (activeDays.length === 0) { toast.error('Ative pelo menos um dia com turnos.'); return; }

      const overlapMsg = checkOverlap();
      if (overlapMsg) { toast.error(overlapMsg); return; }

      setSaving(true);
      try {
        if (isEditing) { for (const id of editGroupIds) { await deleteDisponibilidade(id); } }

        // Create one record per turno-day combination
        // We use salaId to store turnoId, vagasPorHora = 0 as turno marker
        for (const day of activeDays) {
          for (const turnoId of day.turnosAtivos) {
            const turno = turnosGlobais.find(t => t.id === turnoId);
            if (!turno) continue;
            await addDisponibilidade({
              id: `d${Date.now()}_${day.dayNum}_${turnoId.slice(-4)}`,
              profissionalId: form.profissionalId,
              unidadeId: form.unidadeId,
              salaId: turnoId, // store turno id here
              dataInicio: form.dataInicio, dataFim: form.dataFim,
              horaInicio: turno.horaInicio, horaFim: turno.horaFim,
              vagasPorHora: 0, // marker for turno mode
              vagasPorDia: turnoVagas[turnoId] || 20,
              diasSemana: [day.dayNum],
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

  const toggleTurnoDay = (dayIndex: number, ativo: boolean) => {
    setTurnoDays(prev => prev.map((td, i) => {
      if (i !== dayIndex) return td;
      return { ...td, ativo, turnosAtivos: ativo ? activeTurnos.map(t => t.id) : [] };
    }));
  };

  const toggleTurnoForDay = (dayIndex: number, turnoId: string) => {
    setTurnoDays(prev => prev.map((td, i) => {
      if (i !== dayIndex) return td;
      const has = td.turnosAtivos.includes(turnoId);
      return { ...td, turnosAtivos: has ? td.turnosAtivos.filter(id => id !== turnoId) : [...td.turnosAtivos, turnoId] };
    }));
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
    const turnosUsados = new Set<string>();
    turnoDays.forEach(td => {
      if (!td.ativo) return;
      diasAtivos++;
      td.turnosAtivos.forEach(tId => {
        turnosUsados.add(tId);
        totalVagas += turnoVagas[tId] || 20;
      });
    });
    return { totalVagas, diasAtivos, turnosConfig: turnosUsados.size };
  }, [modo, turnoDays, turnoVagas]);

  return (
    <div className="space-y-4 animate-fade-in">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold font-display text-foreground">Disponibilidade</h1>
          <p className="text-muted-foreground text-sm">
            Configurar horários e vagas dos profissionais
            {profissionais.length > 0 && ` • ${profissionais.length} profissional(is) ativo(s)`}
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

      {profissionais.length === 0 && (
        <Card className="shadow-card border-0 border-l-4 border-l-warning">
          <CardContent className="p-4 text-sm text-warning">
            Nenhum profissional ativo cadastrado. Cadastre profissionais na tela de Funcionários antes de configurar disponibilidades.
          </CardContent>
        </Card>
      )}

      {/* Dialog */}
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
              <>
                {activeTurnos.length === 0 ? (
                  <Card className="border-l-4 border-l-warning">
                    <CardContent className="p-4 text-sm text-warning">
                      Nenhum turno ativo cadastrado. Configure turnos em Configurações → Fluxo de Atendimento → Turnos.
                    </CardContent>
                  </Card>
                ) : (
                  <>
                    {/* Turnos + vagas */}
                    <div>
                      <Label className="mb-2 block">Turnos Disponíveis</Label>
                      <div className="rounded-lg border border-border overflow-hidden">
                        <div className="grid grid-cols-[1fr_auto_auto_auto] gap-0 bg-muted/50 px-3 py-2 text-xs font-medium text-muted-foreground border-b border-border">
                          <span>Turno</span>
                          <span className="text-center px-3">Horário</span>
                          <span className="text-center px-3">Vagas</span>
                          <span className="text-center px-3">Ativo</span>
                        </div>
                        {activeTurnos.map(turno => {
                          const isActive = Object.keys(turnoVagas).includes(turno.id);
                          return (
                            <div key={turno.id} className="grid grid-cols-[1fr_auto_auto_auto] gap-0 items-center px-3 py-2.5 border-b border-border last:border-b-0">
                              <span className="text-sm font-medium flex items-center gap-2">
                                <Clock className="w-3.5 h-3.5 text-muted-foreground" />
                                {turno.nome}
                              </span>
                              <span className="text-xs text-muted-foreground text-center px-3">{turno.horaInicio} - {turno.horaFim}</span>
                              <div className="px-3">
                                <Input
                                  type="number" min={1} value={turnoVagas[turno.id] || 20}
                                  onChange={e => setTurnoVagas(prev => ({ ...prev, [turno.id]: parseInt(e.target.value) || 1 }))}
                                  className="h-8 w-16 text-xs text-center"
                                />
                              </div>
                              <div className="px-3 flex justify-center">
                                <Switch
                                  checked={turnoVagas[turno.id] !== undefined}
                                  onCheckedChange={v => {
                                    if (v) {
                                      setTurnoVagas(prev => ({ ...prev, [turno.id]: 20 }));
                                    } else {
                                      setTurnoVagas(prev => { const n = { ...prev }; delete n[turno.id]; return n; });
                                      // Remove from all days
                                      setTurnoDays(prev => prev.map(td => ({ ...td, turnosAtivos: td.turnosAtivos.filter(id => id !== turno.id) })));
                                    }
                                  }}
                                />
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>

                    {/* Days + turno selection */}
                    <div>
                      <Label className="mb-2 block">Dias da Semana</Label>
                      <div className="rounded-lg border border-border overflow-hidden">
                        <div className="grid grid-cols-[1fr_auto_1fr] gap-0 bg-muted/50 px-3 py-2 text-xs font-medium text-muted-foreground border-b border-border">
                          <span>Dia</span>
                          <span className="text-center px-2">Ativo</span>
                          <span>Turnos ativos neste dia</span>
                        </div>
                        {turnoDays.map((td, i) => {
                          const isFds = i === 0 || i === 6;
                          const enabledTurnos = activeTurnos.filter(t => turnoVagas[t.id] !== undefined);
                          return (
                            <div key={i} className={cn(
                              "grid grid-cols-[1fr_auto_1fr] gap-0 items-center px-3 py-2.5 border-b border-border last:border-b-0",
                              !td.ativo && "bg-muted/20",
                              isFds && td.ativo && "bg-orange-500/5",
                            )}>
                              <span className={cn(
                                "text-sm font-medium",
                                td.ativo ? "text-foreground" : "text-muted-foreground",
                                isFds && td.ativo && "text-orange-600 dark:text-orange-400",
                              )}>
                                {diasSemanaFull[i]}
                              </span>
                              <div className="flex justify-center px-2">
                                <Switch checked={td.ativo} onCheckedChange={v => toggleTurnoDay(i, v)} />
                              </div>
                              <div className="flex flex-wrap gap-1.5">
                                {td.ativo ? (
                                  enabledTurnos.length > 0 ? enabledTurnos.map(turno => (
                                    <button
                                      key={turno.id}
                                      onClick={() => toggleTurnoForDay(i, turno.id)}
                                      className={cn(
                                        "inline-flex items-center gap-1 text-[11px] font-medium px-2 py-0.5 rounded-full border transition-colors cursor-pointer",
                                        td.turnosAtivos.includes(turno.id)
                                          ? "bg-primary/10 text-primary border-primary/30"
                                          : "bg-muted/50 text-muted-foreground border-border"
                                      )}
                                    >
                                      {td.turnosAtivos.includes(turno.id) ? '✅' : '○'} {turno.nome}
                                    </button>
                                  )) : (
                                    <span className="text-[11px] text-muted-foreground">Ative turnos acima</span>
                                  )
                                ) : (
                                  <span className="text-[11px] text-muted-foreground">—</span>
                                )}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>

                    {/* Summary */}
                    <Card className="bg-muted/30 border border-border">
                      <CardContent className="p-4">
                        <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-3">Resumo de Disponibilidade</h4>
                        <div className="space-y-2">
                          {activeTurnos.filter(t => turnoVagas[t.id] !== undefined).map(turno => {
                            const diasComTurno = turnoDays.filter(td => td.ativo && td.turnosAtivos.includes(turno.id)).length;
                            const vagasTurno = turnoVagas[turno.id] || 0;
                            return (
                              <div key={turno.id} className="flex items-center justify-between text-sm">
                                <span className="flex items-center gap-2">
                                  <span>{turno.horaInicio < '12:00' ? '🌅' : turno.horaInicio < '18:00' ? '🌆' : '🌙'}</span>
                                  <span className="font-medium">Turno {turno.nome}:</span>
                                </span>
                                <span className="text-muted-foreground">
                                  {vagasTurno} vagas/dia × {diasComTurno} dias = <strong className="text-foreground">{vagasTurno * diasComTurno} vagas/semana</strong>
                                </span>
                              </div>
                            );
                          })}
                          <div className="border-t border-border pt-2 mt-2 flex items-center justify-between text-sm font-semibold">
                            <span>Total:</span>
                            <span>{(() => {
                              const totalPerDay = activeTurnos
                                .filter(t => turnoVagas[t.id] !== undefined)
                                .reduce((s, t) => s + (turnoVagas[t.id] || 0), 0);
                              return `${totalPerDay} vagas/dia × ${turnoWeeklySummary.diasAtivos} dias = ${turnoWeeklySummary.totalVagas} vagas/semana`;
                            })()}</span>
                          </div>
                          <div className="text-xs text-muted-foreground mt-1">
                            <span>Dias ativos: {turnoDays.map((td, i) => td.ativo ? diasSemanaLabels[i] : null).filter(Boolean).join(' / ')}</span>
                            {turnoDays.some((td, i) => !td.ativo) && (
                              <span className="ml-2">• {turnoDays.map((td, i) => !td.ativo ? diasSemanaFull[i] : null).filter(Boolean).join(' e ')}: sem atendimento</span>
                            )}
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  </>
                )}
              </>
            )}

            <Button onClick={handleSave} disabled={!canSave} className="w-full gradient-primary text-primary-foreground">
              {saving ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Salvando...</> : isEditing ? 'Atualizar Disponibilidade' : 'Salvar Disponibilidade'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* List */}
      {disponibilidades.length === 0 ? (
        <Card className="shadow-card border-0"><CardContent className="p-8 text-center text-muted-foreground">
          <Clock className="w-12 h-12 mx-auto mb-3 text-muted-foreground/30" />
          Nenhuma disponibilidade configurada.
        </CardContent></Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {Array.from(groups.entries()).map(([key, records]) => {
            const first = records[0];
            const prof = funcionarios.find(f => f.id === first.profissionalId);
            const unidade = unidades.find(u => u.id === first.unidadeId);
            const isTurno = isGroupTurno(records);
            const profModo = modosPorProfissional[first.profissionalId] || 'por_hora';

            if (isTurno) {
              // Turno card
              const turnoMap = new Map<string, { turno: TurnoDefinition | undefined; vagas: number; days: number[] }>();
              records.forEach(r => {
                const tId = r.salaId || '';
                if (!turnoMap.has(tId)) {
                  turnoMap.set(tId, { turno: turnosGlobais.find(t => t.id === tId), vagas: r.vagasPorDia, days: [] });
                }
                r.diasSemana.forEach(d => { turnoMap.get(tId)!.days.push(d); });
              });

              return (
                <Card key={key} className="shadow-card border-0">
                  <CardContent className="p-4">
                    <div className="flex items-start justify-between mb-3">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 mb-1">
                          <h3 className="font-semibold text-foreground">{prof?.nome || 'Profissional'}</h3>
                          <Badge variant="secondary" className="text-[10px] gap-1">
                            <ClipboardList className="w-3 h-3" />Por Turno
                          </Badge>
                        </div>
                        <p className="text-sm text-muted-foreground">{unidade?.nome || 'Unidade'}</p>
                        <p className="text-xs text-muted-foreground mt-1">
                          <Calendar className="w-3.5 h-3.5 inline mr-1" />{first.dataInicio} a {first.dataFim}
                        </p>
                      </div>
                      <div className="flex gap-1 shrink-0">
                        <Button size="icon" variant="ghost" onClick={() => openEditGroup(key)}><Pencil className="w-4 h-4" /></Button>
                        <AlertDialog>
                          <AlertDialogTrigger asChild><Button size="icon" variant="ghost" className="text-destructive"><Trash2 className="w-4 h-4" /></Button></AlertDialogTrigger>
                          <AlertDialogContent>
                            <AlertDialogHeader><AlertDialogTitle>Excluir disponibilidade?</AlertDialogTitle><AlertDialogDescription>Todos os registros serão removidos.</AlertDialogDescription></AlertDialogHeader>
                            <AlertDialogFooter><AlertDialogCancel>Cancelar</AlertDialogCancel><AlertDialogAction onClick={async () => { for (const r of records) { await deleteDisponibilidade(r.id); } toast.success('Disponibilidade excluída!'); }}>Excluir</AlertDialogAction></AlertDialogFooter>
                          </AlertDialogContent>
                        </AlertDialog>
                      </div>
                    </div>

                    <div className="space-y-1.5 mb-3">
                      {Array.from(turnoMap.entries()).map(([tId, info]) => (
                        <div key={tId} className="flex items-center gap-2 text-xs">
                          <Badge variant="outline" className="text-[10px]">{info.turno?.nome || tId}</Badge>
                          <span className="text-muted-foreground">{info.turno?.horaInicio}–{info.turno?.horaFim}</span>
                          <span className="font-medium">{info.vagas} vagas (configurado)</span>
                          <span className="text-muted-foreground">• {info.days.sort().map(d => diasSemanaLabels[d]).join(', ')}</span>
                        </div>
                      ))}
                    </div>

                    {todayStr >= first.dataInicio && todayStr <= first.dataFim && (
                      <div className="mt-2">
                        <SlotInfoBadge profissionalId={first.profissionalId} unidadeId={first.unidadeId} date={todayStr} />
                      </div>
                    )}
                  </CardContent>
                </Card>
              );
            }

            // Por Hora card (existing)
            const sala = first.salaId ? salas.find(s => s.id === first.salaId) : null;
            const dayEntries = records
              .flatMap(r => r.diasSemana.map(dayNum => ({ dayNum, horaInicio: r.horaInicio, horaFim: r.horaFim, id: r.id })))
              .sort((a, b) => a.dayNum - b.dayNum);
            const hasWeekend = dayEntries.some(de => de.dayNum === 0 || de.dayNum === 6);
            const allIds = records.map(r => r.id);

            return (
              <Card key={key} className="shadow-card border-0">
                <CardContent className="p-4">
                  <div className="flex items-start justify-between mb-3">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <h3 className="font-semibold text-foreground">{prof?.nome || 'Profissional não encontrado'}</h3>
                        <Badge variant="secondary" className="text-[10px] gap-1">
                          <Clock className="w-3 h-3" />Por Hora
                        </Badge>
                      </div>
                      <p className="text-sm text-muted-foreground">{unidade?.nome || 'Unidade'}{sala ? ` • ${sala.nome}` : ''}</p>
                      <p className="text-xs text-muted-foreground mt-1">
                        <Calendar className="w-3.5 h-3.5 inline mr-1" />{first.dataInicio} a {first.dataFim}
                      </p>
                    </div>
                    <div className="flex gap-1 shrink-0">
                      <Button size="icon" variant="ghost" onClick={() => openEditGroup(key)}><Pencil className="w-4 h-4" /></Button>
                      <AlertDialog>
                        <AlertDialogTrigger asChild><Button size="icon" variant="ghost" className="text-destructive"><Trash2 className="w-4 h-4" /></Button></AlertDialogTrigger>
                        <AlertDialogContent>
                          <AlertDialogHeader><AlertDialogTitle>Excluir disponibilidade?</AlertDialogTitle><AlertDialogDescription>Todos os {records.length} registro(s) deste grupo serão removidos.</AlertDialogDescription></AlertDialogHeader>
                          <AlertDialogFooter><AlertDialogCancel>Cancelar</AlertDialogCancel><AlertDialogAction onClick={async () => { for (const id of allIds) { await deleteDisponibilidade(id); } toast.success('Disponibilidade excluída!'); }}>Excluir</AlertDialogAction></AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                    </div>
                  </div>

                  <div className="flex flex-wrap gap-1.5 mb-3">
                    {dayEntries.map((de, i) => {
                      const isWeekend = de.dayNum === 0 || de.dayNum === 6;
                      return (
                        <span key={i} className={cn(
                          "inline-flex items-center gap-1 text-xs font-medium px-2.5 py-1 rounded-full border",
                          isWeekend
                            ? "bg-orange-100 text-orange-700 border-orange-200 dark:bg-orange-500/15 dark:text-orange-400 dark:border-orange-500/30"
                            : "bg-primary/10 text-primary border-primary/20"
                        )}>
                          {diasSemanaLabels[de.dayNum]} {de.horaInicio}–{de.horaFim}
                        </span>
                      );
                    })}
                  </div>

                  <div className="flex items-center gap-3 text-xs text-muted-foreground border-t border-border pt-2">
                    <span>{first.vagasPorHora} vagas/hora</span>
                    <span>•</span>
                    <span>{first.vagasPorDia} vagas/dia (configurado)</span>
                    <span>•</span>
                    <span>{first.duracaoConsulta || 30}min/consulta</span>
                  </div>

                  {hasWeekend && (
                    <span className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full bg-orange-100 text-orange-600 dark:bg-orange-500/20 dark:text-orange-400 mt-2">
                      ⚠️ Ativo no fim de semana
                    </span>
                  )}

                  {todayStr >= first.dataInicio && todayStr <= first.dataFim && (
                    <div className="mt-2">
                      <SlotInfoBadge profissionalId={first.profissionalId} unidadeId={first.unidadeId} date={todayStr} />
                    </div>
                  )}
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