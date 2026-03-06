import React, { useState } from 'react';
import { useData } from '@/contexts/DataContext';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Calendar, CheckCircle, ArrowLeft } from 'lucide-react';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { toast } from 'sonner';

const AgendarOnline: React.FC = () => {
  const { unidades, salas, funcionarios, setores, addAgendamento, addPaciente } = useData();
  const [step, setStep] = useState(1);
  const [done, setDone] = useState(false);

  const [form, setForm] = useState({
    unidadeId: '', salaId: '', profissionalId: '', setorId: '', tipo: 'Consulta',
    nome: '', cpf: '', telefone: '', dataNascimento: '', email: '', obs: '',
    data: '', hora: '',
  });

  const profissionais = funcionarios.filter(f => f.role === 'profissional' && f.ativo);
  const filteredSalas = salas.filter(s => s.unidadeId === form.unidadeId);

  const handleSubmit = () => {
    if (!form.nome || !form.telefone || !form.data || !form.hora || !form.profissionalId) {
      toast.error('Preencha todos os campos obrigatórios.');
      return;
    }

    const pacienteId = `p${Date.now()}`;
    addPaciente({
      id: pacienteId,
      nome: form.nome,
      cpf: form.cpf,
      telefone: form.telefone,
      dataNascimento: form.dataNascimento,
      email: form.email,
      endereco: '',
      observacoes: form.obs,
      criadoEm: new Date().toISOString(),
    });

    const prof = profissionais.find(p => p.id === form.profissionalId);
    addAgendamento({
      id: `ag${Date.now()}`,
      pacienteId,
      pacienteNome: form.nome,
      unidadeId: form.unidadeId,
      salaId: form.salaId,
      setorId: form.setorId,
      profissionalId: form.profissionalId,
      profissionalNome: prof?.nome || '',
      data: form.data,
      hora: form.hora,
      status: 'pendente',
      tipo: form.tipo,
      observacoes: form.obs,
      origem: 'online',
      syncStatus: 'pendente',
      criadoEm: new Date().toISOString(),
      criadoPor: 'online',
    });

    setDone(true);
  };

  if (done) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-4">
        <motion.div initial={{ scale: 0.8, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}>
          <Card className="shadow-elevated border-0 max-w-md w-full">
            <CardContent className="p-8 text-center">
              <div className="w-16 h-16 rounded-full bg-success/10 flex items-center justify-center mx-auto mb-4">
                <CheckCircle className="w-8 h-8 text-success" />
              </div>
              <h2 className="text-xl font-bold font-display text-foreground mb-2">Agendamento Confirmado!</h2>
              <p className="text-muted-foreground mb-4">
                {form.nome}, sua consulta foi agendada para <strong>{form.data}</strong> às <strong>{form.hora}</strong>.
              </p>
              <p className="text-sm text-muted-foreground mb-6">
                Você receberá a confirmação por WhatsApp e/ou e-mail. Lembre-se de chegar com 15 minutos de antecedência.
              </p>
              <Link to="/">
                <Button className="gradient-primary text-primary-foreground">Voltar ao Início</Button>
              </Link>
            </CardContent>
          </Card>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <div className="gradient-hero text-primary-foreground py-8">
        <div className="container mx-auto px-4">
          <Link to="/" className="inline-flex items-center text-sm opacity-70 hover:opacity-100 mb-4">
            <ArrowLeft className="w-4 h-4 mr-1" />Voltar
          </Link>
          <h1 className="text-2xl md:text-3xl font-bold font-display">Agendar Consulta Online</h1>
          <p className="opacity-80 mt-1">Preencha os dados para agendar sua consulta</p>
        </div>
      </div>

      <div className="container mx-auto px-4 py-8 max-w-2xl">
        {/* Progress */}
        <div className="flex items-center gap-2 mb-6">
          {[1, 2, 3].map(s => (
            <React.Fragment key={s}>
              <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold shrink-0 ${step >= s ? 'gradient-primary text-primary-foreground' : 'bg-muted text-muted-foreground'}`}>{s}</div>
              {s < 3 && <div className={`flex-1 h-1 rounded ${step > s ? 'gradient-primary' : 'bg-muted'}`} />}
            </React.Fragment>
          ))}
        </div>

        <Card className="shadow-card border-0">
          <CardContent className="p-6">
            {step === 1 && (
              <div className="space-y-4">
                <h2 className="text-lg font-semibold font-display text-foreground">Local e Profissional</h2>
                <div><Label>Unidade *</Label>
                  <Select value={form.unidadeId} onValueChange={v => setForm(p => ({ ...p, unidadeId: v, salaId: '' }))}>
                    <SelectTrigger><SelectValue placeholder="Selecione a unidade" /></SelectTrigger>
                    <SelectContent>{unidades.map(u => <SelectItem key={u.id} value={u.id}>{u.nome}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                {filteredSalas.length > 0 && (
                  <div><Label>Sala (opcional)</Label>
                    <Select value={form.salaId} onValueChange={v => setForm(p => ({ ...p, salaId: v }))}>
                      <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                      <SelectContent>{filteredSalas.map(s => <SelectItem key={s.id} value={s.id}>{s.nome}</SelectItem>)}</SelectContent>
                    </Select>
                  </div>
                )}
                <div><Label>Setor</Label>
                  <Select value={form.setorId} onValueChange={v => setForm(p => ({ ...p, setorId: v }))}>
                    <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                    <SelectContent>{setores.map(s => <SelectItem key={s.id} value={s.id}>{s.nome}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <div><Label>Profissional *</Label>
                  <Select value={form.profissionalId} onValueChange={v => setForm(p => ({ ...p, profissionalId: v }))}>
                    <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                    <SelectContent>{profissionais.map(p => <SelectItem key={p.id} value={p.id}>{p.nome}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <div><Label>Tipo de Atendimento</Label>
                  <Select value={form.tipo} onValueChange={v => setForm(p => ({ ...p, tipo: v }))}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Consulta">Consulta</SelectItem>
                      <SelectItem value="Retorno">Retorno</SelectItem>
                      <SelectItem value="Exame">Exame</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <Button onClick={() => setStep(2)} className="w-full gradient-primary text-primary-foreground" disabled={!form.unidadeId || !form.profissionalId}>Próximo</Button>
              </div>
            )}

            {step === 2 && (
              <div className="space-y-4">
                <h2 className="text-lg font-semibold font-display text-foreground">Seus Dados</h2>
                <div><Label>Nome Completo *</Label><Input value={form.nome} onChange={e => setForm(p => ({ ...p, nome: e.target.value }))} /></div>
                <div className="grid grid-cols-2 gap-3">
                  <div><Label>CPF</Label><Input value={form.cpf} onChange={e => setForm(p => ({ ...p, cpf: e.target.value }))} placeholder="000.000.000-00" /></div>
                  <div><Label>Telefone *</Label><Input value={form.telefone} onChange={e => setForm(p => ({ ...p, telefone: e.target.value }))} placeholder="(93) 99999-0000" /></div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div><Label>Data Nasc.</Label><Input type="date" value={form.dataNascimento} onChange={e => setForm(p => ({ ...p, dataNascimento: e.target.value }))} /></div>
                  <div><Label>E-mail</Label><Input value={form.email} onChange={e => setForm(p => ({ ...p, email: e.target.value }))} /></div>
                </div>
                <div><Label>Observações</Label><Input value={form.obs} onChange={e => setForm(p => ({ ...p, obs: e.target.value }))} /></div>
                <div className="flex gap-3">
                  <Button variant="outline" onClick={() => setStep(1)} className="flex-1">Voltar</Button>
                  <Button onClick={() => setStep(3)} className="flex-1 gradient-primary text-primary-foreground" disabled={!form.nome || !form.telefone}>Próximo</Button>
                </div>
              </div>
            )}

            {step === 3 && (
              <div className="space-y-4">
                <h2 className="text-lg font-semibold font-display text-foreground">Data e Horário</h2>
                <div><Label>Data *</Label><Input type="date" value={form.data} onChange={e => setForm(p => ({ ...p, data: e.target.value }))} /></div>
                <div><Label>Horário *</Label><Input type="time" value={form.hora} onChange={e => setForm(p => ({ ...p, hora: e.target.value }))} /></div>
                <div className="flex gap-3">
                  <Button variant="outline" onClick={() => setStep(2)} className="flex-1">Voltar</Button>
                  <Button onClick={handleSubmit} className="flex-1 gradient-primary text-primary-foreground" disabled={!form.data || !form.hora}>
                    <Calendar className="w-4 h-4 mr-2" />Confirmar Agendamento
                  </Button>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default AgendarOnline;
