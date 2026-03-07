import React, { useState, useEffect } from 'react';
import { useData } from '@/contexts/DataContext';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog';
import { Plus, Clock, Calendar, Pencil, Trash2, RefreshCw } from 'lucide-react';
import { toast } from 'sonner';

const diasSemanaLabels = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
const diasSemanaFull = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'];

const Disponibilidade: React.FC = () => {
  const { disponibilidades, addDisponibilidade, updateDisponibilidade, deleteDisponibilidade, funcionarios, unidades, salas, refreshFuncionarios, refreshDisponibilidades } = useData();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  
  // Filter: only active professionals with role=profissional
  const profissionais = funcionarios.filter(f => f.role === 'profissional' && f.ativo);
  
  const [form, setForm] = useState({
    profissionalId: '', unidadeId: '', salaId: '', dataInicio: '', dataFim: '',
    horaInicio: '08:00', horaFim: '17:00', vagasPorHora: 3, vagasPorDia: 25, diasSemana: [1, 2, 3, 4, 5] as number[],
  });

  // Refresh data on mount to ensure latest professionals appear
  useEffect(() => {
    refreshFuncionarios();
    refreshDisponibilidades();
  }, []);

  const openNew = () => {
    setEditId(null);
    setForm({ profissionalId: '', unidadeId: '', salaId: '', dataInicio: '', dataFim: '', horaInicio: '08:00', horaFim: '17:00', vagasPorHora: 3, vagasPorDia: 25, diasSemana: [1, 2, 3, 4, 5] });
    setDialogOpen(true);
  };

  const openEdit = (d: typeof disponibilidades[0]) => {
    setEditId(d.id);
    setForm({
      profissionalId: d.profissionalId, unidadeId: d.unidadeId, salaId: d.salaId || '',
      dataInicio: d.dataInicio, dataFim: d.dataFim, horaInicio: d.horaInicio, horaFim: d.horaFim,
      vagasPorHora: d.vagasPorHora, vagasPorDia: d.vagasPorDia, diasSemana: [...d.diasSemana],
    });
    setDialogOpen(true);
  };

  const handleSave = async () => {
    if (!form.profissionalId || !form.unidadeId || !form.dataInicio || !form.dataFim) {
      toast.error('Preencha todos os campos obrigatórios.');
      return;
    }
    if (form.diasSemana.length === 0) {
      toast.error('Selecione pelo menos um dia da semana.');
      return;
    }

    const startH = parseInt(form.horaInicio.split(':')[0]);
    const endH = parseInt(form.horaFim.split(':')[0]);
    const hoursCount = endH - startH;
    if (hoursCount <= 0) {
      toast.error('Hora fim deve ser maior que hora início.');
      return;
    }
    const maxPossible = hoursCount * form.vagasPorHora;
    if (form.vagasPorDia > maxPossible) {
      toast.error(`Total por dia (${form.vagasPorDia}) excede o máximo possível (${maxPossible} = ${hoursCount}h × ${form.vagasPorHora} vagas/hora). Ajuste os valores.`);
      return;
    }

    if (editId) {
      await updateDisponibilidade(editId, { ...form });
      toast.success('Disponibilidade atualizada!');
    } else {
      await addDisponibilidade({ id: `d${Date.now()}`, ...form });
      toast.success('Disponibilidade configurada!');
    }
    setDialogOpen(false);
    // Refresh to ensure we have latest from DB
    await refreshDisponibilidades();
  };

  const toggleDia = (dia: number) => {
    setForm(p => ({
      ...p, diasSemana: p.diasSemana.includes(dia) ? p.diasSemana.filter(d => d !== dia) : [...p.diasSemana, dia],
    }));
  };

  const filteredSalas = salas.filter(s => s.unidadeId === form.unidadeId && s.ativo);

  // When selecting a professional, auto-fill their unit
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
        <DialogContent className="sm:max-w-lg">
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
                  <SelectContent>{unidades.filter(u => u.ativo).map(u => <SelectItem key={u.id} value={u.id}>{u.nome}</SelectItem>)}</SelectContent>
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
            <div className="grid grid-cols-2 gap-3">
              <div><Label>Hora Início</Label><Input type="time" value={form.horaInicio} onChange={e => setForm(p => ({ ...p, horaInicio: e.target.value }))} /></div>
              <div><Label>Hora Fim</Label><Input type="time" value={form.horaFim} onChange={e => setForm(p => ({ ...p, horaFim: e.target.value }))} /></div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div><Label>Vagas por Hora</Label><Input type="number" min={1} value={form.vagasPorHora} onChange={e => setForm(p => ({ ...p, vagasPorHora: parseInt(e.target.value) || 1 }))} /></div>
              <div><Label>Total Vagas por Dia</Label><Input type="number" min={1} value={form.vagasPorDia} onChange={e => setForm(p => ({ ...p, vagasPorDia: parseInt(e.target.value) || 1 }))} /></div>
            </div>
            <div>
              <Label className="mb-2 block">Dias da Semana</Label>
              <div className="grid grid-cols-7 gap-1.5">
                {diasSemanaLabels.map((label, i) => (
                  <Button
                    key={i}
                    type="button"
                    size="sm"
                    variant={form.diasSemana.includes(i) ? 'default' : 'outline'}
                    className={`w-full text-center text-xs font-medium ${form.diasSemana.includes(i) ? 'gradient-primary text-primary-foreground' : ''}`}
                    onClick={() => toggleDia(i)}
                  >
                    {label}
                  </Button>
                ))}
              </div>
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
          {disponibilidades.map(d => {
            const prof = funcionarios.find(f => f.id === d.profissionalId);
            const unidade = unidades.find(u => u.id === d.unidadeId);
            const sala = d.salaId ? salas.find(s => s.id === d.salaId) : null;
            return (
              <Card key={d.id} className="shadow-card border-0">
                <CardContent className="p-4">
                  <div className="flex items-start justify-between">
                    <div className="min-w-0 flex-1">
                      <h3 className="font-semibold text-foreground">{prof?.nome || 'Profissional não encontrado'}</h3>
                      <p className="text-sm text-muted-foreground">{unidade?.nome || 'Unidade não encontrada'}{sala ? ` • ${sala.nome}` : ''}</p>
                      <div className="mt-2 space-y-1 text-sm text-muted-foreground">
                        <p><Calendar className="w-3.5 h-3.5 inline mr-1" />{d.dataInicio} a {d.dataFim}</p>
                        <p><Clock className="w-3.5 h-3.5 inline mr-1" />{d.horaInicio} — {d.horaFim}</p>
                        <p>Vagas: {d.vagasPorHora}/hora • {d.vagasPorDia}/dia</p>
                        <p>Dias: {d.diasSemana.sort((a, b) => a - b).map(i => diasSemanaFull[i]).join(', ')}</p>
                        {prof?.tempoAtendimento && <p>Duração consulta: {prof.tempoAtendimento}min</p>}
                      </div>
                    </div>
                    <div className="flex gap-1 shrink-0">
                      <Button size="icon" variant="ghost" onClick={() => openEdit(d)}><Pencil className="w-4 h-4" /></Button>
                      <AlertDialog>
                        <AlertDialogTrigger asChild><Button size="icon" variant="ghost" className="text-destructive"><Trash2 className="w-4 h-4" /></Button></AlertDialogTrigger>
                        <AlertDialogContent>
                          <AlertDialogHeader><AlertDialogTitle>Excluir disponibilidade?</AlertDialogTitle><AlertDialogDescription>Essa ação não pode ser desfeita. Os horários vinculados não aparecerão mais no agendamento online.</AlertDialogDescription></AlertDialogHeader>
                          <AlertDialogFooter><AlertDialogCancel>Cancelar</AlertDialogCancel><AlertDialogAction onClick={async () => { await deleteDisponibilidade(d.id); toast.success('Disponibilidade excluída!'); }}>Excluir</AlertDialogAction></AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                    </div>
                  </div>
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
