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
  if (s.length > tamanho) return s.slice(0, tamanho); // Regra do layout pode variar, mas zfill geralmente corta
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
    
    // Validação básica
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
      const { data: atendimentos, error: attError } = await supabase
        .from('atendimentos')
        .select(`
          *,
          pacientes (
            cns,
            nome,
            sexo,
            data_nascimento,
            endereco,
            municipio,
            cid
          )
        `)
        .gte('data', startDate)
        .lte('data', endDate)
        .eq('status', 'finalizado'); // Assumindo que queremos atendimentos finalizados

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

      let exportedCount = 0;
      const linhas: string[] = [];

      // Montar Cabeçalho
      const totalRegistrosZfill6 = zfill(atendimentos.length, 6);
      let header = `01BPAAMBULATCOMPET${competencia}${totalRegistrosZfill6}`;
      header = rpad(header, 205);
      
      if (header.length !== 205) {
        throw new Error(`Erro na geração do cabeçalho: tamanho ${header.length} em vez de 205.`);
      }
      linhas.push(header);

      // Processar Atendimentos
      atendimentos.forEach((att, index) => {
        const pac = att.pacientes;
        
        if (!att.data) {
          warnings.push(`Registro ${index + 1}: Atendimento ignorado (data ausente).`);
          return;
        }

        if (!pac) {
          warnings.push(`Registro ${index + 1}: Paciente não encontrado para o atendimento.`);
          return;
        }

        const cns_paciente = zfill(pac.cns || '0', 15);
        if (!pac.cns) warnings.push(`Registro ${index + 1} (${pac.nome || 'Sem Nome'}): CNS ausente, preenchido com zeros.`);
        
        const nome_paciente = limparTexto(pac.nome || '');
        if (!pac.nome) warnings.push(`Registro ${index + 1}: Nome do paciente ausente.`);

        let sexo = ' ';
        const s = (pac.sexo || '').toUpperCase();
        if (s.startsWith('M')) sexo = 'M';
        else if (s.startsWith('F')) sexo = 'F';

        const data_nasc = formatarData(pac.data_nascimento);
        const idade = calcularIdade(pac.data_nascimento, att.data);
        if (data_nasc === "00000000") warnings.push(`Registro ${index + 1} (${pac.nome}): Data de nascimento inválida/ausente.`);

        const cid = (att.cid || pac.cid || "0000").substring(0, 4);
        const proc = zfill(att.procedimento_sigtap || att.procedimento || formData.procedimento_padrao, 10);
        const data_atendimento = formatarData(att.data);
        const municipio = zfill(pac.municipio || formData.municipio_residencia, 6);
        const endereco = limparTexto(pac.endereco || '');

        // Layout BPA-I (205 chars)
        let l = "";
        l += "03";                                      // 001-002 (2)
        l += zfill(formData.cnes, 7);                   // 003-009 (7)
        l += zfill(formData.competencia, 6);            // 010-015 (6)
        l += zfill(formData.cns_profissional, 15);      // 016-030 (15)
        l += zfill(formData.cbo, 6);                    // 031-036 (6)
        l += zfill(proc, 10);                           // 037-046 (10)
        l += zfill(cns_paciente, 15);                   // 047-061 (15)
        l += sexo;                                      // 062 (1)
        l += " ";                                       // 063 (1)
        l += rpad(cid, 4);                              // 064-067 (4)
        l += zfill(idade, 3);                           // 068-070 (3)
        l += " ".repeat(6);                             // 071-076 (6)
        l += zfill(municipio, 6);                       // 077-082 (6)
        l += "000001";                                  // 083-088 (6)
        l += "001";                                     // 089-091 (3)
        l += " ".repeat(10);                            // 092-101 (10)
        l += zfill(data_atendimento, 8);                // 102-109 (8)
        l += rpad(nome_paciente, 40);                   // 110-149 (40)
        l += zfill(data_nasc, 8);                       // 150-157 (8)
        l += "99";                                      // 158-159 (2)
        l += " ".repeat(4);                             // 160-163 (4)
        l += "010";                                     // 164-166 (3)
        l += rpad(endereco, 30);                        // 167-196 (30)
        l += "00000";                                   // 197-201 (5)
        l += " ".repeat(3);                             // 202-204 (3)
        l += " ";                                       // 205 (1)

        if (l.length !== 205) {
          throw new Error(`Linha ${index + 1} gerada com tamanho ${l.length} em vez de 205.`);
        }

        linhas.push(l);
        exportedCount++;
      });

      const content = linhas.join('\r\n');
      
      // Encoding ISO-8859-1 (latin1)
      const encoder = new TextEncoder(); // TextEncoder defaults to utf-8, but we need latin1
      // Browser hack for latin1: using a manual mapping or just standard blob if it's mostly ASCII
      // Since requirements ask specifically for latin1 encoding:
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
        error: err.message || 'Erro ao consultar banco de dados.',
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
                  Buscando atendimentos...
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
                  <strong> {results.exportedCount}</strong> registros foram exportados com sucesso.
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
