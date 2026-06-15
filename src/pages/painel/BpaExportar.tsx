import React, { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Loader2, Download, AlertCircle, CheckCircle2, User, UserCog, X } from 'lucide-react';
import { toast } from 'sonner';
import { useNavigate } from 'react-router-dom';

/**
 * Funções de Formatação e Utilitários
 */

const limparTexto = (str: string): string => {
  if (!str) return '';
  return str
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "") // remove acentos
    .toUpperCase()
    .replace(/[^A-Z0-9 ]/g, "")      // remove tudo que não for A-Z, 0-9 ou espaço (agora sem trocar por espaço para evitar caracteres extras)
    .replace(/\s+/g, " ")           // normaliza espaços repetidos
    .trim();
};


const somenteNumeros = (str: any): string => {
  return String(str || '').replace(/\D/g, '');
};

const zfill = (valor: any, tamanho: number): string => {
  const s = somenteNumeros(valor);
  if (s.length > tamanho) return s.slice(0, tamanho);
  return s.padStart(tamanho, '0');
};

const primeiroValorPreenchido = (...valores: any[]): any =>
  valores.find((valor) => valor !== null && valor !== undefined && String(valor).trim() !== '');

const rpad = (valor: any, tamanho: number): string => {
  const s = String(valor || '');
  if (s.length > tamanho) return s.slice(0, tamanho);
  return s.padEnd(tamanho, ' ');
};

const parseDataSegura = (date: any): { ano: number; mes: number; dia: number } | null => {
  if (!date) return null;
  const raw = String(date).trim();
  const iso = raw.match(/^(\d{4})-(\d{2})-(\d{2})/);
  const dmy = raw.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})$/);
  const partes = iso
    ? { ano: Number(iso[1]), mes: Number(iso[2]), dia: Number(iso[3]) }
    : dmy
      ? { ano: Number(dmy[3].length === 2 ? `20${dmy[3]}` : dmy[3]), mes: Number(dmy[2]), dia: Number(dmy[1]) }
      : null;
  if (!partes || partes.ano < 1900 || partes.ano > 2100 || partes.mes < 1 || partes.mes > 12 || partes.dia < 1 || partes.dia > 31) return null;
  const validacao = new Date(Date.UTC(partes.ano, partes.mes - 1, partes.dia));
  if (validacao.getUTCFullYear() !== partes.ano || validacao.getUTCMonth() + 1 !== partes.mes || validacao.getUTCDate() !== partes.dia) return null;
  return partes;
};

const formatarData = (date: any): string => {
  const d = parseDataSegura(date);
  if (!d) return "00000000";
  return `${d.ano}${String(d.mes).padStart(2, '0')}${String(d.dia).padStart(2, '0')}`;
};

const formatarDataBR = (date: any): string => {
  const d = parseDataSegura(date);
  if (!d) return '';
  return `${String(d.dia).padStart(2, '0')}/${String(d.mes).padStart(2, '0')}/${d.ano}`;
};

const calcularIdade = (dataNasc: any, dataAtendimento: any): string => {
  const nasc = parseDataSegura(dataNasc);
  const aten = parseDataSegura(dataAtendimento);
  if (!nasc || !aten) return "000";
  let idade = aten.ano - nasc.ano;
  if (aten.mes < nasc.mes || (aten.mes === nasc.mes && aten.dia < nasc.dia)) idade--;
  return zfill(Math.max(0, idade), 3);
};

const obterCboValido = (prof: any): string => {
  if (!prof) return '';
  const cd = prof.custom_data || {};
  
  // Lista de campos possíveis para CBO
  const candidatos = [
    cd.cbo_codigo,
    cd.cbo,
    cd.codigo_cbo,
    cd.cbo_sus,
    prof.cbo,
    prof.cbo_codigo,
    prof.profissao,
    prof.cargo
  ];

  for (const c of candidatos) {
    const limpo = somenteNumeros(c);
    if (limpo.length === 6) return limpo;
  }
  
  return '';
};

const inferirSexoPorNome = (nome: string): 'M' | 'F' | null => {
  if (!nome) return null;
  const primeiroNome = limparTexto(nome).split(' ')[0];
  
  const femininos = [
    'MARIA', 'ANA', 'FRANCISCA', 'JOSEFA', 'ANTONIA', 'JULIA', 'LUCIANA', 'PATRICIA', 
    'DAMARIS', 'JESSICA', 'ADRIANA', 'ALINE', 'AMANDA', 'BEATRIZ', 'CAMILA', 'CARLA', 
    'CRISTINA', 'DANIELA', 'DEBORA', 'ELIANE', 'FERNANDA', 'GABRIELA', 'ISABELA', 
    'JULIANA', 'LETICIA', 'MARCELA', 'NATALIA', 'PAULA', 'RAFAELA', 'RENATA', 'SIMONE', 
    'TATIANE', 'VANESSA', 'VITORIA'
  ];
  
  const masculinos = [
    'JOSE', 'JOAO', 'FRANCISCO', 'ANTONIO', 'MARCOS', 'CARLOS', 'LUCAS', 'MARCO', 
    'LUIZ', 'ALEXANDRE', 'ANDRE', 'BRUNO', 'DANIEL', 'DIEGO', 'EDUARDO', 'FELIPE', 
    'FERNANDO', 'GABRIEL', 'GUILHERME', 'GUSTAVO', 'IGOR', 'LEANDRO', 'LEONARDO', 
    'MARCELO', 'MATEUS', 'PAULO', 'RAFAEL', 'RICARDO', 'RODRIGO', 'SAMUEL', 'TIAGO', 
    'VINICIUS', 'VITOR'
  ];

  if (femininos.includes(primeiroNome)) return 'F';
  if (masculinos.includes(primeiroNome)) return 'M';
  
  return null;
};

const BPA_HEADER_LENGTH = 130;
const BPA_I_RECORD_LENGTH = 338;
const CRLF_BYTES = new Uint8Array([0x0D, 0x0A]);

const bytesToHex = (arr: number[] | Uint8Array, sep = ' ') =>
  Array.from(arr).map(b => b.toString(16).toUpperCase().padStart(2, '0')).join(sep);

const toIsoBytes = (content: string): Uint8Array => {
  const bytes = new Uint8Array(content.length);
  for (let i = 0; i < content.length; i++) {
    const code = content.charCodeAt(i);
    bytes[i] = code <= 255 ? code : 0x20;
  }
  return bytes;
};

const fixedText = (valor: any, tamanho: number): string => rpad(limparTexto(String(valor || '')), tamanho);

const fixedDigits = (valor: any, tamanho: number): string => {
  const s = somenteNumeros(valor);
  if (!s) return ' '.repeat(tamanho);
  return s.slice(-tamanho).padStart(tamanho, '0');
};

const mapRacaCorBpa = (valor: any): string => {
  const s = limparTexto(String(valor || '')).toLowerCase();
  if (['01', 'branca', 'branco'].includes(s)) return '01';
  if (['02', 'preta', 'preto', 'negra', 'negro'].includes(s)) return '02';
  if (['03', 'parda', 'pardo'].includes(s)) return '03';
  if (['04', 'amarela', 'amarelo'].includes(s)) return '04';
  if (['05', 'indigena', 'indígena'].includes(s)) return '05';
  return '99';
};

