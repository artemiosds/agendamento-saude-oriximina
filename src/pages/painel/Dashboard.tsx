import { ARRIVED, CANCELLED, FINISHED, getDashboardOperations } from '@/lib/dashboardOperations';
import { useRealtimeSync } from '@/hooks/useRealtimeSync';
import { useEffect, useMemo, useRef, useState } from 'react';
import { AtendimentosPendentesMaster } from './AtendimentosPendentesMaster';
import { Link } from 'react-router-dom';
import { Activity, AlertTriangle, ArrowUpRight, BarChart3, Calendar, CheckCircle, Clock, DoorOpen, Maximize2, Minimize2, ListOrdered, Stethoscope, Users, XCircle } from 'lucide-react';
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Legend, Tooltip, XAxis, YAxis } from 'recharts';
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

async function readDashboard(today: string, unitId: string, professionalId: string, signal: AbortSignal, liveOnly = false) {
  const start = liveOnly ? today : addDaysToDateStr(today, -29);
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
      .select('id,paciente_id,paciente_nome,profissional_nome,data,hora,status,tipo,sala_id,turno,iniciado_em').eq('data', today)
      .match(scope).order('id').range(from, to).abortSignal(signal)),
    liveOnly ? Promise.resolve([]) : paged((from, to) => supabase.from('agendamentos')
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

  const [theater, setTheater] = useState(false);
  const board = useRef<HTMLDivElement>(null);
  const hasFullscreen = useRef(false);
  useEffect(() => {
    function onFullscreen() {
      if (document.fullscreenElement === board.current) hasFullscreen.current = true;
      else if (hasFullscreen.current) {
        hasFullscreen.current = false;
        setTheater(false);
      }
    }
    function onEscape(event: KeyboardEvent) {
      if (event.key === 'Escape' && !document.fullscreenElement) setTheater(false);
    }
    document.addEventListener('fullscreenchange', onFullscreen);
    window.addEventListener('keydown', onEscape);
    return () => {
      document.removeEventListener('fullscreenchange', onFullscreen);
      window.removeEventListener('keydown', onEscape);
    };
  }, []);

  function toggleTheater() {
    if (theater) {
      setTheater(false);
      if (document.fullscreenElement === board.current) void document.exitFullscreen?.().catch(() => {});
    } else {
      setTheater(true);
      void board.current?.requestFullscreen?.().catch(() => {});
    }
  }

  const [now, setNow] = useState(() => new Date());
  const today = localDateStr(now);
  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 30_000);
    return () => window.clearInterval(timer);
  }, []);

  const [data, setData] = useState<Awaited<ReturnType<typeof readDashboard>>>();
  const [error, setError] = useState(false);
  const [retry, setRetry] = useState(0);
  const [period, setPeriod] = useState<(typeof PERIODS)[number]['days']>(1);
  const [filter, setFilter] = useState<AgendaFilter>('Todos');
  const unitId = isGlobalAdmin ? '' : userUnidadeId;
  const professionalId = isProfessional ? userId : '';
  const refreshLive = useRef<() => void>(() => {});
  useEffect(() => {
    const controller = new AbortController();
    let loaded = false;
    let running = false;
    let pending = false;
    async function refresh() {
      if (controller.signal.aborted) return;
      if (running) { pending = true; return; }
      running = true;
      try {
        const result = await readDashboard(today, unitId, professionalId, controller.signal, loaded);
        if (controller.signal.aborted) return;
        const live = loaded;
        setData(previous => !live || !previous ? result : ({
          todayRows: result.todayRows,
          pastRows: previous.pastRows,
          attendances: [...previous.attendances.filter(row => row.data !== today), ...result.attendances],
        }));
        loaded = true;
        setError(false);
      } catch (cause) {
        if (controller.signal.aborted) return;
        console.error('Erro ao carregar o Dashboard Executivo:', cause);
        setError(true);
      } finally {
        running = false;
        if (pending && !controller.signal.aborted) {
          pending = false;
          void refresh();
        }
      }
    }
    refreshLive.current = () => { void refresh(); };
    void refresh();
    const timer = window.setInterval(refreshLive.current, 30_000);
    return () => {
      controller.abort();
      window.clearInterval(timer);
      refreshLive.current = () => {};
    };
  }, [today, unitId, professionalId, retry]);
  const realtimeFilter = unitId ? `unidade_id=eq.${unitId}` : undefined;
  useRealtimeSync({ table: 'agendamentos', filter: realtimeFilter, onEvent: () => refreshLive.current() });
  useRealtimeSync({ table: 'atendimentos', filter: realtimeFilter, onEvent: () => refreshLive.current() });

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

  const { total, missing, mean, weekly } = useMemo(() => {
    const appointments = [...(data?.pastRows ?? []), ...(data?.todayRows ?? [])];
    const periodAppointments = appointments.filter(row => row.data >= start && row.data <= today && !CANCELLED.has(row.status));
    const done = (data?.attendances ?? []).filter(row => FINISHED.has(row.status));
    const rangeDone = done.filter(row => row.data >= start && row.data <= today);
    const durations = rangeDone.flatMap(row => row.duracao_minutos && row.duracao_minutos > 0 ? [row.duracao_minutos] : []);
    const matched = new Set(done.map(row => row.agendamento_id).filter(Boolean));
    const weekly = Array.from({ length: 7 }, (_, index) => {
      const date = addDaysToDateStr(today, index - 6);
      return {
        date: date.split('-').reverse().join('/'),
        count: done.filter(row => row.data === date).length +
          appointments.filter(row => row.data === date && FINISHED.has(row.status) && row.status !== 'atendimento_encerrado' && !matched.has(row.id)).length,
      };
    });
    return {
      total: periodAppointments.length,
      missing: periodAppointments.filter(row => row.status === 'falta' || row.status === 'faltou').length,
      mean: durations.length ? Math.round(durations.reduce((sum, value) => sum + value, 0) / durations.length) : null,
      weekly,
    };
  }, [data, start, today]);
  const waitingToday = queued.filter(entry => entry.criadoEm &&
    localDateStr(new Date(entry.criadoEm)) === today).length;
  const actualVisits = new Set((data?.attendances ?? []).filter(row => row.data === today &&
    (FINISHED.has(row.status) || ['em_atendimento', 'em_andamento'].includes(row.status))).map(row => row.agendamento_id));
  const operations = getDashboardOperations(todayRows, actualVisits, waitingToday, now, today);
  const operationBadge = operations.tone === 'critical' ? 'bg-red-100 text-red-900'
    : operations.tone === 'warning' ? 'bg-amber-100 text-amber-900' : 'bg-emerald-100 text-emerald-900';
  const filaAllowed = allowedActions.some(action => action.module === 'fila');
  const absence = total ? 100 * missing / total : null;
  const hour = Number(nowTimeBrazilStr(now).slice(0, 2));
  const greeting = hour < 12 ? 'Bom dia' : hour < 18 ? 'Boa tarde' : 'Boa noite';
  const unit = unidades.find(item => item.id === userUnidadeId);
  const unitLabel = isGlobalAdmin ? 'Visão consolidada · Toda a rede' : unit?.nomeExibicao || unit?.nome || 'Unidade atual';
  const periodLabel = PERIODS.find(item => item.days === period)?.label;

  return (
    <div ref={board} className={theater ? "fixed inset-0 z-[80] space-y-6 overflow-auto bg-background p-4 md:p-8" : "space-y-6"}>
      <header className="rounded-2xl border border-[#2A6F97]/20 bg-[#2A6F97] p-5 text-white sm:p-7">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-sm font-medium text-sky-100">Dashboard Executivo</p>
            <h1 className="mt-1 font-display text-2xl font-bold sm:text-3xl">{greeting}{firstName ? `, ${firstName}` : ''}</h1>
            <p className="mt-1 text-sm text-sky-50">{new Intl.DateTimeFormat('pt-BR', { dateStyle: 'full', timeZone: BRAZIL_TIMEZONE }).format(now)}</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded-full border border-white/25 bg-white/10 px-3 py-1.5 text-sm">{unitLabel}</span>
            <Button type="button" onClick={toggleTheater} aria-pressed={theater} variant="outline"
              className="border-white/25 bg-white/10 text-white hover:bg-white/20 hover:text-white">
              {theater ? <Minimize2 className="mr-2 h-4 w-4" /> : <Maximize2 className="mr-2 h-4 w-4" />}
              {theater ? 'Sair do telão' : 'Modo Telão'}
            </Button>
          </div>
        </div>
        {!theater && allowedActions.length > 0 && <nav className="mt-5 flex flex-wrap gap-2" aria-label="Ações rápidas">
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
        <Card className="border-[#2A6F97]/30 shadow-none">
          <CardContent className="flex flex-wrap items-center justify-between gap-3 p-5">
            <div className="space-y-1">
              <h2 className="font-display text-lg font-semibold">Termômetro operacional</h2>
              <p className="text-sm text-muted-foreground">{error ? 'Leitura anterior · aguardando atualização. ' : ''}{operations.summary}</p>
            </div>
            <span className={`rounded-full px-3 py-1.5 text-sm font-semibold ${operationBadge}`}>{operations.label}</span>
          </CardContent>
        </Card>
        {operations.absent > 0 && <Card className="border-amber-300/60 shadow-none">
          <CardContent className="flex flex-wrap items-center justify-between gap-3 p-4">
            <p className="text-sm"><strong>{operations.absent} faltas registradas no turno.</strong> Confira a disponibilidade para encaixes na fila de espera.</p>
            {!theater && filaAllowed && <Button asChild variant="outline" size="sm"><Link to="/painel/fila">Fila de Espera / Encaixe</Link></Button>}
          </CardContent>
        </Card>}

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
        {!theater && isMaster && <AtendimentosPendentesMaster key={today} scope={JSON.stringify([userId, unitId, isGlobalAdmin])} today={today}
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
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h2 className="font-display font-semibold">Carga horária do dia</h2>
                {operations.peak.scheduled > 0 && <span className="rounded-full bg-[#2A6F97]/10 px-2.5 py-1 text-xs font-semibold text-[#2A6F97] dark:text-sky-300">
                  Pico previsto · {operations.peak.range}
                </span>}
              </div>
              <p className="text-sm text-muted-foreground">07h00 às 18h00 · pela hora marcada na Agenda</p>
              <ResponsiveContainer width="100%" height={222}>
                <AreaChart data={operations.load} margin={{ top: 8, right: 10, left: -22, bottom: 2 }}>
                  <CartesianGrid vertical={false} strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis dataKey="label" tickLine={false} axisLine={false} fontSize={10} />
                  <YAxis allowDecimals={false} tickLine={false} axisLine={false} fontSize={11} />
                  <Tooltip labelFormatter={(_, entries) => entries[0]?.payload.range || ''}
                    contentStyle={{ background: 'hsl(var(--card))', borderColor: BLUE, borderRadius: 8 }} />
                  <Legend />
                  <Area dataKey="scheduled" name="Agendados" type="monotone" stroke={BLUE} fill={BLUE} strokeWidth={2} fillOpacity={0.13} isAnimationActive={false} />
                  <Area dataKey="present" name="Chegaram / Atendidos" type="monotone" stroke="#16805A" fill="#16805A" strokeWidth={2} fillOpacity={0.2} isAnimationActive={false} />
                </AreaChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        </div>
        {!theater && <Card className="shadow-none">
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
        </Card>}
        {!theater && !isProfessional && <div className="grid gap-3 sm:grid-cols-3">
          <StatCard title="Profissionais ativos" value={funcionarios.filter(f => f.role === 'profissional' && f.ativo && (!unitId || f.unidadeId === unitId)).length} icon={Users} />
          <StatCard title="Unidades ativas" value={unidades.filter(u => u.ativo && (!unitId || u.id === unitId)).length} icon={Activity} />
          <StatCard title="Disponibilidades configuradas" value={disponibilidades.filter(d => !unitId || d.unidadeId === unitId).length} icon={Calendar} />
        </div>}
      </>}
    </div>
  );
}

export default Dashboard;
