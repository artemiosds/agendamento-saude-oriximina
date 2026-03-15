import React, { useState, useEffect, useMemo } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Loader2, FileText, ChevronDown, ChevronUp, Activity } from 'lucide-react';

interface ProntuarioItem {
  id: string;
  data_atendimento: string;
  hora_atendimento: string;
  profissional_nome: string;
  profissional_id: string;
  queixa_principal: string;
  evolucao: string;
  conduta: string;
  indicacao_retorno: string;
  procedimentos_texto: string;
  outro_procedimento: string;
  unidade_id: string;
  episodio_id: string | null;
}

interface EpisodioItem {
  id: string;
  titulo: string;
  tipo: string;
  status: string;
  data_inicio: string;
  data_fim: string | null;
  profissional_nome: string;
  descricao: string;
}

interface Props {
  pacienteId: string;
  pacienteNome: string;
  currentProfissionalId?: string;
  unidades: { id: string; nome: string }[];
}

export const HistoricoClinico: React.FC<Props> = ({ pacienteId, pacienteNome, currentProfissionalId, unidades }) => {
  const [prontuarios, setProntuarios] = useState<ProntuarioItem[]>([]);
  const [episodios, setEpisodios] = useState<EpisodioItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  useEffect(() => {
    if (!pacienteId) return;
    const load = async () => {
      setLoading(true);
      const [{ data: pData }, { data: eData }] = await Promise.all([
        (supabase as any).from('prontuarios')
          .select('id,data_atendimento,hora_atendimento,profissional_nome,profissional_id,queixa_principal,evolucao,conduta,indicacao_retorno,procedimentos_texto,outro_procedimento,unidade_id,episodio_id')
          .eq('paciente_id', pacienteId)
          .order('data_atendimento', { ascending: false }),
        (supabase as any).from('episodios_clinicos')
          .select('*')
          .eq('paciente_id', pacienteId)
          .order('data_inicio', { ascending: false }),
      ]);
      if (pData) setProntuarios(pData);
      if (eData) setEpisodios(eData);
      setLoading(false);
    };
    load();
  }, [pacienteId]);

  const timeline = useMemo(() => {
    return prontuarios.map(p => {
      const unidade = unidades.find(u => u.id === p.unidade_id);
      const episodio = episodios.find(e => e.id === p.episodio_id);
      return { ...p, unidadeNome: unidade?.nome || '', episodioTitulo: episodio?.titulo || '' };
    });
  }, [prontuarios, unidades, episodios]);

  if (loading) return <div className="flex justify-center py-6"><Loader2 className="w-6 h-6 animate-spin text-primary" /></div>;

  return (
    <div className="space-y-4">
      {/* Active Episodes */}
      {episodios.filter(e => e.status === 'ativo').length > 0 && (
        <div className="space-y-2">
          <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
            <Activity className="w-4 h-4 text-primary" /> Tratamentos Ativos
          </h3>
          {episodios.filter(e => e.status === 'ativo').map(ep => {
            const sessoes = prontuarios.filter(p => p.episodio_id === ep.id).length;
            return (
              <Card key={ep.id} className="border-primary/20 bg-primary/5">
                <CardContent className="p-3">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="font-semibold text-sm text-foreground">{ep.titulo}</p>
                      <p className="text-xs text-muted-foreground">{ep.profissional_nome} • Início: {new Date(ep.data_inicio + 'T12:00:00').toLocaleDateString('pt-BR')}</p>
                    </div>
                    <Badge variant="outline" className="text-xs">{sessoes} sessão(ões)</Badge>
                  </div>
                  {ep.descricao && <p className="text-xs text-muted-foreground mt-1">{ep.descricao}</p>}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* Timeline */}
      <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
        <FileText className="w-4 h-4 text-muted-foreground" /> Linha do Tempo ({timeline.length} registro(s))
      </h3>
      {timeline.length === 0 ? (
        <p className="text-sm text-muted-foreground text-center py-4">Nenhum atendimento registrado.</p>
      ) : (
        <ScrollArea className="max-h-[400px]">
          <div className="relative pl-6 space-y-3">
            <div className="absolute left-2 top-2 bottom-2 w-px bg-border" />
            {timeline.map(item => {
              const isOwn = item.profissional_id === currentProfissionalId;
              const expanded = expandedId === item.id;
              return (
                <div key={item.id} className="relative">
                  <div className="absolute -left-4 top-2 w-3 h-3 rounded-full bg-primary border-2 border-background" />
                  <Card className="border-0 shadow-sm">
                    <CardContent className="p-3">
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-xs font-semibold text-primary">
                              {new Date(item.data_atendimento + 'T12:00:00').toLocaleDateString('pt-BR')}
                            </span>
                            {item.hora_atendimento && <span className="text-xs text-muted-foreground">{item.hora_atendimento}</span>}
                            {item.episodioTitulo && <Badge variant="outline" className="text-[10px]">{item.episodioTitulo}</Badge>}
                          </div>
                          <p className="text-sm text-foreground mt-0.5">{item.profissional_nome}</p>
                          {item.unidadeNome && <p className="text-xs text-muted-foreground">{item.unidadeNome}</p>}
                          {item.procedimentos_texto && (
                            <p className="text-xs text-muted-foreground mt-1">
                              <strong>Procedimentos:</strong> {item.procedimentos_texto}
                            </p>
                          )}
                          {item.queixa_principal && !expanded && (
                            <p className="text-xs text-muted-foreground mt-1 line-clamp-1">QP: {item.queixa_principal}</p>
                          )}
                        </div>
                        <Button size="sm" variant="ghost" className="h-6 px-1" onClick={() => setExpandedId(expanded ? null : item.id)}>
                          {expanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                        </Button>
                      </div>
                      {expanded && (
                        <div className="mt-2 space-y-1 text-xs border-t pt-2">
                          {item.queixa_principal && <p><strong>Queixa:</strong> {item.queixa_principal}</p>}
                          {item.evolucao && <p><strong>Evolução:</strong> {item.evolucao}</p>}
                          {item.conduta && <p><strong>Conduta:</strong> {item.conduta}</p>}
                          {item.outro_procedimento && <p><strong>Outro procedimento:</strong> {item.outro_procedimento}</p>}
                          {item.indicacao_retorno && <p><strong>Retorno:</strong> {item.indicacao_retorno}</p>}
                          {!isOwn && <p className="text-warning italic mt-1">Prontuário de outro profissional (somente leitura)</p>}
                        </div>
                      )}
                    </CardContent>
                  </Card>
                </div>
              );
            })}
          </div>
        </ScrollArea>
      )}
    </div>
  );
};
