import { avisarVideoAtualizado } from '@/lib/painelChamadas';
import React, { useEffect, useState } from 'react';
import { useOperacional } from '@/contexts/OperacionalContext';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Plus, Building2, DoorOpen, Pencil, Trash2, Tv, Copy, Video, X, Upload, Loader2 } from 'lucide-react';
import { linkPainelTV } from '@/lib/painelVideo';
import { toast } from 'sonner';
import CustomFieldsRenderer from '@/components/CustomFieldsRenderer';
import { useCustomFields } from '@/hooks/useCustomFields';
import { supabase } from '@/integrations/supabase/client';
import { DEFAULT_DIAGNOSTIC_ROOM_CONFIG, normalizeDiagnosticRoomConfig, type DiagnosticRoomConfig } from '@/lib/diagnosticExams';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';

const UnidadesSalas: React.FC = () => {
  const { unidades, salas, addUnidade, updateUnidade, deleteUnidade, addSala, updateSala, deleteSala } = useOperacional();
  const { resolved: customConfig } = useCustomFields('unidade');
  const [customData, setCustomData] = useState<Record<string, any>>({});
  const [unitDialog, setUnitDialog] = useState(false);
  const [roomDialog, setRoomDialog] = useState(false);
  const [editUnitId, setEditUnitId] = useState<string | null>(null);
  const [editRoomId, setEditRoomId] = useState<string | null>(null);
  const [unitForm, setUnitForm] = useState({ nome: '', nomeExibicao: '', endereco: '', telefone: '', whatsapp: '', cnes: '' });
  const [roomForm, setRoomForm] = useState({ nome: '', unidadeId: '', config: { ...DEFAULT_DIAGNOSTIC_ROOM_CONFIG } as DiagnosticRoomConfig });
  const [roomConfigs, setRoomConfigs] = useState<Record<string, DiagnosticRoomConfig>>({});
  const [roomFilter, setRoomFilter] = useState<'todas' | 'consultorios' | 'aparelhos'>('todas');

  // Carrega as configurações persistidas por unidade para identificar os aparelhos nos cartões.
  useEffect(() => {
    let cancelled = false;
    const loadRoomConfigs = async () => {
      if (unidades.length === 0) { setRoomConfigs({}); return; }
      const { data, error } = await supabase.from('unidades' as any).select('id,custom_data');
      if (error || cancelled) return;
      const next: Record<string, DiagnosticRoomConfig> = {};
      (data || []).forEach((unit: any) => {
        const configuredRooms = unit.custom_data?.salas_exames;
        if (!configuredRooms || typeof configuredRooms !== 'object') return;
        Object.entries(configuredRooms).forEach(([roomId, value]: [string, any]) => {
          if (value?.finalidade === 'aparelho_diagnostico') {
            next[roomId] = normalizeDiagnosticRoomConfig(value);
          }
        });
      });
      if (!cancelled) setRoomConfigs(next);
    };
    void loadRoomConfigs();
    return () => { cancelled = true; };
  }, [unidades]);

  const [enviandoLogo, setEnviandoLogo] = useState(false);
  const enviarLogo = async (file: File) => {
    if (!/^image\/(png|jpeg|webp)$/.test(file.type)) { toast.error('Use PNG, JPG ou WEBP.'); return; }
    if (file.size > 3 * 1024 * 1024) { toast.error('A imagem deve ter até 3 MB.'); return; }
    setEnviandoLogo(true);
    try {
      const ext = file.name.split('.').pop() || 'png';
      const path = `unidades/logo-${Date.now()}.${ext}`;
      const { error } = await supabase.storage.from('document-logos').upload(path, file, { upsert: true, contentType: file.type });
      if (error) throw error;
      const { data } = supabase.storage.from('document-logos').getPublicUrl(path);
      setCustomData(p => ({ ...p, logo_url: data.publicUrl }));
      toast.success('Logo carregada. Clique em Salvar para gravar.');
    } catch (e: any) {
      toast.error('Não foi possível enviar a logo: ' + (e?.message || 'erro'));
    } finally { setEnviandoLogo(false); }
  };

  const onlyDigits = (v: string) => (v || '').replace(/\D/g, '').slice(0, 7);

  const openNewUnit = () => { setEditUnitId(null); setUnitForm({ nome: '', nomeExibicao: '', endereco: '', telefone: '', whatsapp: '', cnes: '' }); setCustomData({}); setUnitDialog(true); };
  const openEditUnit = async (u: typeof unidades[0]) => {
    setEditUnitId(u.id);
    setUnitForm({ nome: u.nome, nomeExibicao: u.nomeExibicao || '', endereco: u.endereco, telefone: u.telefone, whatsapp: u.whatsapp, cnes: '' });
    setCustomData({});
    setUnitDialog(true);
    // Load existing custom_data.cnes from DB
    try {
      const { data } = await supabase.from('unidades' as any).select('custom_data').eq('id', u.id).maybeSingle();
      const cd = ((data as any)?.custom_data as any) || {};
      if (cd.cnes) setUnitForm(p => ({ ...p, cnes: onlyDigits(String(cd.cnes)) }));
      setCustomData(cd);
    } catch (e) { /* ignore */ }
  };
  const openNewRoom = (finalidade: DiagnosticRoomConfig['finalidade'] = 'consultorio_clinico') => {
    setEditRoomId(null);
    setRoomForm({
      nome: '',
      unidadeId: '',
      config: { ...DEFAULT_DIAGNOSTIC_ROOM_CONFIG, finalidade },
    });
    setRoomDialog(true);
  };
  const openEditRoom = async (s: typeof salas[0]) => {
    setEditRoomId(s.id);
    setRoomForm({ nome: s.nome, unidadeId: s.unidadeId, config: { ...DEFAULT_DIAGNOSTIC_ROOM_CONFIG } });
    setRoomDialog(true);
    const { data } = await supabase.from('unidades' as any).select('custom_data').eq('id', s.unidadeId).maybeSingle();
    const custom = ((data as any)?.custom_data || {}) as Record<string, any>;
    setRoomForm(p => ({ ...p, config: normalizeDiagnosticRoomConfig(custom.salas_exames?.[s.id]) }));
  };

  const handleSaveUnit = async () => {
    if (!unitForm.nome) return;
    const { cnes, ...baseForm } = unitForm;
    const cnesClean = onlyDigits(cnes);
    if (cnesClean && cnesClean.length !== 7) {
      toast.error('CNES deve conter 7 dígitos.');
      return;
    }
    let unitId = editUnitId;
    if (editUnitId) {
      updateUnidade(editUnitId, baseForm);
    } else {
      unitId = `un${Date.now()}`;
      addUnidade({ id: unitId, ...baseForm, ativo: true });
    }
    // Persist CNES into custom_data (used by BPA-I generator)
    try {
      const existing = { ...(customData || {}) };
      if (cnesClean) existing.cnes = cnesClean;
      else delete existing.cnes;
      await supabase.from('unidades' as any).update({ custom_data: existing }).eq('id', unitId as string);
    } catch (e) {
      console.error('Erro ao salvar CNES:', e);
    }
    toast.success(editUnitId ? 'Unidade atualizada!' : 'Unidade criada!');
    setUnitDialog(false);
  };

  const handleSaveRoom = async () => {
    if (!roomForm.nome.trim() || !roomForm.unidadeId) return;
    if (roomForm.config.finalidade === 'aparelho_diagnostico' && !roomForm.config.tipoExame.trim()) {
      toast.error('Informe o tipo de exame do aparelho.');
      return;
    }
    const roomId = editRoomId || `s${Date.now()}`;
    const { data: unitRow, error: readError } = await supabase.from('unidades' as any).select('custom_data').eq('id', roomForm.unidadeId).maybeSingle();
    if (readError || !unitRow) { toast.error('Não foi possível carregar a configuração da unidade.'); return; }
    const custom = { ...(((unitRow as any).custom_data || {}) as Record<string, any>) };
    const roomConfigs = { ...(custom.salas_exames || {}) };
    if (roomForm.config.finalidade === 'aparelho_diagnostico') {
      roomConfigs[roomId] = normalizeDiagnosticRoomConfig(roomForm.config);
    } else {
      delete roomConfigs[roomId];
    }
    custom.salas_exames = roomConfigs;
    const { error: saveConfigError } = await supabase.from('unidades' as any).update({ custom_data: custom }).eq('id', roomForm.unidadeId);
    if (saveConfigError) { toast.error('Não foi possível salvar a configuração da sala.'); return; }
    if (editRoomId) {
      await updateSala(editRoomId, { nome: roomForm.nome.trim(), unidadeId: roomForm.unidadeId });
      toast.success('Sala atualizada!');
    } else {
      await addSala({ id: roomId, nome: roomForm.nome.trim(), unidadeId: roomForm.unidadeId, ativo: true });
      toast.success('Sala criada!');
    }
    setRoomConfigs(prev => {
      const next = { ...prev };
      if (roomForm.config.finalidade === 'aparelho_diagnostico') {
        next[roomId] = normalizeDiagnosticRoomConfig(roomForm.config);
      } else {
        delete next[roomId];
      }
      return next;
    });
    setRoomDialog(false);
  };

  const [videoUnit, setVideoUnit] = useState<{ id: string; nome: string } | null>(null);
  const [videoUrl, setVideoUrl] = useState('');
  const [videoList, setVideoList] = useState<string[]>([]);
  const addUrl = () => {
    const v = videoUrl.trim();
    if (!v) return;
    if (!/^https:\/\//i.test(v)) { toast.error('Informe um endereço https://'); return; }
    setVideoList(l => [...l, v]); setVideoUrl('');
  };
  const moverVideo = (i: number, d: number) => setVideoList(l => {
    const j = i + d; if (j < 0 || j >= l.length) return l;
    const n = [...l]; [n[i], n[j]] = [n[j], n[i]]; return n;
  });
  const [enviando, setEnviando] = useState(false);

  const linkTV = (id: string) => {
    return linkPainelTV(window.location.origin, id);
  };
  const copiarLink = async (id: string) => {
    try { await navigator.clipboard.writeText(linkTV(id)); toast.success('Link da TV copiado!'); }
    catch { toast.error('Copie manualmente: ' + linkTV(id)); }
  };
  const abrirVideo = async (id: string, nome: string) => {
    setVideoUnit({ id, nome }); setVideoUrl(''); setVideoList([]);
    const { data } = await supabase.from('unidades' as any).select('custom_data').eq('id', id).maybeSingle();
    const cd = ((data as any)?.custom_data || {});
    const lista: string[] = Array.isArray(cd.video_urls) ? cd.video_urls.filter((x: any) => typeof x === 'string' && x) : (cd.video_url ? [String(cd.video_url)] : []);
    setVideoList(lista);
  };
  const enviarVideo = async (file: File) => {
    if (!videoUnit) return;
    if (file.type !== 'video/mp4') { toast.error('Selecione um arquivo MP4.'); return; }
    if (file.size > 100 * 1024 * 1024) { toast.error('O vídeo deve ter até 100 MB.'); return; }
    setEnviando(true);
    try {
      const path = `${videoUnit.id}/${Date.now()}.mp4`;
      const { error } = await supabase.storage.from('painel-videos').upload(path, file, { contentType: 'video/mp4', upsert: true });
      if (error) throw error;
      const { data, error: e2 } = await supabase.storage.from('painel-videos').createSignedUrl(path, 60 * 60 * 24 * 365 * 10);
      if (e2 || !data) throw e2;
      setVideoList(l => [...l, data.signedUrl]);
      toast.success('Vídeo adicionado à lista. Clique em Salvar Configuração.');
    } catch (e: any) {
      toast.error('Falha no envio: ' + (e?.message || 'erro'));
    } finally { setEnviando(false); }
  };
  const salvarVideo = async () => {
    if (!videoUnit) return;
    const pend = videoUrl.trim();
    if (pend && !/^https:\/\//i.test(pend)) { toast.error('Informe um endereço https://'); return; }
    const lista = pend ? [...videoList, pend] : videoList;
    const { data } = await supabase.from('unidades' as any).select('custom_data').eq('id', videoUnit.id).maybeSingle();
    const cd = { ...(((data as any)?.custom_data) || {}) };
    cd.video_urls = lista;
    if (lista.length) cd.video_url = lista[0]; else delete cd.video_url;
    const { error } = await supabase.from('unidades' as any).update({ custom_data: cd }).eq('id', videoUnit.id);
    if (error) { toast.error('Não foi possível salvar.'); return; }
    toast.success('Vídeo salvo! A TV atualiza sozinha.'); void avisarVideoAtualizado(videoUnit.id);
    setVideoUnit(null);
  };

  return (
    <div className="space-y-6 animate-fade-in">
      <div>
        <h1 className="text-2xl font-bold font-display text-foreground">Unidades e Salas</h1>
        <p className="text-muted-foreground text-sm">Gerenciar estrutura física</p>
      </div>

      {/* Unidades */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-lg font-semibold font-display text-foreground flex items-center gap-2"><Building2 className="w-5 h-5" />Unidades</h2>
          <Button size="sm" onClick={openNewUnit} className="gradient-primary text-primary-foreground"><Plus className="w-4 h-4 mr-1" />Nova Unidade</Button>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {unidades.map(u => (
            <Card key={u.id} className="shadow-card border-0">
              <CardContent className="p-4">
                <div className="flex items-start justify-between">
                  <div>
                    <h3 className="font-semibold text-foreground">{u.nome}</h3>
                    {u.nomeExibicao && <p className="text-xs text-primary font-medium">Exibido como: {u.nomeExibicao}</p>}
                    <p className="text-sm text-muted-foreground mt-1">{u.endereco}</p>
                    <p className="text-sm text-muted-foreground">{u.telefone} • {u.whatsapp}</p>
                    <span className="text-xs text-muted-foreground">{salas.filter(s => s.unidadeId === u.id).length} sala(s)</span>
                    <div className="flex flex-wrap gap-2 mt-3">
                      <Button size="sm" variant="outline" onClick={() => window.open(linkTV(u.id), '_blank')}><Tv className="w-4 h-4 mr-1" />Painel</Button>
                      <Button size="sm" variant="outline" onClick={() => copiarLink(u.id)}><Copy className="w-4 h-4 mr-1" />Link TV</Button>
                      <Button size="sm" variant="outline" onClick={() => abrirVideo(u.id, u.nome)}><Video className="w-4 h-4 mr-1" />Vídeo</Button>
                    </div>
                  </div>
                  <div className="flex gap-1">
                    <Button size="icon" variant="ghost" onClick={() => openEditUnit(u)}><Pencil className="w-4 h-4" /></Button>
                    <AlertDialog>
                      <AlertDialogTrigger asChild><Button size="icon" variant="ghost" className="text-destructive"><Trash2 className="w-4 h-4" /></Button></AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader><AlertDialogTitle>Excluir unidade?</AlertDialogTitle><AlertDialogDescription>Tem certeza que deseja excluir {u.nome}?</AlertDialogDescription></AlertDialogHeader>
                        <AlertDialogFooter><AlertDialogCancel>Cancelar</AlertDialogCancel><AlertDialogAction onClick={() => { deleteUnidade(u.id); toast.success('Unidade excluída!'); }}>Excluir</AlertDialogAction></AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>

      {/* Salas */}
      <div>
        <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
          <div>
            <h2 className="text-lg font-semibold font-display text-foreground flex items-center gap-2"><DoorOpen className="w-5 h-5" />Salas / Consultórios</h2>
            <p className="text-xs text-muted-foreground mt-1">{salas.length} sala(s) cadastrada(s) • {Object.keys(roomConfigs).length} aparelho(s) diagnóstico(s)</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant="outline" onClick={() => openNewRoom('aparelho_diagnostico')} className="border-violet-300 text-violet-700 hover:bg-violet-50">
              <Plus className="w-4 h-4 mr-1" />Novo Aparelho
            </Button>
            <Button size="sm" onClick={() => openNewRoom('consultorio_clinico')} className="gradient-primary text-primary-foreground"><Plus className="w-4 h-4 mr-1" />Nova Sala</Button>
          </div>
        </div>
        <div className="flex flex-wrap gap-2 mb-3" role="group" aria-label="Filtrar salas por finalidade">
          <Button size="sm" variant={roomFilter === 'todas' ? 'default' : 'outline'} onClick={() => setRoomFilter('todas')}>Todas ({salas.length})</Button>
          <Button size="sm" variant={roomFilter === 'consultorios' ? 'default' : 'outline'} onClick={() => setRoomFilter('consultorios')}>Consultórios ({salas.length - Object.keys(roomConfigs).filter(id => salas.some(s => s.id === id)).length})</Button>
          <Button size="sm" variant={roomFilter === 'aparelhos' ? 'default' : 'outline'} onClick={() => setRoomFilter('aparelhos')}>Aparelhos / Exames ({salas.filter(s => !!roomConfigs[s.id]).length})</Button>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
          {salas.filter(s => roomFilter === 'todas' || (roomFilter === 'aparelhos' ? !!roomConfigs[s.id] : !roomConfigs[s.id])).map(s => {
            const unidade = unidades.find(u => u.id === s.unidadeId);
            const diagnosticConfig = roomConfigs[s.id];
            return (
              <Card key={s.id} className="shadow-card border-0">
                <CardContent className="p-4">
                  <div className="flex items-start justify-between">
                    <div className="min-w-0">
                      <h3 className="font-semibold text-foreground">{s.nome}</h3>
                      <p className="text-sm text-muted-foreground">{unidade?.nome}</p>
                      <div className="mt-2 flex flex-wrap items-center gap-2">
                        {diagnosticConfig ? (
                          <>
                            <span className="inline-flex items-center rounded-full border border-violet-200 bg-violet-50 px-2.5 py-1 text-xs font-semibold text-violet-800">Aparelho: {diagnosticConfig.tipoExame || 'Exame diagnóstico'}</span>
                            <span className="text-xs text-muted-foreground">{diagnosticConfig.duracaoSlot} min por slot</span>
                          </>
                        ) : (
                          <span className="inline-flex items-center rounded-full border border-sky-200 bg-sky-50 px-2.5 py-1 text-xs font-semibold text-sky-800">Consultório</span>
                        )}
                      </div>
                    </div>
                    <div className="flex gap-1">
                      <Button size="icon" variant="ghost" onClick={() => openEditRoom(s)}><Pencil className="w-4 h-4" /></Button>
                      <AlertDialog>
                        <AlertDialogTrigger asChild><Button size="icon" variant="ghost" className="text-destructive"><Trash2 className="w-4 h-4" /></Button></AlertDialogTrigger>
                        <AlertDialogContent>
                          <AlertDialogHeader><AlertDialogTitle>Excluir sala?</AlertDialogTitle><AlertDialogDescription>Tem certeza?</AlertDialogDescription></AlertDialogHeader>
                          <AlertDialogFooter><AlertDialogCancel>Cancelar</AlertDialogCancel><AlertDialogAction onClick={() => { deleteSala(s.id); toast.success('Sala excluída!'); }}>Excluir</AlertDialogAction></AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      </div>

      {/* Dialogs */}
      <Dialog open={unitDialog} onOpenChange={setUnitDialog}>
        <DialogContent>
          <DialogHeader><DialogTitle className="font-display">{editUnitId ? 'Editar' : 'Nova'} Unidade</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div><Label>Nome *</Label><Input value={unitForm.nome} onChange={e => setUnitForm(p => ({ ...p, nome: e.target.value }))} /></div>
            <div><Label>Nome exibido no sistema</Label><Input value={unitForm.nomeExibicao} onChange={e => setUnitForm(p => ({ ...p, nomeExibicao: e.target.value }))} placeholder="Ex: CER II (aparece no menu lateral)" /></div>
            <div><Label>Endereço</Label><Input value={unitForm.endereco} onChange={e => setUnitForm(p => ({ ...p, endereco: e.target.value }))} /></div>
            <div className="grid grid-cols-2 gap-3">
              <div><Label>Telefone</Label><Input value={unitForm.telefone} onChange={e => setUnitForm(p => ({ ...p, telefone: e.target.value }))} /></div>
              <div><Label>WhatsApp</Label><Input value={unitForm.whatsapp} onChange={e => setUnitForm(p => ({ ...p, whatsapp: e.target.value }))} /></div>
            </div>
            <div>
              <Label>CNES (Cadastro Nacional de Estabelecimentos de Saúde)</Label>
              <Input
                value={unitForm.cnes}
                onChange={e => setUnitForm(p => ({ ...p, cnes: onlyDigits(e.target.value) }))}
                placeholder="0000000"
                maxLength={7}
                inputMode="numeric"
              />
              <p className="text-[11px] text-muted-foreground mt-1">
                7 dígitos. Usado na produção do BPA-I (SIA/SUS) como CNES do estabelecimento.
              </p>
            </div>
            <div>
              <Label>Logo da unidade (documentos impressos)</Label>
              <div className="flex items-center gap-3 mt-1">
                {customData.logo_url ? (
                  <img src={customData.logo_url} alt="Logo da unidade" className="h-14 w-14 object-contain rounded border bg-background" />
                ) : (
                  <div className="h-14 w-14 rounded border border-dashed flex items-center justify-center text-[10px] text-muted-foreground">Sem logo</div>
                )}
                <label className="inline-flex">
                  <input type="file" accept="image/png,image/jpeg,image/webp" className="hidden" disabled={enviandoLogo}
                    onChange={e => { const f = e.target.files?.[0]; if (f) enviarLogo(f); e.target.value = ''; }} />
                  <span className="inline-flex items-center gap-1 text-sm px-3 py-1.5 rounded-md border cursor-pointer hover:bg-muted">
                    {enviandoLogo ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}Enviar logo
                  </span>
                </label>
                {customData.logo_url && (
                  <Button type="button" size="sm" variant="ghost" onClick={() => setCustomData(p => { const n = { ...p }; delete n.logo_url; return n; })}><X className="w-4 h-4 mr-1" />Remover</Button>
                )}
              </div>
              <p className="text-[11px] text-muted-foreground mt-1">
                Sai no lado direito do cabeçalho dos documentos emitidos por profissionais desta unidade. Sem logo, usa a logo oficial do município. Clique em Salvar para gravar.
              </p>
            </div>
            {customConfig.fields.length > 0 && (
              <CustomFieldsRenderer
                fields={customConfig.fields}
                values={customData}
                onChange={(field, value) => setCustomData(prev => ({ ...prev, [field]: value }))}
              />
            )}
            <Button onClick={handleSaveUnit} className="w-full gradient-primary text-primary-foreground">{editUnitId ? 'Salvar' : 'Criar'}</Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={roomDialog} onOpenChange={setRoomDialog}>
        <DialogContent>
          <DialogHeader><DialogTitle className="font-display">{editRoomId ? 'Editar' : 'Nova'} Sala</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div><Label>Nome *</Label><Input value={roomForm.nome} onChange={e => setRoomForm(p => ({ ...p, nome: e.target.value }))} /></div>
            <div><Label>Unidade *</Label>
              <Select value={roomForm.unidadeId} onValueChange={v => setRoomForm(p => ({ ...p, unidadeId: v }))}>
                <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                <SelectContent>{unidades.map(u => <SelectItem key={u.id} value={u.id}>{u.nome}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div>
              <Label>Finalidade da Sala</Label>
              <Select value={roomForm.config.finalidade} onValueChange={v => setRoomForm(p => ({ ...p, config: { ...p.config, finalidade: v as DiagnosticRoomConfig['finalidade'] } }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="consultorio_clinico">Consultório Clínico (Padrão)</SelectItem>
                  <SelectItem value="aparelho_diagnostico">Aparelho / Exame Diagnóstico</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {roomForm.config.finalidade === 'aparelho_diagnostico' && (
              <div className="space-y-3 rounded-lg border p-3">
                <div><Label>Tipo de Exame / Aparelho *</Label>
                  <Input value={roomForm.config.tipoExame} onChange={e => setRoomForm(p => ({ ...p, config: { ...p.config, tipoExame: e.target.value } }))} placeholder="Ex.: Tomografia, ECG, Ultrassonografia, Raio-X" />
                </div>
                <div><Label>Duração do Slot</Label>
                  <Select value={String(roomForm.config.duracaoSlot)} onValueChange={v => setRoomForm(p => ({ ...p, config: { ...p.config, duracaoSlot: Number(v) } }))}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>{[10,15,20,30,45].map(n => <SelectItem key={n} value={String(n)}>{n} minutos</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <div className="flex items-center justify-between"><Label>Exige preparo prévio?</Label><Switch checked={roomForm.config.exigePreparo} onCheckedChange={v => setRoomForm(p => ({ ...p, config: { ...p.config, exigePreparo: v } }))} /></div>
                {roomForm.config.exigePreparo && <div><Label>Instruções de preparo</Label><Textarea rows={3} value={roomForm.config.instrucoesPreparo} onChange={e => setRoomForm(p => ({ ...p, config: { ...p.config, instrucoesPreparo: e.target.value } }))} placeholder="Descreva jejum, documentos e exames anteriores..." /></div>}
                <div><Label>Exige Contraste?</Label>
                  <Select value={roomForm.config.exigeContraste} onValueChange={v => setRoomForm(p => ({ ...p, config: { ...p.config, exigeContraste: v as DiagnosticRoomConfig['exigeContraste'] } }))}>
                    <SelectTrigger><SelectValue /></SelectTrigger><SelectContent>
                      <SelectItem value="nao">Não</SelectItem><SelectItem value="sim">Sim</SelectItem><SelectItem value="opcional">Opcional</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div><Label>Início da agenda</Label><Input type="time" value={roomForm.config.horarioInicio || '07:00'} onChange={e => setRoomForm(p => ({ ...p, config: { ...p.config, horarioInicio: e.target.value } }))} /></div>
                  <div><Label>Fim da agenda</Label><Input type="time" value={roomForm.config.horarioFim || '17:00'} onChange={e => setRoomForm(p => ({ ...p, config: { ...p.config, horarioFim: e.target.value } }))} /></div>
                </div>
                <p className="text-xs text-muted-foreground">Esta configuração é exclusiva desta sala e fica armazenada no custom_data da unidade. Consultórios comuns permanecem inalterados.</p>
              </div>
            )}
            <Button onClick={handleSaveRoom} className="w-full gradient-primary text-primary-foreground">{editRoomId ? 'Salvar' : 'Criar'}</Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={!!videoUnit} onOpenChange={(o) => !o && setVideoUnit(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle className="font-display">Vídeo do Painel — {videoUnit?.nome}</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Lista de vídeos ({videoList.length})</Label>
              <div className="space-y-1 mt-1 max-h-48 overflow-y-auto">
                {videoList.length === 0 && <p className="text-xs text-muted-foreground">Nenhum vídeo na lista.</p>}
                {videoList.map((u, i) => (
                  <div key={i + u} className="flex items-center gap-1 border rounded px-2 py-1 text-xs">
                    <span className="font-semibold w-5">{i + 1}.</span>
                    <span className="flex-1 truncate" title={u}>{decodeURIComponent(u.split('?')[0].split('/').pop() || u)}</span>
                    <Button size="icon" variant="ghost" className="h-6 w-6" disabled={i === 0} onClick={() => moverVideo(i, -1)}>↑</Button>
                    <Button size="icon" variant="ghost" className="h-6 w-6" disabled={i === videoList.length - 1} onClick={() => moverVideo(i, 1)}>↓</Button>
                    <Button size="icon" variant="ghost" className="h-6 w-6 text-destructive" onClick={() => setVideoList(l => l.filter((_, k) => k !== i))}><X className="w-3 h-3" /></Button>
                  </div>
                ))}
              </div>
              <p className="text-[11px] text-muted-foreground mt-1">Os vídeos tocam em sequência e recomeçam do primeiro. Recomendado: MP4 H.264, 1080p, até 100 MB cada.</p>
            </div>
            <div>
              <Label>Adicionar por URL (MP4)</Label>
              <div className="flex gap-2 items-center mt-1">
                <Input value={videoUrl} onChange={e => setVideoUrl(e.target.value)} placeholder="https://.../video.mp4" />
                <Button size="sm" variant="outline" onClick={addUrl}><Plus className="w-4 h-4" /></Button>
              </div>
            </div>
            <div className="flex items-center gap-2 text-[11px] text-muted-foreground"><div className="flex-1 border-t" />OU FAÇA UPLOAD<div className="flex-1 border-t" /></div>
            <label className="flex flex-col items-center justify-center gap-2 border-2 border-dashed rounded-lg p-6 cursor-pointer hover:bg-muted/50 text-sm">
              {enviando ? <Loader2 className="w-5 h-5 animate-spin" /> : <Upload className="w-5 h-5" />}
              {enviando ? 'Enviando vídeo...' : 'Clique para selecionar MP4'}
              <input type="file" accept="video/mp4" className="hidden" disabled={enviando} onChange={e => { const f = e.target.files?.[0]; if (f) enviarVideo(f); e.target.value = ''; }} />
            </label>
            <Button onClick={salvarVideo} disabled={enviando} className="w-full gradient-primary text-primary-foreground">Salvar Configuração</Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default UnidadesSalas;
