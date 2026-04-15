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
import { Plus, Trash2, CalendarOff, Download, Building2, Globe, User, Search } from 'lucide-react';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';

const tipoOptions = [
  { value: 'feriado',          label: '🏛️ Feriado',              badge: 'bg-destructive/10 text-destructive' },
  { value: 'ferias',           label: '📅 Recesso / Férias',      badge: 'bg-info/10 text-info' },
  { value: 'reuniao',          label: '📋 Reunião',               badge: 'bg-warning/10 text-warning' },
  { value: 'indisponibilidade',label: '👤 Indisponibilidade',     badge: 'bg-muted text-muted-foreground' },
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

// ── Roles que são considerados "profissional de saúde" ──────────────────────
// Corrige o problema de case e variações de nome no banco
const ROLES_PROFISSIONAL = [
  'profissional',
  'Profissional',
  'PROFISSIONAL',
  'enfermagem',
  'Enfermagem',
  'tecnico',
  'tecnico_enfermagem',
  'fisioterapeuta',
  'fonoaudiologo',
  'psicologo',
  'nutricionista',
  'assistente_social',
];

const Bloqueios: React.FC = () => {
  const { bloqueios, addBloqueio, deleteBloqueio, refreshBloqueios, unidades, funcionarios, logAction } = useData();
  const { user } = useAuth();

  const [dialogOpen, setDialogOpen]     = useState(false);
  const [importing, setImporting]       = useState(false);
  const [buscaProfissional, setBuscaProfissional] = useState('');

  const [form, setForm] = useState({
    titulo:        '',
    tipo:          'feriado' as 'feriado' | 'ferias' | 'reuniao' | 'indisponibilidade',
    dataInicio:    '',
    dataFim:       '',
    diaInteiro:    true,
    horaInicio:    '',
    horaFim:       '',
    scope:         'global' as 'global' | 'unidade' | 'profissional',
    unidadeId:     '',
    profissionalId:'',
  });

  const isMaster      = user?.role?.toLowerCase().trim() === 'master';
  const isCoordenador = ['coordenador', 'gestor'].includes(user?.role?.toLowerCase().trim() || '');
  const canCreate     = isMaster || isCoordenador;

  // ── Lista de profissionais com filtro robusto ───────────────────────────────
  const todosProfissionais = useMemo(() =>
    funcionarios.filter(f =>
      f.ativo &&
      // Aceita qualquer role que não seja master/recepcao/coordenador
      !['master', 'recepcao', 'coordenador', 'gestor'].includes(f.role?.toLowerCase().trim() || '')
    ),
    [funcionarios]
  );

  // Filtro de busca por nome
  const profissionaisFiltrados = useMemo(() => {
    const isAdminGlobal = user?.usuario === 'admin.sms';
    const base = (!isAdminGlobal && (isCoordenador || (isMaster && user?.unidadeId)))
      ? todosProfissionais.filter(p => p.unidadeId === user?.unidadeId)
      : todosProfissionais;

    if (!buscaProfissional.trim()) return base;
    const termo = buscaProfissional.toLowerCase();
    return base.filter(p =>
      p.nome?.toLowerCase().includes(termo) ||
      p.cargo?.toLowerCase().includes(termo) ||
      p.profissao?.toLowerCase().includes(termo)
    );
  }, [todosProfissionais, buscaProfissional, isCoordenador, user?.unidadeId]);

  const visibleBloqueios = useMemo(() => {
    if (user?.usuario === 'admin.sms') return bloqueios; // Global admin sees all
    if (isMaster && !user?.unidadeId) return bloqueios;
    if (user?.unidadeId) {
      return bloqueios.filter(b => !b.unidadeId || b.unidadeId === user.unidadeId);
    }
    return bloqueios;
  }, [bloqueios, user, isMaster]);

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

  const resetForm = () => {
    setForm({
      titulo: '', tipo: 'feriado', dataInicio: '', dataFim: '',
      diaInteiro: true, horaInicio: '', horaFim: '',
      scope: 'global', unidadeId: '', profissionalId: '',
    });
    setBuscaProfissional('');
  };

  const handleSave = async () => {
    if (!form.titulo.trim()) {
      toast.error('Informe o motivo do bloqueio.');
      return;
    }
    if (!form.dataInicio || !form.dataFim) {
      toast.error('Informe as datas de início e fim.');
      return;
    }
    if (form.dataFim < form.dataInicio) {
      toast.error('Data final deve ser igual ou posterior à data inicial.');
      return;
    }
    if (!form.diaInteiro && (!form.horaInicio || !form.horaFim)) {
      toast.error('Informe o horário de início e fim.');
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
    if (isCoordenador && form.scope === 'global') {
      toast.error('Apenas Master pode criar bloqueios globais.');
      return;
    }

    // Buscar unidadeId do profissional selecionado para referência
    const profSelecionado = funcionarios.find(f => f.id === form.profissionalId);

    try {
      await addBloqueio({
        titulo:         form.titulo.trim(),
        tipo:           form.tipo,
        dataInicio:     form.dataInicio,
        dataFim:        form.dataFim,
        diaInteiro:     form.diaInteiro,
        horaInicio:     form.diaInteiro ? '' : form.horaInicio,
        horaFim:        form.diaInteiro ? '' : form.horaFim,
        unidadeId:      form.scope === 'unidade'
                          ? form.unidadeId
                          : form.scope === 'profissional'
                            ? (profSelecionado?.unidadeId || '')
                            : '',
        profissionalId: form.scope === 'profissional' ? form.profissionalId : '',
        criadoPor:      user?.id || '',
      });

      toast.success(
        form.scope === 'profissional'
          ? `Bloqueio cadastrado para ${profSelecionado?.nome || 'profissional'}!`
          : 'Bloqueio cadastrado com sucesso!'
      );

      setDialogOpen(false);
      resetForm();
      await refreshBloqueios();
    } catch (err) {
      console.error('Erro ao salvar bloqueio:', err);
      toast.error('Erro ao salvar bloqueio. Tente novamente.');
    }
  };

  const handleImportHolidays = async () => {
    setImporting(true);
    try {
      const existingDates = new Set(
        bloqueios
          .filter(b => b.tipo === 'feriado' && !b.unidadeId && !b.profissionalId)
          .map(b => b.dataInicio)
      );
      const toImport = feriadosNacionais2026.filter(f => !existingDates.has(f.date));

      if (toImport.length === 0) {
        toast.info('Todos os feriados nacionais de 2026 já estão cadastrados.');
        return;
      }

      for (const f of toImport) {
        await addBloqueio({
          titulo: f.reason, tipo: 'feriado',
          dataInicio: f.date, dataFim: f.date,
          diaInteiro: true, horaInicio: '', horaFim: '',
          unidadeId: '', profissionalId: '', criadoPor: user?.id || '',
        });
      }

      await logAction({
        acao: 'importar_feriados', entidade: 'bloqueio',
        detalhes: { total: toImport.length, ano: 2026 }, user,
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
    try {
      await deleteBloqueio(id);
      toast.success('Bloqueio removido.');
      await refreshBloqueios();
    } catch {
      toast.error('Erro ao remover bloqueio.');
    }
  };

  const canDelete = (b: typeof bloqueios[0]) => {
    if (isMaster) return true;
    if (isCoordenador) return b.criadoPor === user?.id;
    return false;
  };

  const formatDate = (d: string) => {
    if (!d) return '';
    return new Date(d + 'T12:00:00').toLocaleDateString('pt-BR', {
      day: '2-digit', month: '2-digit', year: 'numeric',
    });
  };

  const formatDateRange = (ini: string, fim: string) =>
    ini === fim ? formatDate(ini) : `${formatDate(ini)} — ${formatDate(fim)}`;

  const tipoInfo = (tipo: string) => tipoOptions.find(t => t.value === tipo) || tipoOptions[0];

  return (
    <div className="space-y-4 animate-fade-in">
      {/* Header */}
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
            <Dialog open={dialogOpen} onOpenChange={(open) => { setDialogOpen(open); if (!open) resetForm(); }}>
              <DialogTrigger asChild>
                <Button className="gradient-primary text-primary-foreground">
                  <Plus className="w-4 h-4 mr-2" /> Novo Bloqueio
                </Button>
              </DialogTrigger>
              <DialogContent className="sm:max-w-md max-h-[90vh] overflow-y-auto">
                <DialogHeader>
                  <DialogTitle className="font-display">Bloquear Data para Agendamentos</DialogTitle>
                </DialogHeader>
                <div className="space-y-4">

                  {/* Motivo */}
                  <div>
                    <Label>Motivo *</Label>
                    <Input
                      value={form.titulo}
                      onChange={e => setForm(p => ({ ...p, titulo: e.target.value }))}
                      placeholder="Ex: Natal, Férias Dra. Jéssica, Reunião"
                    />
                  </div>

                  {/* Tipo */}
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

                  {/* Datas */}
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <Label>Data Início *</Label>
                      <Input
                        type="date"
                        value={form.dataInicio}
                        onChange={e => setForm(p => ({
                          ...p,
                          dataInicio: e.target.value,
                          dataFim: p.dataFim || e.target.value,
                        }))}
                      />
                    </div>
                    <div>
                      <Label>Data Fim *</Label>
                      <Input
                        type="date"
                        value={form.dataFim}
                        min={form.dataInicio}
                        onChange={e => setForm(p => ({ ...p, dataFim: e.target.value }))}
                      />
                    </div>
                  </div>

                  {/* Dia inteiro */}
                  <div className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      id="dia-inteiro"
                      checked={form.diaInteiro}
                      onChange={e => setForm(p => ({ ...p, diaInteiro: e.target.checked }))}
                      className="rounded"
                    />
                    <Label htmlFor="dia-inteiro" className="cursor-pointer text-sm">Dia inteiro</Label>
                  </div>

                  {/* Horários parciais */}
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

                  {/* Abrangência */}
                  <div>
                    <Label>Abrangência *</Label>
                    <Select
                      value={form.scope}
                      onValueChange={v => setForm(p => ({
                        ...p,
                        scope: v as any,
                        unidadeId: '',
                        profissionalId: '',
                      }))}
                    >
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {isMaster && (
                          <SelectItem value="global">🌐 Todo o sistema (todas as unidades)</SelectItem>
                        )}
                        <SelectItem value="unidade">🏥 Unidade específica</SelectItem>
                        <SelectItem value="profissional">👤 Profissional específico</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  {/* Select de unidade */}
                  {form.scope === 'unidade' && (
                    <div>
                      <Label>Unidade *</Label>
                      <Select value={form.unidadeId} onValueChange={v => setForm(p => ({ ...p, unidadeId: v }))}>
                        <SelectTrigger><SelectValue placeholder="Selecione a unidade" /></SelectTrigger>
                        <SelectContent>
                          {(isCoordenador
                            ? unidades.filter(u => u.id === user?.unidadeId)
                            : unidades.filter(u => u.ativo)
                          ).map(u => (
                            <SelectItem key={u.id} value={u.id}>{u.nome}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  )}

                  {/* Select de profissional com busca */}
                  {form.scope === 'profissional' && (
                    <div className="space-y-2">
                      <Label>Profissional *</Label>

                      {/* Campo de busca */}
                      <div className="relative">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                        <Input
                          value={buscaProfissional}
                          onChange={e => setBuscaProfissional(e.target.value)}
                          placeholder="Buscar profissional..."
                          className="pl-9"
                        />
                      </div>

                      {/* Lista de profissionais */}
                      {profissionaisFiltrados.length === 0 ? (
                        <div className="text-sm text-muted-foreground text-center py-4 border rounded-lg">
                          {buscaProfissional
                            ? 'Nenhum profissional encontrado.'
                            : 'Nenhum profissional ativo cadastrado.'}
                        </div>
                      ) : (
                        <div className="border rounded-lg max-h-48 overflow-y-auto divide-y">
                          {profissionaisFiltrados.map(p => (
                            <button
                              key={p.id}
                              type="button"
                              onClick={() => setForm(prev => ({ ...prev, profissionalId: p.id }))}
                              className={cn(
                                'w-full text-left px-3 py-2.5 text-sm hover:bg-muted transition-colors',
                                form.profissionalId === p.id && 'bg-primary/10 text-primary font-medium'
                              )}
                            >
                              <div className="font-medium">{p.nome}</div>
                              {(p.cargo || p.profissao) && (
                                <div className="text-xs text-muted-foreground">
                                  {p.cargo || p.profissao}
                                </div>
                              )}
                            </button>
                          ))}
                        </div>
                      )}

                      {/* Confirmação da seleção */}
                      {form.profissionalId && (
                        <div className="flex items-center gap-2 p-2 bg-primary/5 border border-primary/20 rounded-lg text-sm">
                          <User className="w-4 h-4 text-primary shrink-0" />
                          <span className="text-primary font-medium">
                            {funcionarios.find(f => f.id === form.profissionalId)?.nome}
                          </span>
                          <button
                            type="button"
                            onClick={() => setForm(p => ({ ...p, profissionalId: '' }))}
                            className="ml-auto text-muted-foreground hover:text-destructive text-xs"
                          >
                            ✕ limpar
                          </button>
                        </div>
                      )}
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
            <p>Datas bloqueadas são automaticamente removidas dos calendários de agendamento.</p>
            <p className="mt-1">Bloqueios <strong>não afetam</strong> agendamentos já existentes — apenas impedem novos.</p>
          </div>
        </CardContent>
      </Card>

      {/* Lista de bloqueios */}
      {visibleBloqueios.length === 0 ? (
        <Card className="shadow-card border-0">
          <CardContent className="p-8 text-center text-muted-foreground">
            Nenhum bloqueio cadastrado.
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {visibleBloqueios.map(b => {
            const tipo       = tipoInfo(b.tipo);
            const ScopeIcon  = getScopeIcon(b);
            const criadoPorUser = funcionarios.find(f => f.id === b.criadoPor);
            const isPast     = new Date(b.dataFim + 'T23:59:59') < new Date();

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
                          {b.profissionalId
                            ? funcionarios.find(f => f.id === b.profissionalId)?.nome?.split(' ')[0] || 'Prof.'
                            : b.unidadeId
                              ? unidades.find(u => u.id === b.unidadeId)?.nome || 'Unidade'
                              : 'Global'}
                        </Badge>
                      </TooltipTrigger>
                      <TooltipContent>{getScopeLabel(b)}</TooltipContent>
                    </Tooltip>
                    {isPast && (
                      <Badge variant="outline" className="text-xs text-muted-foreground">Passado</Badge>
                    )}
                  </div>

                  {canDelete(b) && (
                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <Button size="sm" variant="ghost" className="h-8 px-2 text-destructive shrink-0">
                          <Trash2 className="w-3.5 h-3.5" />
                        </Button>
                      </AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>Remover bloqueio?</AlertDialogTitle>
                          <AlertDialogDescription>
                            Tem certeza que deseja remover "{b.titulo}" ({formatDateRange(b.dataInicio, b.dataFim)})?
                            As datas voltarão a ficar disponíveis para agendamento.
                          </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>Cancelar</AlertDialogCancel>
                          <AlertDialogAction
                            onClick={() => handleDelete(b.id)}
                            className="bg-destructive text-destructive-foreground"
                          >
                            Remover
                          </AlertDialogAction>
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
