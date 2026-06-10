import React, { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Loader2, Download, AlertCircle, CheckCircle2, User, UserCog, ExternalLink, X } from 'lucide-react';
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
    .replace(/[^A-Z0-9 ]/g, " ")    // remove tudo que não for A-Z, 0-9 ou espaço
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

const rpad = (valor: string, tamanho: number): string => {
  const s = valor || '';
  if (s.length > tamanho) return s.slice(0, tamanho);
  return s.padEnd(tamanho, ' ');
};

const formatarData = (date: any): string => {
  if (!date) return "00000000";
  try {
    const d = new Date(date);
    if (isNaN(d.getTime())) return "00000000";
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${year}${month}${day}`;
  } catch {
    return "00000000";
  }
};

const calcularIdade = (dataNasc: any, dataAtendimento: any): string => {
  if (!dataNasc || !dataAtendimento) return "000";
  try {
    const nasc = new Date(dataNasc);
    const aten = new Date(dataAtendimento);
    if (isNaN(nasc.getTime()) || isNaN(aten.getTime())) return "000";
    
    let idade = aten.getFullYear() - nasc.getFullYear();
    const m = aten.getMonth() - nasc.getMonth();
    if (m < 0 || (m === 0 && aten.getDate() < nasc.getDate())) {
      idade--;
    }
    return zfill(Math.max(0, idade), 3);
  } catch {
    return "000";
  }
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
    municipio_padrao: '150530'
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
    stats: {
      missingCns: number;
      missingSexo: number;
      inferredSexo: number;
      missingMunicipio: number;
      missingCbo: number;
      fallbackCbo: number;
      invalidCbo: number;
      defaultProc: number;
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
    };
    error: string | null;
    fileName: string;
    blobUrl: string | null;
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
      municipio_padrao: '150530'
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
      defaultProc: 0
    };

    const details = {
      missingCns: [] as any[],
      missingSexo: [] as any[],
      inferredSexo: [] as any[],
      missingMunicipio: [] as any[],
      missingCbo: [] as any[],
      fallbackCbo: [] as any[],
      invalidCbo: [] as any[],
      defaultProc: [] as any[]
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
          stats,
          details,
          error: null,
          fileName: '',
          blobUrl: null
        });
        setLoading(false);
        return;
      }

      const pacienteIds = [...new Set(prontuarios.map((p: any) => p.paciente_id).filter(Boolean))] as string[];
      const profIds = [...new Set(prontuarios.map((p: any) => p.profissional_id).filter(Boolean))] as string[];
      const unidadeIds = [...new Set(prontuarios.map((p: any) => p.unidade_id).filter(Boolean))] as string[];

      const [pacientesRes, funcionariosRes, unidadesRes] = await Promise.all([
        supabase.from('pacientes').select('*').in('id', pacienteIds),
        supabase.from('funcionarios').select('*').in('id', profIds),
        supabase.from('unidades').select('*').in('id', unidadeIds)
      ]);

      const pacMap = new Map(pacientesRes.data?.map(p => [p.id, p]));
      const funcMap = new Map(funcionariosRes.data?.map(f => [f.id, f]));
      const unitMap = new Map(unidadesRes.data?.map(u => [u.id, u]));

      let exportedCount = 0;
      const linhas: string[] = [];

      // Cabeçalho (Line 1)
      const totalRegistrosZfill6 = zfill(prontuarios.length, 6);
      let header = `01BPAAMBULATCOMPET${competencia}${totalRegistrosZfill6}`;
      header = rpad(header, 205);
      linhas.push(header);

      // Linhas de Produção
      prontuarios.forEach((pront: any, index: number) => {
        const pac = pacMap.get(pront.paciente_id) as any;
        const prof = funcMap.get(pront.profissional_id) as any;
        const unit = unitMap.get(pront.unidade_id) as any;
        
        const ident = pac?.nome || pront.paciente_nome || `Registro ${index + 1}`;
        const itemDetail = {
          id: pront.id,
          paciente_id: pront.paciente_id,
          paciente_nome: ident,
          paciente_cpf: pac?.cpf,
          paciente_nascimento: pac?.data_nascimento,
          data_atendimento: pront.data_atendimento,
          profissional_id: pront.profissional_id,
          profissional_nome: prof?.nome || 'Profissional não encontrado',
          unidade_id: pront.unidade_id,
          unidade_nome: unit?.nome || 'Unidade não encontrada',
          procedimento: pront.custom_data?.procedimento_sigtap || pront.outro_procedimento,
          cns_paciente: pac?.cns,
          sexo: pac?.sexo,
          municipio: pac?.municipio || (pac?.custom_data as any)?.municipio_ibge,
          cbo: obterCboValido(prof)
        };

        // CNES
        const unitCd = unit?.custom_data as any;
        const cnesValue = unitCd?.cnes || unit?.cnes || formData.cnes;
        const cnes = zfill(cnesValue, 7);
        if (!cnes || cnes === '0000000') warnings.push(`${ident}: CNES da unidade ausente.`);

        // CNS Profissional
        const profCd = prof?.custom_data as any;
        const cns_prof_value = prof?.cns || profCd?.cns || formData.cns_profissional;
        const cns_prof = zfill(cns_prof_value, 15);
        if (!cns_prof || cns_prof === '000000000000000') warnings.push(`${ident}: CNS do profissional ausente.`);

        // CBO
        let cbo_raw = obterCboValido(prof);
        let usando_fallback_cbo = false;

        if (!cbo_raw) {
          const fallback_limpo = somenteNumeros(formData.cbo);
          if (fallback_limpo.length === 6) {
            cbo_raw = fallback_limpo;
            usando_fallback_cbo = true;
            stats.fallbackCbo++;
            details.fallbackCbo.push({ ...itemDetail, pendencia: 'CBO Fallback', valor_atual: 'Usando padrão informado' });
          }
        }

        const cbo = zfill(cbo_raw, 6);
        if (!cbo_raw || cbo === '000000') {
          stats.missingCbo++;
          details.missingCbo.push({ ...itemDetail, pendencia: 'Sem CBO Prof.', valor_atual: 'Ausente' });
          warnings.push(`${ident}: CBO do profissional ausente ou inválido (deve ter 6 dígitos).`);
        } else if (usando_fallback_cbo) {
          warnings.push(`${ident}: CBO usando fallback informado manualmente.`);
        }

        if (formData.cbo && somenteNumeros(formData.cbo).length !== 6 && !obterCboValido(prof)) {
          stats.invalidCbo++;
          details.invalidCbo.push({ ...itemDetail, pendencia: 'CBO Inválido', valor_atual: formData.cbo });
        }

        // Procedimento
        const proc_real = pront.custom_data?.procedimento_sigtap || pront.outro_procedimento;
        const procRaw = proc_real || formData.procedimento_padrao;
        if (!proc_real) {
          stats.defaultProc++;
          details.defaultProc.push({ ...itemDetail, pendencia: 'Proc. Padrão', valor_atual: 'Usando padrão informado' });
        }
        const proc = zfill(procRaw, 10);

        // Paciente
        const pacCd = pac?.custom_data as any;
        const cns_pac_value = pac?.cns || pacCd?.cns;
        const cns_pac = zfill(cns_pac_value || '', 15);
        if (!cns_pac || cns_pac === '000000000000000') {
          stats.missingCns++;
          details.missingCns.push({ ...itemDetail, pendencia: 'Sem CNS Pac.', valor_atual: 'Ausente' });
          warnings.push(`${ident}: CNS do paciente ausente.`);
        }

        const nome_pac = limparTexto(pac?.nome || pront.paciente_nome || '');
        
        let sexo = ' ';
        const raw_sexo = (pac?.sexo || pacCd?.sexo || '').toUpperCase();
        
        if (raw_sexo.startsWith('M') || raw_sexo === 'MASCULINO' || raw_sexo === 'MALE') {
          sexo = 'M';
        } else if (raw_sexo.startsWith('F') || raw_sexo === 'FEMININO' || raw_sexo === 'FEMALE') {
          sexo = 'F';
        } else {
          // Tenta inferir pelo nome
          const inferred = inferirSexoPorNome(pac?.nome || pront.paciente_nome || '');
          if (inferred) {
            sexo = inferred;
            stats.inferredSexo++;
            details.inferredSexo.push({ ...itemDetail, pendencia: 'Sexo Inferido', valor_atual: 'Indefinido', sugestao: inferred });
            warnings.push(`${ident}: Sexo inferido pelo nome (${inferred}).`);
          }
        }
        
        if (sexo === ' ') {
          stats.missingSexo++;
          details.missingSexo.push({ ...itemDetail, pendencia: 'Sexo Indef.', valor_atual: 'Indefinido' });
          warnings.push(`${ident}: Sexo do paciente ausente e não foi possível inferir.`);
        }

        const data_nasc = formatarData(pac?.data_nascimento || pacCd?.data_nascimento);
        const data_atend = formatarData(pront.data_atendimento);
        const idade = calcularIdade(pac?.data_nascimento || pacCd?.data_nascimento, pront.data_atendimento);

        // Município
        const mun_real = pac?.municipio || pacCd?.municipio_ibge;
        const municipio = zfill(mun_real || formData.municipio_padrao, 6);
        if (!mun_real) {
          stats.missingMunicipio++;
          details.missingMunicipio.push({ ...itemDetail, pendencia: 'Sem Município', valor_atual: 'Usando padrão' });
          warnings.push(`${ident}: Município do paciente usando padrão.`);
        }

        // CID
        const cid = (pront.custom_data?.cid || pac?.cid || '0000').substring(0, 4);

        const endereco = limparTexto(pac?.endereco || pacCd?.endereco || '');

        // Montagem do Layout BPA-I (205 chars fixos)
        let l = "";
        l += "03";                                      // 001-002 (2) - Tipo Registro
        l += cnes;                                      // 003-009 (7) - CNES
        l += zfill(competencia, 6);                     // 010-015 (6) - Competência
        l += cns_prof;                                  // 016-030 (15) - CNS Profissional
        l += cbo;                                       // 031-036 (6) - CBO
        l += proc;                                      // 037-046 (10) - Procedimento
        l += cns_pac;                                   // 047-061 (15) - CNS Paciente
        l += sexo;                                      // 062 (1) - Sexo
        l += " ";                                       // 063 (1) - Espaço fixo
        l += rpad(cid, 4);                              // 064-067 (4) - CID
        l += idade;                                     // 068-070 (3) - Idade
        l += " ".repeat(6);                             // 071-076 (6) - Espaços
        l += municipio;                                 // 077-082 (6) - Município
        l += "000001";                                  // 083-088 (6) - Quantidade
        l += "001";                                     // 089-091 (3) - Incremento
        l += " ".repeat(10);                            // 092-101 (10) - Espaços
        l += data_atend;                                // 102-109 (8) - Data Atendimento
        l += rpad(nome_pac, 40);                        // 110-149 (40) - Nome Paciente
        l += data_nasc;                                 // 150-157 (8) - Data Nascimento
        l += "99";                                      // 158-159 (2) - Origem (Fixo 99)
        l += " ".repeat(4);                             // 160-163 (4) - Espaços
        l += "010";                                     // 164-166 (3) - Serviço/Classificação
        l += rpad(endereco, 30);                        // 167-196 (30) - Endereço
        l += "00000";                                   // 197-201 (5) - Espaços
        l += " ".repeat(3);                             // 202-204 (3) - Espaços
        l += " ";                                       // 205 (1) - Espaço final

        if (l.length === 205) {
          linhas.push(l);
          exportedCount++;
        } else {
          warnings.push(`${ident}: Erro de tamanho na linha (${l.length}/205)`);
        }
      });

      const content = linhas.join('\r\n');
      const bytes = new Uint8Array(content.length);
      for (let i = 0; i < content.length; i++) {
        const code = content.charCodeAt(i);
        bytes[i] = code < 256 ? code : 63;
      }
      
      const blob = new Blob([bytes], { type: 'text/plain;charset=ISO-8859-1' });
      const url = URL.createObjectURL(blob);
      const fileName = `producao_bpa_${competencia}.txt`;

      setResults({
        totalFound: prontuarios.length,
        exportedCount,
        warnings,
        stats,
        details,
        error: null,
        fileName,
        blobUrl: url
      });

      toast.success('Exportação processada!');

    } catch (err: any) {
      console.error(err);
      setResults({
        totalFound: 0,
        exportedCount: 0,
        warnings: [],
        stats,
        details,
        error: err.message || 'Erro ao processar dados.',
        fileName: '',
        blobUrl: null
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

          <div className="flex gap-4 mt-8">
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
        </CardContent>
      </Card>

      {results && (
        <div className="space-y-6 animate-in fade-in slide-in-from-top-4 duration-300">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 xl:grid-cols-8 gap-4">
            <Card className="bg-blue-50">
              <CardContent className="p-4 text-center">
                <div className="text-xl font-bold">{results.totalFound}</div>
                <div className="text-xs text-blue-600">Registros</div>
              </CardContent>
            </Card>

            {[
              { id: 'missingCns', label: 'Sem CNS Pac.', count: results.stats.missingCns, color: 'amber' },
              { id: 'missingSexo', label: 'Sexo Indef.', count: results.stats.missingSexo, color: 'amber' },
              { id: 'inferredSexo', label: 'Sexo Inferido', count: results.stats.inferredSexo, color: 'blue' },
              { id: 'missingCbo', label: 'Sem CBO Prof.', count: results.stats.missingCbo, color: 'amber' },
              { id: 'fallbackCbo', label: 'CBO Fallback', count: results.stats.fallbackCbo, color: 'blue' },
              { id: 'invalidCbo', label: 'CBO Inválido', count: results.stats.invalidCbo, color: 'red' },
              { id: 'defaultProc', label: 'Proc. Padrão', count: results.stats.defaultProc, color: 'slate' },
              { id: 'missingMunicipio', label: 'Sem Município', count: results.stats.missingMunicipio, color: 'amber' }
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
                      selectedCategory === 'missingCns' ? 'Sem CNS Paciente' :
                      selectedCategory === 'missingSexo' ? 'Sexo Indefinido' :
                      selectedCategory === 'inferredSexo' ? 'Sexo Inferido pelo Nome' :
                      selectedCategory === 'missingCbo' ? 'Sem CBO Profissional' :
                      selectedCategory === 'fallbackCbo' ? 'CBO Fallback Informado' :
                      selectedCategory === 'invalidCbo' ? 'CBO Inválido' :
                      selectedCategory === 'defaultProc' ? 'Procedimento Padrão Utilizado' :
                      selectedCategory === 'missingMunicipio' ? 'Sem Município (Usando Padrão)' : ''
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
                              {item.paciente_cpf ? `CPF: ${item.paciente_cpf}` : 'Sem CPF'} | {item.paciente_nascimento ? `Nasc: ${new Date(item.paciente_nascimento).toLocaleDateString()}` : 'Sem Nasc.'}
                            </div>
                          </TableCell>
                          <TableCell>{new Date(item.data_atendimento).toLocaleDateString()}</TableCell>
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
                                  onClick={() => navigate(`/pacientes/${item.paciente_id}`)}
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
                                  onClick={() => navigate(`/configuracoes/funcionarios`)} // Rota geral de funcionários
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