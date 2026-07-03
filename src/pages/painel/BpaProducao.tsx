import React, { useEffect, useMemo, useState } from 'react';
import { formatCNS, maskCNS } from '@/lib/cnsUtils';
import { useAuth } from '@/contexts/AuthContext';
import { useOperacional } from '@/contexts/OperacionalContext';
import { supabase } from '@/integrations/supabase/client';
import { bpaService, LinhaBpaNormalizada } from '@/services/bpaService';
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
import * as XLSX from 'xlsx';

type Origem = 'prontuario' | 'triagem' | 'pts';

interface ProntuarioRow {
  id: string;
  paciente_id: string;
  paciente_nome: string;
  profissional_id: string;
  profissional_nome: string;
  data_atendimento: string;
  unidade_id: string;
  tipo_registro?: string;
}

export type LinhaBPA = LinhaBpaNormalizada;

interface PacienteInfo {
  cns: string; cpf: string; nome: string; data_nascimento: string;
  raca_cor: string; nacionalidade: string; etnia: string;
  sexo: string; municipio: string; uf: string; codigo_municipio: string;
  tipo_logradouro: string; codigo_logradouro: string;
  logradouro: string; numero: string; complemento: string; bairro: string;
  cep: string; telefone: string; email: string;
  endereco_legado: string;
}

// Tabela DNE (Correios) — códigos de tipo de logradouro mais usados
const DNE_LOGRADOURO: Record<string, string> = {
  RUA: '081', R: '081', AVENIDA: '008', AV: '008', TRAVESSA: '100', TV: '100',
  BECO: '011', BC: '011', ESTRADA: '035', EST: '035', RODOVIA: '072', ROD: '072', RAMAL: '082',
  ALAMEDA: '003', PRACA: '062', PRAÇA: '062', ESTACAO: '034', ESTAÇÃO: '034',
  LARGO: '044', PARQUE: '055', QUADRA: '067', SERVIDAO: '094', SERVIDÃO: '094',
  VILA: '108', VIA: '107', VIELA: '109', CONJUNTO: '023',
};
// Mapa DNE oficial carregado do banco (logradouros_dne) — preenchido em runtime
const DNE_DB: Record<string, string> = {};
const normalizeAddressKey = (value: string) => String(value || '')
  .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
  .toUpperCase().replace(/[^A-Z0-9 ]/g, ' ')
  .replace(/\s+/g, ' ')
  .trim();

const resolveCodigoLogradouro = (codigoSalvo: string, tipo: string, logradouro = ''): string => {
  const c = String(codigoSalvo || '').replace(/\D/g, '');
  if (c) return c.padStart(3, '0').slice(-3);
  const candidates = [tipo, tipo.split(/\s+/)[0], logradouro.split(/\s+/)[0]].map(normalizeAddressKey);
  for (const key of candidates) {
    if (!key) continue;
    if (DNE_DB[key]) return DNE_DB[key];
    if (DNE_LOGRADOURO[key]) return DNE_LOGRADOURO[key];
  }
  return '';
};

const resolveCodigoMunicipio = (codigoSalvo: string, municipio: string, uf: string): string => {
  const c = String(codigoSalvo || '').replace(/\D/g, '');
  if (c.length >= 7) return c.slice(0, 7);
  if (c.length === 6) return `${c}0`;
  const key = normalizeAddressKey(`${municipio} ${uf}`);
  if (key.includes('ORIXIMINA')) return '1505304';
  return '';
};
interface ProfInfo { cbo: string; cns: string; nome: string; }

interface ValidationFlags {
  identificacao: boolean;
  cbo: boolean;
  sigtap: boolean;
  nome: boolean;
  dataNasc: boolean;
  codigoMunicipio: boolean;
  codigoLogradouro: boolean;
  statusBpa: boolean;
}

const currentCompetencia = (): string => {
  const d = new Date();
  return `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}`;
};

const fmtCompetencia = (c: string) => c.length === 6 ? `${c.slice(4, 6)}/${c.slice(0, 4)}` : c;

