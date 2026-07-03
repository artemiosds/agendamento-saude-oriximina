import React, { useState } from 'react';
import { useOperacional } from '@/contexts/OperacionalContext';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Plus, Building2, DoorOpen, Pencil, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import CustomFieldsRenderer from '@/components/CustomFieldsRenderer';
import { useCustomFields } from '@/hooks/useCustomFields';
import { supabase } from '@/integrations/supabase/client';

const UnidadesSalas: React.FC = () => {
  const { unidades, salas, addUnidade, updateUnidade, deleteUnidade, addSala, updateSala, deleteSala } = useOperacional();
  const { resolved: customConfig } = useCustomFields('unidade');
  const [customData, setCustomData] = useState<Record<string, any>>({});
  const [unitDialog, setUnitDialog] = useState(false);
  const [roomDialog, setRoomDialog] = useState(false);
  const [editUnitId, setEditUnitId] = useState<string | null>(null);
  const [editRoomId, setEditRoomId] = useState<string | null>(null);
  const [unitForm, setUnitForm] = useState({ nome: '', nomeExibicao: '', endereco: '', telefone: '', whatsapp: '', cnes: '' });
  const [roomForm, setRoomForm] = useState({ nome: '', unidadeId: '' });

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
  const openNewRoom = () => { setEditRoomId(null); setRoomForm({ nome: '', unidadeId: '' }); setRoomDialog(true); };
  const openEditRoom = (s: typeof salas[0]) => { setEditRoomId(s.id); setRoomForm({ nome: s.nome, unidadeId: s.unidadeId }); setRoomDialog(true); };

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

  const handleSaveRoom = () => {
    if (!roomForm.nome || !roomForm.unidadeId) return;
    if (editRoomId) {
      updateSala(editRoomId, roomForm);
      toast.success('Sala atualizada!');
    } else {
      addSala({ id: `s${Date.now()}`, nome: roomForm.nome, unidadeId: roomForm.unidadeId, ativo: true });
      toast.success('Sala criada!');
    }
    setRoomDialog(false);
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
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-lg font-semibold font-display text-foreground flex items-center gap-2"><DoorOpen className="w-5 h-5" />Salas / Consultórios</h2>
          <Button size="sm" onClick={openNewRoom} className="gradient-primary text-primary-foreground"><Plus className="w-4 h-4 mr-1" />Nova Sala</Button>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
          {salas.map(s => {
            const unidade = unidades.find(u => u.id === s.unidadeId);
            return (
              <Card key={s.id} className="shadow-card border-0">
                <CardContent className="p-4">
                  <div className="flex items-start justify-between">
                    <div>
                      <h3 className="font-semibold text-foreground">{s.nome}</h3>
                      <p className="text-sm text-muted-foreground">{unidade?.nome}</p>
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
            <Button onClick={handleSaveRoom} className="w-full gradient-primary text-primary-foreground">{editRoomId ? 'Salvar' : 'Criar'}</Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default UnidadesSalas;
