import React, { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog';
import { Calendar, Clock, User, FileText, LogOut, ArrowLeft, Loader2, MapPin, AlertCircle, List } from 'lucide-react';
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

const PortalPaciente: React.FC = () => {
  const navigate = useNavigate();
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [loginLoading, setLoginLoading] = useState(false);
  const [loginForm, setLoginForm] = useState({ email: '', senha: '' });
  const [paciente, setPaciente] = useState<PacienteData | null>(null);
  const [agendamentos, setAgendamentos] = useState<AgendamentoData[]>([]);
  const [fila, setFila] = useState<FilaData[]>([]);
  const [unidades, setUnidades] = useState<any[]>([]);

  useEffect(() => {
    checkSession();
  }, []);

  const checkSession = async () => {
    const { data: { session } } = await supabase.auth.getSession();
    if (session?.user) {
      await loadPacienteData(session.user.id);
    }
    setIsLoading(false);
  };

  const loadPacienteData = async (authUserId: string) => {
    const { data: pac } = await (supabase as any)
      .from('pacientes')
      .select('*')
      .eq('auth_user_id', authUserId)
      .single();

    if (!pac) {
      setIsLoggedIn(false);
      return;
    }

    setPaciente(pac);
    setIsLoggedIn(true);

    // Load agendamentos
    const { data: ags } = await (supabase as any)
      .from('agendamentos')
      .select('*')
      .eq('paciente_id', pac.id)
      .order('data', { ascending: false });
    if (ags) setAgendamentos(ags);

    // Load fila
    const { data: filaData } = await (supabase as any)
      .from('fila_espera')
      .select('*')
      .eq('paciente_id', pac.id)
      .in('status', ['aguardando', 'chamado']);
    if (filaData) setFila(filaData);

    // Load unidades
    const { data: unis } = await (supabase as any).from('unidades').select('*');
    if (unis) setUnidades(unis);
  };

  const handleLogin = async () => {
    if (!loginForm.email || !loginForm.senha) {
      toast.error('Preencha e-mail e senha.');
      return;
    }
    setLoginLoading(true);
    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email: loginForm.email.trim().toLowerCase(),
        password: loginForm.senha,
      });

      if (error) {
        toast.error('E-mail ou senha incorretos.');
        setLoginLoading(false);
        return;
      }

      if (data.session?.user) {
        await loadPacienteData(data.session.user.id);
      }
    } catch {
      toast.error('Erro ao conectar.');
    }
    setLoginLoading(false);
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
    setPaciente(null);
    setAgendamentos([]);
    setFila([]);
    setIsLoggedIn(false);
  };

  const handleCancelar = async (agId: string) => {
    try {
      await (supabase as any).from('agendamentos').update({ status: 'cancelado' }).eq('id', agId);
      setAgendamentos(prev => prev.map(a => a.id === agId ? { ...a, status: 'cancelado' } : a));
      toast.success('Agendamento cancelado.');
    } catch {
      toast.error('Erro ao cancelar.');
    }
  };

  const getUnidadeNome = (id: string) => unidades.find(u => u.id === id)?.nome || '';
  const getUnidadeEndereco = (id: string) => unidades.find(u => u.id === id)?.endereco || '';

  const handlePrintComprovante = (ag: AgendamentoData) => {
    const unidade = unidades.find(u => u.id === ag.unidade_id);
    const printWindow = window.open('', '_blank');
    if (!printWindow) { toast.error('Habilite popups.'); return; }

    printWindow.document.write(`
      <!DOCTYPE html><html><head><title>Comprovante</title>
      <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body { font-family: 'Segoe UI', Arial, sans-serif; padding: 30px; color: #333; }
        .header { text-align: center; border-bottom: 2px solid #0369a1; padding-bottom: 16px; margin-bottom: 20px; }
        .header h1 { font-size: 18px; color: #0369a1; }
        .content { max-width: 500px; margin: 0 auto; }
        .field { margin-bottom: 12px; }
        .label { font-size: 11px; text-transform: uppercase; color: #666; font-weight: 600; }
        .value { font-size: 14px; margin-top: 2px; }
        .qr { text-align: center; margin-top: 30px; padding: 20px; border: 1px dashed #ccc; border-radius: 8px; }
        .footer { text-align: center; margin-top: 30px; font-size: 10px; color: #999; }
        @media print { body { padding: 15px; } }
      </style></head>
      <body>
        <div class="header">
          <h1>Secretaria Municipal de Saúde de Oriximiná</h1>
          <p style="font-size: 14px; font-weight: 600; margin-top: 8px;">COMPROVANTE DE AGENDAMENTO</p>
        </div>
        <div class="content">
          <div class="field"><div class="label">Paciente</div><div class="value">${paciente?.nome || ''}</div></div>
          <div class="field"><div class="label">Data</div><div class="value">${new Date(ag.data + 'T12:00:00').toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric' })}</div></div>
          <div class="field"><div class="label">Horário</div><div class="value">${ag.hora}</div></div>
          <div class="field"><div class="label">Profissional</div><div class="value">${ag.profissional_nome}</div></div>
          <div class="field"><div class="label">Tipo</div><div class="value">${ag.tipo}</div></div>
          <div class="field"><div class="label">Unidade</div><div class="value">${unidade?.nome || ''}</div></div>
          <div class="field"><div class="label">Endereço</div><div class="value">${unidade?.endereco || ''}</div></div>
          <div class="field"><div class="label">Status</div><div class="value">${ag.status}</div></div>
          <div class="qr">
            <p style="font-size: 12px; color: #666;">Apresente este comprovante na recepção</p>
            <p style="font-size: 11px; color: #999; margin-top: 4px;">Código: ${ag.id}</p>
          </div>
        </div>
        <div class="footer">
          <p>Documento gerado em ${new Date().toLocaleString('pt-BR')} — SMS Oriximiná</p>
          <p style="margin-top: 4px;">Chegue com 15 minutos de antecedência.</p>
        </div>
      </body></html>
    `);
    printWindow.document.close();
    printWindow.focus();
    printWindow.print();
  };

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  // Login screen
  if (!isLoggedIn) {
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
                <div>
                  <Label>E-mail</Label>
                  <Input type="email" value={loginForm.email} onChange={e => setLoginForm(p => ({ ...p, email: e.target.value }))} placeholder="seu@email.com" />
                </div>
                <div>
                  <Label>Senha</Label>
                  <Input type="password" value={loginForm.senha} onChange={e => setLoginForm(p => ({ ...p, senha: e.target.value }))} placeholder="••••••••"
                    onKeyDown={e => e.key === 'Enter' && handleLogin()} />
                </div>
                <Button onClick={handleLogin} className="w-full gradient-primary text-primary-foreground" disabled={loginLoading}>
                  {loginLoading ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
                  {loginLoading ? 'Entrando...' : 'Entrar'}
                </Button>
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
              <Card className="shadow-card border-0">
                <CardContent className="p-8 text-center text-muted-foreground">
                  <Calendar className="w-10 h-10 mx-auto mb-3 opacity-30" />
                  <p>Nenhuma consulta agendada.</p>
                  <Link to="/agendar"><Button className="mt-4 gradient-primary text-primary-foreground">Agendar Consulta</Button></Link>
                </CardContent>
              </Card>
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
                          <span className={cn("text-xs px-2 py-0.5 rounded-full font-medium",
                            ag.tipo === 'Retorno' ? 'bg-accent/80 text-accent-foreground' : 'bg-primary/10 text-primary'
                          )}>{ag.tipo === 'Retorno' ? 'Retorno' : '1ª Consulta'}</span>
                        </div>
                        <p className="text-sm font-medium text-foreground">
                          {new Date(ag.data + 'T12:00:00').toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: 'long' })}
                        </p>
                        <p className="text-sm text-muted-foreground">{ag.profissional_nome}</p>
                        {ag.unidade_id && <p className="text-xs text-muted-foreground flex items-center gap-1 mt-1"><MapPin className="w-3 h-3" />{getUnidadeNome(ag.unidade_id)}</p>}
                      </div>
                      <div className="flex flex-col gap-1">
                        <Button size="sm" variant="outline" className="text-xs" onClick={() => handlePrintComprovante(ag)}>
                          <FileText className="w-3.5 h-3.5 mr-1" />Comprovante
                        </Button>
                        {canCancel && (
                          <AlertDialog>
                            <AlertDialogTrigger asChild>
                              <Button size="sm" variant="ghost" className="text-xs text-destructive">Cancelar</Button>
                            </AlertDialogTrigger>
                            <AlertDialogContent>
                              <AlertDialogHeader>
                                <AlertDialogTitle>Cancelar consulta?</AlertDialogTitle>
                                <AlertDialogDescription>
                                  Deseja cancelar a consulta de {new Date(ag.data + 'T12:00:00').toLocaleDateString('pt-BR')} às {ag.hora}?
                                </AlertDialogDescription>
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
            <div className="text-center pt-2">
              <Link to="/agendar"><Button variant="outline">Agendar Nova Consulta</Button></Link>
            </div>
          </TabsContent>

          <TabsContent value="historico" className="space-y-3">
            {pastAgendamentos.length === 0 ? (
              <Card className="shadow-card border-0">
                <CardContent className="p-8 text-center text-muted-foreground">Nenhum histórico.</CardContent>
              </Card>
            ) : pastAgendamentos.map(ag => {
              const st = statusLabels[ag.status] || { label: ag.status, class: 'bg-muted text-muted-foreground' };
              return (
                <Card key={ag.id} className="shadow-card border-0 opacity-80">
                  <CardContent className="p-4 flex items-center gap-3">
                    <div className="flex-1">
                      <p className="text-sm font-medium text-foreground">
                        {new Date(ag.data + 'T12:00:00').toLocaleDateString('pt-BR')} — {ag.hora}
                      </p>
                      <p className="text-sm text-muted-foreground">{ag.profissional_nome} • {ag.tipo}</p>
                    </div>
                    <span className={cn("text-xs px-2 py-0.5 rounded-full font-medium", st.class)}>{st.label}</span>
                    <Button size="sm" variant="ghost" className="text-xs" onClick={() => handlePrintComprovante(ag)}>
                      <FileText className="w-3.5 h-3.5" />
                    </Button>
                  </CardContent>
                </Card>
              );
            })}
          </TabsContent>

          <TabsContent value="fila" className="space-y-3">
            {fila.length === 0 ? (
              <Card className="shadow-card border-0">
                <CardContent className="p-8 text-center text-muted-foreground">
                  <List className="w-10 h-10 mx-auto mb-3 opacity-30" />
                  <p>Você não está em nenhuma fila de espera.</p>
                </CardContent>
              </Card>
            ) : fila.map(f => (
              <Card key={f.id} className="shadow-card border-0">
                <CardContent className="p-4">
                  <div className="flex items-center gap-4">
                    <div className="w-12 h-12 rounded-full gradient-primary flex items-center justify-center text-primary-foreground font-bold text-lg">
                      {f.posicao}º
                    </div>
                    <div className="flex-1">
                      <p className="font-medium text-foreground">Posição {f.posicao} na fila</p>
                      <p className="text-sm text-muted-foreground">Setor: {f.setor}</p>
                      <p className="text-xs text-muted-foreground">Chegada: {f.hora_chegada}</p>
                    </div>
                    <span className={cn("text-xs px-2.5 py-1 rounded-full font-medium",
                      f.status === 'chamado' ? 'bg-success/10 text-success animate-pulse' : 'bg-warning/10 text-warning'
                    )}>
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
