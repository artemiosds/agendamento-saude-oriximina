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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Loader2, Plus, Search, Eye, Edit2, AlertTriangle, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { BuscaPaciente } from '@/components/BuscaPaciente';

const SPECIALTIES = [
  'Fisioterapia', 'Fonoaudiologia', 'Psicologia', 'Terapia Ocupacional',
  'Neuropsicologia', 'Psicopedagogia', 'Nutrição', 'Serviço Social', 'Enfermagem',
];

const SPECIALTY_TO_SIGTAP: Record<string, string> = {
  'Fisioterapia': 'fisioterapia',
  'Fonoaudiologia': 'fonoaudiologia',
  'Psicologia': 'psicologia',
  'Terapia Ocupacional': 'terapia_ocupacional',
  'Nutrição': 'nutricao',
  'Serviço Social': 'assistencia_social',
  'Enfermagem': 'enfermagem',
};

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

interface SigtapProcedimento {
  id: string;
  codigo: string;
  nome: string;
  especialidade: string;
  total_cids: number;
}

interface SigtapCid {
  cid_codigo: string;
  cid_descricao: string;
}

interface SelectedSigtap {
  procedimento_codigo: string;
  procedimento_nome: string;
  especialidade: string;
}

interface SelectedCid {
  cid_codigo: string;
  cid_descricao: string;
}

