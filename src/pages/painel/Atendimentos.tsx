import React, { useState, useEffect } from 'react';
import { useData } from '@/contexts/DataContext';
import { useAuth } from '@/contexts/AuthContext';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Loader2, Clock } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { cn } from '@/lib/utils';

interface AtendimentoDB {
  id: string;
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
  const { unidades } = useData();
  const [atendimentos, setAtendimentos] = useState<AtendimentoDB[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      try {
        let query = (supabase as any).from('atendimentos').select('*').order('data', { ascending: false });
        if (user?.role === 'profissional') query = query.eq('profissional_id', user.id);
        if (user?.role === 'coordenador' && user.unidadeId) query = query.eq('unidade_id', user.unidadeId);
        if (user?.role === 'recepcao' && user.unidadeId) query = query.eq('unidade_id', user.unidadeId);
        const { data } = await query;
        if (data) setAtendimentos(data);
      } catch (err) {
        console.error('Error:', err);
      }
      setLoading(false);
    };
    load();
  }, [user]);

  return (
    <div className="space-y-4 animate-fade-in">
      <div>
        <h1 className="text-2xl font-bold font-display text-foreground">Atendimentos</h1>
        <p className="text-muted-foreground text-sm">{atendimentos.length} registros</p>
      </div>

      {loading ? (
        <div className="flex justify-center py-12"><Loader2 className="w-8 h-8 animate-spin text-primary" /></div>
      ) : atendimentos.length === 0 ? (
        <Card className="shadow-card border-0">
          <CardContent className="p-8 text-center text-muted-foreground">Nenhum atendimento registrado.</CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {atendimentos.map(at => {
            const unidadeNome = unidades.find(u => u.id === at.unidade_id)?.nome || '';
            return (
              <Card key={at.id} className="shadow-card border-0">
                <CardContent className="p-4 flex flex-col sm:flex-row items-start sm:items-center gap-3">
                  <span className="text-sm font-mono font-medium text-primary w-24 shrink-0">
                    {at.data} {at.hora_inicio}
                  </span>
                  <div className="flex-1">
                    <p className="font-semibold text-foreground">{at.paciente_nome}</p>
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
