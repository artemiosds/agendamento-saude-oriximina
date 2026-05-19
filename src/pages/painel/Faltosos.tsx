import React, { useEffect, useMemo, useState, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  Table, TableHeader, TableBody, TableRow, TableHead, TableCell,
} from '@/components/ui/table';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from '@/components/ui/dialog';
import { Loader2, Unlock, Search, ShieldCheck } from 'lucide-react';
import { toast } from 'sonner';
import { PageHeader } from '@/components/ui/page-header';
import { getExcecaoLabel } from '@/lib/faltasUtils';

type StatusFilter = 'TODOS' | 'FALTOSO' | 'BLOQUEADO' | 'REGULARIZADO';

interface Linha {
  id: string;
  nome: string;
  unidade_id: string | null;
  total_faltas: number;
  status_falta: string;
  ultima_falta: string | null;
  is_tfd: boolean;
  possui_ordem_judicial: boolean;
  motivo_excecao_bloqueio?: string | null;
  faltas_injustificadas_ativas: number;
  faltas_liberadas: number;
}

const Faltosos: React.FC = () => {
  const { user, isGlobalAdmin } = useAuth();
  const role = (user?.role || '').toLowerCase();
  const canUnblock = role === 'master' || role === 'gestor' || role === 'admin' || isGlobalAdmin;
  const canLiberateAll = role === 'master' || isGlobalAdmin;
  const canAccess = ['master', 'gestor', 'admin', 'coordenador', 'recepcao'].includes(role) || isGlobalAdmin;

  const [loading, setLoading] = useState(true);
  const [linhas, setLinhas] = useState<Linha[]>([]);
  const [status, setStatus] = useState<StatusFilter>('TODOS');
  const [busca, setBusca] = useState('');
  const [dataInicio, setDataInicio] = useState('');
  const [dataFim, setDataFim] = useState('');
  const [mostrarExcecao, setMostrarExcecao] = useState(false);

  // Modal de liberação
  const [modalOpen, setModalOpen] = useState(false);
  const [modalPaciente, setModalPaciente] = useState<Linha | null>(null);
  const [motivoLib, setMotivoLib] = useState('');
  const [liberarTodas, setLiberarTodas] = useState(false);
  const [salvando, setSalvando] = useState(false);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      // Buscar pacientes com qualquer status (inclui REGULAR, para mostrar exceções/regularizados)
      const { data: pacientes, error: pacErr } = await supabase
        .from('pacientes')
        .select('id, nome, total_faltas, status_falta, custom_data, is_tfd, possui_ordem_judicial, motivo_excecao_bloqueio')
        .or('status_falta.in.(FALTOSO,BLOQUEADO),is_tfd.eq.true,possui_ordem_judicial.eq.true,total_faltas.gt.0')
        .order('total_faltas', { ascending: false })
        .limit(1000);

      if (pacErr) throw pacErr;
      const ids = (pacientes || []).map((p: any) => p.id);

      // Mapear faltas por paciente (status='falta')
      const ultimasMap: Record<string, string> = {};
      const injustAtivas: Record<string, number> = {};
      const liberadas: Record<string, number> = {};
      const unidadesPorPaciente: Record<string, string | null> = {};

      if (ids.length > 0) {
        const { data: ags } = await supabase
          .from('agendamentos')
          .select('paciente_id, data, hora, unidade_id, status, tipo_falta, falta_liberada')
          .in('paciente_id', ids)
          .order('data', { ascending: false });

        (ags || []).forEach((a: any) => {
          if (!unidadesPorPaciente[a.paciente_id]) unidadesPorPaciente[a.paciente_id] = a.unidade_id;
          if (a.status === 'falta') {
            if (!ultimasMap[a.paciente_id]) ultimasMap[a.paciente_id] = a.data;
            const tipo = (a.tipo_falta || 'injustificada').toLowerCase();
            if (tipo === 'injustificada' && !a.falta_liberada) {
              injustAtivas[a.paciente_id] = (injustAtivas[a.paciente_id] || 0) + 1;
            }
            if (a.falta_liberada) {
              liberadas[a.paciente_id] = (liberadas[a.paciente_id] || 0) + 1;
            }
          }
        });
      }

      const userUnit = user?.unidadeId;
      const isolar = !!userUnit && user?.usuario !== 'admin.sms';

      let rows: Linha[] = (pacientes || []).map((p: any) => ({
        id: p.id,
        nome: p.nome,
        total_faltas: p.total_faltas || 0,
        status_falta: p.status_falta,
        unidade_id: unidadesPorPaciente[p.id] || null,
        ultima_falta: ultimasMap[p.id] || null,
        is_tfd: p.is_tfd === true || p.custom_data?.is_tfd === true,
        possui_ordem_judicial: p.possui_ordem_judicial === true || p.custom_data?.possui_ordem_judicial === true,
        motivo_excecao_bloqueio: p.motivo_excecao_bloqueio,
        faltas_injustificadas_ativas: injustAtivas[p.id] || 0,
        faltas_liberadas: liberadas[p.id] || 0,
      }));

      if (isolar) rows = rows.filter((r) => r.unidade_id === userUnit);

      setLinhas(rows);
    } catch (e: any) {
      console.error('[Faltosos] Erro na regra de faltas/exceção', {
        acao: 'fetchData',
        errorMessage: e?.message,
        errorDetails: e?.details,
        errorCode: e?.code,
      });
      toast.error('Não foi possível carregar a lista de faltas.');
    } finally {
      setLoading(false);
    }
  }, [user?.unidadeId, user?.usuario]);

  useEffect(() => {
    if (canAccess) fetchData();
  }, [canAccess, fetchData]);

  const filtradas = useMemo(() => {
    const buscaLower = busca.trim().toLowerCase();
    return linhas.filter((r) => {
      const temExcecao = r.is_tfd || r.possui_ordem_judicial;

      // Por padrão, esconder pacientes com exceção
      if (!mostrarExcecao && temExcecao) return false;

      // Identificar regularizado: tinha faltas mas hoje status REGULAR e tem liberadas
      const regularizado = r.status_falta === 'REGULAR' && r.faltas_liberadas > 0;

      if (status === 'TODOS') {
        // Mostrar apenas FALTOSO/BLOQUEADO ou Regularizados/com exceção
        if (!['FALTOSO', 'BLOQUEADO'].includes(r.status_falta) && !regularizado && !temExcecao) return false;
      } else if (status === 'REGULARIZADO') {
        if (!regularizado) return false;
      } else if (r.status_falta !== status) return false;

      if (buscaLower && !r.nome?.toLowerCase().includes(buscaLower)) return false;
      if (dataInicio && (!r.ultima_falta || r.ultima_falta < dataInicio)) return false;
      if (dataFim && (!r.ultima_falta || r.ultima_falta > dataFim)) return false;
      return true;
    });
  }, [linhas, status, busca, dataInicio, dataFim, mostrarExcecao]);

  const abrirModal = (linha: Linha) => {
    setModalPaciente(linha);
    setMotivoLib('');
    setLiberarTodas(false);
    setModalOpen(true);
  };

  const submitLiberacao = async () => {
    if (!modalPaciente) return;
    if (!motivoLib.trim()) {
      toast.error('Informe o motivo da liberação.');
      return;
    }
    setSalvando(true);
    try {
      const { error } = await (supabase as any).rpc('liberar_falta', {
        p_paciente_id: modalPaciente.id,
        p_agendamento_id: null,
        p_session_id: null,
        p_motivo: motivoLib.trim(),
        p_user_id: user?.id || null,
        p_user_nome: user?.nome || null,
        p_all: liberarTodas,
      });
      if (error) throw error;
      toast.success(liberarTodas ? 'Faltas liberadas com sucesso.' : 'Falta liberada com sucesso.');
      setModalOpen(false);
      await fetchData();
    } catch (e: any) {
      console.error('[Faltosos] Erro na regra de faltas/exceção', {
        pacienteId: modalPaciente?.id,
        acao: 'liberar_falta',
        errorMessage: e?.message,
        errorDetails: e?.details,
        errorCode: e?.code,
      });
      toast.error('Não foi possível atualizar a regra de faltas deste paciente.');
    } finally {
      setSalvando(false);
    }
  };

  if (!canAccess) {
    return (
      <div className="p-10 text-center text-muted-foreground">
        Você não tem permissão para acessar esta página.
      </div>
    );
  }

  return (
    <div className="space-y-5 p-5">
      <PageHeader title="Pacientes Faltosos / Bloqueados" subtitle="Controle de faltas injustificadas por unidade" />

      <Card>
        <CardContent className="p-4 grid grid-cols-1 md:grid-cols-5 gap-3 items-end">
          <div>
            <Label className="text-xs">Status</Label>
            <Select value={status} onValueChange={(v) => setStatus(v as StatusFilter)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="TODOS">Todos</SelectItem>
                <SelectItem value="FALTOSO">Faltoso</SelectItem>
                <SelectItem value="BLOQUEADO">Bloqueado</SelectItem>
                <SelectItem value="REGULARIZADO">Regularizado</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs">Busca por nome</Label>
            <div className="relative">
              <Search className="w-4 h-4 absolute left-2 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <Input value={busca} onChange={(e) => setBusca(e.target.value)} className="pl-8" placeholder="Nome do paciente..." />
            </div>
          </div>
          <div>
            <Label className="text-xs">Última falta — de</Label>
            <Input type="date" value={dataInicio} onChange={(e) => setDataInicio(e.target.value)} />
          </div>
          <div>
            <Label className="text-xs">Até</Label>
            <Input type="date" value={dataFim} onChange={(e) => setDataFim(e.target.value)} />
          </div>
          <div className="flex items-center justify-between gap-2 h-9">
            <Label htmlFor="excecao" className="text-xs">Mostrar pacientes com exceção</Label>
            <Switch id="excecao" checked={mostrarExcecao} onCheckedChange={setMostrarExcecao} />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-0">
          {loading ? (
            <div className="flex items-center justify-center py-10 text-muted-foreground">
              <Loader2 className="w-5 h-5 animate-spin mr-2" /> Carregando...
            </div>
          ) : filtradas.length === 0 ? (
            <div className="py-10 text-center text-muted-foreground text-sm">Nenhum paciente encontrado.</div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Paciente</TableHead>
                  <TableHead className="w-32 text-center">Faltas Injustificadas</TableHead>
                  <TableHead className="w-32">Última Falta</TableHead>
                  <TableHead className="w-36">Status</TableHead>
                  <TableHead className="w-40 text-right">Ação</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtradas.map((r) => {
                  const excecao = getExcecaoLabel(r);
                  const regularizado = r.status_falta === 'REGULAR' && r.faltas_liberadas > 0;
                  return (
                    <TableRow key={r.id}>
                      <TableCell className="font-medium">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span>{r.nome}</span>
                          {excecao && (
                            <Badge variant="outline" className="border-blue-300 text-blue-700 bg-blue-50">
                              <ShieldCheck className="w-3 h-3 mr-1" />
                              {excecao}
                            </Badge>
                          )}
                        </div>
                        {r.motivo_excecao_bloqueio && excecao && (
                          <div className="text-[11px] text-muted-foreground mt-0.5 italic">
                            Motivo: {r.motivo_excecao_bloqueio}
                          </div>
                        )}
                      </TableCell>
                      <TableCell className="text-center">
                        <div>{r.faltas_injustificadas_ativas}</div>
                        {r.faltas_liberadas > 0 && (
                          <div className="text-[11px] text-muted-foreground">
                            ({r.faltas_liberadas} liberada{r.faltas_liberadas > 1 ? 's' : ''})
                          </div>
                        )}
                      </TableCell>
                      <TableCell>
                        {r.ultima_falta ? new Date(r.ultima_falta + 'T12:00:00').toLocaleDateString('pt-BR') : '—'}
                      </TableCell>
                      <TableCell>
                        {excecao ? (
                          <Badge className="bg-blue-100 text-blue-800 border border-blue-300 hover:bg-blue-100">
                            ISENTO
                          </Badge>
                        ) : regularizado ? (
                          <Badge className="bg-green-100 text-green-800 border border-green-300 hover:bg-green-100">
                            REGULARIZADO
                          </Badge>
                        ) : r.status_falta === 'BLOQUEADO' ? (
                          <Badge className="bg-red-100 text-red-800 border border-red-300 hover:bg-red-100">BLOQUEADO</Badge>
                        ) : r.status_falta === 'FALTOSO' ? (
                          <Badge className="bg-amber-100 text-amber-800 border border-amber-300 hover:bg-amber-100">FALTOSO</Badge>
                        ) : (
                          <Badge variant="outline">{r.status_falta || 'REGULAR'}</Badge>
                        )}
                      </TableCell>
                      <TableCell className="text-right">
                        {canUnblock && r.faltas_injustificadas_ativas > 0 ? (
                          <Button size="sm" variant="outline" onClick={() => abrirModal(r)}>
                            <Unlock className="w-4 h-4 mr-1" /> Liberar falta
                          </Button>
                        ) : (
                          <span className="text-xs text-muted-foreground">—</span>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Dialog open={modalOpen} onOpenChange={setModalOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Liberar / Regularizar falta</DialogTitle>
            <DialogDescription>
              A liberação não apaga o histórico. As faltas continuam visíveis, mas deixam de contar para bloqueio.
            </DialogDescription>
          </DialogHeader>
          {modalPaciente && (
            <div className="space-y-3 text-sm">
              <div className="grid grid-cols-2 gap-2 bg-muted/40 rounded p-3">
                <div>
                  <div className="text-xs text-muted-foreground">Paciente</div>
                  <div className="font-medium">{modalPaciente.nome}</div>
                </div>
                <div>
                  <div className="text-xs text-muted-foreground">Faltas injustificadas ativas</div>
                  <div className="font-medium">{modalPaciente.faltas_injustificadas_ativas}</div>
                </div>
                <div>
                  <div className="text-xs text-muted-foreground">Última falta</div>
                  <div className="font-medium">
                    {modalPaciente.ultima_falta
                      ? new Date(modalPaciente.ultima_falta + 'T12:00:00').toLocaleDateString('pt-BR')
                      : '—'}
                  </div>
                </div>
                <div>
                  <div className="text-xs text-muted-foreground">Status atual</div>
                  <div className="font-medium">{modalPaciente.status_falta}</div>
                </div>
              </div>

              <div>
                <Label className="text-xs">Motivo da liberação (obrigatório)</Label>
                <Textarea
                  value={motivoLib}
                  onChange={(e) => setMotivoLib(e.target.value)}
                  placeholder="Ex.: apresentou justificativa médica posterior, decisão administrativa..."
                  rows={3}
                />
              </div>

              {canLiberateAll && modalPaciente.faltas_injustificadas_ativas > 1 && (
                <div className="flex items-center gap-2">
                  <Checkbox
                    id="all"
                    checked={liberarTodas}
                    onCheckedChange={(v) => setLiberarTodas(v === true)}
                  />
                  <Label htmlFor="all" className="text-sm cursor-pointer">
                    Liberar todas as faltas injustificadas (Master)
                  </Label>
                </div>
              )}
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setModalOpen(false)} disabled={salvando}>
              Cancelar
            </Button>
            <Button onClick={submitLiberacao} disabled={salvando || !motivoLib.trim()}>
              {salvando ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Unlock className="w-4 h-4 mr-2" />}
              {liberarTodas ? 'Liberar todas' : 'Liberar última falta'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default Faltosos;
