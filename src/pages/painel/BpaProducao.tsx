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
  AlertCircle, CheckCircle2, Download, FileText, Loader2, RefreshCw, Building2, UserSquare2, FileSpreadsheet,
} from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

type Origem = 'prontuario' | 'triagem';

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
  key: string;
  origem: Origem;
  prontuario_id: string;
  paciente_id: string;
  paciente_nome: string;
  profissional_id: string;
  profissional_nome: string;
  unidade_id: string;
  data: string;
  procedimento_nome: string;
  codigo_sigtap: string;
  cid: string;
  carater: string;
  qtd: number;
  pendenciaTriagemSigtap?: boolean;
}

interface PacienteInfo {
  cns: string; cpf: string; nome: string; data_nascimento: string;
  raca_cor: string; nacionalidade: string; etnia: string;
  sexo: string; municipio: string;
  endereco: string; numero: string; complemento: string; bairro: string;
  cep: string; telefone: string; email: string;
}
interface ProfInfo { cbo: string; cns: string; nome: string; }

interface ValidationFlags {
  identificacao: boolean;
  cbo: boolean;
  sigtap: boolean;
  nome: boolean;
  dataNasc: boolean;
}

const isCboMedico = (cbo: string) => (cbo || '').replace(/\D/g, '').startsWith('225');

const currentCompetencia = (): string => {
  const d = new Date();
  return `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}`;
};

const fmtCompetencia = (c: string) => c.length === 6 ? `${c.slice(4, 6)}/${c.slice(0, 4)}` : c;