const PTS: React.FC = () => {
  const { user } = useAuth();
  const { can } = usePermissions();
  const { pacientes, funcionarios, logAction } = useData();
  const [ptsList, setPtsList] = useState<PTSRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingPts, setEditingPts] = useState<PTSRecord | null>(null);
  const [detailPts, setDetailPts] = useState<PTSRecord | null>(null);
  const [saving, setSaving] = useState(false);

  // SIGTAP catalog state
  const [sigtapProcs, setSigtapProcs] = useState<SigtapProcedimento[]>([]);
  const [selectedProcCodigo, setSelectedProcCodigo] = useState('');
  const [validCids, setValidCids] = useState<SigtapCid[]>([]);
  const [cidSearch, setCidSearch] = useState('');
  const [cidWarning, setCidWarning] = useState(false);
  const [loadingCids, setLoadingCids] = useState(false);
  const [loadingProcs, setLoadingProcs] = useState(false);

  // Persisted selections (multiple)
  const [sigtapSelecionados, setSigtapSelecionados] = useState<SelectedSigtap[]>([]);
  const [cidsSelecionados, setCidsSelecionados] = useState<SelectedCid[]>([]);

  // Detail view saved data
  const [detailSigtap, setDetailSigtap] = useState<SelectedSigtap[]>([]);
  const [detailCids, setDetailCids] = useState<SelectedCid[]>([]);

  const isMaster = user?.role === 'master';

  const normalize = useCallback((value: string) =>
    value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim(), []);

  const isFisioterapeuta = useMemo(() => {
    if (!user) return false;
    const prof = normalize(user.profissao || '');
    return prof.includes('fisioterap') || prof.includes('fisio');
  }, [user, normalize]);

  const [form, setForm] = useState({
    patient_id: '', patient_name: '',
    diagnostico_funcional: '', objetivos_terapeuticos: '',
    metas_curto_prazo: '', metas_medio_prazo: '', metas_longo_prazo: '',
    especialidades_envolvidas: [] as string[],
  });

  // Load SIGTAP procedures dynamically based on selected specialties
  const loadSigtapProcsForSpecialties = useCallback(async (specialties: string[]) => {
    if (!user) return;
    const sigtapKeys = specialties.map(s => SPECIALTY_TO_SIGTAP[s]).filter(Boolean);
    if (sigtapKeys.length === 0) { setSigtapProcs([]); return; }
    setLoadingProcs(true);
    try {
      const { data, error } = await supabase
        .from('sigtap_procedimentos')
        .select('*')
        .in('especialidade', sigtapKeys)
        .eq('ativo', true)
        .order('especialidade')
        .order('codigo');
      if (error) { console.error('Erro ao carregar SIGTAP:', error); return; }
      setSigtapProcs(data || []);
    } catch (err) {
      console.error('Erro SIGTAP:', err);
    } finally {
      setLoadingProcs(false);
    }
  }, [user]);

  useEffect(() => {
    if (!dialogOpen) return;
    if (!isFisioterapeuta && !isMaster) { setSigtapProcs([]); return; }
    loadSigtapProcsForSpecialties(form.especialidades_envolvidas);
  }, [form.especialidades_envolvidas, dialogOpen, isFisioterapeuta, isMaster, loadSigtapProcsForSpecialties]);

  const loadPts = useCallback(async () => {
    setLoading(true);
    let query = supabase.from('pts').select('*').order('created_at', { ascending: false });
    if (user?.usuario !== 'admin.sms' && user?.unidadeId) {
      query = query.eq('unit_id', user.unidadeId);
    }
    if (!isMaster && user?.role === 'profissional') {
      query = query.eq('professional_id', user.id);
    }
    const { data } = await query;
    if (data) setPtsList(data);
    setLoading(false);
  }, [isMaster, user]);

  useEffect(() => { loadPts(); }, [loadPts]);

  // Load valid CIDs when procedure is selected
  useEffect(() => {
    if (!selectedProcCodigo) { setValidCids([]); return; }
    setLoadingCids(true);
    supabase
      .from('sigtap_procedimento_cids')
      .select('cid_codigo, cid_descricao')
      .eq('procedimento_codigo', selectedProcCodigo)
      .order('cid_codigo')
      .then(({ data, error }) => {
        if (error) console.error('Erro ao carregar CIDs:', error);
        setValidCids(data || []);
        setLoadingCids(false);
      });
  }, [selectedProcCodigo]);

  // CID warning
  useEffect(() => {
    if (!selectedProcCodigo || !cidSearch.trim()) { setCidWarning(false); return; }
    const typed = cidSearch.trim().toUpperCase();
    if (typed.length >= 3) {
      const found = validCids.some(c =>
        c.cid_codigo.toUpperCase() === typed || c.cid_codigo.toUpperCase().startsWith(typed)
      );
      setCidWarning(!found);
    } else {
      setCidWarning(false);
    }
  }, [cidSearch, validCids, selectedProcCodigo]);

  const filteredCids = useMemo(() => {
    if (!cidSearch.trim()) return validCids.slice(0, 20);
    const q = cidSearch.trim().toUpperCase();
    return validCids
      .filter(c => c.cid_codigo.toUpperCase().includes(q) || c.cid_descricao.toUpperCase().includes(q))
      .slice(0, 30);
  }, [validCids, cidSearch]);

  const filtered = useMemo(() => {
    if (!search) return ptsList;
    const q = search.toLowerCase();
    return ptsList.filter(p => {
      const pac = pacientes.find(px => px.id === p.patient_id);
      return pac?.nome.toLowerCase().includes(q) || p.diagnostico_funcional.toLowerCase().includes(q);
    });
  }, [ptsList, search, pacientes]);

  const canEditPts = useCallback((pts: PTSRecord) => {
    if (isMaster) return true;
    return pts.professional_id === user?.id;
  }, [isMaster, user]);

  const toggleSpec = (spec: string) => {
    setForm(p => {
      const newSpecs = p.especialidades_envolvidas.includes(spec)
        ? p.especialidades_envolvidas.filter(s => s !== spec)
        : [...p.especialidades_envolvidas, spec];
      return { ...p, especialidades_envolvidas: newSpecs };
    });
    setSelectedProcCodigo('');
    setCidSearch('');
  };

  // Add selected SIGTAP procedure to list
  const handleAddSigtap = () => {
    if (!selectedProcCodigo) return;
    const proc = sigtapProcs.find(p => p.codigo === selectedProcCodigo);
    if (!proc) return;
    if (sigtapSelecionados.some(s => s.procedimento_codigo === proc.codigo)) {
      toast.info('Procedimento já adicionado.');
      return;
    }
    setSigtapSelecionados(prev => [...prev, {
      procedimento_codigo: proc.codigo,
      procedimento_nome: proc.nome,
      especialidade: proc.especialidade,
    }]);
    setSelectedProcCodigo('');
    toast.success('Procedimento SIGTAP adicionado.');
  };

  // Add CID to list
  const handleAddCid = (cid: SigtapCid) => {
    if (cidsSelecionados.some(c => c.cid_codigo === cid.cid_codigo)) {
      toast.info('CID já adicionado.');
      return;
    }
    setCidsSelecionados(prev => [...prev, { cid_codigo: cid.cid_codigo, cid_descricao: cid.cid_descricao }]);
    setCidSearch('');
    toast.success(`CID ${cid.cid_codigo} adicionado.`);
  };

  const handleForceAddCid = () => {
    const code = cidSearch.trim().toUpperCase();
    if (!code) return;
    if (cidsSelecionados.some(c => c.cid_codigo === code)) {
      toast.info('CID já adicionado.');
      return;
    }
    setCidsSelecionados(prev => [...prev, { cid_codigo: code, cid_descricao: 'CID informado manualmente' }]);
    setCidSearch('');
    setCidWarning(false);
    toast.info('CID aceito manualmente.');
  };

  const removeSigtap = (codigo: string) => {
    setSigtapSelecionados(prev => prev.filter(s => s.procedimento_codigo !== codigo));
  };

  const removeCid = (codigo: string) => {
    setCidsSelecionados(prev => prev.filter(c => c.cid_codigo !== codigo));
  };

  const resetSigtapState = () => {
    setSelectedProcCodigo('');
    setCidSearch('');
    setSigtapProcs([]);
    setSigtapSelecionados([]);
    setCidsSelecionados([]);
    setValidCids([]);
    setCidWarning(false);
  };

  // Load saved SIGTAP/CID for a PTS
  const loadPtsSigtapCid = useCallback(async (ptsId: string) => {
    const [sigtapRes, cidRes] = await Promise.all([
      (supabase as any).from('pts_sigtap').select('procedimento_codigo, procedimento_nome, especialidade').eq('pts_id', ptsId),
      (supabase as any).from('pts_cid').select('cid_codigo, cid_descricao').eq('pts_id', ptsId),
    ]);
    return {
      sigtap: (sigtapRes.data || []) as SelectedSigtap[],
      cids: (cidRes.data || []) as SelectedCid[],
    };
  }, []);

  const openNewDialog = () => {
    setEditingPts(null);
    setForm({ patient_id: '', patient_name: '', diagnostico_funcional: '', objetivos_terapeuticos: '', metas_curto_prazo: '', metas_medio_prazo: '', metas_longo_prazo: '', especialidades_envolvidas: [] });
    resetSigtapState();
    setDialogOpen(true);
  };

  const openEditDialog = async (pts: PTSRecord) => {
    const pac = pacientes.find(p => p.id === pts.patient_id);
    setEditingPts(pts);
    setForm({
      patient_id: pts.patient_id,
      patient_name: pac?.nome || pts.patient_id,
      diagnostico_funcional: pts.diagnostico_funcional,
      objetivos_terapeuticos: pts.objetivos_terapeuticos,
      metas_curto_prazo: pts.metas_curto_prazo,
      metas_medio_prazo: pts.metas_medio_prazo,
      metas_longo_prazo: pts.metas_longo_prazo,
      especialidades_envolvidas: pts.especialidades_envolvidas || [],
    });
    // Load saved SIGTAP/CID
    const { sigtap, cids } = await loadPtsSigtapCid(pts.id);
    setSigtapSelecionados(sigtap);
    setCidsSelecionados(cids);
    setSelectedProcCodigo('');
    setCidSearch('');
    setDialogOpen(true);
  };

  const openDetailDialog = async (pts: PTSRecord) => {
    setDetailPts(pts);
    const { sigtap, cids } = await loadPtsSigtapCid(pts.id);
    setDetailSigtap(sigtap);
    setDetailCids(cids);
  };

  const handleSave = async () => {
    if (!form.patient_id || !form.diagnostico_funcional || !form.objetivos_terapeuticos) {
      toast.error('Preencha paciente, diagnóstico funcional e objetivos.');
      return;
    }
    setSaving(true);
    try {
      const ptsPayload = {
        patient_id: form.patient_id,
        professional_id: editingPts ? editingPts.professional_id : (user?.id || ''),
        unit_id: user?.unidadeId || '',
        diagnostico_funcional: form.diagnostico_funcional,
        objetivos_terapeuticos: form.objetivos_terapeuticos,
        metas_curto_prazo: form.metas_curto_prazo,
        metas_medio_prazo: form.metas_medio_prazo,
        metas_longo_prazo: form.metas_longo_prazo,
        especialidades_envolvidas: form.especialidades_envolvidas,
      };

      let ptsId: string;

      if (editingPts) {
        const { error } = await (supabase as any).from('pts').update(ptsPayload).eq('id', editingPts.id);
        if (error) throw error;
        ptsId = editingPts.id;

        // Delete old relationships then re-insert
        await Promise.all([
          (supabase as any).from('pts_sigtap').delete().eq('pts_id', ptsId),
          (supabase as any).from('pts_cid').delete().eq('pts_id', ptsId),
        ]);
      } else {
        const { data: newPts, error } = await (supabase as any)
          .from('pts')
          .insert(ptsPayload)
          .select('id')
          .single();
        if (error) throw error;
        ptsId = newPts.id;

        // Also create prontuario record
        const procInfo = sigtapSelecionados.map(s => `${s.procedimento_codigo} - ${s.procedimento_nome}`).join('; ');
        const cidInfo = cidsSelecionados.map(c => `${c.cid_codigo} - ${c.cid_descricao}`).join('; ');
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
          observacoes: `Especialidades: ${form.especialidades_envolvidas.join(', ')}${procInfo ? `\nSIGTAP: ${procInfo}` : ''}${cidInfo ? `\nCID: ${cidInfo}` : ''}`,
        });
      }

      // Insert SIGTAP relationships
      if (sigtapSelecionados.length > 0) {
        await (supabase as any).from('pts_sigtap').insert(
          sigtapSelecionados.map(s => ({
            pts_id: ptsId,
            procedimento_codigo: s.procedimento_codigo,
            procedimento_nome: s.procedimento_nome,
            especialidade: s.especialidade,
          }))
        );
      }

      // Insert CID relationships
      if (cidsSelecionados.length > 0) {
        await (supabase as any).from('pts_cid').insert(
          cidsSelecionados.map(c => ({
            pts_id: ptsId,
            cid_codigo: c.cid_codigo,
            cid_descricao: c.cid_descricao,
          }))
        );
      }

      await logAction({
        acao: editingPts ? 'editar_pts' : 'criar_pts',
        entidade: 'pts', entidadeId: ptsId,
        modulo: 'pts', user,
        detalhes: {
          paciente_nome: form.patient_name,
          especialidades: form.especialidades_envolvidas,
          sigtap_count: sigtapSelecionados.length,
          cid_count: cidsSelecionados.length,
        },
      });

      toast.success(editingPts ? 'PTS atualizado com sucesso!' : 'PTS criado e registrado no prontuário!');
      setDialogOpen(false);
      setEditingPts(null);
      resetSigtapState();
      loadPts();
    } catch (err: any) {
      toast.error('Erro: ' + (err?.message || 'erro'));
    }
    setSaving(false);
  };

  const procsBySpecialty = useMemo(() => {
    const map: Record<string, SigtapProcedimento[]> = {};
    for (const p of sigtapProcs) {
      if (!map[p.especialidade]) map[p.especialidade] = [];
      map[p.especialidade].push(p);
    }
    return map;
  }, [sigtapProcs]);

  const getSpecLabelForSigtap = useCallback((key: string): string => {
    const entry = Object.entries(SPECIALTY_TO_SIGTAP).find(([, v]) => v === key);
    return entry ? entry[0] : key;
  }, []);

  if (!can('tratamento', 'can_view')) {
    return <div className="p-6 text-muted-foreground">Sem permissão.</div>;
  }

  const showSigtap = (isFisioterapeuta || isMaster) && (sigtapProcs.length > 0 || loadingProcs);

  return (
    <div className="space-y-4 animate-fade-in">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold font-display text-foreground">PTS — Projeto Terapêutico Singular</h1>
          <p className="text-muted-foreground text-sm">{ptsList.length} projeto(s) registrado(s)</p>
        </div>
        <Button onClick={openNewDialog}>
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
            const editable = canEditPts(pts);
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
                  <div className="flex gap-1">
                    {editable && (
                      <Button size="sm" variant="ghost" onClick={() => openEditDialog(pts)} title="Editar PTS">
                        <Edit2 className="w-4 h-4" />
                      </Button>
                    )}
                    <Button size="sm" variant="ghost" onClick={() => openDetailDialog(pts)} title="Visualizar">
                      <Eye className="w-4 h-4" />
                    </Button>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* New / Edit PTS Dialog */}
      <Dialog open={dialogOpen} onOpenChange={v => { if (!v) { setDialogOpen(false); setEditingPts(null); } }}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="font-display">{editingPts ? 'Editar PTS' : 'Novo PTS'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Paciente *</Label>
              {editingPts ? (
                <Input value={form.patient_name} disabled className="bg-muted" />
              ) : (
                <BuscaPaciente pacientes={pacientes} value={form.patient_id}
                  onChange={(id, nome) => setForm(p => ({ ...p, patient_id: id, patient_name: nome }))} />
              )}
            </div>

            <div>
              <Label>Especialidades Envolvidas</Label>
              <p className="text-xs text-muted-foreground mb-1">Selecione as especialidades para carregar procedimentos SIGTAP correspondentes</p>
              <div className="flex flex-wrap gap-2 mt-2">
                {SPECIALTIES.map(spec => (
                  <label key={spec} className="flex items-center gap-1.5 text-sm cursor-pointer">
                    <Checkbox checked={form.especialidades_envolvidas.includes(spec)} onCheckedChange={() => toggleSpec(spec)} />
                    {spec}
                  </label>
                ))}
              </div>
            </div>

            {/* SIGTAP Section */}
            {showSigtap && (
              <div className="border rounded-lg p-3 space-y-3 bg-muted/30">
                <Label className="text-sm font-semibold flex items-center gap-1.5">
                  📋 Procedimentos SIGTAP
                  {loadingProcs && <Loader2 className="w-3 h-3 animate-spin" />}
                </Label>

                {sigtapProcs.length > 0 && (
                  <div className="flex gap-2 items-end">
                    <div className="flex-1">
                      <Select value={selectedProcCodigo} onValueChange={v => { setSelectedProcCodigo(v); setCidSearch(''); }}>
                        <SelectTrigger>
                          <SelectValue placeholder="Selecione o procedimento SIGTAP..." />
                        </SelectTrigger>
                        <SelectContent>
                          {Object.entries(procsBySpecialty).map(([esp, procs]) => (
                            <React.Fragment key={esp}>
                              <div className="px-2 py-1.5 text-xs font-semibold text-muted-foreground bg-muted/50 sticky top-0">
                                {getSpecLabelForSigtap(esp)} ({procs.length})
                              </div>
                              {procs.map(p => (
                                <SelectItem key={p.codigo} value={p.codigo}>
                                  <span className="text-xs font-mono text-muted-foreground mr-1">{p.codigo}</span>
                                  <span className="text-xs">{p.nome}</span>
                                </SelectItem>
                              ))}
                            </React.Fragment>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <Button size="sm" onClick={handleAddSigtap} disabled={!selectedProcCodigo}>
                      <Plus className="w-4 h-4 mr-1" /> Adicionar
                    </Button>
                  </div>
                )}

                {sigtapProcs.length === 0 && !loadingProcs && (
                  <p className="text-xs text-muted-foreground">Nenhum procedimento SIGTAP encontrado. Execute a sincronização DATASUS nas Configurações.</p>
                )}

                {/* Lista de SIGTAP selecionados */}
                {sigtapSelecionados.length > 0 && (
                  <div className="space-y-1">
                    <Label className="text-xs text-muted-foreground">Procedimentos adicionados ({sigtapSelecionados.length}):</Label>
                    {sigtapSelecionados.map(s => (
                      <div key={s.procedimento_codigo} className="flex items-center gap-2 bg-background rounded px-2 py-1 text-xs">
                        <Badge variant="secondary" className="font-mono text-xs shrink-0">{s.procedimento_codigo}</Badge>
                        <span className="flex-1 truncate">{s.procedimento_nome}</span>
                        <span className="text-muted-foreground shrink-0">{getSpecLabelForSigtap(s.especialidade)}</span>
                        <Button size="sm" variant="ghost" className="h-5 w-5 p-0" onClick={() => removeSigtap(s.procedimento_codigo)}>
                          <Trash2 className="w-3 h-3 text-destructive" />
                        </Button>
                      </div>
                    ))}
                  </div>
                )}

                {/* CID Section */}
                {selectedProcCodigo && (
                  <div className="space-y-2 border-t pt-2">
                    <Label className="text-xs">
                      Buscar CID vinculado ao procedimento ({validCids.length} CIDs válidos)
                    </Label>
                    <Input
                      placeholder="Digite código ou descrição do CID..."
                      value={cidSearch}
                      onChange={e => setCidSearch(e.target.value)}
                      className="text-sm"
                    />

                    {cidWarning && (
                      <div className="flex items-start gap-2 p-2 rounded bg-warning/10 border border-warning/30 text-xs">
                        <AlertTriangle className="w-4 h-4 text-warning shrink-0 mt-0.5" />
                        <div>
                          <p className="font-medium text-warning">
                            ⚠️ CID não vinculado ao procedimento selecionado na tabela SIGTAP.
                          </p>
                          <Button size="sm" variant="outline" className="mt-1 h-6 text-xs" onClick={handleForceAddCid}>
                            Usar mesmo assim?
                          </Button>
                        </div>
                      </div>
                    )}

                    {loadingCids ? (
                      <div className="text-xs text-muted-foreground flex items-center gap-1">
                        <Loader2 className="w-3 h-3 animate-spin" /> Carregando CIDs...
                      </div>
                    ) : (
                      cidSearch.trim() && filteredCids.length > 0 && (
                        <div className="max-h-40 overflow-y-auto border rounded text-xs divide-y">
                          {filteredCids.map(c => (
                            <button
                              key={c.cid_codigo}
                              className="w-full text-left px-2 py-1.5 hover:bg-accent/50 flex gap-2"
                              onClick={() => handleAddCid(c)}
                            >
                              <span className="font-mono font-medium text-primary shrink-0">{c.cid_codigo}</span>
                              <span className="text-muted-foreground truncate">{c.cid_descricao}</span>
                            </button>
                          ))}
                        </div>
                      )
                    )}
                  </div>
                )}

                {/* Lista de CIDs selecionados */}
                {cidsSelecionados.length > 0 && (
                  <div className="space-y-1 border-t pt-2">
                    <Label className="text-xs text-muted-foreground">CIDs adicionados ({cidsSelecionados.length}):</Label>
                    {cidsSelecionados.map(c => (
                      <div key={c.cid_codigo} className="flex items-center gap-2 bg-background rounded px-2 py-1 text-xs">
                        <Badge variant="secondary" className="font-mono text-xs shrink-0">{c.cid_codigo}</Badge>
                        <span className="flex-1 truncate">{c.cid_descricao}</span>
                        <Button size="sm" variant="ghost" className="h-5 w-5 p-0" onClick={() => removeCid(c.cid_codigo)}>
                          <Trash2 className="w-3 h-3 text-destructive" />
                        </Button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

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

            <Button className="w-full" onClick={handleSave} disabled={saving}>
              {saving && <Loader2 className="w-4 h-4 animate-spin mr-2" />}
              {editingPts ? 'Salvar Alterações' : 'Salvar PTS'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Detail Dialog */}
      <Dialog open={!!detailPts} onOpenChange={() => { setDetailPts(null); setDetailSigtap([]); setDetailCids([]); }}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle className="font-display">Detalhes do PTS</DialogTitle></DialogHeader>
          {detailPts && (
            <div className="space-y-3 text-sm">
              <div><strong>Paciente:</strong> {pacientes.find(p => p.id === detailPts.patient_id)?.nome || detailPts.patient_id}</div>
              <div><strong>Profissional:</strong> {funcionarios.find(f => f.id === detailPts.professional_id)?.nome || '—'}</div>
              <div><strong>Data:</strong> {new Date(detailPts.created_at).toLocaleDateString('pt-BR')}</div>

              {detailSigtap.length > 0 && (
                <div className="border-t pt-2">
                  <strong>Procedimentos SIGTAP:</strong>
                  <div className="space-y-1 mt-1">
                    {detailSigtap.map(s => (
                      <div key={s.procedimento_codigo} className="flex items-center gap-2 text-xs">
                        <Badge variant="secondary" className="font-mono">{s.procedimento_codigo}</Badge>
                        <span>{s.procedimento_nome}</span>
                        <span className="text-muted-foreground">({getSpecLabelForSigtap(s.especialidade)})</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {detailCids.length > 0 && (
                <div className="border-t pt-2">
                  <strong>CIDs:</strong>
                  <div className="space-y-1 mt-1">
                    {detailCids.map(c => (
                      <div key={c.cid_codigo} className="flex items-center gap-2 text-xs">
                        <Badge variant="secondary" className="font-mono">{c.cid_codigo}</Badge>
                        <span>{c.cid_descricao}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

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
              {canEditPts(detailPts) && (
                <Button variant="outline" className="w-full mt-2" onClick={() => { const pts = detailPts; setDetailPts(null); setDetailSigtap([]); setDetailCids([]); openEditDialog(pts); }}>
                  <Edit2 className="w-4 h-4 mr-2" /> Editar este PTS
                </Button>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default PTS;
