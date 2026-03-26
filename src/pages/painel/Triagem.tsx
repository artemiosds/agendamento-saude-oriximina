import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useData } from '@/contexts/DataContext';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Slider } from '@/components/ui/slider';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Loader2, Play, Clock, X, Plus, CheckCircle, Save } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { differenceInMinutes } from 'date-fns';

const ESPECIALIDADE_LABELS: Record<string, string> = {
  fisioterapia: 'FISIOTERAPIA',
  fonoaudiologia: 'FONOAUDIOLOGIA',
  nutricao: 'NUTRIÇÃO',
  psicologia: 'PSICOLOGIA',
  terapia_ocupacional: 'TERAPIA OCUPACIONAL',
  outros: 'OUTROS',
};

const classificarIMC = (imc: number): string => {
  if (imc < 18.5) return 'Abaixo do peso';
  if (imc < 25) return 'Normal';
  if (imc < 30) return 'Sobrepeso';
  if (imc < 35) return 'Obesidade grau I';
  if (imc < 40) return 'Obesidade grau II';
  return 'Obesidade grau III';
};

interface FilaItem {
  id: string;
  pacienteNome: string;
  pacienteId: string;
  unidadeId: string;
  criadoEm: string;
  especialidadeDestino: string;
  cid: string;
  descricaoClinica: string;
  prioridade: string;
  horaChegada: string;
}

interface PacienteInfo {
  especialidade_destino?: string;
  cid?: string;
  justificativa?: string;
  descricao_clinica?: string;
  diagnostico_resumido?: string;
}

