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

interface ProntuarioRow {
  id: string;
  paciente_id: string;
  paciente_nome: string;
  profissional_id: string;
  profissional_nome: string;
  data_atendimento: string;
  unidade_id: string;
}

interface LinhaBPA {
  key: string;                // prontuario_id + proc_id
  prontuario_id: string;
  paciente_id: string;
  paciente_nome: string;
  profissional_id: string;
  profissional_nome: string;
  data: string;
  procedimento_nome: string;
  codigo_sigtap: string;
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
  const [linhas, setLinhas] = useState<LinhaBPA[]>([]);
  const [pacMap, setPacMap] = useState<Record<string, { cns: string; cpf: string; raca_cor: string; nacionalidade: string }>>({});
  const [profMap, setProfMap] = useState<Record<string, { cbo: string }>>({});
  const [loading, setLoading] = useState(false);
  const [competencia, setCompetencia] = useState<string>(currentCompetencia());
  const [unidadeFiltro, setUnidadeFiltro] = useState<string>(user?.unidadeId || 'all');

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

      // 1. Prontuários do período
      let q = (supabase as any)
        .from('prontuarios')
        .select('id, paciente_id, paciente_nome, profissional_id, profissional_nome, data_atendimento, unidade_id')
        .gte('data_atendimento', dataInicio)
        .lte('data_atendimento', dataFim)
        .order('data_atendimento', { ascending: false });
      if (unidadeFiltro && unidadeFiltro !== 'all') q = q.eq('unidade_id', unidadeFiltro);

      const { data: prontuarios, error } = await q;
      if (error) throw error;
      const prots = (prontuarios || []) as ProntuarioRow[];

      if (prots.length === 0) {
        setLinhas([]);
        setPacMap({});
        setProfMap({});
        setLoading(false);
        return;
      }

      // 2. Vinculos
      const prontIds = prots.map((p) => p.id);
      const { data: vincs } = await (supabase as any)
        .from('prontuario_procedimentos')
        .select('prontuario_id, procedimento_id')
        .in('prontuario_id', prontIds);

      const procIds = [...new Set((vincs || []).map((v: any) => v.procedimento_id))];
      const { data: procsData } = procIds.length
        ? await (supabase as any).from('procedimentos').select('id, nome, codigo_sigtap').in('id', procIds)
        : { data: [] };
      const procsMap = new Map<string, any>((procsData || []).map((p: any) => [p.id, p]));

      const prontMap = new Map<string, ProntuarioRow>(prots.map((p) => [p.id, p]));

      // 3. Monta linhas BPA (1 linha por procedimento)
      const result: LinhaBPA[] = [];
      (vincs || []).forEach((v: any) => {
        const pront = prontMap.get(v.prontuario_id);
        if (!pront) return;
        const proc = procsMap.get(v.procedimento_id);
        result.push({
          key: `${pront.id}_${v.procedimento_id}`,
          prontuario_id: pront.id,
          paciente_id: pront.paciente_id,
          paciente_nome: pront.paciente_nome,
          profissional_id: pront.profissional_id,
          profissional_nome: pront.profissional_nome,
          data: pront.data_atendimento,
          procedimento_nome: proc?.nome || '—',
          codigo_sigtap: proc?.codigo_sigtap || '',
        });
      });

      // Prontuários SEM procedimento — listamos como pendente (linha "sem procedimento")
      prots.forEach((pront) => {
        if (!(vincs || []).some((v: any) => v.prontuario_id === pront.id)) {
          result.push({
            key: `${pront.id}_none`,
            prontuario_id: pront.id,
            paciente_id: pront.paciente_id,
            paciente_nome: pront.paciente_nome,
            profissional_id: pront.profissional_id,
            profissional_nome: pront.profissional_nome,
            data: pront.data_atendimento,
            procedimento_nome: '— sem procedimento —',
            codigo_sigtap: '',
          });
        }
      });

      setLinhas(result);

      // 4. Auxiliares
      const pacIds = [...new Set(prots.map((p) => p.paciente_id).filter(Boolean))];
      const profIds = [...new Set(prots.map((p) => p.profissional_id).filter(Boolean))];

      if (pacIds.length) {
        const { data: pacs } = await (supabase as any)
          .from('pacientes').select('id, cpf, cns, custom_data').in('id', pacIds);
        const pm: typeof pacMap = {};
        (pacs || []).forEach((p: any) => {
          const cd = p.custom_data || {};
          pm[p.id] = {
            cns: p.cns || '',
            cpf: p.cpf || '',
            raca_cor: cd.raca_cor || cd.racaCor || '',
            nacionalidade: cd.nacionalidade || '',
          };
        });
        setPacMap(pm);
      } else setPacMap({});

