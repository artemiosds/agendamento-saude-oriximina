import React, { useState, useEffect, useMemo, useCallback, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Loader2, FileText, ChevronDown, ChevronUp, Activity, AlertTriangle, RefreshCw } from "lucide-react";

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

// Helpers
function safeData<T>(result: { data: T | null; error: any }, context: string): T {
  if (result.error) {
    console.error(`[Historico] Erro em ${context}:`, result.error);
    return [] as unknown as T;
  }
  return result.data ?? ([] as unknown as T);
}

function formatDateBR(isoDate: string): string {
  return new Date(`${isoDate}T12:00:00`).toLocaleDateString("pt-BR");
}

export const HistoricoClinico: React.FC<Props> = ({ pacienteId, pacienteNome, currentProfissionalId, unidades }) => {
  const [prontuarios, setProntuarios] = useState<ProntuarioItem[]>([]);
  const [episodios, setEpisodios] = useState<EpisodioItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const cancelledRef = useRef(false);

  const loadData = useCallback(async () => {
    if (!pacienteId) {
      setProntuarios([]);
      setEpisodios([]);
      setLoading(false);
      return;
    }

    cancelledRef.current = false;
    setLoading(true);
    setError(null);

    try {
      const [{ data: pData, error: pError }, { data: eData, error: eError }] = await Promise.all([
        supabase
          .from("prontuarios")
          .select(
            "id,data_atendimento,hora_atendimento,profissional_nome,profissional_id,queixa_principal,evolucao,conduta,indicacao_retorno,procedimentos_texto,outro_procedimento,unidade_id,episodio_id",
          )
          .eq("paciente_id", pacienteId)
          .order("data_atendimento", { ascending: false }),
        supabase
          .from("episodios_clinicos")
          .select("*")
          .eq("paciente_id", pacienteId)
          .order("data_inicio", { ascending: false }),
      ]);

      if (cancelledRef.current) return;

      if (pError) throw pError;
      if (eError) throw eError;

      setProntuarios(pData || []);
      setEpisodios(eData || []);
    } catch (err) {
      console.error("[Historico] Erro inesperado:", err);
      if (!cancelledRef.current) {
        setError("Erro ao carregar histórico. Tente novamente.");
      }
    } finally {
      if (!cancelledRef.current) {
        setLoading(false);
      }
    }
  }, [pacienteId]);

  useEffect(() => {
    loadData();
    return () => {
      cancelledRef.current = true;
    };
  }, [loadData]);

  // Mapa de unidades (O(1) lookup)
  const unidadeMap = useMemo(() => new Map(unidades.map((u) => [u.id, u.nome])), [unidades]);

  const episodioMap = useMemo(() => new Map(episodios.map((e) => [e.id, e])), [episodios]);

  const timeline = useMemo(() => {
    return prontuarios.map((p) => ({
      ...p,
      unidadeNome: unidadeMap.get(p.unidade_id) || "",
      episodioTitulo: episodioMap.get(p.episodio_id || "")?.titulo || "",
    }));
  }, [prontuarios, unidadeMap, episodioMap]);

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-10 gap-2">
        <Loader2 className="w-6 h-6 animate-spin text-primary" />
        <p className="text-xs text-muted-foreground">Carregando histórico...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center py-10 gap-3">
        <AlertTriangle className="w-8 h-8 text-destructive/60" />
        <p className="text-sm text-destructive text-center">{error}</p>
        <Button variant="outline" size="sm" onClick={() => loadData()} className="gap-2">
          <RefreshCw className="w-3.5 h-3.5" />
          Tentar novamente
        </Button>
      </div>
    );
  }

  const activeEpisodios = episodios.filter((e) => e.status === "ativo");

  return (
    <div className="space-y-4">
      {/* Tratamentos ativos */}
      {activeEpisodios.length > 0 && (
        <div className="space-y-2">
          <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
            <Activity className="w-4 h-4 text-primary" /> Tratamentos Ativos
          </h3>
          {activeEpisodios.map((ep) => {
            const sessoes = prontuarios.filter((p) => p.episodio_id === ep.id).length;
            return (
              <Card key={ep.id} className="border-primary/20 bg-primary/5">
                <CardContent className="p-3">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="font-semibold text-sm text-foreground">{ep.titulo}</p>
                      <p className="text-xs text-muted-foreground">
                        {ep.profissional_nome} • Início:{" "}
                        {new Date(ep.data_inicio + "T12:00:00").toLocaleDateString("pt-BR")}
                      </p>
                    </div>
                    <Badge variant="outline" className="text-xs">
                      {sessoes} sessão(ões)
                    </Badge>
                  </div>
                  {ep.descricao && <p className="text-xs text-muted-foreground mt-1">{ep.descricao}</p>}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* Timeline */}
      <div className="space-y-2">
        <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
          <FileText className="w-4 h-4 text-muted-foreground" /> Linha do Tempo ({timeline.length} registro(s))
        </h3>
        {timeline.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-6 gap-2">
            <FileText className="w-8 h-8 text-muted-foreground/40" />
            <p className="text-sm text-muted-foreground text-center">Nenhum atendimento registrado.</p>
          </div>
        ) : (
          <ScrollArea className="max-h-[400px]">
            <div className="relative pl-6 space-y-3">
              <div className="absolute left-2 top-2 bottom-2 w-px bg-border" aria-hidden="true" />
              {timeline.map((item) => {
                const isOwn = item.profissional_id === currentProfissionalId;
                const expanded = expandedId === item.id;
                return (
                  <div key={item.id} className="relative">
                    <div className="absolute -left-4 top-2 w-3 h-3 rounded-full bg-primary border-2 border-background" />
                    <Card className="border-0 shadow-sm hover:shadow-md transition-shadow">
                      <CardContent className="p-3">
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <time className="text-xs font-bold text-primary" dateTime={item.data_atendimento}>
                                {formatDateBR(item.data_atendimento)}
                              </time>
                              {item.hora_atendimento && (
                                <span className="text-xs text-muted-foreground">{item.hora_atendimento}</span>
                              )}
                              {item.episodioTitulo && (
                                <Badge variant="outline" className="text-[10px]">
                                  {item.episodioTitulo}
                                </Badge>
                              )}
                            </div>
                            <p className="text-sm text-foreground mt-0.5">
                              {item.profissional_nome}
                              {isOwn && <span className="text-xs text-primary ml-1">(você)</span>}
                            </p>
                            {item.unidadeNome && <p className="text-xs text-muted-foreground">{item.unidadeNome}</p>}
                            {item.procedimentos_texto && (
                              <p className="text-xs text-muted-foreground mt-1">
                                <strong>Procedimentos:</strong> {item.procedimentos_texto}
                              </p>
                            )}
                            {item.queixa_principal && !expanded && (
                              <p className="text-xs text-muted-foreground mt-1 line-clamp-1">
                                QP: {item.queixa_principal}
                              </p>
                            )}
                          </div>
                          {item.queixa_principal && (
                            <Button
                              size="sm"
                              variant="ghost"
                              className="h-6 w-6 p-0 shrink-0"
                              onClick={() => setExpandedId(expanded ? null : item.id)}
                              aria-label={expanded ? "Recolher" : "Expandir"}
                              aria-expanded={expanded}
                            >
                              {expanded ? (
                                <ChevronUp className="w-3.5 h-3.5" />
                              ) : (
                                <ChevronDown className="w-3.5 h-3.5" />
                              )}
                            </Button>
                          )}
                        </div>
                        {expanded && (
                          <div className="mt-2 space-y-1 text-xs border-t pt-2">
                            {item.queixa_principal && (
                              <p>
                                <strong>Queixa:</strong> {item.queixa_principal}
                              </p>
                            )}
                            {item.evolucao && (
                              <p>
                                <strong>Evolução:</strong> {item.evolucao}
                              </p>
                            )}
                            {item.conduta && (
                              <p>
                                <strong>Conduta:</strong> {item.conduta}
                              </p>
                            )}
                            {item.outro_procedimento && (
                              <p>
                                <strong>Outro procedimento:</strong> {item.outro_procedimento}
                              </p>
                            )}
                            {item.indicacao_retorno && (
                              <p>
                                <strong>Retorno:</strong> {item.indicacao_retorno}
                              </p>
                            )}
                            {!isOwn && (
                              <p className="text-warning italic mt-1">
                                Prontuário de outro profissional (somente leitura)
                              </p>
                            )}
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
    </div>
  );
};
