import React, { useState, useMemo, useEffect, useCallback } from 'react';
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
import type { DayInfo } from '@/components/CalendarioDisponibilidade';
import { addDaysToDateStr, isoDayOfWeek, localDateStr, nowMinutesInBrazil, todayLocalStr } from '@/lib/utils';

const applyDateMask = (value: string): string => {
  const digits = value.replace(/\D/g, '');
  if (digits.length <= 2) return digits;
  if (digits.length <= 4) return `${digits.slice(0, 2)}/${digits.slice(2)}`;
  return `${digits.slice(0, 2)}/${digits.slice(2, 4)}/${digits.slice(4, 8)}`;
};

const validateDateBrazilian = (dateStr: string): boolean => {
  if (!dateStr) return true;
  const regex = /^(\d{2})\/(\d{2})\/(\d{4})$/;
  const match = dateStr.match(regex);
  if (!match) return false;
  const day = parseInt(match[1], 10);
  const month = parseInt(match[2], 10);
  const year = parseInt(match[3], 10);
  if (day < 1 || day > 31 || month < 1 || month > 12 || year < 1900 || year > new Date().getFullYear()) return false;
  const date = new Date(year, month - 1, day);
  return date.getDate() === day && date.getMonth() === month - 1;
};

const convertBrazilianToISO = (dateStr: string): string => {
  if (!dateStr) return '';
  const match = dateStr.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (!match) return '';
  return `${match[3]}-${match[2]}-${match[1]}`;
};

interface PublicUnit { id: string; nome: string; endereco: string; telefone: string; whatsapp: string; ativo: boolean }
interface PublicProf { id: string; nome: string; setor: string; unidade_id: string; sala_id: string; role: string; ativo: boolean; profissao: string; tempo_atendimento: number; pode_agendar_retorno: boolean }
interface PublicDisp { id: string; profissional_id: string; unidade_id: string; data_inicio: string; data_fim: string; dias_semana: number[]; hora_inicio: string; hora_fim: string; vagas_por_hora: number; vagas_por_dia: number; duracao_consulta: number }
interface PublicBloqueio { id: string; data_inicio: string; data_fim: string; dia_inteiro: boolean; hora_inicio: string; hora_fim: string; profissional_id: string; unidade_id: string; tipo: string; titulo: string }
interface PublicAg { id: string; profissional_id: string; unidade_id: string; data: string; hora: string; status: string; origem?: string }
interface OnlineConfig { habilitado: boolean; antecedencia_minima_dias: number; antecedencia_maxima_dias: number; limite_por_dia_profissional: number; mensagem_confirmacao: string; exigir_confirmacao_sms: boolean }

const statusOcupaVaga = (s: string) => !['cancelado','falta'].includes(s);

