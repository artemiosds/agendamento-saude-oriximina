import React, { useState, useMemo } from 'react';
import { useData } from '@/contexts/DataContext';
import { useWebhookNotify } from '@/hooks/useWebhookNotify';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Calendar, CheckCircle, ArrowLeft, AlertCircle } from 'lucide-react';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { toast } from 'sonner';
import { validatePacienteFields } from '@/lib/validation';

const AgendarOnline: React.FC = () => {
  const { unidades, funcionarios, disponibilidades, addAgendamento, addPaciente, pacientes, getAvailableDates, getAvailableSlots } = useData();
  const { notify } = useWebhookNotify();
  const [step, setStep] = useState(1);
  const [done, setDone] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const [form, setForm] = useState({
    unidadeId: '', profissionalId: '', tipo: 'Consulta',
    nome: '', cpf: '', telefone: '', dataNascimento: '', email: '', obs: '',
    data: '', hora: '',
  });

  const unidadesComDisponibilidade = useMemo(() => {
    const unidadeIds = new Set(disponibilidades.map(d => d.unidadeId));
    return unidades.filter(u => unidadeIds.has(u.id) && u.ativo);
  }, [unidades, disponibilidades]);

  const profissionaisComDisponibilidade = useMemo(() => {
    if (!form.unidadeId) return [];
    // Show professionals that are active, have role 'profissional', linked to selected unit
    // AND optionally have availability configured
    return funcionarios.filter(f => 
      f.role === 'profissional' && f.ativo && f.unidadeId === form.unidadeId
    );
  }, [funcionarios, form.unidadeId]);

  const availableDates = useMemo(() => {
    if (!form.profissionalId || !form.unidadeId) return [];
    return getAvailableDates(form.profissionalId, form.unidadeId);
  }, [form.profissionalId, form.unidadeId, getAvailableDates]);

  const availableSlots = useMemo(() => {
    if (!form.profissionalId || !form.unidadeId || !form.data) return [];
    return getAvailableSlots(form.profissionalId, form.unidadeId, form.data);
  }, [form.profissionalId, form.unidadeId, form.data, getAvailableSlots]);

  const validateStep2 = (): boolean => {
    const err = validatePacienteFields({ nome: form.nome, telefone: form.telefone, email: form.email });
    if (err) {
      // Map error to field
      const newErrors: Record<string, string> = {};
      if (err.includes('Nome')) newErrors.nome = err;
      else if (err.includes('Telefone') || err.includes('telefone')) newErrors.telefone = err;
      else if (err.includes('mail')) newErrors.email = err;
      setErrors(newErrors);
      toast.error(err);
      return false;
    }
    setErrors({});
    return true;
  };

  const handleNext2 = () => {
    if (validateStep2()) setStep(3);
  };

  const handleSubmit = async () => {
    if (!form.nome || !form.telefone || !form.email || !form.data || !form.hora || !form.profissionalId || !form.unidadeId) {
      toast.error('Preencha todos os campos obrigatórios.');
      return;
    }

    let pacienteId: string;
    const existingPatient = pacientes.find(p => 
      (form.cpf && p.cpf === form.cpf) || p.telefone === form.telefone
    );

    if (existingPatient) {
      pacienteId = existingPatient.id;
    } else {
      pacienteId = `p${Date.now()}`;
      addPaciente({
        id: pacienteId, nome: form.nome, cpf: form.cpf, telefone: form.telefone,
        dataNascimento: form.dataNascimento, email: form.email, endereco: '',
        observacoes: form.obs, criadoEm: new Date().toISOString(),
      });
    }

    const prof = funcionarios.find(p => p.id === form.profissionalId);
    const unidade = unidades.find(u => u.id === form.unidadeId);
    
    addAgendamento({
      id: `ag${Date.now()}`, pacienteId, pacienteNome: form.nome,
      unidadeId: form.unidadeId, salaId: '', setorId: prof?.setor || '',
      profissionalId: form.profissionalId, profissionalNome: prof?.nome || '',
      data: form.data, hora: form.hora, status: 'pendente', tipo: form.tipo,
      observacoes: form.obs, origem: 'online', syncStatus: 'pendente',
      criadoEm: new Date().toISOString(), criadoPor: 'online',
    });

    // Send webhook notification
    notify({
      acao: 'novo_agendamento',
      nome: form.nome,
      telefone: form.telefone,
      email: form.email,
      data: form.data,
      hora: form.hora,
      unidade: unidade?.nome || '',
      profissional: prof?.nome || '',
      tipo_atendimento: form.tipo,
      observacoes: form.obs,
    });

    toast.success('Agendamento realizado com sucesso!');
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
              <p className="text-sm text-muted-foreground mb-2">
                <strong>Profissional:</strong> {funcionarios.find(f => f.id === form.profissionalId)?.nome}
              </p>
              <p className="text-sm text-muted-foreground mb-2">
                <strong>Unidade:</strong> {unidades.find(u => u.id === form.unidadeId)?.nome}
              </p>
              <p className="text-sm text-muted-foreground mb-6">
                Lembre-se de chegar com 15 minutos de antecedência.
              </p>
              <Link to="/"><Button className="gradient-primary text-primary-foreground">Voltar ao Início</Button></Link>
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
          <p className="opacity-80 mt-1">SMS Oriximiná — Agendamento Público</p>
        </div>
      </div>

      <div className="container mx-auto px-4 py-8 max-w-2xl">
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
                <h2 className="text-lg font-semibold font-display text-foreground">Unidade e Profissional</h2>
                
                {unidadesComDisponibilidade.length === 0 ? (
                  <div className="flex items-center gap-3 p-4 bg-warning/10 rounded-lg">
                    <AlertCircle className="w-5 h-5 text-warning shrink-0" />
                    <p className="text-sm text-warning">Nenhuma unidade possui horários disponíveis no momento.</p>
                  </div>
                ) : (
                  <>
                    <div>
                      <Label>Unidade *</Label>
                      <Select value={form.unidadeId} onValueChange={v => setForm(p => ({ ...p, unidadeId: v, profissionalId: '', data: '', hora: '' }))}>
                        <SelectTrigger><SelectValue placeholder="Selecione a unidade" /></SelectTrigger>
                        <SelectContent>{unidadesComDisponibilidade.map(u => <SelectItem key={u.id} value={u.id}>{u.nome}</SelectItem>)}</SelectContent>
                      </Select>
                    </div>
                    <div>
                      <Label>Profissional *</Label>
                      <Select value={form.profissionalId} onValueChange={v => setForm(p => ({ ...p, profissionalId: v, data: '', hora: '' }))}>
                        <SelectTrigger><SelectValue placeholder="Selecione o profissional" /></SelectTrigger>
                        <SelectContent>
                          {profissionaisComDisponibilidade.map(p => (
                            <SelectItem key={p.id} value={p.id}>{p.nome} — {p.cargo}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <Label>Tipo de Atendimento</Label>
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
                  </>
                )}
              </div>
            )}

            {step === 2 && (
              <div className="space-y-4">
                <h2 className="text-lg font-semibold font-display text-foreground">Seus Dados</h2>
                <div>
                  <Label>Nome Completo *</Label>
                  <Input value={form.nome} onChange={e => setForm(p => ({ ...p, nome: e.target.value }))} />
                  {errors.nome && <p className="text-xs text-destructive mt-1">{errors.nome}</p>}
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div><Label>CPF</Label><Input value={form.cpf} onChange={e => setForm(p => ({ ...p, cpf: e.target.value }))} placeholder="000.000.000-00" /></div>
                  <div>
                    <Label>Telefone *</Label>
                    <Input value={form.telefone} onChange={e => setForm(p => ({ ...p, telefone: e.target.value }))} placeholder="(93) 99999-0000" />
                    {errors.telefone && <p className="text-xs text-destructive mt-1">{errors.telefone}</p>}
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div><Label>Data Nasc.</Label><Input type="date" value={form.dataNascimento} onChange={e => setForm(p => ({ ...p, dataNascimento: e.target.value }))} /></div>
                  <div>
                    <Label>E-mail *</Label>
                    <Input type="email" value={form.email} onChange={e => setForm(p => ({ ...p, email: e.target.value }))} placeholder="paciente@email.com" />
                    {errors.email && <p className="text-xs text-destructive mt-1">{errors.email}</p>}
                  </div>
                </div>
                <div><Label>Observações</Label><Input value={form.obs} onChange={e => setForm(p => ({ ...p, obs: e.target.value }))} /></div>
                <div className="flex gap-3">
                  <Button variant="outline" onClick={() => setStep(1)} className="flex-1">Voltar</Button>
                  <Button onClick={handleNext2} className="flex-1 gradient-primary text-primary-foreground" disabled={!form.nome || !form.telefone || !form.email}>Próximo</Button>
                </div>
              </div>
            )}

            {step === 3 && (
              <div className="space-y-4">
                <h2 className="text-lg font-semibold font-display text-foreground">Data e Horário</h2>
                
                {availableDates.length === 0 ? (
                  <div className="flex items-center gap-3 p-4 bg-warning/10 rounded-lg">
                    <AlertCircle className="w-5 h-5 text-warning shrink-0" />
                    <p className="text-sm text-warning">Não há datas disponíveis para este profissional nesta unidade.</p>
                  </div>
                ) : (
                  <>
                    <div>
                      <Label>Data Disponível *</Label>
                      <Select value={form.data} onValueChange={v => setForm(p => ({ ...p, data: v, hora: '' }))}>
                        <SelectTrigger><SelectValue placeholder="Selecione a data" /></SelectTrigger>
                        <SelectContent>
                          {availableDates.slice(0, 30).map(d => {
                            const dateObj = new Date(d + 'T12:00:00');
                            const label = dateObj.toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: '2-digit', year: 'numeric' });
                            return <SelectItem key={d} value={d}>{label}</SelectItem>;
                          })}
                        </SelectContent>
                      </Select>
                    </div>

                    {form.data && (
                      <div>
                        <Label>Horário Disponível *</Label>
                        {availableSlots.length === 0 ? (
                          <p className="text-sm text-warning mt-1">Todos os horários desta data estão ocupados.</p>
                        ) : (
                          <div className="grid grid-cols-4 sm:grid-cols-6 gap-2 mt-2">
                            {availableSlots.map(slot => (
                              <Button key={slot} variant={form.hora === slot ? 'default' : 'outline'}
                                className={form.hora === slot ? 'gradient-primary text-primary-foreground' : ''}
                                size="sm" onClick={() => setForm(p => ({ ...p, hora: slot }))}>{slot}</Button>
                            ))}
                          </div>
                        )}
                      </div>
                    )}
                  </>
                )}

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
