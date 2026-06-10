import React, { useState, useEffect, useMemo } from 'react';
import { PageHeader } from '@/components/ui/page-header';
import { EmptyState, LoadingState } from '@/components/EmptyState';
import { Users } from 'lucide-react';
import { useData } from '@/contexts/DataContext';
import { useAuth } from '@/contexts/AuthContext';
import { usePermissions } from '@/contexts/PermissionsContext';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from '@/components/ui/sheet';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Search, X, Printer, Power, RotateCcw } from 'lucide-react';
import { Plus, Pencil, Trash2, Loader2, CalendarCheck, Eye, EyeOff, UserCog } from 'lucide-react';
import { UserRole } from '@/types';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { useUnidadeFilter } from '@/hooks/useUnidadeFilter';
import ProfissionaisExternos from './ProfissionaisExternos';
import CustomFieldsRenderer from '@/components/CustomFieldsRenderer';
import { useCustomFields } from '@/hooks/useCustomFields';
import CboAutocomplete, { CboValue } from '@/components/CboAutocomplete';
import { formatCNS, unmaskCNS, validateCNS } from '@/lib/cnsUtils';
const roleLabels: Record<string, string> = {
  master: 'MASTER', coordenador: 'Coordenador', recepcao: 'RECEPÇÃO', profissional: 'PROFISSIONAL', gestao: 'GESTÃO', tecnico: 'TRIAGEM', enfermagem: 'ENFERMAGEM',
};
const roleColors: Record<UserRole, string> = {
  master: 'bg-destructive/10 text-destructive', coordenador: 'bg-warning/10 text-warning',
  recepcao: 'bg-info/10 text-info', profissional: 'bg-success/10 text-success', gestao: 'bg-accent text-accent-foreground',
  tecnico: 'bg-primary/10 text-primary', enfermagem: 'bg-purple-100 text-purple-700',
};

interface FuncionarioDB {
  id: string;
  auth_user_id: string | null;
  nome: string;
  usuario: string;
  email: string;
  cpf: string;
  setor: string;
  unidade_id: string;
  sala_id: string;
  cargo: string;
  role: string;
  ativo: boolean;
  criado_em: string;
  criado_por: string;
  tempo_atendimento: number;
  profissao: string;
  tipo_conselho: string;
  numero_conselho: string;
  uf_conselho: string;
  pode_agendar_retorno: boolean;
  coren: string;
  custom_data?: Record<string, any> | null;
}

