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
import { Loader2, Plus, Search, Eye, Edit2, AlertTriangle } from 'lucide-react';
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

  // SIGTAP state
  const [sigtapProcs, setSigtapProcs] = useState<SigtapProcedimento[]>([]);
  const [selectedProcCodigo, setSelectedProcCodigo] = useState('');
  const [validCids, setValidCids] = useState<SigtapCid[]>([]);
  const [cidSearch, setCidSearch] = useState('');
  const [selectedCid, setSelectedCid] = useState('');
  const [selectedCidDesc, setSelectedCidDesc] = useState('');
  const [cidWarning, setCidWarning] = useState(false);
  const [loadingCids, setLoadingCids] = useState(false);

  const isMaster = user?.role === 'master';

  // Map user profissao to SIGTAP especialidade dynamically
  const sigtapEspecialidade = useMemo(() => {
    if (!user) return '';
    const prof = (user.profissao || '').toLowerCase().trim();
    // Map profession names to SIGTAP especialidade keys
    const mapping: Record<string, string> = {
      fisioterapeuta: 'fisioterapia',
      fisioterapia: 'fisioterapia',
      fonoaudiologa: 'fonoaudiologia',
      fonoaudiologo: 'fonoaudiologia',
      fonoaudiologia: 'fonoaudiologia',
      psicologa: 'psicologia',
      psicologo: 'psicologia',
      psicologia: 'psicologia',
      'terapeuta ocupacional': 'terapia ocupacional',
      'terapia ocupacional': 'terapia ocupacional',
      nutricionista: 'nutricao',
      nutricao: 'nutricao',
      enfermeiro: 'enfermagem',
      enfermeira: 'enfermagem',
      enfermagem: 'enfermagem',
    };
    // Normalize removing accents for matching
    const profNorm = prof.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    for (const [key, value] of Object.entries(mapping)) {
      const keyNorm = key.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
      if (profNorm === keyNorm || profNorm.includes(keyNorm) || keyNorm.includes(profNorm)) {
        return value;
      }
    }
    return '';
  }, [user]);

  const hasSigtapProfession = sigtapEspecialidade !== '';

  // Load SIGTAP procedures matching user's profession
  const loadSigtapProcs = useCallback(async () => {
    if (!hasSigtapProfession && !isMaster) return;
    let query = (supabase as any)
      .from('sigtap_procedimentos')
      .select('*')
      .eq('ativo', true)
      .order('codigo');
    // If not master, filter by the professional's specialty
    if (!isMaster && sigtapEspecialidade) {
      query = query.eq('especialidade', sigtapEspecialidade);
    }
    const { data } = await query;
    if (data) setSigtapProcs(data);
  }, [hasSigtapProfession, isMaster, sigtapEspecialidade]);

  useEffect(() => { loadPts(); }, [loadPts]);
  useEffect(() => { loadSigtapProcs(); }, [loadSigtapProcs]);

  // Load valid CIDs when procedure is selected
  useEffect(() => {
    if (!selectedProcCodigo) {
      setValidCids([]);
      return;
    }
    setLoadingCids(true);
    (supabase as any)
      .from('sigtap_procedimento_cids')
      .select('cid_codigo, cid_descricao')
      .eq('procedimento_codigo', selectedProcCodigo)
      .order('cid_codigo')
      .then(({ data }: any) => {
        setValidCids(data || []);
        setLoadingCids(false);
      });
  }, [selectedProcCodigo]);

  // Check if typed CID is valid for selected procedure
  useEffect(() => {
    if (!selectedProcCodigo || !cidSearch.trim()) {
      setCidWarning(false);
      return;
    }
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

  const canEditPts = (pts: PTSRecord) => {
    if (isMaster) return true;
    // Profissional can edit only their own PTS
    return pts.professional_id === user?.id;
  };

  const toggleSpec = (spec: string) => {
    setForm(p => ({
      ...p,
      especialidades_envolvidas: p.especialidades_envolvidas.includes(spec)
        ? p.especialidades_envolvidas.filter(s => s !== spec)
        : [...p.especialidades_envolvidas, spec],
    }));
  };

  const handleSelectCid = (cid: SigtapCid) => {
    setSelectedCid(cid.cid_codigo);
    setSelectedCidDesc(cid.cid_descricao);
    setCidSearch(cid.cid_codigo);
    setCidWarning(false);
  };

  const handleForceUseCid = () => {
    setSelectedCid(cidSearch.trim().toUpperCase());
    setSelectedCidDesc('CID informado manualmente');
    setCidWarning(false);
    toast.info('CID aceito manualmente (fora da tabela SIGTAP).');
  };

  const resetSigtapState = () => {
    setSelectedProcCodigo('');
    setSelectedCid('');
    setSelectedCidDesc('');
    setCidSearch('');
  };

  const openNewDialog = () => {
    setEditingPts(null);
    setForm({ patient_id: '', patient_name: '', diagnostico_funcional: '', objetivos_terapeuticos: '', metas_curto_prazo: '', metas_medio_prazo: '', metas_longo_prazo: '', especialidades_envolvidas: [] });
    resetSigtapState();
    setDialogOpen(true);
  };

  const openEditDialog = (pts: PTSRecord) => {
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
    resetSigtapState();
    setDialogOpen(true);
  };

  const handleSave = async () => {
    if (!form.patient_id || !form.diagnostico_funcional || !form.objetivos_terapeuticos) {
      toast.error('Preencha paciente, diagnóstico funcional e objetivos.');
      return;
    }
    setSaving(true);
    try {
      const selectedProcNome = sigtapProcs.find(p => p.codigo === selectedProcCodigo)?.nome || '';
      const cidInfo = selectedCid ? ` | CID: ${selectedCid} - ${selectedCidDesc}` : '';
      const procInfo = selectedProcCodigo ? `Procedimento SIGTAP: ${selectedProcCodigo} - ${selectedProcNome}` : '';

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

      if (editingPts) {
        // UPDATE
        const { error } = await (supabase as any)
          .from('pts')
          .update(ptsPayload)
          .eq('id', editingPts.id);
        if (error) throw error;

        await logAction({
          acao: 'editar_pts', entidade: 'pts', entidadeId: editingPts.id,
          modulo: 'pts', user,
          detalhes: {
            paciente_nome: form.patient_name,
            especialidades: form.especialidades_envolvidas,
            ...(selectedProcCodigo && { procedimento_sigtap: selectedProcCodigo }),
            ...(selectedCid && { cid: selectedCid }),
          },
        });
        toast.success('PTS atualizado com sucesso!');
      } else {
        // INSERT
        await (supabase as any).from('pts').insert(ptsPayload);

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
          observacoes: `Especialidades: ${form.especialidades_envolvidas.join(', ')}${procInfo ? `\n${procInfo}` : ''}${cidInfo}`,
        });

        await logAction({
          acao: 'criar_pts', entidade: 'pts', entidadeId: form.patient_id,
          modulo: 'pts', user,
          detalhes: {
            paciente_nome: form.patient_name,
            especialidades: form.especialidades_envolvidas,
            ...(selectedProcCodigo && { procedimento_sigtap: selectedProcCodigo }),
            ...(selectedCid && { cid: selectedCid }),
          },
        });
        toast.success('PTS criado e registrado no prontuário!');
      }

      setDialogOpen(false);
      setEditingPts(null);
      resetSigtapState();
      loadPts();
    } catch (err: any) {
      toast.error('Erro: ' + (err?.message || 'erro'));
    }
    setSaving(false);
  };

  if (!can('tratamento', 'can_view')) {
    return <div className="p-6 text-muted-foreground">Sem permissão.</div>;
  }

  const showSigtap = (isFisioterapeuta || isMaster) && sigtapProcs.length > 0;

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
                    <Button size="sm" variant="ghost" onClick={() => setDetailPts(pts)} title="Visualizar">
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

            {/* SIGTAP Section - Fisioterapeutas + Master */}
            {showSigtap && (
              <div className="border rounded-lg p-3 space-y-3 bg-muted/30">
                <Label className="text-sm font-semibold flex items-center gap-1.5">
                  📋 Procedimento SIGTAP (Fisioterapia)
                </Label>
                <Select value={selectedProcCodigo} onValueChange={v => {
                  setSelectedProcCodigo(v);
                  setSelectedCid('');
                  setSelectedCidDesc('');
                  setCidSearch('');
                }}>
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione o procedimento SIGTAP..." />
                  </SelectTrigger>
                  <SelectContent>
                    {sigtapProcs.map(p => (
                      <SelectItem key={p.codigo} value={p.codigo}>
                        <span className="text-xs font-mono text-muted-foreground mr-1">{p.codigo}</span>
                        <span className="text-xs">{p.nome}</span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>

                {selectedProcCodigo && (
                  <div className="space-y-2">
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
                            ⚠️ Este CID não está vinculado ao procedimento selecionado conforme tabela SIGTAP oficial.
                          </p>
                          <Button size="sm" variant="outline" className="mt-1 h-6 text-xs" onClick={handleForceUseCid}>
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
                      cidSearch.trim() && filteredCids.length > 0 && !selectedCid && (
                        <div className="max-h-40 overflow-y-auto border rounded text-xs divide-y">
                          {filteredCids.map(c => (
                            <button
                              key={c.cid_codigo}
                              className="w-full text-left px-2 py-1.5 hover:bg-accent/50 flex gap-2"
                              onClick={() => handleSelectCid(c)}
                            >
                              <span className="font-mono font-medium text-primary shrink-0">{c.cid_codigo}</span>
                              <span className="text-muted-foreground truncate">{c.cid_descricao}</span>
                            </button>
                          ))}
                        </div>
                      )
                    )}

                    {selectedCid && (
                      <div className="flex items-center gap-2 text-xs">
                        <Badge variant="secondary" className="font-mono">{selectedCid}</Badge>
                        <span className="text-muted-foreground truncate">{selectedCidDesc}</span>
                        <Button size="sm" variant="ghost" className="h-5 text-xs px-1" onClick={() => {
                          setSelectedCid('');
                          setSelectedCidDesc('');
                          setCidSearch('');
                        }}>✕</Button>
                      </div>
                    )}
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
              {editingPts ? 'Salvar Alterações' : 'Salvar PTS'}
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
              {canEditPts(detailPts) && (
                <Button variant="outline" className="w-full mt-2" onClick={() => { setDetailPts(null); openEditDialog(detailPts); }}>
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
