import React, { useState, useEffect, useMemo, useRef } from 'react';
import { useData } from '@/contexts/DataContext';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog';
import { Switch } from '@/components/ui/switch';
import { Plus, Clock, Calendar, Pencil, Trash2, RefreshCw, Loader2, Info } from 'lucide-react';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import { useUnidadeFilter } from '@/hooks/useUnidadeFilter';
import { SlotInfoBadge } from '@/components/SlotInfoBadge';

const diasSemanaLabels = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
const diasSemanaFull = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'];

interface DaySchedule {
  ativo: boolean;
  horaInicio: string;
  horaFim: string;
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

// Helper: parse "HH:MM" to minutes
const timeToMin = (t: string) => {
  const [h, m] = t.split(':').map(Number);
  return (h || 0) * 60 + (m || 0);
};

// Helper: check date range overlap
const rangesOverlap = (a1: string, a2: string, b1: string, b2: string) => a1 <= b2 && b1 <= a2;

const Disponibilidade: React.FC = () => {
  const { disponibilidades, addDisponibilidade, updateDisponibilidade, deleteDisponibilidade, funcionarios, unidades, salas, refreshFuncionarios, refreshDisponibilidades } = useData();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editGroupIds, setEditGroupIds] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);

  const profissionais = funcionarios.filter(f => f.role === 'profissional' && f.ativo);
  const { unidadesVisiveis } = useUnidadeFilter();

  const [form, setForm] = useState({
    profissionalId: '', unidadeId: '', salaId: '', dataInicio: '', dataFim: '',
    vagasPorHora: 3, vagasPorDia: 25, duracaoConsulta: 30, intervalo: 0,
  });

  const [daySchedules, setDaySchedules] = useState<DaySchedule[]>(defaultDaySchedules.map(d => ({ ...d })));
  const dayInputRefs = useRef<(HTMLInputElement | null)[]>([]);

  const todayStr = new Date().toISOString().split('T')[0];

  const isEditing = editGroupIds.length > 0;

  useEffect(() => {
    refreshFuncionarios();
    refreshDisponibilidades();
  }, []);

  // Auto-calculate suggested vagas/hora
  const suggestedVagasHora = useMemo(() => {
    const totalMin = form.duracaoConsulta + form.intervalo;
    if (totalMin <= 0) return 1;
    return Math.floor(60 / totalMin) || 1;
  }, [form.duracaoConsulta, form.intervalo]);

  const activeDaysCount = daySchedules.filter(ds => ds.ativo).length;

  // Build groups map for reuse
  const groups = useMemo(() => {
    const map = new Map<string, typeof disponibilidades>();
    disponibilidades.forEach(d => {
      const key = `${d.profissionalId}|${d.dataInicio}|${d.dataFim}`;
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(d);
    });
    return map;
  }, [disponibilidades]);

  const openNew = () => {
    setEditGroupIds([]);
    setForm({ profissionalId: '', unidadeId: '', salaId: '', dataInicio: '', dataFim: '', vagasPorHora: 3, vagasPorDia: 25, duracaoConsulta: 30, intervalo: 0 });
    setDaySchedules(defaultDaySchedules.map(d => ({ ...d })));
    setDialogOpen(true);
  };

  const openEditGroup = (groupKey: string) => {
    const records = groups.get(groupKey);
    if (!records || records.length === 0) return;
    const first = records[0];
    setEditGroupIds(records.map(r => r.id));
    setForm({
      profissionalId: first.profissionalId, unidadeId: first.unidadeId, salaId: first.salaId || '',
      dataInicio: first.dataInicio, dataFim: first.dataFim,
      vagasPorHora: first.vagasPorHora, vagasPorDia: first.vagasPorDia,
      duracaoConsulta: first.duracaoConsulta || 30, intervalo: 0,
    });
    const newSchedules = defaultDaySchedules.map(ds => ({ ...ds, ativo: false }));
    records.forEach(r => {
      r.diasSemana.forEach(dayNum => {
        if (dayNum >= 0 && dayNum <= 6) {
          newSchedules[dayNum] = { ativo: true, horaInicio: r.horaInicio, horaFim: r.horaFim };
        }
      });
    });
    setDaySchedules(newSchedules);
    setDialogOpen(true);
  };

  // Validation helpers
  const getDayErrors = () => {
    const errors: Record<number, string> = {};
    daySchedules.forEach((ds, i) => {
      if (!ds.ativo) return;
      const startMin = timeToMin(ds.horaInicio);
      const endMin = timeToMin(ds.horaFim);
      if (endMin <= startMin) {
        errors[i] = 'Hora Fim deve ser maior que Hora Início';
      } else if (startMin < 360 || endMin > 1320) { // 06:00 = 360, 22:00 = 1320
        errors[i] = 'Horário deve estar entre 06:00 e 22:00';
      }
    });
    return errors;
  };

  const dayErrors = getDayErrors();
  const hasDateError = form.dataInicio && form.dataFim && form.dataFim < form.dataInicio;
  const canSave = activeDaysCount > 0 && !hasDateError && Object.keys(dayErrors).length === 0 && !saving;

  const checkOverlap = (): string | null => {
    for (const [key, records] of groups.entries()) {
      const first = records[0];
      if (first.profissionalId !== form.profissionalId || first.unidadeId !== form.unidadeId) continue;
      // Skip the group being edited
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
    const activeDays = daySchedules.map((ds, i) => ({ ...ds, dayNum: i })).filter(ds => ds.ativo);
    if (activeDays.length === 0) {
      toast.error('Ative pelo menos um dia da semana.');
      return;
    }
    if (Object.keys(dayErrors).length > 0) {
      toast.error('Corrija os erros de horário antes de salvar.');
      return;
    }

    // Validate vagas/dia vs capacity
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

    // Check overlap
    const overlapMsg = checkOverlap();
    if (overlapMsg) {
      toast.error(overlapMsg);
      return;
    }

    setSaving(true);
    try {
      if (isEditing) {
        // Delete all old records of this group, then insert new ones
        for (const id of editGroupIds) {
          await deleteDisponibilidade(id);
        }
      }

      for (const day of activeDays) {
        await addDisponibilidade({
          id: `d${Date.now()}_${day.dayNum}`,
          profissionalId: form.profissionalId,
          unidadeId: form.unidadeId,
          salaId: form.salaId,
          dataInicio: form.dataInicio,
          dataFim: form.dataFim,
          horaInicio: day.horaInicio,
          horaFim: day.horaFim,
          vagasPorHora: form.vagasPorHora,
          vagasPorDia: form.vagasPorDia,
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
    } finally {
      setSaving(false);
    }
  };

  const updateDaySchedule = (dayIndex: number, field: keyof DaySchedule, value: any) => {
    setDaySchedules(prev => prev.map((ds, i) => {
      if (i !== dayIndex) return ds;
      if (field === 'ativo' && !value) {
        return { ...ds, ativo: false, horaInicio: '08:00', horaFim: '17:00' };
      }
      return { ...ds, [field]: value };
    }));
    // Focus start time input when activating a day
    if (field === 'ativo' && value) {
      setTimeout(() => dayInputRefs.current[dayIndex]?.focus(), 100);
    }
  };

  const filteredSalas = salas.filter(s => s.unidadeId === form.unidadeId && s.ativo);

  const handleProfissionalChange = (profId: string) => {
    const prof = profissionais.find(p => p.id === profId);
    setForm(p => ({
      ...p,
      profissionalId: profId,
      unidadeId: prof?.unidadeId || p.unidadeId,
      salaId: prof?.salaId || '',
    }));
  };

  const handleRefresh = async () => {
    await Promise.all([refreshFuncionarios(), refreshDisponibilidades()]);
    toast.success('Dados atualizados!');
  };

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

      <Dialog open={dialogOpen} onOpenChange={v => { if (!saving) setDialogOpen(v); }}>
        <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle className="font-display">{isEditing ? 'Editar' : 'Configurar'} Disponibilidade</DialogTitle></DialogHeader>
          <div className="space-y-4">
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
            {filteredSalas.length > 0 && (
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

            {/* Vagas, Duração, Intervalo */}
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
                Sugestão baseada na duração + intervalo: <strong>{suggestedVagasHora} vaga(s)/hora</strong>
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
                          <Switch
                            checked={ds.ativo}
                            onCheckedChange={(checked) => updateDaySchedule(i, 'ativo', checked)}
                          />
                        </div>
                        <div className="px-1">
                          <Input
                            ref={el => { dayInputRefs.current[i] = el; }}
                            type="time"
                            value={ds.horaInicio}
                            onChange={e => updateDaySchedule(i, 'horaInicio', e.target.value)}
                            disabled={!ds.ativo}
                            className={cn("h-8 text-xs", error && "border-destructive")}
                          />
                        </div>
                        <div className="px-1">
                          <Input
                            type="time"
                            value={ds.horaFim}
                            onChange={e => updateDaySchedule(i, 'horaFim', e.target.value)}
                            disabled={!ds.ativo}
                            className={cn("h-8 text-xs", error && "border-destructive")}
                          />
                        </div>
                      </div>
                      {error && (
                        <p className="text-[11px] text-destructive px-3 py-1 bg-destructive/5 border-b border-border">{error}</p>
                      )}
                    </div>
                  );
                })}
              </div>

              {/* Active days counter */}
              <p className="text-xs text-muted-foreground mt-2">
                {activeDaysCount} dia(s) ativo(s) nesta disponibilidade
              </p>

              {daySchedules.some((ds, i) => ds.ativo && (i === 0 || i === 6)) && (
                <p className="text-xs text-orange-500 mt-1 flex items-center gap-1">
                  ⚠️ Atenção: disponibilidade em fim de semana.
                </p>
              )}
            </div>

            <Button
              onClick={handleSave}
              disabled={!canSave}
              className="w-full gradient-primary text-primary-foreground"
            >
              {saving ? (
                <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Salvando...</>
              ) : (
                isEditing ? 'Atualizar Disponibilidade' : 'Salvar Disponibilidade'
              )}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {disponibilidades.length === 0 ? (
        <Card className="shadow-card border-0"><CardContent className="p-8 text-center text-muted-foreground">
          <Clock className="w-12 h-12 mx-auto mb-3 text-muted-foreground/30" />
          Nenhuma disponibilidade configurada. Configure para que os horários apareçam no agendamento online.
        </CardContent></Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {Array.from(groups.entries()).map(([key, records]) => {
            const first = records[0];
            const prof = funcionarios.find(f => f.id === first.profissionalId);
            const unidade = unidades.find(u => u.id === first.unidadeId);
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
                      <h3 className="font-semibold text-foreground">{prof?.nome || 'Profissional não encontrado'}</h3>
                      <p className="text-sm text-muted-foreground">{unidade?.nome || 'Unidade não encontrada'}{sala ? ` • ${sala.nome}` : ''}</p>
                      <p className="text-xs text-muted-foreground mt-1">
                        <Calendar className="w-3.5 h-3.5 inline mr-1" />{first.dataInicio} a {first.dataFim}
                      </p>
                    </div>
                    <div className="flex gap-1 shrink-0">
                      <Button size="icon" variant="ghost" onClick={() => openEditGroup(key)}><Pencil className="w-4 h-4" /></Button>
                      <AlertDialog>
                        <AlertDialogTrigger asChild><Button size="icon" variant="ghost" className="text-destructive"><Trash2 className="w-4 h-4" /></Button></AlertDialogTrigger>
                        <AlertDialogContent>
                          <AlertDialogHeader><AlertDialogTitle>Excluir disponibilidade?</AlertDialogTitle><AlertDialogDescription>Essa ação não pode ser desfeita. Todos os {records.length} registro(s) deste grupo serão removidos.</AlertDialogDescription></AlertDialogHeader>
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
                    <span>{first.vagasPorDia} vagas/dia</span>
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
