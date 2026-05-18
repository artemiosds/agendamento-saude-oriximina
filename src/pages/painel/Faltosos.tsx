import React, { useEffect, useMemo, useState, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  Table, TableHeader, TableBody, TableRow, TableHead, TableCell,
} from '@/components/ui/table';
import { Loader2, Unlock, Search } from 'lucide-react';
import { toast } from 'sonner';
import { PageHeader } from '@/components/ui/page-header';

type StatusFilter = 'TODOS' | 'FALTOSO' | 'BLOQUEADO';

interface Linha {
  id: string;
  nome: string;
  unidade_id: string | null;
  total_faltas: number;
  status_falta: string;
  ultima_falta: string | null;
}

const Faltosos: React.FC = () => {
  const { user, isGlobalAdmin } = useAuth();
  const role = (user?.role || '').toLowerCase();
  const canUnblock = role === 'master' || role === 'gestor';
  const canAccess = ['master', 'gestor', 'coordenador', 'recepcao'].includes(role) || isGlobalAdmin;

  const [loading, setLoading] = useState(true);
  const [linhas, setLinhas] = useState<Linha[]>([]);
  const [status, setStatus] = useState<StatusFilter>('TODOS');
  const [busca, setBusca] = useState('');
  const [dataInicio, setDataInicio] = useState('');
  const [dataFim, setDataFim] = useState('');

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      let query = supabase
        .from('pacientes')
        .select('id, nome, total_faltas, status_falta, custom_data')
        .in('status_falta', ['FALTOSO', 'BLOQUEADO'])
        .order('total_faltas', { ascending: false })
        .limit(500);

      const { data: pacientes } = await query;
      const ids = (pacientes || []).map((p: any) => p.id);

      // Buscar última falta por paciente (agendamentos)
      let ultimasMap: Record<string, string> = {};
      if (ids.length > 0) {
        const { data: ags } = await supabase
          .from('agendamentos')
          .select('paciente_id, data, hora, unidade_id, status')
          .in('paciente_id', ids)
          .eq('status', 'falta')
          .order('data', { ascending: false });
        (ags || []).forEach((a: any) => {
          if (!ultimasMap[a.paciente_id]) ultimasMap[a.paciente_id] = a.data;
        });
      }

      // Filtro por unidade (isolamento)
      const userUnit = user?.unidadeId;
      const isolar = !!userUnit && user?.usuario !== 'admin.sms';

      let unidadesPorPaciente: Record<string, string | null> = {};
      if (ids.length > 0) {
        const { data: agsUnit } = await supabase
          .from('agendamentos')
          .select('paciente_id, unidade_id, data')
          .in('paciente_id', ids)
          .order('data', { ascending: false });
        (agsUnit || []).forEach((a: any) => {
          if (!unidadesPorPaciente[a.paciente_id]) unidadesPorPaciente[a.paciente_id] = a.unidade_id;
        });
      }

      let rows: Linha[] = (pacientes || []).map((p: any) => ({
        id: p.id,
        nome: p.nome,
        total_faltas: p.total_faltas || 0,
        status_falta: p.status_falta,
        unidade_id: unidadesPorPaciente[p.id] || null,
        ultima_falta: ultimasMap[p.id] || null,
      }));

      if (isolar) rows = rows.filter((r) => r.unidade_id === userUnit);

      setLinhas(rows);
    } catch (e: any) {
      toast.error('Erro ao carregar lista: ' + (e?.message || ''));
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
      if (status !== 'TODOS' && r.status_falta !== status) return false;
      if (buscaLower && !r.nome?.toLowerCase().includes(buscaLower)) return false;
      if (dataInicio && (!r.ultima_falta || r.ultima_falta < dataInicio)) return false;
      if (dataFim && (!r.ultima_falta || r.ultima_falta > dataFim)) return false;
      return true;
    });
  }, [linhas, status, busca, dataInicio, dataFim]);

  const desbloquear = async (paciente_id: string, nome: string) => {
    if (!confirm(`Confirmar desbloqueio de ${nome}?`)) return;
    try {
      const { error } = await (supabase as any).rpc('desbloquear_paciente_faltas', {
        p_paciente_id: paciente_id,
        p_user_id: user?.id || null,
        p_user_nome: user?.nome || null,
      });
      if (error) throw error;
      toast.success('Paciente desbloqueado');
      fetchData();
    } catch (e: any) {
      toast.error('Erro ao desbloquear: ' + (e?.message || ''));
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
      <PageHeader title="Pacientes Faltosos / Bloqueados" subtitle="Controle de faltas por unidade" />

      <Card>
        <CardContent className="p-4 grid grid-cols-1 md:grid-cols-4 gap-3">
          <div>
            <Label className="text-xs">Status</Label>
            <Select value={status} onValueChange={(v) => setStatus(v as StatusFilter)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="TODOS">Todos</SelectItem>
                <SelectItem value="FALTOSO">FALTOSO</SelectItem>
                <SelectItem value="BLOQUEADO">BLOQUEADO</SelectItem>
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
                  <TableHead className="w-28 text-center">Total de Faltas</TableHead>
                  <TableHead className="w-32">Última Falta</TableHead>
                  <TableHead className="w-32">Status</TableHead>
                  <TableHead className="w-40 text-right">Ação</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtradas.map((r) => (
                  <TableRow key={r.id}>
                    <TableCell className="font-medium">{r.nome}</TableCell>
                    <TableCell className="text-center">{r.total_faltas}</TableCell>
                    <TableCell>
                      {r.ultima_falta ? new Date(r.ultima_falta + 'T12:00:00').toLocaleDateString('pt-BR') : '—'}
                    </TableCell>
                    <TableCell>
                      {r.status_falta === 'BLOQUEADO' ? (
                        <Badge className="bg-red-100 text-red-800 border border-red-300 hover:bg-red-100">BLOQUEADO</Badge>
                      ) : (
                        <Badge className="bg-amber-100 text-amber-800 border border-amber-300 hover:bg-amber-100">FALTOSO</Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      {canUnblock && r.status_falta === 'BLOQUEADO' ? (
                        <Button size="sm" variant="outline" onClick={() => desbloquear(r.id, r.nome)}>
                          <Unlock className="w-4 h-4 mr-1" /> Remover bloqueio
                        </Button>
                      ) : (
                        <span className="text-xs text-muted-foreground">—</span>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default Faltosos;
