import React, { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog';
import { Calendar, Clock, User, FileText, LogOut, ArrowLeft, Loader2, MapPin, AlertCircle, List, Eye, EyeOff, KeyRound } from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { motion } from 'framer-motion';
import { openPrintDocument } from '@/lib/printLayout';

interface PacienteData {
  id: string;
  nome: string;
  cpf: string;
  telefone: string;
  email: string;
}

interface AgendamentoData {
  id: string;
  data: string;
  hora: string;
  status: string;
  tipo: string;
  profissional_nome: string;
  unidade_id: string;
  observacoes: string;
}

interface FilaData {
  id: string;
  posicao: number;
  status: string;
  hora_chegada: string;
  setor: string;
  profissional_id: string;
}

const statusLabels: Record<string, { label: string; class: string }> = {
  pendente: { label: 'Pendente', class: 'bg-warning/10 text-warning' },
  confirmado: { label: 'Confirmado', class: 'bg-success/10 text-success' },
  confirmado_chegada: { label: 'Chegou', class: 'bg-emerald-500/10 text-emerald-600' },
  cancelado: { label: 'Cancelado', class: 'bg-destructive/10 text-destructive' },
  concluido: { label: 'Concluído', class: 'bg-info/10 text-info' },
  falta: { label: 'Falta', class: 'bg-destructive/10 text-destructive' },
  em_atendimento: { label: 'Em Atendimento', class: 'bg-primary/10 text-primary' },
  remarcado: { label: 'Remarcado', class: 'bg-muted text-muted-foreground' },
};

type RecoveryStep = 'none' | 'verify' | 'newpass' | 'done';

const PortalPaciente: React.FC = () => {
  const navigate = useNavigate();
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [loginLoading, setLoginLoading] = useState(false);
  const [loginForm, setLoginForm] = useState({ email: '', senha: '' });
  const [showLoginSenha, setShowLoginSenha] = useState(false);
  const [paciente, setPaciente] = useState<PacienteData | null>(null);
  const [agendamentos, setAgendamentos] = useState<AgendamentoData[]>([]);
  const [fila, setFila] = useState<FilaData[]>([]);
  const [unidades, setUnidades] = useState<any[]>([]);

  // Recovery state
  const [recoveryStep, setRecoveryStep] = useState<RecoveryStep>('none');
  const [recCpf, setRecCpf] = useState('');
  const [recEmail, setRecEmail] = useState('');
  const [recNovaSenha, setRecNovaSenha] = useState('');
  const [recConfirmar, setRecConfirmar] = useState('');
  const [showNova, setShowNova] = useState(false);
  const [showConfirmar, setShowConfirmar] = useState(false);
  const [recLoading, setRecLoading] = useState(false);
  const [recErro, setRecErro] = useState('');

  useEffect(() => { checkSession(); }, []);

  const checkSession = async () => {
    const { data: { session } } = await supabase.auth.getSession();
    if (session?.user) {
      // Check if portal is globally enabled and patient is not blocked
      const accessCheck = await checkPortalAccess(session.user.id);
      if (!accessCheck.allowed) {
        await supabase.auth.signOut();
        toast.error(accessCheck.message);
        setIsLoading(false);
        return;
      }
      await loadPacienteData(session.user.id);
    }
    setIsLoading(false);
  };

  const checkPortalAccess = async (authUserId: string): Promise<{ allowed: boolean; message: string }> => {
    try {
      // Load global config
      const { data: configData } = await (supabase as any).from('system_config').select('configuracoes').eq('id', 'default').maybeSingle();
      const portalConfig = configData?.configuracoes?.portalPaciente;

      // Check global portal toggle
      if (portalConfig && portalConfig.permitirPortal === false) {
        return { allowed: false, message: 'O portal do paciente está temporariamente desativado. Procure a unidade de saúde.' };
      }

      // Check per-patient block
      const { data: pac } = await (supabase as any).from('pacientes').select('id').eq('auth_user_id', authUserId).single();
      if (pac && portalConfig?.pacientesBloqueados?.includes(pac.id)) {
        return { allowed: false, message: 'Seu acesso ao portal está temporariamente desativado. Procure a unidade.' };
      }

      return { allowed: true, message: '' };
    } catch {
      return { allowed: true, message: '' }; // fail open to not break existing flow
    }
  };

  const loadPacienteData = async (authUserId: string) => {
    const { data: pac } = await (supabase as any).from('pacientes').select('*').eq('auth_user_id', authUserId).single();
    if (!pac) { setIsLoggedIn(false); return; }
    setPaciente(pac); setIsLoggedIn(true);
    const { data: ags } = await (supabase as any).from('agendamentos').select('*').eq('paciente_id', pac.id).order('data', { ascending: false });
    if (ags) setAgendamentos(ags);
    const { data: filaData } = await (supabase as any).from('fila_espera').select('*').eq('paciente_id', pac.id).in('status', ['aguardando', 'chamado']);
    if (filaData) setFila(filaData);
    const { data: unis } = await (supabase as any).from('unidades').select('*');
    if (unis) setUnidades(unis);
  };

  const handleLogin = async () => {
    if (!loginForm.email || !loginForm.senha) { toast.error('Preencha e-mail e senha.'); return; }
    setLoginLoading(true);
    try {
      const { data, error } = await supabase.auth.signInWithPassword({ email: loginForm.email.trim().toLowerCase(), password: loginForm.senha });
      if (error) { toast.error('E-mail ou senha incorretos.'); setLoginLoading(false); return; }
      if (data.session?.user) {
        // Check portal access before allowing login
        const accessCheck = await checkPortalAccess(data.session.user.id);
        if (!accessCheck.allowed) {
          await supabase.auth.signOut();
          toast.error(accessCheck.message);
          setLoginLoading(false);
          return;
        }
        await loadPacienteData(data.session.user.id);
      }
    } catch { toast.error('Erro ao conectar.'); }
    setLoginLoading(false);
  };

  const handleLogout = async () => { await supabase.auth.signOut(); setPaciente(null); setAgendamentos([]); setFila([]); setIsLoggedIn(false); };

  const handleCancelar = async (agId: string) => {
    try {
      await (supabase as any).from('agendamentos').update({ status: 'cancelado' }).eq('id', agId);
      setAgendamentos(prev => prev.map(a => a.id === agId ? { ...a, status: 'cancelado' } : a));
      toast.success('Agendamento cancelado.');
    } catch { toast.error('Erro ao cancelar.'); }
  };

  const getUnidadeNome = (id: string) => unidades.find(u => u.id === id)?.nome || '';

  const handlePrintComprovante = (ag: AgendamentoData) => {
    const unidade = unidades.find(u => u.id === ag.unidade_id);
    const body = `
      <div class="content-block">
        <div class="field"><div class="field-label">Paciente</div><div class="field-value">${paciente?.nome || ''}</div></div>
        <div class="field"><div class="field-label">CPF</div><div class="field-value">${paciente?.cpf || '-'}</div></div>
        <div class="field"><div class="field-label">Data</div><div class="field-value">${new Date(ag.data + 'T12:00:00').toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric' })}</div></div>
        <div class="field"><div class="field-label">Horário</div><div class="field-value">${ag.hora}</div></div>
        <div class="field"><div class="field-label">Profissional</div><div class="field-value">${ag.profissional_nome}</div></div>
        <div class="field"><div class="field-label">Tipo</div><div class="field-value">${ag.tipo}</div></div>
        <div class="field"><div class="field-label">Unidade</div><div class="field-value">${unidade?.nome || ''}</div></div>
        <div class="field"><div class="field-label">Endereço</div><div class="field-value">${unidade?.endereco || ''}</div></div>
        <div class="field"><div class="field-label">Status</div><div class="field-value">${ag.status}</div></div>
        <div class="qr-area"><p>Apresente este comprovante na recepção</p><p class="code">Código: ${ag.id}</p></div>
        <p style="text-align:center;margin-top:16px;font-size:11px;color:#64748b;">Chegue com 15 minutos de antecedência.</p>
      </div>`;
    openPrintDocument('Comprovante de Agendamento', body, { 'Unidade': unidade?.nome || '' });
  };

  const handleVerifyRecovery = async () => {
    setRecErro('');
    if (!recCpf.trim() || !recEmail.trim()) { setRecErro('Preencha CPF e e-mail.'); return; }
    setRecLoading(true);
    setRecoveryStep('newpass');
    setRecLoading(false);
  };

  const handleResetPassword = async () => {
    setRecErro('');
    if (recNovaSenha.length < 6) { setRecErro('A senha deve ter no mínimo 6 caracteres.'); return; }
    if (recNovaSenha !== recConfirmar) { setRecErro('As senhas não conferem.'); return; }
    setRecLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('reset-password', {
        body: { cpf: recCpf, email: recEmail, novaSenha: recNovaSenha, tipo: 'paciente' },
      });
      if (error || data?.error) { setRecErro(data?.error || 'Erro ao redefinir senha.'); setRecLoading(false); return; }
      setRecoveryStep('done');
      toast.success('Senha alterada com sucesso!');
      setTimeout(() => { setRecoveryStep('none'); setRecCpf(''); setRecEmail(''); setRecNovaSenha(''); setRecConfirmar(''); }, 3000);
    } catch { setRecErro('Erro ao conectar ao servidor.'); }
    setRecLoading(false);
  };

  if (isLoading) {
    return <div className="min-h-screen flex items-center justify-center bg-background"><Loader2 className="w-8 h-8 animate-spin text-primary" /></div>;
  }

  // Login screen
  if (!isLoggedIn) {
    // Recovery flow
    if (recoveryStep !== 'none') {
      return (
        <div className="min-h-screen bg-background">
          <div className="gradient-hero text-primary-foreground py-8">
            <div className="container mx-auto px-4">
              <button onClick={() => { setRecoveryStep('none'); setRecErro(''); }} className="inline-flex items-center text-sm opacity-70 hover:opacity-100 mb-4">
                <ArrowLeft className="w-4 h-4 mr-1" />Voltar ao login
              </button>
              <h1 className="text-2xl md:text-3xl font-bold font-display">Recuperar Senha</h1>
              <p className="opacity-80 mt-1">Portal do Paciente — SMS Oriximiná</p>
            </div>
          </div>
          <div className="container mx-auto px-4 py-8 max-w-md">
            <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>
              <Card className="shadow-elevated border-0">
                <CardContent className="p-6 space-y-4">
                  <div className="text-center mb-2">
                    <div className="w-14 h-14 rounded-full gradient-primary flex items-center justify-center mx-auto mb-3">
                      <KeyRound className="w-7 h-7 text-primary-foreground" />
                    </div>
                  </div>

                  {recoveryStep === 'done' ? (
                    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="text-center space-y-3">
                      <p className="text-success font-semibold">✅ Senha alterada com sucesso!</p>
                      <p className="text-sm text-muted-foreground">Você já pode fazer login com a nova senha.</p>
                    </motion.div>
                  ) : recoveryStep === 'verify' ? (
                    <div className="space-y-4">
                      <div><Label>CPF</Label><Input value={recCpf} onChange={e => setRecCpf(e.target.value)} placeholder="000.000.000-00" /></div>
                      <div><Label>E-mail cadastrado</Label><Input type="email" value={recEmail} onChange={e => setRecEmail(e.target.value)} placeholder="seu@email.com" /></div>
                      {recErro && <p className="text-sm text-destructive text-center">{recErro}</p>}
                      <Button onClick={handleVerifyRecovery} className="w-full gradient-primary text-primary-foreground" disabled={recLoading}>
                        {recLoading && <Loader2 className="w-4 h-4 animate-spin mr-2" />} Verificar dados
                      </Button>
                    </div>
                  ) : (
                    <div className="space-y-4">
                      <div>
                        <Label>Nova senha</Label>
                        <div className="relative">
                          <Input type={showNova ? 'text' : 'password'} value={recNovaSenha} onChange={e => setRecNovaSenha(e.target.value)} placeholder="Mínimo 6 caracteres" />
                          <button type="button" onClick={() => setShowNova(!showNova)} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
                            {showNova ? <EyeOff size={16} /> : <Eye size={16} />}
                          </button>
                        </div>
                      </div>
                      <div>
                        <Label>Confirmar nova senha</Label>
                        <div className="relative">
                          <Input type={showConfirmar ? 'text' : 'password'} value={recConfirmar} onChange={e => setRecConfirmar(e.target.value)} placeholder="Repita a senha" />
                          <button type="button" onClick={() => setShowConfirmar(!showConfirmar)} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
                            {showConfirmar ? <EyeOff size={16} /> : <Eye size={16} />}
                          </button>
                        </div>
                      </div>
                      {recErro && <p className="text-sm text-destructive text-center">{recErro}</p>}
                      <Button onClick={handleResetPassword} className="w-full gradient-primary text-primary-foreground" disabled={recLoading}>
                        {recLoading && <Loader2 className="w-4 h-4 animate-spin mr-2" />} Salvar nova senha
                      </Button>
                    </div>
                  )}
                </CardContent>
              </Card>
            </motion.div>
          </div>
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
            <h1 className="text-2xl md:text-3xl font-bold font-display">Portal do Paciente</h1>
            <p className="opacity-80 mt-1">SMS Oriximiná — Acesse seus agendamentos</p>
          </div>
        </div>
        <div className="container mx-auto px-4 py-8 max-w-md">
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>
            <Card className="shadow-elevated border-0">
              <CardContent className="p-6 space-y-4">
                <div className="text-center mb-2">
                  <div className="w-14 h-14 rounded-full gradient-primary flex items-center justify-center mx-auto mb-3">
                    <User className="w-7 h-7 text-primary-foreground" />
                  </div>
                  <h2 className="text-lg font-bold font-display text-foreground">Entrar no Portal</h2>
                  <p className="text-sm text-muted-foreground">Use o e-mail e senha criados no agendamento</p>
                </div>
                <div><Label>E-mail</Label><Input type="email" value={loginForm.email} onChange={e => setLoginForm(p => ({ ...p, email: e.target.value }))} placeholder="seu@email.com" /></div>
                <div>
                  <Label>Senha</Label>
                  <div className="relative">
                    <Input type={showLoginSenha ? 'text' : 'password'} value={loginForm.senha} onChange={e => setLoginForm(p => ({ ...p, senha: e.target.value }))} placeholder="••••••••" className="pr-10"
                      onKeyDown={e => e.key === 'Enter' && handleLogin()} />
                    <button type="button" onClick={() => setShowLoginSenha(!showLoginSenha)} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
                      {showLoginSenha ? <EyeOff size={16} /> : <Eye size={16} />}
                    </button>
                  </div>
                </div>
                <Button onClick={handleLogin} className="w-full gradient-primary text-primary-foreground" disabled={loginLoading}>
                  {loginLoading ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
                  {loginLoading ? 'Entrando...' : 'Entrar'}
                </Button>
                <button type="button" onClick={() => { setRecoveryStep('verify'); setRecErro(''); }} className="w-full text-sm text-primary hover:underline">
                  Esqueci minha senha
                </button>
                <p className="text-xs text-center text-muted-foreground">
                  Ainda não tem conta? <Link to="/agendar" className="text-primary underline">Agende uma consulta</Link> para criar seu acesso.
                </p>
              </CardContent>
            </Card>
          </motion.div>
        </div>
      </div>
    );
  }

  // Portal dashboard
  const futureAgendamentos = agendamentos.filter(a => {
    const agDate = new Date(a.data + 'T23:59:59');
    return agDate >= new Date() && !['cancelado', 'falta'].includes(a.status);
  });
  const pastAgendamentos = agendamentos.filter(a => {
    const agDate = new Date(a.data + 'T23:59:59');
    return agDate < new Date() || ['cancelado', 'concluido', 'falta'].includes(a.status);
  });

  return (
    <div className="min-h-screen bg-background">
      <div className="gradient-hero text-primary-foreground py-6">
        <div className="container mx-auto px-4 flex items-center justify-between">
          <div>
            <h1 className="text-xl md:text-2xl font-bold font-display">Olá, {paciente?.nome?.split(' ')[0]}!</h1>
            <p className="opacity-80 text-sm">Portal do Paciente — SMS Oriximiná</p>
          </div>
          <Button variant="ghost" size="sm" onClick={handleLogout} className="text-primary-foreground/80 hover:text-primary-foreground">
            <LogOut className="w-4 h-4 mr-1" /> Sair
          </Button>
        </div>
      </div>

      <div className="container mx-auto px-4 py-6 max-w-3xl">
        <Tabs defaultValue="proximos" className="space-y-4">
          <TabsList className="grid grid-cols-3 w-full">
            <TabsTrigger value="proximos" className="text-xs sm:text-sm">
              <Calendar className="w-4 h-4 mr-1 hidden sm:inline" /> Próximas ({futureAgendamentos.length})
            </TabsTrigger>
            <TabsTrigger value="historico" className="text-xs sm:text-sm">
              <FileText className="w-4 h-4 mr-1 hidden sm:inline" /> Histórico
            </TabsTrigger>
            <TabsTrigger value="fila" className="text-xs sm:text-sm">
              <List className="w-4 h-4 mr-1 hidden sm:inline" /> Fila ({fila.length})
            </TabsTrigger>
          </TabsList>

          <TabsContent value="proximos" className="space-y-3">
            {futureAgendamentos.length === 0 ? (
              <Card className="shadow-card border-0"><CardContent className="p-8 text-center text-muted-foreground">
                <Calendar className="w-10 h-10 mx-auto mb-3 opacity-30" />
                <p>Nenhuma consulta agendada.</p>
                <Link to="/agendar"><Button className="mt-4 gradient-primary text-primary-foreground">Agendar Consulta</Button></Link>
              </CardContent></Card>
            ) : futureAgendamentos.map(ag => {
              const st = statusLabels[ag.status] || { label: ag.status, class: 'bg-muted text-muted-foreground' };
              const canCancel = ['pendente', 'confirmado'].includes(ag.status);
              return (
                <Card key={ag.id} className="shadow-card border-0">
                  <CardContent className="p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-1">
                          <span className="text-lg font-mono font-bold text-primary">{ag.hora}</span>
                          <span className={cn("text-xs px-2 py-0.5 rounded-full font-medium", st.class)}>{st.label}</span>
                          <span className={cn("text-xs px-2 py-0.5 rounded-full font-medium", ag.tipo === 'Retorno' ? 'bg-accent/80 text-accent-foreground' : 'bg-primary/10 text-primary')}>
                            {ag.tipo === 'Retorno' ? 'Retorno' : '1ª Consulta'}
                          </span>
                        </div>
                        <p className="text-sm font-medium text-foreground">{new Date(ag.data + 'T12:00:00').toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: 'long' })}</p>
                        <p className="text-sm text-muted-foreground">{ag.profissional_nome}</p>
                        {ag.unidade_id && <p className="text-xs text-muted-foreground flex items-center gap-1 mt-1"><MapPin className="w-3 h-3" />{getUnidadeNome(ag.unidade_id)}</p>}
                      </div>
                      <div className="flex flex-col gap-1">
                        <Button size="sm" variant="outline" className="text-xs" onClick={() => handlePrintComprovante(ag)}>
                          <FileText className="w-3.5 h-3.5 mr-1" />Comprovante
                        </Button>
                        {canCancel && (
                          <AlertDialog>
                            <AlertDialogTrigger asChild><Button size="sm" variant="ghost" className="text-xs text-destructive">Cancelar</Button></AlertDialogTrigger>
                            <AlertDialogContent>
                              <AlertDialogHeader>
                                <AlertDialogTitle>Cancelar consulta?</AlertDialogTitle>
                                <AlertDialogDescription>Deseja cancelar a consulta de {new Date(ag.data + 'T12:00:00').toLocaleDateString('pt-BR')} às {ag.hora}?</AlertDialogDescription>
                              </AlertDialogHeader>
                              <AlertDialogFooter>
                                <AlertDialogCancel>Não</AlertDialogCancel>
                                <AlertDialogAction onClick={() => handleCancelar(ag.id)} className="bg-destructive text-destructive-foreground">Sim, cancelar</AlertDialogAction>
                              </AlertDialogFooter>
                            </AlertDialogContent>
                          </AlertDialog>
                        )}
                      </div>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
            <div className="text-center pt-2"><Link to="/agendar"><Button variant="outline">Agendar Nova Consulta</Button></Link></div>
          </TabsContent>

          <TabsContent value="historico" className="space-y-3">
            {pastAgendamentos.length === 0 ? (
              <Card className="shadow-card border-0"><CardContent className="p-8 text-center text-muted-foreground">Nenhum histórico.</CardContent></Card>
            ) : pastAgendamentos.map(ag => {
              const st = statusLabels[ag.status] || { label: ag.status, class: 'bg-muted text-muted-foreground' };
              return (
                <Card key={ag.id} className="shadow-card border-0 opacity-80">
                  <CardContent className="p-4 flex items-center gap-3">
                    <div className="flex-1">
                      <p className="text-sm font-medium text-foreground">{new Date(ag.data + 'T12:00:00').toLocaleDateString('pt-BR')} — {ag.hora}</p>
                      <p className="text-sm text-muted-foreground">{ag.profissional_nome} • {ag.tipo}</p>
                    </div>
                    <span className={cn("text-xs px-2 py-0.5 rounded-full font-medium", st.class)}>{st.label}</span>
                    <Button size="sm" variant="ghost" className="text-xs" onClick={() => handlePrintComprovante(ag)}><FileText className="w-3.5 h-3.5" /></Button>
                  </CardContent>
                </Card>
              );
            })}
          </TabsContent>

          <TabsContent value="fila" className="space-y-3">
            {fila.length === 0 ? (
              <Card className="shadow-card border-0"><CardContent className="p-8 text-center text-muted-foreground">
                <List className="w-10 h-10 mx-auto mb-3 opacity-30" />
                <p>Você não está em nenhuma fila de espera.</p>
              </CardContent></Card>
            ) : fila.map(f => (
              <Card key={f.id} className="shadow-card border-0">
                <CardContent className="p-4">
                  <div className="flex items-center gap-4">
                    <div className="w-12 h-12 rounded-full gradient-primary flex items-center justify-center text-primary-foreground font-bold text-lg">{f.posicao}º</div>
                    <div className="flex-1">
                      <p className="font-medium text-foreground">Posição {f.posicao} na fila</p>
                      <p className="text-sm text-muted-foreground">Setor: {f.setor}</p>
                      <p className="text-xs text-muted-foreground">Chegada: {f.hora_chegada}</p>
                    </div>
                    <span className={cn("text-xs px-2.5 py-1 rounded-full font-medium", f.status === 'chamado' ? 'bg-success/10 text-success animate-pulse' : 'bg-warning/10 text-warning')}>
                      {f.status === 'chamado' ? '🔔 Chamado!' : 'Aguardando'}
                    </span>
                  </div>
                </CardContent>
              </Card>
            ))}
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
};

export default PortalPaciente;
