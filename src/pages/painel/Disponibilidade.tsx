import React, { useState, useEffect, useMemo } from 'react';
import { useData } from '@/contexts/DataContext';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog';
import { Switch } from '@/components/ui/switch';
import { Plus, Clock, Calendar, Pencil, Trash2, RefreshCw } from 'lucide-react';
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
  { ativo: false, horaInicio: '08:00', horaFim: '17:00' }, // Dom
  { ativo: true, horaInicio: '08:00', horaFim: '17:00' },  // Seg
  { ativo: true, horaInicio: '08:00', horaFim: '17:00' },  // Ter
  { ativo: true, horaInicio: '08:00', horaFim: '17:00' },  // Qua
  { ativo: true, horaInicio: '08:00', horaFim: '17:00' },  // Qui
  { ativo: true, horaInicio: '08:00', horaFim: '17:00' },  // Sex
  { ativo: false, horaInicio: '08:00', horaFim: '17:00' }, // Sáb
];

const Disponibilidade: React.FC = () => {
  const { disponibilidades, addDisponibilidade, updateDisponibilidade, deleteDisponibilidade, funcionarios, unidades, salas, refreshFuncionarios, refreshDisponibilidades } = useData();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);

  const profissionais = funcionarios.filter(f => f.role === 'profissional' && f.ativo);
  const { unidadesVisiveis } = useUnidadeFilter();

  const [form, setForm] = useState({
    profissionalId: '', unidadeId: '', salaId: '', dataInicio: '', dataFim: '',
    vagasPorHora: 3, vagasPorDia: 25, duracaoConsulta: 30,
  });

  const [daySchedules, setDaySchedules] = useState<DaySchedule[]>(defaultDaySchedules.map(d => ({ ...d })));

  const todayStr = new Date().toISOString().split('T')[0];

  useEffect(() => {
    refreshFuncionarios();
    refreshDisponibilidades();
  }, []);

  const openNew = () => {
    setEditId(null);
    setForm({ profissionalId: '', unidadeId: '', salaId: '', dataInicio: '', dataFim: '', vagasPorHora: 3, vagasPorDia: 25, duracaoConsulta: 30 });
    setDaySchedules(defaultDaySchedules.map(d => ({ ...d })));
    setDialogOpen(true);
  };

  const openEdit = (d: typeof disponibilidades[0]) => {
    setEditId(d.id);
    setForm({
      profissionalId: d.profissionalId, unidadeId: d.unidadeId, salaId: d.salaId || '',
      dataInicio: d.dataInicio, dataFim: d.dataFim,
      vagasPorHora: d.vagasPorHora, vagasPorDia: d.vagasPorDia,
      duracaoConsulta: d.duracaoConsulta || 30,
    });
    // Populate day schedules from this single record
    const newSchedules = defaultDaySchedules.map(ds => ({ ...ds, ativo: false }));
    d.diasSemana.forEach(dayNum => {
      if (dayNum >= 0 && dayNum <= 6) {
        newSchedules[dayNum] = { ativo: true, horaInicio: d.horaInicio, horaFim: d.horaFim };
      }
    });
    setDaySchedules(newSchedules);
    setDialogOpen(true);
  };

  const handleSave = async () => {
    if (!form.profissionalId || !form.unidadeId || !form.dataInicio || !form.dataFim) {
      toast.error('Preencha todos os campos obrigatórios.');
      return;
    }
    const activeDays = daySchedules.map((ds, i) => ({ ...ds, dayNum: i })).filter(ds => ds.ativo);
    if (activeDays.length === 0) {
      toast.error('Ative pelo menos um dia da semana.');
      return;
    }

    // Validate each active day
    for (const day of activeDays) {
      const startH = parseInt(day.horaInicio.split(':')[0]);
      const endH = parseInt(day.horaFim.split(':')[0]);
      if (endH <= startH) {
        toast.error(`${diasSemanaFull[day.dayNum]}: Hora fim deve ser maior que hora início.`);
        return;
      }
      const hoursCount = endH - startH;
      const maxPossible = hoursCount * form.vagasPorHora;
      if (form.vagasPorDia > maxPossible) {
        toast.error(`${diasSemanaFull[day.dayNum]}: Total por dia (${form.vagasPorDia}) excede o máximo possível (${maxPossible}).`);
        return;
      }
    }

    try {
      // If editing, delete the old record first
      if (editId) {
        await deleteDisponibilidade(editId);
      }

      // Create one record per active day
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

      toast.success(editId ? 'Disponibilidade atualizada!' : `${activeDays.length} registro(s) de disponibilidade criado(s)!`);
    } catch (err) {
      console.error('Erro ao salvar disponibilidade:', err);
      toast.error('Erro ao salvar disponibilidade.');
    }

    setDialogOpen(false);
    await refreshDisponibilidades();
  };

  const updateDaySchedule = (dayIndex: number, field: keyof DaySchedule, value: any) => {
    setDaySchedules(prev => prev.map((ds, i) => i === dayIndex ? { ...ds, [field]: value } : ds));
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

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle className="font-display">{editId ? 'Editar' : 'Configurar'} Disponibilidade</DialogTitle></DialogHeader>
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
              <div><Label>Data Início *</Label><Input type="date" value={form.dataInicio} onChange={e => setForm(p => ({ ...p, dataInicio: e.target.value }))} /></div>
              <div><Label>Data Fim *</Label><Input type="date" value={form.dataFim} onChange={e => setForm(p => ({ ...p, dataFim: e.target.value }))} /></div>
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div><Label>Vagas/Hora</Label><Input type="number" min={1} value={form.vagasPorHora} onChange={e => setForm(p => ({ ...p, vagasPorHora: parseInt(e.target.value) || 1 }))} /></div>
              <div><Label>Vagas/Dia</Label><Input type="number" min={1} value={form.vagasPorDia} onChange={e => setForm(p => ({ ...p, vagasPorDia: parseInt(e.target.value) || 1 }))} /></div>
              <div><Label>Duração (min)</Label><Input type="number" min={10} step={5} value={form.duracaoConsulta} onChange={e => setForm(p => ({ ...p, duracaoConsulta: parseInt(e.target.value) || 30 }))} /></div>
            </div>

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
                  return (
                    <div key={i} className={cn(
                      "grid grid-cols-[1fr_auto_1fr_1fr] gap-0 items-center px-3 py-2 border-b border-border last:border-b-0",
                      !ds.ativo && "bg-muted/20",
                      isFds && ds.ativo && "bg-orange-500/5",
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
                          type="time"
                          value={ds.horaInicio}
                          onChange={e => updateDaySchedule(i, 'horaInicio', e.target.value)}
                          disabled={!ds.ativo}
                          className="h-8 text-xs"
                        />
                      </div>
                      <div className="px-1">
                        <Input
                          type="time"
                          value={ds.horaFim}
                          onChange={e => updateDaySchedule(i, 'horaFim', e.target.value)}
                          disabled={!ds.ativo}
                          className="h-8 text-xs"
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
              {daySchedules.some((ds, i) => ds.ativo && (i === 0 || i === 6)) && (
                <p className="text-xs text-orange-500 mt-2 flex items-center gap-1">
                  ⚠️ Atenção: disponibilidade em fim de semana. Certifique-se de que é intencional.
                </p>
              )}
            </div>
            <Button onClick={handleSave} className="w-full gradient-primary text-primary-foreground">Salvar</Button>
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
          {(() => {
            // Group by profissionalId + dataInicio + dataFim
            const groups = new Map<string, typeof disponibilidades>();
            disponibilidades.forEach(d => {
              const key = `${d.profissionalId}|${d.dataInicio}|${d.dataFim}`;
              if (!groups.has(key)) groups.set(key, []);
              groups.get(key)!.push(d);
            });

            return Array.from(groups.entries()).map(([key, records]) => {
              const first = records[0];
              const prof = funcionarios.find(f => f.id === first.profissionalId);
              const unidade = unidades.find(u => u.id === first.unidadeId);
              const sala = first.salaId ? salas.find(s => s.id === first.salaId) : null;

              // Build per-day info sorted by day number
              const dayEntries = records
                .flatMap(r => r.diasSemana.map(dayNum => ({ dayNum, horaInicio: r.horaInicio, horaFim: r.horaFim, id: r.id })))
                .sort((a, b) => a.dayNum - b.dayNum);

              const hasWeekend = dayEntries.some(de => de.dayNum === 0 || de.dayNum === 6);
              const allIds = records.map(r => r.id);

              return (
                <Card key={key} className="shadow-card border-0">
                  <CardContent className="p-4">
                    {/* Header */}
                    <div className="flex items-start justify-between mb-3">
                      <div className="min-w-0 flex-1">
                        <h3 className="font-semibold text-foreground">{prof?.nome || 'Profissional não encontrado'}</h3>
                        <p className="text-sm text-muted-foreground">{unidade?.nome || 'Unidade não encontrada'}{sala ? ` • ${sala.nome}` : ''}</p>
                        <p className="text-xs text-muted-foreground mt-1">
                          <Calendar className="w-3.5 h-3.5 inline mr-1" />{first.dataInicio} a {first.dataFim}
                        </p>
                      </div>
                      <div className="flex gap-1 shrink-0">
                        <Button size="icon" variant="ghost" onClick={() => openEdit(first)}><Pencil className="w-4 h-4" /></Button>
                        <AlertDialog>
                          <AlertDialogTrigger asChild><Button size="icon" variant="ghost" className="text-destructive"><Trash2 className="w-4 h-4" /></Button></AlertDialogTrigger>
                          <AlertDialogContent>
                            <AlertDialogHeader><AlertDialogTitle>Excluir disponibilidade?</AlertDialogTitle><AlertDialogDescription>Essa ação não pode ser desfeita. Todos os {records.length} registro(s) deste grupo serão removidos.</AlertDialogDescription></AlertDialogHeader>
                            <AlertDialogFooter><AlertDialogCancel>Cancelar</AlertDialogCancel><AlertDialogAction onClick={async () => { for (const id of allIds) { await deleteDisponibilidade(id); } toast.success('Disponibilidade excluída!'); }}>Excluir</AlertDialogAction></AlertDialogFooter>
                          </AlertDialogContent>
                        </AlertDialog>
                      </div>
                    </div>

                    {/* Day pills */}
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

                    {/* Footer */}
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
            });
          })()}
        </div>
      )}
    </div>
  );
};

export default Disponibilidade;