      if (profIds.length) {
        const { data: profs } = await (supabase as any)
          .from('funcionarios').select('id, custom_data').in('id', profIds);
        const pm: typeof profMap = {};
        (profs || []).forEach((f: any) => {
          pm[f.id] = { cbo: (f.custom_data || {}).cbo_codigo || '' };
        });
        setProfMap(pm);
      } else setProfMap({});
    } catch (err) {
      console.error('load bpa error', err);
      toast.error('Erro ao carregar prontuários');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); /* eslint-disable-next-line */ }, [competencia, unidadeFiltro]);

  const validateRow = (l: LinhaBPA): ValidationFlags => {
    const pac = pacMap[l.paciente_id];
    const prof = profMap[l.profissional_id];
    const cns = (pac?.cns || '').replace(/\D/g, '');
    const cbo = (prof?.cbo || '').replace(/\D/g, '');
    const sigtap = (l.codigo_sigtap || '').replace(/\D/g, '');
    return {
      cns: cns.length === 15,
      cbo: cbo.length > 0,
      sigtap: sigtap.length === 10,
      raca: !!(pac?.raca_cor && pac.raca_cor.length > 0),
      nacionalidade: !!(pac?.nacionalidade && pac.nacionalidade.length > 0),
    };
  };

  const stats = useMemo(() => {
    let validos = 0, pendentes = 0;
    linhas.forEach((l) => {
      const v = validateRow(l);
      if (v.cns && v.cbo && v.sigtap && v.raca && v.nacionalidade) validos++; else pendentes++;
    });
    return { total: linhas.length, validos, pendentes };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [linhas, pacMap, profMap]);

  const getCnesFromUnidade = (uniId: string): string => {
    if (!uniId) return '';
    const uni = unidades.find((u: any) => u.id === uniId);
    const cd = (uni as any)?.custom_data || {};
    return String(cd.cnes || '').replace(/\D/g, '').slice(0, 7);
  };

  const openGenerateModal = () => {
    const uniSelecionada = unidadeFiltro !== 'all' ? unidadeFiltro : (user?.unidadeId || '');
    setModalCompetencia(competencia);
    setModalUnidade(uniSelecionada);
    setModalCnes(getCnesFromUnidade(uniSelecionada));
    setModalOpen(true);
  };

  // Atualiza CNES sugerido sempre que a unidade do modal muda
  useEffect(() => {
    if (!modalOpen) return;
    const sugerido = getCnesFromUnidade(modalUnidade);
    if (sugerido) setModalCnes(sugerido);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [modalUnidade, modalOpen]);

  // Pendências previstas para a competência/unidade do modal (preview)
  const modalPreview = useMemo(() => {
    if (!modalOpen) return { validos: 0, pendentes: 0, total: 0 };
    const filtroUni = modalUnidade || '';
    const filtroComp = modalCompetencia;
    let validos = 0, pendentes = 0, total = 0;
    linhas.forEach((l) => {
      const lComp = (l.data || '').replace(/-/g, '').slice(0, 6);
      if (filtroComp && lComp !== filtroComp) return;
      // unidade não está em LinhaBPA — usamos prontuario filter via mapa
      total += 1;
      const v = validateRow(l);
      if (v.cns && v.cbo && v.sigtap && v.raca && v.nacionalidade) validos++; else pendentes++;
    });
    return { validos, pendentes, total };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [modalOpen, modalUnidade, modalCompetencia, linhas, pacMap, profMap]);

  const handleGenerate = async () => {
    if (modalCompetencia.length !== 6) {
      toast.error('Competência inválida (use AAAAMM, ex: 202504)');
      return;
    }
    if (!modalCnes || modalCnes.length !== 7) {
      toast.error('CNES obrigatório (7 dígitos). Cadastre o CNES da unidade ou informe manualmente.');
      return;
    }
    if (modalPreview.total > 0 && modalPreview.validos === 0) {
      toast.error('Nenhum atendimento válido neste período. Corrija as pendências antes de gerar.');
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
        `BPA gerado com sucesso. ${data.total_exportados} procedimento(s) exportado(s).`,
        {
          description: data.total_pendentes > 0
            ? `${data.total_pendentes} registro(s) pendente(s) foram pulados.`
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
            Gerado a partir dos prontuários finalizados (1 procedimento = 1 linha BPA-I)
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
          <CardTitle className="text-base">Linhas BPA-I do período</CardTitle>
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
          ) : linhas.length === 0 ? (
            <div className="p-8 text-center text-muted-foreground text-sm">
              Nenhum prontuário neste período.
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
                    <TableHead>Raça/Cor</TableHead>
                    <TableHead>Nacionalid.</TableHead>
                    <TableHead>Profissional</TableHead>
                    <TableHead>CBO</TableHead>
                    <TableHead>Procedimento</TableHead>
                    <TableHead>SIGTAP</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {linhas.map((l) => {
                    const pac = pacMap[l.paciente_id];
                    const prof = profMap[l.profissional_id];
                    const v = validateRow(l);
                    const ok = v.cns && v.cbo && v.sigtap && v.raca && v.nacionalidade;
                    return (
                      <TableRow key={l.key} className={cn(!ok && "bg-destructive/5")}>
                        <TableCell>
                          {ok
                            ? <CheckCircle2 className="w-4 h-4 text-success" />
                            : <AlertCircle className="w-4 h-4 text-destructive" />}
                        </TableCell>
                        <TableCell className="text-xs whitespace-nowrap">{l.data}</TableCell>
                        <TableCell className="font-medium">{l.paciente_nome}</TableCell>
                        <TableCell className={cn("text-xs font-mono", !v.cns && "text-destructive")}>
                          {pac?.cns || <span className="italic">faltando</span>}
                        </TableCell>
                        <TableCell className={cn("text-xs capitalize", !v.raca && "text-destructive italic")}>
                          {pac?.raca_cor || 'faltando'}
                        </TableCell>
                        <TableCell className={cn("text-xs capitalize", !v.nacionalidade && "text-destructive italic")}>
                          {pac?.nacionalidade || 'faltando'}
                        </TableCell>
                        <TableCell className="text-xs">{l.profissional_nome}</TableCell>
                        <TableCell className={cn("text-xs font-mono", !v.cbo && "text-destructive")}>
                          {prof?.cbo || <span className="italic">faltando</span>}
                        </TableCell>
                        <TableCell className="text-xs">{l.procedimento_nome}</TableCell>
                        <TableCell className={cn("text-xs font-mono", !v.sigtap && "text-destructive")}>
                          {l.codigo_sigtap || <span className="italic">faltando</span>}
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
              Linhas com dados pendentes (CNS, CBO, SIGTAP, Raça ou Nacionalidade) serão puladas.
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
