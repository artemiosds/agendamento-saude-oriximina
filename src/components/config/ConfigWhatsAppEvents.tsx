import React, { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useOperacional } from '@/contexts/OperacionalContext';
import { Card, CardContent } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Loader2, Bell, CheckCircle2, XCircle } from 'lucide-react';
import { toast } from 'sonner';

const EVENT_LIST = [
  { tipo: 'confirmacao', label: 'Agendamento Criado', icon: '✅', description: 'Quando um agendamento é criado' },
  { tipo: 'lembrete_24h', label: 'Lembrete 24h', icon: '⏰', description: 'Lembrete automático 24h antes' },
  { tipo: 'lembrete_2h', label: 'Lembrete 2h', icon: '🔔', description: 'Lembrete automático 2h antes' },
  { tipo: 'cancelamento', label: 'Cancelamento', icon: '❌', description: 'Quando um agendamento é cancelado' },
  { tipo: 'remarcacao', label: 'Remarcação', icon: '🔄', description: 'Quando um agendamento é remarcado' },
  { tipo: 'falta', label: 'Falta', icon: '⚠️', description: 'Quando o paciente falta' },
  { tipo: 'lista_espera', label: 'Lista de Espera', icon: '📋', description: 'Quando o paciente entra na lista' },
  { tipo: 'vaga_disponivel', label: 'Vaga Disponível', icon: '🎯', description: 'Quando uma vaga abre na lista' },
] as const;

const ConfigWhatsAppEvents: React.FC = () => {
  const { user } = useAuth();
  const { unidades } = useOperacional();
  const isGlobalAdmin = user?.usuario === 'admin.sms';
  const userUnitId = user?.unidadeId || '';

  const editableUnits = isGlobalAdmin ? unidades : unidades.filter(u => u.id === userUnitId);
  const [selectedUnit, setSelectedUnit] = useState<string>(userUnitId || editableUnits[0]?.id || '');

  const [eventConfig, setEventConfig] = useState<Record<string, boolean>>({});
  const [loading, setLoading] = useState(true);
  const [toggling, setToggling] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!selectedUnit) return;
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('whatsapp_event_config' as any)
        .select('evento, ativo')
        .eq('unidade_id', selectedUnit);
      
      if (error) throw error;
      
      const configMap: Record<string, boolean> = {};
      (data || []).forEach((item: any) => {
        configMap[item.evento] = item.ativo;
      });
      
      setEventConfig(configMap);
    } catch (err: any) {
      toast.error('Erro ao carregar eventos: ' + err.message);
    } finally {
      setLoading(false);
    }
  }, [selectedUnit]);

  useEffect(() => { load(); }, [load]);

  const toggleEvent = async (tipo: string, currentStatus: boolean) => {
    if (!selectedUnit) return;
    setToggling(tipo);
    try {
      const { error } = await supabase
        .from('whatsapp_event_config' as any)
        .upsert({
          unidade_id: selectedUnit,
          evento: tipo,
          ativo: !currentStatus,
          updated_at: new Date().toISOString()
        }, { onConflict: 'unidade_id, evento' });
      
      if (error) throw error;
      
      setEventConfig(prev => ({ ...prev, [tipo]: !currentStatus }));
      toast.success(`${tipo} ${!currentStatus ? 'ativado' : 'desativado'} com sucesso!`);
    } catch (err: any) {
      toast.error('Erro ao salvar: ' + err.message);
    } finally {
      setToggling(null);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <div className="w-12 h-12 rounded-2xl bg-primary/10 flex items-center justify-center">
          <Bell className="w-6 h-6 text-primary" />
        </div>
        <div>
          <h2 className="text-xl font-bold font-display text-foreground">Eventos Ativos</h2>
          <p className="text-sm text-muted-foreground">Selecione quais eventos devem disparar mensagens automáticas</p>
        </div>
      </div>

      {editableUnits.length > 1 && (
        <Card className="border-0 shadow-card">
          <CardContent className="p-4 flex items-center gap-3">
            <Label className="whitespace-nowrap">Unidade:</Label>
            <Select value={selectedUnit} onValueChange={setSelectedUnit}>
              <SelectTrigger className="max-w-md"><SelectValue /></SelectTrigger>
              <SelectContent>
                {editableUnits.map(u => (
                  <SelectItem key={u.id} value={u.id}>{u.nome}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </CardContent>
        </Card>
      )}

      <Card className="border-0 shadow-card">
        <CardContent className="p-0">
          {loading ? (
            <div className="flex justify-center py-12"><Loader2 className="w-8 h-8 animate-spin text-muted-foreground" /></div>
          ) : (
            <div className="divide-y divide-border">
              {EVENT_LIST.map((event) => {
                const isActive = eventConfig[event.tipo] ?? true;
                const isProcessing = toggling === event.tipo;
                
                return (
                  <div key={event.tipo} className="p-5 flex items-center justify-between hover:bg-muted/30 transition-colors">
                    <div className="flex items-center gap-4">
                      <div className="w-10 h-10 rounded-xl bg-muted flex items-center justify-center text-xl">
                        {event.icon}
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <h4 className="font-semibold text-foreground">{event.label}</h4>
                          {isActive ? (
                            <Badge className="bg-success/10 text-success border-0 text-[10px] h-4">ATIVO</Badge>
                          ) : (
                            <Badge className="bg-destructive/10 text-destructive border-0 text-[10px] h-4">INATIVO</Badge>
                          )}
                        </div>
                        <p className="text-sm text-muted-foreground">{event.description}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-4">
                      {isProcessing ? (
                        <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
                      ) : (
                        <Switch 
                          checked={isActive} 
                          onCheckedChange={() => toggleEvent(event.tipo, isActive)}
                        />
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      <div className="p-4 rounded-xl bg-primary/5 border border-primary/20 flex gap-3 items-start">
        <CheckCircle2 className="w-5 h-5 text-primary shrink-0 mt-0.5" />
        <p className="text-xs text-muted-foreground leading-relaxed">
          <strong>Importante:</strong> Se um evento estiver desativado aqui, o sistema não irá sequer enfileirar a mensagem, mesmo que haja um template configurado. 
          Isso garante que o controle de disparo seja soberano nesta tela.
        </p>
      </div>
    </div>
  );
};

export default ConfigWhatsAppEvents;
