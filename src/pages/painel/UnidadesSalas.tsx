import React, { useState } from 'react';
import { useData } from '@/contexts/DataContext';
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

const UnidadesSalas: React.FC = () => {
  const { unidades, salas, addUnidade, updateUnidade, deleteUnidade, addSala, updateSala, deleteSala } = useData();
  const { resolved: customConfig } = useCustomFields('unidade');
  const [customData, setCustomData] = useState<Record<string, any>>({});
  const [unitDialog, setUnitDialog] = useState(false);
  const [roomDialog, setRoomDialog] = useState(false);
  const [editUnitId, setEditUnitId] = useState<string | null>(null);
  const [editRoomId, setEditRoomId] = useState<string | null>(null);
  const [unitForm, setUnitForm] = useState({ nome: '', nomeExibicao: '', endereco: '', telefone: '', whatsapp: '' });
  const [roomForm, setRoomForm] = useState({ nome: '', unidadeId: '' });

  const openNewUnit = () => { setEditUnitId(null); setUnitForm({ nome: '', nomeExibicao: '', endereco: '', telefone: '', whatsapp: '' }); setCustomData({}); setUnitDialog(true); };
  const openEditUnit = (u: typeof unidades[0]) => { setEditUnitId(u.id); setUnitForm({ nome: u.nome, nomeExibicao: u.nomeExibicao || '', endereco: u.endereco, telefone: u.telefone, whatsapp: u.whatsapp }); setCustomData({}); setUnitDialog(true); };
  const openNewRoom = () => { setEditRoomId(null); setRoomForm({ nome: '', unidadeId: '' }); setRoomDialog(true); };
  const openEditRoom = (s: typeof salas[0]) => { setEditRoomId(s.id); setRoomForm({ nome: s.nome, unidadeId: s.unidadeId }); setRoomDialog(true); };

  const handleSaveUnit = () => {
    if (!unitForm.nome) return;
    if (editUnitId) {
      updateUnidade(editUnitId, unitForm);
      toast.success('Unidade atualizada!');
    } else {
      addUnidade({ id: `un${Date.now()}`, ...unitForm, ativo: true });
      toast.success('Unidade criada!');
    }
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
