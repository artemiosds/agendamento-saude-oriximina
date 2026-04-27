import React, { useState, useEffect, useCallback } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { usePermissions } from '@/contexts/PermissionsContext';
import { useData } from '@/contexts/DataContext';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Loader2, Clock, CheckCircle, XCircle, AlertTriangle, Stethoscope } from 'lucide-react';
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

const MULTI_ESPECIALIDADES = [
  { value: 'fisioterapia', label: 'Fisioterapia' },
  { value: 'fonoaudiologia', label: 'Fonoaudiologia' },
  { value: 'nutricao', label: 'Nutrição' },
  { value: 'psicologia', label: 'Psicologia' },
  { value: 'servico_social', label: 'Serviço Social' },
];

interface FilaItem {
  id: string;
  pacienteNome: string;
  pacienteId: string;
  unidadeId: string;
  criadoEm: string;
  especialidadeDestino: string;
  horaChegada: string;
}

interface TriagemResumo {
  peso?: number;
  altura?: number;
  imc?: number;
  pressao_arterial?: string;
  temperatura?: number;
  frequencia_cardiaca?: number;
  saturacao_oxigenio?: number;
  glicemia?: number;
  alergias?: string[];
  medicamentos?: string[];
  queixa?: string;
}

interface PacienteResumo {
  nome: string;
  cpf: string;
  cns: string;
  data_nascimento: string;
  telefone: string;
  nome_mae: string;
  municipio: string;
  ubs_origem: string;
  profissional_solicitante: string;
  cid: string;
  justificativa: string;
  tipo_encaminhamento: string;
  diagnostico_resumido: string;
  descricao_clinica: string;
  especialidade_destino: string;
}