const LOGRADOURO_DNE: Record<string, string> = {
  RUA: '081', R: '081', AVENIDA: '008', AV: '008', TRAVESSA: '100', TV: '100',
  BECO: '011', BC: '011', ESTRADA: '035', EST: '035', RODOVIA: '072', ROD: '072',
  ALAMEDA: '003', PRACA: '062', PRAÇA: '062', RAMAL: '082', VILA: '108', VIA: '107',
};

// Retorna o código oficial DNE (3 dígitos) ou null se não puder determinar com segurança.
const codigoLogradouroBpa = (pac: any): string | null => {
  const cd = pac?.custom_data || {};
  const salvo = somenteNumeros(cd.codigo_logradouro || cd.tipo_logradouro_codigo || cd.tipoLogradouroCodigo || cd.tipo_logradouro_dne);
  if (salvo) return salvo.slice(-3).padStart(3, '0');
  const tipo = limparTexto(pac?.tipo_logradouro || cd.tipo_logradouro || cd.tipoLogradouro || '').toUpperCase().split(' ')[0];
  const enderecoPrimeira = limparTexto(pac?.logradouro || pac?.endereco || cd.logradouro || cd.endereco || '').toUpperCase().split(' ')[0];
  return LOGRADOURO_DNE[tipo] || LOGRADOURO_DNE[enderecoPrimeira] || null;
};

// Valida e normaliza nacionalidade (3 dígitos). Retorna null se cadastro não tiver código oficial.
// Tabela SIA/SUS de Nacionalidade (DATASUS) — códigos mais comuns. Usada para validar
// que o valor gravado no cadastro está dentro da faixa aceita pelo importador BPA.
const NACIONALIDADE_BPA_VALIDAS = new Set<string>([
  '010','020','022','030','031','035','040','045','050','060','070','080','090',
  '105','110','115','120','130','140','150','160','170','180','190',
  '200','210','220','230','240','250','260','270','280','290','300','999'
]);

// Mapeia textos amigáveis do cadastro -> código oficial SIA/SUS de Nacionalidade
const NACIONALIDADE_TEXTO_MAP: Record<string, string> = {
  'brasileiro': '010',
  'brasileira': '010',
  'brasileiroa': '010',
  'brasileirao': '010',
  'brasileirao a': '010',
  'brasil': '010',
  'brasileiro nato': '010',
  'brasileira nata': '010',
  'nato': '010',
  'nata': '010',
  'naturalizado': '020',
  'naturalizada': '020',
  'brasileiro naturalizado': '020',
  'brasileira naturalizada': '020',
  'naturalizado brasileiro': '020',
  'naturalizada brasileira': '020',
  'estrangeiro': '030',
  'estrangeira': '030',
};

const normalizarTextoNacionalidade = (s: string): string =>
  s
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[()\-_/\\.,;:]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

const resolverNacionalidadeBpa = (valorCadastro: any): { codigo: string | null; descricao?: string; origem: 'numerico' | 'texto' | 'vazio' | 'desconhecido'; motivoErro?: string } => {
  if (valorCadastro === null || valorCadastro === undefined || String(valorCadastro).trim() === '') {
    return { codigo: null, origem: 'vazio', motivoErro: 'Sem valor no cadastro' };
  }
  const str = String(valorCadastro).trim();
  // Tentativa 1: numérico puro
  if (/^\d+$/.test(str)) {
    const num = somenteNumeros(str);
    if (num.length > 3) return { codigo: null, origem: 'numerico', motivoErro: `Tamanho inválido (${num.length} dígitos)` };
    const codigo = num.padStart(3, '0');
    if (codigo === '000') return { codigo: null, origem: 'numerico', motivoErro: 'Código 000 não é aceito' };
    if (!NACIONALIDADE_BPA_VALIDAS.has(codigo)) {
      return { codigo: null, origem: 'numerico', motivoErro: `Código ${codigo} fora da tabela SIA conhecida` };
    }
    return { codigo, origem: 'numerico' };
  }
  // Tentativa 2: texto amigável -> mapeamento
  const norm = normalizarTextoNacionalidade(str);
  if (NACIONALIDADE_TEXTO_MAP[norm]) {
    return { codigo: NACIONALIDADE_TEXTO_MAP[norm], descricao: str, origem: 'texto' };
  }
  // Tentativa 3: heurística por palavra-chave segura
  if (/\bbrasil/.test(norm) && /natural/.test(norm)) {
    return { codigo: '020', descricao: str, origem: 'texto' };
  }
  if (/\bbrasil/.test(norm)) {
    return { codigo: '010', descricao: str, origem: 'texto' };
  }
  return { codigo: null, origem: 'desconhecido', motivoErro: `Valor textual não mapeado: "${str}"` };
};

const nacionalidadeBpa = (pac: any): { codigo: string | null; motivo?: string } => {
  const cd = pac?.custom_data || {};
  const raw = pac?.nacionalidade ?? cd.nacionalidade_codigo ?? cd.nacionalidade ?? cd.nacionalidadeCodigo;
  const res = resolverNacionalidadeBpa(raw);
  if (res.codigo) return { codigo: res.codigo };
  return { codigo: null, motivo: res.motivoErro };
};

const calcularCampoControle = (itens: Array<{ procedimento: string; quantidade: string }>): string => {
  const soma = itens.reduce((acc, item) => acc + Number(somenteNumeros(item.procedimento) || 0) + Number(somenteNumeros(item.quantidade) || 0), 0);
  return zfill((soma % 1111) + 1111, 4);
};

const buildHeaderOficial = (params: {
  competencia: string;
  totalRegistros: number;
  totalFolhas: number;
  campoControle: string;
  orgaoOrigem: string;
  siglaOrigem: string;
  documentoOrigem: string;
  orgaoDestino: string;
  indicadorDestino: string;
  versaoSistema: string;
}): string => {
  const header =
    '01' +
    '#BPA#' +
    zfill(params.competencia, 6) +
    zfill(params.totalRegistros, 6) +
    zfill(params.totalFolhas, 6) +
    zfill(params.campoControle, 4) +
    fixedText(params.orgaoOrigem, 30) +
    fixedText(params.siglaOrigem, 6) +
    zfill(params.documentoOrigem, 14) +
    fixedText(params.orgaoDestino, 40) +
    (params.indicadorDestino === 'E' ? 'E' : 'M') +
    rpad(limparTexto(params.versaoSistema || 'SMSORIXI'), 10);

  return header.slice(0, BPA_HEADER_LENGTH).padEnd(BPA_HEADER_LENGTH, ' ');
};

