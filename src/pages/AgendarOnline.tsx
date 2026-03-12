import React, { useState, useMemo } from 'react';
import { useData } from '@/contexts/DataContext';
import { useWebhookNotify } from '@/hooks/useWebhookNotify';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Calendar, CheckCircle, ArrowLeft, AlertCircle, Eye, EyeOff } from 'lucide-react';
import { CalendarioDisponibilidade } from '@/components/CalendarioDisponibilidade';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { toast } from 'sonner';
import { validatePacienteFields } from '@/lib/validation';
import { supabase } from '@/integrations/supabase/client';

// Helper function to apply date mask DD/MM/AAAA
const applyDateMask = (value: string): string => {
  const digits = value.replace(/\D/g, '');
  if (digits.length <= 2) return digits;
  if (digits.length <= 4) return `${digits.slice(0, 2)}/${digits.slice(2)}`;
  return `${digits.slice(0, 2)}/${digits.slice(2, 4)}/${digits.slice(4, 8)}`;
};

// Validate date in DD/MM/AAAA format
const validateDateBrazilian = (dateStr: string): boolean => {
  if (!dateStr) return true; // Optional field
  const regex = /^(\d{2})\/(\d{2})\/(\d{4})$/;
  const match = dateStr.match(regex);
  if (!match) return false;
  
  const day = parseInt(match[1], 10);
  const month = parseInt(match[2], 10);
  const year = parseInt(match[3], 10);
  
  if (day < 1 || day > 31) return false;
  if (month < 1 || month > 12) return false;
  if (year < 1900 || year > new Date().getFullYear()) return false;
  
  // Check if date is valid
  const date = new Date(year, month - 1, day);
  return date.getDate() === day && date.getMonth() === month - 1;
};

// Convert DD/MM/AAAA to YYYY-MM-DD for database
const convertBrazilianToISO = (dateStr: string): string => {
  if (!dateStr) return '';
  const match = dateStr.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (!match) return '';
  return `${match[3]}-${match[2]}-${match[1]}`;
};

