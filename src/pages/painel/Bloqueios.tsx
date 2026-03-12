import React, { useState, useMemo } from 'react';
import { useData } from '@/contexts/DataContext';
import { useAuth } from '@/contexts/AuthContext';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog';
import { Badge } from '@/components/ui/badge';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { Plus, Trash2, CalendarOff, Download, Building2, Globe, User } from 'lucide-react';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';

const tipoOptions = [
  { value: 'feriado', label: '🏛️ Feriado', badge: 'bg-destructive/10 text-destructive' },
  { value: 'ferias', label: '📅 Recesso / Férias', badge: 'bg-info/10 text-info' },
  { value: 'reuniao', label: '📋 Reunião', badge: 'bg-warning/10 text-warning' },
  { value: 'indisponibilidade', label: '👤 Indisponibilidade', badge: 'bg-muted text-muted-foreground' },
];

const feriadosNacionais2026 = [
  { date: '2026-01-01', reason: 'Confraternização Universal' },
  { date: '2026-02-16', reason: 'Carnaval' },
  { date: '2026-02-17', reason: 'Carnaval' },
  { date: '2026-02-18', reason: 'Quarta-feira de Cinzas (meio dia)' },
  { date: '2026-04-03', reason: 'Sexta-feira Santa' },
  { date: '2026-04-21', reason: 'Tiradentes' },
  { date: '2026-05-01', reason: 'Dia do Trabalho' },
  { date: '2026-06-04', reason: 'Corpus Christi' },
  { date: '2026-09-07', reason: 'Independência do Brasil' },
  { date: '2026-10-12', reason: 'Nossa Senhora Aparecida' },
  { date: '2026-11-02', reason: 'Finados' },
  { date: '2026-11-15', reason: 'Proclamação da República' },
  { date: '2026-11-20', reason: 'Consciência Negra' },
  { date: '2026-12-25', reason: 'Natal' },
];