const removeAccents = (s: string) => String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '');
const onlyDigits = (s: string | number | undefined | null) => String(s ?? '').replace(/\D/g, '');
const padNum = (v: string | number, len: number) => onlyDigits(v).slice(-len).padStart(len, '0');
const padText = (v: string, len: number) => {
  const clean = removeAccents(v).toUpperCase().replace(/[^A-Z0-9 ]/g, '').slice(0, len);
  return clean + ' '.repeat(Math.max(0, len - clean.length));
};
const formatBpaDate = (d: string) => {
  if (/^\d{4}-\d{2}-\d{2}/.test(d || '')) return d.slice(0, 10).replace(/-/g, '');
  const digits = onlyDigits(d);
  if (digits.length === 8) return digits;
  return digits.padEnd(8, '0').slice(0, 8);
};
const mapSexoBpa = (sexo: string) => {
  const s = removeAccents(sexo).toLowerCase();
  if (s.startsWith('m')) return 'M';
  if (s.startsWith('f')) return 'F';
  return 'I';
};
const mapRacaBpa = (raca: string) => {
  const s = removeAccents(raca).toLowerCase().trim();
  if (['branca', 'branco', '01'].includes(s)) return '01';
  if (['preta', 'preto', 'negra', 'negro', '02'].includes(s)) return '02';
  if (['parda', 'pardo', '03'].includes(s)) return '03';
  if (['amarela', 'amarelo', '04'].includes(s)) return '04';
  if (['indigena', 'indígena', '05'].includes(s)) return '05';
  return '99';
};
const formatFonte = (fonte?: string) => fonte === 'pts' ? 'PTS'
  : fonte === 'prontuario' ? 'Prontuário'
  : fonte === 'paciente' ? 'Paciente'
  : fonte === 'triagem' ? 'Triagem'
  : fonte === 'nao_encontrado' ? 'Não encontrado'
  : fonte || '—';
const calcBpaHash = (linhas: string[]) => {
  const conteudo = linhas.join('');
  let soma = 0;
  for (let i = 0; i < conteudo.length; i++) soma += conteudo.charCodeAt(i);
  const tabela = 'abcdefghijklmnopqrstuvwxyz0123456789';
  let resto = soma % 1111;
  let hash = '';
  for (let i = 0; i < 4; i++) { hash = tabela[resto % 36] + hash; resto = Math.floor(resto / 36); }
  return hash;
};

