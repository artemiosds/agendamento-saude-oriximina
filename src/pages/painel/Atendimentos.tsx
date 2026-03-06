import React, { useState } from 'react';
import { useData } from '@/contexts/DataContext';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Plus } from 'lucide-react';

const Atendimentos: React.FC = () => {
  const { atendimentos, addAtendimento, pacientes, funcionarios, salas } = useData();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [form, setForm] = useState({ pacienteId: '', profissionalId: '', salaId: '', procedimento: '', observacoes: '' });

  const profissionais = funcionarios.filter(f => f.role === 'profissional');

  const handleCreate = () => {
    const pac = pacientes.find(p => p.id === form.pacienteId);
    const prof = profissionais.find(p => p.id === form.profissionalId);
    if (!pac || !prof) return;
    const now = new Date();
    addAtendimento({
      id: `at${Date.now()}`,
      agendamentoId: '',
      pacienteId: pac.id,
      pacienteNome: pac.nome,
      profissionalId: prof.id,
      profissionalNome: prof.nome,
      unidadeId: prof.unidadeId,
      salaId: form.salaId,
      setor: prof.setor,
      procedimento: form.procedimento,
      observacoes: form.observacoes,
      data: now.toISOString().split('T')[0],
      hora: now.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }),
    });
    setDialogOpen(false);
    setForm({ pacienteId: '', profissionalId: '', salaId: '', procedimento: '', observacoes: '' });
  };

  return (
    <div className="space-y-4 animate-fade-in">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold font-display text-foreground">Atendimentos</h1>
          <p className="text-muted-foreground text-sm">{atendimentos.length} registros</p>
        </div>
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger asChild>
            <Button className="gradient-primary text-primary-foreground"><Plus className="w-4 h-4 mr-2" />Registrar</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle className="font-display">Registrar Atendimento</DialogTitle></DialogHeader>
            <div className="space-y-3">
              <div><Label>Paciente</Label>
                <Select value={form.pacienteId} onValueChange={v => setForm(p => ({ ...p, pacienteId: v }))}>
                  <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                  <SelectContent>{pacientes.map(p => <SelectItem key={p.id} value={p.id}>{p.nome}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div><Label>Profissional</Label>
                <Select value={form.profissionalId} onValueChange={v => setForm(p => ({ ...p, profissionalId: v }))}>
                  <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                  <SelectContent>{profissionais.map(p => <SelectItem key={p.id} value={p.id}>{p.nome}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div><Label>Procedimento</Label><Input value={form.procedimento} onChange={e => setForm(p => ({ ...p, procedimento: e.target.value }))} /></div>
              <div><Label>Observações</Label><Input value={form.observacoes} onChange={e => setForm(p => ({ ...p, observacoes: e.target.value }))} /></div>
              <Button onClick={handleCreate} className="w-full gradient-primary text-primary-foreground">Registrar</Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      <div className="space-y-2">
        {atendimentos.map(at => (
          <Card key={at.id} className="shadow-card border-0">
            <CardContent className="p-4 flex flex-col sm:flex-row items-start sm:items-center gap-3">
              <span className="text-sm font-mono font-medium text-primary w-20 shrink-0">{at.data} {at.hora}</span>
              <div className="flex-1">
                <p className="font-semibold text-foreground">{at.pacienteNome}</p>
                <p className="text-sm text-muted-foreground">{at.profissionalNome} • {at.procedimento}</p>
              </div>
              <span className="text-xs text-muted-foreground">{at.setor}</span>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
};

export default Atendimentos;
