import React, { useState } from 'react';
import { useData } from '@/contexts/DataContext';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Plus, Search, Phone, Mail, Pencil } from 'lucide-react';
import { toast } from 'sonner';
import { validatePacienteFields } from '@/lib/validation';

const Pacientes: React.FC = () => {
  const { pacientes, addPaciente, updatePaciente } = useData();
  const [search, setSearch] = useState('');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState({ nome: '', cpf: '', telefone: '', dataNascimento: '', email: '', endereco: '' });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  const filtered = pacientes.filter(p =>
    p.nome.toLowerCase().includes(search.toLowerCase()) ||
    p.cpf.includes(search) ||
    p.telefone.includes(search)
  );

  const openNew = () => {
    setEditId(null);
    setForm({ nome: '', cpf: '', telefone: '', dataNascimento: '', email: '', endereco: '' });
    setErrors({});
    setDialogOpen(true);
  };

  const openEdit = (p: typeof pacientes[0]) => {
    setEditId(p.id);
    setForm({ nome: p.nome, cpf: p.cpf, telefone: p.telefone, dataNascimento: p.dataNascimento, email: p.email, endereco: p.endereco || '' });
    setErrors({});
    setDialogOpen(true);
  };

  const handleSave = async () => {
    const err = validatePacienteFields({ nome: form.nome, telefone: form.telefone, email: form.email });
    if (err) {
      const newErrors: Record<string, string> = {};
      if (err.includes('Nome')) newErrors.nome = err;
      else if (err.includes('Telefone') || err.includes('telefone')) newErrors.telefone = err;
      else if (err.includes('mail')) newErrors.email = err;
      setErrors(newErrors);
      toast.error(err);
      return;
    }
    setErrors({});
    setSaving(true);

    try {
      if (editId) {
        await updatePaciente(editId, form);
        toast.success('Paciente atualizado!');
      } else {
        await addPaciente({
          id: `p${Date.now()}`, ...form, observacoes: '',
          criadoEm: new Date().toISOString(),
        });
        toast.success('Paciente cadastrado com sucesso!');
      }
      setDialogOpen(false);
    } catch {
      toast.error('Erro ao salvar paciente.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-4 animate-fade-in">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold font-display text-foreground">Pacientes</h1>
          <p className="text-muted-foreground text-sm">{pacientes.length} cadastrados</p>
        </div>
        <Button onClick={openNew} className="gradient-primary text-primary-foreground"><Plus className="w-4 h-4 mr-2" /> Novo Paciente</Button>
      </div>

      <Dialog open={dialogOpen} onOpenChange={(open) => { setDialogOpen(open); if (!open) setErrors({}); }}>
        <DialogContent>
          <DialogHeader><DialogTitle className="font-display">{editId ? 'Editar' : 'Cadastrar'} Paciente</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>Nome *</Label>
              <Input value={form.nome} onChange={e => setForm(p => ({ ...p, nome: e.target.value }))} />
              {errors.nome && <p className="text-xs text-destructive mt-1">{errors.nome}</p>}
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div><Label>CPF</Label><Input value={form.cpf} onChange={e => setForm(p => ({ ...p, cpf: e.target.value }))} placeholder="000.000.000-00" /></div>
              <div>
                <Label>Telefone *</Label>
                <Input value={form.telefone} onChange={e => setForm(p => ({ ...p, telefone: e.target.value }))} placeholder="(93) 99999-0000" />
                {errors.telefone && <p className="text-xs text-destructive mt-1">{errors.telefone}</p>}
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div><Label>Data Nasc.</Label><Input type="date" value={form.dataNascimento} onChange={e => setForm(p => ({ ...p, dataNascimento: e.target.value }))} /></div>
              <div>
                <Label>E-mail *</Label>
                <Input type="email" value={form.email} onChange={e => setForm(p => ({ ...p, email: e.target.value }))} placeholder="paciente@email.com" />
                {errors.email && <p className="text-xs text-destructive mt-1">{errors.email}</p>}
              </div>
            </div>
            <div><Label>Endereço</Label><Input value={form.endereco} onChange={e => setForm(p => ({ ...p, endereco: e.target.value }))} /></div>
            <Button onClick={handleSave} className="w-full gradient-primary text-primary-foreground" disabled={saving}>
              {saving ? 'Salvando...' : editId ? 'Atualizar' : 'Cadastrar'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <Input placeholder="Buscar por nome, CPF ou telefone..." value={search} onChange={e => setSearch(e.target.value)} className="pl-10" />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
        {filtered.map(p => (
          <Card key={p.id} className="shadow-card border-0 hover:shadow-elevated transition-shadow">
            <CardContent className="p-4">
              <div className="flex items-start justify-between">
                <div>
                  <h3 className="font-semibold text-foreground">{p.nome}</h3>
                  <p className="text-xs text-muted-foreground mt-0.5">{p.cpf || 'Sem CPF'}</p>
                </div>
                <Button size="sm" variant="ghost" className="h-8 w-8 p-0" onClick={() => openEdit(p)}>
                  <Pencil className="w-3.5 h-3.5" />
                </Button>
              </div>
              <div className="flex items-center gap-4 mt-2 text-sm text-muted-foreground">
                <span className="flex items-center gap-1"><Phone className="w-3.5 h-3.5" />{p.telefone}</span>
                {p.email && <span className="flex items-center gap-1"><Mail className="w-3.5 h-3.5" />{p.email}</span>}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
};

export default Pacientes;