const BpaProducao: React.FC = () => {
  const { user, isGlobalAdmin } = useAuth();
  const { unidades, funcionarios } = useOperacional();

  const [linhas, setLinhas] = useState<LinhaBPA[]>([]);
  const [pacMap, setPacMap] = useState<Record<string, PacienteInfo>>({});
  const [profMap, setProfMap] = useState<Record<string, ProfInfo>>({});
  const [loading, setLoading] = useState(false);

  const [competencia, setCompetencia] = useState<string>(currentCompetencia());
  const [unidadeFiltro, setUnidadeFiltro] = useState<string>(isGlobalAdmin ? 'all' : (user?.unidadeId || 'all'));
  const [profissionalFiltro, setProfissionalFiltro] = useState<string>('all');
  const [origemFiltro, setOrigemFiltro] = useState<'all' | Origem>('all');
  const [statusFiltro, setStatusFiltro] = useState<'all' | 'ok' | 'pendente' | 'duplicado'>('all');
  const [pacienteFiltro, setPacienteFiltro] = useState<string>('');
  const [sigtapFiltro, setSigtapFiltro] = useState<string>('');
  const [folha, setFolha] = useState<string>('001');

  const [triagemSigtapPadrao, setTriagemSigtapPadrao] = useState<string>('');

  const [modalOpen, setModalOpen] = useState(false);
  const [modalCompetencia, setModalCompetencia] = useState<string>(currentCompetencia());
  const [modalUnidade, setModalUnidade] = useState<string>(isGlobalAdmin ? '' : (user?.unidadeId || ''));
  const [modalCnes, setModalCnes] = useState<string>('');
  const [generating, setGenerating] = useState(false);

  const ano = competencia.slice(0, 4);
  const mes = competencia.slice(4, 6);

  useEffect(() => {
    if (user?.unidadeId && !isGlobalAdmin && unidadeFiltro === 'all') {
      setUnidadeFiltro(user.unidadeId);
    }
  }, [user?.unidadeId, isGlobalAdmin, unidadeFiltro]);

  // Carrega apenas a config global do SIGTAP da triagem.
  // (A tabela DNE já é carregada e cacheada dentro do bpaService — não duplicar aqui.)
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
      const result = await bpaService.resolveBpaProcedimentosECids({
        competencia,
        unidadeId: unidadeFiltro,
        // profissional não é enviado: a filtragem é feita client-side em linhasFiltradas,
        // o que torna a troca de profissional instantânea sem refetch.
        triagemSigtapPadrao
      });

      console.log('[BPA] filtros aplicados', { competencia, unidadeFiltro, profissionalFiltro, origemFiltro, statusFiltro, pacienteFiltro, sigtapFiltro });
      console.log('[BPA] linhas montadas antes do filtro', result.length);
      console.log('[BPA] validos', result.filter((l) => l.status_bpa === 'ok' && !l.duplicado).length);
      console.log('[BPA] pendentes', result.filter((l) => l.status_bpa === 'pendente' && !l.duplicado).length);

      setLinhas(result);

      // Carregar Maps auxiliares (Pacientes e Profissionais) para o cabeçalho e validações locais
      const pacIds = [...new Set(result.map((r) => r.paciente_id).filter(Boolean))];
      const profIds = [...new Set(result.map((r) => r.profissional_id).filter(Boolean))];

      if (pacIds.length) {
        const pacs: any[] = [];
        for (let i = 0; i < pacIds.length; i += 500) {
          const { data } = await (supabase as any)
            .from('pacientes')
            .select('id, nome, cpf, cns, data_nascimento, sexo, raca_cor, nacionalidade, naturalidade, naturalidade_uf, municipio, cep, tipo_logradouro, logradouro, numero, complemento, bairro, uf, telefone, email, endereco, custom_data')
            .in('id', pacIds.slice(i, i + 500));
          if (data) pacs.push(...data);
        }
        const pm: Record<string, PacienteInfo> = {};
        (pacs || []).forEach((p: any) => {
          const cd = p.custom_data || {};
          pm[p.id] = {
            cns: p.cns || '',
            cpf: p.cpf || '',
            nome: p.nome || '',
            data_nascimento: p.data_nascimento || '',
            raca_cor: p.raca_cor || cd.raca_cor || cd.racaCor || '',
            nacionalidade: p.nacionalidade || cd.nacionalidade || '',
            etnia: cd.etnia || '',
            sexo: p.sexo || cd.sexo || '',
            municipio: p.municipio || cd.municipio || '',
            uf: p.uf || cd.uf || '',
            codigo_municipio: resolveCodigoMunicipio(cd.municipio_ibge || cd.codigo_ibge_municipio || cd.codigo_municipio || cd.codigo_ibge || '', p.municipio || cd.municipio || '', p.uf || cd.uf || ''),
            tipo_logradouro: p.tipo_logradouro || cd.tipo_logradouro || cd.tipoLogradouro || cd.tipo_logradouro_dne || '',
            codigo_logradouro: cd.codigo_logradouro || cd.tipo_logradouro_codigo || cd.tipoLogradouroCodigo || cd.tipo_logradouro_dne || '',
            logradouro: p.logradouro || cd.logradouro || p.endereco || '',
            numero: p.numero || cd.numero || '',
            complemento: p.complemento || cd.complemento || '',
            bairro: p.bairro || cd.bairro || '',
            cep: p.cep || cd.cep || '',
            telefone: p.telefone || '',
            email: p.email || '',
            endereco_legado: p.endereco || '',
          };
        });
        setPacMap(pm);
      } else setPacMap({});

      if (profIds.length) {
        const { data: profs } = await (supabase as any)
          .from('funcionarios').select('id, nome, custom_data').in('id', profIds);
        const pm: Record<string, ProfInfo> = {};
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
    const codigoMunicipio = l.codigo_municipio || resolveCodigoMunicipio(pac?.codigo_municipio || '', pac?.municipio || '', pac?.uf || '');
    const codigoLogradouro = l.codigo_logradouro || resolveCodigoLogradouro(pac?.codigo_logradouro || '', pac?.tipo_logradouro || '', pac?.logradouro || pac?.endereco_legado || '');
    const exigeLogradouro = !!(pac?.tipo_logradouro || pac?.logradouro || pac?.endereco_legado);

    return {
      identificacao: cns.length === 15 || cpf.length === 11,
      cbo: cbo.length > 0,
      sigtap: sigtap.length > 0,
      nome: !!(pac?.nome && pac.nome.trim().length > 0),
      dataNasc: !!(pac?.data_nascimento && pac.data_nascimento.trim().length > 0),
      codigoMunicipio: !!codigoMunicipio,
      codigoLogradouro: !exigeLogradouro || !!codigoLogradouro,
      statusBpa: l.status_bpa === 'ok',
    };
  };

  const isLinhaValida = (l: LinhaBPA, v = validateRow(l)) =>
    v.identificacao && v.cbo && v.sigtap && v.nome && v.dataNasc && v.codigoMunicipio && v.codigoLogradouro && v.statusBpa;

  const linhasFiltradas = useMemo(() => {
    const filtradas = linhas.filter((l) => {
      if (origemFiltro !== 'all' && l.origem !== origemFiltro) return false;
      if (profissionalFiltro !== 'all' && l.profissional_id !== profissionalFiltro) return false;
      if (sigtapFiltro && !(l.codigo_sigtap || '').includes(sigtapFiltro.replace(/\D/g, ''))) return false;
      if (pacienteFiltro && !(l.paciente_nome || '').toLowerCase().includes(pacienteFiltro.toLowerCase())) return false;
      if (statusFiltro !== 'all') {
        const v = validateRow(l);
        const ok = isLinhaValida(l, v);
        if (statusFiltro === 'duplicado' && !l.duplicado) return false;
        if (statusFiltro === 'ok' && !ok) return false;
        if (statusFiltro === 'pendente' && (ok || l.duplicado)) return false;
      }
      return true;
    });
    console.log('[BPA] filtro visual aplicado', { statusFiltro, origemFiltro, profissionalFiltro, pacienteFiltro, sigtapFiltro, antes: linhas.length, depois: filtradas.length });
    return filtradas;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [linhas, origemFiltro, profissionalFiltro, sigtapFiltro, pacienteFiltro, statusFiltro, pacMap, profMap]);

  const stats = useMemo(() => {
    let validos = 0, pendentes = 0, pront = 0, pts = 0, triagem = 0, duplicados = 0;
    linhasFiltradas.forEach((l) => {
      if (l.duplicado) { duplicados++; return; }
      const v = validateRow(l);
      if (isLinhaValida(l, v)) validos++; else pendentes++;
      if (l.origem === 'prontuario') pront++;
      else if (l.origem === 'pts') pts++;
      else triagem++;
    });
    return { total: linhasFiltradas.length, validos, pendentes, pront, pts, triagem, duplicados };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [linhasFiltradas, pacMap, profMap]);

  const emptyFilterMessage = useMemo(() => {
    if (linhas.length === 0) return 'Nenhuma linha encontrada na competência. Verifique competência, unidade e se há Prontuários/PTS/sessões lançados.';
    if (linhasFiltradas.length > 0) return '';
    return `Nenhuma linha para este filtro. Existem ${stats.pendentes} pendente(s), ${stats.validos} válida(s) e ${stats.duplicados} duplicada(s) ignorada(s) na competência.`;
  }, [linhas.length, linhasFiltradas.length, stats.pendentes, stats.validos, stats.duplicados]);

  const clearVisualFilters = () => {
    setOrigemFiltro('all');
    setStatusFiltro('all');
    setPacienteFiltro('');
    setSigtapFiltro('');
  };

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
    let profCns = '', profCbo = '', profNome = '', profUnidadeId = '';
    if (profissionalFiltro !== 'all') {
      const f = funcionarios.find((x) => x.id === profissionalFiltro);
      const cd = (f as any)?.custom_data || {};
      profCns = String(cd.cns || cd.cns_profissional || '').replace(/\D/g, '');
      profCbo = String(cd.cbo_codigo || '').replace(/\D/g, '');
      profNome = (cd.nome_social || f?.nome || '');
      profUnidadeId = (f as any)?.unidadeId || '';
    }
    // Unidade efetiva: filtro > unidade do profissional selecionado > unidade do usuário
    const uniId = unidadeFiltro !== 'all'
      ? unidadeFiltro
      : (profUnidadeId || user?.unidadeId || '');
    const uni = unidades.find((u: any) => u.id === uniId);
    const unidadeNome = uni?.nome
      || (unidadeFiltro === 'all' && !profUnidadeId ? 'Todas as unidades' : '—');
    return {
      cnes: getCnesFromUnidade(uniId),
      ine: getIneFromUnidade(uniId),
      unidadeNome,
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
    const uniSelecionada = unidadeFiltro !== 'all'
      ? unidadeFiltro
      : (profissionalFiltro !== 'all'
          ? ((funcionarios.find((x) => x.id === profissionalFiltro) as any)?.unidadeId || user?.unidadeId || '')
          : (user?.unidadeId || ''));
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
    linhasFiltradas.forEach((l) => {
      const lComp = (l.data || '').replace(/-/g, '').slice(0, 6);
      if (modalCompetencia && lComp !== modalCompetencia) return;
      total += 1;
      const v = validateRow(l);
      if (isLinhaValida(l, v)) validos++; else pendentes++;
    });
    return { validos, pendentes, total };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [modalOpen, modalCompetencia, linhasFiltradas, pacMap, profMap]);

  const handleGenerate = async () => {
    if (modalCompetencia.length !== 6) { toast.error('Competência inválida (AAAAMM)'); return; }
    if (!modalCnes || modalCnes.length !== 7) { toast.error('CNES obrigatório (7 dígitos)'); return; }
    const exportRows = linhasFiltradas
      .filter((l) => (l.data || '').replace(/-/g, '').slice(0, 6) === modalCompetencia)
      .filter((l) => !modalUnidade || l.unidade_id === modalUnidade)
      .filter((l) => !l.duplicado)
      .filter((l) => isLinhaValida(l));
    if (!exportRows.length) {
      toast.error('Nenhuma linha válida neste período. Corrija as pendências antes de gerar.');
      return;
    }
    setGenerating(true);
    try {
      const linhasTxt: string[] = [];
      let folhaNum = 1;
      let seq = 0;
      exportRows.forEach((l) => {
        const pac = pacMap[l.paciente_id] || {} as PacienteInfo;
        const prof = profMap[l.profissional_id] || {} as ProfInfo;
        seq += 1;
        if (seq > 99) { folhaNum += 1; seq = 1; }
        const cpf = onlyDigits(pac.cpf);
        const cnsPac = onlyDigits(pac.cns).length === 15 ? onlyDigits(pac.cns) : padNum(cpf, 15);
        const codigoMunicipio = l.codigo_municipio || resolveCodigoMunicipio(pac.codigo_municipio || '', pac.municipio || '', pac.uf || '');
        const linha =
          '03' +
          padNum(modalCnes, 7) +
          padNum(modalCompetencia, 6) +
          padNum(prof.cns || '', 15) +
          padNum(prof.cbo || '', 6) +
          formatBpaDate(l.data) +
          padNum(folhaNum, 3) +
          padNum(seq, 2) +
          padNum(l.codigo_sigtap, 10) +
          cnsPac +
          mapSexoBpa(pac.sexo || '') +
          padNum(codigoMunicipio, 6) +
          padText(l.cid || '', 4) +
          padNum(0, 3) +
          padNum(l.qtd || 1, 6) +
          padNum(l.carater || '01', 2) +
          padText('', 13) +
          'BPA' +
          padText(pac.nome || l.paciente_nome || '', 30) +
          formatBpaDate(pac.data_nascimento || '') +
          mapRacaBpa(pac.raca_cor || '') +
          padText(pac.etnia || '', 4) +
          padNum(pac.nacionalidade || '010', 3) +
          padText(cpf, 11) +
          padNum(pac.cep || '', 8) +
          ' '.repeat(72);
        linhasTxt.push(linha.slice(0, 250).padEnd(250, ' '));
      });
      const header = ('01' + '#BPA' + padNum(modalCompetencia, 6) + padNum(folhaNum, 6) + padNum(linhasTxt.length, 6) +
        padText('SMS', 14) + padText('SECRETARIA DE SAUDE', 40) + padText('MS', 10) + 'M' + 'I' + calcBpaHash(linhasTxt) + ' '.repeat(159)).slice(0, 250).padEnd(250, ' ');
      const trailer = ('99' + padNum(linhasTxt.length, 6) + ' '.repeat(242)).slice(0, 250).padEnd(250, ' ');
      const blob = new Blob([[header, ...linhasTxt, trailer].join('\r\n') + '\r\n'], { type: 'text/plain;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = `PA${modalCompetencia}.txt`;
      document.body.appendChild(a); a.click(); document.body.removeChild(a);
      URL.revokeObjectURL(url);
      toast.success(`BPA gerado. ${linhasTxt.length} procedimento(s) exportado(s).`, {
        description: `${linhasFiltradas.length - exportRows.length} pendente(s) pulado(s).`, duration: 6000,
      });
      setModalOpen(false);
    } catch (err: unknown) {
      console.error('generate error', err);
      toast.error('Erro ao gerar BPA: ' + (err instanceof Error ? err.message : 'desconhecido'));
    } finally {
      setGenerating(false);
    }
  };

  // --- Exportação XLSX BPA-I (3 abas: BPA-I, Pendências, Resumo) ---
  const exportXlsx = () => {
    const linhasParaExportar = linhasFiltradas;
    if (linhasParaExportar.length === 0) { toast.error('Nenhuma linha para exportar'); return; }

    const uniId = unidadeFiltro !== 'all' ? unidadeFiltro : (user?.unidadeId || '');
    const uniNome = unidades.find((u: any) => u.id === uniId)?.nome || (unidadeFiltro === 'all' ? 'Todas' : '—');
    const competenciaFmt = fmtCompetencia(competencia);

    type LinhaExport = {
      seq: number; l: LinhaBPA; pac: PacienteInfo; prof: ProfInfo;
      cnes: string; ine: string; v: ValidationFlags; ok: boolean; pend: string[];
    };
    const exportRows: LinhaExport[] = linhasParaExportar.map((l, idx) => {
      const pac = (pacMap[l.paciente_id] || {}) as PacienteInfo;
      const prof = (profMap[l.profissional_id] || {}) as ProfInfo;
      const v = validateRow(l);
      const ok = isLinhaValida(l, v);
      const pend: string[] = [];
      if (l.duplicado) pend.push('Duplicado ignorado');
      if (!v.nome) pend.push('Nome do paciente');
      if (!v.identificacao) pend.push('CNS ou CPF');
      if (!v.dataNasc) pend.push('Data de nascimento');
      if (!pac?.sexo) pend.push('Sexo');
      if (!pac?.municipio) pend.push('Município de residência');
      if (!v.codigoMunicipio) pend.push('Código de município');
      if (!v.codigoLogradouro) pend.push('Código de logradouro');
      if (!v.cbo) pend.push('CBO do profissional');
      if (!v.sigtap) pend.push(l.motivo_pendencia || 'Procedimento SIGTAP/CID');
      const cnes = getCnesFromUnidade(l.unidade_id);
      const ine = getIneFromUnidade(l.unidade_id);
      if (!cnes) pend.push('CNES da unidade');
      
      return { seq: idx + 1, l, pac, prof, cnes, ine, v, ok, pend };
    });

    // ── Aba BPA-I ─────────────────────────────────────────────
    const bpaHeader = [
      'competencia', 'fonte_procedimento', 'paciente_nome', 'paciente_cns', 'paciente_cpf', 'data_nascimento', 'sexo',
      'municipio', 'codigo_municipio', 'uf', 'cep', 'tipo_logradouro', 'codigo_logradouro', 'logradouro', 'numero', 'bairro',
      'profissional_nome', 'cbo', 'unidade', 'cnes', 'data_atendimento', 'procedimento_nome', 'codigo_sigtap', 'quantidade',
      'cid_usado', 'fonte_cid', 'cids_relacionados', 'status_bpa', 'motivo_pendencia', 'prontuario_id', 'pts_id', 'duplicado', 'chave_dedupe'
    ];

    const bpaRows = exportRows.map(({ l, pac, prof, cnes, ok, pend }) => {
      const codMun = l.codigo_municipio || resolveCodigoMunicipio(pac.codigo_municipio || '', pac.municipio || '', pac.uf || '');
      const codLogr = l.codigo_logradouro || resolveCodigoLogradouro(pac.codigo_logradouro || '', pac.tipo_logradouro || '', pac.logradouro || pac.endereco_legado || '');

      return [
        competenciaFmt, formatFonte(l.fonte_procedimento), pac.nome || l.paciente_nome || '', formatCNS(pac.cns) || '', pac.cpf || '', pac.data_nascimento || '', pac.sexo || '',
        pac.municipio || '', codMun, pac.uf || '', pac.cep || '', pac.tipo_logradouro || '', codLogr, pac.logradouro || '', pac.numero || '', pac.bairro || '',
        prof.nome || l.profissional_nome || '', prof.cbo || '', uniNome, cnes, l.data, l.procedimento_nome || '', l.codigo_sigtap || '', l.qtd || 1,
        l.cid || '', formatFonte(l.fonte_cid), (l.cids_relacionados || []).join(', '), ok ? 'OK' : 'PENDENTE', l.motivo_pendencia || pend.join('; '),
        l.prontuario_id || '', l.pts_id || '', l.duplicado ? 'SIM' : 'NÃO', l.chave_dedupe || '',
      ];

    });
    const wsBpa = XLSX.utils.aoa_to_sheet([bpaHeader, ...bpaRows]);
    wsBpa['!cols'] = bpaHeader.map((h) => ({ wch: Math.max(10, Math.min(28, h.length + 4)) }));
    wsBpa['!autofilter'] = { ref: XLSX.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: bpaRows.length, c: bpaHeader.length - 1 } }) };

    // ── Aba Pendências ────────────────────────────────────────
    const pendHeader = ['Seq','Paciente','CNS','CPF','Profissional','CBO','Procedimento','SIGTAP','Data','Origem','Pendências'];
    const pendList = exportRows.filter((r) => !r.ok);
    const pendRows = pendList.map(({ seq, l, pac, prof, pend }) => [
      seq, pac.nome || '—', formatCNS(pac.cns) || '', pac.cpf || '',
      l.profissional_nome, prof.cbo || '', l.procedimento_nome, l.codigo_sigtap || '',
      l.data, l.origem, pend.join('; '),
    ]);
    const wsPend = XLSX.utils.aoa_to_sheet([pendHeader, ...pendRows]);
    wsPend['!cols'] = pendHeader.map((h) => ({ wch: Math.max(10, h.length + 4) }));
    if (pendRows.length) {
      wsPend['!autofilter'] = { ref: XLSX.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: pendRows.length, c: pendHeader.length - 1 } }) };
    }

    // ── Aba Resumo ────────────────────────────────────────────
    const totalValidos = exportRows.filter((r) => r.ok).length;
    const totalPendentes = exportRows.length - totalValidos;
    const porProfissional = new Map<string, number>();
    const porProcedimento = new Map<string, number>();
    const porUnidade = new Map<string, number>();
    exportRows.forEach(({ l }) => {
      porProfissional.set(l.profissional_nome || '—', (porProfissional.get(l.profissional_nome || '—') || 0) + 1);
      const pk = `${l.codigo_sigtap || '—'} ${l.procedimento_nome}`;
      porProcedimento.set(pk, (porProcedimento.get(pk) || 0) + 1);
      const uNome = unidades.find((u: any) => u.id === l.unidade_id)?.nome || l.unidade_id || '—';
      porUnidade.set(uNome, (porUnidade.get(uNome) || 0) + 1);
    });
    const resumoAoa: any[][] = [
      ['Resumo da Produção BPA-I'],
      [],
      ['Competência', competenciaFmt],
      ['Unidade', uniNome],
      ['Data de geração', new Date().toLocaleString('pt-BR')],
      [],
      ['Total de linhas', exportRows.length],
      ['Válidas', totalValidos],
      ['Pendentes', totalPendentes],
      ['Fonte Prontuário', exportRows.filter((r) => r.l.fonte_procedimento === 'prontuario').length],
      ['Fonte PTS', exportRows.filter((r) => r.l.fonte_procedimento === 'pts').length],
      [],
      ['Por Profissional'],
      ['Profissional', 'Linhas'],
      ...[...porProfissional.entries()].sort((a, b) => b[1] - a[1]),
      [],
      ['Por Procedimento'],
      ['SIGTAP / Procedimento', 'Linhas'],
      ...[...porProcedimento.entries()].sort((a, b) => b[1] - a[1]),
      [],
      ['Por Unidade'],
      ['Unidade', 'Linhas'],
      ...[...porUnidade.entries()].sort((a, b) => b[1] - a[1]),
    ];
    const wsResumo = XLSX.utils.aoa_to_sheet(resumoAoa);
    wsResumo['!cols'] = [{ wch: 50 }, { wch: 16 }];

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, wsBpa, 'BPA-I');
    XLSX.utils.book_append_sheet(wb, wsPend, 'Pendências');
    XLSX.utils.book_append_sheet(wb, wsResumo, 'Resumo');

    XLSX.writeFile(wb, `BPA-I_${competencia}.xlsx`);
    toast.success(`Planilha BPA-I exportada — ${totalValidos} válidas, ${totalPendentes} pendentes.`);
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
            Padrão BPA-I: cabeçalho profissional/unidade + linhas com paciente/procedimento (Prontuário, PTS e triagem)
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={exportXlsx} className="gap-2">
            <FileSpreadsheet className="w-4 h-4" /> Exportar XLSX BPA-I
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
                  <SelectItem value="pts">PTS</SelectItem>
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
                <SelectItem value="duplicado">Duplicados</SelectItem>
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
      <div className="grid grid-cols-2 md:grid-cols-7 gap-3">
        <Stat label="Total" value={stats.total} />
        <Stat label="Prontuário" value={stats.pront} />
        <Stat label="PTS" value={stats.pts} />
        <Stat label="Triagem" value={stats.triagem} />
        <Stat label="Válidos" value={stats.validos} variant="success" />
        <Stat label="Pendentes" value={stats.pendentes} variant="destructive" />
        <Stat label="Duplicados" value={stats.duplicados} />
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
            <div className="p-8 text-center text-muted-foreground text-sm space-y-3">
              <p>{emptyFilterMessage}</p>
              <div className="flex flex-wrap justify-center gap-2">
                <Button variant="outline" size="sm" onClick={() => setStatusFiltro('all')}>Ver todos</Button>
                <Button variant="outline" size="sm" onClick={() => setStatusFiltro('pendente')}>Ver pendentes</Button>
                <Button variant="outline" size="sm" onClick={clearVisualFilters}>Limpar filtros</Button>
              </div>
            </div>
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
                    <TableHead>Cód.Mun.</TableHead>
                    <TableHead>Cód.Logr.</TableHead>
                    <TableHead>Data Atend.</TableHead>
                    <TableHead>Procedimento</TableHead>
                    <TableHead>Fonte Proc.</TableHead>
                    <TableHead>SIGTAP</TableHead>
                    <TableHead>QTD</TableHead>
                    <TableHead>CID</TableHead>
                    <TableHead>Fonte CID</TableHead>
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
                    const ok = isLinhaValida(l, v);
                    const pend: string[] = [];
                    if (!v.nome) pend.push('Nome');
                    if (!v.identificacao) pend.push('CNS/CPF');
                    if (!v.dataNasc) pend.push('Data Nasc');
                    if (!v.cbo) pend.push('CBO');
                    if (!v.sigtap) pend.push('SIGTAP');
                    if (!v.codigoMunicipio) pend.push('Cód. Município');
                    if (!v.codigoLogradouro) pend.push('Cód. Logradouro');
                    if (l.motivo_pendencia) pend.push(l.motivo_pendencia);
                    if (l.pendenciaTriagemSigtap) pend.push('SIGTAP triagem');
                    return (
                      <TableRow key={l.key} className={cn(!ok && "bg-destructive/5")}>
                        <TableCell className="text-xs">{idx + 1}</TableCell>
                        <TableCell>
                          <Badge variant="outline" className={cn("text-[10px] capitalize",
                            l.origem === 'triagem' ? 'border-warning/50 text-warning' : 'border-primary/50 text-primary')}>
                            {formatFonte(l.origem)}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-xs font-mono">{formatCNS(pac?.cns) || '—'}</TableCell>
                        <TableCell className="text-xs font-mono">{pac?.cpf || '—'}</TableCell>
                        <TableCell className={cn("text-xs font-medium whitespace-nowrap", !v.nome && "text-destructive italic")}>
                          {pac?.nome || 'faltando'}
                        </TableCell>
                        <TableCell className={cn("text-xs", !v.dataNasc && "text-destructive italic")}>
                          {pac?.data_nascimento || 'faltando'}
                        </TableCell>
                        <TableCell className="text-xs">{pac?.sexo || '—'}</TableCell>
                        <TableCell className="text-xs">{pac?.municipio || '—'}</TableCell>
                        <TableCell className={cn("text-xs font-mono", !v.codigoMunicipio && "text-destructive")}>{l.codigo_municipio || resolveCodigoMunicipio(pac?.codigo_municipio || '', pac?.municipio || '', pac?.uf || '') || '—'}</TableCell>
                        <TableCell className={cn("text-xs font-mono", !v.codigoLogradouro && "text-destructive")}>{l.codigo_logradouro || resolveCodigoLogradouro(pac?.codigo_logradouro || '', pac?.tipo_logradouro || '', pac?.logradouro || pac?.endereco_legado || '') || '—'}</TableCell>
                        <TableCell className="text-xs whitespace-nowrap">{l.data}</TableCell>
                        <TableCell className="text-xs">{l.procedimento_nome}</TableCell>
                        <TableCell className="text-xs">{formatFonte(l.fonte_procedimento)}{l.fonte_resolucao ? ` / ${l.fonte_resolucao}` : ''}</TableCell>
                        <TableCell className={cn("text-xs font-mono", !v.sigtap && "text-destructive")}>
                          {l.codigo_sigtap || <span className="italic">Código SIGTAP não resolvido</span>}
                        </TableCell>
                        <TableCell className="text-xs">{l.qtd || 1}</TableCell>
                        <TableCell className="text-xs">{l.cid || '—'}</TableCell>
                        <TableCell className="text-xs">{formatFonte(l.fonte_cid)}</TableCell>
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
                        <TableCell className="text-[10px] text-destructive max-w-xs">{[...new Set(pend)].join(' | ') || '—'}</TableCell>
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
