import React, { useState, useEffect, useRef } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useData } from '@/contexts/DataContext';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Loader2, Plus, FileText, Printer, Pencil, Search, CheckCircle } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { useSearchParams, useNavigate } from 'react-router-dom';
import AtendimentoTimer from '@/components/AtendimentoTimer';

interface ProntuarioDB {
  id: string;
  paciente_id: string;
  paciente_nome: string;
  profissional_id: string;
  profissional_nome: string;
  unidade_id: string;
  sala_id: string;
  setor: string;
  agendamento_id: string;
  data_atendimento: string;
  hora_atendimento: string;
  queixa_principal: string;
  anamnese: string;
  sinais_sintomas: string;
  exame_fisico: string;
  hipotese: string;
  conduta: string;
  prescricao: string;
  solicitacao_exames: string;
  evolucao: string;
  observacoes: string;
  criado_em: string;
  atualizado_em: string;
}

const emptyForm = {
  paciente_id: '',
  paciente_nome: '',
  agendamento_id: '',
  data_atendimento: new Date().toISOString().split('T')[0],
  hora_atendimento: '',
  queixa_principal: '',
  anamnese: '',
  sinais_sintomas: '',
  exame_fisico: '',
  hipotese: '',
  conduta: '',
  prescricao: '',
  solicitacao_exames: '',
  evolucao: '',
  observacoes: '',
};

