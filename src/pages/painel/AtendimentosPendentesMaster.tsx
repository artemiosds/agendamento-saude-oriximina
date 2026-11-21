import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { AlertTriangle, ArrowUpRight, ChevronDown } from 'lucide-react';
import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
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
  const [historyOpen, setHistoryOpen] = useState(false);
  const plantao = usePendingPage(scope, today, 'hoje', todayPage, true);
  const history = usePendingPage(scope, today, 'anteriores', historyPage, historyOpen);
  const total = plantao.data?.total;
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
      <PendingList query={plantao} page={todayPage} setPage={setTodayPage} empty="Nenhum atendimento de hoje acima do limite." />
      <div className="space-y-3 border-t pt-3">
        <Button type="button" variant="ghost" size="sm" aria-expanded={historyOpen} aria-controls="pendencias-anteriores"
          onClick={() => setHistoryOpen(open => !open)}>
          <ChevronDown aria-hidden="true" className={historyOpen ? 'mr-2 h-4 w-4 rotate-180' : 'mr-2 h-4 w-4'} />
          Dias anteriores{history.data ? ` (${history.data.total})` : ''}
        </Button>
        <div id="pendencias-anteriores" hidden={!historyOpen}>
          {historyOpen && <PendingList query={history} page={historyPage} setPage={setHistoryPage} empty="Nenhum atendimento em aberto em dias anteriores." />}
        </div>
      </div>
    </CardContent>
  </Card>;
}
