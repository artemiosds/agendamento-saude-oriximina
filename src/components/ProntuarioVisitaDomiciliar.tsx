import React, { useState } from 'react';
import { Card, CardContent } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Home, User, Calendar, MapPin, ClipboardList, Printer, Save } from "lucide-react";
import FormMedidasCadeiraRodas from "./FormMedidasCadeiraRodas";

interface ProntuarioVisitaDomiciliarProps {
  paciente: any;
  profissional: any;
  unidade: any;
  onSave: (atendimentoData: any) => void;
  initialData?: any;
}

const ProntuarioVisitaDomiciliar: React.FC<ProntuarioVisitaDomiciliarProps> = ({
  paciente,
  profissional,
  unidade,
  onSave,
  initialData
}) => {
  const [evolucao, setEvolucao] = useState(initialData?.evolucao_texto || '');
  const [procedimentoTipo, setProcedimentoTipo] = useState(initialData?.procedimento_tipo || '');
  const [outroProcedimento, setOutroProcedimento] = useState(initialData?.outro_procedimento || '');
  const [dadosProcedimento, setDadosProcedimento] = useState(initialData?.dados_procedimento || null);

  const handleFinalizar = () => {
    const payload = {
      tipo_atendimento: 'visita_domiciliar',
      evolucao_texto: evolucao,
      procedimento_tipo: procedimentoTipo,
      outro_procedimento: outroProcedimento,
      dados_procedimento: dadosProcedimento,
      data_atendimento: new Date().toISOString().split('T')[0]
    };
    onSave(payload);
  };

  return (
    <div className="space-y-6 max-w-5xl mx-auto pb-12">
      {/* Cabeçalho */}
      <Card className="border-l-4 border-l-primary shadow-sm bg-primary/5">
        <CardContent className="p-4">
          <div className="flex items-center gap-3 mb-4">
            <div className="p-2 bg-primary/10 rounded-full">
              <Home className="w-6 h-6 text-primary" />
            </div>
            <h1 className="text-xl font-bold text-primary uppercase">Visita Domiciliar</h1>
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="flex items-center gap-2">
              <User className="w-4 h-4 text-muted-foreground" />
              <div className="text-sm">
                <span className="text-muted-foreground block text-[10px] uppercase font-bold">Paciente</span>
                <span className="font-semibold">{paciente?.nome || '—'}</span>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Calendar className="w-4 h-4 text-muted-foreground" />
              <div className="text-sm">
                <span className="text-muted-foreground block text-[10px] uppercase font-bold">Data</span>
                <span className="font-semibold">{new Date().toLocaleDateString('pt-BR')}</span>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <User className="w-4 h-4 text-muted-foreground" />
              <div className="text-sm">
                <span className="text-muted-foreground block text-[10px] uppercase font-bold">Profissional</span>
                <span className="font-semibold">{profissional?.nome || '—'}</span>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <MapPin className="w-4 h-4 text-muted-foreground" />
              <div className="text-sm">
                <span className="text-muted-foreground block text-[10px] uppercase font-bold">Município / Unidade</span>
                <span className="font-semibold">{unidade?.nome || '—'}</span>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Seção 1: Evolução */}
      <div className="space-y-2">
        <div className="flex items-center gap-2">
          <ClipboardList className="w-5 h-5 text-primary" />
          <h2 className="text-lg font-bold">Evolução da Visita</h2>
        </div>
        <Textarea 
          className="min-h-[200px] text-base"
          placeholder="Descreva a evolução, observações e condutas da visita..."
          value={evolucao}
          onChange={e => setEvolucao(e.target.value)}
        />
      </div>

      {/* Seção 2: Procedimento */}
      <div className="space-y-4 pt-4 border-t">
        <div className="flex items-center gap-2">
          <ClipboardList className="w-5 h-5 text-primary" />
          <h2 className="text-lg font-bold">Procedimento Realizado</h2>
        </div>
        
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 items-end">
          <div className="space-y-2">
            <Label>Tipo de Procedimento</Label>
            <Select value={procedimentoTipo} onValueChange={setProcedimentoTipo}>
              <SelectTrigger>
                <SelectValue placeholder="Selecione o procedimento..." />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="avaliacao_geral">Avaliação Geral</SelectItem>
                <SelectItem value="orientacoes_cuidador">Orientações ao Cuidador</SelectItem>
                <SelectItem value="reavaliacao">Reavaliação</SelectItem>
                <SelectItem value="medidas_cadeira_rodas">Medidas para Cadeira de Rodas</SelectItem>
                <SelectItem value="outro">Outro</SelectItem>
              </SelectContent>
            </Select>
          </div>
          
          {procedimentoTipo === 'outro' && (
            <div className="space-y-2">
              <Label>Especifique o Procedimento</Label>
              <Input 
                placeholder="Nome do procedimento..." 
                value={outroProcedimento}
                onChange={e => setOutroProcedimento(e.target.value)}
              />
            </div>
          )}
        </div>
      </div>

      {/* Seção 3: Formulário de Medidas (Condicional) */}
      {procedimentoTipo === 'medidas_cadeira_rodas' && (
        <div className="mt-8 pt-8 border-t animate-fade-in">
          <FormMedidasCadeiraRodas 
            paciente={paciente}
            unidade={unidade}
            onSave={(medidas) => setDadosProcedimento(medidas)}
            initialData={dadosProcedimento}
          />
        </div>
      )}

      {/* Botões de Ação Inferiores */}
      <div className="flex justify-end gap-4 pt-8 mt-12 border-t">
        <Button variant="outline" className="flex items-center gap-2">
          <Printer className="w-4 h-4" /> Imprimir Prontuário
        </Button>
        <Button onClick={handleFinalizar} className="flex items-center gap-2 bg-primary hover:bg-primary/90">
          <Save className="w-4 h-4" /> Finalizar Visita Domiciliar
        </Button>
      </div>
    </div>
  );
};

export default ProntuarioVisitaDomiciliar;
