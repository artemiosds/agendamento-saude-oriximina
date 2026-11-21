import { useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, ArrowUpRight } from 'lucide-react';
import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { supabase } from '@/integrations/supabase/client';
import { formatOpenAttendanceDuration } from '@/lib/openAttendanceDuration';

const PAGE_SIZE = 15;
type Period = 'hoje' | 'anteriores';
type PendingPage = {
  total: number;
  limite_minutos: number;
  itens: { id: string; paciente_nome: string; profissional_nome: string; data: string; hora: string; minutos_aberto: number | null }[];
};

function usePendingPage(scope: string, today: string, period: Period, page: number, enabled: boolean) {
  return useQuery({
    queryKey: ['atendimentos-pendentes-master', scope, today, period, page],
    enabled,
    refetchInterval: 30_000,
    placeholderData: undefined,
    queryFn: async ({ signal }) => {
      const { data, error } = await supabase.rpc('get_atendimentos_pendentes_master_page', {
        p_periodo: period,
        p_pagina: page,
      }).abortSignal(signal);
      if (error) throw error;
      return data as PendingPage;
    },
  });
}

function PendingList({ query, page, setPage, empty }: {
  query: ReturnType<typeof usePendingPage>;
  page: number;
  setPage: (page: number) => void;
  empty: string;
}) {
  if (query.isError) return <div role="alert" className="flex flex-wrap items-center gap-2">
    <p className="text-sm">Não foi possível consultar os atendimentos em aberto.</p>
    <Button size="sm" variant="outline" onClick={() => void query.refetch()}>Tentar novamente</Button>
  </div>;
  if (!query.data) return <p role="status" className="text-sm text-muted-foreground">Consultando atendimentos em aberto…</p>;

  const { itens, total } = query.data;
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  return <div className="space-y-3">
    {itens.length ? <ul className="space-y-2">
      {itens.map(item => <li key={item.id} className="flex flex-wrap items-start justify-between gap-3 rounded-lg border bg-background/80 p-3">
        <div className="min-w-0">
          <p className="break-words text-sm font-medium">{item.paciente_nome}</p>
          <p className="break-words text-xs text-muted-foreground">{item.profissional_nome || 'Profissional não informado'} · {item.hora?.slice(0, 5) || 'Horário não registrado'}</p>
        </div>
        <span className="text-xs font-semibold text-destructive">{formatOpenAttendanceDuration(item.minutos_aberto, item.data)}</span>
      </li>)}
    </ul> : <p className="text-sm text-muted-foreground">{page === 1 ? empty : 'Esta página ficou vazia. Volte para a página anterior.'}</p>}
    {(pages > 1 || page > 1) && <div className="flex flex-wrap items-center justify-end gap-2">
      <span className="text-xs text-muted-foreground">Página {page} de {Math.max(page, pages)} · {total} registros</span>
      <Button variant="outline" size="sm" disabled={page === 1} onClick={() => setPage(page - 1)}>Anterior</Button>
      <Button variant="outline" size="sm" disabled={page >= pages} onClick={() => setPage(page + 1)}>Ver mais</Button>
    </div>}
  </div>;
}