const AgendarOnline: React.FC = () => {
  const [step, setStep] = useState(1);
  const [done, setDone] = useState(false);
  const [loading, setLoading] = useState(false);
  const [dataLoading, setDataLoading] = useState(true);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [showPassword, setShowPassword] = useState(false);

  const [unidades, setUnidades] = useState<PublicUnit[]>([]);
  const [profissionais, setProfissionais] = useState<PublicProf[]>([]);
  const [disponibilidades, setDisponibilidades] = useState<PublicDisp[]>([]);
  const [bloqueios, setBloqueios] = useState<PublicBloqueio[]>([]);
  const [agendamentos, setAgendamentos] = useState<PublicAg[]>([]);
  const [onlineConfig, setOnlineConfig] = useState<OnlineConfig>({ habilitado: true, antecedencia_minima_dias: 1, antecedencia_maxima_dias: 30, limite_por_dia_profissional: 99, mensagem_confirmacao: '', exigir_confirmacao_sms: false });

  const [form, setForm] = useState({
    unidadeId: '', profissionalId: '', tipo: 'Consulta',
    nome: '', cpf: '', cns: '', telefone: '', dataNascimento: '', email: '', obs: '',
    data: '', hora: '', senha: '', senhaConfirm: '',
  });

  const loadPublicData = useCallback(async () => {
    try {
      setDataLoading(true);
      const res = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/public-scheduling?action=data`,
        { headers: { 'apikey': import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY } }
      );
      if (!res.ok) throw new Error('Failed to load scheduling data');
      const json = await res.json();
      setUnidades(json.unidades || []);
      setProfissionais(json.profissionais || []);
      setDisponibilidades(json.disponibilidades || []);
      setBloqueios(json.bloqueios || []);
      setAgendamentos(json.agendamentos || []);
      if (json.config_agendamento_online) {
        setOnlineConfig(json.config_agendamento_online);
      }
    } catch (err) {
      console.error('Failed to load public scheduling data:', err);
      toast.error('Erro ao carregar dados de agendamento.');
    } finally {
      setDataLoading(false);
    }
  }, []);

  useEffect(() => { loadPublicData(); }, [loadPublicData]);

  // Availability calculation (replicated from DataContext for public use)
  const isSlotBlocked = useCallback((profissionalId: string, unidadeId: string, date: string, time?: string) => {
    return bloqueios.some(b => {
      if (date < b.data_inicio || date > b.data_fim) return false;
      const isGlobal = (!b.unidade_id || b.unidade_id === '') && (!b.profissional_id || b.profissional_id === '');
      const isUnitLevel = b.unidade_id === unidadeId && (!b.profissional_id || b.profissional_id === '');
      const isProfLevel = b.profissional_id === profissionalId;
      if (!isGlobal && !isUnitLevel && !isProfLevel) return false;
      if (b.dia_inteiro || !time) return true;
      const start = b.hora_inicio || '00:00';
      const end = b.hora_fim || '23:59';
      return time >= start && time < end;
    });
  }, [bloqueios]);

  const appointmentCountsByKey = useMemo(() => {
    const map = new Map<string, number>();
    for (const a of agendamentos) {
      if (statusOcupaVaga(a.status)) {
        const key = `${a.profissional_id}|${a.unidade_id}|${a.data}`;
        map.set(key, (map.get(key) || 0) + 1);
      }
    }
    return map;
  }, [agendamentos]);

  const appointmentsByDateProfUnit = useMemo(() => {
    const map = new Map<string, PublicAg[]>();
    for (const a of agendamentos) {
      if (statusOcupaVaga(a.status)) {
        const key = `${a.profissional_id}|${a.unidade_id}|${a.data}`;
        const arr = map.get(key);
        if (arr) arr.push(a); else map.set(key, [a]);
      }
    }
    return map;
  }, [agendamentos]);

  const getAvailableSlots = useCallback((profissionalId: string, unidadeId: string, date: string): string[] => {
    const todayStr = todayLocalStr();
    if (date < todayStr) return [];

    const dayOfWeek = isoDayOfWeek(date);
    const disp = disponibilidades.find(d =>
      d.profissional_id === profissionalId && d.unidade_id === unidadeId &&
      d.dias_semana.includes(dayOfWeek) && date >= d.data_inicio && date <= d.data_fim
    );
    if (!disp) return [];

    const slots: string[] = [];
    const startHour = parseInt(disp.hora_inicio.split(':')[0]);
    const startMin = parseInt(disp.hora_inicio.split(':')[1] || '0');
    const endHour = parseInt(disp.hora_fim.split(':')[0]);
    const endMin = parseInt(disp.hora_fim.split(':')[1] || '0');

    const key = `${profissionalId}|${unidadeId}|${date}`;
    const dayAppointments = appointmentsByDateProfUnit.get(key) || [];
    if (dayAppointments.length >= disp.vagas_por_dia) return [];

    const hourCounts = new Map<string, number>();
    const slotCounts = new Map<string, number>();
    for (const a of dayAppointments) {
      const hKey = a.hora.substring(0, 3);
      hourCounts.set(hKey, (hourCounts.get(hKey) || 0) + 1);
      slotCounts.set(a.hora, (slotCounts.get(a.hora) || 0) + 1);
    }

    const prof = profissionais.find(f => f.id === profissionalId);
    const intervalMinutes = Math.max(15, prof?.tempo_atendimento || 30);
    const ehHoje = date === todayStr;
    const limiteMinutos = ehHoje ? nowMinutesInBrazil() + 30 : -1;

    let h = startHour, m = startMin;
    while (h < endHour || (h === endHour && m < endMin)) {
      const timeStr = `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
      if (ehHoje && h * 60 + m <= limiteMinutos) {
        m += intervalMinutes;
        while (m >= 60) { m -= 60; h++; }
        continue;
      }
      const hourStr = `${String(h).padStart(2, '0')}:`;
      const hourCount = hourCounts.get(hourStr) || 0;
      const slotCount = slotCounts.get(timeStr) || 0;
      const blocked = isSlotBlocked(profissionalId, unidadeId, date, timeStr);
      if (!blocked && hourCount < disp.vagas_por_hora && slotCount === 0) slots.push(timeStr);
      m += intervalMinutes;
      while (m >= 60) { m -= 60; h++; }
    }
    return slots;
  }, [disponibilidades, appointmentsByDateProfUnit, profissionais, isSlotBlocked]);

  const getAvailableDates = useCallback((profissionalId: string, unidadeId: string): string[] => {
    const disps = disponibilidades.filter(d => d.profissional_id === profissionalId && d.unidade_id === unidadeId);
    if (disps.length === 0) return [];

    const dates: string[] = [];
    const todayStr = todayLocalStr();

    for (const disp of disps) {
      let currentDate = disp.data_inicio > todayStr ? disp.data_inicio : todayStr;
      while (currentDate <= disp.data_fim) {
        const dayOfWeek = isoDayOfWeek(currentDate);
        if (disp.dias_semana.includes(dayOfWeek)) {
          const key = `${profissionalId}|${unidadeId}|${currentDate}`;
          const dayCount = appointmentCountsByKey.get(key) || 0;
          if (dayCount < disp.vagas_por_dia && !isSlotBlocked(profissionalId, unidadeId, currentDate)) {
            if (!dates.includes(currentDate)) dates.push(currentDate);
          }
        }
        currentDate = addDaysToDateStr(currentDate, 1);
      }
    }

    return dates.sort().filter(d => getAvailableSlots(profissionalId, unidadeId, d).length > 0);
  }, [disponibilidades, appointmentCountsByKey, isSlotBlocked, getAvailableSlots]);

  const getBlockingInfo = useCallback((profissionalId: string, unidadeId: string, date: string) => {
    for (const b of bloqueios) {
      if (date < b.data_inicio || date > b.data_fim) continue;
      const isGlobal = (!b.unidade_id || b.unidade_id === '') && (!b.profissional_id || b.profissional_id === '');
      const isUnitLevel = b.unidade_id === unidadeId && (!b.profissional_id || b.profissional_id === '');
      const isProfLevel = b.profissional_id === profissionalId;
      if (!isGlobal && !isUnitLevel && !isProfLevel) continue;
      if (!b.dia_inteiro) continue;
      return { blocked: true, type: b.tipo, label: `${b.titulo || b.tipo}` };
    }
    return { blocked: false };
  }, [bloqueios]);

  const unidadesComDisponibilidade = useMemo(() => {
    const unidadeIdsComDisp = new Set(disponibilidades.map(d => d.unidade_id));
    const unidadeIdsComProf = new Set(profissionais.filter(f => f.role === 'profissional' && f.ativo && f.unidade_id).map(f => f.unidade_id));
    return unidades.filter(u => u.ativo && unidadeIdsComProf.has(u.id) && unidadeIdsComDisp.has(u.id));
  }, [unidades, profissionais, disponibilidades]);

  const profissionaisComDisponibilidade = useMemo(() => {
    if (!form.unidadeId) return [];
    const profIds = new Set(disponibilidades.filter(d => d.unidade_id === form.unidadeId).map(d => d.profissional_id));
    return profissionais.filter(f => f.role === 'profissional' && f.ativo && profIds.has(f.id));
  }, [profissionais, disponibilidades, form.unidadeId]);

  const availableDates = useMemo(() => {
    if (!form.profissionalId || !form.unidadeId) return [];
    const allDates = getAvailableDates(form.profissionalId, form.unidadeId);
    const minDate = addDaysToDateStr(todayLocalStr(), onlineConfig.antecedencia_minima_dias);
    const maxDate = addDaysToDateStr(todayLocalStr(), onlineConfig.antecedencia_maxima_dias);
    return allDates.filter(d => d >= minDate && d <= maxDate);
  }, [form.profissionalId, form.unidadeId, getAvailableDates, onlineConfig]);

  const dayInfoMap = useMemo(() => {
    if (!form.profissionalId || !form.unidadeId) return {};
    const map: Record<string, DayInfo> = {};
    const disps = disponibilidades.filter(d => d.profissional_id === form.profissionalId && d.unidade_id === form.unidadeId);
    if (disps.length === 0) return map;
    let currentDate = todayLocalStr();
    for (let i = 0; i < 90; i++) {
      const dateStr = currentDate;
      const dayOfWeek = isoDayOfWeek(dateStr);
      const hasDisp = disps.some(d => d.dias_semana.includes(dayOfWeek) && dateStr >= d.data_inicio && dateStr <= d.data_fim);
      if (!hasDisp) continue;
      const blockInfo = getBlockingInfo(form.profissionalId, form.unidadeId, dateStr);
      if (blockInfo.blocked) {
        const isHoliday = blockInfo.type === 'feriado';
        map[dateStr] = { dateStr, status: isHoliday ? 'holiday' : 'blocked', label: blockInfo.label || (isHoliday ? 'Feriado' : 'Bloqueado') };
        continue;
      }
      const slots = getAvailableSlots(form.profissionalId, form.unidadeId, dateStr);
      if (slots.length === 0) {
        const disp = disps.find(d => d.dias_semana.includes(dayOfWeek) && dateStr >= d.data_inicio && dateStr <= d.data_fim);
        if (disp) {
          const key = `${form.profissionalId}|${form.unidadeId}|${dateStr}`;
          const dayCount = appointmentCountsByKey.get(key) || 0;
          if (dayCount > 0) map[dateStr] = { dateStr, status: 'full', label: 'Lotado — sem vagas restantes' };
        }
      }
    }
    return map;
  }, [form.profissionalId, form.unidadeId, disponibilidades, appointmentCountsByKey, getAvailableSlots, getBlockingInfo]);

  const availableSlots = useMemo(() => {
    if (!form.profissionalId || !form.unidadeId || !form.data) return [];
    return getAvailableSlots(form.profissionalId, form.unidadeId, form.data);
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
    if (form.dataNascimento && !validateDateBrazilian(form.dataNascimento)) {
      setErrors({ dataNascimento: 'Data de nascimento inválida.' });
      toast.error('Data de nascimento inválida.');
      return false;
    }
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

  const handleNext2 = () => { if (validateStep2()) setStep(3); };

  const handleSubmit = async () => {
    if (!form.nome || !form.telefone || !form.email || !form.data || !form.hora || !form.profissionalId || !form.unidadeId) {
      toast.error('Preencha todos os campos obrigatórios.');
      return;
    }
    setLoading(true);
    try {
      const normalizePhone = (t: string) => t.replace(/\D/g, '');
      const normalizeCpf = (c: string) => c.replace(/\D/g, '');
      const normalizeEmail = (e: string) => e.trim().toLowerCase();
      const phoneNorm = normalizePhone(form.telefone);
      const cpfNorm = normalizeCpf(form.cpf);
      const emailNorm = normalizeEmail(form.email);

      // Check for existing patient via edge function
      const checkRes = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/public-scheduling?action=check-patient`,
        { method: 'POST', headers: { 'Content-Type': 'application/json', 'apikey': import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY },
          body: JSON.stringify({ cpf: cpfNorm, telefone: phoneNorm, email: emailNorm }) }
      );
      const checkData = await checkRes.json();

      let pacienteId: string;
      if (checkData.found) {
        pacienteId = checkData.id;
        if (form.cns) {
          await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/public-scheduling?action=update-patient-cns`,
            { method: 'POST', headers: { 'Content-Type': 'application/json', 'apikey': import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY },
              body: JSON.stringify({ id: pacienteId, cns: form.cns }) });
        }
      } else {
        if (form.tipo === 'Retorno') {
          toast.error('Não foi encontrado cadastro anterior. Para retorno, é necessário ter uma primeira consulta.');
          setLoading(false);
          return;
        }
        pacienteId = `p${Date.now()}`;
        const createRes = await fetch(
          `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/public-scheduling?action=create-patient`,
          { method: 'POST', headers: { 'Content-Type': 'application/json', 'apikey': import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY },
            body: JSON.stringify({ id: pacienteId, nome: form.nome, cpf: form.cpf, cns: form.cns, telefone: form.telefone, data_nascimento: convertBrazilianToISO(form.dataNascimento), email: form.email, observacoes: form.obs }) }
        );
        if (!createRes.ok) throw new Error('Failed to create patient');
      }

      // Create portal account
      try {
        await supabase.functions.invoke('patient-signup', {
          body: { email: emailNorm, senha: form.senha, pacienteId },
        });
      } catch (authErr) {
        console.error('Patient account creation failed (non-blocking):', authErr);
      }

      const prof = profissionais.find(p => p.id === form.profissionalId);
      const unidade = unidades.find(u => u.id === form.unidadeId);
      const agId = `ag${Date.now()}`;

      // Create appointment via edge function
      const agRes = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/public-scheduling?action=create-appointment`,
        { method: 'POST', headers: { 'Content-Type': 'application/json', 'apikey': import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY },
          body: JSON.stringify({ id: agId, paciente_id: pacienteId, paciente_nome: form.nome, unidade_id: form.unidadeId, sala_id: '', setor_id: prof?.setor || '', profissional_id: form.profissionalId, profissional_nome: prof?.nome || '', data: form.data, hora: form.hora, tipo: form.tipo, observacoes: form.obs }) }
      );
      if (!agRes.ok) throw new Error('Failed to create appointment');

      // Send webhook notification
      try {
        await supabase.functions.invoke('webhook-notify', {
          body: { evento: 'novo_agendamento', paciente_nome: form.nome, telefone: form.telefone, email: form.email, data_consulta: form.data, hora_consulta: form.hora, unidade: unidade?.nome || '', profissional: prof?.nome || '', tipo_atendimento: form.tipo, status_agendamento: 'pendente', id_agendamento: agId, observacoes: form.obs },
        });
      } catch (notifyErr) {
        console.error('Webhook notification failed (non-blocking):', notifyErr);
      }

      toast.success('Agendamento realizado com sucesso!');
      setDone(true);
    } catch (err) {
      console.error('Erro ao agendar:', err);
      toast.error('Erro ao realizar agendamento. Tente novamente.');
    } finally {
      setLoading(false);
    }
  };

  if (dataLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto mb-4" />
          <p className="text-muted-foreground">Carregando dados de agendamento...</p>
        </div>
      </div>
    );
  }

  if (!onlineConfig.habilitado) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-4">
        <Card className="shadow-elevated border-0 max-w-md w-full">
          <CardContent className="p-8 text-center">
            <div className="w-16 h-16 rounded-full bg-warning/10 flex items-center justify-center mx-auto mb-4">
              <AlertCircle className="w-8 h-8 text-warning" />
            </div>
            <h2 className="text-xl font-bold font-display text-foreground mb-2">Agendamento Online Indisponível</h2>
            <p className="text-muted-foreground mb-6">
              O agendamento online está temporariamente desabilitado. Entre em contato com a unidade de saúde para agendar presencialmente.
            </p>
            <Link to="/"><Button variant="outline" className="w-full">Voltar ao Início</Button></Link>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (done) {
    const prof = profissionais.find(f => f.id === form.profissionalId);
    const unidade = unidades.find(u => u.id === form.unidadeId);
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
                {onlineConfig.mensagem_confirmacao ? (
                  <p className="text-muted-foreground mb-4">{onlineConfig.mensagem_confirmacao}</p>
                ) : (
                  <p className="text-muted-foreground mb-4">
                    {form.nome}, sua {form.tipo === 'Retorno' ? 'consulta de retorno' : 'consulta'} foi agendada para <strong>{form.data}</strong> às <strong>{form.hora}</strong>.
                  </p>
                )}
                <p className="text-muted-foreground mb-4 text-sm">
                  <strong>{form.nome}</strong> — {form.data} às {form.hora}
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
                            <SelectItem key={p.id} value={p.id}>{p.nome} — {p.profissao}</SelectItem>
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
                  <div><Label>Cartão SUS / CNS</Label><Input value={form.cns} onChange={e => setForm(p => ({ ...p, cns: e.target.value }))} placeholder="Nº do cartão SUS" /></div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label>Telefone *</Label>
                    <Input value={form.telefone} onChange={e => setForm(p => ({ ...p, telefone: e.target.value }))} placeholder="(93) 99999-0000" />
                    {errors.telefone && <p className="text-xs text-destructive mt-1">{errors.telefone}</p>}
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label>Data Nasc.</Label>
                    <Input type="text" value={form.dataNascimento}
                      onChange={e => { const masked = applyDateMask(e.target.value); setForm(p => ({ ...p, dataNascimento: masked })); }}
                      placeholder="DD/MM/AAAA" maxLength={10} />
                    <p className="text-xs text-muted-foreground mt-1">Digite a data no formato: 23/11/1985</p>
                    {errors.dataNascimento && <p className="text-xs text-destructive mt-1">{errors.dataNascimento}</p>}
                  </div>
                  <div>
                    <Label>E-mail *</Label>
                    <Input type="email" value={form.email} onChange={e => setForm(p => ({ ...p, email: e.target.value }))} placeholder="paciente@email.com" />
                    {errors.email && <p className="text-xs text-destructive mt-1">{errors.email}</p>}
                  </div>
                </div>
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
                  <span>Agendamentos disponíveis de {onlineConfig.antecedencia_minima_dias} a {onlineConfig.antecedencia_maxima_dias} dias à frente.</span>
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
                          dayInfoMap={dayInfoMap}
                          blockToday={true}
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