const AgendarOnline: React.FC = () => {
  const { unidades, funcionarios, disponibilidades, addAgendamento, addPaciente, pacientes, getAvailableDates, getAvailableSlots, refreshPacientes } = useData();
  const { notify } = useWebhookNotify();
  const [step, setStep] = useState(1);
  const [done, setDone] = useState(false);
  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [showPassword, setShowPassword] = useState(false);

  const [form, setForm] = useState({
    unidadeId: '', profissionalId: '', tipo: 'Consulta',
    nome: '', cpf: '', telefone: '', dataNascimento: '', email: '', obs: '',
    data: '', hora: '',
    senha: '', senhaConfirm: '',
  });

  const unidadesComDisponibilidade = useMemo(() => {
    const unidadeIdsComDisponibilidade = new Set(disponibilidades.map(d => d.unidadeId));
    const unidadeIdsComProfissional = new Set(
      funcionarios.filter(f => f.role === 'profissional' && f.ativo && f.unidadeId)
        .map(f => f.unidadeId)
    );
    return unidades.filter(u => u.ativo && unidadeIdsComProfissional.has(u.id) && unidadeIdsComDisponibilidade.has(u.id));
  }, [unidades, funcionarios, disponibilidades]);

  const profissionaisComDisponibilidade = useMemo(() => {
    if (!form.unidadeId) return [];
    const profIdsComDisponibilidade = new Set(
      disponibilidades.filter(d => d.unidadeId === form.unidadeId).map(d => d.profissionalId)
    );
    return funcionarios.filter(f => 
      f.role === 'profissional' && f.ativo && profIdsComDisponibilidade.has(f.id)
    );
  }, [funcionarios, disponibilidades, form.unidadeId]);

  const availableDates = useMemo(() => {
    if (!form.profissionalId || !form.unidadeId) return [];
    const allDates = getAvailableDates(form.profissionalId, form.unidadeId, true);
    // REGRA 1: Paciente não pode agendar para hoje — apenas a partir de amanhã
    const amanha = new Date();
    amanha.setDate(amanha.getDate() + 1);
    amanha.setHours(0, 0, 0, 0);
    const amanhaStr = amanha.toISOString().split('T')[0];
    return allDates.filter(d => d >= amanhaStr);
  }, [form.profissionalId, form.unidadeId, getAvailableDates]);

  const availableSlots = useMemo(() => {
    if (!form.profissionalId || !form.unidadeId || !form.data) return [];
    return getAvailableSlots(form.profissionalId, form.unidadeId, form.data, true);
  }, [form.profissionalId, form.unidadeId, form.data, getAvailableSlots]);

  const validateStep2 = (): boolean => {
    const err = validatePacienteFields({ nome: form.nome, telefone: form.telefone, email: form.email });
    if (err) {
      const newErrors: Record<string, string> = {};
      if (err.includes('Nome')) newErrors.nome = err;
      else if (err.includes('Telefone') || err.includes('telefone')) newErrors.telefone = err;
      else if (err.includes('mail')) newErrors.email = err;
      setErrors(newErrors);
      toast.error(err);
      return false;
    }
    // Validate password
    if (!form.senha || form.senha.length < 6) {
      setErrors({ senha: 'Senha deve ter no mínimo 6 caracteres.' });
      toast.error('Senha deve ter no mínimo 6 caracteres.');
      return false;
    }
    if (form.senha !== form.senhaConfirm) {
      setErrors({ senhaConfirm: 'As senhas não coincidem.' });
      toast.error('As senhas não coincidem.');
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

    setLoading(true);
    try {
      let pacienteId: string;
      const normalizePhone = (t: string) => t.replace(/\D/g, '');
      const normalizeCpf = (c: string) => c.replace(/\D/g, '');
      const normalizeEmail = (e: string) => e.trim().toLowerCase();
      const phoneNorm = normalizePhone(form.telefone);
      const cpfNorm = normalizeCpf(form.cpf);
      const emailNorm = normalizeEmail(form.email);

      // Deduplication: query DB directly to avoid 1000-row limit on local state
      let existingPatient: { id: string } | null = null;
      const orFilters: string[] = [];
      if (cpfNorm) orFilters.push(`cpf.eq.${cpfNorm}`);
      if (phoneNorm) orFilters.push(`telefone.eq.${phoneNorm}`);
      if (emailNorm) orFilters.push(`email.ilike.${emailNorm}`);
      if (orFilters.length > 0) {
        const { data: found } = await supabase.from('pacientes').select('id').or(orFilters.join(',')).limit(1);
        if (found && found.length > 0) existingPatient = found[0];
      }

      if (existingPatient) {
        pacienteId = existingPatient.id;
      } else {
        if (form.tipo === 'Retorno') {
          toast.error('Não foi encontrado cadastro anterior. Para retorno, é necessário ter uma primeira consulta.');
          setLoading(false);
          return;
        }
        pacienteId = `p${Date.now()}`;
        await addPaciente({
          id: pacienteId, nome: form.nome, cpf: form.cpf, telefone: form.telefone,
          dataNascimento: form.dataNascimento, email: form.email, endereco: '',
          observacoes: form.obs, descricaoClinica: '', cid: '', criadoEm: new Date().toISOString(),
        });
        await refreshPacientes();
      }

      // Create patient portal account
      try {
        await supabase.functions.invoke('patient-signup', {
          body: { email: emailNorm, senha: form.senha, pacienteId },
        });
      } catch (authErr) {
        console.error('Patient account creation failed (non-blocking):', authErr);
      }

      const prof = funcionarios.find(p => p.id === form.profissionalId);
      const unidade = unidades.find(u => u.id === form.unidadeId);
      
      const agId = `ag${Date.now()}`;
      await addAgendamento({
        id: agId, pacienteId, pacienteNome: form.nome,
        unidadeId: form.unidadeId, salaId: '', setorId: prof?.setor || '',
        profissionalId: form.profissionalId, profissionalNome: prof?.nome || '',
        data: form.data, hora: form.hora, status: 'pendente', tipo: form.tipo,
        observacoes: form.obs, origem: 'online', syncStatus: 'pendente',
        criadoEm: new Date().toISOString(), criadoPor: 'online',
      });

      // Enviar notificação (aguardar para garantir que complete)
      await notify({
        evento: 'novo_agendamento',
        paciente_nome: form.nome, telefone: form.telefone, email: form.email,
        data_consulta: form.data, hora_consulta: form.hora,
        unidade: unidade?.nome || '', profissional: prof?.nome || '',
        tipo_atendimento: form.tipo, status_agendamento: 'pendente',
        id_agendamento: agId, observacoes: form.obs,
      });

      toast.success('Agendamento realizado com sucesso!');
      setDone(true);
    } catch (err) {
      console.error('Erro ao agendar:', err);
      toast.error('Erro ao realizar agendamento. Tente novamente.');
    } finally {
      setLoading(false);
    }
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
                {form.nome}, sua {form.tipo === 'Retorno' ? 'consulta de retorno' : 'consulta'} foi agendada para <strong>{form.data}</strong> às <strong>{form.hora}</strong>.
              </p>
              <p className="text-sm text-muted-foreground mb-2">
                <strong>Profissional:</strong> {funcionarios.find(f => f.id === form.profissionalId)?.nome}
              </p>
              <p className="text-sm text-muted-foreground mb-2">
                <strong>Unidade:</strong> {unidades.find(u => u.id === form.unidadeId)?.nome}
              </p>
              <p className="text-sm text-muted-foreground mb-2">
                <strong>Tipo:</strong> {form.tipo}
              </p>
              <p className="text-sm text-muted-foreground mb-4">
                Lembre-se de chegar com 15 minutos de antecedência.
              </p>
              <div className="bg-info/10 p-3 rounded-lg text-sm text-info mb-4">
                <p className="font-medium">Sua conta no Portal do Paciente foi criada!</p>
                <p className="text-xs mt-1">Acesse com seu e-mail e a senha escolhida para ver seus agendamentos.</p>
              </div>
              <div className="flex gap-3">
                <Link to="/" className="flex-1"><Button variant="outline" className="w-full">Início</Button></Link>
                <Link to="/portal" className="flex-1"><Button className="w-full gradient-primary text-primary-foreground">Meu Portal</Button></Link>
              </div>
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
                          <SelectItem value="Consulta">Primeira Consulta</SelectItem>
                          <SelectItem value="Retorno">Retorno</SelectItem>
                          <SelectItem value="Exame">Exame</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    {form.tipo === 'Retorno' && (
                      <div className="flex items-center gap-2 p-3 bg-info/10 rounded-lg text-sm text-info">
                        <AlertCircle className="w-4 h-4 shrink-0" />
                        <span>Para retorno, informe os mesmos dados (CPF, telefone ou e-mail) da primeira consulta.</span>
                      </div>
                    )}
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
                  <div>
                    <Label>Data Nasc.</Label>
                    <Input
                      type="text"
                      value={form.dataNascimento}
                      onChange={e => {
                        const masked = applyDateMask(e.target.value);
                        setForm(p => ({ ...p, dataNascimento: masked }));
                      }}
                      placeholder="DD/MM/AAAA"
                      maxLength={10}
                    />
                    <p className="text-xs text-muted-foreground mt-1">Digite a data no formato: 23/11/1985</p>
                    {errors.dataNascimento && <p className="text-xs text-destructive mt-1">{errors.dataNascimento}</p>}
                  </div>
                  <div>
                    <Label>E-mail *</Label>
                    <Input type="email" value={form.email} onChange={e => setForm(p => ({ ...p, email: e.target.value }))} placeholder="paciente@email.com" />
                    {errors.email && <p className="text-xs text-destructive mt-1">{errors.email}</p>}
                  </div>
                </div>

                {/* Password fields for portal access */}
                <div className="border-t pt-4 mt-2">
                  <p className="text-sm font-medium text-foreground mb-3">Criar acesso ao Portal do Paciente</p>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <Label>Senha *</Label>
                      <div className="relative">
                        <Input type={showPassword ? 'text' : 'password'} value={form.senha}
                          onChange={e => setForm(p => ({ ...p, senha: e.target.value }))} placeholder="Mín. 6 caracteres" />
                        <button type="button" className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground"
                          onClick={() => setShowPassword(!showPassword)}>
                          {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                        </button>
                      </div>
                      {errors.senha && <p className="text-xs text-destructive mt-1">{errors.senha}</p>}
                    </div>
                    <div>
                      <Label>Confirmar Senha *</Label>
                      <Input type="password" value={form.senhaConfirm}
                        onChange={e => setForm(p => ({ ...p, senhaConfirm: e.target.value }))} placeholder="Repita a senha" />
                      {errors.senhaConfirm && <p className="text-xs text-destructive mt-1">{errors.senhaConfirm}</p>}
                    </div>
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">Use este e-mail e senha para acessar o Portal do Paciente.</p>
                </div>

                <div><Label>Observações</Label><Input value={form.obs} onChange={e => setForm(p => ({ ...p, obs: e.target.value }))} /></div>
                <div className="flex gap-3">
                  <Button variant="outline" onClick={() => setStep(1)} className="flex-1">Voltar</Button>
                  <Button onClick={handleNext2} className="flex-1 gradient-primary text-primary-foreground" disabled={!form.nome || !form.telefone || !form.email || !form.senha}>Próximo</Button>
                </div>
              </div>
            )}

            {step === 3 && (
              <div className="space-y-4">
                <h2 className="text-lg font-semibold font-display text-foreground">Data e Horário</h2>
                
                <div className="flex items-center gap-2 p-3 bg-info/10 rounded-lg text-sm text-info">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  <span>Agendamentos disponíveis a partir de amanhã.</span>
                </div>

                {availableDates.length === 0 ? (
                  <div className="flex items-center gap-3 p-4 bg-warning/10 rounded-lg">
                    <AlertCircle className="w-5 h-5 text-warning shrink-0" />
                    <p className="text-sm text-warning">Não há datas disponíveis para este profissional nesta unidade.</p>
                  </div>
                ) : (
                  <>
                    <div>
                      <Label>Selecione a data *</Label>
                      <div className="mt-2">
                        <CalendarioDisponibilidade
                          availableDates={availableDates.slice(0, 60)}
                          selectedDate={form.data}
                          onSelectDate={(d) => setForm(p => ({ ...p, data: d, hora: '' }))}
                        />
                      </div>
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
                  <Button onClick={handleSubmit} className="flex-1 gradient-primary text-primary-foreground" disabled={!form.data || !form.hora || loading}>
                    <Calendar className="w-4 h-4 mr-2" />{loading ? 'Agendando...' : 'Confirmar Agendamento'}
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
