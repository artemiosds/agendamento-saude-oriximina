import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Activity, AlertTriangle, ArrowUpRight, BarChart3, Calendar, CheckCircle, Clock, DoorOpen, ListOrdered, Stethoscope, Users, XCircle } from 'lucide-react';
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { useAuth } from '@/contexts/AuthContext';
import { useFila } from '@/contexts/FilaContext';
import { useOperacional } from '@/contexts/OperacionalContext';
import { usePermissions } from '@/contexts/PermissionsContext';
import { useLicense } from '@/hooks/useLicense';
import { isPathLicensed } from '@/lib/licenseModules';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { DashboardSkeleton } from '@/components/skeletons';
import { supabase } from '@/integrations/supabase/client';
import { addDaysToDateStr, BRAZIL_TIMEZONE, localDateStr, nowTimeBrazilStr } from '@/lib/utils';

const BLUE = '#2A6F97';
const PERIODS = [{ days: 1, label: 'Hoje' }, { days: 7, label: 'Últimos 7 dias' }, { days: 30, label: 'Últimos 30 dias' }] as const;
const QUICK_ACTIONS = [
  { label: 'Agenda do Dia', path: '/painel/agenda', module: 'agenda', icon: Calendar },
  { label: 'Fila da Recepção', path: '/painel/fila', module: 'fila', icon: ListOrdered },
  { label: 'Cockpit ao Vivo', path: '/painel/cockpit-ao-vivo', module: 'cockpit_unidade', icon: Activity },
  { label: 'Relatórios', path: '/painel/relatorios', module: 'relatorios', icon: BarChart3 },
] as const;
const WAITING = new Set(['aguardando', 'pendente', 'confirmado', 'confirmado_chegada', 'chegada_confirmada', 'aguardando_triagem', 'triagem_concluida', 'aguardando_enfermagem', 'aguardando_atendimento', 'apto_atendimento', 'chamado', 'encaixado']);
const FINISHED = new Set(['concluido', 'finalizado', 'atendido', 'atendimento_encerrado', 'prontuario_finalizado']);
const ARRIVED = new Set([...WAITING].filter(status => !['confirmado', 'pendente', 'aguardando'].includes(status)));
const CANCELLED = new Set(['cancelado', 'cancelada', 'excluido', 'removido', 'inativo', 'remarcado']);
const FILTERS = ['Todos', 'Aguardando', 'Em Atendimento', 'Finalizados'] as const;
type AgendaFilter = typeof FILTERS[number];

function agendaGroup(status: string): AgendaFilter | undefined {
  if (FINISHED.has(status)) return 'Finalizados';
  if (status === 'em_atendimento') return 'Em Atendimento';
  if (WAITING.has(status)) return 'Aguardando';
}

