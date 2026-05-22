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
import { Loader2, Unlock, Search, ShieldCheck, User } from 'lucide-react';
import { toast } from 'sonner';
import { PageHeader } from '@/components/ui/page-header';
import { getExcecaoLabel } from '@/lib/faltasUtils';

type StatusFilter = 'TODOS' | 'FALTOSO' | 'BLOQUEADO' | 'REGULARIZADO';

interface Linha {
  id: string; // paciente_id|profissional_id
  paciente_id: string;
  paciente_nome: string;
  profissional_id: string;
  profissional_nome: string;
  unidade_id: string | null;
  total_faltas: number;
  status_falta: string;
  ultima_falta: string | null;
  is_tfd: boolean;
  possui_ordem_judicial: boolean;
  motivo_excecao_bloqueio?: string | null;
}

const Faltosos: React.FC = () => {
  const { user, isGlobalAdmin } = useAuth();
  const role = (user?.role || '').toLowerCase();
  const canUnblock = role === 'master' || role === 'gestor' || role === 'admin' || isGlobalAdmin;
  const canAccess = ['master', 'gestor', 'admin', 'coordenador', 'recepcao'].includes(role) || isGlobalAdmin;

  const [loading, setLoading] = useState(true);
  const [linhas, setLinhas] = useState<Linha[]>([]);
  const [status, setStatus] = useState<StatusFilter>('TODOS');
  const [busca, setBusca] = useState('');
  const [filterProf, setFilterProf] = useState('all');
  const [dataInicio, setDataInicio] = useState('');
  const [dataFim, setDataFim] = useState('');
  const [mostrarExcecao, setMostrarExcecao] = useState(false);

  // Modal de liberação
  const [modalOpen, setModalOpen] = useState(false);
  const [modalLinha, setModalLinha] = useState<Linha | null>(null);
  const [motivoLib, setMotivoLib] = useState('');
  const [salvando, setSalvando] = useState(false);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('paciente_profissional_status')
        .select(`
          paciente_id,
          profissional_id,
          total_faltas,
          status_falta,
          ultima_falta,
          pacientes:paciente_id (
            nome, is_tfd, possui_ordem_judicial, motivo_excecao_bloqueio, unidade_id
          ),
          funcionarios:profissional_id (
            nome
          )
        `);

      if (error) throw error;

      const userUnit = user?.unidadeId;
      const isolar = !!userUnit && user?.usuario !== 'admin.sms';

      let rows: Linha[] = (data || []).map((item: any) => ({
        id: `${item.paciente_id}|${item.profissional_id}`,
        paciente_id: item.paciente_id,
        paciente_nome: item.pacientes?.nome || 'Paciente não encontrado',
        profissional_id: item.profissional_id,
        profissional_nome: item.funcionarios?.nome || 'Profissional não encontrado',
        unidade_id: item.pacientes?.unidade_id || null,
        total_faltas: item.total_faltas || 0,
        status_falta: item.status_falta,
        ultima_falta: item.ultima_falta,
        is_tfd: item.pacientes?.is_tfd === true,
        possui_ordem_judicial: item.pacientes?.possui_ordem_judicial === true,
        motivo_excecao_bloqueio: item.pacientes?.motivo_excecao_bloqueio,
      }));

      if (isolar) {
        rows = rows.filter((r) => r.unidade_id === userUnit);
      }

      setLinhas(rows);
    } catch (e: any) {
      console.error('[Faltosos] Erro ao carregar dados', e);
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
    const profLower = filterProf === 'all' ? '' : filterProf;

    return linhas.filter((r) => {
      const temExcecao = r.is_tfd || r.possui_ordem_judicial;
      if (!mostrarExcecao && temExcecao) return false;

      const regularizado = r.status_falta === 'REGULAR' && r.total_faltas === 0;

      if (status === 'TODOS') {
        // Mostrar faltosos ou bloqueados, a menos que mostrarExcecao esteja ativo (que já inclui isentos)
        if (!['FALTOSO', 'BLOQUEADO'].includes(r.status_falta) && !temExcecao) return false;
      } else if (status === 'REGULARIZADO') {
        if (!regularizado) return false;
      } else if (r.status_falta !== status) return false;

      if (buscaLower && !r.paciente_nome?.toLowerCase().includes(buscaLower)) return false;
      if (profLower && r.profissional_id !== profLower) return false;
      if (dataInicio && (!r.ultima_falta || r.ultima_falta < dataInicio)) return false;
      if (dataFim && (!r.ultima_falta || r.ultima_falta > dataFim)) return false;
      return true;
    });
  }, [linhas, status, busca, filterProf, dataInicio, dataFim, mostrarExcecao]);

  const uniqueProfs = useMemo(() => {
    const map = new Map();
    linhas.forEach(r => map.set(r.profissional_id, r.profissional_nome));
    return Array.from(map.entries()).sort((a, b) => a[1].localeCompare(b[1]));
  }, [linhas]);

  const abrirModal = (linha: Linha) => {
    setModalLinha(linha);
    setMotivoLib('');
    setModalOpen(true);
  };

  const submitLiberacao = async () => {
    if (!modalLinha) return;
    if (!motivoLib.trim()) {
      toast.error('Informe o motivo da liberação.');
      return;
    }
    setSalvando(true);
    try {
      const { error } = await (supabase as any).rpc('liberar_falta', {
        p_paciente_id: modalLinha.paciente_id,
        p_profissional_id: modalLinha.profissional_id,
        p_motivo: motivoLib.trim(),
        p_user_id: user?.id || null,
        p_user_nome: user?.nome || null,
        p_all: true,
      });
      if (error) throw error;
      toast.success('Faltas regularizadas para este profissional.');
      setModalOpen(false);
      await fetchData();
    } catch (e: any) {
      console.error('[Faltosos] Erro ao liberar falta', e);
      toast.error('Não foi possível regularizar as faltas.');
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
      <PageHeader title="Pacientes Faltosos / Bloqueados" subtitle="Controle de faltas injustificadas por vínculo Profissional + Paciente" />

      <Card>
        <CardContent className="p-4 grid grid-cols-1 md:grid-cols-6 gap-3 items-end">
          <div className="md:col-span-1">
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
          <div className="md:col-span-1">
            <Label className="text-xs">Profissional</Label>
            <Select value={filterProf} onValueChange={setFilterProf}>
              <SelectTrigger><SelectValue placeholder="Filtrar Profissional" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos os Profissionais</SelectItem>
                {uniqueProfs.map(([id, nome]) => (
                  <SelectItem key={id} value={id}>{nome}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="md:col-span-1">
            <Label className="text-xs">Paciente</Label>
            <div className="relative">
              <Search className="w-4 h-4 absolute left-2 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <Input value={busca} onChange={(e) => setBusca(e.target.value)} className="pl-8" placeholder="Nome..." />
            </div>
          </div>
          <div>
            <Label className="text-xs">Desde</Label>
            <Input type="date" value={dataInicio} onChange={(e) => setDataInicio(e.target.value)} />
          </div>
          <div>
            <Label className="text-xs">Até</Label>
            <Input type="date" value={dataFim} onChange={(e) => setDataFim(e.target.value)} />
          </div>
          <div className="flex items-center justify-between gap-2 h-9 border rounded-md px-2">
            <Label htmlFor="excecao" className="text-[10px] leading-tight">Exceções (TFD/OJ)</Label>
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
            <div className="py-10 text-center text-muted-foreground text-sm">Nenhum registro encontrado para os filtros aplicados.</div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Paciente</TableHead>
                  <TableHead>Profissional</TableHead>
                  <TableHead className="w-32 text-center">Faltas</TableHead>
                  <TableHead className="w-32">Última Falta</TableHead>
                  <TableHead className="w-36">Status</TableHead>
                  <TableHead className="w-40 text-right">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtradas.map((r) => {
                  const excecao = getExcecaoLabel(r);
                  return (
                    <TableRow key={r.id}>
                      <TableCell className="font-medium">
                        <div className="flex flex-col">
                          <span className="flex items-center gap-2">
                            {r.paciente_nome}
                            {excecao && (
                              <Badge variant="outline" className="border-blue-300 text-blue-700 bg-blue-50 py-0 text-[10px]">
                                <ShieldCheck className="w-3 h-3 mr-1" /> {excecao}
                              </Badge>
                            )}
                          </span>
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center text-xs text-muted-foreground">
                          <User className="w-3 h-3 mr-1" /> {r.profissional_nome}
                        </div>
                      </TableCell>
                      <TableCell className="text-center font-bold">
                        {r.total_faltas}
                      </TableCell>
                      <TableCell className="text-xs">
                        {r.ultima_falta ? new Date(r.ultima_falta + 'T12:00:00').toLocaleDateString('pt-BR') : '—'}
                      </TableCell>
                      <TableCell>
                        {excecao ? (
                          <Badge className="bg-blue-100 text-blue-800 border-blue-200">ISENTO</Badge>
                        ) : r.status_falta === 'BLOQUEADO' ? (
                          <Badge className="bg-red-100 text-red-800 border-red-200">BLOQUEADO</Badge>
                        ) : r.status_falta === 'FALTOSO' ? (
                          <Badge className="bg-amber-100 text-amber-800 border-amber-200">FALTOSO</Badge>
                        ) : (
                          <Badge variant="outline">REGULAR</Badge>
                        )}
                      </TableCell>
                      <TableCell className="text-right">
                        {canUnblock && r.total_faltas > 0 ? (
                          <Button size="sm" variant="outline" onClick={() => abrirModal(r)}>
                            <Unlock className="w-4 h-4 mr-1" /> Regularizar
                          </Button>
                        ) : '—'}
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
            <DialogTitle>Regularizar Faltas por Profissional</DialogTitle>
            <DialogDescription>
              A regularização impacta apenas o vínculo do paciente com este profissional.
            </DialogDescription>
          </DialogHeader>
          {modalLinha && (
            <div className="space-y-4">
              <div className="bg-muted/50 p-4 rounded-lg space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Paciente:</span>
                  <span className="font-semibold">{modalLinha.paciente_nome}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Profissional:</span>
                  <span className="font-semibold">{modalLinha.profissional_nome}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Faltas Injustificadas:</span>
                  <span className="font-bold text-red-600">{modalLinha.total_faltas}</span>
                </div>
              </div>

              <div className="space-y-2">
                <Label>Motivo da Regularização (obrigatório)</Label>
                <Textarea 
                  value={motivoLib} 
                  onChange={(e) => setMotivoLib(e.target.value)}
                  placeholder="Justificativa administrativa para liberar o agendamento..."
                  rows={3}
                />
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setModalOpen(false)} disabled={salvando}>Cancelar</Button>
            <Button onClick={submitLiberacao} disabled={salvando || !motivoLib.trim()}>
              {salvando ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Unlock className="w-4 h-4 mr-2" />}
              Confirmar Regularização
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default Faltosos;