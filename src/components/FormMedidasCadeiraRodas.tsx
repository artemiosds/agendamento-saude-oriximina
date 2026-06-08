import React, { useState, useEffect } from 'react';
import { Card, CardContent } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Printer, Upload } from "lucide-react";
import DiagramaCadeiraRodas from "./DiagramaCadeiraRodas";

interface FormMedidasCadeiraRodasProps {
  paciente: any;
  unidade: any;
  dataAvaliacao?: string;
  onSave?: (data: any) => void;
  initialData?: any;
  readOnly?: boolean;
}

const FormMedidasCadeiraRodas: React.FC<FormMedidasCadeiraRodasProps> = ({
  paciente,
  unidade,
  dataAvaliacao = new Date().toISOString().split('T')[0],
  onSave,
  initialData,
  readOnly = false
}) => {
  const [data, setData] = useState({
    data_avaliacao: dataAvaliacao,
    peso: '',
    altura: '',
    equipamento_solicitado: '',
    observacoes: '',
    medidas: {
      A: '', B: '', C: '', D: '', E: '', F: '', G: '', H: '', I: '', J: '', K: '', L: '', M: ''
    },
    ...initialData
  });

  const handleMedidaChange = (key: string, value: string) => {
    if (readOnly) return;
    setData(prev => ({
      ...prev,
      medidas: { ...prev.medidas, [key]: value }
    }));
  };

  const calcularIdade = (dataNasc: string) => {
    if (!dataNasc) return '';
    const today = new Date();
    const birthDate = new Date(dataNasc);
    let age = today.getFullYear() - birthDate.getFullYear();
    const m = today.getMonth() - birthDate.getMonth();
    if (m < 0 || (m === 0 && today.getDate() < birthDate.getDate())) {
      age--;
    }
    return age;
  };

  const medidasLabels: Record<string, string> = {
    A: 'Largura dos Ombros',
    B: 'Largura do Quadril',
    C: 'Largura das Costas',
    D: 'Do assento ao topo da cabeça',
    E: 'Do assento à Nuca',
    F: 'Do assento à borda inf. da escápula',
    G: 'Altura do assento ao ombro',
    H: 'Altura do assento axila esquerda',
    I: 'Altura do assento axila direita',
    J: 'Altura do assento ao cotovelo',
    K: 'Profundidade do assento',
    L: 'Do pé à base do joelho',
    M: 'Tamanho do pé'
  };

  const handlePrint = () => {
    window.print();
  };

  return (
    <div id="ficha-cadeira" className="space-y-6 max-w-4xl mx-auto p-4 bg-white">
      <div className="text-center space-y-1 border-b pb-4 mb-4">
        <h2 className="text-lg font-bold">CENTRO ESPECIALIZADO EM REABILITAÇÃO — CER II</h2>
        <h3 className="text-md font-semibold">OFICINA ORTOPÉDICA FIXA</h3>
        <div className="flex justify-between items-center mt-4 px-2">
          <p className="text-sm"><strong>Município:</strong> {unidade?.nome || '________________'}</p>
          <div className="flex items-center gap-2">
            <Label className="text-sm font-bold">Data da Avaliação:</Label>
            <Input 
              type="date" 
              className="w-40 h-8" 
              value={data.data_avaliacao}
              onChange={e => setData(prev => ({...prev, data_avaliacao: e.target.value}))}
              disabled={readOnly}
            />
          </div>
        </div>
      </div>

      <Card className="border shadow-none">
        <CardContent className="p-4 grid grid-cols-1 md:grid-cols-4 gap-4">
          <div className="md:col-span-2">
            <Label className="text-xs text-muted-foreground uppercase font-bold">Nome do Paciente</Label>
            <p className="font-semibold border-b pb-1">{paciente?.nome || '—'}</p>
          </div>
          <div>
            <Label className="text-xs text-muted-foreground uppercase font-bold">Idade</Label>
            <p className="font-semibold border-b pb-1">{calcularIdade(paciente?.dataNascimento) || '—'} anos</p>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <Label className="text-xs text-muted-foreground uppercase font-bold">Peso (kg)</Label>
              <Input 
                value={data.peso} 
                onChange={e => setData(prev => ({...prev, peso: e.target.value}))}
                disabled={readOnly}
                className="h-8"
              />
            </div>
            <div>
              <Label className="text-xs text-muted-foreground uppercase font-bold">Altura (cm)</Label>
              <Input 
                value={data.altura} 
                onChange={e => setData(prev => ({...prev, altura: e.target.value}))}
                disabled={readOnly}
                className="h-8"
              />
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="space-y-2">
        <Label className="font-bold">EQUIPAMENTO SOLICITADO:</Label>
        <Textarea 
          placeholder="Descreva o equipamento e especificações..."
          value={data.equipamento_solicitado}
          onChange={e => setData(prev => ({...prev, equipamento_solicitado: e.target.value}))}
          disabled={readOnly}
          className="min-h-[80px]"
        />
        <p className="text-[10px] text-muted-foreground italic">(Anexar sugestão de modelo com especificações)</p>
        {!readOnly && (
          <Button variant="outline" size="sm" className="flex items-center gap-2">
            <Upload className="w-4 h-4" /> Anexar PDF/Imagem
          </Button>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 items-start">
        <div>
          <Label className="font-bold mb-2 block">TABELA DE MEDIDAS</Label>
          <Table className="border">
            <TableHeader className="bg-muted/50">
              <TableRow>
                <TableHead className="w-10">Ref</TableHead>
                <TableHead>Descrição</TableHead>
                <TableHead className="w-24 text-right">Medida (cm)</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {Object.entries(medidasLabels).map(([key, label]) => (
                <TableRow key={key}>
                  <TableCell className="font-bold">{key}</TableCell>
                  <TableCell className="text-sm">{label}</TableCell>
                  <TableCell>
                    <Input 
                      type="number" 
                      className="h-7 text-right" 
                      value={data.medidas[key as keyof typeof data.medidas]}
                      onChange={e => handleMedidaChange(key, e.target.value)}
                      disabled={readOnly}
                    />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>

        <div className="space-y-4">
          <Label className="font-bold block">DIAGRAMA ANATÔMICO</Label>
          <DiagramaCadeiraRodas />
        </div>
      </div>

      <div className="space-y-2">
        <Label className="font-bold">OBSERVAÇÕES:</Label>
        <Textarea 
          value={data.observacoes}
          onChange={e => setData(prev => ({...prev, observacoes: e.target.value}))}
          disabled={readOnly}
          className="min-h-[100px]"
          rows={3}
        />
      </div>

      <div className="pt-8 mt-12 border-t flex flex-col items-center gap-2 print:mt-20">
        <div className="w-64 border-b border-black"></div>
        <p className="text-sm font-bold">Assinatura e carimbo do FISIOTERAPEUTA</p>
      </div>

      <div className="flex justify-end gap-4 mt-8 no-print">
        <Button variant="outline" onClick={handlePrint} className="flex items-center gap-2">
          <Printer className="w-4 h-4" /> 🖨️ Imprimir Ficha
        </Button>
        {!readOnly && (
          <Button onClick={() => onSave?.(data)}>
            Salvar Medidas
          </Button>
        )}
      </div>

      <style dangerouslySetInnerHTML={{ __html: `
        @media print {
          body * { visibility: hidden !important; }
          #ficha-cadeira, #ficha-cadeira * { visibility: visible !important; }
          #ficha-cadeira { 
            position: absolute !important; 
            left: 0 !important; 
            top: 0 !important; 
            width: 100% !important; 
            padding: 0 !important;
            margin: 0 !important;
          }
          .no-print { display: none !important; }
          @page { size: A4 portrait; margin: 15mm; }
          
          /* Forçar cores de fundo na impressão */
          * { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
          
          /* Rodapé de impressão */
          #ficha-cadeira::after {
            content: "Impresso por: " attr(data-user) " — " attr(data-date);
            position: fixed;
            bottom: 0;
            left: 0;
            font-size: 8px;
            color: #666;
          }
        }
      `}} />
    </div>
  );
};

export default FormMedidasCadeiraRodas;