const Funcionarios: React.FC = () => {
  const { unidades, salas, refreshFuncionarios, logAction } = useData();
  const { unidadesVisiveis, isGlobalMaster } = useUnidadeFilter();
  const { user, isUnitMaster } = useAuth();
  const { can } = usePermissions();
  const { resolved: customConfig } = useCustomFields('funcionario', user?.unidadeId);
  const [customData, setCustomData] = useState<Record<string, any>>({});
  const [funcionarios, setFuncionarios] = useState<FuncionarioDB[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [showSenha, setShowSenha] = useState(false);
  const [form, setForm] = useState({
    nome: '', usuario: '', email: '', cpf: '', senha: '', setor: '', unidade_id: '', sala_id: '', cargo: '', role: '' as UserRole, tempo_atendimento: 30,
    profissao: '', tipo_conselho: '', numero_conselho: '', uf_conselho: '', pode_agendar_retorno: false, coren: '', cns: '',
    ativo: true, data_admissao: '', tipo_vinculo: '', setor_principal: '', turno_trabalho: '', observacoes_internas: '',
  });
  const [cbo, setCbo] = useState<CboValue | null>(null);
  const [showCboError, setShowCboError] = useState(false);
  const canManage = can('usuarios', 'can_edit');
  const [searchTerm, setSearchTerm] = useState('');
  const [filterUnidade, setFilterUnidade] = useState<string>('all');
  const [filterProfissao, setFilterProfissao] = useState<string>('all');
  const [filterRole, setFilterRole] = useState<string>('all');
  const [sortBy, setSortBy] = useState<string>('nome_asc');
  const [activeTab, setActiveTab] = useState<string>('internos');
  const [viewFuncionario, setViewFuncionario] = useState<FuncionarioDB | null>(null);

  const loadFuncionarios = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('manage-employee', {
        body: { action: 'list' },
      });
      if (data?.funcionarios) {
        setFuncionarios(data.funcionarios);
      }
    } catch (err) {
      console.error('Error loading employees:', err);
    }
    setLoading(false);
  };

  useEffect(() => {
    loadFuncionarios();
  }, []);

  useEffect(() => {
    // Check for ID in URL to automatically open edit modal
    const params = new URLSearchParams(window.location.search);
    const idFromUrl = params.get('id');
    
    if (idFromUrl && funcionarios.length > 0) {
      const target = funcionarios.find(f => f.id === idFromUrl);
      if (target) {
        openEdit(target);
        // Clean URL after opening
        window.history.replaceState({}, '', '/painel/funcionarios');
      }
    }
  }, [funcionarios]);

  const conselhoMap: Record<string, string> = {
    'Médico': 'CRM', 'Médica': 'CRM', 'Enfermeiro': 'COREN', 'Enfermeira': 'COREN',
    'Odontólogo': 'CRO', 'Odontóloga': 'CRO', 'Dentista': 'CRO',
    'Fisioterapeuta': 'CREFITO', 'Psicólogo': 'CRP', 'Psicóloga': 'CRP',
    'Assistente Social': 'CRESS', 'Nutricionista': 'CRN', 'Farmacêutico': 'CRF', 'Farmacêutica': 'CRF',
    'Fonoaudiólogo': 'CRFa', 'Fonoaudióloga': 'CRFa', 'Terapeuta Ocupacional': 'CREFITO',
    'Biomédico': 'CRBM', 'Biomédica': 'CRBM', 'Fisio': 'CREFITO',
  };

  const openEdit = (f: FuncionarioDB) => {
    setEditId(f.id);
    const cd = (f.custom_data as any) || {};
    setForm({
      nome: f.nome, usuario: f.usuario, email: f.email, cpf: f.cpf || '', senha: '',
      setor: f.setor || '', unidade_id: f.unidade_id || '', sala_id: f.sala_id || '',
      cargo: f.cargo || '', role: f.role as UserRole, tempo_atendimento: f.tempo_atendimento || 30,
      profissao: f.profissao || '', tipo_conselho: f.tipo_conselho || '',
      numero_conselho: f.numero_conselho || '', uf_conselho: f.uf_conselho || '',
      pode_agendar_retorno: f.pode_agendar_retorno ?? false,
      coren: f.coren || '',
      cns: formatCNS(cd.cns || ''),
      ativo: f.ativo ?? true,
      data_admissao: cd.data_admissao || '',
      tipo_vinculo: cd.tipo_vinculo || '',
      setor_principal: cd.setor_principal || '',
      turno_trabalho: cd.turno_trabalho || '',
      observacoes_internas: cd.observacoes_internas || '',
    });
    if (cd.cbo_codigo && cd.cbo_descricao) {
      setCbo({ codigo: cd.cbo_codigo, descricao: cd.cbo_descricao });
    } else {
      setCbo(null);
    }
    setShowCboError(false);
    setCustomData(cd);
    setDialogOpen(true);
  };

  const openNew = () => {
    setEditId(null);
    const defaultUnit = isUnitMaster ? (user?.unidadeId || '') : '';
    setForm({ nome: '', usuario: '', email: '', cpf: '', senha: '', setor: '', unidade_id: defaultUnit, sala_id: '', cargo: '', role: '' as UserRole, tempo_atendimento: 30, profissao: '', tipo_conselho: '', numero_conselho: '', uf_conselho: '', pode_agendar_retorno: false, coren: '', cns: '', ativo: true, data_admissao: '', tipo_vinculo: '', setor_principal: '', turno_trabalho: '', observacoes_internas: '' });
    setCbo(null);
    setShowCboError(false);
    setCustomData({});
    setDialogOpen(true);
  };

  // Roles that require CBO (clinical/triage staff that generate BPA-I records)
  const requiresCbo = (role: string) => role === 'profissional' || role === 'tecnico' || role === 'enfermagem';

  const handleSave = async () => {
    if (!form.nome || !form.usuario || !form.email || !form.role) {
      toast.error('Nome, usuário, e-mail e perfil são obrigatórios.');
      return;
    }
    // CBO is mandatory for clinical roles (used for BPA-I production export)
    if (requiresCbo(form.role) && !cbo?.codigo) {
      setShowCboError(true);
      toast.error('CBO é obrigatório para profissionais clínicos. Selecione no autocomplete.');
      return;
    }
    // CNS validation (optional, but if filled must be 15 digits)
    const cnsValidation = validateCNS(form.cns);
    if (!cnsValidation.valid) {
      toast.error(cnsValidation.message || 'CNS inválido.');
      return;
    }
    // Unit master: force unit to their own and block editing global master
    if (isUnitMaster) {
      if (editId) {
        const target = funcionarios.find(f => f.id === editId);
        if (target && isProtectedGlobalMaster(target)) {
          toast.error('Você não tem permissão para editar o administrador global.');
          return;
        }
      }
      // Force unit_id to the user's unit
      form.unidade_id = user?.unidadeId || '';
    }

    setSaving(true);
    try {
      if (editId) {
        const updateData: Record<string, any> = {
          action: 'update',
          id: editId,
          nome: form.nome,
          usuario: form.usuario,
          email: form.email,
          cpf: form.cpf,
          setor: form.setor,
          unidade_id: form.unidade_id,
          sala_id: form.sala_id,
          cargo: form.cargo,
          role: form.role,
          tempo_atendimento: form.tempo_atendimento,
          profissao: form.profissao,
          tipo_conselho: form.tipo_conselho,
          numero_conselho: form.numero_conselho,
          uf_conselho: form.uf_conselho,
          pode_agendar_retorno: form.pode_agendar_retorno,
          coren: form.coren,
          cbo_codigo: cbo?.codigo || '',
          cbo_descricao: cbo?.descricao || '',
          cns: unmaskCNS(form.cns),
          ativo: form.ativo,
          custom_data_extras: {
            data_admissao: form.data_admissao,
            tipo_vinculo: form.tipo_vinculo,
            setor_principal: form.setor_principal,
            turno_trabalho: form.turno_trabalho,
            observacoes_internas: form.observacoes_internas,
          },
        };
        if (form.senha) updateData.senha = form.senha;

        const { data, error } = await supabase.functions.invoke('manage-employee', {
          body: updateData,
        });

        if (error || data?.error) {
          toast.error(data?.error || 'Erro ao atualizar funcionário.');
          setSaving(false);
          return;
        }
        toast.success('Funcionário atualizado!');
      } else {
        if (!form.senha) {
          toast.error('Senha é obrigatória para novo funcionário.');
          setSaving(false);
          return;
        }

        const { data, error } = await supabase.functions.invoke('manage-employee', {
          body: {
            action: 'create',
            nome: form.nome,
            usuario: form.usuario,
            email: form.email,
            cpf: form.cpf,
            senha: form.senha,
            setor: form.setor,
            unidade_id: form.unidade_id,
            sala_id: form.sala_id,
            cargo: form.cargo,
            role: form.role,
            tempo_atendimento: form.tempo_atendimento,
            profissao: form.profissao,
            tipo_conselho: form.tipo_conselho,
            numero_conselho: form.numero_conselho,
            uf_conselho: form.uf_conselho,
            pode_agendar_retorno: form.pode_agendar_retorno,
            coren: form.coren,
            cbo_codigo: cbo?.codigo || '',
            cbo_descricao: cbo?.descricao || '',
            cns: unmaskCNS(form.cns),
            criado_por: user?.id || '',
            custom_data_extras: {
              data_admissao: form.data_admissao,
              tipo_vinculo: form.tipo_vinculo,
              setor_principal: form.setor_principal,
              turno_trabalho: form.turno_trabalho,
              observacoes_internas: form.observacoes_internas,
            },
          },
        });

        if (error || data?.error) {
          toast.error(data?.error || 'Erro ao cadastrar funcionário.');
          setSaving(false);
          return;
        }
        toast.success('Funcionário cadastrado com sucesso!');
      }

      setDialogOpen(false);
      await loadFuncionarios();
      // Also refresh DataContext so other pages see the new employee immediately
      await refreshFuncionarios();
    } catch (err) {
      toast.error('Erro ao salvar funcionário.');
    }
    setSaving(false);
  };

  const handleDelete = async (id: string) => {
    // Prevent unit master from deleting global master
    const target = funcionarios.find(f => f.id === id);
    if (isUnitMaster && target && isProtectedGlobalMaster(target)) {
      toast.error('Você não tem permissão para excluir o administrador global.');
      return;
    }
    try {
      const { data, error } = await supabase.functions.invoke('manage-employee', {
        body: { action: 'delete', id },
      });
      if (error || data?.error) {
        toast.error(data?.error || 'Erro ao excluir.');
        return;
      }
      toast.success('Funcionário excluído!');
      await loadFuncionarios();
      await refreshFuncionarios();
    } catch {
      toast.error('Erro ao excluir funcionário.');
    }
  };

  /** Check if a given employee is the global master (protected from unit masters) */
  const isProtectedGlobalMaster = (f: FuncionarioDB) => f.usuario === 'admin.sms';

  /** Toggle ativo/inativo for an employee */
  const handleToggleAtivo = async (f: FuncionarioDB) => {
    if (isUnitMaster && isProtectedGlobalMaster(f)) {
      toast.error('Você não tem permissão para alterar o administrador global.');
      return;
    }
    try {
      const { data, error } = await supabase.functions.invoke('manage-employee', {
        body: { action: 'update', id: f.id, ativo: !f.ativo },
      });
      if (error || data?.error) {
        toast.error(data?.error || 'Erro ao atualizar status.');
        return;
      }
      toast.success(!f.ativo ? 'Funcionário ativado!' : 'Funcionário desativado!');
      await loadFuncionarios();
      await refreshFuncionarios();
      setViewFuncionario(prev => prev && prev.id === f.id ? { ...prev, ativo: !f.ativo } : prev);
    } catch {
      toast.error('Erro ao atualizar status.');
    }
  };

  /** Print employee profile card */
  const handlePrintFuncionario = (f: FuncionarioDB) => {
    const unidadeNome = unidades.find(u => u.id === f.unidade_id)?.nome || '—';
    const cd = (f.custom_data as any) || {};
    const w = window.open('', '_blank', 'width=800,height=900');
    if (!w) return;
    w.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>Ficha — ${f.nome}</title>
      <style>body{font-family:Georgia,serif;padding:32px;color:#1a1a1a;max-width:720px;margin:auto}
      h1{font-size:20px;border-bottom:2px solid #2A6F97;padding-bottom:8px;color:#2A6F97}
      h2{font-size:14px;margin-top:24px;color:#2A6F97;text-transform:uppercase;letter-spacing:1px}
      table{width:100%;border-collapse:collapse;margin-top:8px} td{padding:6px 8px;border-bottom:1px solid #eee;font-size:13px;vertical-align:top}
      td:first-child{font-weight:600;width:35%;color:#555} .foot{margin-top:32px;font-size:11px;color:#888;text-align:center}</style></head><body>
      <h1>Ficha do Funcionário</h1>
      <h2>Dados Pessoais</h2><table>
      <tr><td>Nome</td><td>${f.nome}</td></tr>
      <tr><td>CPF</td><td>${f.cpf || '—'}</td></tr>
      <tr><td>E-mail</td><td>${f.email || '—'}</td></tr>
      <tr><td>Usuário</td><td>${f.usuario || '—'}</td></tr>
      </table>
      <h2>Dados Profissionais</h2><table>
      <tr><td>Profissão</td><td>${f.profissao || '—'}</td></tr>
      <tr><td>Cargo</td><td>${f.cargo || '—'}</td></tr>
      <tr><td>Perfil</td><td>${roleLabels[f.role] || f.role}</td></tr>
      <tr><td>Conselho</td><td>${f.tipo_conselho || ''} ${f.numero_conselho || ''} ${f.uf_conselho ? '/' + f.uf_conselho : ''}</td></tr>
      <tr><td>CBO</td><td>${cd.cbo_codigo || '—'} ${cd.cbo_descricao || ''}</td></tr>
      <tr><td>CNS</td><td>${cd.cns ? formatCNS(cd.cns) : '—'}</td></tr>
      <tr><td>Unidade</td><td>${unidadeNome}</td></tr>
      <tr><td>Setor</td><td>${f.setor || '—'}</td></tr>
      <tr><td>Tempo de Atendimento</td><td>${f.tempo_atendimento || '—'} min</td></tr>
      </table>
      <h2>Vínculo</h2><table>
      <tr><td>Status</td><td>${f.ativo ? 'Ativo' : 'Inativo'}</td></tr>
      <tr><td>Tipo de Vínculo</td><td>${cd.tipo_vinculo || '—'}</td></tr>
      <tr><td>Data de Admissão</td><td>${cd.data_admissao || '—'}</td></tr>
      <tr><td>Turno</td><td>${cd.turno_trabalho || '—'}</td></tr>
      <tr><td>Data de Cadastro</td><td>${f.criado_em ? new Date(f.criado_em).toLocaleDateString('pt-BR') : '—'}</td></tr>
      </table>
      <div class="foot">Documento emitido por GestorPlantão — SMS Oriximiná — ${new Date().toLocaleString('pt-BR')}</div>
      <script>window.onload=()=>{window.print();}</script></body></html>`);
    w.document.close();
  };

  /** Apply unit-scope and master protection (used by all tabs) */
  const scopedFuncionarios = useMemo(() => {
    let list = funcionarios;
    if (user?.usuario !== 'admin.sms' && user?.unidadeId) {
      list = list.filter(f => f.unidade_id === user.unidadeId || !f.unidade_id);
    }
    if (isUnitMaster) {
      list = list.filter(f => !isProtectedGlobalMaster(f));
    }
    return list;
  }, [funcionarios, user, isUnitMaster]);

  /** Distinct profession options for filter dropdown */
  const profissoesDisponiveis = useMemo(() => {
    const set = new Set<string>();
    scopedFuncionarios.forEach(f => { if (f.profissao) set.add(f.profissao); });
    return Array.from(set).sort();
  }, [scopedFuncionarios]);

  /** Apply text + dropdown filters + sort */
  const applyFilters = (list: FuncionarioDB[]) => {
    let out = list;
    if (searchTerm.trim()) {
      const term = searchTerm.toLowerCase();
      out = out.filter(f =>
        f.nome.toLowerCase().includes(term) || f.email.toLowerCase().includes(term) || (f.cpf || '').includes(term) || (f.profissao || '').toLowerCase().includes(term) || (f.cargo || '').toLowerCase().includes(term)
      );
    }
    if (filterUnidade !== 'all') out = out.filter(f => f.unidade_id === filterUnidade);
    if (filterProfissao !== 'all') out = out.filter(f => f.profissao === filterProfissao);
    if (filterRole !== 'all') out = out.filter(f => f.role === filterRole);
    const sorted = [...out];
    sorted.sort((a, b) => {
      switch (sortBy) {
        case 'nome_desc': return b.nome.localeCompare(a.nome);
        case 'profissao': return (a.profissao || '').localeCompare(b.profissao || '');
        case 'unidade': {
          const un = (id: string) => unidades.find(u => u.id === id)?.nome || '';
          return un(a.unidade_id).localeCompare(un(b.unidade_id));
        }
        case 'data_cadastro': return (b.criado_em || '').localeCompare(a.criado_em || '');
        case 'nome_asc':
        default: return a.nome.localeCompare(b.nome);
      }
    });
    return sorted;
  };

  const ativosList = useMemo(() => scopedFuncionarios.filter(f => f.ativo !== false), [scopedFuncionarios]);
  const inativosList = useMemo(() => scopedFuncionarios.filter(f => f.ativo === false), [scopedFuncionarios]);
  const filteredAtivos = useMemo(() => applyFilters(ativosList), [ativosList, searchTerm, filterUnidade, filterProfissao, filterRole, sortBy, unidades]);
  const filteredInativos = useMemo(() => applyFilters(inativosList), [inativosList, searchTerm, filterUnidade, filterProfissao, filterRole, sortBy, unidades]);

  const clearFilters = () => {
    setSearchTerm(''); setFilterUnidade('all'); setFilterProfissao('all'); setFilterRole('all'); setSortBy('nome_asc');
  };
  const hasActiveFilters = !!searchTerm || filterUnidade !== 'all' || filterProfissao !== 'all' || filterRole !== 'all';

  return (
    <div className="space-y-4 animate-fade-in">
      <PageHeader title="Funcionários" subtitle="Cadastro de funcionários internos e profissionais externos" />

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="w-full">
          <TabsTrigger value="internos" className="flex-1">
            Funcionários Internos <span className="ml-2 text-xs opacity-70">({ativosList.length})</span>
          </TabsTrigger>
          <TabsTrigger value="externos" className="flex-1"><UserCog className="w-4 h-4 mr-1" />Profissionais Externos</TabsTrigger>
          <TabsTrigger value="inativos" className="flex-1">
            Inativos <span className="ml-2 text-xs opacity-70">({inativosList.length})</span>
          </TabsTrigger>
        </TabsList>

        <TabsContent value="internos" className="mt-4 space-y-4">
          <div className="flex flex-col lg:flex-row items-stretch lg:items-center justify-between gap-3">
            <div className="relative w-full lg:w-72">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input placeholder="Buscar por nome, e-mail, CPF..." value={searchTerm} onChange={e => setSearchTerm(e.target.value)} className="pl-9" />
            </div>
            {canManage && (
              <Button onClick={openNew} className="gradient-primary text-primary-foreground"><Plus className="w-4 h-4 mr-2" />Novo Funcionário</Button>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Select value={filterUnidade} onValueChange={setFilterUnidade}>
              <SelectTrigger className="w-[180px]"><SelectValue placeholder="Unidade" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todas as unidades</SelectItem>
                {unidadesVisiveis.map(u => <SelectItem key={u.id} value={u.id}>{u.nome}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={filterProfissao} onValueChange={setFilterProfissao}>
              <SelectTrigger className="w-[180px]"><SelectValue placeholder="Profissão" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todas as profissões</SelectItem>
                {profissoesDisponiveis.map(p => <SelectItem key={p} value={p}>{p}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={filterRole} onValueChange={setFilterRole}>
              <SelectTrigger className="w-[170px]"><SelectValue placeholder="Perfil" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos os perfis</SelectItem>
                {Object.entries(roleLabels).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={sortBy} onValueChange={setSortBy}>
              <SelectTrigger className="w-[180px]"><SelectValue placeholder="Ordenar" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="nome_asc">Nome (A-Z)</SelectItem>
                <SelectItem value="nome_desc">Nome (Z-A)</SelectItem>
                <SelectItem value="profissao">Profissão</SelectItem>
                <SelectItem value="unidade">Unidade</SelectItem>
                <SelectItem value="data_cadastro">Mais recentes</SelectItem>
              </SelectContent>
            </Select>
            {hasActiveFilters && (
              <Button variant="ghost" size="sm" onClick={clearFilters}><X className="w-4 h-4 mr-1" />Limpar filtros</Button>
            )}
            <span className="text-xs text-muted-foreground ml-auto">{filteredAtivos.length} funcionário(s) encontrado(s)</span>
          </div>

          <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
            <DialogContent className="max-w-lg p-0 overflow-hidden">
              <div className="modal-shell">
                <DialogHeader className="px-4 sm:px-6 pt-5 pb-3 border-b shrink-0"><DialogTitle className="font-display pr-6">{editId ? 'Editar' : 'Cadastrar'} Funcionário</DialogTitle></DialogHeader>
                <div className="modal-body px-4 sm:px-6 py-4 space-y-3">
                <div><Label>Nome *</Label><Input value={form.nome} onChange={e => setForm(p => ({ ...p, nome: e.target.value }))} /></div>
                <div className="grid grid-cols-2 gap-3">
                  <div><Label>Usuário *</Label><Input value={form.usuario} onChange={e => setForm(p => ({ ...p, usuario: e.target.value }))} /></div>
                  <div>
                    <Label>{editId ? 'Nova Senha (opcional)' : 'Senha *'}</Label>
                    <div className="relative">
                      <Input type={showSenha ? 'text' : 'password'} value={form.senha} onChange={e => setForm(p => ({ ...p, senha: e.target.value }))} className="pr-10" placeholder="Min. 6 caracteres (a-z, A-Z, 0-9)" />
                      <button type="button" onClick={() => setShowSenha(!showSenha)} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
                        {showSenha ? <EyeOff size={16} /> : <Eye size={16} />}
                      </button>
                    </div>
                    {form.senha && (form.senha.length < 6 || !/[a-z]/.test(form.senha) || !/[A-Z]/.test(form.senha) || !/[0-9]/.test(form.senha)) && (
                      <p className="text-xs text-destructive mt-1">A senha deve ter min. 6 caracteres com letras minúsculas, maiúsculas e números.</p>
                    )}
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div><Label>E-mail *</Label><Input type="email" value={form.email} onChange={e => setForm(p => ({ ...p, email: e.target.value }))} /></div>
                  <div><Label>CPF</Label><Input value={form.cpf} onChange={e => setForm(p => ({ ...p, cpf: e.target.value }))} placeholder="000.000.000-00" /></div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div><Label>Cargo</Label><Input value={form.cargo} onChange={e => setForm(p => ({ ...p, cargo: e.target.value }))} /></div>
                  <div><Label>Perfil do Usuário *</Label>
                    <Select value={form.role} onValueChange={v => setForm(p => ({ ...p, role: v as UserRole }))}>
                      <SelectTrigger><SelectValue placeholder="Selecione o perfil" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="master">MASTER</SelectItem>
                        <SelectItem value="gestao">GESTÃO</SelectItem>
                        <SelectItem value="recepcao">RECEPÇÃO</SelectItem>
                        <SelectItem value="tecnico">TRIAGEM</SelectItem>
                        <SelectItem value="enfermagem">ENFERMAGEM</SelectItem>
                        <SelectItem value="profissional">PROFISSIONAL</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div><Label>Setor</Label><Input value={form.setor} onChange={e => setForm(p => ({ ...p, setor: e.target.value }))} /></div>
                  <div><Label>Unidade {isUnitMaster ? '(fixada)' : ''}</Label>
                    <Select value={form.unidade_id} onValueChange={v => setForm(p => ({ ...p, unidade_id: v }))} disabled={isUnitMaster}>
                      <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                      <SelectContent>{unidadesVisiveis.map(u => <SelectItem key={u.id} value={u.id}>{u.nome}</SelectItem>)}</SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label>Sala</Label>
                    <Select value={form.sala_id || '__none__'} onValueChange={v => setForm(p => ({ ...p, sala_id: v === '__none__' ? '' : v }))}>
                      <SelectTrigger><SelectValue placeholder="Todas" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="__none__">Todas</SelectItem>
                        {salas.filter(s => !form.unidade_id || s.unidadeId === form.unidade_id).map(s => (
                          <SelectItem key={s.id} value={s.id}>{s.nome}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  {form.role === 'profissional' && (
                    <div>
                      <Label>Tempo de Atendimento</Label>
                      <Select value={String(form.tempo_atendimento)} onValueChange={v => setForm(p => ({ ...p, tempo_atendimento: Number(v) }))}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="15">15 minutos</SelectItem>
                          <SelectItem value="20">20 minutos</SelectItem>
                          <SelectItem value="30">30 minutos</SelectItem>
                          <SelectItem value="45">45 minutos</SelectItem>
                          <SelectItem value="60">60 minutos</SelectItem>
                          <SelectItem value="90">90 minutos</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  )}
                </div>
                {(form.role === 'profissional' || form.role === 'tecnico' || form.role === 'enfermagem') && (
                  <>
                    <div className="border-t pt-3 mt-2">
                      <p className="text-sm font-semibold text-foreground mb-2">Conselho Profissional</p>
                    </div>
                    <div>
                      <Label>CBO (Classificação Brasileira de Ocupações) *</Label>
                      <CboAutocomplete
                        value={cbo}
                        onChange={(v) => { setCbo(v); if (v) setShowCboError(false); }}
                        profissaoSugestao={form.profissao || form.cargo}
                        required
                        showError={showCboError}
                      />
                      <p className="text-[11px] text-muted-foreground mt-1">
                        Obrigatório para geração do BPA-I (SIA/SUS).
                      </p>
                    </div>
                    <div>
                      <Label>CNS (Cartão Nacional de Saúde)</Label>
                      <Input
                        value={form.cns}
                        onChange={e => setForm(p => ({ ...p, cns: formatCNS(e.target.value) }))}
                        placeholder="000 0000 0000 0000"
                        maxLength={18}
                        inputMode="numeric"
                      />
                      <p className="text-[11px] text-muted-foreground mt-1">
                        15 dígitos. Obrigatório no BPA-I para identificar o profissional executante.
                      </p>
                    </div>
                    {(form.role === 'tecnico' || form.role === 'enfermagem') && (
                      <div>
                        <Label>COREN</Label>
                        <Input value={(form as any).coren || ''} onChange={e => setForm(p => ({ ...p, coren: e.target.value } as any))} placeholder="Nº do COREN" />
                      </div>
                    )}
                    {form.role === 'profissional' && (
                      <>
                        <div className="grid grid-cols-2 gap-3">
                          <div>
                            <Label>Profissão</Label>
                            <Select value={form.profissao || '__none__'} onValueChange={v => {
                              const prof = v === '__none__' ? '' : v;
                              const conselho = conselhoMap[prof] || '';
                              setForm(p => ({ ...p, profissao: prof, tipo_conselho: conselho || p.tipo_conselho }));
                            }}>
                              <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                              <SelectContent>
                                <SelectItem value="__none__">Selecione</SelectItem>
                                {Object.keys(conselhoMap).map(p => (
                                  <SelectItem key={p} value={p}>{p}</SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>
                          <div>
                            <Label>Tipo de Conselho</Label>
                            <Input value={form.tipo_conselho} onChange={e => setForm(p => ({ ...p, tipo_conselho: e.target.value }))} placeholder="CRM, COREN..." />
                          </div>
                        </div>
                        <div className="grid grid-cols-2 gap-3">
                          <div>
                            <Label>Nº do Conselho</Label>
                            <Input value={form.numero_conselho} onChange={e => setForm(p => ({ ...p, numero_conselho: e.target.value }))} placeholder="000000" />
                          </div>
                          <div>
                            <Label>UF do Conselho</Label>
                            <Select value={form.uf_conselho || '__none__'} onValueChange={v => setForm(p => ({ ...p, uf_conselho: v === '__none__' ? '' : v }))}>
                              <SelectTrigger><SelectValue placeholder="UF" /></SelectTrigger>
                              <SelectContent>
                                <SelectItem value="__none__">—</SelectItem>
                                {['AC','AL','AP','AM','BA','CE','DF','ES','GO','MA','MT','MS','MG','PA','PB','PR','PE','PI','RJ','RN','RS','RO','RR','SC','SP','SE','TO'].map(uf => (
                                  <SelectItem key={uf} value={uf}>{uf}</SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>
                        </div>
                      </>
                    )}
                  </>
                )}
                {form.role === 'profissional' && canManage && (
                  <div className="border-t pt-3 mt-2">
                    <div className="flex items-center justify-between">
                      <div className="space-y-0.5">
                        <Label className="text-sm font-semibold">Permissão de Retorno</Label>
                        <p className="text-xs text-muted-foreground">Permitir que este profissional agende retorno de paciente</p>
                      </div>
                      <Switch
                        checked={form.pode_agendar_retorno}
                        onCheckedChange={v => setForm(p => ({ ...p, pode_agendar_retorno: v }))}
                      />
                    </div>
                  </div>
                )}
                <div className="border-t pt-3 mt-2">
                  <p className="text-sm font-semibold text-foreground mb-2">Vínculo & Configurações Internas</p>
                </div>
                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <Label className="text-sm font-semibold">Status</Label>
                    <p className="text-xs text-muted-foreground">{form.ativo ? 'Ativo' : 'Inativo'}</p>
                  </div>
                  <Switch checked={form.ativo} onCheckedChange={v => setForm(p => ({ ...p, ativo: v }))} />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label>Data de Admissão</Label>
                    <Input type="date" value={form.data_admissao} onChange={e => setForm(p => ({ ...p, data_admissao: e.target.value }))} />
                  </div>
                  <div>
                    <Label>Tipo de Vínculo</Label>
                    <Select value={form.tipo_vinculo || '__none__'} onValueChange={v => setForm(p => ({ ...p, tipo_vinculo: v === '__none__' ? '' : v }))}>
                      <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="__none__">—</SelectItem>
                        <SelectItem value="CLT">CLT</SelectItem>
                        <SelectItem value="Estatutário">Estatutário</SelectItem>
                        <SelectItem value="Temporário">Temporário</SelectItem>
                        <SelectItem value="Terceirizado">Terceirizado</SelectItem>
                        <SelectItem value="Cooperado">Cooperado</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label>Setor Principal</Label>
                    <Input value={form.setor_principal} onChange={e => setForm(p => ({ ...p, setor_principal: e.target.value }))} placeholder="Ex.: Clínica, Triagem" />
                  </div>
                  <div>
                    <Label>Turno de Trabalho</Label>
                    <Select value={form.turno_trabalho || '__none__'} onValueChange={v => setForm(p => ({ ...p, turno_trabalho: v === '__none__' ? '' : v }))}>
                      <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="__none__">—</SelectItem>
                        <SelectItem value="Manhã">Manhã</SelectItem>
                        <SelectItem value="Tarde">Tarde</SelectItem>
                        <SelectItem value="Noite">Noite</SelectItem>
                        <SelectItem value="Integral">Integral</SelectItem>
                        <SelectItem value="Plantão 12x36">Plantão 12x36</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div>
                  <Label>Observações Internas</Label>
                  <Textarea value={form.observacoes_internas} onChange={e => setForm(p => ({ ...p, observacoes_internas: e.target.value }))} rows={2} placeholder="Notas administrativas (uso interno)" />
                </div>
                {customConfig.fields.length > 0 && (
                  <CustomFieldsRenderer
                    fields={customConfig.fields}
                    values={customData}
                    onChange={(field, value) => setCustomData(prev => ({ ...prev, [field]: value }))}
                  />
                )}
                </div>
                <div className="modal-footer px-4 sm:px-6">
                  <Button onClick={handleSave} disabled={saving} className="w-full gradient-primary text-primary-foreground">
                    {saving && <Loader2 className="w-4 h-4 animate-spin mr-2" />}
                    {editId ? 'Salvar' : 'Cadastrar'}
                  </Button>
                </div>
              </div>
            </DialogContent>
          </Dialog>

          {loading ? (
            <LoadingState label="Carregando funcionários..." size="lg" />
          ) : filteredAtivos.length === 0 ? (
            <EmptyState
              icon={<Users className="w-8 h-8 text-muted-foreground/50" />}
              title="Nenhum funcionário"
              description={hasActiveFilters ? 'Nenhum resultado com os filtros aplicados.' : 'Clique em "Novo Funcionário" para começar.'}
            />
          ) : (
            <FuncionarioList
              items={filteredAtivos}
              unidades={unidades}
              canManage={canManage}
              isUnitMaster={isUnitMaster}
              currentUserUnitId={user?.unidadeId}
              isProtectedGlobalMaster={isProtectedGlobalMaster}
              onView={setViewFuncionario}
              onEdit={openEdit}
              onDelete={handleDelete}
            />
          )}
        </TabsContent>

        <TabsContent value="externos" className="mt-4">
          <ProfissionaisExternos />
        </TabsContent>

        <TabsContent value="inativos" className="mt-4 space-y-4">
          {loading ? (
            <LoadingState label="Carregando..." size="lg" />
          ) : filteredInativos.length === 0 ? (
            <EmptyState
              icon={<Users className="w-8 h-8 text-muted-foreground/50" />}
              title="Nenhum funcionário inativo"
              description="Funcionários desativados aparecerão aqui."
            />
          ) : (
            <div className="space-y-2">
              <p className="text-xs text-muted-foreground">{filteredInativos.length} inativo(s) — clique em reativar para retornar ao quadro.</p>
              <FuncionarioList
                items={filteredInativos}
                unidades={unidades}
                canManage={canManage}
                isUnitMaster={isUnitMaster}
                currentUserUnitId={user?.unidadeId}
                isProtectedGlobalMaster={isProtectedGlobalMaster}
                onView={setViewFuncionario}
                onEdit={openEdit}
                onDelete={handleDelete}
                inactive
                onReactivate={handleToggleAtivo}
              />
            </div>
          )}
        </TabsContent>
      </Tabs>

      {/* Profile drawer */}
      <Sheet open={!!viewFuncionario} onOpenChange={(o) => !o && setViewFuncionario(null)}>
        <SheetContent side="right" className="p-0 flex flex-col" style={{ width: '95vw', maxWidth: 480 }}>
          <SheetHeader className="p-4 pb-2 border-b">
            <SheetTitle className="font-display text-lg break-words pr-8">{viewFuncionario?.nome}</SheetTitle>
            <SheetDescription className="sr-only">Perfil do funcionário</SheetDescription>
          </SheetHeader>
          {viewFuncionario && (
            <ScrollArea className="flex-1">
              <div className="p-4 space-y-5">
                <ProfilePanel f={viewFuncionario} unidadeNome={unidades.find(u => u.id === viewFuncionario.unidade_id)?.nome || '—'} />
              </div>
            </ScrollArea>
          )}
          {viewFuncionario && canManage && !(isUnitMaster && isProtectedGlobalMaster(viewFuncionario)) && (
            <div className="border-t p-3 flex flex-wrap gap-2 justify-end">
              <Button variant="outline" size="sm" onClick={() => handlePrintFuncionario(viewFuncionario)}><Printer className="w-4 h-4 mr-1" />Imprimir</Button>
              <Button variant="outline" size="sm" onClick={() => handleToggleAtivo(viewFuncionario)}>
                {viewFuncionario.ativo ? <><Power className="w-4 h-4 mr-1" />Desativar</> : <><RotateCcw className="w-4 h-4 mr-1" />Reativar</>}
              </Button>
              <Button size="sm" className="gradient-primary text-primary-foreground" onClick={() => { const f = viewFuncionario; setViewFuncionario(null); openEdit(f); }}>
                <Pencil className="w-4 h-4 mr-1" />Editar
              </Button>
            </div>
          )}
        </SheetContent>
      </Sheet>
    </div>
  );
};

// ------- Reusable list & profile components -------

interface FuncionarioListProps {
  items: FuncionarioDB[];
  unidades: Array<{ id: string; nome: string }>;
  canManage: boolean;
  isUnitMaster: boolean;
  currentUserUnitId?: string;
  isProtectedGlobalMaster: (f: FuncionarioDB) => boolean;
  onView: (f: FuncionarioDB) => void;
  onEdit: (f: FuncionarioDB) => void;
  onDelete: (id: string) => void;
  inactive?: boolean;
  onReactivate?: (f: FuncionarioDB) => void;
}

const FuncionarioList: React.FC<FuncionarioListProps> = ({ items, unidades, canManage, isUnitMaster, currentUserUnitId, isProtectedGlobalMaster, onView, onEdit, onDelete, inactive, onReactivate }) => (
  <div className="space-y-2">
    {items.map(f => {
      const unidadeNome = unidades.find(u => u.id === f.unidade_id)?.nome || '';
      const cd = (f.custom_data as any) || {};
      const canEditThis = !(isUnitMaster && f.unidade_id && f.unidade_id !== currentUserUnitId) && !(isUnitMaster && isProtectedGlobalMaster(f));
      return (
        <Card key={f.id} className="shadow-sm border hover:shadow-md transition-shadow">
          <CardContent className="p-3 sm:p-4 flex items-center gap-3">
            <div className="w-11 h-11 rounded-full gradient-primary flex items-center justify-center text-primary-foreground font-bold text-sm shrink-0">
              {f.nome.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase()}
            </div>
            <div className="flex-1 min-w-0 grid grid-cols-1 md:grid-cols-12 gap-x-3 gap-y-0.5 items-center">
              <div className="md:col-span-4 min-w-0">
                <p className="font-semibold text-foreground truncate">{f.nome}</p>
                <p className="text-xs text-muted-foreground truncate">
                  {f.profissao || f.cargo || '—'}
                  {f.tipo_conselho && f.numero_conselho ? ` • ${f.tipo_conselho} ${f.numero_conselho}${f.uf_conselho ? '/' + f.uf_conselho : ''}` : ''}
                  {cd.cbo_codigo ? ` • CBO ${cd.cbo_codigo}` : ''}
                </p>
              </div>
              <div className="md:col-span-3 min-w-0">
                <p className="text-xs text-muted-foreground truncate">{unidadeNome || '—'}{f.setor ? ` / ${f.setor}` : ''}</p>
              </div>
              <div className="md:col-span-2 min-w-0">
                <p className="text-xs text-muted-foreground truncate">
                  {f.role === 'profissional' && f.tempo_atendimento ? `${f.tempo_atendimento} min` : '—'}
                </p>
              </div>
              <div className="md:col-span-3 flex flex-wrap gap-1 items-center justify-start md:justify-end">
                <Badge className={`text-[10px] ${roleColors[f.role as UserRole] || 'bg-muted text-muted-foreground'}`}>
                  {roleLabels[f.role as UserRole] || f.role}
                </Badge>
                {f.role === 'profissional' && f.pode_agendar_retorno && (
                  <Badge variant="outline" className="text-[10px] border-success/50 text-success"><CalendarCheck className="w-3 h-3 mr-0.5" />Retorno</Badge>
                )}
                {!f.ativo && <Badge variant="outline" className="text-[10px]">Inativo</Badge>}
              </div>
            </div>
            <div className="flex items-center gap-0.5 shrink-0">
              <Button size="icon" variant="ghost" title="Ver perfil" onClick={() => onView(f)}><Eye className="w-4 h-4" /></Button>
              {canManage && canEditThis && !inactive && (
                <Button size="icon" variant="ghost" title="Editar" onClick={() => onEdit(f)}><Pencil className="w-4 h-4" /></Button>
              )}
              {inactive && canManage && canEditThis && onReactivate && (
                <Button size="sm" variant="outline" onClick={() => onReactivate(f)}><RotateCcw className="w-4 h-4 mr-1" />Reativar</Button>
              )}
              {canManage && canEditThis && !inactive && (
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button size="icon" variant="ghost" className="text-destructive" title="Excluir"><Trash2 className="w-4 h-4" /></Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>Excluir funcionário?</AlertDialogTitle>
                      <AlertDialogDescription>Tem certeza que deseja excluir {f.nome}? Esta ação não pode ser desfeita.</AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>Cancelar</AlertDialogCancel>
                      <AlertDialogAction onClick={() => onDelete(f.id)}>Excluir</AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              )}
            </div>
          </CardContent>
        </Card>
      );
    })}
  </div>
);

const Row: React.FC<{ label: string; value?: React.ReactNode }> = ({ label, value }) => (
  <div className="flex justify-between gap-3 py-1 border-b border-border/50 last:border-0">
    <span className="text-xs text-muted-foreground shrink-0">{label}</span>
    <span className="text-sm text-foreground text-right break-words">{value || '—'}</span>
  </div>
);

const ProfilePanel: React.FC<{ f: FuncionarioDB; unidadeNome: string }> = ({ f, unidadeNome }) => {
  const cd = (f.custom_data as any) || {};
  const dataCadastro = f.criado_em ? new Date(f.criado_em).toLocaleDateString('pt-BR') : '—';
  return (
    <>
      <section>
        <h3 className="text-xs font-semibold uppercase tracking-wide text-foreground mb-1">Dados Pessoais</h3>
        <Row label="Nome" value={f.nome} />
        <Row label="CPF" value={f.cpf} />
        <Row label="E-mail" value={f.email} />
        <Row label="Usuário" value={f.usuario} />
      </section>
      <section>
        <h3 className="text-xs font-semibold uppercase tracking-wide text-foreground mb-1">Dados Profissionais</h3>
        <Row label="Profissão" value={f.profissao} />
        <Row label="Cargo" value={f.cargo} />
        <Row label="Perfil" value={roleLabels[f.role] || f.role} />
        <Row label="Conselho" value={f.tipo_conselho ? `${f.tipo_conselho} ${f.numero_conselho || ''}${f.uf_conselho ? '/' + f.uf_conselho : ''}` : ''} />
        <Row label="CBO" value={cd.cbo_codigo ? `${cd.cbo_codigo} — ${cd.cbo_descricao || ''}` : ''} />
        <Row label="CNS" value={cd.cns ? formatCNS(cd.cns) : ''} />
        <Row label="Unidade" value={unidadeNome} />
        <Row label="Setor" value={f.setor} />
        <Row label="Tempo de Atendimento" value={f.role === 'profissional' && f.tempo_atendimento ? `${f.tempo_atendimento} min` : ''} />
      </section>
      <section>
        <h3 className="text-xs font-semibold uppercase tracking-wide text-foreground mb-1">Configurações</h3>
        <Row label="Status" value={<Badge variant="outline" className={f.ativo ? 'text-success border-success/50' : ''}>{f.ativo ? 'Ativo' : 'Inativo'}</Badge>} />
        <Row label="Tipo de Vínculo" value={cd.tipo_vinculo} />
        <Row label="Data de Admissão" value={cd.data_admissao ? new Date(cd.data_admissao + 'T12:00:00').toLocaleDateString('pt-BR') : ''} />
        <Row label="Turno" value={cd.turno_trabalho} />
        <Row label="Data de Cadastro" value={dataCadastro} />
        <Row label="Permissão de Retorno" value={f.pode_agendar_retorno ? 'Sim' : 'Não'} />
      </section>
      {cd.observacoes_internas && (
        <section>
          <h3 className="text-xs font-semibold uppercase tracking-wide text-foreground mb-1">Observações Internas</h3>
          <p className="text-sm text-foreground whitespace-pre-wrap">{cd.observacoes_internas}</p>
        </section>
      )}
    </>
  );
};

export default Funcionarios;
