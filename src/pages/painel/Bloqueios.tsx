import React, { useState, useMemo, useRef, useEffect, useCallback, useSyncExternalStore } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { queryKeys } from '@/hooks/queries/queryKeys';
import { buildBlockDirectory, blockSummary, filterBlockDirectory, emptyBlockFilter, validBlockDate, type BlockFilter, type BlockStatus } from '@/lib/blockDirectory';
import { usePermissions } from '@/contexts/PermissionsContext';
import { supabase } from '@/integrations/supabase/client';
import { useOperacional } from '@/contexts/OperacionalContext';
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
import { Plus, Trash2, CalendarOff, Download, Building2, Globe, User, Search, Layers, CalendarCheck, CalendarClock, History, AlertTriangle, RefreshCw, ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';

const statusLabels:Record<BlockStatus,string>={vigente:'Vigente',futuro:'Futuro',encerrado:'Encerrado',invalido:'Período a conferir'};
const months=['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'];
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
  const { bloqueios, addBloqueio, deleteBloqueio, unidades, funcionarios, logAction, refreshBloqueios } = useOperacional();
  const { user, isGlobalAdmin } = useAuth();
  const {can,loading:permissionsLoading}=usePermissions();
  const scopeKey=JSON.stringify([user?.id,user?.role,user?.unidadeId,isGlobalAdmin]);
  const scopeRef=useRef(scopeKey);scopeRef.current=scopeKey;
  const writeInFlight=useRef(false);
  const [saving,setSaving]=useState(false);
  const [removing,setRemoving]=useState(false);
  const today=new Intl.DateTimeFormat('en-CA',{timeZone:'America/Santarem',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date());
  const todayStr=['year','month','day'].map(t=>today.find(p=>p.type===t)?.value||'').join('-');

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
    scope:         (isGlobalAdmin?'global':'unidade') as 'global' | 'unidade' | 'profissional',
    unidadeId:     isGlobalAdmin?'':user?.unidadeId||'',
    profissionalId:'',
  });

  const isMaster      = user?.role?.toLowerCase().trim() === 'master';
  const isCoordenador = ['coordenador','gestor','gestao','gestão','coordenacao'].includes(user?.role?.toLowerCase().trim() || '');
  const mayManage=!permissionsLoading&&!!user?.id&&(isMaster||isCoordenador)&&(isGlobalAdmin||!!user?.unidadeId)&&can('feriados_bloqueios','can_view');
  const canCreate=mayManage&&can('feriados_bloqueios','can_create');
  const allowedUnit=(id:string)=>!!id&&(isGlobalAdmin||id===user?.unidadeId)&&unidades.some(u=>u.id===id&&u.ativo);
  const busy=saving||importing||removing;
  const errorMessage=(err:unknown)=>{const e=err as {code?:string;message?:string};return e?.code==='23505'?'Já existe um bloqueio idêntico. Atualize a lista.':e?.message||'Não foi possível confirmar a operação.';};

  // ── Lista de profissionais com filtro robusto ───────────────────────────────
  const todosProfissionais = useMemo(() =>
    funcionarios.filter(f =>
      f.ativo &&
      // Aceita qualquer role que não seja master/recepcao/coordenador
      !['master','recepcao','recepção','coordenador','gestor','gestao','gestão','coordenacao'].includes(f.role?.toLowerCase().trim() || '')
    ),
    [funcionarios]
  );

  // Filtro de busca por nome
  const profissionaisFiltrados = useMemo(() => {
    const base=isGlobalAdmin?todosProfissionais:todosProfissionais.filter(p=>!!user?.unidadeId&&p.unidadeId===user.unidadeId);

    if (!buscaProfissional.trim()) return base;
    const termo = buscaProfissional.toLowerCase();
    return base.filter(p =>
      p.nome?.toLowerCase().includes(termo) ||
      p.cargo?.toLowerCase().includes(termo) ||
      p.profissao?.toLowerCase().includes(termo)
    );
  }, [todosProfissionais, buscaProfissional, isGlobalAdmin, user?.unidadeId]);

  const visibleBloqueios = useMemo(() => {
    if (isGlobalAdmin) return bloqueios;
    if (user?.unidadeId) {
      return bloqueios.filter(b => !b.unidadeId || b.unidadeId === user.unidadeId);
    }
    return [];
  }, [bloqueios, user, isGlobalAdmin]);

  // Observe the existing scoped cache; no additional data source or writes.
  const queryClient=useQueryClient();
  const directoryScope=JSON.stringify([user?.id,user?.authUserId,user?.role,user?.usuario==='admin.sms',user?.unidadeId||'']);
  const subscribeDirectory=useCallback((notify:()=>void)=>queryClient.getQueryCache().subscribe(()=>notify()),[queryClient]);
  const getDirectoryState=useCallback(()=>{
    const states=[queryKeys.bloqueios.all,queryKeys.funcionarios.all,queryKeys.unidades.all].map(key=>queryClient.getQueryState([...key,'operacional',directoryScope]));
    return states.some(s=>s?.status==='error')?'error':states.every(s=>s?.status==='success')?'ready':'loading';
  },[queryClient,directoryScope]);
  const directoryState=useSyncExternalStore(subscribeDirectory,getDirectoryState,getDirectoryState);
  const directoryReady=directoryState==='ready'&&!permissionsLoading&&!!user?.id&&can('feriados_bloqueios','can_view')&&(isGlobalAdmin||!!user.unidadeId);
  const mayBeLimited=bloqueios.length>=1000||funcionarios.length>=1000||unidades.length>=1000;
  const [filter,setFilter]=useState<BlockFilter>(emptyBlockFilter);
  const [refreshing,setRefreshing]=useState(false);
  useEffect(()=>{setFilter(emptyBlockFilter);},[scopeKey]);
  const entries=useMemo(()=>buildBlockDirectory(visibleBloqueios,funcionarios,unidades,todayStr,directoryReady&&funcionarios.length<1000,directoryReady&&isGlobalAdmin&&unidades.length<1000),[visibleBloqueios,funcionarios,unidades,todayStr,directoryReady,isGlobalAdmin]);
  const summary=useMemo(()=>blockSummary(entries),[entries]);
  const filtered=useMemo(()=>filterBlockDirectory(entries,filter),[entries,filter]);
  const refreshDirectory=async()=>{
    if(refreshing||busy)return;
    setRefreshing(true);
    try{await Promise.all([refreshBloqueios(),queryClient.invalidateQueries({queryKey:queryKeys.funcionarios.all}),queryClient.invalidateQueries({queryKey:queryKeys.unidades.all})]);}
    catch{toast.error('Não foi possível atualizar todos os dados.');}
    finally{setRefreshing(false);}
  };

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
      scope: isGlobalAdmin?'global':'unidade', unidadeId: isGlobalAdmin?'':user?.unidadeId||'', profissionalId: '',
    });
    setBuscaProfissional('');
  };

  useEffect(()=>{setDialogOpen(false);resetForm();},[scopeKey]);

  const handleSave = async () => {
    if(writeInFlight.current||!canCreate)return;
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
    if (!form.diaInteiro && (!/^([01]\d|2[0-3]):[0-5]\d$/.test(form.horaInicio)||!/^([01]\d|2[0-3]):[0-5]\d$/.test(form.horaFim)||form.horaFim<=form.horaInicio)) {
      toast.error('Informe horários válidos, com término posterior ao início.');
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
    if (!isGlobalAdmin && form.scope === 'global') {
      toast.error('Apenas o Master geral pode criar bloqueios globais.');
      return;
    }

    // Buscar unidadeId do profissional selecionado para referência
    const profSelecionado = todosProfissionais.find(f => f.id === form.profissionalId);
    if(form.scope==='unidade'&&!allowedUnit(form.unidadeId)){toast.error('Selecione uma unidade ativa autorizada.');return;}
    if(form.scope==='profissional'&&(!profSelecionado||(!isGlobalAdmin&&!allowedUnit(profSelecionado.unidadeId))||(!!profSelecionado.unidadeId&&!allowedUnit(profSelecionado.unidadeId)))){toast.error('Profissional ou unidade não confirmados.');return;}
    const scope=scopeKey;writeInFlight.current=true;setSaving(true);
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

      if(scopeRef.current!==scope)return;
      toast.success(
        form.scope === 'profissional'
          ? `Bloqueio cadastrado para ${profSelecionado?.nome || 'profissional'}!`
          : 'Bloqueio cadastrado com sucesso!'
      );

      setDialogOpen(false);
      resetForm();
    } catch (err) {
      console.error('Erro ao salvar bloqueio:', err);
      if(scopeRef.current===scope)toast.error(errorMessage(err));
    }finally{writeInFlight.current=false;setSaving(false);}
  };

  const handleImportHolidays = async () => {
    if(writeInFlight.current||!canCreate||!isGlobalAdmin)return;
    if(!window.confirm('Importar as datas faltantes da lista de 2026? Cada data importada bloqueará novos agendamentos em todas as unidades. Os registros existentes serão preservados.'))return;
    const scope=scopeKey;writeInFlight.current=true;setImporting(true);
    try {
      // Query the current server snapshot; do not trust the potentially stale directory cache.
      const {data,error,count}=await supabase.from('bloqueios').select('data_inicio,data_fim,unidade_id,profissional_id',{count:'exact'}).eq('tipo','feriado').lte('data_inicio','2026-12-31').gte('data_fim','2026-01-01').limit(1000);
      if(error||!data||count!==data.length)throw error||new Error('Lista de feriados não confirmada.');
      if(scopeRef.current!==scope)return;
      const missing=feriadosNacionais2026.filter(f=>!data.some(b=>!b.unidade_id&&!b.profissional_id&&b.data_inicio<=f.date&&b.data_fim>=f.date));
      const toImport=missing.filter(f=>!f.reason.includes('meio dia'));
      const skipped=missing.length-toImport.length;
      if(!toImport.length){toast.info(skipped?'Quarta-feira de Cinzas exige conferência manual do horário parcial.':'Todas as datas da lista já estão cadastradas.');return;}
      const {data:inserted,error:insertError}=await supabase.from('bloqueios').insert(toImport.map(f=>({titulo:f.reason,tipo:'feriado',data_inicio:f.date,data_fim:f.date,dia_inteiro:true,hora_inicio:'',hora_fim:'',unidade_id:'',profissional_id:'',criado_por:user?.id||''}))).select('id');
      if(insertError||inserted?.length!==toImport.length)throw insertError||new Error('Importação não confirmada.');
      if(scopeRef.current!==scope)return;
      await logAction({acao:'importar_feriados',entidade:'bloqueio',detalhes:{total:inserted.length,ano:2026},user});
      toast.success(`${inserted.length} datas de 2026 importadas!`);
      if(skipped)toast.warning('Quarta-feira de Cinzas não importada: confirme o horário parcial manualmente.');
      await refreshBloqueios().catch(()=>toast.warning('Importação confirmada. Atualize a lista para conferir.'));
    }catch(err){if(scopeRef.current===scope)toast.error(errorMessage(err));}
    finally{writeInFlight.current=false;setImporting(false);}
  };

  const canDelete=(b:typeof bloqueios[0])=>{
    if(!mayManage||!can('feriados_bloqueios','can_delete')||b.dataFim<todayStr)return false;
    if(isGlobalAdmin)return true;
    if(!user?.unidadeId||b.unidadeId!==user.unidadeId)return false;
    if(b.profissionalId&&!funcionarios.some(f=>f.id===b.profissionalId&&f.unidadeId===user.unidadeId))return false;
    return isMaster||b.criadoPor===user?.id;
  };

  const handleDelete=async(id:string)=>{
    const block=visibleBloqueios.find(b=>b.id===id);
    if(writeInFlight.current||!block||!canDelete(block))return;
    const scope=scopeKey;writeInFlight.current=true;setRemoving(true);
    try{
      await deleteBloqueio(id);
      if(scopeRef.current===scope)toast.success('Bloqueio removido.');
    }catch(err){if(scopeRef.current===scope)toast.error(errorMessage(err));}
    finally{writeInFlight.current=false;setRemoving(false);}
  };

  const formatDate = (d: string) => {
    return validBlockDate(d)?d.split('-').reverse().join('/'):'Data a conferir';
  };

  const formatDateRange = (ini: string, fim: string) =>
    ini === fim ? formatDate(ini) : `${formatDate(ini)} — ${formatDate(fim)}`;

  const tipoInfo = (tipo: string) => tipoOptions.find(t => t.value === tipo) || {value:tipo,label:'Tipo a conferir',badge:'text-muted-foreground'};

  return (
    <div className="space-y-4 animate-fade-in">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold font-display text-foreground">Feriados e Bloqueios</h1>
          <p className="text-muted-foreground text-sm">Gerenciar datas bloqueadas para agendamento</p>
        </div>
        <div className="flex gap-2">
          {isGlobalAdmin&&canCreate && (
            <Button variant="outline" onClick={handleImportHolidays} disabled={busy}>
              <Download className="w-4 h-4 mr-2" />
              {importing ? 'Importando...' : 'Importar Feriados 2026'}
            </Button>
          )}
          {canCreate && (
            <Dialog open={dialogOpen} onOpenChange={(open) => { if(writeInFlight.current)return; if(open&&!canCreate)return;setDialogOpen(open); if (!open) resetForm(); }}>
              <DialogTrigger asChild>
                <Button disabled={busy} className="gradient-primary text-primary-foreground">
                  <Plus className="w-4 h-4 mr-2" /> Novo Bloqueio
                </Button>
              </DialogTrigger>
              <DialogContent className="sm:max-w-md max-h-[90vh] overflow-y-auto">
                <DialogHeader>
                  <DialogTitle className="font-display">Bloquear Data para Agendamentos</DialogTitle>
                </DialogHeader>
                <fieldset disabled={busy} className="space-y-4 min-w-0">

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
                        unidadeId: v==='unidade'&&!isGlobalAdmin?user?.unidadeId||'':'',
                        profissionalId: '',
                      }))}
                    >
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {isGlobalAdmin && (
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
                          {unidades.filter(u=>allowedUnit(u.id)).map(u => (
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

                  <Button onClick={handleSave} disabled={busy||!canCreate} className="w-full gradient-primary text-primary-foreground">
                    {saving?'Salvando…':'Confirmar Bloqueio'}
                  </Button>
                </fieldset>
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
            <p className="mt-1">Bloqueios <strong>não cancelam nem remarcam</strong> agendamentos existentes. A abrangência profissional acompanha seus locais de atendimento.</p>
          </div>
        </CardContent>
      </Card>

      {/* Read-only directory controls */}
      {directoryState!=='ready'&&<div role={directoryState==='error'?'alert':'status'} className="flex flex-wrap gap-2 items-center text-sm text-muted-foreground">{directoryState==='error'?'Não foi possível confirmar a lista de bloqueios e cadastros.':'Carregando bloqueios e cadastros...'}<Button type="button" size="sm" variant="outline" disabled={refreshing||busy} onClick={()=>void refreshDirectory()}><RefreshCw className={cn('w-4 h-4 mr-1',refreshing&&'animate-spin')}/>Atualizar</Button></div>}
      {directoryReady&&<>
        <section className="grid grid-cols-2 xl:grid-cols-5 gap-2" aria-label="Indicadores de bloqueios">
          {([{status:'todos',label:'Total cadastrado',Icon:Layers,tone:'blue'},{status:'vigente',label:'Vigentes',Icon:CalendarCheck,tone:'teal'},{status:'futuro',label:'Futuros',Icon:CalendarClock,tone:'violet'},{status:'encerrado',label:'Histórico',Icon:History,tone:'blue'},{status:'conferencia',label:'A conferir',Icon:AlertTriangle,tone:'neutral'}] as const).map(({status,label,Icon,tone})=><button key={status} type="button" aria-pressed={filter.status===status} onClick={()=>setFilter({...emptyBlockFilter,status})} className={cn('clinical-premium p-3 flex items-center gap-2 text-left min-w-0 focus-visible:ring-2 focus-visible:ring-ring',filter.status===status&&'ring-1 ring-primary')}><span className={`clinical-dock-icon clinical-tone-${tone}`}><Icon className="w-4 h-4" aria-hidden="true"/></span><span className="flex-1 min-w-0"><strong className="block text-xl tabular-nums">{summary[status]}</strong><span className="block text-xs font-medium">{label}</span></span><ChevronRight className="w-3.5 h-3.5 shrink-0 text-muted-foreground"/></button>)}
        </section>
        <p className="text-xs text-muted-foreground">Indicadores por registro visível, em {todayStr.split('-').reverse().join('/')}. Não representam dias únicos, pacientes ou vagas. Ao selecionar um indicador, os demais filtros são limpos.</p>
        {mayBeLimited&&<p role="alert" className="text-xs text-amber-800 dark:text-amber-300">Consulta possivelmente limitada pelo servidor. Os totais representam somente os registros carregados.</p>}
        <section className="clinical-premium p-3 space-y-3" aria-label="Filtros de bloqueios">
          <div className="flex flex-wrap items-center gap-2"><div className="relative flex-1 min-w-[12rem]"><Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground"/><Input className="pl-9" value={filter.search} onChange={e=>setFilter(f=>({...f,search:e.target.value}))} placeholder="Buscar motivo, profissional ou unidade..." aria-label="Buscar bloqueios"/></div><Button type="button" size="sm" variant="outline" disabled={refreshing||busy} onClick={()=>void refreshDirectory()}><RefreshCw className={cn('w-4 h-4 mr-1',refreshing&&'animate-spin')}/>Atualizar</Button></div>
          <div className="grid grid-cols-1 min-[420px]:grid-cols-2 lg:grid-cols-5 gap-2">
            <div className="space-y-1"><Label>Situação</Label><Select value={filter.status} onValueChange={status=>setFilter(f=>({...f,status:status as BlockFilter['status']}))}><SelectTrigger aria-label="Filtrar situação"><SelectValue/></SelectTrigger><SelectContent><SelectItem value="todos">Todas</SelectItem>{Object.entries(statusLabels).map(([value,label])=><SelectItem key={value} value={value}>{label}</SelectItem>)}<SelectItem value="conferencia">A conferir</SelectItem></SelectContent></Select></div>
            <div className="space-y-1"><Label>Tipo</Label><Select value={filter.type} onValueChange={type=>setFilter(f=>({...f,type}))}><SelectTrigger aria-label="Filtrar tipo"><SelectValue/></SelectTrigger><SelectContent><SelectItem value="todos">Todos os tipos</SelectItem>{tipoOptions.map(t=><SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}</SelectContent></Select></div>
            <div className="space-y-1"><Label>Abrangência</Label><Select value={filter.scope} onValueChange={scope=>setFilter(f=>({...f,scope:scope as BlockFilter['scope']}))}><SelectTrigger aria-label="Filtrar abrangência"><SelectValue/></SelectTrigger><SelectContent><SelectItem value="todos">Todas</SelectItem><SelectItem value="global">Global</SelectItem><SelectItem value="unidade">Unidade</SelectItem><SelectItem value="profissional">Profissional</SelectItem></SelectContent></Select></div>
            <div className="space-y-1"><Label htmlFor="block-filter-year">Ano</Label><Input id="block-filter-year" inputMode="numeric" maxLength={4} placeholder="Todos os anos" value={filter.year} onChange={e=>setFilter(f=>({...f,year:e.target.value.replace(/\D/g,'').slice(0,4)}))}/></div>
            <div className="space-y-1"><Label>Mês</Label><Select value={filter.month} onValueChange={month=>setFilter(f=>({...f,month}))}><SelectTrigger aria-label="Filtrar mês"><SelectValue/></SelectTrigger><SelectContent><SelectItem value="todos">Todos os meses</SelectItem>{months.map((m,i)=><SelectItem key={m} value={String(i+1).padStart(2,'0')}>{m}</SelectItem>)}</SelectContent></Select></div>
          </div>
          {filter.year&&(!/^\d{4}$/.test(filter.year)||filter.year==='0000')&&<p role="status" className="text-xs text-muted-foreground">Informe um ano válido com quatro dígitos ou limpe o campo.</p>}
          <div className="flex flex-wrap justify-between items-center gap-2 border-t pt-2"><p role="status" className="text-xs text-muted-foreground">{filtered.length} de {entries.length} registros · filtros por interseção de período</p><Button type="button" size="sm" variant="outline" onClick={()=>setFilter(emptyBlockFilter)}>Limpar filtros</Button></div>
        </section>
      </>}
      {/* Lista de bloqueios */}
      {directoryReady&&(filtered.length === 0 ? (
        <Card className="shadow-card border-0">
          <CardContent className="p-8 text-center text-muted-foreground">
            {entries.length?'Nenhum bloqueio encontrado para os filtros selecionados.':'Nenhum bloqueio cadastrado na seleção.'}
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {filtered.map(({block:b,status,issues,person,unit},index) => {
            const tipo       = tipoInfo(b.tipo);
            const ScopeIcon  = getScopeIcon(b);
            const criadoPorUser = funcionarios.find(f => f.id === b.criadoPor);
            const isPast=status==='encerrado';
            const newSection=index===0||filtered[index-1].status!==status;

            return (
              <React.Fragment key={b.id}>
              {newSection&&<h2 className="text-sm font-semibold text-foreground pt-2">{statusLabels[status]} · {filtered.filter(e=>e.status===status).length}</h2>}
              <Card className={cn('shadow-card border-0',isPast&&'bg-muted/20')}>
                <CardContent className="p-4 flex flex-col sm:flex-row items-start sm:items-center gap-3">
                  <div className="flex items-center gap-2 shrink-0">
                    <CalendarOff className="w-4 h-4 text-destructive" />
                    <span className="text-sm font-mono font-medium text-foreground">
                      {formatDateRange(b.dataInicio, b.dataFim)}
                    </span>
                  </div>

                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-foreground">{b.titulo}</p>
                    <p className="text-xs text-muted-foreground">{b.diaInteiro?'Dia inteiro':`${b.horaInicio||'—'} — ${b.horaFim||'—'}`}</p>
                    {issues.length>0&&<p className="text-xs text-amber-800 dark:text-amber-300 mt-1"><AlertTriangle className="inline w-3.5 h-3.5 mr-1"/>{issues.join(' · ')}. Somente conferência.</p>}
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
                            ? person || 'Profissional não localizado'
                            : b.unidadeId
                              ? unit || 'Unidade não localizada'
                              : 'Global'}
                        </Badge>
                      </TooltipTrigger>
                      <TooltipContent>{getScopeLabel(b)}</TooltipContent>
                    </Tooltip>
                    <Badge variant="outline" className={cn('text-xs',status==='vigente'&&'text-emerald-700 dark:text-emerald-300',status==='invalido'&&'text-destructive')}>{statusLabels[status]}</Badge>
                  </div>

                  {canDelete(b) && (
                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <Button size="sm" variant="ghost" disabled={busy} aria-label="Remover bloqueio" className="h-8 px-2 text-destructive shrink-0">
                          <Trash2 className="w-3.5 h-3.5" />
                        </Button>
                      </AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>Remover bloqueio?</AlertDialogTitle>
                          <AlertDialogDescription>
                            Tem certeza que deseja remover "{b.titulo}" ({formatDateRange(b.dataInicio, b.dataFim)})?
                            A retirada remove somente este bloqueio. A disponibilidade continua sujeita à grade e aos demais bloqueios.
                          </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>Cancelar</AlertDialogCancel>
                          <AlertDialogAction
                            disabled={busy||!canDelete(b)} onClick={() => handleDelete(b.id)}
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
              </React.Fragment>
            );
          })}
        </div>
      ))}
    </div>
  );
};

export default Bloqueios;
