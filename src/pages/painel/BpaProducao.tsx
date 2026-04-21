import React, { useEffect, useMemo, useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useData } from '@/contexts/DataContext';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from '@/components/ui/dialog';
import {
  Select, SelectTrigger, SelectValue, SelectContent, SelectItem,
} from '@/components/ui/select';
import {
  Table, TableHeader, TableHead, TableRow, TableBody, TableCell,
} from '@/components/ui/table';
import {
  AlertCircle, CheckCircle2, Download, FileText, Loader2, RefreshCw,
} from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

interface AtendimentoRow {
  id: string;
  paciente_id: string;
  paciente_nome: string;
  profissional_id: string;
  profissional_nome: string;
  procedimento: string;
  data: string;
  unidade_id: string;
}

interface ValidationFlags {
  cns: boolean;
  cbo: boolean;
  sigtap: boolean;
  raca: boolean;
  nacionalidade: boolean;
}

const currentCompetencia = (): string => {
  const d = new Date();
  return `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}`;
};

const BpaProducao: React.FC = () => {
  const { user } = useAuth();
  const { unidades } = useData();
  const [atendimentos, setAtendimentos] = useState<AtendimentoRow[]>([]);
  const [pacMap, setPacMap] = useState<Record<string, { cns: string; cpf: string; data_nascimento: string; sexo: string; municipio: string; raca_cor: string; nacionalidade: string }>>({});
  const [profMap, setProfMap] = useState<Record<string, { cbo: string }>>({});
  const [loading, setLoading] = useState(false);
  const [competencia, setCompetencia] = useState<string>(currentCompetencia());
  const [unidadeFiltro, setUnidadeFiltro] = useState<string>(user?.unidadeId || 'all');

  // Modal state
  const [modalOpen, setModalOpen] = useState(false);
  const [modalCompetencia, setModalCompetencia] = useState<string>(currentCompetencia());
  const [modalUnidade, setModalUnidade] = useState<string>(user?.unidadeId || '');
  const [modalCnes, setModalCnes] = useState<string>('');
  const [generating, setGenerating] = useState(false);

  const ano = competencia.slice(0, 4);
  const mes = competencia.slice(4, 6);

  const load = async () => {
    if (!ano || !mes) return;
    setLoading(true);
    try {
      const dataInicio = `${ano}-${mes}-01`;
      const ultDia = new Date(Number(ano), Number(mes), 0).getDate();
      const dataFim = `${ano}-${mes}-${String(ultDia).padStart(2, '0')}`;

      let q = (supabase as any)
        .from('atendimentos')
        .select('id, paciente_id, paciente_nome, profissional_id, profissional_nome, procedimento, data, unidade_id')
        .gte('data', dataInicio)
        .lte('data', dataFim)
        .order('data', { ascending: false });
      if (unidadeFiltro && unidadeFiltro !== 'all') q = q.eq('unidade_id', unidadeFiltro);

      const { data: ats, error } = await q;
      if (error) throw error;
      const list = (ats || []) as AtendimentoRow[];
      setAtendimentos(list);

      const pacIds = [...new Set(list.map(a => a.paciente_id).filter(Boolean))];
      const profIds = [...new Set(list.map(a => a.profissional_id).filter(Boolean))];

      if (pacIds.length) {
        const { data: pacs } = await (supabase as any)
          .from('pacientes')
          .select('id, cpf, cns, data_nascimento, custom_data')
          .in('id', pacIds);
        const pm: typeof pacMap = {};
        (pacs || []).forEach((p: any) => {
          const cd = p.custom_data || {};
          pm[p.id] = {
            cns: p.cns || '',
            cpf: p.cpf || '',
            data_nascimento: p.data_nascimento || '',
            sexo: cd.sexo || '',
            municipio: cd.municipio || '',
            raca_cor: cd.raca_cor || cd.racaCor || '',
            nacionalidade: cd.nacionalidade || 'Brasileiro',
          };
        });
        setPacMap(pm);
      } else setPacMap({});

      if (profIds.length) {
        const { data: profs } = await (supabase as any)
          .from('funcionarios')
          .select('id, custom_data')
          .in('id', profIds);
        const pm: typeof profMap = {};
        (profs || []).forEach((f: any) => {
          pm[f.id] = { cbo: (f.custom_data || {}).cbo_codigo || '' };
        });
        setProfMap(pm);
      } else setProfMap({});
    } catch (err) {
      console.error('load bpa error', err);
      toast.error('Erro ao carregar atendimentos');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); /* eslint-disable-next-line */ }, [competencia, unidadeFiltro]);

  const validateRow = (at: AtendimentoRow): ValidationFlags => {
    const pac = pacMap[at.paciente_id];
    const prof = profMap[at.profissional_id];
    const cns = (pac?.cns || '').replace(/\D/g, '');
    const cbo = (prof?.cbo || '').replace(/\D/g, '');
    const sigtap = (at.procedimento || '').replace(/\D/g, '');
    return {
      cns: cns.length === 15,
      cbo: cbo.length > 0,
      sigtap: sigtap.length > 0,
      raca: !!(pac?.raca_cor && pac.raca_cor.length > 0),
      nacionalidade: !!(pac?.nacionalidade && pac.nacionalidade.length > 0),
    };
  };

  const stats = useMemo(() => {
    let validos = 0, pendentes = 0;
    atendimentos.forEach(a => {
      const v = validateRow(a);
      if (v.cns && v.cbo && v.sigtap && v.raca && v.nacionalidade) validos++; else pendentes++;
    });
    return { total: atendimentos.length, validos, pendentes };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [atendimentos, pacMap, profMap]);

  const openGenerateModal = () => {
    setModalCompetencia(competencia);
    setModalUnidade(unidadeFiltro !== 'all' ? unidadeFiltro : (user?.unidadeId || ''));
    setModalCnes('');
    setModalOpen(true);
  };

  const handleGenerate = async () => {
    if (modalCompetencia.length !== 6) {
      toast.error('Competência inválida (use AAAAMM)');
      return;
    }
    setGenerating(true);
    try {
      const { data, error } = await (supabase as any).functions.invoke('generate-bpa', {
        body: {
          competencia: modalCompetencia,
          unidade_id: modalUnidade || '',
          cnes: modalCnes || '',
        },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);

      // Download
      const blob = new Blob([data.conteudo], { type: 'text/plain;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = data.filename || `BPA_${modalCompetencia}.txt`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      toast.success(
        `BPA gerado com sucesso. ${data.total_exportados} atendimento(s) exportado(s).`,
        {
          description: data.total_pendentes > 0
            ? `${data.total_pendentes} atendimento(s) pendente(s) foram pulados.`
            : undefined,
          duration: 6000,
        },
      );
      setModalOpen(false);
    } catch (err: any) {
      console.error('generate error', err);
      toast.error('Erro ao gerar BPA: ' + (err?.message || 'desconhecido'));
    } finally {
      setGenerating(false);
    }
  };

  const unidadesOptions = unidades.filter(u => u.ativo !== false);

  return (
    <div className="space-y-4 animate-fade-in">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold font-display text-foreground flex items-center gap-2">
            <FileText className="w-6 h-6 text-primary" />
            BPA-Produção
          </h1>
          <p className="text-muted-foreground text-sm">
            Boletim de Produção Ambulatorial Individualizado (SIA/SUS)
          </p>
        </div>
        <Button onClick={openGenerateModal} className="bg-primary text-primary-foreground gap-2">
          <Download className="w-4 h-4" />
          Gerar BPA do mês
        </Button>
      </div>

      {/* Filtros */}
      <Card className="shadow-card border-0">
        <CardContent className="p-4 grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div>
            <Label className="text-xs">Competência (AAAAMM)</Label>
            <Input
              value={competencia}
              onChange={(e) => setCompetencia(e.target.value.replace(/\D/g, '').slice(0, 6))}
              maxLength={6}
              placeholder="202504"
            />
          </div>
          <div className="sm:col-span-2">
            <Label className="text-xs">Unidade</Label>
            <Select value={unidadeFiltro} onValueChange={setUnidadeFiltro}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todas as unidades</SelectItem>
                {unidadesOptions.map(u => (
                  <SelectItem key={u.id} value={u.id}>{u.nome}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-3">
        <Card className="shadow-card border-0">
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground">Total no mês</p>
            <p className="text-2xl font-bold text-foreground">{stats.total}</p>
          </CardContent>
        </Card>
        <Card className="shadow-card border-0">
          <CardContent className="p-4">
            <p className="text-xs text-success">Válidos</p>
            <p className="text-2xl font-bold text-success">{stats.validos}</p>
          </CardContent>
        </Card>
        <Card className="shadow-card border-0">
          <CardContent className="p-4">
            <p className="text-xs text-destructive">Pendentes</p>
            <p className="text-2xl font-bold text-destructive">{stats.pendentes}</p>
          </CardContent>
        </Card>
      </div>

      {/* Grade */}
      <Card className="shadow-card border-0">
        <CardHeader className="flex flex-row items-center justify-between pb-2">
          <CardTitle className="text-base">Atendimentos do período</CardTitle>
          <Button variant="ghost" size="sm" onClick={load} disabled={loading}>
            <RefreshCw className={cn("w-4 h-4 mr-1", loading && "animate-spin")} />
            Atualizar
          </Button>
        </CardHeader>
        <CardContent className="p-0">
          {loading ? (
            <div className="flex justify-center py-12">
              <Loader2 className="w-8 h-8 animate-spin text-primary" />
            </div>
          ) : atendimentos.length === 0 ? (
            <div className="p-8 text-center text-muted-foreground text-sm">
              Nenhum atendimento neste período.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-10">#</TableHead>
                    <TableHead>Data</TableHead>
                    <TableHead>Paciente</TableHead>
                    <TableHead>CNS</TableHead>
                    <TableHead>CPF</TableHead>
                    <TableHead>Raça/Cor</TableHead>
                    <TableHead>Nacionalid.</TableHead>
                    <TableHead>Profissional</TableHead>
                    <TableHead>CBO</TableHead>
                    <TableHead>SIGTAP</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {atendimentos.map(at => {
                    const pac = pacMap[at.paciente_id];
                    const prof = profMap[at.profissional_id];
                    const v = validateRow(at);
                    const ok = v.cns && v.cbo && v.sigtap && v.raca && v.nacionalidade;
                    return (
                      <TableRow key={at.id} className={cn(!ok && "bg-destructive/5")}>
                        <TableCell>
                          {ok
                            ? <CheckCircle2 className="w-4 h-4 text-success" />
                            : <AlertCircle className="w-4 h-4 text-destructive" />}
                        </TableCell>
                        <TableCell className="text-xs whitespace-nowrap">{at.data}</TableCell>
                        <TableCell className="font-medium">{at.paciente_nome}</TableCell>
                        <TableCell className={cn("text-xs font-mono", !v.cns && "text-destructive")}>
                          {pac?.cns || <span className="italic">faltando</span>}
                        </TableCell>
                        <TableCell className="text-xs font-mono">{pac?.cpf || '—'}</TableCell>
                        <TableCell className={cn("text-xs capitalize", !v.raca && "text-destructive italic")}>
                          {pac?.raca_cor || 'faltando'}
                        </TableCell>
                        <TableCell className={cn("text-xs capitalize", !v.nacionalidade && "text-destructive italic")}>
                          {pac?.nacionalidade || 'faltando'}
                        </TableCell>
                        <TableCell className="text-xs">{at.profissional_nome}</TableCell>
                        <TableCell className={cn("text-xs font-mono", !v.cbo && "text-destructive")}>
                          {prof?.cbo || <span className="italic">faltando</span>}
                        </TableCell>
                        <TableCell className={cn("text-xs font-mono", !v.sigtap && "text-destructive")}>
                          {at.procedimento || <span className="italic">faltando</span>}
                        </TableCell>
                        <TableCell>
                          {ok
                            ? <Badge className="bg-success/10 text-success border-0 text-[10px]">OK</Badge>
                            : <Badge className="bg-destructive/10 text-destructive border-0 text-[10px]">PENDENTE</Badge>}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Modal de geração */}
      <Dialog open={modalOpen} onOpenChange={setModalOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Gerar arquivo BPA-I</DialogTitle>
            <DialogDescription>
              Atendimentos com dados pendentes (CNS, CBO ou SIGTAP) serão pulados e listados no relatório.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div>
              <Label>Competência (AAAAMM)</Label>
              <Input
                value={modalCompetencia}
                onChange={(e) => setModalCompetencia(e.target.value.replace(/\D/g, '').slice(0, 6))}
                maxLength={6}
                placeholder="202504"
              />
            </div>
            <div>
              <Label>Unidade</Label>
              <Select value={modalUnidade} onValueChange={setModalUnidade}>
                <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="">Todas</SelectItem>
                  {unidadesOptions.map(u => (
                    <SelectItem key={u.id} value={u.id}>{u.nome}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>CNES (opcional — se a unidade não tiver cadastrado)</Label>
              <Input
                value={modalCnes}
                onChange={(e) => setModalCnes(e.target.value.replace(/\D/g, '').slice(0, 7))}
                maxLength={7}
                placeholder="0000000"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setModalOpen(false)} disabled={generating}>
              Cancelar
            </Button>
            <Button onClick={handleGenerate} disabled={generating} className="bg-primary text-primary-foreground gap-2">
              {generating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
              Gerar Arquivo
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default BpaProducao;