const Triagem: React.FC = () => {
  const { user } = useAuth();
  const { logAction, refreshFila } = useData();
  const [fila, setFila] = useState<FilaItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [selectedItem, setSelectedItem] = useState<FilaItem | null>(null);
  const [pacienteInfo, setPacienteInfo] = useState<PacienteInfo | null>(null);
  const [saving, setSaving] = useState(false);
  const [now, setNow] = useState(new Date());

  const [form, setForm] = useState({
    peso: '', altura: '', pressaoArterial: '', temperatura: '',
    frequenciaCardiaca: '', saturacaoOxigenio: '', glicemia: '',
    dor: 0,
    queixaPrincipal: '',
    classificacaoRisco: '',
    alergias: [] as string[], medicamentos: [] as string[], observacoes: '',
  });
  const [newAlergia, setNewAlergia] = useState('');
  const [newMedicamento, setNewMedicamento] = useState('');
  const [startedAt, setStartedAt] = useState<string>('');

  useEffect(() => {
    const interval = setInterval(() => setNow(new Date()), 30000);
    return () => clearInterval(interval);
  }, []);

  const imc = useMemo(() => {
    const w = parseFloat(form.peso);
    const h = parseFloat(form.altura) / 100;
    if (!w || !h) return null;
    const value = w / (h * h);
    return { value: value.toFixed(1), label: classificarIMC(value) };
  }, [form.peso, form.altura]);

  // Load from fila_espera where status = 'aguardando' (AGUARDANDO TRIAGEM)
  const loadFila = useCallback(async () => {
    if (!user?.unidadeId) return;
    setLoading(true);
    try {
      const { data, error } = await (supabase as any)
        .from('fila_espera')
        .select('*')
        .eq('status', 'aguardando')
        .eq('unidade_id', user.unidadeId)
        .order('criado_em', { ascending: true });

      if (data && !error) {
        setFila(data.map((f: any) => ({
          id: f.id,
          pacienteNome: f.paciente_nome,
          pacienteId: f.paciente_id,
          unidadeId: f.unidade_id,
          criadoEm: f.criado_em || '',
          especialidadeDestino: f.especialidade_destino || '',
          cid: f.cid || '',
          descricaoClinica: f.descricao_clinica || '',
          prioridade: f.prioridade || 'normal',
          horaChegada: f.hora_chegada || '',
        })));
      }
    } catch (err) {
      console.error('Error loading triage queue:', err);
    }
    setLoading(false);
  }, [user?.unidadeId]);

  useEffect(() => { loadFila(); }, [loadFila]);

  // Realtime on fila_espera
  useEffect(() => {
    if (!user?.unidadeId) return;
    const channel = supabase
      .channel('triagem-fila-espera')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'fila_espera' }, () => loadFila())
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [user?.unidadeId, loadFila]);

  const openTriagem = async (item: FilaItem) => {
    setSelectedItem(item);
    setStartedAt(new Date().toISOString());

    // Load patient info
    const { data: pacData } = await (supabase as any)
      .from('pacientes')
      .select('especialidade_destino, cid, justificativa, descricao_clinica, diagnostico_resumido')
      .eq('id', item.pacienteId)
      .maybeSingle();
    setPacienteInfo(pacData || null);

    // Check existing triage record
    const { data } = await (supabase as any)
      .from('triage_records')
      .select('*')
      .eq('agendamento_id', item.id)
      .maybeSingle();

    if (data) {
      setForm({
        peso: data.peso?.toString() || '',
        altura: data.altura?.toString() || '',
        pressaoArterial: data.pressao_arterial || '',
        temperatura: data.temperatura?.toString() || '',
        frequenciaCardiaca: data.frequencia_cardiaca?.toString() || '',
        saturacaoOxigenio: data.saturacao_oxigenio?.toString() || '',
        glicemia: data.glicemia?.toString() || '',
        dor: 0,
        queixaPrincipal: data.queixa || '',
        classificacaoRisco: '',
        alergias: data.alergias || [],
        medicamentos: data.medicamentos || [],
        observacoes: '',
      });
      setStartedAt(data.iniciado_em || new Date().toISOString());
    } else {
      setForm({
        peso: '', altura: '', pressaoArterial: '', temperatura: '',
        frequenciaCardiaca: '', saturacaoOxigenio: '', glicemia: '',
        dor: 0, queixaPrincipal: '', classificacaoRisco: '',
        alergias: [], medicamentos: [], observacoes: '',
      });
    }
    setDialogOpen(true);
  };

  const buildRecord = () => ({
    agendamento_id: selectedItem!.id,
    tecnico_id: user?.id || '',
    peso: parseFloat(form.peso) || null,
    altura: parseFloat(form.altura) || null,
    imc: imc ? parseFloat(imc.value) : null,
    pressao_arterial: form.pressaoArterial || null,
    temperatura: parseFloat(form.temperatura) || null,
    frequencia_cardiaca: parseInt(form.frequenciaCardiaca) || null,
    saturacao_oxigenio: parseInt(form.saturacaoOxigenio) || null,
    glicemia: parseFloat(form.glicemia) || null,
    alergias: form.alergias,
    medicamentos: form.medicamentos,
    queixa: form.queixaPrincipal || null,
    iniciado_em: startedAt,
  });

  const salvarRascunho = async () => {
    if (!selectedItem) return;
    setSaving(true);
    try {
      await (supabase as any).from('triage_records').upsert(buildRecord(), { onConflict: 'agendamento_id' });
      toast.success('Rascunho salvo!');
    } catch (err) {
      toast.error('Erro ao salvar rascunho.');
    }
    setSaving(false);
  };

  const validateTriagemFields = (): string[] => {
    const missing: string[] = [];
    if (!form.pressaoArterial.trim()) missing.push('Pressão Arterial');
    if (!form.frequenciaCardiaca.trim()) missing.push('Frequência Cardíaca');
    if (!form.temperatura.trim()) missing.push('Temperatura');
    if (!form.saturacaoOxigenio.trim()) missing.push('Saturação O₂');
    if (!form.peso.trim()) missing.push('Peso');
    if (!form.altura.trim()) missing.push('Altura');
    if (!form.classificacaoRisco) missing.push('Classificação de Risco');
    if (!form.queixaPrincipal.trim()) missing.push('Queixa Principal');
    if (!form.observacoes.trim()) missing.push('Observações');
    return missing;
  };

  const confirmarTriagem = async (encaminharEnfermagem: boolean) => {
    if (!selectedItem) return;

    const missing = validateTriagemFields();
    if (missing.length > 0) {
      toast.error(`Campos obrigatórios: ${missing.join(', ')}`);
      return;
    }

    setSaving(true);
    try {
      // Save triage record (clinical history)
      const record = { ...buildRecord(), confirmado_em: new Date().toISOString() };
      await (supabase as any).from('triage_records').upsert(record, { onConflict: 'agendamento_id' });

      // Determine next status based on choice
      const nextStatus = encaminharEnfermagem ? 'aguardando_enfermagem' : 'apto_agendamento';

      await (supabase as any).from('fila_espera')
        .update({ status: nextStatus })
        .eq('id', selectedItem.id);

      // If skipping nursing, auto-log that fact
      if (!encaminharEnfermagem) {
        await (supabase as any).from('nursing_evaluations').insert({
          patient_id: selectedItem.pacienteId,
          agendamento_id: selectedItem.id,
          professional_id: user?.id || '',
          unit_id: user?.unidadeId || '',
          anamnese_resumida: 'Paciente seguiu fluxo sem atendimento de enfermagem',
          condicao_clinica: '',
          avaliacao_risco: '',
          prioridade: 'media',
          observacoes_clinicas: 'Triagem concluída — enfermagem dispensada pelo técnico',
          resultado: 'apto',
          motivo_inapto: '',
        });
      }

      await logAction({
        acao: 'triagem_realizada', entidade: 'triagem', entidadeId: selectedItem.id,
        modulo: 'triagem', user,
        detalhes: {
          paciente_nome: selectedItem.pacienteNome,
          especialidade_destino: selectedItem.especialidadeDestino,
          peso: form.peso, altura: form.altura, imc: imc?.value,
          classificacao_risco: form.classificacaoRisco,
          dor: form.dor,
          encaminhado_enfermagem: encaminharEnfermagem,
        },
      });

      toast.success(encaminharEnfermagem
        ? 'Triagem confirmada! Encaminhado para enfermagem.'
        : 'Triagem confirmada! Paciente apto para agendamento.');
      setDialogOpen(false);
      await loadFila();
      await refreshFila();
    } catch (err) {
      toast.error('Erro ao confirmar triagem.');
    }
    setSaving(false);
  };

  const addAlergia = () => {
    if (newAlergia.trim()) {
      setForm(p => ({ ...p, alergias: [...p.alergias, newAlergia.trim()] }));
      setNewAlergia('');
    }
  };

  const addMedicamento = () => {
    if (newMedicamento.trim()) {
      setForm(p => ({ ...p, medicamentos: [...p.medicamentos, newMedicamento.trim()] }));
      setNewMedicamento('');
    }
  };

  const espLabel = (pacienteInfo?.especialidade_destino || selectedItem?.especialidadeDestino)
    ? ESPECIALIDADE_LABELS[pacienteInfo?.especialidade_destino || selectedItem?.especialidadeDestino || ''] || (pacienteInfo?.especialidade_destino || selectedItem?.especialidadeDestino || '').toUpperCase()
    : null;

  return (
    <div className="space-y-4 animate-fade-in">
      <div>
        <h1 className="text-2xl font-bold font-display text-foreground">Triagem de Enfermagem</h1>
        <p className="text-muted-foreground text-sm">{fila.length} paciente(s) aguardando triagem</p>
      </div>

      {loading ? (
        <div className="flex justify-center py-12"><Loader2 className="w-8 h-8 animate-spin text-primary" /></div>
      ) : fila.length === 0 ? (
        <Card className="shadow-card border-0">
          <CardContent className="p-8 text-center text-muted-foreground">
            Nenhum paciente aguardando triagem no momento.
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {fila.map(item => {
            const waitMinutes = item.criadoEm ? differenceInMinutes(now, new Date(item.criadoEm)) : 0;
            const waitLabel = waitMinutes >= 60 ? `${Math.floor(waitMinutes / 60)}h${waitMinutes % 60}min` : `${waitMinutes}min`;
            const espBadge = item.especialidadeDestino ? ESPECIALIDADE_LABELS[item.especialidadeDestino] || item.especialidadeDestino.toUpperCase() : null;
            return (
              <Card key={item.id} className="shadow-card border-0">
                <CardContent className="p-4 flex flex-col sm:flex-row items-start sm:items-center gap-3">
                  <span className="text-lg font-mono font-bold text-primary w-16 shrink-0">{item.horaChegada}</span>
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-foreground">{item.pacienteNome}</p>
                    <div className="flex flex-wrap gap-1 mt-0.5">
                      {espBadge && <Badge variant="outline" className="text-[10px] border-primary/30 text-primary">{espBadge}</Badge>}
                      {item.cid && <Badge variant="outline" className="text-[10px]">CID: {item.cid}</Badge>}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant="outline" className="text-xs">
                      <Clock className="w-3 h-3 mr-1" /> {waitLabel}
                    </Badge>
                    <Button size="sm" className="gradient-primary text-primary-foreground" onClick={() => openTriagem(item)}>
                      <Play className="w-3.5 h-3.5 mr-1" /> Iniciar triagem
                    </Button>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="font-display">Triagem — {selectedItem?.pacienteNome}</DialogTitle>
          </DialogHeader>

          {/* Specialty + referral info */}
          {(pacienteInfo || selectedItem) && (
            <div className="space-y-2">
              {espLabel && (
                <div className="p-3 rounded-lg border-2 border-primary/30 bg-primary/5">
                  <p className="text-xs text-muted-foreground">Especialidade Destino</p>
                  <p className="text-lg font-bold text-primary">{espLabel}</p>
                </div>
              )}
              <div className="grid grid-cols-2 gap-2 text-xs bg-muted/50 rounded-lg p-3 border">
                {(pacienteInfo?.cid || selectedItem?.cid) && <span>CID: <strong>{pacienteInfo?.cid || selectedItem?.cid}</strong></span>}
                {pacienteInfo?.diagnostico_resumido && <span>Diagnóstico: <strong>{pacienteInfo.diagnostico_resumido}</strong></span>}
              </div>
              {pacienteInfo?.justificativa && (
                <p className="text-xs"><strong>Justificativa:</strong> {pacienteInfo.justificativa}</p>
              )}
            </div>
          )}

          <div className="space-y-4">
            {/* Vital Signs Grid */}
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              <div>
                <Label>Peso (kg) *</Label>
                <Input type="number" step="0.01" value={form.peso} onChange={e => setForm(p => ({ ...p, peso: e.target.value }))} placeholder="70.5" />
              </div>
              <div>
                <Label>Altura (cm) *</Label>
                <Input type="number" step="0.01" value={form.altura} onChange={e => setForm(p => ({ ...p, altura: e.target.value }))} placeholder="170" />
              </div>
              <div>
                <Label>IMC</Label>
                <div className="mt-1 p-2 bg-muted rounded-lg text-sm">
                  {imc ? (
                    <span className="font-semibold">{imc.value} — <span className="text-muted-foreground">{imc.label}</span></span>
                  ) : (
                    <span className="text-muted-foreground">Informe peso e altura</span>
                  )}
                </div>
              </div>
              <div>
                <Label>Pressão Arterial *</Label>
                <Input value={form.pressaoArterial} onChange={e => setForm(p => ({ ...p, pressaoArterial: e.target.value }))} placeholder="120/80" />
              </div>
              <div>
                <Label>Temperatura (°C) *</Label>
                <Input type="number" step="0.1" value={form.temperatura} onChange={e => setForm(p => ({ ...p, temperatura: e.target.value }))} placeholder="36.5" />
              </div>
              <div>
                <Label>FC (bpm) *</Label>
                <Input type="number" value={form.frequenciaCardiaca} onChange={e => setForm(p => ({ ...p, frequenciaCardiaca: e.target.value }))} placeholder="72" />
              </div>
              <div>
                <Label>SatO₂ (%) *</Label>
                <Input type="number" value={form.saturacaoOxigenio} onChange={e => setForm(p => ({ ...p, saturacaoOxigenio: e.target.value }))} placeholder="98" />
              </div>
              <div>
                <Label>Glicemia (mg/dL)</Label>
                <Input type="number" step="0.01" value={form.glicemia} onChange={e => setForm(p => ({ ...p, glicemia: e.target.value }))} placeholder="Opcional" />
              </div>
            </div>

            {/* Pain Scale */}
            <div>
              <Label className="text-base font-semibold">Escala de Dor (0–10): {form.dor}</Label>
              <Slider
                value={[form.dor]}
                onValueChange={v => setForm(p => ({ ...p, dor: v[0] }))}
                max={10} min={0} step={1}
                className="mt-2"
              />
              <div className="flex justify-between text-xs text-muted-foreground mt-1">
                <span>Sem dor</span>
                <span>Dor máxima</span>
              </div>
            </div>

            {/* Risk Classification */}
            <div>
              <Label className="text-base font-semibold">Classificação de Risco *</Label>
              <Select value={form.classificacaoRisco} onValueChange={v => setForm(p => ({ ...p, classificacaoRisco: v }))}>
                <SelectTrigger className="mt-1"><SelectValue placeholder="Selecionar classificação..." /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="baixo">🟢 BAIXO</SelectItem>
                  <SelectItem value="medio">🟡 MÉDIO</SelectItem>
                  <SelectItem value="alto">🔴 ALTO</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Main complaint */}
            <div>
              <Label>Queixa Principal *</Label>
              <Textarea rows={2} value={form.queixaPrincipal} onChange={e => setForm(p => ({ ...p, queixaPrincipal: e.target.value }))} placeholder="Queixa principal do paciente..." />
            </div>

            {/* Allergies */}
            <div>
              <Label>Alergias</Label>
              <div className="flex gap-2 mt-1">
                <Input value={newAlergia} onChange={e => setNewAlergia(e.target.value)} placeholder="Digitar alergia"
                  onKeyDown={e => e.key === 'Enter' && (e.preventDefault(), addAlergia())} />
                <Button type="button" variant="outline" size="icon" onClick={addAlergia}><Plus className="w-4 h-4" /></Button>
              </div>
              {form.alergias.length > 0 && (
                <div className="flex flex-wrap gap-1 mt-2">
                  {form.alergias.map((a, i) => (
                    <Badge key={i} variant="destructive" className="text-xs">
                      {a} <button className="ml-1" onClick={() => setForm(p => ({ ...p, alergias: p.alergias.filter((_, j) => j !== i) }))}><X className="w-3 h-3" /></button>
                    </Badge>
                  ))}
                </div>
              )}
            </div>

            {/* Medications */}
            <div>
              <Label>Medicamentos em uso</Label>
              <div className="flex gap-2 mt-1">
                <Input value={newMedicamento} onChange={e => setNewMedicamento(e.target.value)} placeholder="Digitar medicamento"
                  onKeyDown={e => e.key === 'Enter' && (e.preventDefault(), addMedicamento())} />
                <Button type="button" variant="outline" size="icon" onClick={addMedicamento}><Plus className="w-4 h-4" /></Button>
              </div>
              {form.medicamentos.length > 0 && (
                <div className="flex flex-wrap gap-1 mt-2">
                  {form.medicamentos.map((m, i) => (
                    <Badge key={i} variant="secondary" className="text-xs">
                      {m} <button className="ml-1" onClick={() => setForm(p => ({ ...p, medicamentos: p.medicamentos.filter((_, j) => j !== i) }))}><X className="w-3 h-3" /></button>
                    </Badge>
                  ))}
                </div>
              )}
            </div>

            {/* Observations */}
            <div>
              <Label>Observações *</Label>
              <Textarea rows={3} value={form.observacoes} onChange={e => setForm(p => ({ ...p, observacoes: e.target.value }))} placeholder="Observações relevantes da triagem..." />
            </div>

            {/* Actions */}
            <div className="flex flex-col gap-2">
              <Button variant="outline" className="w-full" onClick={salvarRascunho} disabled={saving}>
                {saving && <Loader2 className="w-4 h-4 animate-spin mr-2" />}
                <Save className="w-4 h-4 mr-2" /> Salvar Rascunho
              </Button>
              <div className="flex gap-2">
                <Button className="flex-1 bg-success hover:bg-success/90 text-success-foreground" onClick={() => confirmarTriagem(true)} disabled={saving}>
                  {saving && <Loader2 className="w-4 h-4 animate-spin mr-2" />}
                  <CheckCircle className="w-4 h-4 mr-2" /> Encaminhar Enfermagem
                </Button>
                <Button className="flex-1" variant="secondary" onClick={() => confirmarTriagem(false)} disabled={saving}>
                  {saving && <Loader2 className="w-4 h-4 animate-spin mr-2" />}
                  <CheckCircle className="w-4 h-4 mr-2" /> Seguir sem Enfermagem
                </Button>
              </div>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default Triagem;
