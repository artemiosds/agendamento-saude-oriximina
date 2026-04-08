import React, { useState, useEffect, useMemo, useCallback } from 'react';
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
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Loader2, Plus, Search, Eye, FileText } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { BuscaPaciente } from '@/components/BuscaPaciente';

const SPECIALTIES = [
  'Fisioterapia', 'Fonoaudiologia', 'Psicologia', 'Terapia Ocupacional',
  'Neuropsicologia', 'Psicopedagogia', 'Nutrição', 'Serviço Social', 'Enfermagem',
];

interface PTSRecord {
  id: string;
  patient_id: string;
  professional_id: string;
  unit_id: string;
  diagnostico_funcional: string;
  objetivos_terapeuticos: string;
  metas_curto_prazo: string;
  metas_medio_prazo: string;
  metas_longo_prazo: string;
  especialidades_envolvidas: string[];
  status: string;
  created_at: string;
  updated_at: string;
}

const PTS: React.FC = () => {
  const { user, hasPermission } = useAuth();
  const { pacientes, funcionarios, logAction } = useData();
  const [ptsList, setPtsList] = useState<PTSRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [detailPts, setDetailPts] = useState<PTSRecord | null>(null);
  const [saving, setSaving] = useState(false);

  const [form, setForm] = useState({
    patient_id: '', patient_name: '',
    diagnostico_funcional: '', objetivos_terapeuticos: '',
    metas_curto_prazo: '', metas_medio_prazo: '', metas_longo_prazo: '',
    especialidades_envolvidas: [] as string[],
  });

  const loadPts = useCallback(async () => {
    setLoading(true);
    const { data } = await (supabase as any).from('pts').select('*').order('created_at', { ascending: false });
    if (data) setPtsList(data);
    setLoading(false);
  }, []);

  useEffect(() => { loadPts(); }, [loadPts]);

  const filtered = useMemo(() => {
    if (!search) return ptsList;
    const q = search.toLowerCase();
    return ptsList.filter(p => {
      const pac = pacientes.find(px => px.id === p.patient_id);
      return pac?.nome.toLowerCase().includes(q) || p.diagnostico_funcional.toLowerCase().includes(q);
    });
  }, [ptsList, search, pacientes]);

  const toggleSpec = (spec: string) => {
    setForm(p => ({
      ...p,
      especialidades_envolvidas: p.especialidades_envolvidas.includes(spec)
        ? p.especialidades_envolvidas.filter(s => s !== spec)
        : [...p.especialidades_envolvidas, spec],
    }));
  };

  const handleSave = async () => {
    if (!form.patient_id || !form.diagnostico_funcional || !form.objetivos_terapeuticos) {
      toast.error('Preencha paciente, diagnóstico funcional e objetivos.');
      return;
    }
    setSaving(true);
    try {
      await (supabase as any).from('pts').insert({
        patient_id: form.patient_id,
        professional_id: user?.id || '',
        unit_id: user?.unidadeId || '',
        diagnostico_funcional: form.diagnostico_funcional,
        objetivos_terapeuticos: form.objetivos_terapeuticos,
        metas_curto_prazo: form.metas_curto_prazo,
        metas_medio_prazo: form.metas_medio_prazo,
        metas_longo_prazo: form.metas_longo_prazo,
        especialidades_envolvidas: form.especialidades_envolvidas,
      });

      // Save as prontuário entry
      await (supabase as any).from('prontuarios').insert({
        paciente_id: form.patient_id,
        paciente_nome: form.patient_name,
        profissional_id: user?.id || '',
        profissional_nome: user?.nome || '',
        unidade_id: user?.unidadeId || '',
        data_atendimento: new Date().toISOString().split('T')[0],
        hora_atendimento: new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }),
        tipo_registro: 'pts',
        queixa_principal: 'Projeto Terapêutico Singular',
        anamnese: form.diagnostico_funcional,
        hipotese: form.objetivos_terapeuticos,
        conduta: `Curto prazo: ${form.metas_curto_prazo}\nMédio prazo: ${form.metas_medio_prazo}\nLongo prazo: ${form.metas_longo_prazo}`,
        observacoes: `Especialidades: ${form.especialidades_envolvidas.join(', ')}`,
      });

      await logAction({
        acao: 'criar_pts', entidade: 'pts', entidadeId: form.patient_id,
        modulo: 'pts', user,
        detalhes: { paciente_nome: form.patient_name, especialidades: form.especialidades_envolvidas },
      });

      toast.success('PTS criado e registrado no prontuário!');
      setDialogOpen(false);
      loadPts();
    } catch (err: any) {
      toast.error('Erro: ' + (err?.message || 'erro'));
    }
    setSaving(false);
  };

  if (!hasPermission(['master', 'coordenador', 'profissional'])) {
    return <div className="p-6 text-muted-foreground">Sem permissão.</div>;
  }

  return (
    <div className="space-y-4 animate-fade-in">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold font-display text-foreground">PTS — Projeto Terapêutico Singular</h1>
          <p className="text-muted-foreground text-sm">{ptsList.length} projeto(s) registrado(s)</p>
        </div>
        <Button onClick={() => {
          setForm({ patient_id: '', patient_name: '', diagnostico_funcional: '', objetivos_terapeuticos: '', metas_curto_prazo: '', metas_medio_prazo: '', metas_longo_prazo: '', especialidades_envolvidas: [] });
          setDialogOpen(true);
        }}>
          <Plus className="w-4 h-4 mr-1" /> Novo PTS
        </Button>
      </div>

      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <Input placeholder="Buscar por paciente..." value={search} onChange={e => setSearch(e.target.value)} className="pl-9" />
      </div>

      {loading ? (
        <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-primary" /></div>
      ) : filtered.length === 0 ? (
        <Card><CardContent className="p-8 text-center text-muted-foreground">Nenhum PTS encontrado.</CardContent></Card>
      ) : (
        <div className="space-y-2">
          {filtered.map(pts => {
            const pac = pacientes.find(p => p.id === pts.patient_id);
            const prof = funcionarios.find(f => f.id === pts.professional_id);
            return (
              <Card key={pts.id} className="hover:shadow-sm transition-shadow">
                <CardContent className="p-3 flex flex-col sm:flex-row sm:items-center gap-2">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-medium text-sm">{pac?.nome || pts.patient_id}</span>
                      <Badge variant="outline" className={pts.status === 'ativo' ? 'bg-success/10 text-success' : 'bg-muted text-muted-foreground'}>
                        {pts.status === 'ativo' ? 'Ativo' : 'Encerrado'}
                      </Badge>
                    </div>
                    <p className="text-xs text-muted-foreground mt-1">
                      Prof. {prof?.nome || '—'} • {new Date(pts.created_at).toLocaleDateString('pt-BR')}
                      {pts.especialidades_envolvidas.length > 0 && ` • ${pts.especialidades_envolvidas.join(', ')}`}
                    </p>
                  </div>
                  <Button size="sm" variant="ghost" onClick={() => setDetailPts(pts)}>
                    <Eye className="w-4 h-4" />
                  </Button>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* New PTS Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle className="font-display">Novo PTS</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Paciente *</Label>
              <BuscaPaciente pacientes={pacientes} value={form.patient_id}
                onChange={(id, nome) => setForm(p => ({ ...p, patient_id: id, patient_name: nome }))} />
            </div>
            <div>
              <Label>Diagnóstico Funcional Global *</Label>
              <Textarea rows={3} value={form.diagnostico_funcional}
                onChange={e => setForm(p => ({ ...p, diagnostico_funcional: e.target.value }))}
                placeholder="Diagnóstico funcional completo do paciente..." />
            </div>
            <div>
              <Label>Objetivos Terapêuticos *</Label>
              <Textarea rows={3} value={form.objetivos_terapeuticos}
                onChange={e => setForm(p => ({ ...p, objetivos_terapeuticos: e.target.value }))}
                placeholder="Objetivos gerais do tratamento..." />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <Label>Metas — Curto Prazo</Label>
                <Textarea rows={2} value={form.metas_curto_prazo}
                  onChange={e => setForm(p => ({ ...p, metas_curto_prazo: e.target.value }))}
                  placeholder="1-3 meses..." />
              </div>
              <div>
                <Label>Metas — Médio Prazo</Label>
                <Textarea rows={2} value={form.metas_medio_prazo}
                  onChange={e => setForm(p => ({ ...p, metas_medio_prazo: e.target.value }))}
                  placeholder="3-6 meses..." />
              </div>
              <div>
                <Label>Metas — Longo Prazo</Label>
                <Textarea rows={2} value={form.metas_longo_prazo}
                  onChange={e => setForm(p => ({ ...p, metas_longo_prazo: e.target.value }))}
                  placeholder="6-12 meses..." />
              </div>
            </div>
            <div>
              <Label>Especialidades Envolvidas</Label>
              <div className="flex flex-wrap gap-2 mt-2">
                {SPECIALTIES.map(spec => (
                  <label key={spec} className="flex items-center gap-1.5 text-sm cursor-pointer">
                    <Checkbox checked={form.especialidades_envolvidas.includes(spec)} onCheckedChange={() => toggleSpec(spec)} />
                    {spec}
                  </label>
                ))}
              </div>
            </div>
            <Button className="w-full" onClick={handleSave} disabled={saving}>
              {saving && <Loader2 className="w-4 h-4 animate-spin mr-2" />}
              Salvar PTS
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Detail Dialog */}
      <Dialog open={!!detailPts} onOpenChange={() => setDetailPts(null)}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle className="font-display">Detalhes do PTS</DialogTitle></DialogHeader>
          {detailPts && (
            <div className="space-y-3 text-sm">
              <div><strong>Paciente:</strong> {pacientes.find(p => p.id === detailPts.patient_id)?.nome || detailPts.patient_id}</div>
              <div><strong>Profissional:</strong> {funcionarios.find(f => f.id === detailPts.professional_id)?.nome || '—'}</div>
              <div><strong>Data:</strong> {new Date(detailPts.created_at).toLocaleDateString('pt-BR')}</div>
              <div className="border-t pt-2"><strong>Diagnóstico Funcional:</strong><p className="mt-1 text-muted-foreground">{detailPts.diagnostico_funcional}</p></div>
              <div><strong>Objetivos Terapêuticos:</strong><p className="mt-1 text-muted-foreground">{detailPts.objetivos_terapeuticos}</p></div>
              {detailPts.metas_curto_prazo && <div><strong>Curto Prazo:</strong><p className="mt-1 text-muted-foreground">{detailPts.metas_curto_prazo}</p></div>}
              {detailPts.metas_medio_prazo && <div><strong>Médio Prazo:</strong><p className="mt-1 text-muted-foreground">{detailPts.metas_medio_prazo}</p></div>}
              {detailPts.metas_longo_prazo && <div><strong>Longo Prazo:</strong><p className="mt-1 text-muted-foreground">{detailPts.metas_longo_prazo}</p></div>}
              {detailPts.especialidades_envolvidas.length > 0 && (
                <div><strong>Especialidades:</strong>
                  <div className="flex flex-wrap gap-1 mt-1">
                    {detailPts.especialidades_envolvidas.map(s => <Badge key={s} variant="outline">{s}</Badge>)}
                  </div>
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default PTS;