export function AtendimentosPendentesMaster({ scope, today, agendaAllowed }: {
  scope: string;
  today: string;
  agendaAllowed: boolean;
}) {
  const [todayPage, setTodayPage] = useState(1);
  const [historyPage, setHistoryPage] = useState(1);
  const [period, setPeriod] = useState<Period>('hoje');
  const queryClient = useQueryClient();
  const [confirmation, setConfirmation] = useState<number | null>(null);
  const [reason, setReason] = useState('');
  const [saving, setSaving] = useState(false);
  const closingRef = useRef(false);
  const [feedback, setFeedback] = useState('');
  const [failed, setFailed] = useState(false);
  const plantao = usePendingPage(scope, today, 'hoje', todayPage, true);
  const history = usePendingPage(scope, today, 'anteriores', historyPage, period === 'anteriores');
  const total = plantao.data?.total;
  async function regularize() {
    if (closingRef.current || confirmation === null || reason.trim().length < 10) return;
    closingRef.current = true;
    setSaving(true);
    setFailed(false);
    setFeedback('');
    try {
      const { data, error } = await supabase.rpc('regularizar_atendimentos_anteriores_master', {
        p_justificativa: reason.trim(), p_data_referencia: today, p_total_confirmado: confirmation,
      });
      if (error) throw error;
      setConfirmation(null);
      setHistoryPage(1);
      setFeedback(`${data} agendamentos encerrados administrativamente.`);
    } catch (error) {
      setFailed(true);
      setConfirmation(null);
      setFeedback(error && typeof error === 'object' && 'code' in error && error.code === '40001'
        ? 'O total ou a data do plantão mudou. Confira a lista atualizada e confirme novamente.'
        : 'Não foi possível confirmar o encerramento. Confira a lista atualizada antes de tentar novamente.');
    } finally {
      await queryClient.invalidateQueries({ queryKey: ['atendimentos-pendentes-master', scope] });
      closingRef.current = false;
      setSaving(false);
    }
  }
  return <Card className={total ? 'border-destructive/30 bg-destructive/5' : 'shadow-none'}>
    <CardContent className="space-y-4 p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <AlertTriangle aria-hidden="true" className={total ? 'h-5 w-5 shrink-0 text-destructive' : 'h-5 w-5 shrink-0 text-muted-foreground'} />
          <div>
            <h3 className="font-display font-semibold">Atendimentos em aberto no plantão ({total ?? '—'})</h3>
            {plantao.data && <p className="text-xs text-muted-foreground">Hoje · acima de {plantao.data.limite_minutos} min</p>}
          </div>
        </div>
        {agendaAllowed && <Button asChild variant="outline" size="sm">
          <Link to="/painel/agenda">Abrir Agenda <ArrowUpRight aria-hidden="true" className="ml-1 h-4 w-4" /></Link>
        </Button>}
      </div>
      <div role="group" aria-label="Período dos atendimentos em aberto" className="flex flex-wrap gap-2">
        <Button type="button" size="sm" variant={period === 'hoje' ? 'secondary' : 'ghost'} aria-pressed={period === 'hoje'}
          onClick={() => setPeriod('hoje')}>Hoje</Button>
        <Button type="button" size="sm" variant={period === 'anteriores' ? 'secondary' : 'ghost'} aria-pressed={period === 'anteriores'}
          onClick={() => setPeriod('anteriores')}>Passado{history.data ? ` (${history.data.total})` : ''}</Button>
      </div>
      {period === 'hoje' ? <PendingList query={plantao} page={todayPage} setPage={setTodayPage} empty="Nenhum atendimento de hoje acima do limite." /> : <>
        <PendingList query={history} page={historyPage} setPage={setHistoryPage} empty="Nenhum atendimento em aberto em dias anteriores." />
        {!!history.data?.total && <Button variant="outline" disabled={saving || history.isFetching || history.isError} onClick={() => {
          setReason('');
          setFeedback('');
          setConfirmation(history.data.total);
        }}>Regularizar Atendimentos Anteriores</Button>}
      </>}
      {feedback && <p role={failed ? 'alert' : 'status'} className="text-sm">{feedback}</p>}
      <Dialog open={confirmation !== null} onOpenChange={open => { if (!open && !saving) setConfirmation(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Confirmar encerramento administrativo</DialogTitle>
            <DialogDescription>
              A ação encerra {confirmation} agendamentos em aberto de dias anteriores no seu escopo. Cada encerramento será auditado com sua justificativa. O plantão de hoje é preservado.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="historical-closure-reason">Justificativa (mínimo de 10 caracteres)</Label>
            <Textarea id="historical-closure-reason" value={reason} onChange={event => setReason(event.target.value)}
              maxLength={1000} disabled={saving} />
          </div>
          <DialogFooter>
            <Button variant="outline" disabled={saving} onClick={() => setConfirmation(null)}>Cancelar</Button>
            <Button variant="destructive" disabled={saving || reason.trim().length < 10}
              onClick={() => void regularize()}>{saving ? 'Regularizando…' : 'Confirmar encerramento'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </CardContent>
  </Card>;
}
