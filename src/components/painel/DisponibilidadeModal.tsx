import React, { useState, useMemo } from 'react';
import { useData } from '@/contexts/DataContext';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { Checkbox } from '@/components/ui/checkbox';
import { Plus, Trash2, Copy, Save, Loader2, Calendar } from 'lucide-react';
import { toast } from 'sonner';

interface BlocoConfig {
  id?: string;
  nome: string;
  tipo: 'padrao' | 'custom';
  horaInicio: string;
  horaFim: string;
  vagas: number;
  ativo: boolean;
}

interface DiaConfig {
  diaSemana: number;
  ativo: boolean;
  blocos: BlocoConfig[];
}

interface DisponibilidadeFormProps {
  open: boolean;
  onClose: () => void;
  profissionalId?: string;
  initialData?: any; // To be implemented
}

const DIAS = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'];

export const DisponibilidadeModal: React.FC<DisponibilidadeFormProps> = ({ open, onClose, profissionalId }) => {
  const { addDisponibilidade, deleteDisponibilidade } = useData();
  const [saving, setSaving] = useState(false);
  const [dataInicio, setDataInicio] = useState(new Date().toISOString().split('T')[0]);
  const [dataFim, setDataFim] = useState('');
  
  const [dias, setDias] = useState<DiaConfig[]>(
    Array.from({ length: 7 }, (_, i) => ({
      diaSemana: i,
      ativo: false,
      blocos: [{ nome: 'Manhã', tipo: 'padrao', horaInicio: '08:00', horaFim: '12:00', vagas: 10, ativo: true }]
    }))
  );

  const toggleDia = (index: number) => {
    setDias(prev => prev.map((d, i) => i === index ? { ...d, ativo: !d.ativo } : d));
  };

  const addBloco = (diaIndex: number) => {
    setDias(prev => prev.map((d, i) => i === diaIndex ? {
      ...d,
      blocos: [...d.blocos, { nome: 'Novo Bloco', tipo: 'custom', horaInicio: '13:00', horaFim: '18:00', vagas: 10, ativo: true }]
    } : d));
  };

  const updateBloco = (diaIndex: number, blocoIndex: number, field: keyof BlocoConfig, value: any) => {
    setDias(prev => prev.map((d, i) => i === diaIndex ? {
      ...d,
      blocos: d.blocos.map((b, bi) => bi === blocoIndex ? { ...b, [field]: value } : b)
    } : d));
  };

  const copyDay = (fromIndex: number, toIndex: number) => {
    setDias(prev => prev.map((d, i) => i === toIndex ? { ...d, blocos: [...prev[fromIndex].blocos] } : d));
  };

  const handleSave = async () => {
    if (!profissionalId) return;
    setSaving(true);
    try {
      const activeDias = dias.filter(d => d.ativo);
      for (const dia of activeDias) {
        for (const bloco of dia.blocos.filter(b => b.ativo)) {
          await addDisponibilidade({
            id: `disp_${Date.now()}_${dia.diaSemana}`,
            profissionalId,
            unidadeId: '', // Should come from form
            salaId: bloco.nome,
            dataInicio,
            dataFim,
            horaInicio: bloco.horaInicio,
            horaFim: bloco.horaFim,
            vagasPorHora: 0,
            vagasPorDia: bloco.vagas,
            diasSemana: [dia.diaSemana],
            duracaoConsulta: 30
          } as any);
        }
      }
      toast.success('Disponibilidade salva com sucesso!');
      onClose();
    } catch (e) {
      toast.error('Erro ao salvar');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Configurar Disponibilidade</DialogTitle>
        </DialogHeader>

        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label>Data Início</Label>
            <Input type="date" value={dataInicio} onChange={e => setDataInicio(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label>Data Fim</Label>
            <Input type="date" value={dataFim} onChange={e => setDataFim(e.target.value)} />
          </div>
        </div>

        <Accordion type="multiple" className="w-full">
          {dias.map((dia, diaIndex) => (
            <AccordionItem key={dia.diaSemana} value={dia.diaSemana.toString()}>
              <AccordionTrigger className="hover:no-underline">
                <div className="flex items-center gap-3">
                  <Switch checked={dia.ativo} onCheckedChange={() => toggleDia(diaIndex)} />
                  <span className="font-semibold">{DIAS[dia.diaSemana]}</span>
                </div>
              </AccordionTrigger>
              <AccordionContent>
                {dia.ativo && (
                  <div className="space-y-3 p-2">
                    {dia.blocos.map((bloco, blocoIndex) => (
                      <div key={blocoIndex} className="grid grid-cols-[1fr_auto_auto_auto_auto] gap-2 items-center bg-muted p-2 rounded">
                        <Input value={bloco.nome} onChange={e => updateBloco(diaIndex, blocoIndex, 'nome', e.target.value)} placeholder="Nome" />
                        <Input type="time" value={bloco.horaInicio} onChange={e => updateBloco(diaIndex, blocoIndex, 'horaInicio', e.target.value)} />
                        <Input type="time" value={bloco.horaFim} onChange={e => updateBloco(diaIndex, blocoIndex, 'horaFim', e.target.value)} />
                        <Input type="number" className="w-20" value={bloco.vagas} onChange={e => updateBloco(diaIndex, blocoIndex, 'vagas', parseInt(e.target.value))} />
                        <Button variant="ghost" size="icon" onClick={() => updateBloco(diaIndex, blocoIndex, 'ativo', false)}><Trash2 className="w-4 h-4 text-destructive" /></Button>
                      </div>
                    ))}
                    <div className="flex gap-2">
                      <Button variant="outline" size="sm" onClick={() => addBloco(diaIndex)}><Plus className="w-4 h-4 mr-1" /> Adicionar Bloco</Button>
                      <Button variant="outline" size="sm" onClick={() => copyDay(diaIndex, (diaIndex + 1) % 7)}><Copy className="w-4 h-4 mr-1" /> Copiar p/ Próximo</Button>
                    </div>
                  </div>
                )}
              </AccordionContent>
            </AccordionItem>
          ))}
        </Accordion>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancelar</Button>
          <Button onClick={handleSave} disabled={saving}>{saving ? <Loader2 className="animate-spin" /> : <Save className="mr-2" />} Salvar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
