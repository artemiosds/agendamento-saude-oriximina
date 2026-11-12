import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { Input } from '@/components/ui/input';
import { todayLocalStr } from '@/lib/utils';
import { usePacienteNomeResolver } from '@/hooks/usePacienteNomeResolver';
import { useOperacional } from '@/contexts/OperacionalContext';
import { useAuth } from '@/contexts/AuthContext';
import { usePermissions } from '@/contexts/PermissionsContext';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog';
import { Loader2, Clock, Trash2, Eye, CheckCircle2, Activity, Timer } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';

interface AtendimentoDB {
  id: string;
  paciente_id: string;
  paciente_nome: string;
  profissional_nome: string;
  unidade_id: string;
  setor: string;
  procedimento: string;
  data: string;
  hora_inicio: string;
  hora_fim: string;
  duracao_minutos: number | null;
  status: string;
}

const Atendimentos: React.FC = () => {
  const { user } = useAuth();
  const { can } = usePermissions();
  const { unidades, logAction } = useOperacional();
  const resolvePaciente = usePacienteNomeResolver();
  const [atendimentos, setAtendimentos] = useState<AtendimentoDB[]>([]);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();
  const [dataFiltro, setDataFiltro] = useState<string>(todayLocalStr());
  const canDelete = can('atendimento', 'can_delete');

  const load = async () => {
    setLoading(true);
    try {
      let query = (supabase as any).from('atendimentos').select('*').eq('data', dataFiltro).order('hora_inicio', { ascending: true });
      if (user?.role === 'profissional') query = query.eq('profissional_id', user.id);
      if (user?.unidadeId && user?.usuario !== 'admin.sms') query = query.eq('unidade_id', user.unidadeId);
      const { data } = await query;
      if (data) setAtendimentos(data);
    } catch (err) {
      console.error('Error:', err);
    }
    setLoading(false);
  };

  useEffect(() => {
    load();
  }, [user, dataFiltro]);

  const resumo = useMemo(() => {
    const fin = atendimentos.filter(a => a.status === 'finalizado');
    const dur = fin.map(a => a.duracao_minutos || 0).filter(n => n > 0);
    return { total: atendimentos.length, finalizados: fin.length, emCurso: atendimentos.length - fin.length, medio: dur.length ? Math.round(dur.reduce((x, y) => x + y, 0) / dur.length) : 0 };
  }, [atendimentos]);

  const verProntuario = (at: AtendimentoDB) => {
    const params = new URLSearchParams({ pacienteId: at.paciente_id, pacienteNome: resolvePaciente(at.paciente_id, at.paciente_nome) });
    navigate(`/painel/prontuario?${params.toString()}`);
  };

  const handleDelete = async (at: AtendimentoDB) => {
    try {
      await (supabase as any).from('atendimentos').delete().eq('id', at.id);
      await logAction({
        acao: 'excluir', entidade: 'atendimento', entidadeId: at.id,
        detalhes: { paciente: at.paciente_nome, profissional: at.profissional_nome },
        user,
      });
      setAtendimentos(prev => prev.filter(a => a.id !== at.id));
      toast.success('Atendimento excluído!');
    } catch (err) {
      console.error('Error deleting:', err);
      toast.error('Erro ao excluir atendimento.');
    }
  };

  return (
    <div className="space-y-4 animate-fade-in">
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold font-display text-foreground">Produtividade do Dia</h1>
          <p className="text-muted-foreground text-sm">Quem já foi atendido, em ordem de horário.</p>
        </div>
        <div className="space-y-1">
          <label className="text-xs text-muted-foreground">Data</label>
          <Input type="date" value={dataFiltro} onChange={e => e.target.value && setDataFiltro(e.target.value)} className="w-44" />
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { label: 'Total', value: resumo.total, icon: Activity },
          { label: 'Finalizados', value: resumo.finalizados, icon: CheckCircle2 },
          { label: 'Em atendimento', value: resumo.emCurso, icon: Clock },
          { label: 'Tempo médio', value: resumo.medio ? `${resumo.medio} min` : '—', icon: Timer },
        ].map(k => (
          <Card key={k.label} className="shadow-card border-0">
            <CardContent className="p-4 flex items-center gap-3">
              <k.icon className="w-5 h-5 text-primary" />
              <div><p className="text-xs text-muted-foreground">{k.label}</p><p className="text-lg font-bold text-foreground">{k.value}</p></div>
            </CardContent>
          </Card>
        ))}
      </div>

      {loading ? (
        <div className="flex justify-center py-12"><Loader2 className="w-8 h-8 animate-spin text-primary" /></div>
      ) : atendimentos.length === 0 ? (
        <Card className="shadow-card border-0">
          <CardContent className="p-8 text-center text-muted-foreground">Nenhum atendimento registrado nesta data.</CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {atendimentos.map(at => {
            const unidadeNome = unidades.find(u => u.id === at.unidade_id)?.nome || '';
            return (
              <Card key={at.id} className="shadow-card border-0">
                <CardContent className="p-4 flex flex-col sm:flex-row items-start sm:items-center gap-3">
                  <span className="text-sm font-mono font-medium text-primary w-28 shrink-0">
                    {at.hora_inicio?.slice(0, 5) || '--:--'}{at.hora_fim ? ` – ${at.hora_fim.slice(0, 5)}` : ''}
                  </span>
                  <div className="flex-1">
                    <p className="font-semibold text-foreground">{resolvePaciente(at.paciente_id, at.paciente_nome)}</p>
                    <p className="text-sm text-muted-foreground">{at.profissional_nome} • {at.procedimento}</p>
                    {unidadeNome && <p className="text-xs text-muted-foreground">{unidadeNome}</p>}
                  </div>
                  <div className="flex items-center gap-2">
                    <span className={cn("text-xs px-2 py-1 rounded-full font-medium",
                      at.status === 'finalizado' ? 'bg-success/10 text-success' : 'bg-primary/10 text-primary'
                    )}>
                      {at.status === 'finalizado' ? 'Finalizado' : 'Em Atendimento'}
                    </span>
                    {at.duracao_minutos && (
                      <span className="text-xs text-muted-foreground flex items-center gap-1">
                        <Clock className="w-3 h-3" />{at.duracao_minutos}min
                      </span>
                    )}
                    <Button size="sm" variant="outline" className="h-8 gap-1" onClick={() => verProntuario(at)}>
                      <Eye className="w-4 h-4" />Prontuário
                    </Button>
                    {canDelete && (
                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <Button size="sm" variant="ghost" className="h-8 w-8 p-0 text-destructive">
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                          <AlertDialogHeader>
                            <AlertDialogTitle>Excluir atendimento?</AlertDialogTitle>
                            <AlertDialogDescription>
                              Excluir o atendimento de {resolvePaciente(at.paciente_id, at.paciente_nome)}? Esta ação será registrada em log.
                            </AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel>Cancelar</AlertDialogCancel>
                            <AlertDialogAction onClick={() => handleDelete(at)} className="bg-destructive text-destructive-foreground">Excluir</AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                    )}
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default Atendimentos;
