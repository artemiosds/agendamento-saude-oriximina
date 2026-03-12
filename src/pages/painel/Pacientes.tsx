import React, { useState, useMemo } from 'react';
import { useData } from '@/contexts/DataContext';
import { useAuth } from '@/contexts/AuthContext';
import { useWebhookNotify } from '@/hooks/useWebhookNotify';
import { useEnsurePortalAccess } from '@/hooks/useEnsurePortalAccess';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Plus, Search, Phone, Mail, Pencil, Trash2, FileDown, Users, Clock, FileUp } from 'lucide-react';
import { toast } from 'sonner';
import { validatePacienteFields } from '@/lib/validation';
import { supabase } from '@/integrations/supabase/client';
import ImportarPacientesCSV from '@/components/ImportarPacientesCSV';

const Pacientes: React.FC = () => {
  const { pacientes, addPaciente, updatePaciente, agendamentos, fila, addToFila, unidades, funcionarios, logAction, refreshPacientes } = useData();
  const { user, hasPermission } = useAuth();
  const { notify } = useWebhookNotify();
  const { ensurePortalAccess } = useEnsurePortalAccess();
  const isProfissional = user?.role === 'profissional';
  const canDelete = hasPermission(['master', 'coordenador', 'recepcao']);
  const canImportCSV = hasPermission(['master', 'coordenador']);
  const canAddToFila = hasPermission(['master', 'coordenador', 'recepcao']);
  const profissionais = funcionarios.filter(f => f.role === 'profissional' && f.ativo);

  const [search, setSearch] = useState('');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState({ nome: '', cpf: '', telefone: '', dataNascimento: '', email: '', endereco: '', descricaoClinica: '', cid: '' });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  // Filter state
  const [filterFila, setFilterFila] = useState('all');
  const [sortBy, setSortBy] = useState('nome');

  // Fila dialog
  const [filaDialogOpen, setFilaDialogOpen] = useState(false);
  const [filaPaciente, setFilaPaciente] = useState<typeof pacientes[0] | null>(null);
  const [filaForm, setFilaForm] = useState({ unidadeId: '', profissionalId: '', prioridade: 'normal', observacoes: '', descricaoClinica: '', cid: '' });
  const [savingFila, setSavingFila] = useState(false);

  // Set of patient IDs currently in active queue
  const pacientesNaFila = useMemo(() => {
    const activeStatuses = ['aguardando', 'chamado', 'em_atendimento', 'encaixado'];
    return new Set(
      fila.filter(f => activeStatuses.includes(f.status)).map(f => f.pacienteId)
    );
  }, [fila]);

  // Set of patient IDs from demanda reprimida
  const pacientesDemandaReprimida = useMemo(() => {
    return new Set(
      fila.filter(f => f.origemCadastro === 'demanda_reprimida').map(f => f.pacienteId)
    );
  }, [fila]);

  // Get fila entry for a patient (for sorting)
  const filaEntryMap = useMemo(() => {
    const map = new Map<string, typeof fila[0]>();
    const activeStatuses = ['aguardando', 'chamado', 'em_atendimento', 'encaixado'];
    fila.filter(f => activeStatuses.includes(f.status)).forEach(f => {
      if (!map.has(f.pacienteId)) map.set(f.pacienteId, f);
    });
    return map;
  }, [fila]);

  // Profissionais só veem pacientes vinculados aos seus agendamentos
  const visiblePacientes = useMemo(() => {
    if (!isProfissional || !user) return pacientes;
    const myPacienteIds = new Set(
      agendamentos
        .filter(a => a.profissionalId === user.id)
        .map(a => a.pacienteId)
    );
    return pacientes.filter(p => myPacienteIds.has(p.id));
  }, [pacientes, agendamentos, isProfissional, user]);

  const filtered = useMemo(() => {
    let list = visiblePacientes.filter(p =>
      p.nome.toLowerCase().includes(search.toLowerCase()) ||
      p.cpf.includes(search) ||
      p.telefone.includes(search)
    );

    // Filter by fila
    if (filterFila === 'fila') {
      list = list.filter(p => pacientesNaFila.has(p.id));
    } else if (filterFila === 'sem_fila') {
      list = list.filter(p => !pacientesNaFila.has(p.id));
    } else if (filterFila === 'demanda_reprimida') {
      list = list.filter(p => pacientesDemandaReprimida.has(p.id));
    }

    // Sort
    if (sortBy === 'nome') {
      list.sort((a, b) => a.nome.localeCompare(b.nome));
    } else if (sortBy === 'data_fila') {
      list.sort((a, b) => {
        const fa = filaEntryMap.get(a.id);
        const fb = filaEntryMap.get(b.id);
        if (fa && !fb) return -1;
        if (!fa && fb) return 1;
        if (fa && fb) return fa.horaChegada.localeCompare(fb.horaChegada);
        return a.nome.localeCompare(b.nome);
      });
    } else if (sortBy === 'prioridade') {
      const prioOrder: Record<string, number> = { urgente: 0, gestante: 1, idoso: 2, alta: 3, pcd: 4, crianca: 5, normal: 6 };
      list.sort((a, b) => {
        const fa = filaEntryMap.get(a.id);
        const fb = filaEntryMap.get(b.id);
        const pa = fa ? (prioOrder[fa.prioridade] ?? 6) : 99;
        const pb = fb ? (prioOrder[fb.prioridade] ?? 6) : 99;
        return pa - pb;
      });
    }

    return list;
  }, [visiblePacientes, search, filterFila, sortBy, pacientesNaFila, filaEntryMap]);

  const openNew = () => {
    setEditId(null);
    setForm({ nome: '', cpf: '', telefone: '', dataNascimento: '', email: '', endereco: '', descricaoClinica: '', cid: '' });
    setErrors({});
    setDialogOpen(true);
  };

  const openEdit = (p: typeof pacientes[0]) => {
    setEditId(p.id);
    setForm({ nome: p.nome, cpf: p.cpf, telefone: p.telefone, dataNascimento: p.dataNascimento, email: p.email, endereco: p.endereco || '', descricaoClinica: p.descricaoClinica || '', cid: p.cid || '' });
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
          id: `p${Date.now()}`, ...form, observacoes: '', descricaoClinica: form.descricaoClinica || '', cid: form.cid || '',
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

  const handleDelete = async (p: typeof pacientes[0]) => {
    const activeLinks = agendamentos.filter(a => a.pacienteId === p.id && !['cancelado', 'concluido', 'falta'].includes(a.status));
    if (activeLinks.length > 0) {
      toast.error(`Não é possível excluir: ${p.nome} possui ${activeLinks.length} agendamento(s) ativo(s).`);
      return;
    }

    try {
      await (supabase as any).from('pacientes').delete().eq('id', p.id);
      await logAction({
        acao: 'excluir', entidade: 'paciente', entidadeId: p.id,
        detalhes: { nome: p.nome, cpf: p.cpf }, user,
      });
      await refreshPacientes();
      toast.success('Paciente excluído!');
    } catch (err) {
      console.error('Error deleting patient:', err);
      toast.error('Erro ao excluir paciente.');
    }
  };

  const openFilaDialog = (p: typeof pacientes[0]) => {
    setFilaPaciente(p);
    setFilaForm({ unidadeId: '', profissionalId: '', prioridade: 'normal', observacoes: '', descricaoClinica: '', cid: '' });
    setFilaDialogOpen(true);
  };

  const handleAddToFila = async () => {
    if (!filaPaciente || !filaForm.unidadeId) {
      toast.error('Selecione a unidade.');
      return;
    }
    setSavingFila(true);
    try {
      const newId = `f${Date.now()}`;
      await addToFila({
        id: newId,
        pacienteId: filaPaciente.id,
        pacienteNome: filaPaciente.nome,
        unidadeId: filaForm.unidadeId,
        profissionalId: filaForm.profissionalId,
        setor: '',
        prioridade: filaForm.prioridade as any,
        status: 'aguardando',
        posicao: fila.length + 1,
        horaChegada: new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }),
        criadoPor: user?.id || 'sistema',
        observacoes: filaForm.observacoes,
        descricaoClinica: filaForm.descricaoClinica,
        cid: filaForm.cid,
      });

      const unidade = unidades.find(u => u.id === filaForm.unidadeId);
      const prof = filaForm.profissionalId ? funcionarios.find(f => f.id === filaForm.profissionalId) : null;

      // Ensure portal access
      ensurePortalAccess({
        pacienteId: filaPaciente.id,
        contexto: 'fila',
        unidade: unidade?.nome || '',
        profissional: prof?.nome || '',
        posicaoFila: fila.length + 1,
      }).then(result => {
        if (result.created) toast.info(`Acesso ao portal criado para ${filaPaciente!.nome}. ${result.emailSent ? 'E-mail enviado.' : ''}`);
      }).catch(() => {});

      await notify({
        evento: 'fila_entrada',
        paciente_nome: filaPaciente.nome,
        telefone: filaPaciente.telefone,
        email: filaPaciente.email,
        data_consulta: new Date().toISOString().split('T')[0],
        hora_consulta: new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }),
        unidade: unidade?.nome || '',
        profissional: prof?.nome || '',
        tipo_atendimento: 'Fila de Espera',
        status_agendamento: 'aguardando',
        id_agendamento: '',
      });

      await logAction({
        acao: 'criar', entidade: 'fila_espera', entidadeId: newId,
        detalhes: { pacienteNome: filaPaciente.nome, unidade: unidade?.nome, origem: 'tela_pacientes', descricaoClinica: filaForm.descricaoClinica || undefined, cid: filaForm.cid || undefined }, user,
        modulo: 'fila_espera',
      });

      toast.success(`${filaPaciente.nome} adicionado à fila de espera!`);
      setFilaDialogOpen(false);
    } catch {
      toast.error('Erro ao adicionar à fila.');
    } finally {
      setSavingFila(false);
    }
  };

  return (
    <div className="space-y-4 animate-fade-in">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold font-display text-foreground">Pacientes</h1>
          <p className="text-muted-foreground text-sm">
            {visiblePacientes.length} cadastrados
            {pacientesNaFila.size > 0 && <span className="ml-2">• <Users className="w-3.5 h-3.5 inline" /> {pacientesNaFila.size} na fila</span>}
          </p>
        </div>
        <div className="flex gap-2">
          {canImportCSV && (
            <Button variant="outline" onClick={() => setImportOpen(true)}>
              <FileDown className="w-4 h-4 mr-2" /> Importar CSV
            </Button>
          )}
          <Button onClick={openNew} className="gradient-primary text-primary-foreground"><Plus className="w-4 h-4 mr-2" /> Novo Paciente</Button>
        </div>
      </div>

      {/* Patient create/edit dialog */}
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
            <div className="border-t pt-3 mt-1">
              <p className="text-sm font-semibold text-foreground mb-2">Informações Clínicas</p>
              <div className="space-y-3">
                <div>
                  <Label>Descrição Clínica</Label>
                  <Input value={form.descricaoClinica} onChange={e => setForm(p => ({ ...p, descricaoClinica: e.target.value }))} placeholder="Ex: dor lombar crônica, avaliação psicológica..." />
                </div>
                <div>
                  <Label>CID (opcional)</Label>
                  <Input value={form.cid} onChange={e => setForm(p => ({ ...p, cid: e.target.value }))} placeholder="Ex: F41.1" />
                </div>
              </div>
            </div>
            <Button onClick={handleSave} className="w-full gradient-primary text-primary-foreground" disabled={saving}>
              {saving ? 'Salvando...' : editId ? 'Atualizar' : 'Cadastrar'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Add to queue dialog */}
      <Dialog open={filaDialogOpen} onOpenChange={setFilaDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="font-display">Adicionar à Fila de Espera</DialogTitle>
          </DialogHeader>
          {filaPaciente && (
            <div className="space-y-4">
              <div className="p-3 rounded-lg bg-muted/50">
                <p className="font-semibold text-foreground">{filaPaciente.nome}</p>
                <p className="text-sm text-muted-foreground">{filaPaciente.telefone} • {filaPaciente.email}</p>
              </div>
              <div>
                <Label>Unidade *</Label>
                <Select value={filaForm.unidadeId} onValueChange={v => setFilaForm(p => ({ ...p, unidadeId: v }))}>
                  <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                  <SelectContent>{unidades.map(u => <SelectItem key={u.id} value={u.id}>{u.nome}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div>
                <Label>Profissional (opcional)</Label>
                <Select value={filaForm.profissionalId || 'none'} onValueChange={v => setFilaForm(p => ({ ...p, profissionalId: v === 'none' ? '' : v }))}>
                  <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Qualquer</SelectItem>
                    {profissionais.map(p => <SelectItem key={p.id} value={p.id}>{p.nome}{p.profissao ? ` — ${p.profissao}` : ''}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Prioridade</Label>
                <Select value={filaForm.prioridade} onValueChange={v => setFilaForm(p => ({ ...p, prioridade: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="normal">Normal</SelectItem>
                    <SelectItem value="gestante">Gestante</SelectItem>
                    <SelectItem value="idoso">Idoso 60+</SelectItem>
                    <SelectItem value="urgente">Urgente</SelectItem>
                    <SelectItem value="crianca">Criança 0-12</SelectItem>
                    <SelectItem value="pcd">PNE</SelectItem>
                    <SelectItem value="alta">Alta</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Observação Geral</Label>
                <Input value={filaForm.observacoes} onChange={e => setFilaForm(p => ({ ...p, observacoes: e.target.value }))} placeholder="Observações administrativas..." />
              </div>
              <div className="border-t pt-3 mt-1">
                <p className="text-sm font-semibold text-foreground mb-2">Informações Clínicas</p>
                <div className="space-y-3">
                  <div>
                    <Label>Descrição Clínica</Label>
                    <Input value={filaForm.descricaoClinica} onChange={e => setFilaForm(p => ({ ...p, descricaoClinica: e.target.value }))} placeholder="Motivo de espera / queixa principal..." />
                  </div>
                  <div>
                    <Label>CID (opcional)</Label>
                    <Input value={filaForm.cid} onChange={e => setFilaForm(p => ({ ...p, cid: e.target.value }))} placeholder="Ex: F41.1" />
                  </div>
                </div>
              </div>
              <Button onClick={handleAddToFila} className="w-full gradient-primary text-primary-foreground" disabled={savingFila}>
                {savingFila ? 'Adicionando...' : 'Adicionar à Fila'}
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Search + Filters */}
      <div className="flex flex-col sm:flex-row gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input placeholder="Buscar por nome, CPF ou telefone..." value={search} onChange={e => setSearch(e.target.value)} className="pl-10" />
        </div>
        <Select value={filterFila} onValueChange={setFilterFila}>
          <SelectTrigger className="w-full sm:w-[180px]"><SelectValue placeholder="Filtrar" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos</SelectItem>
            <SelectItem value="fila">Na Fila de Espera</SelectItem>
            <SelectItem value="demanda_reprimida">Demanda Reprimida</SelectItem>
            <SelectItem value="sem_fila">Sem fila</SelectItem>
          </SelectContent>
        </Select>
        <Select value={sortBy} onValueChange={setSortBy}>
          <SelectTrigger className="w-full sm:w-[180px]"><SelectValue placeholder="Ordenar" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="nome">Nome A-Z</SelectItem>
            <SelectItem value="data_fila">Data entrada fila</SelectItem>
            <SelectItem value="prioridade">Prioridade fila</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
        {filtered.map(p => {
          const naFila = pacientesNaFila.has(p.id);
          const filaEntry = filaEntryMap.get(p.id);

          return (
            <Card key={p.id} className="shadow-card border-0 hover:shadow-elevated transition-shadow">
              <CardContent className="p-4">
                <div className="flex items-start justify-between">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h3 className="font-semibold text-foreground">{p.nome}</h3>
                      {naFila && (
                        <Badge variant="outline" className="bg-warning/10 text-warning border-warning/30 text-[10px] px-1.5 py-0">
                          <Clock className="w-3 h-3 mr-0.5" /> FILA DE ESPERA
                        </Badge>
                      )}
                      {pacientesDemandaReprimida.has(p.id) && (
                        <Badge variant="outline" className="bg-orange-500/10 text-orange-600 border-orange-500/30 text-[10px] px-1.5 py-0">
                          <FileUp className="w-3 h-3 mr-0.5" /> DEMANDA REPRIMIDA
                        </Badge>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground mt-0.5">{p.cpf || 'Sem CPF'}</p>
                    {naFila && filaEntry && (
                      <p className="text-xs text-muted-foreground mt-0.5">
                        Entrada: {filaEntry.horaChegada} • {filaEntry.prioridade !== 'normal' ? filaEntry.prioridade : ''}
                      </p>
                    )}
                  </div>
                  <div className="flex gap-1">
                    {canAddToFila && !naFila && (
                      <Button size="sm" variant="ghost" className="h-8 w-8 p-0 text-warning" onClick={() => openFilaDialog(p)} title="Adicionar à fila">
                        <Users className="w-3.5 h-3.5" />
                      </Button>
                    )}
                    <Button size="sm" variant="ghost" className="h-8 w-8 p-0" onClick={() => openEdit(p)}>
                      <Pencil className="w-3.5 h-3.5" />
                    </Button>
                    {canDelete && (
                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <Button size="sm" variant="ghost" className="h-8 w-8 p-0 text-destructive">
                            <Trash2 className="w-3.5 h-3.5" />
                          </Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                          <AlertDialogHeader>
                            <AlertDialogTitle>Excluir paciente?</AlertDialogTitle>
                            <AlertDialogDescription>
                              Excluir {p.nome}? Será verificado se há agendamentos ativos vinculados. Esta ação é irreversível e será registrada em log.
                            </AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel>Cancelar</AlertDialogCancel>
                            <AlertDialogAction onClick={() => handleDelete(p)} className="bg-destructive text-destructive-foreground">Excluir</AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-4 mt-2 text-sm text-muted-foreground">
                  <span className="flex items-center gap-1"><Phone className="w-3.5 h-3.5" />{p.telefone}</span>
                  {p.email && <span className="flex items-center gap-1"><Mail className="w-3.5 h-3.5" />{p.email}</span>}
                </div>
                {(p.descricaoClinica || p.cid) && (
                  <div className="mt-1.5 text-xs text-muted-foreground space-y-0.5">
                    {p.descricaoClinica && <p>🩺 {p.descricaoClinica}</p>}
                    {p.cid && <p>CID: {p.cid}</p>}
                  </div>
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>
      {canImportCSV && <ImportarPacientesCSV open={importOpen} onOpenChange={setImportOpen} />}
    </div>
  );
};

export default Pacientes;