const ProntuarioPage: React.FC = () => {
  const { user, hasPermission } = useAuth();
  const { pacientes, unidades, agendamentos, updateAgendamento } = useData();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const [prontuarios, setProntuarios] = useState<ProntuarioDB[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [search, setSearch] = useState('');
  const [activeAtendimento, setActiveAtendimento] = useState<{ agendamentoId: string; horaInicio: string } | null>(null);
  const printRef = useRef<HTMLDivElement>(null);

  const isProfissional = user?.role === 'profissional';
  const canEdit = hasPermission(['master', 'coordenador', 'profissional']);

  // Get tempo_atendimento for current professional (default 30)
  const tempoLimite = user?.tempoAtendimento || 30;

  const loadProntuarios = async () => {
    setLoading(true);
    try {
      let query = (supabase as any).from('prontuarios').select('*').order('data_atendimento', { ascending: false });

      if (isProfissional && user) {
        query = query.eq('profissional_id', user.id);
      }
      if (user?.role === 'coordenador' && user.unidadeId) {
        query = query.eq('unidade_id', user.unidadeId);
      }

      const { data, error } = await query;
      if (data) setProntuarios(data);
      if (error) console.error('Error loading prontuarios:', error);
    } catch (err) {
      console.error('Error:', err);
    }
    setLoading(false);
  };

  useEffect(() => {
    loadProntuarios();
  }, [user]);

  // Auto-open form when coming from "Iniciar Atendimento"
  useEffect(() => {
    const pacienteId = searchParams.get('pacienteId');
    const pacienteNome = searchParams.get('pacienteNome');
    const agendamentoId = searchParams.get('agendamentoId');
    const horaInicio = searchParams.get('horaInicio');
    const data = searchParams.get('data');

    if (pacienteId && pacienteNome) {
      setEditId(null);
      setForm({
        ...emptyForm,
        paciente_id: pacienteId,
        paciente_nome: pacienteNome,
        agendamento_id: agendamentoId || '',
        data_atendimento: data || new Date().toISOString().split('T')[0],
        hora_atendimento: horaInicio || '',
      });
      setDialogOpen(true);

      if (agendamentoId && horaInicio) {
        setActiveAtendimento({ agendamentoId, horaInicio });
      }
    }
  }, [searchParams]);

  const openNew = () => {
    setEditId(null);
    setActiveAtendimento(null);
    setForm({ ...emptyForm, data_atendimento: new Date().toISOString().split('T')[0] });
    setDialogOpen(true);
  };

  const openEdit = (p: ProntuarioDB) => {
    setEditId(p.id);
    setActiveAtendimento(null);
    setForm({
      paciente_id: p.paciente_id,
      paciente_nome: p.paciente_nome,
      agendamento_id: p.agendamento_id || '',
      data_atendimento: p.data_atendimento,
      hora_atendimento: p.hora_atendimento || '',
      queixa_principal: p.queixa_principal || '',
      anamnese: p.anamnese || '',
      sinais_sintomas: p.sinais_sintomas || '',
      exame_fisico: p.exame_fisico || '',
      hipotese: p.hipotese || '',
      conduta: p.conduta || '',
      prescricao: p.prescricao || '',
      solicitacao_exames: p.solicitacao_exames || '',
      evolucao: p.evolucao || '',
      observacoes: p.observacoes || '',
    });
    setDialogOpen(true);
  };

  const handleSave = async () => {
    if (!form.paciente_nome || !form.data_atendimento) {
      toast.error('Paciente e data são obrigatórios.');
      return;
    }

    setSaving(true);
    try {
      const record = {
        paciente_id: form.paciente_id || `manual_${Date.now()}`,
        paciente_nome: form.paciente_nome,
        profissional_id: user?.id || '',
        profissional_nome: user?.nome || '',
        unidade_id: user?.unidadeId || '',
        setor: user?.setor || '',
        agendamento_id: form.agendamento_id,
        data_atendimento: form.data_atendimento,
        hora_atendimento: form.hora_atendimento,
        queixa_principal: form.queixa_principal,
        anamnese: form.anamnese,
        sinais_sintomas: form.sinais_sintomas,
        exame_fisico: form.exame_fisico,
        hipotese: form.hipotese,
        conduta: form.conduta,
        prescricao: form.prescricao,
        solicitacao_exames: form.solicitacao_exames,
        evolucao: form.evolucao,
        observacoes: form.observacoes,
      };

      if (editId) {
        const { error } = await (supabase as any).from('prontuarios').update(record).eq('id', editId);
        if (error) throw error;
        toast.success('Prontuário atualizado!');
      } else {
        const { error } = await (supabase as any).from('prontuarios').insert(record);
        if (error) throw error;
        toast.success('Prontuário criado!');
      }

      setDialogOpen(false);
      await loadProntuarios();
    } catch (err: any) {
      toast.error('Erro ao salvar: ' + (err?.message || 'erro desconhecido'));
    }
    setSaving(false);
  };

  const handleFinalizarAtendimento = async () => {
    // Save prontuário first
    await handleSave();

    if (!activeAtendimento) return;

    const now = new Date();
    const horaFim = now.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });

    // Calculate duration
    const [hi, mi] = activeAtendimento.horaInicio.split(':').map(Number);
    const [hf, mf] = horaFim.split(':').map(Number);
    const duracaoMinutos = (hf * 60 + mf) - (hi * 60 + mi);

    // Update atendimento in DB
    try {
      await (supabase as any).from('atendimentos')
        .update({ hora_fim: horaFim, duracao_minutos: Math.max(0, duracaoMinutos), status: 'finalizado' })
        .eq('agendamento_id', activeAtendimento.agendamentoId);
    } catch (err) {
      console.error('Error finalizing atendimento:', err);
    }

    // Update agendamento status
    updateAgendamento(activeAtendimento.agendamentoId, { status: 'concluido' });

    setActiveAtendimento(null);
    toast.success(`Atendimento finalizado! Duração: ${Math.max(0, duracaoMinutos)} minutos.`);
    navigate('/painel/agenda');
  };

  const handlePrint = (p: ProntuarioDB) => {
    const printWindow = window.open('', '_blank');
    if (!printWindow) {
      toast.error('Habilite popups para imprimir.');
      return;
    }

    const unidadeNome = unidades.find(u => u.id === p.unidade_id)?.nome || p.unidade_id;

    printWindow.document.write(`
      <!DOCTYPE html>
      <html>
      <head>
        <title>Prontuário - ${p.paciente_nome}</title>
        <style>
          * { margin: 0; padding: 0; box-sizing: border-box; }
          body { font-family: 'Segoe UI', Arial, sans-serif; padding: 20px; color: #333; font-size: 12px; }
          .header { text-align: center; border-bottom: 2px solid #0369a1; padding-bottom: 12px; margin-bottom: 16px; }
          .header h1 { font-size: 16px; color: #0369a1; }
          .header p { font-size: 11px; color: #666; }
          .info-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; margin-bottom: 16px; padding: 10px; background: #f8fafc; border-radius: 6px; }
          .info-label { font-weight: 600; font-size: 10px; text-transform: uppercase; color: #666; }
          .info-value { font-size: 12px; }
          .section { margin-bottom: 12px; }
          .section-title { font-weight: 600; font-size: 11px; text-transform: uppercase; color: #0369a1; border-bottom: 1px solid #e2e8f0; padding-bottom: 4px; margin-bottom: 6px; }
          .section-content { font-size: 12px; line-height: 1.5; white-space: pre-wrap; min-height: 20px; }
          .signature { margin-top: 50px; text-align: center; }
          .signature-line { width: 250px; border-top: 1px solid #333; margin: 0 auto 4px; }
          .footer { margin-top: 40px; text-align: center; border-top: 1px solid #e2e8f0; padding-top: 12px; }
          @media print { body { padding: 10px; } }
        </style>
      </head>
      <body>
        <div class="header">
          <h1>Secretaria Municipal de Saúde de Oriximiná</h1>
          <p>${unidadeNome}</p>
          <p style="margin-top: 8px; font-size: 14px; font-weight: 600;">PRONTUÁRIO DE ATENDIMENTO</p>
        </div>
        <div class="info-grid">
          <div><span class="info-label">Paciente:</span><br/><span class="info-value">${p.paciente_nome}</span></div>
          <div><span class="info-label">Data:</span><br/><span class="info-value">${new Date(p.data_atendimento + 'T12:00:00').toLocaleDateString('pt-BR')}</span></div>
          <div><span class="info-label">Profissional:</span><br/><span class="info-value">${p.profissional_nome}</span></div>
          <div><span class="info-label">Hora:</span><br/><span class="info-value">${p.hora_atendimento || '-'}</span></div>
        </div>
        ${p.queixa_principal ? `<div class="section"><div class="section-title">Queixa Principal</div><div class="section-content">${p.queixa_principal}</div></div>` : ''}
        ${p.anamnese ? `<div class="section"><div class="section-title">Anamnese</div><div class="section-content">${p.anamnese}</div></div>` : ''}
        ${p.sinais_sintomas ? `<div class="section"><div class="section-title">Sinais e Sintomas</div><div class="section-content">${p.sinais_sintomas}</div></div>` : ''}
        ${p.exame_fisico ? `<div class="section"><div class="section-title">Exame Físico</div><div class="section-content">${p.exame_fisico}</div></div>` : ''}
        ${p.hipotese ? `<div class="section"><div class="section-title">Hipótese / Avaliação</div><div class="section-content">${p.hipotese}</div></div>` : ''}
        ${p.conduta ? `<div class="section"><div class="section-title">Conduta</div><div class="section-content">${p.conduta}</div></div>` : ''}
        ${p.prescricao ? `<div class="section"><div class="section-title">Prescrição / Orientações</div><div class="section-content">${p.prescricao}</div></div>` : ''}
        ${p.solicitacao_exames ? `<div class="section"><div class="section-title">Solicitação de Exames</div><div class="section-content">${p.solicitacao_exames}</div></div>` : ''}
        ${p.evolucao ? `<div class="section"><div class="section-title">Evolução</div><div class="section-content">${p.evolucao}</div></div>` : ''}
        ${p.observacoes ? `<div class="section"><div class="section-title">Observações Gerais</div><div class="section-content">${p.observacoes}</div></div>` : ''}
        <div class="signature">
          <div class="signature-line"></div>
          <p>${p.profissional_nome}</p>
          <p style="font-size: 10px; color: #666;">${p.setor || ''}</p>
        </div>
        <div class="footer">
          <p style="font-size: 10px; color: #999;">Documento gerado em ${new Date().toLocaleString('pt-BR')} — SMS Oriximiná</p>
        </div>
      </body>
      </html>
    `);
    printWindow.document.close();
    printWindow.focus();
    printWindow.print();
  };

  const filtered = prontuarios.filter(p =>
    !search || p.paciente_nome.toLowerCase().includes(search.toLowerCase()) ||
    p.profissional_nome.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="space-y-4 animate-fade-in">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold font-display text-foreground">Prontuários</h1>
          <p className="text-muted-foreground text-sm">{filtered.length} registro(s)</p>
        </div>
        {canEdit && (
          <Button onClick={openNew} className="gradient-primary text-primary-foreground">
            <Plus className="w-4 h-4 mr-2" />Novo Prontuário
          </Button>
        )}
      </div>

      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <Input
          placeholder="Buscar por paciente ou profissional..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="pl-10"
        />
      </div>

      {/* Form Dialog */}
      <Dialog open={dialogOpen} onOpenChange={(open) => {
        setDialogOpen(open);
        if (!open) setActiveAtendimento(null);
      }}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="font-display">{editId ? 'Editar' : 'Novo'} Prontuário</DialogTitle>
          </DialogHeader>

          {/* Timer when active atendimento */}
          {activeAtendimento && (
            <AtendimentoTimer
              horaInicio={activeAtendimento.horaInicio}
              tempoLimite={tempoLimite}
            />
          )}

          <div className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <Label>Paciente *</Label>
                <Select
                  value={form.paciente_id}
                  onValueChange={v => {
                    const pac = pacientes.find(p => p.id === v);
                    setForm(prev => ({ ...prev, paciente_id: v, paciente_nome: pac?.nome || '' }));
                  }}
                >
                  <SelectTrigger><SelectValue placeholder="Selecione o paciente" /></SelectTrigger>
                  <SelectContent>
                    {pacientes.map(p => (
                      <SelectItem key={p.id} value={p.id}>{p.nome}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div><Label>Data *</Label><Input type="date" value={form.data_atendimento} onChange={e => setForm(p => ({ ...p, data_atendimento: e.target.value }))} /></div>
                <div><Label>Hora</Label><Input type="time" value={form.hora_atendimento} onChange={e => setForm(p => ({ ...p, hora_atendimento: e.target.value }))} /></div>
              </div>
            </div>

            <div><Label>Queixa Principal</Label><Textarea rows={2} value={form.queixa_principal} onChange={e => setForm(p => ({ ...p, queixa_principal: e.target.value }))} /></div>
            <div><Label>Anamnese</Label><Textarea rows={3} value={form.anamnese} onChange={e => setForm(p => ({ ...p, anamnese: e.target.value }))} /></div>
            <div><Label>Sinais e Sintomas</Label><Textarea rows={2} value={form.sinais_sintomas} onChange={e => setForm(p => ({ ...p, sinais_sintomas: e.target.value }))} /></div>
            <div><Label>Exame Físico</Label><Textarea rows={3} value={form.exame_fisico} onChange={e => setForm(p => ({ ...p, exame_fisico: e.target.value }))} /></div>
            <div><Label>Hipótese / Avaliação</Label><Textarea rows={2} value={form.hipotese} onChange={e => setForm(p => ({ ...p, hipotese: e.target.value }))} /></div>
            <div><Label>Conduta</Label><Textarea rows={2} value={form.conduta} onChange={e => setForm(p => ({ ...p, conduta: e.target.value }))} /></div>
            <div><Label>Prescrição / Orientações</Label><Textarea rows={2} value={form.prescricao} onChange={e => setForm(p => ({ ...p, prescricao: e.target.value }))} /></div>
            <div><Label>Solicitação de Exames</Label><Textarea rows={2} value={form.solicitacao_exames} onChange={e => setForm(p => ({ ...p, solicitacao_exames: e.target.value }))} /></div>
            <div><Label>Evolução</Label><Textarea rows={2} value={form.evolucao} onChange={e => setForm(p => ({ ...p, evolucao: e.target.value }))} /></div>
            <div><Label>Observações Gerais</Label><Textarea rows={2} value={form.observacoes} onChange={e => setForm(p => ({ ...p, observacoes: e.target.value }))} /></div>

            <div className="flex gap-2">
              {activeAtendimento ? (
                <>
                  <Button onClick={handleSave} disabled={saving} variant="outline" className="flex-1">
                    {saving && <Loader2 className="w-4 h-4 animate-spin mr-2" />}
                    Salvar Rascunho
                  </Button>
                  <Button onClick={handleFinalizarAtendimento} disabled={saving} className="flex-1 bg-success hover:bg-success/90 text-success-foreground">
                    <CheckCircle className="w-4 h-4 mr-2" />
                    Finalizar Atendimento
                  </Button>
                </>
              ) : (
                <Button onClick={handleSave} disabled={saving} className="w-full gradient-primary text-primary-foreground">
                  {saving && <Loader2 className="w-4 h-4 animate-spin mr-2" />}
                  {editId ? 'Salvar Alterações' : 'Registrar Prontuário'}
                </Button>
              )}
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* List */}
      {loading ? (
        <div className="flex justify-center py-12"><Loader2 className="w-8 h-8 animate-spin text-primary" /></div>
      ) : filtered.length === 0 ? (
        <Card className="shadow-card border-0">
          <CardContent className="p-8 text-center">
            <FileText className="w-12 h-12 mx-auto text-muted-foreground mb-3" />
            <p className="text-muted-foreground">Nenhum prontuário encontrado.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {filtered.map(p => (
            <Card key={p.id} className="shadow-card border-0">
              <CardContent className="p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="font-semibold text-foreground">{p.paciente_nome}</p>
                      <span className="text-xs bg-muted text-muted-foreground px-2 py-0.5 rounded-full">
                        {new Date(p.data_atendimento + 'T12:00:00').toLocaleDateString('pt-BR')}
                      </span>
                      {p.hora_atendimento && (
                        <span className="text-xs text-muted-foreground">{p.hora_atendimento}</span>
                      )}
                    </div>
                    <p className="text-sm text-muted-foreground mt-1">
                      Prof. {p.profissional_nome}{p.setor ? ` • ${p.setor}` : ''}
                    </p>
                    {p.queixa_principal && (
                      <p className="text-sm text-foreground mt-1 line-clamp-2">
                        <strong>QP:</strong> {p.queixa_principal}
                      </p>
                    )}
                  </div>
                  <div className="flex gap-1 shrink-0">
                    {canEdit && (isProfissional ? p.profissional_id === user?.id : true) && (
                      <Button size="icon" variant="ghost" onClick={() => openEdit(p)}>
                        <Pencil className="w-4 h-4" />
                      </Button>
                    )}
                    <Button size="icon" variant="ghost" onClick={() => handlePrint(p)}>
                      <Printer className="w-4 h-4" />
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <div ref={printRef} className="hidden" />
    </div>
  );
};

export default ProntuarioPage;