const AvaliacaoEnfermagem: React.FC = () => {
  const { user } = useAuth();
  const { can } = usePermissions();
  const { logAction, refreshFila } = useData();
  const [fila, setFila] = useState<FilaItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [selected, setSelected] = useState<FilaItem | null>(null);
  const [saving, setSaving] = useState(false);
  const [triagem, setTriagem] = useState<TriagemResumo | null>(null);
  const [paciente, setPaciente] = useState<PacienteResumo | null>(null);
  const [now, setNow] = useState(new Date());

  const [form, setForm] = useState({
    confirmacaoQueixa: '',
    historicoDoenca: '',
    comorbidades: '',
    usoMedicamentos: '',
    alergias: '',
    limitacoesFuncionais: '',
    estadoGeral: '',
    mobilidade: '',
    comunicacao: '',
    alimentacao: '',
    autonomia: '',
    validarEspecialidade: true,
    especialidadeAjustada: '',
    justificativaAlteracao: '',
    avaliacao_risco: '',
    prioridade: 'media',
    observacoes_clinicas: '',
    resultado: 'apto' as 'apto' | 'inapto' | 'multiprofissional',
    motivo_inapto: '',
    multiEspecialidades: [] as string[],
  });

  useEffect(() => {
    const interval = setInterval(() => setNow(new Date()), 30000);
    return () => clearInterval(interval);
  }, []);

  // Load from fila_espera where status = 'aguardando_enfermagem'
  const loadFila = useCallback(async () => {
    const isAdmin = user?.usuario === 'admin.sms';
    if (!isAdmin && !user?.unidadeId) return;
    setLoading(true);
    try {
      let query = (supabase as any)
        .from('fila_espera')
        .select('*')
        .eq('status', 'aguardando_enfermagem')
        .order('criado_em', { ascending: true });
      if (!isAdmin && user?.unidadeId) {
        query = query.eq('unidade_id', user.unidadeId);
      }
      const { data, error } = await query;

      if (data && !error) {
        setFila(data.map((f: any) => ({
          id: f.id,
          pacienteNome: f.paciente_nome,
          pacienteId: f.paciente_id,
          unidadeId: f.unidade_id,
          criadoEm: f.criado_em || '',
          especialidadeDestino: f.especialidade_destino || '',
          horaChegada: f.hora_chegada || '',
        })));
      }
    } catch (err) {
      console.error('Error loading nursing queue:', err);
    }
    setLoading(false);
  }, [user?.unidadeId, user?.usuario]);

  useEffect(() => { loadFila(); }, [loadFila]);

  // Realtime on fila_espera
  useEffect(() => {
    const isAdmin = user?.usuario === 'admin.sms';
    if (!isAdmin && !user?.unidadeId) return;
    const channel = supabase.channel('enfermagem-fila-espera')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'fila_espera' }, () => loadFila())
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [user?.unidadeId, user?.usuario, loadFila]);

  const openAvaliacao = async (item: FilaItem) => {
    setSelected(item);
    setForm({
      confirmacaoQueixa: '', historicoDoenca: '', comorbidades: '',
      usoMedicamentos: '', alergias: '', limitacoesFuncionais: '',
      estadoGeral: '', mobilidade: '', comunicacao: '', alimentacao: '',
      autonomia: '', validarEspecialidade: true, especialidadeAjustada: '',
      justificativaAlteracao: '', avaliacao_risco: '', prioridade: 'media',
      observacoes_clinicas: '', resultado: 'apto', motivo_inapto: '',
      multiEspecialidades: [],
    });

    const { data: pacData } = await (supabase as any)
      .from('pacientes')
      .select('nome, cpf, cns, data_nascimento, telefone, nome_mae, municipio, ubs_origem, profissional_solicitante, cid, justificativa, tipo_encaminhamento, diagnostico_resumido, descricao_clinica, especialidade_destino')
      .eq('id', item.pacienteId)
      .maybeSingle();
    setPaciente(pacData || null);

    // Load triage data using fila_espera id
    const { data } = await (supabase as any)
      .from('triage_records')
      .select('*')
      .eq('agendamento_id', item.id)
      .not('confirmado_em', 'is', null)
      .maybeSingle();
    setTriagem(data || null);
    setDialogOpen(true);
  };

  const handleSave = async () => {
    if (!selected) return;

    const missing: string[] = [];
    if (!form.confirmacaoQueixa.trim()) missing.push('Confirmação da Queixa');
    if (!form.historicoDoenca.trim()) missing.push('Histórico da Doença Atual');
    if (!form.estadoGeral.trim()) missing.push('Avaliação Geral do Estado');
    if (!form.avaliacao_risco) missing.push('Avaliação de Risco');
    if (!form.observacoes_clinicas.trim()) missing.push('Observações Clínicas');
    if (form.resultado === 'inapto' && !form.motivo_inapto.trim()) missing.push('Justificativa da Inaptidão');
    if (!form.validarEspecialidade && !form.justificativaAlteracao.trim()) missing.push('Justificativa da Alteração de Especialidade');
    if (form.resultado === 'multiprofissional' && form.multiEspecialidades.length === 0) missing.push('Especialidades para Avaliação Multiprofissional');

    if (missing.length > 0) {
      toast.error(`Campos obrigatórios: ${missing.join(', ')}`);
      return;
    }

    setSaving(true);
    try {
      // Save nursing evaluation (clinical history)
      await (supabase as any).from('nursing_evaluations').insert({
        patient_id: selected.pacienteId,
        agendamento_id: selected.id,
        professional_id: user?.id || '',
        unit_id: user?.unidadeId || '',
        anamnese_resumida: [form.confirmacaoQueixa, form.historicoDoenca].filter(Boolean).join('\n'),
        condicao_clinica: form.estadoGeral,
        avaliacao_risco: form.avaliacao_risco,
        prioridade: form.prioridade,
        observacoes_clinicas: form.observacoes_clinicas,
        resultado: form.resultado,
        motivo_inapto: form.motivo_inapto,
      });

      // If specialty was adjusted, update patient record
      if (!form.validarEspecialidade && form.especialidadeAjustada) {
        await (supabase as any).from('pacientes')
          .update({ especialidade_destino: form.especialidadeAjustada })
          .eq('id', selected.pacienteId);

        // Also update fila_espera
        await (supabase as any).from('fila_espera')
          .update({ especialidade_destino: form.especialidadeAjustada })
          .eq('id', selected.id);
      }

      // Determine new status
      let newStatus = '';
      let toastMsg = '';
      if (form.resultado === 'apto') {
        newStatus = 'apto_agendamento';
        toastMsg = 'Paciente APTO PARA AGENDAMENTO — disponível para a recepção.';
      } else if (form.resultado === 'multiprofissional') {
        newStatus = 'aguardando_multiprofissional';
        toastMsg = 'Paciente encaminhado para avaliação multiprofissional.';
      } else {
        newStatus = 'indeferido';
        toastMsg = 'Paciente INDEFERIDO — fluxo encerrado.';
      }

      // Update fila_espera status
      await (supabase as any).from('fila_espera')
        .update({ status: newStatus })
        .eq('id', selected.id);

      await logAction({
        acao: 'avaliacao_enfermagem',
        entidade: 'nursing_evaluation',
        entidadeId: selected.id,
        modulo: 'enfermagem',
        user,
        detalhes: {
          paciente_nome: selected.pacienteNome,
          resultado: form.resultado,
          prioridade: form.prioridade,
          avaliacao_risco: form.avaliacao_risco,
          especialidade_validada: form.validarEspecialidade,
          especialidade_ajustada: form.especialidadeAjustada || '',
          multi_especialidades: form.multiEspecialidades,
        },
      });

      toast.success(toastMsg);
      setDialogOpen(false);
      await loadFila();
      await refreshFila();
    } catch (err: any) {
      toast.error('Erro ao salvar avaliação: ' + (err?.message || 'erro'));
    }
    setSaving(false);
  };

  if (!can('enfermagem', 'can_view')) {
    return <div className="p-6 text-muted-foreground">Sem permissão para acessar esta página.</div>;
  }

  const espLabel = paciente?.especialidade_destino
    ? ESPECIALIDADE_LABELS[paciente.especialidade_destino] || paciente.especialidade_destino.toUpperCase()
    : null;

  return (
    <div className="space-y-4 animate-fade-in">
      <div>
        <h1 className="text-2xl font-bold font-display text-foreground">Avaliação de Enfermagem</h1>
        <p className="text-muted-foreground text-sm">{fila.length} paciente(s) aguardando avaliação</p>
      </div>

      {loading ? (
        <div className="flex justify-center py-12"><Loader2 className="w-8 h-8 animate-spin text-primary" /></div>
      ) : fila.length === 0 ? (
        <Card className="shadow-card border-0">
          <CardContent className="p-8 text-center text-muted-foreground">
            Nenhum paciente aguardando avaliação de enfermagem no momento.
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
                    {espBadge && <Badge variant="outline" className="text-[10px] border-primary/30 text-primary mt-0.5">{espBadge}</Badge>}
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant="outline" className="text-xs">
                      <Clock className="w-3 h-3 mr-1" /> {waitLabel}
                    </Badge>
                    <Button size="sm" className="gradient-primary text-primary-foreground" onClick={() => openAvaliacao(item)}>
                      <Stethoscope className="w-3.5 h-3.5 mr-1" /> Avaliar
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
            <DialogTitle className="font-display">Avaliação de Enfermagem — {selected?.pacienteNome}</DialogTitle>
          </DialogHeader>

          {/* Specialty destination banner */}
          {espLabel && (
            <div className="p-3 rounded-lg border-2 border-primary/30 bg-primary/5">
              <p className="text-xs text-muted-foreground">Especialidade Destino</p>
              <p className="text-lg font-bold text-primary">{espLabel}</p>
            </div>
          )}

          {/* Patient data */}
          {paciente && (
            <div className="space-y-2">
              <h3 className="text-sm font-semibold text-foreground">Dados do Paciente</h3>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 text-xs bg-muted/50 rounded-lg p-3 border">
                <span>CPF: <strong>{paciente.cpf || '—'}</strong></span>
                <span>CNS: <strong>{formatCNS(paciente.cns) || '—'}</strong></span>
                <span>Nasc.: <strong>{paciente.data_nascimento || '—'}</strong></span>
                <span>Telefone: <strong>{paciente.telefone || '—'}</strong></span>
                <span>Mãe: <strong>{paciente.nome_mae || '—'}</strong></span>
                <span>Município: <strong>{paciente.municipio || '—'}</strong></span>
              </div>

              {(paciente.ubs_origem || paciente.cid || paciente.justificativa) && (
                <div className="space-y-1">
                  <h3 className="text-sm font-semibold text-foreground">Encaminhamento</h3>
                  <div className="grid grid-cols-2 gap-2 text-xs bg-accent/30 rounded-lg p-3 border">
                    {paciente.ubs_origem && <span>UBS Origem: <strong>{paciente.ubs_origem}</strong></span>}
                    {paciente.profissional_solicitante && <span>Solicitante: <strong>{paciente.profissional_solicitante}</strong></span>}
                    {paciente.tipo_encaminhamento && <span>Tipo: <strong>{paciente.tipo_encaminhamento}</strong></span>}
                    {paciente.cid && <span>CID: <strong>{paciente.cid}</strong></span>}
                  </div>
                  {paciente.justificativa && <p className="text-xs"><strong>Justificativa:</strong> {paciente.justificativa}</p>}
                  {paciente.diagnostico_resumido && <p className="text-xs"><strong>Diagnóstico:</strong> {paciente.diagnostico_resumido}</p>}
                  {paciente.descricao_clinica && <p className="text-xs"><strong>Descrição Clínica:</strong> {paciente.descricao_clinica}</p>}
                </div>
              )}
            </div>
          )}

          {/* Triage summary */}
          {triagem && (
            <div className="space-y-2">
              <h3 className="text-sm font-semibold text-foreground">Dados da Triagem</h3>
              {triagem.alergias && triagem.alergias.length > 0 && (
                <div className="bg-destructive/10 border border-destructive/30 rounded-lg p-2 text-sm">
                  <strong className="text-destructive">⚠️ ALERGIAS:</strong> {triagem.alergias.join(', ')}
                </div>
              )}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs bg-muted/50 rounded-lg p-3 border">
                {triagem.peso && <span>Peso: <strong>{triagem.peso}kg</strong></span>}
                {triagem.altura && <span>Altura: <strong>{triagem.altura}cm</strong></span>}
                {triagem.imc && <span>IMC: <strong>{triagem.imc}</strong></span>}
                {triagem.pressao_arterial && <span>PA: <strong>{triagem.pressao_arterial}</strong></span>}
                {triagem.temperatura && <span>Temp: <strong>{triagem.temperatura}°C</strong></span>}
                {triagem.frequencia_cardiaca && <span>FC: <strong>{triagem.frequencia_cardiaca} bpm</strong></span>}
                {triagem.saturacao_oxigenio && <span>SatO₂: <strong>{triagem.saturacao_oxigenio}%</strong></span>}
                {triagem.glicemia && <span>Glicemia: <strong>{triagem.glicemia}</strong></span>}
              </div>
              {triagem.queixa && <p className="text-sm"><strong>Queixa (triagem):</strong> {triagem.queixa}</p>}
              {triagem.medicamentos && triagem.medicamentos.length > 0 && (
                <p className="text-sm"><strong>Medicamentos:</strong> {triagem.medicamentos.join(', ')}</p>
              )}
            </div>
          )}

          <div className="space-y-4">
            {/* ══ DADOS CLÍNICOS ══ */}
            <h3 className="text-sm font-semibold text-primary border-b pb-1">Dados Clínicos</h3>

            <div>
              <Label>Confirmação da Queixa *</Label>
              <Textarea rows={2} value={form.confirmacaoQueixa}
                onChange={e => setForm(p => ({ ...p, confirmacaoQueixa: e.target.value }))}
                placeholder="Confirme e detalhe a queixa do paciente..." />
            </div>

            <div>
              <Label>Histórico da Doença Atual *</Label>
              <Textarea rows={2} value={form.historicoDoenca}
                onChange={e => setForm(p => ({ ...p, historicoDoenca: e.target.value }))}
                placeholder="Histórico e evolução da doença..." />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <Label>Comorbidades</Label>
                <Textarea rows={2} value={form.comorbidades}
                  onChange={e => setForm(p => ({ ...p, comorbidades: e.target.value }))}
                  placeholder="Comorbidades conhecidas..." />
              </div>
              <div>
                <Label>Uso de Medicamentos</Label>
                <Textarea rows={2} value={form.usoMedicamentos}
                  onChange={e => setForm(p => ({ ...p, usoMedicamentos: e.target.value }))}
                  placeholder="Medicamentos em uso..." />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <Label>Alergias</Label>
                <Input value={form.alergias}
                  onChange={e => setForm(p => ({ ...p, alergias: e.target.value }))}
                  placeholder="Alergias conhecidas" />
              </div>
              <div>
                <Label>Limitações Funcionais</Label>
                <Input value={form.limitacoesFuncionais}
                  onChange={e => setForm(p => ({ ...p, limitacoesFuncionais: e.target.value }))}
                  placeholder="Limitações funcionais" />
              </div>
            </div>

            <div>
              <Label>Avaliação Geral do Estado *</Label>
              <Textarea rows={2} value={form.estadoGeral}
                onChange={e => setForm(p => ({ ...p, estadoGeral: e.target.value }))}
                placeholder="Estado geral do paciente..." />
            </div>

            {/* ══ AVALIAÇÃO FUNCIONAL ══ */}
            <h3 className="text-sm font-semibold text-primary border-b pb-1">Avaliação Funcional</h3>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Mobilidade</Label>
                <Select value={form.mobilidade} onValueChange={v => setForm(p => ({ ...p, mobilidade: v }))}>
                  <SelectTrigger><SelectValue placeholder="Selecionar..." /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="independente">Independente</SelectItem>
                    <SelectItem value="semi_dependente">Semi-dependente</SelectItem>
                    <SelectItem value="dependente">Dependente</SelectItem>
                    <SelectItem value="acamado">Acamado</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Comunicação</Label>
                <Select value={form.comunicacao} onValueChange={v => setForm(p => ({ ...p, comunicacao: v }))}>
                  <SelectTrigger><SelectValue placeholder="Selecionar..." /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="verbal">Verbal adequada</SelectItem>
                    <SelectItem value="verbal_limitada">Verbal limitada</SelectItem>
                    <SelectItem value="nao_verbal">Não verbal</SelectItem>
                    <SelectItem value="caa">Usa CAA</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Alimentação</Label>
                <Select value={form.alimentacao} onValueChange={v => setForm(p => ({ ...p, alimentacao: v }))}>
                  <SelectTrigger><SelectValue placeholder="Selecionar..." /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="independente">Independente</SelectItem>
                    <SelectItem value="assistida">Assistida</SelectItem>
                    <SelectItem value="sonda">Sonda</SelectItem>
                    <SelectItem value="parenteral">Parenteral</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Autonomia</Label>
                <Select value={form.autonomia} onValueChange={v => setForm(p => ({ ...p, autonomia: v }))}>
                  <SelectTrigger><SelectValue placeholder="Selecionar..." /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="total">Total</SelectItem>
                    <SelectItem value="parcial">Parcial</SelectItem>
                    <SelectItem value="dependente">Dependente</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* ══ ANÁLISE DO ENCAMINHAMENTO ══ */}
            <h3 className="text-sm font-semibold text-primary border-b pb-1">Análise do Encaminhamento</h3>

            <div className="flex items-center gap-3 p-3 rounded-lg bg-muted/50 border">
              <Checkbox
                checked={form.validarEspecialidade}
                onCheckedChange={(v) => setForm(p => ({ ...p, validarEspecialidade: !!v, especialidadeAjustada: '', justificativaAlteracao: '' }))}
                id="validar-esp"
              />
              <Label htmlFor="validar-esp" className="cursor-pointer">
                Validar especialidade do encaminhamento ({espLabel || 'não definida'})
              </Label>
            </div>

            {!form.validarEspecialidade && (
              <div className="space-y-3 pl-3 border-l-2 border-warning/50">
                <div>
                  <Label>Nova Especialidade *</Label>
                  <Select value={form.especialidadeAjustada} onValueChange={v => setForm(p => ({ ...p, especialidadeAjustada: v }))}>
                    <SelectTrigger><SelectValue placeholder="Selecionar..." /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="fisioterapia">Fisioterapia</SelectItem>
                      <SelectItem value="fonoaudiologia">Fonoaudiologia</SelectItem>
                      <SelectItem value="nutricao">Nutrição</SelectItem>
                      <SelectItem value="psicologia">Psicologia</SelectItem>
                      <SelectItem value="terapia_ocupacional">Terapia Ocupacional</SelectItem>
                      <SelectItem value="outros">Outros</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Justificativa da Alteração *</Label>
                  <Textarea rows={2} value={form.justificativaAlteracao}
                    onChange={e => setForm(p => ({ ...p, justificativaAlteracao: e.target.value }))}
                    placeholder="Justifique a alteração da especialidade..." />
                </div>
              </div>
            )}

            {/* Risk + Priority */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <Label>Avaliação de Risco *</Label>
                <Select value={form.avaliacao_risco} onValueChange={v => setForm(p => ({ ...p, avaliacao_risco: v }))}>
                  <SelectTrigger><SelectValue placeholder="Selecionar..." /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="baixo">Baixo</SelectItem>
                    <SelectItem value="moderado">Moderado</SelectItem>
                    <SelectItem value="alto">Alto</SelectItem>
                    <SelectItem value="critico">Crítico</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Prioridade *</Label>
                <Select value={form.prioridade} onValueChange={v => setForm(p => ({ ...p, prioridade: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="baixa">Baixa</SelectItem>
                    <SelectItem value="media">Média</SelectItem>
                    <SelectItem value="alta">Alta</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div>
              <Label>Observações Clínicas *</Label>
              <Textarea rows={2} value={form.observacoes_clinicas}
                onChange={e => setForm(p => ({ ...p, observacoes_clinicas: e.target.value }))}
                placeholder="Observações clínicas relevantes..." />
            </div>

            {/* ══ CONDUTA ══ */}
            <div>
              <Label className="text-base font-semibold">Conduta *</Label>
              <div className="grid grid-cols-3 gap-2 mt-2">
                <Button type="button" variant={form.resultado === 'apto' ? 'default' : 'outline'}
                  className={form.resultado === 'apto' ? 'bg-success hover:bg-success/90 text-success-foreground' : ''}
                  onClick={() => setForm(p => ({ ...p, resultado: 'apto', motivo_inapto: '', multiEspecialidades: [] }))}>
                  <CheckCircle className="w-4 h-4 mr-1" /> APTO
                </Button>
                <Button type="button" variant={form.resultado === 'inapto' ? 'default' : 'outline'}
                  className={form.resultado === 'inapto' ? 'bg-destructive hover:bg-destructive/90 text-destructive-foreground' : ''}
                  onClick={() => setForm(p => ({ ...p, resultado: 'inapto', multiEspecialidades: [] }))}>
                  <XCircle className="w-4 h-4 mr-1" /> NÃO APTO
                </Button>
                <Button type="button" variant={form.resultado === 'multiprofissional' ? 'default' : 'outline'}
                  className={form.resultado === 'multiprofissional' ? 'bg-warning hover:bg-warning/90 text-warning-foreground' : ''}
                  onClick={() => setForm(p => ({ ...p, resultado: 'multiprofissional', motivo_inapto: '' }))}>
                  <AlertTriangle className="w-4 h-4 mr-1" /> MULTI
                </Button>
              </div>
            </div>

            {form.resultado === 'inapto' && (
              <div>
                <Label>Justificativa da Inaptidão *</Label>
                <Textarea rows={2} value={form.motivo_inapto}
                  onChange={e => setForm(p => ({ ...p, motivo_inapto: e.target.value }))}
                  placeholder="Justifique a inaptidão do paciente..." />
              </div>
            )}

            {form.resultado === 'multiprofissional' && (
              <div className="space-y-2">
                <Label>Especialidades para Avaliação Multiprofissional *</Label>
                <div className="space-y-2">
                  {MULTI_ESPECIALIDADES.map(esp => (
                    <div key={esp.value} className="flex items-center gap-2">
                      <Checkbox
                        checked={form.multiEspecialidades.includes(esp.value)}
                        onCheckedChange={(checked) => {
                          setForm(p => ({
                            ...p,
                            multiEspecialidades: checked
                              ? [...p.multiEspecialidades, esp.value]
                              : p.multiEspecialidades.filter(e => e !== esp.value),
                          }));
                        }}
                      />
                      <Label className="text-sm cursor-pointer">{esp.label}</Label>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <Button className="w-full" onClick={handleSave} disabled={saving}>
              {saving && <Loader2 className="w-4 h-4 animate-spin mr-2" />}
              Confirmar Avaliação de Enfermagem
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default AvaliacaoEnfermagem;
