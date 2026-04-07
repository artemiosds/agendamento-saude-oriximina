import React, { useEffect, useState, useCallback } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { UserCog, Loader2, Save } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { useData } from '@/contexts/DataContext';

interface TriageSetting {
  id: string;
  profissional_id: string;
  enabled: boolean;
  profissional_nome?: string;
  profissao?: string;
}

const ConfiguracaoTriagem: React.FC = () => {
  const { funcionarios } = useData();
  const [settings, setSettings] = useState<TriageSetting[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedProf, setSelectedProf] = useState('');
  const [newEnabled, setNewEnabled] = useState(true);
  const [saving, setSaving] = useState(false);

  const profissionaisAtivos = funcionarios.filter(
    f => f.ativo && ['profissional', 'coordenador', 'master'].includes(f.role)
  );

  const loadSettings = useCallback(async () => {
    try {
      const { data } = await supabase
        .from('triage_settings')
        .select('*')
        .not('profissional_id', 'is', null);

      if (data) {
        const mapped: TriageSetting[] = data.map(d => {
          const prof = funcionarios.find(f => f.id === d.profissional_id);
          return {
            id: d.id,
            profissional_id: d.profissional_id || '',
            enabled: d.enabled || false,
            profissional_nome: prof?.nome || d.profissional_id || '',
            profissao: prof?.profissao || '',
          };
        });
        setSettings(mapped);
      }
    } catch (err) {
      console.error('Erro ao carregar config triagem:', err);
    } finally {
      setLoading(false);
    }
  }, [funcionarios]);

  useEffect(() => {
    loadSettings();
  }, [loadSettings]);

  const handleSave = async () => {
    if (!selectedProf) {
      toast.error('Selecione um profissional.');
      return;
    }

    setSaving(true);
    try {
      const existing = settings.find(s => s.profissional_id === selectedProf);
      if (existing) {
        const { error } = await supabase
          .from('triage_settings')
          .update({ enabled: newEnabled, updated_at: new Date().toISOString() })
          .eq('id', existing.id);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from('triage_settings')
          .insert({ profissional_id: selectedProf, enabled: newEnabled, unidade_id: null });
        if (error) throw error;
      }

      toast.success(`Triagem ${newEnabled ? 'habilitada' : 'desabilitada'} para o profissional.`);
      setSelectedProf('');
      setNewEnabled(true);
      await loadSettings();
    } catch (err) {
      console.error('Erro ao salvar:', err);
      toast.error('Erro ao salvar configuração.');
    } finally {
      setSaving(false);
    }
  };

  const toggleSetting = async (setting: TriageSetting) => {
    const newVal = !setting.enabled;
    try {
      const { error } = await supabase
        .from('triage_settings')
        .update({ enabled: newVal, updated_at: new Date().toISOString() })
        .eq('id', setting.id);
      if (error) throw error;
      toast.success(`Triagem ${newVal ? 'habilitada' : 'desabilitada'} para ${setting.profissional_nome}.`);
      await loadSettings();
    } catch {
      toast.error('Erro ao atualizar.');
    }
  };

  return (
    <Card className="shadow-card border-0">
      <CardContent className="p-5">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
            <UserCog className="w-5 h-5 text-primary" />
          </div>
          <div>
            <h3 className="font-semibold font-display text-foreground">Controle de Triagem por Profissional</h3>
            <p className="text-sm text-muted-foreground">
              Habilite ou desabilite a triagem obrigatória individualmente por profissional.
              Quando desabilitada, o paciente vai direto para atendimento ao confirmar chegada.
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-end gap-3 mb-5 p-4 bg-muted/50 rounded-lg">
          <div className="flex-1 min-w-[200px]">
            <Label className="text-xs">Profissional</Label>
            <Select value={selectedProf} onValueChange={setSelectedProf}>
              <SelectTrigger className="h-9">
                <SelectValue placeholder="Selecione..." />
              </SelectTrigger>
              <SelectContent>
                {profissionaisAtivos.map(p => (
                  <SelectItem key={p.id} value={p.id}>
                    {p.nome} {p.profissao ? `— ${p.profissao}` : ''}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex items-center gap-2">
            <Label className="text-xs whitespace-nowrap">Triagem obrigatória:</Label>
            <Switch checked={newEnabled} onCheckedChange={setNewEnabled} />
            <span className="text-xs text-muted-foreground">{newEnabled ? 'Habilitada' : 'Desabilitada'}</span>
          </div>
          <Button onClick={handleSave} disabled={saving || !selectedProf} className="gradient-primary text-primary-foreground h-9">
            {saving ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : <Save className="w-4 h-4 mr-1" />}
            Salvar
          </Button>
        </div>

        {loading ? (
          <div className="flex justify-center py-6"><Loader2 className="w-5 h-5 animate-spin text-muted-foreground" /></div>
        ) : settings.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-4">
            Nenhuma configuração individual salva. Todos os profissionais seguem a regra geral acima.
          </p>
        ) : (
          <>
            <h4 className="text-sm font-semibold text-foreground mb-2">Configurações salvas</h4>
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Profissional</TableHead>
                    <TableHead>Especialidade</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Ação</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {settings.map(s => (
                    <TableRow key={s.id}>
                      <TableCell className="font-medium">{s.profissional_nome}</TableCell>
                      <TableCell className="text-muted-foreground">{s.profissao || '-'}</TableCell>
                      <TableCell>
                        {s.enabled ? (
                          <Badge className="bg-success/10 text-success border-0">✅ Ativa</Badge>
                        ) : (
                          <Badge variant="outline" className="text-destructive border-destructive/30">❌ Inativa</Badge>
                        )}
                      </TableCell>
                      <TableCell className="text-right">
                        <Button size="sm" variant="outline" onClick={() => toggleSetting(s)}>
                          {s.enabled ? 'Desabilitar' : 'Habilitar'}
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
};

export default ConfiguracaoTriagem;