const Bloqueios: React.FC = () => {
  const { bloqueios, addBloqueio, deleteBloqueio, refreshBloqueios, unidades, funcionarios, logAction } = useData();
  const { user, hasPermission } = useAuth();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [importing, setImporting] = useState(false);
  const [form, setForm] = useState({
    titulo: '',
    tipo: 'feriado' as 'feriado' | 'ferias' | 'reuniao' | 'indisponibilidade',
    dataInicio: '',
    dataFim: '',
    diaInteiro: true,
    horaInicio: '',
    horaFim: '',
    scope: 'global' as 'global' | 'unidade' | 'profissional',
    unidadeId: '',
    profissionalId: '',
  });

  const isMaster = user?.role === 'master';
  const isCoordenador = user?.role === 'coordenador';
  const canCreate = isMaster || isCoordenador;
  const profissionais = funcionarios.filter(f => f.role === 'profissional' && f.ativo);

  const visibleBloqueios = useMemo(() => {
    if (isMaster) return bloqueios;
    if (isCoordenador && user?.unidadeId) {
      return bloqueios.filter(b => !b.unidadeId || b.unidadeId === user.unidadeId);
    }
    // recepcao: read-only, same unit filter
    if (user?.unidadeId) {
      return bloqueios.filter(b => !b.unidadeId || b.unidadeId === user.unidadeId);
    }
    return bloqueios;
  }, [bloqueios, user, isMaster, isCoordenador]);

  const getScopeLabel = (b: typeof bloqueios[0]) => {
    if (b.profissionalId) {
      const prof = funcionarios.find(f => f.id === b.profissionalId);
      return prof ? `👤 ${prof.nome}` : '👤 Profissional';
    }
    if (b.unidadeId) {
      const unidade = unidades.find(u => u.id === b.unidadeId);
      return unidade ? `🏥 ${unidade.nome}` : '🏥 Unidade';
    }
    return '🌐 Global';
  };

  const getScopeIcon = (b: typeof bloqueios[0]) => {
    if (b.profissionalId) return User;
    if (b.unidadeId) return Building2;
    return Globe;
  };

  const handleSave = async () => {
    if (!form.titulo || !form.dataInicio || !form.dataFim) {
      toast.error('Preencha todos os campos obrigatórios.');
      return;
    }
    if (form.dataFim < form.dataInicio) {
      toast.error('Data final deve ser igual ou posterior à data inicial.');
      return;
    }
    if (form.scope === 'unidade' && !form.unidadeId) {
      toast.error('Selecione a unidade.');
      return;
    }
    if (form.scope === 'profissional' && !form.profissionalId) {
      toast.error('Selecione o profissional.');
      return;
    }
    // Coordenador can only block own unit
    if (isCoordenador && form.scope === 'global') {
      toast.error('Apenas Master pode criar bloqueios globais.');
      return;
    }

    await addBloqueio({
      titulo: form.titulo,
      tipo: form.tipo,
      dataInicio: form.dataInicio,
      dataFim: form.dataFim,
      diaInteiro: form.diaInteiro,
      horaInicio: form.diaInteiro ? '' : form.horaInicio,
      horaFim: form.diaInteiro ? '' : form.horaFim,
      unidadeId: form.scope === 'unidade' ? form.unidadeId : (form.scope === 'profissional' ? (funcionarios.find(f => f.id === form.profissionalId)?.unidadeId || '') : ''),
      profissionalId: form.scope === 'profissional' ? form.profissionalId : '',
      criadoPor: user?.id || '',
    });

    toast.success('Bloqueio cadastrado com sucesso!');
    setDialogOpen(false);
    setForm({ titulo: '', tipo: 'feriado', dataInicio: '', dataFim: '', diaInteiro: true, horaInicio: '', horaFim: '', scope: 'global', unidadeId: '', profissionalId: '' });
    await refreshBloqueios();
  };

  const handleImportHolidays = async () => {
    setImporting(true);
    try {
      const existingDates = new Set(bloqueios.filter(b => b.tipo === 'feriado' && !b.unidadeId && !b.profissionalId).map(b => b.dataInicio));
      const toImport = feriadosNacionais2026.filter(f => !existingDates.has(f.date));

      if (toImport.length === 0) {
        toast.info('Todos os feriados nacionais de 2026 já estão cadastrados.');
        setImporting(false);
        return;
      }

      for (const f of toImport) {
        await addBloqueio({
          titulo: f.reason,
          tipo: 'feriado',
          dataInicio: f.date,
          dataFim: f.date,
          diaInteiro: true,
          horaInicio: '',
          horaFim: '',
          unidadeId: '',
          profissionalId: '',
          criadoPor: user?.id || '',
        });
      }

      await logAction({
        acao: 'importar_feriados', entidade: 'bloqueio', detalhes: { total: toImport.length, ano: 2026 }, user,
      });

      toast.success(`${toImport.length} feriados nacionais de 2026 importados!`);
      await refreshBloqueios();
    } catch (err) {
      console.error('Error importing holidays:', err);
      toast.error('Erro ao importar feriados.');
    } finally {
      setImporting(false);
    }
  };

  const handleDelete = async (id: string) => {
    await deleteBloqueio(id);
    toast.success('Bloqueio removido.');
    await refreshBloqueios();
  };

  const canDelete = (b: typeof bloqueios[0]) => {
    if (isMaster) return true;
    if (isCoordenador) return b.criadoPor === user?.id;
    return false;
  };

  const formatDate = (d: string) => {
    if (!d) return '';
    const date = new Date(d + 'T12:00:00');
    return date.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' });
  };

  const formatDateRange = (ini: string, fim: string) => {
    if (ini === fim) return formatDate(ini);
    return `${formatDate(ini)} — ${formatDate(fim)}`;
  };

  const tipoInfo = (tipo: string) => tipoOptions.find(t => t.value === tipo) || tipoOptions[0];

  return (
    <div className="space-y-4 animate-fade-in">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold font-display text-foreground">Feriados e Bloqueios</h1>
          <p className="text-muted-foreground text-sm">Gerenciar datas bloqueadas para agendamento</p>
        </div>
        <div className="flex gap-2">
          {isMaster && (
            <Button variant="outline" onClick={handleImportHolidays} disabled={importing}>
              <Download className="w-4 h-4 mr-2" />
              {importing ? 'Importando...' : 'Importar Feriados 2026'}
            </Button>
          )}
          {canCreate && (
            <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
              <DialogTrigger asChild>
                <Button className="gradient-primary text-primary-foreground">
                  <Plus className="w-4 h-4 mr-2" /> Novo Bloqueio
                </Button>
              </DialogTrigger>
              <DialogContent className="sm:max-w-md">
                <DialogHeader>
                  <DialogTitle className="font-display">Bloquear Data para Agendamentos</DialogTitle>
                </DialogHeader>
                <div className="space-y-4">
                  <div>
                    <Label>Motivo *</Label>
                    <Input value={form.titulo} onChange={e => setForm(p => ({ ...p, titulo: e.target.value }))} placeholder="Ex: Natal, Férias Dr. João, Reunião" />
                  </div>
                  <div>
                    <Label>Tipo *</Label>
                    <Select value={form.tipo} onValueChange={v => setForm(p => ({ ...p, tipo: v as any }))}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {tipoOptions.map(t => (
                          <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <Label>Data Início *</Label>
                      <Input type="date" value={form.dataInicio} onChange={e => setForm(p => ({ ...p, dataInicio: e.target.value, dataFim: p.dataFim || e.target.value }))} />
                    </div>
                    <div>
                      <Label>Data Fim *</Label>
                      <Input type="date" value={form.dataFim} onChange={e => setForm(p => ({ ...p, dataFim: e.target.value }))} min={form.dataInicio} />
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <input type="checkbox" checked={form.diaInteiro} onChange={e => setForm(p => ({ ...p, diaInteiro: e.target.checked }))} id="dia-inteiro" className="rounded" />
                    <Label htmlFor="dia-inteiro" className="cursor-pointer text-sm">Dia inteiro</Label>
                  </div>

                  {!form.diaInteiro && (
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <Label>Hora Início</Label>
                        <Input type="time" value={form.horaInicio} onChange={e => setForm(p => ({ ...p, horaInicio: e.target.value }))} />
                      </div>
                      <div>
                        <Label>Hora Fim</Label>
                        <Input type="time" value={form.horaFim} onChange={e => setForm(p => ({ ...p, horaFim: e.target.value }))} />
                      </div>
                    </div>
                  )}

                  <div>
                    <Label>Abrangência *</Label>
                    <Select value={form.scope} onValueChange={v => setForm(p => ({ ...p, scope: v as any, unidadeId: '', profissionalId: '' }))}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {isMaster && <SelectItem value="global">🌐 Todo o sistema (todas as unidades)</SelectItem>}
                        <SelectItem value="unidade">🏥 Unidade específica</SelectItem>
                        <SelectItem value="profissional">👤 Profissional específico</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  {form.scope === 'unidade' && (
                    <div>
                      <Label>Unidade *</Label>
                      <Select value={form.unidadeId} onValueChange={v => setForm(p => ({ ...p, unidadeId: v }))}>
                        <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                        <SelectContent>
                          {(isCoordenador ? unidades.filter(u => u.id === user?.unidadeId) : unidades.filter(u => u.ativo)).map(u => (
                            <SelectItem key={u.id} value={u.id}>{u.nome}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  )}

                  {form.scope === 'profissional' && (
                    <div>
                      <Label>Profissional *</Label>
                      <Select value={form.profissionalId} onValueChange={v => setForm(p => ({ ...p, profissionalId: v }))}>
                        <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                        <SelectContent>
                          {(isCoordenador ? profissionais.filter(p => p.unidadeId === user?.unidadeId) : profissionais).map(p => (
                            <SelectItem key={p.id} value={p.id}>{p.nome}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  )}

                  <Button onClick={handleSave} className="w-full gradient-primary text-primary-foreground">
                    Confirmar Bloqueio
                  </Button>
                </div>
              </DialogContent>
            </Dialog>
          )}
        </div>
      </div>

      {/* Info card */}
      <Card className="shadow-card border-0 bg-info/5">
        <CardContent className="p-4 flex items-start gap-3">
          <CalendarOff className="w-5 h-5 text-info shrink-0 mt-0.5" />
          <div className="text-sm text-muted-foreground">
            <p>Datas bloqueadas são automaticamente removidas dos calendários de agendamento online e interno.</p>
            <p className="mt-1">Bloqueios <strong>não afetam</strong> agendamentos já existentes — apenas impedem novos.</p>
          </div>
        </CardContent>
      </Card>

      {/* Blocked dates list */}
      {visibleBloqueios.length === 0 ? (
        <Card className="shadow-card border-0">
          <CardContent className="p-8 text-center text-muted-foreground">
            Nenhum bloqueio cadastrado.
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {visibleBloqueios.map(b => {
            const tipo = tipoInfo(b.tipo);
            const ScopeIcon = getScopeIcon(b);
            const criadoPorUser = funcionarios.find(f => f.id === b.criadoPor);
            const isPast = new Date(b.dataFim + 'T23:59:59') < new Date();

            return (
              <Card key={b.id} className={cn('shadow-card border-0', isPast && 'opacity-50')}>
                <CardContent className="p-4 flex flex-col sm:flex-row items-start sm:items-center gap-3">
                  <div className="flex items-center gap-2 shrink-0">
                    <CalendarOff className="w-4 h-4 text-destructive" />
                    <span className="text-sm font-mono font-medium text-foreground">
                      {formatDateRange(b.dataInicio, b.dataFim)}
                    </span>
                  </div>

                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-foreground">{b.titulo}</p>
                    {!b.diaInteiro && b.horaInicio && (
                      <p className="text-xs text-muted-foreground">{b.horaInicio} — {b.horaFim}</p>
                    )}
                  </div>

                  <div className="flex items-center gap-2 flex-wrap">
                    <Badge variant="outline" className={cn('text-xs', tipo.badge)}>
                      {tipo.label}
                    </Badge>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Badge variant="secondary" className="text-xs gap-1">
                          <ScopeIcon className="w-3 h-3" />
                          {b.profissionalId ? funcionarios.find(f => f.id === b.profissionalId)?.nome?.split(' ')[0] || 'Prof.' : b.unidadeId ? unidades.find(u => u.id === b.unidadeId)?.nome || 'Unidade' : 'Global'}
                        </Badge>
                      </TooltipTrigger>
                      <TooltipContent>{getScopeLabel(b)}</TooltipContent>
                    </Tooltip>
                    {isPast && <Badge variant="outline" className="text-xs text-muted-foreground">Passado</Badge>}
                  </div>

                  {canDelete(b) && (
                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <Button size="sm" variant="ghost" className="h-8 px-2 text-destructive shrink-0" title="Remover bloqueio">
                          <Trash2 className="w-3.5 h-3.5" />
                        </Button>
                      </AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>Remover bloqueio?</AlertDialogTitle>
                          <AlertDialogDescription>
                            Tem certeza que deseja remover o bloqueio "{b.titulo}" ({formatDateRange(b.dataInicio, b.dataFim)})? As datas voltarão a ficar disponíveis para agendamento.
                          </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>Cancelar</AlertDialogCancel>
                          <AlertDialogAction onClick={() => handleDelete(b.id)} className="bg-destructive text-destructive-foreground">Remover</AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  )}

                  {criadoPorUser && (
                    <span className="text-xs text-muted-foreground hidden lg:block">
                      por {criadoPorUser.nome.split(' ')[0]}
                    </span>
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

export default Bloqueios;
