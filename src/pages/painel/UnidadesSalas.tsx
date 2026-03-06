import React, { useState } from 'react';
import { useData } from '@/contexts/DataContext';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Plus, Building2, DoorOpen } from 'lucide-react';

const UnidadesSalas: React.FC = () => {
  const { unidades, salas, addUnidade, addSala } = useData();
  const [unitDialog, setUnitDialog] = useState(false);
  const [roomDialog, setRoomDialog] = useState(false);
  const [unitForm, setUnitForm] = useState({ nome: '', endereco: '', telefone: '', whatsapp: '' });
  const [roomForm, setRoomForm] = useState({ nome: '', unidadeId: '' });

  const handleAddUnit = () => {
    if (!unitForm.nome) return;
    addUnidade({ id: `un${Date.now()}`, ...unitForm, ativo: true });
    setUnitDialog(false);
    setUnitForm({ nome: '', endereco: '', telefone: '', whatsapp: '' });
  };

  const handleAddRoom = () => {
    if (!roomForm.nome || !roomForm.unidadeId) return;
    addSala({ id: `s${Date.now()}`, nome: roomForm.nome, unidadeId: roomForm.unidadeId, ativo: true });
    setRoomDialog(false);
    setRoomForm({ nome: '', unidadeId: '' });
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
          <Dialog open={unitDialog} onOpenChange={setUnitDialog}>
            <DialogTrigger asChild><Button size="sm" className="gradient-primary text-primary-foreground"><Plus className="w-4 h-4 mr-1" />Nova Unidade</Button></DialogTrigger>
            <DialogContent>
              <DialogHeader><DialogTitle className="font-display">Nova Unidade</DialogTitle></DialogHeader>
              <div className="space-y-3">
                <div><Label>Nome *</Label><Input value={unitForm.nome} onChange={e => setUnitForm(p => ({ ...p, nome: e.target.value }))} /></div>
                <div><Label>Endereço</Label><Input value={unitForm.endereco} onChange={e => setUnitForm(p => ({ ...p, endereco: e.target.value }))} /></div>
                <div className="grid grid-cols-2 gap-3">
                  <div><Label>Telefone</Label><Input value={unitForm.telefone} onChange={e => setUnitForm(p => ({ ...p, telefone: e.target.value }))} /></div>
                  <div><Label>WhatsApp</Label><Input value={unitForm.whatsapp} onChange={e => setUnitForm(p => ({ ...p, whatsapp: e.target.value }))} /></div>
                </div>
                <Button onClick={handleAddUnit} className="w-full gradient-primary text-primary-foreground">Criar Unidade</Button>
              </div>
            </DialogContent>
          </Dialog>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {unidades.map(u => (
            <Card key={u.id} className="shadow-card border-0">
              <CardContent className="p-4">
                <h3 className="font-semibold text-foreground">{u.nome}</h3>
                <p className="text-sm text-muted-foreground mt-1">{u.endereco}</p>
                <p className="text-sm text-muted-foreground">{u.telefone} • {u.whatsapp}</p>
                <div className="mt-2">
                  <span className="text-xs text-muted-foreground">{salas.filter(s => s.unidadeId === u.id).length} sala(s)</span>
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
          <Dialog open={roomDialog} onOpenChange={setRoomDialog}>
            <DialogTrigger asChild><Button size="sm" className="gradient-primary text-primary-foreground"><Plus className="w-4 h-4 mr-1" />Nova Sala</Button></DialogTrigger>
            <DialogContent>
              <DialogHeader><DialogTitle className="font-display">Nova Sala</DialogTitle></DialogHeader>
              <div className="space-y-3">
                <div><Label>Nome *</Label><Input value={roomForm.nome} onChange={e => setRoomForm(p => ({ ...p, nome: e.target.value }))} /></div>
                <div><Label>Unidade *</Label>
                  <select className="w-full border rounded-md p-2 text-sm bg-background text-foreground" value={roomForm.unidadeId} onChange={e => setRoomForm(p => ({ ...p, unidadeId: e.target.value }))}>
                    <option value="">Selecione</option>
                    {unidades.map(u => <option key={u.id} value={u.id}>{u.nome}</option>)}
                  </select>
                </div>
                <Button onClick={handleAddRoom} className="w-full gradient-primary text-primary-foreground">Criar Sala</Button>
              </div>
            </DialogContent>
          </Dialog>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
          {salas.map(s => {
            const unidade = unidades.find(u => u.id === s.unidadeId);
            return (
              <Card key={s.id} className="shadow-card border-0">
                <CardContent className="p-4">
                  <h3 className="font-semibold text-foreground">{s.nome}</h3>
                  <p className="text-sm text-muted-foreground">{unidade?.nome}</p>
                </CardContent>
              </Card>
            );
          })}
        </div>
      </div>
    </div>
  );
};

export default UnidadesSalas;