function StatCard({ title, value, detail, badge, icon: Icon }: {
  title: string; value: string | number; detail?: string; badge?: { label: string; high: boolean }; icon: typeof Calendar;
}) {
  return (
    <Card className="min-w-0 shadow-none">
      <CardContent className="space-y-3 p-4">
        <div className="flex min-w-0 items-center gap-2">
          <span className="rounded-lg bg-[#2A6F97]/10 p-2 text-[#2A6F97] dark:text-sky-300"><Icon className="h-4 w-4" aria-hidden="true" /></span>
          <p className="text-sm font-medium text-muted-foreground">{title}</p>
        </div>
        <div className="flex flex-wrap items-baseline gap-2">
          <p className="font-display text-2xl font-bold tabular-nums">{value}</p>
          {badge && <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${badge.high ? 'bg-destructive/10 text-destructive' : 'bg-success/10 text-success'}`}>{badge.label}</span>}
        </div>
        {detail && <p className="text-xs text-muted-foreground">{detail}</p>}
      </CardContent>
    </Card>
  );
}

async function readDashboard(today: string, unitId: string, professionalId: string, signal: AbortSignal) {
  const start = addDaysToDateStr(today, -29);
  // Page by a stable order so multiple rows on the same date are not skipped.
  const paged = async <T,>(makePage: (first: number, last: number) => PromiseLike<{ data: T[] | null; error: unknown }>) => {
    const rows: T[] = [];
    const pageSize = 1000;
    for (let first = 0; !signal.aborted; first += pageSize) {
      const { data, error } = await makePage(first, first + pageSize - 1);
      if (error) throw error;
      rows.push(...(data ?? []));
      if (!data || data.length < pageSize) break;
    }
    return rows;
  };
  const scope = {
    ...(unitId ? { unidade_id: unitId } : {}),
    ...(professionalId ? { profissional_id: professionalId } : {}),
  };
  const [todayRows, pastRows, attendances] = await Promise.all([
    paged((from, to) => supabase.from('agendamentos')
      .select('id,paciente_id,paciente_nome,profissional_nome,data,hora,status,tipo,sala_id,turno').eq('data', today)
      .match(scope).order('id').range(from, to).abortSignal(signal)),
    paged((from, to) => supabase.from('agendamentos')
      .select('id,data,status').gte('data', start).lt('data', today)
      .match(scope).order('id').range(from, to).abortSignal(signal)),
    paged((from, to) => supabase.from('atendimentos')
      .select('id,profissional_id,profissional_nome,agendamento_id,data,status,duracao_minutos,sala_id')
      .gte('data', start).lte('data', today).match(scope).order('id').range(from, to).abortSignal(signal)),
  ]);
  return { todayRows, pastRows, attendances };
}

const Dashboard = () => {
  const { user } = useAuth();
  const isGlobalAdmin = user?.usuario === 'admin.sms';
  const userUnidadeId = user?.unidadeId || '';
  const userId = user?.id || '';
  const userRole = user?.role?.trim().toLowerCase() || '';
  const isMaster = userRole === 'master';
  const isProfessional = userRole === 'profissional';
  if (!userId) return null;
  if (!isGlobalAdmin && !userUnidadeId) {
    return <div role="status" className="rounded-lg border p-5">Selecione uma unidade para visualizar o Dashboard Executivo.</div>;
  }
  // Never render the previous account's snapshot while the next scope loads.
  return <DashboardScope key={JSON.stringify([userId, userRole, userUnidadeId, isGlobalAdmin])}
    userId={userId} firstName={user?.nome?.trim().split(/\s+/)[0] || ''} userUnidadeId={userUnidadeId}
    isGlobalAdmin={isGlobalAdmin} isMaster={isMaster} isProfessional={isProfessional} />;
};

function DashboardScope({ userId, firstName, userUnidadeId, isGlobalAdmin, isMaster, isProfessional }: {
  userId: string; firstName: string; userUnidadeId: string; isGlobalAdmin: boolean; isMaster: boolean; isProfessional: boolean;
}) {
  const { fila } = useFila();
  const { funcionarios, unidades, salas, disponibilidades } = useOperacional();
  const { can, loading: permissionsLoading } = usePermissions();
  const { license, loading: licenseLoading } = useLicense();
  const allowedActions = QUICK_ACTIONS.filter(action => !permissionsLoading && !licenseLoading &&
    isPathLicensed(action.path, license) && (isMaster || can(action.module, 'can_view')));

  const [now, setNow] = useState(() => new Date());
  const today = localDateStr(now);
  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 60_000);
    return () => window.clearInterval(timer);
  }, []);

  const [data, setData] = useState<Awaited<ReturnType<typeof readDashboard>>>();
  const [error, setError] = useState(false);
  const [retry, setRetry] = useState(0);
  const [period, setPeriod] = useState<(typeof PERIODS)[number]['days']>(1);
  const [filter, setFilter] = useState<AgendaFilter>('Todos');
  const unitId = isGlobalAdmin ? '' : userUnidadeId;
  const professionalId = isProfessional ? userId : '';
  useEffect(() => {
    const controller = new AbortController();
    setError(false);
    readDashboard(today, unitId, professionalId, controller.signal).then(result => {
      if (!controller.signal.aborted) setData(result);
    }).catch(cause => {
      if (controller.signal.aborted) return;
      console.error('Erro ao carregar o Dashboard Executivo:', cause);
      setError(true);
    });
    return () => controller.abort();
  }, [today, unitId, professionalId, retry]);

  const todayRows = (data?.todayRows ?? []).filter(row => row.data === today);
  const start = addDaysToDateStr(today, 1 - period);
  const scopedQueue = fila.filter(entry => (!unitId || entry.unidadeId === unitId) &&
    (!professionalId || entry.profissionalId === professionalId));
  const queued = scopedQueue.filter(entry => WAITING.has(entry.status));
  const roomIds = new Set(salas.filter(room => room.ativo && (!unitId || room.unidadeId === unitId)).map(room => room.id));
  const activeRows = todayRows.filter(row => row.status === 'em_atendimento');
  const currentAttendances = (data?.attendances ?? []).filter(row => row.data === today && ['em_atendimento', 'em_andamento', 'aberto', 'iniciado'].includes(row.status));
  const activeVisits = new Set([...activeRows.map(row => row.id), ...currentAttendances.map(row => row.agendamento_id || row.id)]);
  const occupied = new Set([...activeRows, ...currentAttendances].map(row => row.sala_id).filter(id => roomIds.has(id))).size;
  const visibleAppointments = todayRows.filter(row => filter === 'Todos' || agendaGroup(row.status) === filter)
    .sort((a, b) => a.hora.localeCompare(b.hora));

  const { total, missing, mean, weekly, ranking, completed } = useMemo(() => {
    const appointments = [...(data?.pastRows ?? []), ...(data?.todayRows ?? [])];
    const periodAppointments = appointments.filter(row => row.data >= start && row.data <= today && !CANCELLED.has(row.status));
    const done = (data?.attendances ?? []).filter(row => FINISHED.has(row.status));
    const rangeDone = done.filter(row => row.data >= start && row.data <= today);
    const durations = rangeDone.flatMap(row => row.duracao_minutos && row.duracao_minutos > 0 ? [row.duracao_minutos] : []);
    const professionals = new Map<string, { name: string; count: number }>();
    for (const row of rangeDone) {
      if (!row.profissional_id || !row.profissional_nome) continue;
      const item = professionals.get(row.profissional_id) ?? { name: row.profissional_nome, count: 0 };
      item.count += 1;
      professionals.set(row.profissional_id, item);
    }
    const matched = new Set(done.map(row => row.agendamento_id).filter(Boolean));
    const weekly = Array.from({ length: 7 }, (_, index) => {
      const date = addDaysToDateStr(today, index - 6);
      return {
        date: date.split('-').reverse().join('/'),
        count: done.filter(row => row.data === date).length +
          appointments.filter(row => row.data === date && FINISHED.has(row.status) && !matched.has(row.id)).length,
      };
    });
    return {
      total: periodAppointments.length,
      missing: periodAppointments.filter(row => row.status === 'falta' || row.status === 'faltou').length,
      mean: durations.length ? Math.round(durations.reduce((sum, value) => sum + value, 0) / durations.length) : null,
      weekly,
      ranking: Array.from(professionals, ([id, item]) => ({ id, ...item })).sort((a, b) => b.count - a.count || a.name.localeCompare(b.name)).slice(0, 5),
      completed: rangeDone.length,
    };
  }, [data, start, today]);
  const absence = total ? 100 * missing / total : null;
  const hour = Number(nowTimeBrazilStr(now).slice(0, 2));
  const greeting = hour < 12 ? 'Bom dia' : hour < 18 ? 'Boa tarde' : 'Boa noite';
  const unit = unidades.find(item => item.id === userUnidadeId);
  const unitLabel = isGlobalAdmin ? 'Visão consolidada · Toda a rede' : unit?.nomeExibicao || unit?.nome || 'Unidade atual';
  const periodLabel = PERIODS.find(item => item.days === period)?.label;

  return (
    <div className="space-y-6">
      <header className="rounded-2xl border border-[#2A6F97]/20 bg-[#2A6F97] p-5 text-white sm:p-7">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-sm font-medium text-sky-100">Dashboard Executivo</p>
            <h1 className="mt-1 font-display text-2xl font-bold sm:text-3xl">{greeting}{firstName ? `, ${firstName}` : ''}</h1>
            <p className="mt-1 text-sm text-sky-50">{new Intl.DateTimeFormat('pt-BR', { dateStyle: 'full', timeZone: BRAZIL_TIMEZONE }).format(now)}</p>
          </div>
          <span className="rounded-full border border-white/25 bg-white/10 px-3 py-1.5 text-sm">{unitLabel}</span>
        </div>
        {allowedActions.length > 0 && <nav className="mt-5 flex flex-wrap gap-2" aria-label="Ações rápidas">
          {allowedActions.map(({ path, label, icon: Icon }) => (
            <Button key={path} asChild className="border border-white/25 bg-white/10 text-white hover:bg-white/20">
              <Link to={path}><Icon className="mr-2 h-4 w-4" />{label}<ArrowUpRight className="ml-2 h-3.5 w-3.5" /></Link>
            </Button>
          ))}
        </nav>}
      </header>
      {error && <div role="alert" className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-destructive/30 p-4">
        <p className="text-sm">Não foi possível atualizar os dados do Dashboard.</p>
        <Button variant="outline" onClick={() => setRetry(value => value + 1)}>Tentar novamente</Button>
      </div>}
      {!data && !error && <DashboardSkeleton />}
      {data && <>
        <section className="space-y-3">
          <h2 className="font-display text-lg font-semibold">Operação de hoje</h2>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <StatCard title="Consultas agendadas" value={todayRows.filter(row => !CANCELLED.has(row.status)).length} icon={Calendar} />
            <StatCard title="Pacientes que chegaram" value={new Set(todayRows.filter(row => ARRIVED.has(row.status) || FINISHED.has(row.status) || row.status === 'em_atendimento').map(row => row.paciente_id || row.id)).size} icon={CheckCircle} />
            <StatCard title="Pacientes na fila" value={queued.length} icon={Users} />
            <StatCard title="Em atendimento" value={activeVisits.size} icon={Stethoscope} />
          </div>
        </section>
        <section className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="font-display text-lg font-semibold">Eficiência clínica</h2>
            <div role="group" aria-label="Período dos indicadores agregados" className="flex flex-wrap gap-1 rounded-lg border bg-muted/30 p-1">
              {PERIODS.map(item => <Button key={item.days} size="sm" variant={period === item.days ? 'default' : 'ghost'}
                aria-pressed={period === item.days} onClick={() => setPeriod(item.days)}>{item.label}</Button>)}
            </div>
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <StatCard title="Taxa de absenteísmo" value={absence === null ? '—' : `${absence.toLocaleString('pt-BR', { maximumFractionDigits: 1 })}%`}
              icon={XCircle} detail={`${missing} faltas em ${total} agendamentos válidos`}
              badge={absence === null ? undefined : { label: absence < 15 ? 'Dentro da meta' : 'Atenção', high: absence >= 15 }} />
            <StatCard title="Tempo médio de consulta" value={mean === null ? '—' : `${mean} min`} icon={Clock} detail={periodLabel} />
            <StatCard title="Ocupação física de salas" value={isProfessional ? occupied : roomIds.size ? `${Math.round(100 * occupied / roomIds.size)}%` : '—'}
              icon={DoorOpen} detail={isProfessional ? 'Salas em uso nos seus atendimentos de hoje' : `${occupied} de ${roomIds.size} salas ativas em uso hoje`} />
            <StatCard title="Casos prioritários / urgentes" value={queued.filter(entry => entry.prioridade === 'alta' || entry.prioridade === 'urgente').length}
              icon={AlertTriangle} detail="Aguardando na fila atual" />
          </div>
        </section>
        {isMaster && <AtendimentosPendentesMaster userUnidadeId={userUnidadeId} isGlobalAdmin={isGlobalAdmin}
          agendaAllowed={allowedActions.some(action => action.module === 'agenda')} />}
        <div className="grid gap-4 lg:grid-cols-2">
          <Card className="min-w-0 shadow-none">
            <CardContent className="space-y-3 p-5">
              <h2 className="font-display font-semibold">Evolução semanal</h2>
              <p className="text-sm text-muted-foreground">Atendimentos concluídos · Últimos 7 dias</p>
              <ResponsiveContainer width="100%" height={222}>
                <AreaChart data={weekly} margin={{ top: 8, right: 12, left: -22, bottom: 0 }}>
                  <CartesianGrid vertical={false} strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis dataKey="date" tickFormatter={(date: string) => date.slice(0, 5)} tickLine={false} axisLine={false} fontSize={11} />
                  <YAxis allowDecimals={false} tickLine={false} axisLine={false} fontSize={11} />
                  <Tooltip labelFormatter={(date) => date} formatter={(value) => [value, 'Atendimentos concluídos']}
                    contentStyle={{ background: 'hsl(var(--card))', borderColor: BLUE, borderRadius: 8 }} itemStyle={{ color: 'hsl(var(--foreground))' }} />
                  <Area dataKey="count" type="monotone" stroke={BLUE} strokeWidth={2.5} fill={BLUE} fillOpacity={0.14} isAnimationActive={false} />
                </AreaChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
          <Card className="min-w-0 shadow-none">
            <CardContent className="space-y-3 p-5">
              <h2 className="font-display font-semibold">{isProfessional ? 'Seus atendimentos concluídos' : 'Top 5 profissionais'}</h2>
              <p className="text-sm text-muted-foreground">Atendimentos concluídos · {periodLabel}</p>
              {ranking.length ? <ol className="space-y-3">
                {ranking.map(item => (
                  <li key={item.id} className="space-y-1.5">
                    <div className="flex flex-wrap items-baseline justify-between gap-x-3 text-sm">
                      <span className="break-words font-medium">{item.name}</span>
                      <span className="shrink-0 tabular-nums text-muted-foreground">{item.count} · {Math.round(100 * item.count / completed)}%</span>
                    </div>
                    <div aria-hidden="true" className="h-2 rounded-full bg-muted">
                      <div className="h-full rounded-full bg-[#2A6F97]" style={{ width: `${100 * item.count / completed}%` }} />
                    </div>
                  </li>
                ))}
              </ol> : <p className="py-8 text-sm text-muted-foreground">Nenhum atendimento concluído no período.</p>}
            </CardContent>
          </Card>
        </div>
        <Card className="shadow-none">
          <CardContent className="space-y-4 p-5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="font-display text-lg font-semibold">Agenda de Hoje</h2>
              <div role="group" aria-label="Filtrar Agenda de Hoje" className="flex flex-wrap gap-1">
                {FILTERS.map(item => <Button key={item} size="sm" variant={filter === item ? 'secondary' : 'ghost'}
                  aria-pressed={filter === item} onClick={() => setFilter(item)}>{item}</Button>)}
              </div>
            </div>
            {visibleAppointments.length ? <ul className="divide-y rounded-lg border">
              {visibleAppointments.map(row => <li key={row.id} className="flex flex-wrap items-center gap-x-4 gap-y-2 p-3">
                <time className="font-semibold tabular-nums text-[#2A6F97] dark:text-sky-300">{row.hora.slice(0, 5)}</time>
                {(row.turno || row.hora) && <span className="rounded-full bg-muted px-2 py-0.5 text-xs">{row.turno?.replace(/^manha$/i, 'Manhã').replace(/^tarde$/i, 'Tarde') || (Number(row.hora.slice(0, 2)) < 12 ? 'Manhã' : 'Tarde')}</span>}
                <div className="min-w-0 flex-1 basis-36">
                  <p className="break-words text-sm font-medium">{row.paciente_nome || 'Paciente não identificado'}</p>
                  <p className="break-words text-xs text-muted-foreground">{row.profissional_nome || 'Profissional não informado'}{row.tipo && ` · ${row.tipo}`}</p>
                </div>
                <span className="rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">
                  {row.status === 'em_atendimento' ? 'Em atendimento' : FINISHED.has(row.status) ? 'Finalizado' :
                    (['confirmado_chegada', 'chegada_confirmada'].includes(row.status) ? 'Chegou' : row.status.replace(/_/g, ' '))}
                </span>
              </li>)}
            </ul> : <p className="text-sm text-muted-foreground">Nenhum agendamento nesta visualização.</p>}
          </CardContent>
        </Card>
        {!isProfessional && <div className="grid gap-3 sm:grid-cols-3">
          <StatCard title="Profissionais ativos" value={funcionarios.filter(f => f.role === 'profissional' && f.ativo && (!unitId || f.unidadeId === unitId)).length} icon={Users} />
          <StatCard title="Unidades ativas" value={unidades.filter(u => u.ativo && (!unitId || u.id === unitId)).length} icon={Activity} />
          <StatCard title="Disponibilidades configuradas" value={disponibilidades.filter(d => !unitId || d.unidadeId === unitId).length} icon={Calendar} />
        </div>}
      </>}
    </div>
  );
}

const AtendimentosPendentesMaster: React.FC<{ userUnidadeId: string; isGlobalAdmin: boolean; agendaAllowed: boolean }> = ({ userUnidadeId, isGlobalAdmin, agendaAllowed }) => {
  const [pendentes, setPendentes] = useState<any[]>([]);
  const [minutos, setMinutos] = useState(60);

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const { data: cfgRow } = await supabase.from('system_config').select('configuracoes').eq('id', 'default').maybeSingle();
        const m = (cfgRow?.configuracoes as any)?.config_fluxo_atendimento?.alerta_minutos_em_atendimento;
        const mins = typeof m === 'number' ? m : 60;
        if (!active) return;
        setMinutos(mins);
        const { data } = await (supabase as any).rpc('get_atendimentos_pendentes_master', {
          p_unidade_id: isGlobalAdmin ? null : (userUnidadeId || null),
          p_minutos: mins,
        });
        if (active) setPendentes((data || []).filter((row: { unidade_id: string }) => isGlobalAdmin || row.unidade_id === userUnidadeId));
      } catch {}
    })();
    return () => { active = false; };
  }, [userUnidadeId, isGlobalAdmin]);

  if (pendentes.length === 0) return null;

  return (
    <Card className="border-destructive/30 bg-destructive/5">
      <CardContent className="p-5">
        <div className="mb-4 flex flex-wrap items-center gap-2">
          <AlertTriangle className="w-5 h-5 text-destructive" />
          <h3 className="font-semibold font-display text-foreground">
            Atendimentos em aberto há mais de {minutos} min ({pendentes.length})
          </h3>
          {agendaAllowed && <Button asChild variant="outline" size="sm" className="sm:ml-auto"><Link to="/painel/agenda">Abrir Agenda <ArrowUpRight className="ml-1 h-4 w-4" /></Link></Button>}
        </div>
        <div className="space-y-2">
          {pendentes.slice(0, 10).map((p: any) => (
            <div
              key={p.id}
              className="flex items-center justify-between gap-3 rounded-lg bg-background/80 p-3"
            >
              <div className="min-w-0">
                <p className="text-sm font-medium text-foreground truncate">{p.paciente_nome}</p>
                <p className="text-xs text-muted-foreground truncate">com {p.profissional_nome} · {p.data} {p.hora}</p>
              </div>
              <span className="text-xs font-semibold text-destructive shrink-0">{p.minutos_aberto} min</span>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
};

export default Dashboard;
