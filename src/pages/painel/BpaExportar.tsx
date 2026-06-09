import React, { useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Loader2, Download, AlertCircle, CheckCircle2 } from 'lucide-react';
import { toast } from 'sonner';

/**
 * Funções Obrigatórias conforme Requisitos
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

const BpaExportar: React.FC = () => {
  const [formData, setFormData] = useState({
    competencia: '',
    cnes: '4485890',
    cns_profissional: '',
    cbo: '',
    procedimento_padrao: '0301010072',
    municipio_residencia: '150530'
  });

  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState<{
    totalFound: number;
    exportedCount: number;
    warnings: string[];
    error: string | null;
    fileName: string;
    blobUrl: string | null;
  } | null>(null);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const handleLimpar = () => {
    setFormData({
      competencia: '',
      cnes: '4485890',
      cns_profissional: '',
      cbo: '',
      procedimento_padrao: '0301010072',
      municipio_residencia: '150530'
    });
    setResults(null);
  };

  const handleGerar = async () => {
    setResults(null);
    
    if (formData.competencia.length !== 6 || isNaN(Number(formData.competencia))) {
      toast.error('Competência deve ter 6 dígitos (AAAAMM)');
      return;
    }
    if (!formData.cnes || !formData.cns_profissional || !formData.cbo || !formData.procedimento_padrao || !formData.municipio_residencia) {
      toast.error('Preencha todos os campos obrigatórios');
      return;
    }

    setLoading(true);
    const warnings: string[] = [];
    
    try {
      const competencia = formData.competencia;
      const ano = competencia.substring(0, 4);
      const mes = competencia.substring(4, 6);
      
      const startDate = `${ano}-${mes}-01`;
      const endDate = new Date(parseInt(ano), parseInt(mes), 0).toISOString().split('T')[0];

      // Buscar atendimentos no mês
      const { data: atendimentos, error: attError } = await (supabase as any)
        .from('atendimentos')
        .select('*')
        .gte('data', startDate)
        .lte('data', endDate)
        .eq('status', 'finalizado');

      if (attError) throw attError;

      if (!atendimentos || atendimentos.length === 0) {
        setResults({
          totalFound: 0,
          exportedCount: 0,
          warnings: ["Nenhum atendimento encontrado para esta competência."],
          error: null,
          fileName: '',
          blobUrl: null
        });
        setLoading(false);
        return;
      }

      // Buscar dados dos pacientes relacionados
      const pacienteIds = [...new Set(atendimentos.map((a: any) => a.paciente_id).filter(Boolean))];
      const { data: pacientes, error: pacError } = await (supabase as any)
        .from('pacientes')
        .select('id, cns, nome, sexo, data_nascimento, endereco, municipio, cid, custom_data')
        .in('id', pacienteIds);

      if (pacError) throw pacError;

      const pacMap = new Map();
      (pacientes || []).forEach((p: any) => pacMap.set(p.id, p));

      let exportedCount = 0;
      const linhas: string[] = [];

      // Cabeçalho (Line 1)
      const totalRegistrosZfill6 = zfill(atendimentos.length, 6);
      let header = `01BPAAMBULATCOMPET${competencia}${totalRegistrosZfill6}`;
      header = rpad(header, 205);
      
      if (header.length !== 205) {
        throw new Error(`Erro na geração do cabeçalho: tamanho ${header.length} em vez de 205.`);
      }
      linhas.push(header);

      // Linhas de Atendimento
      atendimentos.forEach((att: any, index: number) => {
        const pac = pacMap.get(att.paciente_id);
        
        if (!att.data) {
          warnings.push(`Registro ${index + 1}: Atendimento ignorado (data ausente).`);
          return;
        }

        if (!pac) {
          warnings.push(`Registro ${index + 1}: Paciente ID ${att.paciente_id} não encontrado.`);
          return;
        }

        const cd = pac.custom_data || {};
        
        // CNS Paciente
        const rawCns = pac.cns || cd.cns || '';
        const cns_paciente = zfill(rawCns, 15);
        if (!rawCns) warnings.push(`Registro ${index + 1} (${pac.nome || 'Sem Nome'}): CNS ausente, preenchido com zeros.`);
        
        // Nome Paciente
        const nome_paciente = limparTexto(pac.nome || att.paciente_nome || '');
        if (!pac.nome && !att.paciente_nome) warnings.push(`Registro ${index + 1}: Nome do paciente ausente.`);

        // Sexo
        let sexo = ' ';
        const s = (pac.sexo || cd.sexo || '').toUpperCase();
        if (s.startsWith('M')) sexo = 'M';
        else if (s.startsWith('F')) sexo = 'F';

        // Data Nascimento e Idade
        const rawNasc = pac.data_nascimento || cd.data_nascimento || '';
        const data_nasc = formatarData(rawNasc);
        const idade = calcularIdade(rawNasc, att.data);
        if (data_nasc === "00000000") warnings.push(`Registro ${index + 1} (${pac.nome}): Data de nascimento inválida/ausente.`);

        // CID
        // Em atendimentos reais, o CID costuma vir do prontuário vinculado, mas os requisitos pedem das tabelas existentes.
        // Verificamos no atendimento, depois no paciente.
        const attCd = att.custom_data || {};
        const cid = (attCd.cid || att.cid || pac.cid || cd.cid || "0000").substring(0, 4);
        
        // Procedimento
        const procRaw = attCd.procedimento_sigtap || att.procedimento_sigtap || att.procedimento || formData.procedimento_padrao;
        const proc = zfill(procRaw, 10);
        
        const data_atendimento = formatarData(att.data);
        
        const municipioRaw = pac.municipio || cd.municipio || cd.municipio_ibge || formData.municipio_residencia;
        const municipio = zfill(municipioRaw, 6);
        
        const endereco = limparTexto(pac.endereco || cd.endereco || '');

        // Montagem do Layout BPA-I (205 chars fixos)
        let l = "";
        l += "03";                                      // 001-002 (2) - Tipo Registro
        l += zfill(formData.cnes, 7);                   // 003-009 (7) - CNES
        l += zfill(formData.competencia, 6);            // 010-015 (6) - Competência
        l += zfill(formData.cns_profissional, 15);      // 016-030 (15) - CNS Profissional
        l += zfill(formData.cbo, 6);                    // 031-036 (6) - CBO
        l += zfill(proc, 10);                           // 037-046 (10) - Procedimento
        l += zfill(cns_paciente, 15);                   // 047-061 (15) - CNS Paciente
        l += sexo;                                      // 062 (1) - Sexo
        l += " ";                                       // 063 (1) - Espaço fixo
        l += rpad(cid, 4);                              // 064-067 (4) - CID
        l += zfill(idade, 3);                           // 068-070 (3) - Idade
        l += " ".repeat(6);                             // 071-076 (6) - Espaços
        l += zfill(municipio, 6);                       // 077-082 (6) - Município
        l += "000001";                                  // 083-088 (6) - Quantidade (Fixo 1)
        l += "001";                                     // 089-091 (3) - Incremento? (Fixo 001)
        l += " ".repeat(10);                            // 092-101 (10) - Espaços
        l += zfill(data_atendimento, 8);                // 102-109 (8) - Data Atendimento
        l += rpad(nome_paciente, 40);                   // 110-149 (40) - Nome Paciente
        l += zfill(data_nasc, 8);                       // 150-157 (8) - Data Nascimento
        l += "99";                                      // 158-159 (2) - Origem? (Fixo 99)
        l += " ".repeat(4);                             // 160-163 (4) - Espaços
        l += "010";                                     // 164-166 (3) - Serviço/Classificação (Fixo 010)
        l += rpad(endereco, 30);                        // 167-196 (30) - Endereço
        l += "00000";                                   // 197-201 (5) - Espaços
        l += " ".repeat(3);                             // 202-204 (3) - Espaços
        l += " ";                                       // 205 (1) - Espaço final

        if (l.length !== 205) {
          throw new Error(`Linha ${index + 1} (${pac.nome}) gerada com tamanho ${l.length} em vez de 205.`);
        }

        linhas.push(l);
        exportedCount++;
      });

      const content = linhas.join('\r\n');
      
      // Conversão manual para Latin1 (ISO-8859-1)
      const bytes = new Uint8Array(content.length);
      for (let i = 0; i < content.length; i++) {
        const code = content.charCodeAt(i);
        bytes[i] = code < 256 ? code : 63; // 63 is '?' fallback
      }
      
      const blob = new Blob([bytes], { type: 'text/plain;charset=ISO-8859-1' });
      const url = URL.createObjectURL(blob);
      const fileName = `producao_bpa_${competencia}.txt`;

      setResults({
        totalFound: atendimentos.length,
        exportedCount,
        warnings,
        error: null,
        fileName,
        blobUrl: url
      });

      toast.success('Arquivo gerado com sucesso!');

    } catch (err: any) {
      console.error(err);
      setResults({
        totalFound: 0,
        exportedCount: 0,
        warnings: [],
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
        <h1 className="text-3xl font-bold tracking-tight">Exportar BPA-I</h1>
        <p className="text-muted-foreground">
          Gere arquivo BPA-I do DATASUS a partir dos atendimentos do mês selecionado.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Configurações da Exportação</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            <div className="space-y-2">
              <Label htmlFor="competencia">Competência (AAAAMM) *</Label>
              <Input 
                id="competencia" 
                name="competencia" 
                placeholder="Ex: 202605" 
                value={formData.competencia} 
                onChange={handleChange}
                maxLength={6}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="cnes">CNES *</Label>
              <Input 
                id="cnes" 
                name="cnes" 
                value={formData.cnes} 
                onChange={handleChange}
                maxLength={7}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="cns_profissional">CNS Profissional *</Label>
              <Input 
                id="cns_profissional" 
                name="cns_profissional" 
                placeholder="15 dígitos" 
                value={formData.cns_profissional} 
                onChange={handleChange}
                maxLength={15}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="cbo">CBO *</Label>
              <Input 
                id="cbo" 
                name="cbo" 
                placeholder="6 dígitos" 
                value={formData.cbo} 
                onChange={handleChange}
                maxLength={6}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="procedimento_padrao">Procedimento Padrão *</Label>
              <Input 
                id="procedimento_padrao" 
                name="procedimento_padrao" 
                value={formData.procedimento_padrao} 
                onChange={handleChange}
                maxLength={10}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="municipio_residencia">Município Residência *</Label>
              <Input 
                id="municipio_residencia" 
                name="municipio_residencia" 
                value={formData.municipio_residencia} 
                onChange={handleChange}
                maxLength={6}
              />
            </div>
          </div>

          <div className="flex gap-4 mt-6">
            <Button onClick={handleGerar} disabled={loading} className="w-full md:w-auto">
              {loading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Processando...
                </>
              ) : (
                'Gerar BPA-I'
              )}
            </Button>
            <Button variant="outline" onClick={handleLimpar} disabled={loading} className="w-full md:w-auto">
              Limpar
            </Button>
          </div>
        </CardContent>
      </Card>

      {results && (
        <div className="space-y-4 animate-in fade-in slide-in-from-top-4">
          {results.error ? (
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertTitle>Erro</AlertTitle>
              <AlertDescription>{results.error}</AlertDescription>
            </Alert>
          ) : (
            <>
              <Alert className="border-green-500 bg-green-50">
                <CheckCircle2 className="h-4 w-4 text-green-500" />
                <AlertTitle className="text-green-700">Geração Concluída</AlertTitle>
                <AlertDescription className="text-green-600">
                  Foram encontrados <strong>{results.totalFound}</strong> atendimentos. 
                  <strong> {results.exportedCount}</strong> registros foram exportados.
                </AlertDescription>
              </Alert>

              {results.blobUrl && (
                <div className="flex justify-center">
                  <Button asChild size="lg" className="bg-green-600 hover:bg-green-700">
                    <a href={results.blobUrl} download={results.fileName}>
                      <Download className="mr-2 h-5 w-5" />
                      Baixar Arquivo ({results.fileName})
                    </a>
                  </Button>
                </div>
              )}

              {results.warnings.length > 0 && (
                <Card className="border-yellow-200">
                  <CardHeader className="py-3 bg-yellow-50">
                    <CardTitle className="text-sm font-medium text-yellow-800">
                      Avisos e Observações ({results.warnings.length})
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="py-3">
                    <ul className="list-disc list-inside text-xs text-muted-foreground space-y-1 max-h-48 overflow-y-auto">
                      {results.warnings.map((w, i) => (
                        <li key={i}>{w}</li>
                      ))}
                    </ul>
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