const BpaExportar: React.FC = () => {
  const navigate = useNavigate();
  const [formData, setFormData] = useState({
    competencia: '',
    unidade_id: 'all',
    cnes: '',
    profissional_id: 'all',
    cns_profissional: '',
    cbo: '',
    procedimento_padrao: '0301010072',
    municipio_padrao: '150530',
    exportar_com_pendencias: false
  });

  const [unidades, setUnidades] = useState<any[]>([]);
  const [profissionais, setProfissionais] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadingData, setLoadingData] = useState(true);
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  
  const [results, setResults] = useState<{
    totalFound: number;
    exportedCount: number;
    warnings: string[];
    criticalCount: number;
    stats: {
      missingCns: number;
      missingSexo: number;
      inferredSexo: number;
      missingMunicipio: number;
      missingCbo: number;
      fallbackCbo: number;
      invalidCbo: number;
      defaultProc: number;
      invalidNascimento: number;
      missingNacionalidade: number;
      missingLogradouro: number;
    };
    details: {
      missingCns: any[];
      missingSexo: any[];
      inferredSexo: any[];
      missingMunicipio: any[];
      missingCbo: any[];
      fallbackCbo: any[];
      invalidCbo: any[];
      defaultProc: any[];
      invalidNascimento: any[];
      missingNacionalidade: any[];
      missingLogradouro: any[];
      critical: any[];
    };
    error: string | null;
    fileName: string;
    blobUrl: string | null;
    headerPreview: string | null;
    headerDetails: {
      tipo: string;
      identificacao: string;
      competencia: string;
      registros: string;
      totalFolhas: string;
      campoControle: string;
      tamanho: number;
      recordLength: number;
      headerHex: string;
      crlf: boolean;
      bom: boolean;
      firstRecordPreview: string;
      firstRecordLength: number;
    } | null;
  } | null>(null);

  useEffect(() => {
    fetchInitialData();
  }, []);

  const fetchInitialData = async () => {
    try {
      setLoadingData(true);
      const [unidadesRes, profissionaisRes] = await Promise.all([
        supabase.from('unidades').select('*').eq('ativo', true),
        supabase.from('funcionarios').select('*').eq('ativo', true)
      ]);

      if (unidadesRes.error) throw unidadesRes.error;
      if (profissionaisRes.error) throw profissionaisRes.error;

      setUnidades(unidadesRes.data || []);
      setProfissionais(profissionaisRes.data || []);
    } catch (err: any) {
      console.error('Erro ao carregar dados iniciais:', err);
      toast.error('Erro ao carregar unidades e profissionais');
    } finally {
      setLoadingData(false);
    }
  };

  const handleUnidadeChange = (unidadeId: string) => {
    const unidade = unidades.find(u => u.id === unidadeId);
    const customData = unidade?.custom_data as any;
    const cnes = customData?.cnes || '';
    setFormData(prev => ({ ...prev, unidade_id: unidadeId, cnes }));
  };

  const handleProfissionalChange = (profId: string) => {
    const prof = profissionais.find(p => p.id === profId);
    const customData = prof?.custom_data as any;
    const cns = prof?.cns || customData?.cns || '';
    const cbo = obterCboValido(prof);
    
    setFormData(prev => ({ 
      ...prev, 
      profissional_id: profId, 
      cns_profissional: cns,
      cbo: cbo
    }));

    if (profId !== 'all' && !cbo) {
      toast.warning('Este profissional não possui CBO numérico de 6 dígitos cadastrado.');
    }
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    if (name === 'cbo') {
      const numeric = somenteNumeros(value);
      if (numeric.length > 6) return;
      setFormData(prev => ({ ...prev, [name]: numeric }));
      return;
    }
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const handleLimpar = () => {
    setFormData({
      competencia: '',
      unidade_id: 'all',
      cnes: '',
      profissional_id: 'all',
      cns_profissional: '',
      cbo: '',
      procedimento_padrao: '0301010072',
      municipio_padrao: '150530',
      exportar_com_pendencias: false
    });
    setResults(null);
    setSelectedCategory(null);
  };

  const handleGerar = async () => {
    setResults(null);
    setSelectedCategory(null);
    
    if (formData.competencia.length !== 6 || isNaN(Number(formData.competencia))) {
      toast.error('Competência deve ter 6 dígitos (AAAAMM)');
      return;
    }

    setLoading(true);
    const warnings: string[] = [];
    const stats = {
      missingCns: 0,
      missingSexo: 0,
      inferredSexo: 0,
      missingMunicipio: 0,
      missingCbo: 0,
      fallbackCbo: 0,
      invalidCbo: 0,
      defaultProc: 0,
      invalidNascimento: 0,
      missingNacionalidade: 0,
      missingLogradouro: 0
    };

    const details = {
      missingCns: [] as any[],
      missingSexo: [] as any[],
      inferredSexo: [] as any[],
      missingMunicipio: [] as any[],
      missingCbo: [] as any[],
      fallbackCbo: [] as any[],
      invalidCbo: [] as any[],
      defaultProc: [] as any[],
      invalidNascimento: [] as any[],
      missingNacionalidade: [] as any[],
      missingLogradouro: [] as any[],
      critical: [] as any[]
    };
    
    try {
      const { competencia } = formData;
      const ano = competencia.substring(0, 4);
      const mes = competencia.substring(4, 6);
      
      const startDate = `${ano}-${mes}-01`;
      const endDate = new Date(parseInt(ano), parseInt(mes), 0).toISOString().split('T')[0];

      let query = (supabase as any)
        .from('prontuarios')
        .select('*')
        .gte('data_atendimento', startDate)
        .lte('data_atendimento', endDate)
        .eq('status', 'finalizado');

      if (formData.unidade_id !== 'all') {
        query = query.eq('unidade_id', formData.unidade_id);
      }
      if (formData.profissional_id !== 'all') {
        query = query.eq('profissional_id', formData.profissional_id);
      }

      const { data: prontuarios, error: pError } = await query;

      if (pError) throw pError;

      if (!prontuarios || prontuarios.length === 0) {
        setResults({
          totalFound: 0,
          exportedCount: 0,
          warnings: ["Nenhum prontuário finalizado encontrado para esta competência e filtros."],
          criticalCount: 0,
          stats,
          details,
          error: null,
          fileName: '',
          blobUrl: null,
          headerPreview: null,
          headerDetails: null
        });
        setLoading(false);
        return;
      }

      const pacienteIds = [...new Set(prontuarios.map((p: any) => p.paciente_id).filter(Boolean))] as string[];
      const profIds = [...new Set(prontuarios.map((p: any) => p.profissional_id).filter(Boolean))] as string[];
      const unidadeIds = [...new Set(prontuarios.map((p: any) => p.unidade_id).filter(Boolean))] as string[];

      const nomesUnicos = [...new Set(prontuarios.map((p: any) => (p.paciente_nome || '').trim()).filter(Boolean))] as string[];

      const [pacientesRes, pacientesByNameRes, funcionariosRes, unidadesRes] = await Promise.all([
        supabase.from('pacientes').select('*').in('id', pacienteIds),
        nomesUnicos.length ? supabase.from('pacientes').select('*').in('nome', nomesUnicos) : Promise.resolve({ data: [] as any[] }),
        supabase.from('funcionarios').select('*').in('id', profIds),
        supabase.from('unidades').select('*').in('id', unidadeIds)
      ]);

      const pacMap = new Map(pacientesRes.data?.map(p => [p.id, p]));
      // Fallback por nome: prontuários cujo paciente_id ficou órfão (duplicidade/merge)
      // são re-vinculados ao cadastro real mais completo (CPF + CNS + nascimento).
      const pacByNameMap = new Map<string, any>();
      (pacientesByNameRes.data || []).forEach((p: any) => {
        const key = (p.nome || '').trim().toUpperCase();
        if (!key) return;
        const existing = pacByNameMap.get(key);
        const score = (p.cpf ? 1 : 0) + (p.cns ? 1 : 0) + (p.data_nascimento ? 1 : 0);
        const existingScore = existing ? (existing.cpf ? 1 : 0) + (existing.cns ? 1 : 0) + (existing.data_nascimento ? 1 : 0) : -1;
        if (!existing || score > existingScore) pacByNameMap.set(key, p);
      });
      const funcMap = new Map(funcionariosRes.data?.map(f => [f.id, f]));
      const unitMap = new Map(unidadesRes.data?.map(u => [u.id, u]));

      let exportedCount = 0;
      let criticalCount = 0;
      const linhasProducao: string[] = [];
      const itensControle: Array<{ procedimento: string; quantidade: string }> = [];
      
      let hasError = false;

      // Linhas de Produção
      prontuarios.forEach((pront: any, index: number) => {
        let pac = pacMap.get(pront.paciente_id) as any;
        if (!pac || (!primeiroValorPreenchido(pac.cpf, pac.cns, pac.data_nascimento, (pac.custom_data as any)?.cpf, (pac.custom_data as any)?.cns, (pac.custom_data as any)?.data_nascimento))) {
          const k = (pront.paciente_nome || '').trim().toUpperCase();
          const fallback = k ? pacByNameMap.get(k) : null;
          if (fallback) pac = fallback;
        }
        const prof = funcMap.get(pront.profissional_id) as any;
        const unit = unitMap.get(pront.unidade_id) as any;
        
        const ident = pac?.nome || pront.paciente_nome || `Registro ${index + 1}`;
        const itemDetail = {
          id: pront.id,
          paciente_id: pront.paciente_id,
          paciente_nome: ident,
          paciente_cpf: primeiroValorPreenchido(pac?.cpf, (pac?.custom_data as any)?.cpf),
          paciente_nascimento: primeiroValorPreenchido(pac?.data_nascimento, (pac?.custom_data as any)?.data_nascimento),
          data_atendimento: pront.data_atendimento,
          profissional_id: pront.profissional_id,
          profissional_nome: prof?.nome || 'Profissional não encontrado',
          unidade_id: pront.unidade_id,
          unidade_nome: unit?.nome || 'Unidade não encontrada',
          procedimento: pront.custom_data?.procedimento_sigtap || pront.outro_procedimento,
          cns_paciente: primeiroValorPreenchido(pac?.cns, (pac?.custom_data as any)?.cns),
          sexo: pac?.sexo,
          municipio: pac?.municipio || (pac?.custom_data as any)?.municipio_ibge,
          cbo: obterCboValido(prof)
        };

        let isCritical = false;

        // CNS Paciente
        const cns_pac_raw = primeiroValorPreenchido(pac?.cns, (pac?.custom_data as any)?.cns) || '';
        const cns_pac = zfill(cns_pac_raw, 15);
        if (!cns_pac_raw || cns_pac === '000000000000000') {
          isCritical = true;
          stats.missingCns++;
          const msg = `${ident}: CNS do paciente ausente ou inválido.`;
          warnings.push(msg);
          details.missingCns.push({ ...itemDetail, pendencia: 'CNS Ausente/Inválido', valor_atual: cns_pac_raw || 'Vazio' });
        }

        // Sexo
        let sexo = ' ';
        const raw_sexo = (pac?.sexo || (pac?.custom_data as any)?.sexo || '').toUpperCase();
        if (raw_sexo.startsWith('M') || raw_sexo === 'MASCULINO' || raw_sexo === 'MALE') {
          sexo = 'M';
        } else if (raw_sexo.startsWith('F') || raw_sexo === 'FEMININO' || raw_sexo === 'FEMALE') {
          sexo = 'F';
        } else {
          const inferred = inferirSexoPorNome(pac?.nome || pront.paciente_nome || '');
          if (inferred) {
            sexo = inferred;
            stats.inferredSexo++;
            details.inferredSexo.push({ ...itemDetail, pendencia: 'Sexo Inferido', valor_atual: 'Indefinido', sugestao: inferred });
          } else {
            isCritical = true;
            stats.missingSexo++;
            warnings.push(`${ident}: Sexo do paciente não informado.`);
            details.missingSexo.push({ ...itemDetail, pendencia: 'Sexo Indefinido', valor_atual: 'Vazio' });
          }
        }

        // Nascimento
        const raw_nasc = primeiroValorPreenchido(pac?.data_nascimento, (pac?.custom_data as any)?.data_nascimento);
        const data_nasc = formatarData(raw_nasc);
        if (data_nasc === "00000000") {
          isCritical = true;
          stats.invalidNascimento++;
          warnings.push(`${ident}: Data de nascimento inválida (${raw_nasc || 'Vazio'}).`);
          details.invalidNascimento.push({ ...itemDetail, pendencia: 'Nascimento Inválido', valor_atual: raw_nasc || 'Vazio' });
        }

        // Município
        const mun_raw = pac?.municipio || (pac?.custom_data as any)?.municipio_ibge;
        let municipio = somenteNumeros(mun_raw);
        if (municipio.length !== 6) {
          municipio = somenteNumeros(formData.municipio_padrao);
        }
        if (municipio.length !== 6 || municipio === '000000') {
          isCritical = true;
          stats.missingMunicipio++;
          warnings.push(`${ident}: Município de residência inválido ou ausente.`);
          details.missingMunicipio.push({ ...itemDetail, pendencia: 'Município Inválido', valor_atual: mun_raw || 'Vazio' });
        }

        if (isCritical) {
          criticalCount++;
          details.critical.push({ ...itemDetail, pendencia: 'Erro Crítico', valor_atual: 'Dados incompletos' });
        }

        // Se não for crítico ou se o usuário permitiu exportar com pendências
        if (!isCritical || formData.exportar_com_pendencias) {
          const unitCd = unit?.custom_data as any;
          const cnes = zfill(unitCd?.cnes || unit?.cnes || formData.cnes, 7);
          const profCd = prof?.custom_data as any;
          const cns_prof = zfill(prof?.cns || profCd?.cns || formData.cns_profissional, 15);
          
          let cbo_raw = obterCboValido(prof);
          if (!cbo_raw) {
            cbo_raw = somenteNumeros(formData.cbo);
            if (cbo_raw.length === 6) {
              stats.fallbackCbo++;
            } else {
              stats.missingCbo++;
            }
          }
          const cbo = zfill(cbo_raw, 6);

          const proc_real = pront.custom_data?.procedimento_sigtap || pront.outro_procedimento;
          const proc = zfill(proc_real || formData.procedimento_padrao, 10);
          if (!proc_real) stats.defaultProc++;

          const data_atend = formatarData(pront.data_atendimento);
          const idade = calcularIdade(raw_nasc, pront.data_atendimento);
          const nome_pac = limparTexto(pac?.nome || pront.paciente_nome || '');
          const pacCd = (pac?.custom_data as any) || {};
          const unidadeCd = unitCd || {};
          const cid = rpad(limparTexto(pront.custom_data?.cid || pac?.cid || ''), 4);
          const quantidade = zfill(pront.custom_data?.quantidade_bpa || pront.custom_data?.quantidade || 1, 6);
          const carater = zfill(pront.custom_data?.carater_atendimento || pront.custom_data?.carater || '01', 2);
          const autorizacao = rpad(somenteNumeros(pront.custom_data?.numero_autorizacao || pacCd.numero_autorizacao || ''), 13);
          const raca = mapRacaCorBpa(pac?.raca_cor || pacCd.raca_cor || pacCd.racaCor);
          const etniaCadastro = somenteNumeros(pacCd.etnia_codigo || pacCd.etnia);
          const etnia = raca === '05' ? rpad(etniaCadastro, 4) : '    ';

          // Nacionalidade: usar APENAS código oficial do cadastro do paciente. Sem fallback.
          let pendenciaPaciente = false;
          const nacRes = nacionalidadeBpa(pac);
          let nacionalidade: string;
          if (nacRes.codigo) {
            nacionalidade = nacRes.codigo;
          } else {
            nacionalidade = '   ';
            pendenciaPaciente = true;
            stats.missingNacionalidade++;
            const valorAtual = pac?.nacionalidade || pacCd.nacionalidade_codigo || pacCd.nacionalidade || 'Vazio';
            const motivo = nacRes.motivo || 'Inválido';
            warnings.push(`${ident}: Nacionalidade inválida — ${motivo} (valor: ${valorAtual}).`);
            details.missingNacionalidade.push({ ...itemDetail, pendencia: `Nacionalidade: ${motivo}`, valor_atual: String(valorAtual) });
          }

          // Etnia: obrigatória APENAS quando nacionalidade brasileira (010) + raça indígena (05)
          if (raca === '05' && nacionalidade === '010' && !etniaCadastro) {
            pendenciaPaciente = true;
            warnings.push(`${ident}: Etnia indígena é obrigatória para paciente brasileiro com raça/cor indígena.`);
          }

          const servico = fixedDigits(pront.custom_data?.servico || pront.custom_data?.servico_codigo || '', 3);
          const classificacao = fixedDigits(pront.custom_data?.classificacao || pront.custom_data?.classificacao_codigo || '', 3);
          const sequenciaEquipe = fixedDigits(pront.custom_data?.sequencia_equipe || unidadeCd.sequencia_equipe || '', 8);
          const areaEquipe = fixedDigits(pront.custom_data?.area_equipe || unidadeCd.area_equipe || '', 4);
          const cnpj = fixedDigits(unidadeCd.cnpj || unit?.cnpj || pacCd.cnpj || '', 14);
          const cep = fixedDigits(pac?.cep || pacCd.cep, 8);

          // Código de logradouro: derivar do tipo real. Sem chute.
          const logradouroCodigo = codigoLogradouroBpa(pac);
          let codigoLogradouro: string;
          if (logradouroCodigo) {
            codigoLogradouro = logradouroCodigo;
          } else {
            codigoLogradouro = '   ';
            const temEndereco = !!(pac?.logradouro || pac?.endereco || pacCd.logradouro || pacCd.endereco);
            if (temEndereco) {
              pendenciaPaciente = true;
              stats.missingLogradouro++;
              const valorAtual = pac?.tipo_logradouro || pacCd.tipo_logradouro || pac?.logradouro || pac?.endereco || 'Vazio';
              warnings.push(`${ident}: Código do logradouro não pôde ser determinado a partir do cadastro (${valorAtual}).`);
              details.missingLogradouro.push({ ...itemDetail, pendencia: 'Código de Logradouro Indeterminado', valor_atual: String(valorAtual) });
            }
          }
          const endereco = fixedText(pac?.logradouro || pac?.endereco || pacCd.logradouro || pacCd.endereco, 30);
          const complemento = fixedText(pac?.complemento || pacCd.complemento, 10);
          const numero = rpad(limparTexto(pac?.numero || pacCd.numero), 5);
          const bairro = fixedText(pac?.bairro || pacCd.bairro, 30);
          const telefone = fixedDigits(pac?.telefone || pacCd.telefone, 11);
          const email = rpad(String(pac?.email || pacCd.email || '').toUpperCase().replace(/[\r\n]/g, ' ').slice(0, 40), 40);
          const ineEquipe = fixedDigits(unidadeCd.ine || pront.custom_data?.ine_equipe || '', 10);
          const folhaBpa = Math.floor(exportedCount / 20) + 1;
          const sequenciaFolha = (exportedCount % 20) + 1;

          // Montagem do Layout oficial BPA-I: Registro 03 com 338 caracteres antes do CRLF
          let l = "";
          l += "03";                                      // 001-002 - Tipo Registro
          l += cnes;                                      // 003-009 - CNES
          l += zfill(competencia, 6);                     // 010-015 - Competência
          l += cns_prof;                                  // 016-030 - CNS Profissional
          l += cbo;                                       // 031-036 - CBO
          l += data_atend;                                // 037-044 - Data Atendimento
          l += zfill(folhaBpa, 3);                        // 045-047 - Folha BPA
          l += zfill(sequenciaFolha, 2);                  // 048-049 - Sequência na folha
          l += proc;                                      // 050-059 - Procedimento SIGTAP
          l += cns_pac;                                   // 060-074 - CNS Paciente
          l += sexo;                                      // 075-075 - Sexo
          l += municipio;                                 // 076-081 - Município IBGE
          l += cid;                                       // 082-085 - CID
          l += idade;                                     // 086-088 - Idade
          l += quantidade;                                // 089-094 - Quantidade
          l += carater;                                   // 095-096 - Caráter atendimento
          l += autorizacao;                               // 097-109 - Autorização
          l += "BPA";                                     // 110-112 - Origem
          l += rpad(nome_pac, 30);                        // 113-142 - Nome paciente
          l += data_nasc;                                 // 143-150 - Data nascimento
          l += raca;                                      // 151-152 - Raça/cor
          l += etnia;                                     // 153-156 - Etnia
          l += nacionalidade;                             // 157-159 - Nacionalidade
          l += servico;                                   // 160-162 - Serviço
          l += classificacao;                             // 163-165 - Classificação
          l += sequenciaEquipe;                           // 166-173 - Sequência equipe
          l += areaEquipe;                                // 174-177 - Área equipe
          l += cnpj;                                      // 178-191 - CNPJ
          l += cep;                                       // 192-199 - CEP paciente
          l += codigoLogradouro;                          // 200-202 - Código logradouro
          l += endereco;                                  // 203-232 - Endereço
          l += complemento;                               // 233-242 - Complemento
          l += numero;                                    // 243-247 - Número
          l += bairro;                                    // 248-277 - Bairro
          l += telefone;                                  // 278-288 - Telefone
          l += email;                                     // 289-328 - E-mail
          l += ineEquipe;                                 // 329-338 - INE equipe

          l = l.padEnd(BPA_I_RECORD_LENGTH, " ").slice(0, BPA_I_RECORD_LENGTH);
          
          if (l.length !== BPA_I_RECORD_LENGTH) {
            hasError = true;
            warnings.push(`${ident} (${data_atend}): Erro de tamanho na linha (${l.length}/${BPA_I_RECORD_LENGTH}).`);
          }
          
          if (pendenciaPaciente && !formData.exportar_com_pendencias) {
            criticalCount++;
            details.critical.push({ ...itemDetail, pendencia: 'Pendência de cadastro (nacionalidade/logradouro)', valor_atual: 'Corrigir cadastro' });
          } else {
            linhasProducao.push(l);
            itensControle.push({ procedimento: proc, quantidade });
            exportedCount++;
          }
        }
      });

      if (hasError) {
        setResults({
          totalFound: prontuarios.length,
          exportedCount: 0,
          warnings,
          criticalCount,
          stats,
          details,
          error: "O arquivo não foi gerado porque foram detectadas pendências críticas. Corrija os dados dos pacientes ou marque 'Exportar mesmo com pendências'.",
          fileName: '',
          blobUrl: null,
          headerPreview: null,
          headerDetails: null
        });
        setLoading(false);
        return;
      }

      // Geração do Cabeçalho oficial: Registro 01 com 130 caracteres antes do CRLF
      const qtdRegistros = zfill(exportedCount, 6);
      const totalFolhas = Math.max(1, Math.ceil(exportedCount / 20));
      const campoControle = calcularCampoControle(itensControle);
      const unidadeHeader = formData.unidade_id !== 'all'
        ? unidades.find((u) => u.id === formData.unidade_id)
        : unidades[0];
      const unidadeHeaderCd = (unidadeHeader?.custom_data as any) || {};
      const header = buildHeaderOficial({
        competencia: formData.competencia,
        totalRegistros: exportedCount,
        totalFolhas,
        campoControle,
        orgaoOrigem: unidadeHeader?.nome || 'SECRETARIA MUNICIPAL DE SAUDE',
        siglaOrigem: unidadeHeaderCd.sigla || 'SMS',
        documentoOrigem: unidadeHeaderCd.cnpj || unidadeHeader?.cnpj || unidadeHeaderCd.cpf || '',
        orgaoDestino: unidadeHeaderCd.orgao_destino_bpa || unidadeHeaderCd.orgao_saude_destino || 'SECRETARIA MUNICIPAL DE SAUDE',
        indicadorDestino: unidadeHeaderCd.indicador_destino_bpa || 'M',
        versaoSistema: unidadeHeaderCd.versao_bpa || 'SMSORIXI',
      });
      const headerBytes = toIsoBytes(header);

      // Arquivo ANSI/ISO-8859-1, sem BOM e com CRLF entre todas as linhas.
      const prodContent = linhasProducao.join('\r\n') + (linhasProducao.length ? '\r\n' : '');
      const prodBytes = toIsoBytes(prodContent);

      const total = new Uint8Array(headerBytes.length + CRLF_BYTES.length + prodBytes.length);
      total.set(headerBytes, 0);
      total.set(CRLF_BYTES, headerBytes.length);
      total.set(prodBytes, headerBytes.length + CRLF_BYTES.length);

      const blob = new Blob([total], { type: 'application/octet-stream' });
      const url = URL.createObjectURL(blob);
      const fileName = `PA${formData.competencia}.TXT`;

      console.log('[BPA] Header len bytes:', headerBytes.length);
      console.log('[BPA] Header HEX (50):', bytesToHex(Array.from(headerBytes).slice(0, 50)));
      console.log('[BPA] Header texto:', header);


      setResults({
        totalFound: prontuarios.length,
        exportedCount,
        warnings,
        criticalCount,
        stats,
        details,
        error: null,
        fileName,
        blobUrl: url,
        headerPreview: header,
        headerDetails: {
          tipo: header.substring(0, 2),
          identificacao: header.substring(2, 7),
          competencia: formData.competencia,
          registros: qtdRegistros,
          totalFolhas: zfill(totalFolhas, 6),
          campoControle,
          tamanho: header.length,
          recordLength: BPA_I_RECORD_LENGTH,
          headerHex: bytesToHex(Array.from(headerBytes).slice(0, 16)),
          crlf: true,
          bom: false,
          firstRecordPreview: linhasProducao[0] || '',
          firstRecordLength: linhasProducao[0]?.length || 0,
        }
      });

      toast.success('Exportação processada!');

    } catch (err: any) {
      console.error(err);
      setResults({
        totalFound: 0,
        exportedCount: 0,
        warnings: [],
        criticalCount: 0,
        stats,
        details,
        error: err.message || 'Erro ao processar dados.',
        fileName: '',
        blobUrl: null,
        headerPreview: null,
        headerDetails: null
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="container mx-auto p-6 space-y-6">
      <div className="flex flex-col gap-2">
        <h1 className="text-3xl font-bold tracking-tight">Exportar BPA-I Real</h1>
        <p className="text-muted-foreground">
          Gere arquivo BPA-I utilizando atendimentos realizados e dados cadastrais do sistema.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Filtros e Configurações</CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            <div className="space-y-2">
              <Label htmlFor="competencia">Competência (AAAAMM) *</Label>
              <Input 
                id="competencia" 
                name="competencia" 
                placeholder="202605" 
                value={formData.competencia} 
                onChange={handleChange}
                maxLength={6}
              />
            </div>

            <div className="space-y-2">
              <Label>Unidade</Label>
              <Select onValueChange={handleUnidadeChange} value={formData.unidade_id}>
                <SelectTrigger>
                  <SelectValue placeholder="Selecione a unidade" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todas as Unidades</SelectItem>
                  {unidades.map(u => (
                    <SelectItem key={u.id} value={u.id}>{u.nome}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Profissional</Label>
              <Select onValueChange={handleProfissionalChange} value={formData.profissional_id}>
                <SelectTrigger>
                  <SelectValue placeholder="Selecione o profissional" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos os Profissionais</SelectItem>
                  {profissionais.map(p => (
                    <SelectItem key={p.id} value={p.id}>{p.nome}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 pt-4 border-t">
            <div className="space-y-2">
              <Label htmlFor="cnes">CNES (Fallback)</Label>
              <Input id="cnes" name="cnes" value={formData.cnes} onChange={handleChange} maxLength={7} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="cns_profissional">CNS Profissional (Fallback)</Label>
              <Input id="cns_profissional" name="cns_profissional" value={formData.cns_profissional} onChange={handleChange} maxLength={15} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="cbo">CBO (Fallback)</Label>
              <Input id="cbo" name="cbo" value={formData.cbo} onChange={handleChange} maxLength={6} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="procedimento_padrao">Procedimento Padrão</Label>
              <Input id="procedimento_padrao" name="procedimento_padrao" value={formData.procedimento_padrao} onChange={handleChange} maxLength={10} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="municipio_padrao">Município Padrão (IBGE)</Label>
              <Input id="municipio_padrao" name="municipio_padrao" value={formData.municipio_padrao} onChange={handleChange} maxLength={6} />
            </div>
          </div>

          <div className="flex flex-col gap-4 mt-8">
            <div className="flex items-center space-x-2 border p-3 rounded-md bg-slate-50">
              <input 
                type="checkbox" 
                id="exportar_com_pendencias" 
                checked={formData.exportar_com_pendencias}
                onChange={(e) => setFormData(prev => ({ ...prev, exportar_com_pendencias: e.target.checked }))}
                className="h-4 w-4 rounded border-gray-300 text-primary focus:ring-primary"
              />
              <div className="grid gap-1.5 leading-none">
                <label
                  htmlFor="exportar_com_pendencias"
                  className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
                >
                  Exportar mesmo com pendências críticas
                </label>
                <p className="text-xs text-muted-foreground">
                  Marque esta opção para permitir o download mesmo que existam dados obrigatórios faltando (CNS, Sexo, Nascimento, Município).
                </p>
              </div>
            </div>

            <div className="flex gap-4">
              <Button onClick={handleGerar} disabled={loading || loadingData} className="px-8">
                {loading ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Gerando...
                  </>
                ) : (
                  'Gerar Arquivo BPA-I'
                )}
              </Button>
              <Button variant="outline" onClick={handleLimpar} disabled={loading}>
                Limpar Filtros
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {results && (
        <div className="space-y-6 animate-in fade-in slide-in-from-top-4 duration-300">
          {results.headerDetails && (
            <Card className="border-blue-200 bg-blue-50/30">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4 text-blue-600" />
                  Diagnóstico Técnico do Cabeçalho (Registro 01)
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
                  <div className="flex flex-col">
                    <span className="text-[10px] uppercase text-muted-foreground">Tipo</span>
                    <span className="font-mono text-sm">{results.headerDetails.tipo}</span>
                  </div>
                  <div className="flex flex-col">
                    <span className="text-[10px] uppercase text-muted-foreground">Identificação</span>
                    <span className="font-mono text-sm">{results.headerDetails.identificacao}</span>
                  </div>
                  <div className="flex flex-col">
                    <span className="text-[10px] uppercase text-muted-foreground">Registros</span>
                    <span className="font-mono text-sm">{results.headerDetails.registros}</span>
                  </div>
                  <div className="flex flex-col">
                    <span className="text-[10px] uppercase text-muted-foreground">Folhas</span>
                    <span className="font-mono text-sm">{results.headerDetails.totalFolhas}</span>
                  </div>
                  <div className="flex flex-col">
                    <span className="text-[10px] uppercase text-muted-foreground">Competência</span>
                    <span className="font-mono text-sm">{results.headerDetails.competencia}</span>
                  </div>
                  <div className="flex flex-col">
                    <span className="text-[10px] uppercase text-muted-foreground">Controle</span>
                    <span className="font-mono text-sm">{results.headerDetails.campoControle}</span>
                  </div>
                </div>
                <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
                  <div className="flex flex-col">
                    <span className="text-[10px] uppercase text-muted-foreground">Cabeçalho sem CRLF</span>
                    <span className="font-mono text-sm">{results.headerDetails.tamanho}</span>
                  </div>
                  <div className="flex flex-col">
                    <span className="text-[10px] uppercase text-muted-foreground">Registro sem CRLF</span>
                    <span className="font-mono text-sm">{results.headerDetails.firstRecordLength}</span>
                  </div>
                  <div className="flex flex-col">
                    <span className="text-[10px] uppercase text-muted-foreground">CRLF</span>
                    <span className="font-mono text-sm">{results.headerDetails.crlf ? 'SIM' : 'NÃO'}</span>
                  </div>
                  <div className="flex flex-col">
                    <span className="text-[10px] uppercase text-muted-foreground">BOM</span>
                    <span className="font-mono text-sm">{results.headerDetails.bom ? 'SIM' : 'NÃO'}</span>
                  </div>
                  <div className="flex flex-col">
                    <span className="text-[10px] uppercase text-muted-foreground">Início Registro</span>
                    <span className="font-mono text-sm">{results.headerDetails.firstRecordPreview.slice(0, 2)}</span>
                  </div>
                </div>
                
                <div className="space-y-1">
                  <span className="text-[10px] uppercase text-muted-foreground">Cabeçalho completo (ANSI / 130 caracteres sem CRLF)</span>
                  <div className="bg-slate-900 text-slate-50 p-3 rounded font-mono text-[10px] break-all whitespace-pre overflow-x-auto">
                    {results.headerPreview}
                  </div>
                  <div className="flex flex-col md:flex-row md:justify-between gap-1 text-[10px] text-muted-foreground">
                    <span>Tamanho real: {results.headerDetails.tamanho} caracteres</span>
                    <span>Primeiros bytes (HEX): {results.headerDetails.headerHex}</span>
                    <span>Encoding: ISO-8859-1 (Sem BOM)</span>
                  </div>
                </div>

              </CardContent>
            </Card>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 xl:grid-cols-8 gap-4">
            <Card className="bg-blue-50">
              <CardContent className="p-4 text-center">
                <div className="text-xl font-bold">{results.totalFound}</div>
                <div className="text-xs text-blue-600">Registros</div>
              </CardContent>
            </Card>

            {[
              { id: 'critical', label: 'Pendên. Críticas', count: results.criticalCount, color: 'red' },
              { id: 'missingCns', label: 'Sem CNS Pac.', count: results.stats.missingCns, color: 'amber' },
              { id: 'missingSexo', label: 'Sexo Indef.', count: results.stats.missingSexo, color: 'amber' },
              { id: 'invalidNascimento', label: 'Nascimento Inv.', count: results.stats.invalidNascimento, color: 'amber' },
              { id: 'missingMunicipio', label: 'Mun. Inválido', count: results.stats.missingMunicipio, color: 'amber' },
              { id: 'missingNacionalidade', label: 'Sem Nacionalidade', count: results.stats.missingNacionalidade, color: 'amber' },
              { id: 'missingLogradouro', label: 'Cód. Logradouro', count: results.stats.missingLogradouro, color: 'amber' },
              { id: 'missingCbo', label: 'Sem CBO Prof.', count: results.stats.missingCbo, color: 'amber' },
              { id: 'inferredSexo', label: 'Sexo Inferido', count: results.stats.inferredSexo, color: 'blue' },
              { id: 'fallbackCbo', label: 'CBO Fallback', count: results.stats.fallbackCbo, color: 'blue' }
            ].map((stat) => (
              <Card 
                key={stat.id}
                className={`cursor-pointer transition-all hover:ring-2 hover:ring-primary/50 ${
                  selectedCategory === stat.id ? 'ring-2 ring-primary bg-white shadow-md' : 
                  stat.count > 0 ? `bg-${stat.color}-50` : 'bg-green-50'
                }`}
                onClick={() => setSelectedCategory(selectedCategory === stat.id ? null : stat.id)}
              >
                <CardContent className="p-4 text-center">
                  <div className="text-xl font-bold">{stat.count}</div>
                  <div className={`text-xs text-${stat.color === 'slate' ? 'slate-600' : stat.color + '-700'}`}>{stat.label}</div>
                </CardContent>
              </Card>
            ))}
          </div>

          {selectedCategory && results.details[selectedCategory as keyof typeof results.details] && (
            <Card className="animate-in slide-in-from-top-2 duration-200 border-primary/20">
              <CardHeader className="pb-2 flex flex-row items-center justify-between">
                <div>
                  <CardTitle className="text-lg flex items-center gap-2">
                    Detalhes da pendência: {
                      selectedCategory === 'critical' ? 'Pendências Críticas (Bloqueantes)' :
                      selectedCategory === 'missingCns' ? 'Sem CNS Paciente' :
                      selectedCategory === 'missingSexo' ? 'Sexo Indefinido' :
                      selectedCategory === 'inferredSexo' ? 'Sexo Inferido pelo Nome' :
                      selectedCategory === 'missingCbo' ? 'Sem CBO Profissional' :
                      selectedCategory === 'fallbackCbo' ? 'CBO Fallback Informado' :
                      selectedCategory === 'invalidCbo' ? 'CBO Inválido' :
                      selectedCategory === 'defaultProc' ? 'Procedimento Padrão Utilizado' :
                      selectedCategory === 'invalidNascimento' ? 'Data de Nascimento Inválida' :
                      selectedCategory === 'missingNacionalidade' ? 'Nacionalidade Ausente ou Sem Código Oficial' :
                      selectedCategory === 'missingLogradouro' ? 'Código do Logradouro Indeterminado' :
                      selectedCategory === 'missingMunicipio' ? 'Município Inválido ou Ausente' : ''
                    }
                  </CardTitle>
                  <p className="text-sm text-muted-foreground mt-1">
                    Mostrando {results.details[selectedCategory as keyof typeof results.details].length} registros afetados.
                  </p>
                </div>
                <div className="flex gap-2">
                  <Button 
                    size="sm" 
                    variant="outline" 
                    className="h-8"
                    onClick={() => {
                      const data = results.details[selectedCategory as keyof typeof results.details];
                      const headers = ["Paciente", "CPF", "Nascimento", "Data Atendimento", "Profissional", "Unidade", "Procedimento", "Pendência", "Valor Atual"];
                      const csvContent = [
                        headers.join(","),
                        ...data.map(item => [
                          `"${item.paciente_nome}"`,
                          `"${item.paciente_cpf || ''}"`,
                          `"${item.paciente_nascimento || ''}"`,
                          `"${item.data_atendimento}"`,
                          `"${item.profissional_nome}"`,
                          `"${item.unidade_nome}"`,
                          `"${item.procedimento || ''}"`,
                          `"${item.pendencia}"`,
                          `"${item.valor_atual || ''}"`
                        ].join(","))
                      ].join("\n");
                      
                      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
                      const url = URL.createObjectURL(blob);
                      const link = document.createElement("a");
                      link.setAttribute("href", url);
                      link.setAttribute("download", `pendencias_${selectedCategory}_${formData.competencia}.csv`);
                      document.body.appendChild(link);
                      link.click();
                      document.body.removeChild(link);
                    }}
                  >
                    <Download className="mr-2 h-4 w-4" />
                    Exportar CSV
                  </Button>
                  <Button 
                    size="sm" 
                    variant="ghost" 
                    className="h-8 w-8 p-0"
                    onClick={() => setSelectedCategory(null)}
                  >
                    <X className="h-4 w-4" />
                  </Button>
                </div>
              </CardHeader>
              <CardContent>
                <div className="rounded-md border overflow-hidden">
                  <Table>
                    <TableHeader className="bg-slate-50">
                      <TableRow>
                        <TableHead>Paciente</TableHead>
                        <TableHead>Data Atendimento</TableHead>
                        <TableHead>Profissional</TableHead>
                        <TableHead>Unidade</TableHead>
                        <TableHead>Pendência / Valor</TableHead>
                        <TableHead className="text-right">Ação</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {results.details[selectedCategory as keyof typeof results.details].map((item, idx) => (
                        <TableRow key={`${item.id}-${idx}`}>
                          <TableCell>
                            <div className="font-medium">{item.paciente_nome}</div>
                            <div className="text-xs text-muted-foreground">
                              {item.paciente_cpf ? `CPF: ${item.paciente_cpf}` : 'Sem CPF'} | {item.paciente_nascimento ? `Nasc: ${formatarDataBR(item.paciente_nascimento)}` : 'Sem Nasc.'}
                            </div>
                          </TableCell>
                          <TableCell>{formatarDataBR(item.data_atendimento)}</TableCell>
                          <TableCell>
                            <div className="flex flex-col">
                              <span>{item.profissional_nome}</span>
                              <span className="text-xs text-muted-foreground">CBO: {item.cbo || '---'}</span>
                            </div>
                          </TableCell>
                          <TableCell>{item.unidade_nome}</TableCell>
                          <TableCell>
                            <div className="flex flex-col">
                              <span className="text-xs font-semibold uppercase">{item.pendencia}</span>
                              <span className="text-xs text-muted-foreground">{item.valor_atual}</span>
                              {item.sugestao && <span className="text-xs text-blue-600 italic">Sugestão: {item.sugestao}</span>}
                            </div>
                          </TableCell>
                          <TableCell className="text-right">
                            <div className="flex justify-end gap-2">
                              {item.paciente_id && (
                                <Button 
                                  variant="outline" 
                                  size="icon" 
                                  className="h-8 w-8" 
                                  title="Ver Paciente"
                                  onClick={() => navigate(`/painel/pacientes?id=${item.paciente_id}`)}
                                >
                                  <User className="h-4 w-4" />
                                </Button>
                              )}
                              {item.profissional_id && (
                                <Button 
                                  variant="outline" 
                                  size="icon" 
                                  className="h-8 w-8" 
                                  title="Ver Profissional"
                                  onClick={() => navigate(`/painel/funcionarios?id=${item.profissional_id}`)}
                                >
                                  <UserCog className="h-4 w-4" />
                                </Button>
                              )}
                            </div>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </CardContent>
            </Card>
          )}

          {results.error ? (
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertTitle>Erro na Geração</AlertTitle>
              <AlertDescription>{results.error}</AlertDescription>
            </Alert>
          ) : (
            <>
              <Alert className="bg-green-50 border-green-200">
                <CheckCircle2 className="h-4 w-4 text-green-600" />
                <AlertTitle className="text-green-800">Processamento Concluído</AlertTitle>
                <AlertDescription className="text-green-700">
                  {results.exportedCount} linhas geradas com sucesso. Verifique os avisos acima antes de baixar.
                </AlertDescription>
              </Alert>

              {results.blobUrl && (
                <Card className="border-primary/30 bg-slate-50">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-base flex items-center gap-2">
                      <CheckCircle2 className="h-4 w-4 text-primary" />
                      Resumo Final da Exportação
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="text-sm space-y-2">
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                      <div><div className="text-xs text-muted-foreground">Total encontrado</div><div className="font-bold text-lg">{results.totalFound}</div></div>
                      <div><div className="text-xs text-muted-foreground">Exportados no TXT</div><div className="font-bold text-lg text-green-700">{results.exportedCount}</div></div>
                      <div><div className="text-xs text-muted-foreground">Bloqueados</div><div className="font-bold text-lg text-red-700">{results.criticalCount}</div></div>
                      <div><div className="text-xs text-muted-foreground">Folhas no cabeçalho</div><div className="font-bold text-lg">{results.headerDetails?.totalFolhas}</div></div>
                    </div>
                    {results.criticalCount > 0 && (
                      <div className="pt-2 border-t text-xs space-y-1">
                        <div className="font-semibold text-red-700">Motivos dos bloqueios:</div>
                        {results.stats.missingNacionalidade > 0 && <div>• Nacionalidade inválida/ausente: <b>{results.stats.missingNacionalidade}</b></div>}
                        {results.stats.missingLogradouro > 0 && <div>• Código de logradouro indeterminado: <b>{results.stats.missingLogradouro}</b></div>}
                        {results.stats.missingCns > 0 && <div>• CNS ausente: <b>{results.stats.missingCns}</b></div>}
                        {results.stats.missingSexo > 0 && <div>• Sexo indefinido: <b>{results.stats.missingSexo}</b></div>}
                        {results.stats.invalidNascimento > 0 && <div>• Nascimento inválido: <b>{results.stats.invalidNascimento}</b></div>}
                        {results.stats.missingMunicipio > 0 && <div>• Município inválido: <b>{results.stats.missingMunicipio}</b></div>}
                      </div>
                    )}
                    <div className="pt-2 border-t text-xs text-muted-foreground">
                      ✓ Cabeçalho declara <b>{results.headerDetails?.registros}</b> registros — confere com {results.exportedCount} linhas no arquivo.
                      Registros bloqueados <b>não</b> entram no TXT nem na contagem.
                    </div>
                  </CardContent>
                </Card>
              )}

              {results.blobUrl && (
                <div className="flex justify-center p-4 bg-white border rounded-lg shadow-sm">
                  <a 
                    href={results.blobUrl} 
                    download={results.fileName}
                    className="inline-flex items-center justify-center rounded-md text-sm font-medium ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 bg-primary text-primary-foreground hover:bg-primary/90 h-11 px-8"
                  >
                    <Download className="mr-2 h-5 w-5" />
                    Baixar Arquivo {results.fileName}
                  </a>
                </div>
              )}

              {results.warnings.length > 0 && !selectedCategory && (
                <Card>
                  <CardHeader>
                    <CardTitle className="text-amber-700 flex items-center gap-2">
                      <AlertCircle className="h-5 w-5" />
                      Avisos e Pendências ({results.warnings.length})
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="max-h-60 overflow-y-auto space-y-1 text-sm text-muted-foreground font-mono bg-slate-50 p-4 rounded border">
                      {results.warnings.map((w, i) => (
                        <div key={i} className="border-b border-slate-200 last:border-0 py-1">
                          {w}
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
};

export default BpaExportar;