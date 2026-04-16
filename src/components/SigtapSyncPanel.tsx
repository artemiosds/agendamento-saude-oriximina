import React, { useState, useEffect, useCallback } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { CheckCircle2, AlertCircle, Database } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import SigtapZipImport from '@/components/SigtapZipImport';

interface SyncResult {
  especialidade: string;
  procedimentos: number;
  cids: number;
  error?: string;
}

interface SyncHistory {
  id: string;
  tipo: string;
  competencia: string;
  total_procedimentos: number;
  total_cids: number;
  importado_em: string;
  detalhes: SyncResult[];
}

const formatCompetencia = (c: string) => {
  if (!c || c.length < 6) return c;
  return `${c.substring(4, 6)}/${c.substring(0, 4)}`;
};

const tipoLabel = (tipo: string) => {
  if (tipo.includes('github')) return 'GitHub';
  if (tipo.includes('upload') || tipo.includes('zip')) return 'Upload ZIP';
  if (tipo.includes('datasus')) return 'DATASUS (legado)';
  return 'Manual';
};

const SigtapSyncPanel: React.FC = () => {
  const [history, setHistory] = useState<SyncHistory[]>([]);

  const loadHistory = useCallback(async () => {
    const { data } = await (supabase as any)
      .from('pts_import_log')
      .select('*')
      .order('importado_em', { ascending: false })
      .limit(15);
    if (data) setHistory(data);
  }, []);

  useEffect(() => { loadHistory(); }, [loadHistory]);

  // Refresh history every 30s while on this page (so users see new imports)
  useEffect(() => {
    const interval = setInterval(loadHistory, 30000);
    return () => clearInterval(interval);
  }, [loadHistory]);

  const lastSync = history[0];

  return (
    <div className="space-y-4">
      {/* Status header */}
      <Card className="shadow-card border-0">
        <CardContent className="p-5">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
              <Database className="w-5 h-5 text-primary" />
            </div>
            <div>
              <h3 className="font-semibold text-base">Tabela SIGTAP — Procedimentos e CIDs</h3>
              <p className="text-xs text-muted-foreground">
                Importação local sem dependência da API do DATASUS
              </p>
            </div>
          </div>
          <div className="flex flex-wrap gap-4 text-sm">
            <div>
              <span className="text-muted-foreground">Última importação: </span>
              <span className="font-medium">
                {lastSync ? new Date(lastSync.importado_em).toLocaleString('pt-BR') : 'Nunca'}
              </span>
            </div>
            {lastSync ? (
              <>
                <div>
                  <span className="text-muted-foreground">Competência: </span>
                  <span className="font-medium">{formatCompetencia(lastSync.competencia)}</span>
                </div>
                <Badge variant="outline" className="text-green-600 border-green-300">
                  <CheckCircle2 className="w-3 h-3 mr-1" /> Importado
                </Badge>
              </>
            ) : (
              <Badge variant="outline" className="text-amber-600 border-amber-300">
                <AlertCircle className="w-3 h-3 mr-1" /> Aguardando importação
              </Badge>
            )}
          </div>
        </CardContent>
      </Card>

      {/* New importer (GitHub + Upload) */}
      <SigtapZipImport />

      {/* History */}
      {history.length > 0 && (
        <Card className="shadow-card border-0">
          <CardContent className="p-5">
            <h4 className="font-semibold text-sm mb-3">Histórico de importações</h4>
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-xs">Data/Hora</TableHead>
                    <TableHead className="text-xs">Competência</TableHead>
                    <TableHead className="text-xs">Procedimentos</TableHead>
                    <TableHead className="text-xs">CIDs</TableHead>
                    <TableHead className="text-xs">Origem</TableHead>
                    <TableHead className="text-xs">Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {history.map(h => (
                    <TableRow key={h.id}>
                      <TableCell className="text-xs">{new Date(h.importado_em).toLocaleString('pt-BR')}</TableCell>
                      <TableCell className="text-xs">{formatCompetencia(h.competencia)}</TableCell>
                      <TableCell className="text-xs">{h.total_procedimentos.toLocaleString('pt-BR')}</TableCell>
                      <TableCell className="text-xs">{h.total_cids.toLocaleString('pt-BR')}</TableCell>
                      <TableCell className="text-xs">
                        <Badge variant="outline" className="text-xs">{tipoLabel(h.tipo)}</Badge>
                      </TableCell>
                      <TableCell className="text-xs">
                        {h.total_procedimentos > 0 ? (
                          <Badge variant="outline" className="text-green-600 border-green-300 text-xs">✅ Sucesso</Badge>
                        ) : (
                          <Badge variant="outline" className="text-amber-600 border-amber-300 text-xs">⚠️ Vazio</Badge>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
};

export default SigtapSyncPanel;