const BpaProducao: React.FC = () => {
  const { user } = useAuth();
  const { unidades, funcionarios } = useData();

  const [linhas, setLinhas] = useState<LinhaBPA[]>([]);
  const [pacMap, setPacMap] = useState<Record<string, PacienteInfo>>({});
  const [profMap, setProfMap] = useState<Record<string, ProfInfo>>({});
  const [loading, setLoading] = useState(false);

  const [competencia, setCompetencia] = useState<string>(currentCompetencia());
  const [unidadeFiltro, setUnidadeFiltro] = useState<string>(user?.unidadeId || 'all');
  const [profissionalFiltro, setProfissionalFiltro] = useState<string>('all');
  const [origemFiltro, setOrigemFiltro] = useState<'all' | Origem>('all');
  const [statusFiltro, setStatusFiltro] = useState<'all' | 'ok' | 'pendente'>('all');
  const [pacienteFiltro, setPacienteFiltro] = useState<string>('');
  const [sigtapFiltro, setSigtapFiltro] = useState<string>('');
  const [folha, setFolha] = useState<string>('001');

  const [triagemSigtapPadrao, setTriagemSigtapPadrao] = useState<string>('');

  const [modalOpen, setModalOpen] = useState(false);
  const [modalCompetencia, setModalCompetencia] = useState<string>(currentCompetencia());
  const [modalUnidade, setModalUnidade] = useState<string>(user?.unidadeId || '');
  const [modalCnes, setModalCnes] = useState<string>('');
  const [generating, setGenerating] = useState(false);

  const ano = competencia.slice(0, 4);
  const mes = competencia.slice(4, 6);

  // --- Carrega config global (procedimento SIGTAP padrão da triagem) ---
  useEffect(() => {
    (async () => {
      const { data } = await (supabase as any).from('system_config').select('configuracoes').limit(1).maybeSingle();
      const cfg = data?.configuracoes || {};
      setTriagemSigtapPadrao(String(cfg.bpa_triagem_sigtap || '').replace(/\D/g, ''));
    })();
  }, []);

  const load = async () => {
    if (!ano || !mes) return;
    setLoading(true);
    try {
      const dataInicio = `${ano}-${mes}-01`;
      const ultDia = new Date(Number(ano), Number(mes), 0).getDate();
      const dataFim = `${ano}-${mes}-${String(ultDia).padStart(2, '0')}`;

      // 1) Prontuários do período
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

      // 2) Vínculos prontuário-procedimento
      const prontIds = prots.map((p) => p.id);
      const vincs = prontIds.length
        ? ((await (supabase as any).from('prontuario_procedimentos').select('prontuario_id, procedimento_id').in('prontuario_id', prontIds)).data || [])
        : [];
      const procIds = [...new Set(vincs.map((v: any) => v.procedimento_id))];
      const procsData = procIds.length
        ? ((await (supabase as any).from('procedimentos').select('id, nome, codigo_sigtap').in('id', procIds)).data || [])
        : [];
      const procsMap = new Map<string, any>(procsData.map((p: any) => [p.id, p]));
      const prontMap = new Map<string, ProntuarioRow>(prots.map((p) => [p.id, p]));

      const result: LinhaBPA[] = [];
      vincs.forEach((v: any) => {
        const pront = prontMap.get(v.prontuario_id);
        if (!pront) return;
        const proc = procsMap.get(v.procedimento_id);
        result.push({
          key: `pron_${pront.id}_${v.procedimento_id}`,
          origem: 'prontuario',
          prontuario_id: pront.id,
          paciente_id: pront.paciente_id,
          paciente_nome: pront.paciente_nome,
          profissional_id: pront.profissional_id,
          profissional_nome: pront.profissional_nome,
          unidade_id: pront.unidade_id,
          data: pront.data_atendimento,
          procedimento_nome: proc?.nome || '—',
          codigo_sigtap: proc?.codigo_sigtap || '',
          cid: '',
          carater: '01',
          qtd: 1,
        });
      });
      prots.forEach((pront) => {
        if (!vincs.some((v: any) => v.prontuario_id === pront.id)) {
          result.push({
            key: `pron_${pront.id}_none`,
            origem: 'prontuario',
            prontuario_id: pront.id,
            paciente_id: pront.paciente_id,
            paciente_nome: pront.paciente_nome,
            profissional_id: pront.profissional_id,
            profissional_nome: pront.profissional_nome,
            unidade_id: pront.unidade_id,
            data: pront.data_atendimento,
            procedimento_nome: '— sem procedimento —',
            codigo_sigtap: '',
            cid: '',
            carater: '01',
            qtd: 1,
          });
        }
      });

      // 3) Triagens finalizadas no período (1 triagem = 1 linha)
      const { data: triagens } = await (supabase as any)
        .from('triage_records')
        .select('id, agendamento_id, tecnico_id, criado_em')
        .gte('criado_em', `${dataInicio}T00:00:00`)
        .lte('criado_em', `${dataFim}T23:59:59`);

      const ags = [...new Set((triagens || []).map((t: any) => t.agendamento_id).filter(Boolean))];
      const agsData = ags.length
        ? ((await (supabase as any).from('agendamentos').select('id, paciente_id, paciente_nome, unidade_id, data').in('id', ags)).data || [])
        : [];
      const agsMap = new Map<string, any>(agsData.map((a: any) => [a.id, a]));

      (triagens || []).forEach((t: any) => {
        const ag = agsMap.get(t.agendamento_id);
        if (!ag) return;
        if (unidadeFiltro && unidadeFiltro !== 'all' && ag.unidade_id !== unidadeFiltro) return;
        const tecnico = funcionarios.find((f) => f.id === t.tecnico_id);
        result.push({
          key: `tri_${t.id}`,
          origem: 'triagem',
          prontuario_id: t.id,
          paciente_id: ag.paciente_id,
          paciente_nome: ag.paciente_nome,
          profissional_id: t.tecnico_id || '',
          profissional_nome: tecnico?.nome || '— técnico não identificado —',
          unidade_id: ag.unidade_id,
          data: ag.data || (t.criado_em || '').slice(0, 10),
          procedimento_nome: triagemSigtapPadrao
            ? 'Acolhimento com classificação de risco'
            : '— SIGTAP da triagem não configurado —',
          codigo_sigtap: triagemSigtapPadrao,
          cid: '',
          carater: '01',
          qtd: 1,
          pendenciaTriagemSigtap: !triagemSigtapPadrao,
        });
      });

      // Ordena por data desc
      result.sort((a, b) => (b.data || '').localeCompare(a.data || ''));
      setLinhas(result);

      // 4) Maps auxiliares
      const pacIds = [...new Set(result.map((r) => r.paciente_id).filter(Boolean))];
      const profIds = [...new Set(result.map((r) => r.profissional_id).filter(Boolean))];

      if (pacIds.length) {
        const { data: pacs } = await (supabase as any)
          .from('pacientes')
          .select('id, nome, cpf, cns, data_nascimento, endereco, telefone, email, municipio, custom_data')
          .in('id', pacIds);
        const pm: typeof pacMap = {};
        (pacs || []).forEach((p: any) => {
          const cd = p.custom_data || {};
          pm[p.id] = {
            cns: p.cns || '',
            cpf: p.cpf || '',
            nome: p.nome || '',
            data_nascimento: p.data_nascimento || '',
            raca_cor: cd.raca_cor || cd.racaCor || '',
            nacionalidade: cd.nacionalidade || '',
            etnia: cd.etnia || '',
            sexo: cd.sexo || '',
            municipio: p.municipio || cd.municipio || '',
            endereco: p.endereco || '',
            numero: cd.numero || '',
            complemento: cd.complemento || '',
            bairro: cd.bairro || '',
            cep: cd.cep || '',
            telefone: p.telefone || '',
            email: p.email || '',
          };
        });
        setPacMap(pm);
      } else setPacMap({});

      if (profIds.length) {
        const { data: profs } = await (supabase as any)
          .from('funcionarios').select('id, nome, custom_data').in('id', profIds);
        const pm: typeof profMap = {};
        (profs || []).forEach((f: any) => {
          const cd = f.custom_data || {};
          pm[f.id] = {
            cbo: cd.cbo_codigo || '',
            cns: String(cd.cns || cd.cns_profissional || '').replace(/\D/g, ''),
            nome: cd.nome_social || f.nome || '',
          };
        });
        setProfMap(pm);
      } else setProfMap({});
    } catch (err) {
      console.error('load bpa error', err);
      toast.error('Erro ao carregar produção BPA');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); /* eslint-disable-next-line */ }, [competencia, unidadeFiltro, triagemSigtapPadrao]);

  const validateRow = (l: LinhaBPA): ValidationFlags => {
    const pac = pacMap[l.paciente_id];
    const prof = profMap[l.profissional_id];
    const cns = (pac?.cns || '').replace(/\D/g, '');
    const cpf = (pac?.cpf || '').replace(/\D/g, '');
    const cbo = (prof?.cbo || '').replace(/\D/g, '');
    const sigtap = (l.codigo_sigtap || '').replace(/\D/g, '');
    const exigeSigtap = l.origem === 'triagem' ? true : !isCboMedico(cbo);
    return {
      identificacao: cns.length === 15 || cpf.length === 11,
      cbo: cbo.length > 0,
      sigtap: !exigeSigtap || sigtap.length === 10,
      nome: !!(pac?.nome && pac.nome.trim().length > 0),
      dataNasc: !!(pac?.data_nascimento && pac.data_nascimento.trim().length > 0),
    };
  };

  const linhasFiltradas = useMemo(() => {
    return linhas.filter((l) => {
      if (origemFiltro !== 'all' && l.origem !== origemFiltro) return false;
      if (profissionalFiltro !== 'all' && l.profissional_id !== profissionalFiltro) return false;
      if (sigtapFiltro && !(l.codigo_sigtap || '').includes(sigtapFiltro.replace(/\D/g, ''))) return false;
      if (pacienteFiltro && !(l.paciente_nome || '').toLowerCase().includes(pacienteFiltro.toLowerCase())) return false;
      if (statusFiltro !== 'all') {
        const v = validateRow(l);
        const ok = v.identificacao && v.cbo && v.sigtap && v.nome && v.dataNasc;
        if (statusFiltro === 'ok' && !ok) return false;
        if (statusFiltro === 'pendente' && ok) return false;
      }
      return true;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [linhas, origemFiltro, profissionalFiltro, sigtapFiltro, pacienteFiltro, statusFiltro, pacMap, profMap]);

  const stats = useMemo(() => {
    let validos = 0, pendentes = 0, pront = 0, triagem = 0;
    linhasFiltradas.forEach((l) => {
      const v = validateRow(l);
      if (v.identificacao && v.cbo && v.sigtap && v.nome && v.dataNasc) validos++; else pendentes++;
      if (l.origem === 'prontuario') pront++; else triagem++;
    });
    return { total: linhasFiltradas.length, validos, pendentes, pront, triagem };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [linhasFiltradas, pacMap, profMap]);

  const getCnesFromUnidade = (uniId: string): string => {
    if (!uniId) return '';
    const uni = unidades.find((u: any) => u.id === uniId);
    const cd = (uni as any)?.custom_data || {};
    return String(cd.cnes || '').replace(/\D/g, '').slice(0, 7);
  };
  const getIneFromUnidade = (uniId: string): string => {
    if (!uniId) return '';
    const uni = unidades.find((u: any) => u.id === uniId);
    const cd = (uni as any)?.custom_data || {};
    return String(cd.ine || '').replace(/\D/g, '').slice(0, 10);
  };

  // --- Header dinâmico ---
  const cabecalho = useMemo(() => {
    const uniId = unidadeFiltro !== 'all' ? unidadeFiltro : (user?.unidadeId || '');
    const uni = unidades.find((u: any) => u.id === uniId);
    let profCns = '', profCbo = '', profNome = '';
    if (profissionalFiltro !== 'all') {
      const f = funcionarios.find((x) => x.id === profissionalFiltro);
      const cd = (f as any)?.custom_data || {};
      profCns = String(cd.cns || cd.cns_profissional || '').replace(/\D/g, '');
      profCbo = String(cd.cbo_codigo || '').replace(/\D/g, '');
      profNome = (cd.nome_social || f?.nome || '');
    }
    return {
      cnes: getCnesFromUnidade(uniId),
      ine: getIneFromUnidade(uniId),
      unidadeNome: (uni as any)?.nome || (unidadeFiltro === 'all' ? 'Todas as unidades' : '—'),
      profCns, profCbo, profNome,
      mesAno: fmtCompetencia(competencia),
      folha,
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [unidadeFiltro, profissionalFiltro, unidades, funcionarios, competencia, folha, user]);

  const profissionaisOptions = useMemo(() => {
    const ids = new Set(linhas.map((l) => l.profissional_id).filter(Boolean));
    return funcionarios
      .filter((f) => ids.has(f.id))
      .sort((a, b) => (a.nome || '').localeCompare(b.nome || ''));
  }, [linhas, funcionarios]);

  const openGenerateModal = () => {
    const uniSelecionada = unidadeFiltro !== 'all' ? unidadeFiltro : (user?.unidadeId || '');
    setModalCompetencia(competencia);
    setModalUnidade(uniSelecionada);
    setModalCnes(getCnesFromUnidade(uniSelecionada));
    setModalOpen(true);
  };

  useEffect(() => {
    if (!modalOpen) return;
    const sugerido = getCnesFromUnidade(modalUnidade);
    if (sugerido) setModalCnes(sugerido);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [modalUnidade, modalOpen]);

  const modalPreview = useMemo(() => {
    if (!modalOpen) return { validos: 0, pendentes: 0, total: 0 };
    let validos = 0, pendentes = 0, total = 0;
    linhas.forEach((l) => {
      const lComp = (l.data || '').replace(/-/g, '').slice(0, 6);
      if (modalCompetencia && lComp !== modalCompetencia) return;
      total += 1;
      const v = validateRow(l);
      if (v.identificacao && v.cbo && v.sigtap && v.nome && v.dataNasc) validos++; else pendentes++;
    });
    return { validos, pendentes, total };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [modalOpen, modalCompetencia, linhas, pacMap, profMap]);

  const handleGenerate = async () => {
    if (modalCompetencia.length !== 6) { toast.error('Competência inválida (AAAAMM)'); return; }
    if (!modalCnes || modalCnes.length !== 7) { toast.error('CNES obrigatório (7 dígitos)'); return; }
    if (modalPreview.total > 0 && modalPreview.validos === 0) {
      toast.error('Nenhum atendimento válido neste período. Corrija as pendências antes de gerar.');
      return;
    }
    setGenerating(true);
    try {
      const { data, error } = await (supabase as any).functions.invoke('generate-bpa', {
        body: { competencia: modalCompetencia, unidade_id: modalUnidade || '', cnes: modalCnes || '' },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      const blob = new Blob([data.conteudo], { type: 'text/plain;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = data.filename || `BPA_${modalCompetencia}.txt`;
      document.body.appendChild(a); a.click(); document.body.removeChild(a);
      URL.revokeObjectURL(url);
      toast.success(`BPA gerado. ${data.total_exportados} procedimento(s) exportado(s).`, {
        description: data.total_pendentes > 0 ? `${data.total_pendentes} pendentes pulados.` : undefined,
        duration: 6000,
      });
      setModalOpen(false);
    } catch (err: any) {
      console.error('generate error', err);
      toast.error('Erro ao gerar BPA: ' + (err?.message || 'desconhecido'));
    } finally {
      setGenerating(false);
    }
  };

  // --- Exportação CSV organizada ---
  const exportCsv = () => {
    if (linhasFiltradas.length === 0) { toast.error('Nenhuma linha para exportar'); return; }
    const header = [
      'Seq','Origem','CNS Paciente','CPF Paciente','Nome','Data Nascimento','Sexo','Municipio',
      'Data Atendimento','Procedimento','SIGTAP','QTD','CID','Carater','Raca/Cor','Etnia','Nacionalidade',
      'Profissional','CBO','CNS Profissional','CNES','INE','Status','Pendencias',
    ];
    const rows = linhasFiltradas.map((l, idx) => {
      const pac = pacMap[l.paciente_id] || {} as PacienteInfo;
      const prof = profMap[l.profissional_id] || {} as ProfInfo;
      const v = validateRow(l);
      const ok = v.identificacao && v.cbo && v.sigtap && v.nome && v.dataNasc;
      const pend: string[] = [];
      if (!v.nome) pend.push('Nome');
      if (!v.identificacao) pend.push('CNS/CPF');
      if (!v.dataNasc) pend.push('Data Nasc');
      if (!v.cbo) pend.push('CBO');
      if (!v.sigtap) pend.push('SIGTAP');
      if (l.pendenciaTriagemSigtap) pend.push('SIGTAP triagem não configurado');
      const cnes = getCnesFromUnidade(l.unidade_id);
      const ine = getIneFromUnidade(l.unidade_id);
      return [
        idx + 1, l.origem, pac.cns || '', pac.cpf || '', pac.nome || '', pac.data_nascimento || '',
        pac.sexo || '', pac.municipio || '', l.data, l.procedimento_nome, l.codigo_sigtap, l.qtd,
        l.cid, l.carater, pac.raca_cor || '', pac.etnia || '', pac.nacionalidade || '',
        l.profissional_nome, prof.cbo || '', prof.cns || '', cnes, ine,
        ok ? 'OK' : 'PENDENTE', pend.join('; '),
      ].map((c) => `"${String(c ?? '').replace(/"/g, '""')}"`).join(';');
    });
    const csv = '\uFEFF' + [header.join(';'), ...rows].join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `BPA_Producao_${competencia}.csv`;
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    URL.revokeObjectURL(url);
    toast.success('Planilha exportada');
  };

  const unidadesOptions = unidades.filter((u) => u.ativo !== false);

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
            Padrão BPA-I: cabeçalho profissional/unidade + linhas com paciente/procedimento (prontuário e triagem)
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={exportCsv} className="gap-2">
            <FileSpreadsheet className="w-4 h-4" /> Exportar CSV
          </Button>
          <Button onClick={openGenerateModal} className="bg-primary text-primary-foreground gap-2">
            <Download className="w-4 h-4" /> Gerar BPA
          </Button>
        </div>
      </div>

      {/* Cabeçalho BPA-I (dados profissional/unidade) */}
      <Card className="shadow-card border-0">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm flex items-center gap-2">
            <Building2 className="w-4 h-4 text-primary" /> Cabeçalho BPA-I
          </CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-2 md:grid-cols-4 gap-3 text-xs">
          <Field label="CNES" value={cabecalho.cnes} pendencia={!cabecalho.cnes} />
          <Field label="Código INE" value={cabecalho.ine} pendencia={!cabecalho.ine} optional />
          <Field label="Unidade" value={cabecalho.unidadeNome} />
          <Field label="Mês/Ano" value={cabecalho.mesAno} />

          <Field label="CNS Profissional" value={cabecalho.profCns}
                 pendencia={profissionalFiltro !== 'all' && !cabecalho.profCns} />
          <Field label="Nome/Nome Social" value={cabecalho.profNome || (profissionalFiltro === 'all' ? '— todos —' : '')}
                 pendencia={profissionalFiltro !== 'all' && !cabecalho.profNome} />
          <Field label="CBO" value={cabecalho.profCbo}
                 pendencia={profissionalFiltro !== 'all' && !cabecalho.profCbo} />
          <div>
            <Label className="text-[10px] uppercase tracking-wide text-muted-foreground">Folha</Label>
            <Input value={folha} onChange={(e) => setFolha(e.target.value.replace(/\D/g, '').slice(0, 3))}
                   maxLength={3} className="h-8 text-xs" />
          </div>
        </CardContent>
      </Card>

      {/* Filtros */}
      <Card className="shadow-card border-0">
        <CardContent className="p-4 grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3">
          <div>
            <Label className="text-xs">Competência (AAAAMM)</Label>
            <Input value={competencia}
              onChange={(e) => setCompetencia(e.target.value.replace(/\D/g, '').slice(0, 6))}
              maxLength={6} placeholder="202504" />
          </div>
          <div>
            <Label className="text-xs">Unidade</Label>
            <Select value={unidadeFiltro} onValueChange={setUnidadeFiltro}>
              <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todas</SelectItem>
                {unidadesOptions.map((u) => (
                  <SelectItem key={u.id} value={u.id}>{u.nome}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs">Profissional</Label>
            <Select value={profissionalFiltro} onValueChange={setProfissionalFiltro}>
              <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos</SelectItem>
                {profissionaisOptions.map((f) => (
                  <SelectItem key={f.id} value={f.id}>{f.nome}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs">Origem</Label>
            <Select value={origemFiltro} onValueChange={(v) => setOrigemFiltro(v as any)}>
              <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todas</SelectItem>
                <SelectItem value="prontuario">Prontuário/Atendimento</SelectItem>
                <SelectItem value="triagem">Triagem</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs">Status</Label>
            <Select value={statusFiltro} onValueChange={(v) => setStatusFiltro(v as any)}>
              <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos</SelectItem>
                <SelectItem value="ok">Válidos</SelectItem>
                <SelectItem value="pendente">Pendentes</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs">SIGTAP</Label>
            <Input value={sigtapFiltro} onChange={(e) => setSigtapFiltro(e.target.value)} placeholder="código" className="h-9" />
          </div>
          <div className="sm:col-span-2">
            <Label className="text-xs">Paciente</Label>
            <Input value={pacienteFiltro} onChange={(e) => setPacienteFiltro(e.target.value)} placeholder="nome do paciente" className="h-9" />
          </div>
        </CardContent>
      </Card>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <Stat label="Total" value={stats.total} />
        <Stat label="Prontuário" value={stats.pront} />
        <Stat label="Triagem" value={stats.triagem} />
        <Stat label="Válidos" value={stats.validos} variant="success" />
        <Stat label="Pendentes" value={stats.pendentes} variant="destructive" />
      </div>

      {/* Aviso SIGTAP triagem */}
      {!triagemSigtapPadrao && stats.triagem > 0 && (
        <div className="rounded-lg border border-warning/40 bg-warning/10 p-3 text-xs flex items-start gap-2">
          <AlertCircle className="w-4 h-4 text-warning mt-0.5 shrink-0" />
          <div>
            <p className="font-medium text-foreground">Procedimento SIGTAP da triagem não configurado</p>
            <p className="text-muted-foreground">
              Configure <code>bpa_triagem_sigtap</code> em system_config para que as linhas de triagem sejam exportadas.
            </p>
          </div>
        </div>
      )}

      {/* Tabela BPA-I */}
      <Card className="shadow-card border-0">
        <CardHeader className="flex flex-row items-center justify-between pb-2">
          <CardTitle className="text-base flex items-center gap-2">
            <UserSquare2 className="w-4 h-4 text-primary" />
            Linhas BPA-I do período ({linhasFiltradas.length})
          </CardTitle>
          <Button variant="ghost" size="sm" onClick={load} disabled={loading}>
            <RefreshCw className={cn("w-4 h-4 mr-1", loading && "animate-spin")} /> Atualizar
          </Button>
        </CardHeader>
        <CardContent className="p-0">
          {loading ? (
            <div className="flex justify-center py-12"><Loader2 className="w-8 h-8 animate-spin text-primary" /></div>
          ) : linhasFiltradas.length === 0 ? (
            <div className="p-8 text-center text-muted-foreground text-sm">Nenhuma linha neste período/filtro.</div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-10">Seq</TableHead>
                    <TableHead>Origem</TableHead>
                    <TableHead>CNS</TableHead>
                    <TableHead>CPF</TableHead>
                    <TableHead>Nome</TableHead>
                    <TableHead>Nasc.</TableHead>
                    <TableHead>Sexo</TableHead>
                    <TableHead>Município</TableHead>
                    <TableHead>Data Atend.</TableHead>
                    <TableHead>Procedimento</TableHead>
                    <TableHead>SIGTAP</TableHead>
                    <TableHead>QTD</TableHead>
                    <TableHead>CID</TableHead>
                    <TableHead>Caráter</TableHead>
                    <TableHead>Raça/Cor</TableHead>
                    <TableHead>Etnia</TableHead>
                    <TableHead>Nac.</TableHead>
                    <TableHead>Profissional</TableHead>
                    <TableHead>CBO</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Pendências</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {linhasFiltradas.map((l, idx) => {
                    const pac = pacMap[l.paciente_id];
                    const prof = profMap[l.profissional_id];
                    const v = validateRow(l);
                    const ok = v.identificacao && v.cbo && v.sigtap && v.nome && v.dataNasc;
                    const isMed = isCboMedico(prof?.cbo || '');
                    const pend: string[] = [];
                    if (!v.nome) pend.push('Nome');
                    if (!v.identificacao) pend.push('CNS/CPF');
                    if (!v.dataNasc) pend.push('Data Nasc');
                    if (!v.cbo) pend.push('CBO');
                    if (!v.sigtap) pend.push('SIGTAP');
                    if (l.pendenciaTriagemSigtap) pend.push('SIGTAP triagem');
                    return (
                      <TableRow key={l.key} className={cn(!ok && "bg-destructive/5")}>
                        <TableCell className="text-xs">{idx + 1}</TableCell>
                        <TableCell>
                          <Badge variant="outline" className={cn("text-[10px] capitalize",
                            l.origem === 'triagem' ? 'border-warning/50 text-warning' : 'border-primary/50 text-primary')}>
                            {l.origem}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-xs font-mono">{pac?.cns || '—'}</TableCell>
                        <TableCell className="text-xs font-mono">{pac?.cpf || '—'}</TableCell>
                        <TableCell className={cn("text-xs font-medium whitespace-nowrap", !v.nome && "text-destructive italic")}>
                          {pac?.nome || 'faltando'}
                        </TableCell>
                        <TableCell className={cn("text-xs", !v.dataNasc && "text-destructive italic")}>
                          {pac?.data_nascimento || 'faltando'}
                        </TableCell>
                        <TableCell className="text-xs">{pac?.sexo || '—'}</TableCell>
                        <TableCell className="text-xs">{pac?.municipio || '—'}</TableCell>
                        <TableCell className="text-xs whitespace-nowrap">{l.data}</TableCell>
                        <TableCell className="text-xs">
                          {l.procedimento_nome}
                          {l.origem === 'prontuario' && isMed && !l.codigo_sigtap && (
                            <Badge className="ml-1 bg-primary/10 text-primary border-0 text-[9px]">consulta</Badge>
                          )}
                        </TableCell>
                        <TableCell className={cn("text-xs font-mono", !v.sigtap && "text-destructive")}>
                          {l.codigo_sigtap || (l.origem === 'prontuario' && isMed
                            ? <span className="text-muted-foreground italic">opcional</span>
                            : <span className="italic">faltando</span>)}
                        </TableCell>
                        <TableCell className="text-xs">{l.qtd}</TableCell>
                        <TableCell className="text-xs">{l.cid || '—'}</TableCell>
                        <TableCell className="text-xs">{l.carater}</TableCell>
                        <TableCell className="text-xs">{pac?.raca_cor || '—'}</TableCell>
                        <TableCell className="text-xs">{pac?.etnia || '—'}</TableCell>
                        <TableCell className="text-xs">{pac?.nacionalidade || '—'}</TableCell>
                        <TableCell className="text-xs whitespace-nowrap">{l.profissional_nome}</TableCell>
                        <TableCell className={cn("text-xs font-mono", !v.cbo && "text-destructive")}>
                          {prof?.cbo || 'faltando'}
                        </TableCell>
                        <TableCell>
                          {ok
                            ? <Badge className="bg-success/10 text-success border-0 text-[10px]">OK</Badge>
                            : <Badge className="bg-destructive/10 text-destructive border-0 text-[10px]">PENDENTE</Badge>}
                        </TableCell>
                        <TableCell className="text-[10px] text-destructive">{pend.join(', ') || '—'}</TableCell>
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
              Layout oficial SIA/SUS. Linhas com pendências serão puladas automaticamente.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div>
              <Label>Competência (AAAAMM)</Label>
              <Input value={modalCompetencia}
                onChange={(e) => setModalCompetencia(e.target.value.replace(/\D/g, '').slice(0, 6))}
                maxLength={6} placeholder="202504" />
            </div>
            <div>
              <Label>Unidade</Label>
              <Select value={modalUnidade} onValueChange={setModalUnidade}>
                <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="">Todas</SelectItem>
                  {unidadesOptions.map((u) => (
                    <SelectItem key={u.id} value={u.id}>{u.nome}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>CNES (7 dígitos) <span className="text-destructive">*</span></Label>
              <Input value={modalCnes}
                onChange={(e) => setModalCnes(e.target.value.replace(/\D/g, '').slice(0, 7))}
                maxLength={7} placeholder="0000000"
                className={cn(modalCnes.length !== 7 && "border-destructive/50")} />
              <p className="text-[11px] text-muted-foreground mt-1">
                {getCnesFromUnidade(modalUnidade)
                  ? '✓ CNES preenchido automaticamente da unidade'
                  : 'Informe manualmente — a unidade não possui CNES cadastrado'}
              </p>
            </div>
            <div className="rounded-lg border border-border bg-muted/30 p-3 space-y-1">
              <p className="text-xs font-medium text-foreground mb-2">Resumo da exportação</p>
              <div className="grid grid-cols-3 gap-2 text-center">
                <div><p className="text-[10px] text-muted-foreground">Total</p><p className="text-lg font-bold">{modalPreview.total}</p></div>
                <div><p className="text-[10px] text-success">Exportados</p><p className="text-lg font-bold text-success">{modalPreview.validos}</p></div>
                <div><p className="text-[10px] text-destructive">Pendentes</p><p className="text-lg font-bold text-destructive">{modalPreview.pendentes}</p></div>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setModalOpen(false)} disabled={generating}>Cancelar</Button>
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

const Field: React.FC<{ label: string; value?: string; pendencia?: boolean; optional?: boolean }> = ({ label, value, pendencia, optional }) => (
  <div>
    <Label className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</Label>
    <div className={cn(
      "h-8 px-2 flex items-center rounded-md border bg-background text-xs font-mono",
      pendencia && !optional && "border-destructive/50 text-destructive",
      pendencia && optional && "border-warning/50 text-warning",
    )}>
      {value || (pendencia ? (optional ? 'opcional' : 'pendente') : '—')}
    </div>
  </div>
);

const Stat: React.FC<{ label: string; value: number; variant?: 'success' | 'destructive' }> = ({ label, value, variant }) => (
  <Card className="shadow-card border-0">
    <CardContent className="p-3">
      <p className={cn("text-xs",
        variant === 'success' && 'text-success',
        variant === 'destructive' && 'text-destructive',
        !variant && 'text-muted-foreground')}>{label}</p>
      <p className={cn("text-2xl font-bold",
        variant === 'success' && 'text-success',
        variant === 'destructive' && 'text-destructive',
        !variant && 'text-foreground')}>{value}</p>
    </CardContent>
  </Card>
);

export default BpaProducao;
