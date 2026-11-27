import React, { useState, useEffect, useMemo, useRef } from 'react';
import { staffSearchText, staffDigits, reviewStaff, staffReviewLabels, buildCurrentStaffSchedules, type StaffReview } from '@/lib/staffDirectoryReview';
import { EmptyState, LoadingState } from '@/components/EmptyState';
import { Users, Stethoscope, UserMinus, ClipboardCheck, RefreshCw, ListFilter, ChevronDown, Building2, CalendarDays, ChevronRight } from 'lucide-react';
import { useOperacional } from '@/contexts/OperacionalContext';
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
import { Link } from 'react-router-dom';
import { openPrintDocument } from '@/lib/printLayout';
import { UnitScopeNavigator } from '@/components/operacional/UnitScopeNavigator';
import { useOperationalUnitScope } from '@/hooks/useOperationalUnitScope';
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
  const { unidades, salas, disponibilidades, refreshFuncionarios, logAction } = useOperacional();
  const { unidadesVisiveis, isGlobalMaster } = useUnidadeFilter();
  const { unitId: globalUnitId, setUnitId: setGlobalUnitId } = useOperationalUnitScope(unidadesVisiveis, isGlobalMaster);
  const { user, isUnitMaster } = useAuth();
  const { can } = usePermissions();
  const { resolved: customConfig } = useCustomFields('funcionario', user?.unidadeId);
  const [customData, setCustomData] = useState<Record<string, any>>({});
  const [funcionarios, setFuncionarios] = useState<FuncionarioDB[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError,setLoadError]=useState('');
  const [loadedScope,setLoadedScope]=useState('');
  const loadSequence=useRef(0);
  const writeBusy=useRef(false);
  const scopeKey=JSON.stringify([user?.id||'',user?.unidadeId||'',user?.role||'',isGlobalMaster]);
  const scopeRef=useRef(scopeKey); scopeRef.current=scopeKey;
  const [saving, setSaving] = useState(false);
  const [printing,setPrinting]=useState(false);
  const printBusy=useRef(false);
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
  const canManage = can('usuarios', 'can_view') && can('usuarios', 'can_edit');
  const canCreate = can('usuarios', 'can_view') && can('usuarios', 'can_create');
  const [searchTerm, setSearchTerm] = useState('');
  const [localFilterUnidade, setLocalFilterUnidade] = useState<string>('all');
  const filterUnidade = isGlobalMaster ? globalUnitId : localFilterUnidade;
  const setFilterUnidade = (unitId: string) => {
    if (isGlobalMaster) setGlobalUnitId(unitId);
    else setLocalFilterUnidade(unitId);
  };
  const [filterProfissao, setFilterProfissao] = useState<string>('all');
  const [filterRole, setFilterRole] = useState<string>('all');
  const [sortBy, setSortBy] = useState<string>('nome_asc');
  const [activeTab, setActiveTab] = useState<string>('internos');
  const [reviewFilter,setReviewFilter]=useState<'all'|'pending'|StaffReview>('all');
  const [filtersOpen,setFiltersOpen]=useState(false);
  const [viewFuncionario, setViewFuncionario] = useState<FuncionarioDB | null>(null);

  const loadFuncionarios = async () => {
    const seq=++loadSequence.current, scope=scopeKey;
    setLoading(true);setLoadError('');
    try {
      const { data, error } = await supabase.functions.invoke('manage-employee', {body:{action:'list'}});
      if(seq!==loadSequence.current||scopeRef.current!==scope)return;
      if(error||data?.error||!Array.isArray(data?.funcionarios))throw new Error(data?.error||'Não foi possível carregar a equipe.');
      setFuncionarios(data.funcionarios);
      setViewFuncionario(prev=>prev?data.funcionarios.find((f:FuncionarioDB)=>f.id===prev.id)||null:null);
      setLoadedScope(scope);
    } catch (err) {
      if(seq!==loadSequence.current||scopeRef.current!==scope)return;
      setLoadError(err instanceof Error?err.message:'Não foi possível carregar a equipe.');
    } finally {
      if(seq===loadSequence.current&&scopeRef.current===scope)setLoading(false);
    }
  };

  useEffect(() => {
    setFuncionarios([]);setLoadedScope('');setViewFuncionario(null);setDialogOpen(false);
    if(user?.id)void loadFuncionarios();
    return ()=>{loadSequence.current++;};
  }, [scopeKey]);

  useEffect(() => {
    // Check for ID in URL to automatically open edit modal
    const params = new URLSearchParams(window.location.search);
    const idFromUrl = params.get('id');
    
    if (idFromUrl && canManage && loadedScope===scopeKey && funcionarios.length > 0) {
      const target = funcionarios.find(f => f.id === idFromUrl);
      if (target) {
        openEdit(target);
        // Clean URL after opening
        window.history.replaceState({}, '', '/painel/funcionarios');
      }
    }
  }, [funcionarios,canManage,loadedScope,scopeKey]);

  const conselhoMap: Record<string, string> = {
    'Médico': 'CRM', 'Médica': 'CRM', 'Enfermeiro': 'COREN', 'Enfermeira': 'COREN',
    'Odontólogo': 'CRO', 'Odontóloga': 'CRO', 'Dentista': 'CRO',
    'Fisioterapeuta': 'CREFITO', 'Psicólogo': 'CRP', 'Psicóloga': 'CRP',
    'Assistente Social': 'CRESS', 'Nutricionista': 'CRN', 'Farmacêutico': 'CRF', 'Farmacêutica': 'CRF',
    'Fonoaudiólogo': 'CRFa', 'Fonoaudióloga': 'CRFa', 'Terapeuta Ocupacional': 'CREFITO',
    'Biomédico': 'CRBM', 'Biomédica': 'CRBM', 'Fisio': 'CREFITO',
  };

  const canEditEmployee=(f:FuncionarioDB)=>canManage && loadedScope===scopeKey && !loadError && (isGlobalMaster || (!!user?.unidadeId && f.unidade_id===user.unidadeId && !isProtectedGlobalMaster(f))) && (user?.role==='master'||f.role!=='master');
  const openEdit = (f: FuncionarioDB) => {
    if(!canEditEmployee(f)) {toast.error('Sem permissão para editar este funcionário.');return;}
    setShowSenha(false);
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
    if(!canCreate||loadedScope!==scopeKey||loadError)return;
    setShowSenha(false);
    setEditId(null);
    const defaultUnit = !isGlobalMaster ? (user?.unidadeId || '') : '';
    setForm({ nome: '', usuario: '', email: '', cpf: '', senha: '', setor: '', unidade_id: defaultUnit, sala_id: '', cargo: '', role: '' as UserRole, tempo_atendimento: 30, profissao: '', tipo_conselho: '', numero_conselho: '', uf_conselho: '', pode_agendar_retorno: false, coren: '', cns: '', ativo: true, data_admissao: '', tipo_vinculo: '', setor_principal: '', turno_trabalho: '', observacoes_internas: '' });
    setCbo(null);
    setShowCboError(false);
    setCustomData({});
    setDialogOpen(true);
  };

  // Roles that require CBO (clinical/triage staff that generate BPA-I records)
  const requiresCbo = (role: string) => role === 'profissional' || role === 'tecnico' || role === 'enfermagem';

  const handleSave = async () => {
    if(writeBusy.current||loading||loadError||loadedScope!==scopeKey)return;
    const target=editId?funcionarios.find(f=>f.id===editId):null;
    if(editId?(!target||!canEditEmployee(target)):!canCreate){toast.error('Sem permissão para salvar este cadastro.');return;}
    if(!isGlobalMaster&&(!user?.unidadeId||form.unidade_id!==user.unidadeId)){toast.error('Selecione sua unidade de lotação.');return;}
    if(target?.id===user?.id&&(form.ativo===false||form.role!==target.role||form.unidade_id!==target.unidade_id)){toast.error('Não é permitido desativar ou alterar o próprio perfil ou lotação.');return;}
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
    // Send only configured custom fields that were actually edited; preserve all other JSON keys server-side.
    const initialCustom=target?.custom_data||{};
    const reserved=new Set(['__proto__','constructor','prototype','cbo_codigo','cbo_descricao','cns','data_admissao','tipo_vinculo','setor_principal','turno_trabalho','observacoes_internas']);
    const customExtras=Object.fromEntries(customConfig.fields.filter(field=>field.ativo&&!reserved.has(field.nome)&&Object.prototype.hasOwnProperty.call(customData,field.nome)&&JSON.stringify(customData[field.nome])!==JSON.stringify(initialCustom[field.nome])).map(field=>[field.nome,customData[field.nome]]));
    const writeScope=scopeKey;
    writeBusy.current=true;
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
            ...customExtras,
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

        if (error || data?.error || data?.success!==true) {
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
            ...customExtras,
              data_admissao: form.data_admissao,
              tipo_vinculo: form.tipo_vinculo,
              setor_principal: form.setor_principal,
              turno_trabalho: form.turno_trabalho,
              observacoes_internas: form.observacoes_internas,
            },
          },
        });

        if (error || data?.error || data?.success!==true) {
          toast.error(data?.error || 'Erro ao cadastrar funcionário.');
          setSaving(false);
          return;
        }
        toast.success('Funcionário cadastrado com sucesso!');
      }

      if(scopeRef.current===writeScope){setDialogOpen(false);await loadFuncionarios();}
      // Also refresh DataContext so other pages see the new employee immediately
      await refreshFuncionarios();
    } catch (err) {
      toast.error('Erro ao salvar funcionário.');
    } finally {writeBusy.current=false;setSaving(false);}
  };

  /** Check if a given employee is the global master (protected from unit masters) */
  const isProtectedGlobalMaster = (f: FuncionarioDB) => f.usuario === 'admin.sms';

  /** Toggle ativo/inativo for an employee */
  const handleToggleAtivo = async (f: FuncionarioDB) => {
    if(writeBusy.current||loading||!canEditEmployee(f)||f.id===user?.id||isProtectedGlobalMaster(f)){toast.error('Não é permitido alterar o status deste funcionário.');return;}
    const writeScope=scopeKey;
    writeBusy.current=true;setSaving(true);
    try {
      const { data, error } = await supabase.functions.invoke('manage-employee', {
        body: { action: 'update', id: f.id, ativo: !f.ativo },
      });
      if (error || data?.error || data?.success!==true) {
        toast.error(data?.error || 'Erro ao atualizar status.');
        return;
      }
      toast.success(!f.ativo ? 'Funcionário ativado!' : 'Funcionário desativado!');
      if(scopeRef.current===writeScope){await loadFuncionarios();setViewFuncionario(prev => prev && prev.id === f.id ? { ...prev, ativo: !f.ativo } : prev);}
      await refreshFuncionarios();
    } catch {
      toast.error('Erro ao atualizar status.');
    } finally {writeBusy.current=false;setSaving(false);}
  };

  /** Print employee profile card */
  const handlePrintFuncionario = async (f: FuncionarioDB) => {
    if(!canEditEmployee(f)||printBusy.current)return;
    const escapeHtml=(value:unknown)=>String(value??'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]||char));
    const unidadeNome=unidades.find(u=>u.id===f.unidade_id)?.nome||'—';
    const cd=f.custom_data||{};
    const body=`<style>.staff-ficha{font-size:10pt;line-height:1.25}.staff-ficha h2{font-size:10pt;color:#163d53;margin:8px 0 3px;break-after:avoid}.staff-ficha table{width:100%;border-collapse:collapse;margin:0 0 6px}.staff-ficha td{font-size:10pt;padding:4px 6px;border:1px solid #d5e0e7;overflow-wrap:anywhere}.staff-ficha td:first-child{width:34%;font-weight:bold;background:#f2f7fa}.staff-ficha tr{break-inside:avoid}</style><div class="staff-ficha"><h2>Dados Pessoais</h2><table>
      <tr><td>Nome</td><td>${escapeHtml(f.nome)}</td></tr>
      <tr><td>CPF</td><td>${escapeHtml(f.cpf || '—')}</td></tr>
      <tr><td>E-mail</td><td>${escapeHtml(f.email || '—')}</td></tr>
      <tr><td>Usuário</td><td>${escapeHtml(f.usuario || '—')}</td></tr>
      </table>
      <h2>Dados Profissionais</h2><table>
      <tr><td>Profissão</td><td>${escapeHtml(f.profissao || '—')}</td></tr>
      <tr><td>Cargo</td><td>${escapeHtml(f.cargo || '—')}</td></tr>
      <tr><td>Perfil</td><td>${escapeHtml(roleLabels[f.role] || f.role)}</td></tr>
      <tr><td>Conselho</td><td>${escapeHtml(f.tipo_conselho || '')} ${escapeHtml(f.numero_conselho || '')} ${escapeHtml(f.uf_conselho ? '/' + f.uf_conselho : '')}</td></tr>
      <tr><td>CBO</td><td>${escapeHtml(cd.cbo_codigo || '—')} ${escapeHtml(cd.cbo_descricao || '')}</td></tr>
      <tr><td>CNS</td><td>${escapeHtml(cd.cns ? formatCNS(cd.cns) : '—')}</td></tr>
      <tr><td>Unidade</td><td>${escapeHtml(unidadeNome)}</td></tr>
      <tr><td>Setor</td><td>${escapeHtml(f.setor || '—')}</td></tr>
      <tr><td>Tempo de Atendimento</td><td>${escapeHtml(f.tempo_atendimento || '—')} min</td></tr>
      </table>
      <h2>Vínculo</h2><table>
      <tr><td>Status</td><td>${escapeHtml(f.ativo ? 'Ativo' : 'Inativo')}</td></tr>
      <tr><td>Tipo de Vínculo</td><td>${escapeHtml(cd.tipo_vinculo || '—')}</td></tr>
      <tr><td>Data de Admissão</td><td>${escapeHtml(cd.data_admissao || '—')}</td></tr>
      <tr><td>Turno</td><td>${escapeHtml(cd.turno_trabalho || '—')}</td></tr>
      <tr><td>Data de Cadastro</td><td>${escapeHtml(f.criado_em ? new Date(f.criado_em).toLocaleDateString('pt-BR') : '—')}</td></tr>
      </table>
      </div>`;
    printBusy.current=true;setPrinting(true);
    try {await openPrintDocument('Ficha do Funcionário',body,{Unidade:escapeHtml(unidadeNome),Finalidade:'Conferência administrativa · uso interno'});}
    catch{toast.error('Não foi possível preparar a ficha de impressão.');}
    finally{printBusy.current=false;setPrinting(false);}
  };

  /** Apply unit-scope and master protection (used by all tabs) */
  const scopedFuncionarios = useMemo(() => {
    let list = loadedScope===scopeKey&&!loadError&&can('usuarios','can_view')?funcionarios:[];
    if (user?.usuario !== 'admin.sms' && user?.unidadeId) {
      list = list.filter(f => f.unidade_id === user.unidadeId || !f.unidade_id);
    }
    if (isUnitMaster) {
      list = list.filter(f => !isProtectedGlobalMaster(f));
    }
    return list;
  }, [funcionarios, user, isUnitMaster,loadedScope,scopeKey,loadError,can]);

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
      const term = staffSearchText(searchTerm), digits=staffDigits(searchTerm);
      out = out.filter(f => [f.nome,f.email,f.usuario,f.profissao,f.cargo,f.setor,f.custom_data?.cbo_codigo].some(v=>staffSearchText(v).includes(term)) || (/^[\d.\-\s]+$/.test(searchTerm)&&!!digits&&staffDigits(f.cpf).includes(digits)));
    }
    if (filterUnidade !== 'all') out = out.filter(f => f.unidade_id === filterUnidade);
    if (filterProfissao !== 'all') out = out.filter(f => f.profissao === filterProfissao);
    if (filterRole !== 'all') out = out.filter(f => f.role === filterRole);
    if(reviewFilter!=='all')out=out.filter(f=>{const issues=reviewStaff(f);return reviewFilter==='pending'?issues.length>0:issues.includes(reviewFilter);});
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
  const filteredAtivos = useMemo(() => applyFilters(ativosList), [ativosList, searchTerm, filterUnidade, filterProfissao, filterRole, sortBy, unidades,reviewFilter]);
  const filteredInativos = useMemo(() => applyFilters(inativosList), [inativosList, searchTerm, filterUnidade, filterProfissao, filterRole, sortBy, unidades,reviewFilter]);

  const today=new Intl.DateTimeFormat('en-CA',{timeZone:'America/Santarem',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date()).reduce((a,p)=>({...a,[p.type]:p.value}),{} as Record<string,string>);
  const todayKey=[today.year,today.month,today.day].join('-');
  const attendanceUnits=useMemo(()=>buildCurrentStaffSchedules(disponibilidades,todayKey,new Set(unidadesVisiveis.map(u=>u.id))),[disponibilidades,todayKey,unidadesVisiveis]);
  const unitScope=(list:FuncionarioDB[])=>list.filter(f=>filterUnidade==='all'||f.unidade_id===filterUnidade);
  const scopedActive=unitScope(ativosList),scopedInactive=unitScope(inativosList);
  const pendingCount=scopedActive.filter(f=>reviewStaff(f).length>0).length;
  const dataReady=!loading&&!loadError&&loadedScope===scopeKey&&can('usuarios','can_view');
  const selectMetric=(tab:string,role='all',review:'all'|'pending'|StaffReview='all')=>{
    setActiveTab(tab);setSearchTerm('');setFilterProfissao('all');setFilterRole(role);setReviewFilter(review);
  };
  const metrics=[
    {label:'Funcionários ativos',value:scopedActive.length,Icon:Users,tone:'blue',run:()=>selectMetric('internos'),active:activeTab==='internos'&&filterRole==='all'&&reviewFilter==='all'},
    {label:'Perfil profissional',value:scopedActive.filter(f=>f.role==='profissional').length,Icon:Stethoscope,tone:'teal',run:()=>selectMetric('internos','profissional'),active:activeTab==='internos'&&filterRole==='profissional'&&reviewFilter==='all'},
    {label:'Inativos',value:scopedInactive.length,Icon:UserMinus,tone:'slate',run:()=>selectMetric('inativos'),active:activeTab==='inativos'&&reviewFilter==='all'},
    {label:'Conferência cadastral',value:pendingCount,Icon:ClipboardCheck,tone:'violet',run:()=>{selectMetric('internos','all','pending');setFiltersOpen(true);},active:activeTab==='internos'&&reviewFilter!=='all'},
  ];
  const staffByUnit = useMemo(() => {
    const groups = unidadesVisiveis.map(unit => ({
      id: unit.id,
      nome: unit.nome,
      staff: filteredAtivos.filter(member => member.unidade_id === unit.id),
    }));
    const withoutUnit = filteredAtivos.filter(member => !unidadesVisiveis.some(unit => unit.id === member.unidade_id));
    if (withoutUnit.length) groups.push({ id: '', nome: 'Sem unidade de lotação', staff: withoutUnit });
    return groups.filter(group => group.staff.length);
  }, [filteredAtivos, unidadesVisiveis]);

  const summaryUnits = isGlobalMaster
    ? unidadesVisiveis.filter(unit => filterUnidade === 'all' || unit.id === filterUnidade)
    : [];

  const clearFilters = () => {
    setSearchTerm(''); setFilterUnidade('all'); setFilterProfissao('all'); setFilterRole('all'); setSortBy('nome_asc');setReviewFilter('all');
  };
  const hasActiveFilters = !!searchTerm || filterUnidade !== 'all' || filterProfissao !== 'all' || filterRole !== 'all'||reviewFilter!=='all'||sortBy!=='nome_asc';

  const staffListProps = {
    unidades, canManage, isUnitMaster, currentUserUnitId: user?.unidadeId,
    isProtectedGlobalMaster, onView: setViewFuncionario, onEdit: openEdit,
    onDeactivate: handleToggleAtivo, currentUserId:user?.id, canEditEmployee, saving: saving||loading, attendanceUnits: isGlobalMaster ? attendanceUnits : undefined,
  };

  return (
    <div className="space-y-4 animate-fade-in">
      <header className="clinical-hub-hero flex flex-wrap items-center gap-3">
        <span className="clinical-patient-avatar flex items-center justify-center shrink-0"><Users className="w-5 h-5" aria-hidden="true"/></span>
        <div className="flex-1 min-w-[9rem]"><p className="clinical-hub-eyebrow">Gestão administrativa</p><h1 className="clinical-hub-name text-xl font-bold font-display">Funcionários</h1><p className="clinical-patient-sub text-xs mt-1">Gestão de equipes, vínculos e profissionais</p></div>
        <Button type="button" variant="outline" className="clinical-hub-new gap-2" disabled={loading||saving} onClick={()=>void loadFuncionarios()}><RefreshCw className="w-4 h-4"/>Atualizar equipe</Button>
        {canCreate&&dataReady&&<Button type="button" className="clinical-hub-new gap-2" disabled={saving} onClick={()=>{setActiveTab('internos');openNew();}}><Plus className="w-4 h-4"/>Novo Funcionário</Button>}
      </header>
      <section className="grid grid-cols-2 xl:grid-cols-4 gap-2" aria-label="Indicadores de funcionários na lotação selecionada">
        {metrics.map(({label,value,Icon,tone,run,active})=><button key={label} type="button" disabled={!dataReady} onClick={run} aria-pressed={active} className={`clinical-premium flex min-w-0 items-center gap-2 p-3 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60 ${active?'ring-1 ring-primary/60':''}`}><span className={'clinical-dock-icon clinical-tone-'+tone}><Icon className="w-4 h-4"/></span><span className="flex-1 min-w-0"><strong className="block text-xl tabular-nums">{dataReady?value:'—'}</strong><span className="block text-xs text-muted-foreground">{label}</span></span><ChevronRight className="w-4 h-4 shrink-0 text-muted-foreground" aria-hidden="true"/></button>)}
      </section>
      <p className="text-xs text-muted-foreground">Indicadores da lotação selecionada, antes dos filtros de busca. Conferência cadastral é informativa; não bloqueia profissionais.</p>

      {loadError&&activeTab!=='externos'&&<div role="alert" className="rounded-lg border border-destructive/40 bg-destructive/5 p-3 flex flex-wrap items-center gap-2 text-sm"><span className="flex-1 text-destructive">{loadError} Não foi possível confirmar os dados da equipe.</span><Button type="button" variant="outline" size="sm" onClick={()=>void loadFuncionarios()}>Tentar novamente</Button></div>}
      <Tabs value={activeTab} onValueChange={value=>selectMetric(value)}>
        <TabsList className="w-full h-auto flex-wrap gap-1 clinical-premium p-1">
          <TabsTrigger value="internos" className="flex-1">
            Funcionários Internos <span className="ml-2 text-xs opacity-70">({dataReady?scopedActive.length:'—'})</span>
          </TabsTrigger>
          <TabsTrigger value="externos" className="flex-1"><UserCog className="w-4 h-4 mr-1" />Profissionais Externos</TabsTrigger>
          <TabsTrigger value="inativos" className="flex-1">
            Inativos <span className="ml-2 text-xs opacity-70">({dataReady?scopedInactive.length:'—'})</span>
          </TabsTrigger>
        </TabsList>

        <TabsContent value="internos" className="mt-4 space-y-4">
          {isGlobalMaster && (
            <>
              <UnitScopeNavigator units={unidadesVisiveis} value={filterUnidade} onChange={setFilterUnidade} />
              {!loading && !loadError && (
                <div className="grid grid-cols-1 xl:grid-cols-2 gap-2" aria-label="Resumo da equipe por unidade">
                  {summaryUnits.map(unit => {
                    const assigned = ativosList.filter(member => member.unidade_id === unit.id);
                    const scheduled = ativosList.filter(member=>member.role==='profissional'&&attendanceUnits.get(member.id)?.has(unit.id));
                    return (
                      <Card key={unit.id} className="clinical-premium">
                        <CardContent className="p-3 space-y-2">
                          <div className="flex items-start justify-between gap-2">
                            <h2 className="font-semibold text-foreground flex items-center gap-2"><span className="clinical-dock-icon clinical-tone-blue"><Building2 className="w-4 h-4"/></span>{unit.nome}</h2>
                            <Badge variant="secondary">{assigned.length} na equipe</Badge>
                          </div>
                          <p className="text-sm text-muted-foreground">
                            {assigned.filter(member => member.role === 'profissional').length} profissionais · {assigned.filter(member => member.role === 'recepcao').length} recepção · {assigned.filter(member => ['enfermagem', 'tecnico'].includes(member.role)).length} enfermagem/triagem
                          </p>
                          <p className="text-xs text-muted-foreground">{scheduled.length} profissional(is) ativos com grade vigente carregada nesta unidade, inclusive de outra lotação. Não representa presença nem vagas livres.</p>
                          <div className="flex flex-wrap gap-2">
                            <Button size="sm" variant={filterUnidade === unit.id ? 'secondary' : 'outline'} onClick={() => setFilterUnidade(unit.id)}>{filterUnidade === unit.id ? 'Unidade selecionada' : 'Ver equipe'}</Button>
                            {can('unidades_salas','can_view')&&<Button size="sm" variant="outline" className="clinical-record-action" asChild><Link to={`/painel/unidades?unidade=${encodeURIComponent(unit.id)}`}>Ver salas</Link></Button>}
                            {can('disponibilidade','can_view')&&<Button size="sm" variant="outline" className="clinical-record-action" asChild><Link to={`/painel/disponibilidade?unidade=${encodeURIComponent(unit.id)}`}>Horários</Link></Button>}
                          </div>
                        </CardContent>
                      </Card>
                    );
                  })}
                </div>
              )}
            </>
          )}
          <div className="clinical-premium p-3 space-y-2"><div className="flex flex-col sm:flex-row gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input placeholder="Buscar nome, e-mail, CPF, profissão ou CBO..." value={searchTerm} onChange={e => setSearchTerm(e.target.value)} className="pl-9" />
            </div>
            <Button type="button" variant="outline" className="clinical-record-action gap-2" aria-expanded={filtersOpen} aria-controls="staff-filters" onClick={()=>setFiltersOpen(v=>!v)}><ListFilter className="w-4 h-4"/>Filtros<ChevronDown className={`w-4 h-4 transition-transform ${filtersOpen?'rotate-180':''}`}/></Button>
          </div>
          {filtersOpen&&<div id="staff-filters" className="clinical-inset rounded-lg border p-2 flex flex-wrap items-center gap-2">
            {!isGlobalMaster && (
              <Select value={filterUnidade} onValueChange={setFilterUnidade}>
                <SelectTrigger className="w-[180px]"><SelectValue placeholder="Unidade" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todas as unidades</SelectItem>
                  {unidadesVisiveis.map(u => <SelectItem key={u.id} value={u.id}>{u.nome}</SelectItem>)}
                </SelectContent>
              </Select>
            )}
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
            <Select value={reviewFilter} onValueChange={v=>setReviewFilter(v as typeof reviewFilter)}><SelectTrigger className="w-full sm:w-[235px]"><SelectValue placeholder="Conferência cadastral"/></SelectTrigger><SelectContent><SelectItem value="all">Todas as situações</SelectItem><SelectItem value="pending">Com pontos para conferência</SelectItem>{Object.entries(staffReviewLabels).map(([key,label])=><SelectItem key={key} value={key}>{label}</SelectItem>)}</SelectContent></Select>
          </div>}
          <div className="flex flex-wrap items-center gap-2">{hasActiveFilters&&<Button variant="ghost" size="sm" onClick={clearFilters}><X className="w-4 h-4 mr-1"/>Limpar filtros</Button>}{reviewFilter!=='all'&&<Badge variant="outline">{reviewFilter==='pending'?'Conferência cadastral':staffReviewLabels[reviewFilter]}</Badge>}<span className="text-xs text-muted-foreground ml-auto" role="status">{dataReady?filteredAtivos.length+' funcionário(s) encontrado(s)':'Consulta em atualização'}</span></div></div>



          {loading ? (
            <LoadingState label="Carregando funcionários..." size="lg" />
          ) : loadError ? null : filteredAtivos.length === 0 ? (
            <EmptyState
              icon={<Users className="w-8 h-8 text-muted-foreground/50" />}
              title="Nenhum funcionário"
              description={hasActiveFilters ? 'Nenhum resultado com os filtros aplicados.' : 'Clique em "Novo Funcionário" para começar.'}
            />
          ) : (
            isGlobalMaster && filterUnidade === 'all' ? (
              <div className="space-y-5">
                {staffByUnit.map(group => (
                  <section key={group.id || 'sem-unidade'} aria-label={`Equipe: ${group.nome}`} className="space-y-2">
                    <div className="flex flex-wrap items-center justify-between gap-2 border-b pb-2">
                      <h2 className="font-semibold text-foreground">{group.nome} <span className="text-sm font-normal text-muted-foreground">({group.staff.length})</span></h2>
                      {group.id && <Button size="sm" variant="ghost" onClick={() => setFilterUnidade(group.id)}>Ver somente esta unidade</Button>}
                    </div>
                    <FuncionarioList {...staffListProps} items={group.staff} />
                  </section>
                ))}
              </div>
            ) : <FuncionarioList {...staffListProps} items={filteredAtivos} />
          )}
        </TabsContent>

        <TabsContent value="externos" className="mt-4">
          <ProfissionaisExternos />
        </TabsContent>

        <TabsContent value="inativos" className="mt-4 space-y-4">{isGlobalMaster&&<UnitScopeNavigator units={unidadesVisiveis} value={filterUnidade} onChange={setFilterUnidade}/>}<div className="clinical-premium p-3 flex flex-wrap gap-2 items-center"><div className="relative flex-1 min-w-[12rem]"><Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground"/><Input className="pl-9" placeholder="Buscar funcionário inativo..." value={searchTerm} onChange={e=>setSearchTerm(e.target.value)}/></div>{hasActiveFilters&&<Button variant="outline" size="sm" className="clinical-record-action" onClick={clearFilters}>Limpar filtros</Button>}</div>
          {loading ? (
            <LoadingState label="Carregando..." size="lg" />
          ) : loadError ? null : filteredInativos.length === 0 ? (
            <EmptyState
              icon={<Users className="w-8 h-8 text-muted-foreground/50" />}
              title="Nenhum funcionário inativo"
              description="Funcionários desativados aparecerão aqui."
            />
          ) : (
            <div className="space-y-2">
              <p className="text-xs text-muted-foreground">{filteredInativos.length} inativo(s) — clique em reativar para retornar ao quadro.</p>
              <FuncionarioList
                {...staffListProps}
                items={filteredInativos}
                inactive
                onReactivate={handleToggleAtivo}
              />
            </div>
          )}
        </TabsContent>
      </Tabs>

          <Dialog open={dialogOpen && loadedScope===scopeKey && can('usuarios','can_view') && (editId?canManage:canCreate)} onOpenChange={open=>{if(!writeBusy.current)setDialogOpen(open);}}>
            <DialogContent className="w-[96vw] sm:max-w-3xl p-0 overflow-hidden">
              <div className="modal-shell">
                <DialogHeader className="clinical-hub-hero m-3 shrink-0 pr-10"><DialogTitle className="clinical-hub-name font-display">{editId ? 'Editar' : 'Cadastrar'} Funcionário</DialogTitle><p className="clinical-patient-sub text-xs">Identificação, acesso, atuação profissional e vínculo.</p></DialogHeader>
                <div className="modal-body px-4 sm:px-6 py-3 space-y-3">
                <div className="triage-section-title"><Users className="w-4 h-4"/>Identificação e acesso</div>
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
                        {user?.role==='master'&&<SelectItem value="master">MASTER</SelectItem>}
                        <SelectItem value="gestao">GESTÃO</SelectItem>
                        <SelectItem value="recepcao">RECEPÇÃO</SelectItem>
                        <SelectItem value="tecnico">TRIAGEM</SelectItem>
                        <SelectItem value="enfermagem">ENFERMAGEM</SelectItem>
                        <SelectItem value="profissional">PROFISSIONAL</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="triage-section-title"><Building2 className="w-4 h-4"/>Lotação e atendimento</div>
                <div className="grid grid-cols-2 gap-3">
                  <div><Label>Setor</Label><Input value={form.setor} onChange={e => setForm(p => ({ ...p, setor: e.target.value }))} /></div>
                  <div><Label>Unidade {isUnitMaster ? '(fixada)' : ''}</Label>
                    <Select value={form.unidade_id} onValueChange={v => setForm(p => ({ ...p, unidade_id: v }))} disabled={!isGlobalMaster}>
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
                    <div className="triage-section-title"><Stethoscope className="w-4 h-4"/>Dados profissionais e conselho</div>
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
                <div className="triage-section-title"><ClipboardCheck className="w-4 h-4"/>Vínculo e configurações internas</div>
                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <Label className="text-sm font-semibold">Status</Label>
                    <p className="text-xs text-muted-foreground">{form.ativo ? 'Ativo' : 'Inativo'}</p>
                  </div>
                  <Switch checked={form.ativo} disabled={!editId||editId===user?.id||form.usuario==='admin.sms'} onCheckedChange={v=>{if(v||window.confirm('Desativar este funcionário? Confira horários futuros. O histórico será mantido.'))setForm(p=>({...p,ativo:v}));}} />
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
                  <Button onClick={handleSave} disabled={saving||loading||!!loadError} className="w-full clinical-action-main gradient-primary text-primary-foreground">
                    {saving && <Loader2 className="w-4 h-4 animate-spin mr-2" />}
                    {editId ? 'Salvar' : 'Cadastrar'}
                  </Button>
                </div>
              </div>
            </DialogContent>
          </Dialog>

      {/* Profile drawer */}
      <Sheet open={!!viewFuncionario && dataReady} onOpenChange={(o) => !o && setViewFuncionario(null)}>
        <SheetContent side="right" className="p-0 flex flex-col" style={{ width: '95vw', maxWidth: 680 }}>
          <SheetHeader className="clinical-hub-hero m-3 pr-10">
            <SheetTitle className="clinical-hub-name font-display text-lg break-words">{viewFuncionario?.nome}</SheetTitle>
            <SheetDescription className="clinical-patient-sub text-xs">Central individual do funcionário</SheetDescription>
          </SheetHeader>
          {viewFuncionario && (
            <ScrollArea className="flex-1">
              <div className="p-4 space-y-5">
                <ProfilePanel key={viewFuncionario.id} f={viewFuncionario} unidadeNome={unidades.find(u => u.id === viewFuncionario.unidade_id)?.nome || '—'} scheduleUnits={[...(attendanceUnits.get(viewFuncionario.id)||[])].map(id=>unidadesVisiveis.find(u=>u.id===id)?.nome||'Unidade não identificada')} canSchedule={can('disponibilidade','can_view')}/>
              </div>
            </ScrollArea>
          )}
          {viewFuncionario && canEditEmployee(viewFuncionario) && (
            <div className="border-t p-3 flex flex-wrap gap-2 justify-end">
              <Button variant="outline" size="sm" disabled={printing||saving} onClick={() => void handlePrintFuncionario(viewFuncionario)}><Printer className="w-4 h-4 mr-1" />Imprimir</Button>
              <Button variant="outline" size="sm" disabled={saving||viewFuncionario.id===user?.id||isProtectedGlobalMaster(viewFuncionario)} onClick={() => {if(!viewFuncionario.ativo||window.confirm('Desativar este funcionário? Confira os horários futuros. O histórico será mantido.'))void handleToggleAtivo(viewFuncionario);}}>
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
  onDeactivate: (f: FuncionarioDB) => void;
  currentUserId?:string;
  canEditEmployee:(f:FuncionarioDB)=>boolean;
  saving:boolean;
  inactive?: boolean;
  onReactivate?: (f: FuncionarioDB) => void;
  attendanceUnits?: Map<string, Set<string>>;
}

const FuncionarioList: React.FC<FuncionarioListProps> = ({ items, unidades, canManage, isUnitMaster, currentUserUnitId, isProtectedGlobalMaster, onView, onEdit, onDeactivate, currentUserId, canEditEmployee,saving,inactive, onReactivate, attendanceUnits }) => (
  <div className="space-y-2">
    {items.map(f => {
      const unidadeNome = unidades.find(u => u.id === f.unidade_id)?.nome || '';
      const cd = (f.custom_data as any) || {};
      const canEditThis = canEditEmployee(f);
      const canChangeStatus=canEditThis&&f.id!==currentUserId&&!isProtectedGlobalMaster(f);
      return (
        <Card key={f.id} className="clinical-premium min-w-0">
          <CardContent className="p-3 flex flex-wrap sm:flex-nowrap items-start gap-3">
            <div className="clinical-patient-avatar treatment-avatar flex items-center justify-center shrink-0 font-bold">
              {f.nome.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase()}
            </div>
            <div className="flex-1 min-w-0 grid grid-cols-1 md:grid-cols-12 gap-x-3 gap-y-0.5 items-center">
              <div className="md:col-span-4 min-w-0">
                <button type="button" className="text-left font-semibold text-foreground hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring break-words" onClick={()=>onView(f)}>{f.nome}</button>
                <p className="text-xs text-muted-foreground break-words">
                  {f.profissao || f.cargo || '—'}
                  {f.tipo_conselho && f.numero_conselho ? ` • ${f.tipo_conselho} ${f.numero_conselho}${f.uf_conselho ? '/' + f.uf_conselho : ''}` : ''}
                  {cd.cbo_codigo ? ` • CBO ${cd.cbo_codigo}` : ''}
                </p>
              </div>
              <div className="md:col-span-3 min-w-0">
                <p className="text-xs text-muted-foreground break-words">{unidadeNome || '—'}{f.setor ? ` / ${f.setor}` : ''}</p>
                {f.role === 'profissional' && attendanceUnits && [...(attendanceUnits.get(f.id) || [])].some(unitId => unitId !== f.unidade_id) && (
                  <p className="text-xs text-primary" title="Unidades com grade vigente carregada">
                    Grade vigente também em: {[...(attendanceUnits.get(f.id) || [])].filter(unitId => unitId !== f.unidade_id).map(unitId => unidades.find(unit => unit.id === unitId)?.nome || 'Unidade não identificada').join(', ')}
                  </p>
                )}
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
                {!f.ativo && <Badge variant="outline" className="text-[10px]">Inativo</Badge>}{reviewStaff(f).length>0&&<Badge variant="outline" className="text-[10px]" title={reviewStaff(f).map(key=>staffReviewLabels[key]).join("; ")}>Conferir · {reviewStaff(f).length}</Badge>}
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-1 shrink-0">
              <Button size="icon" variant="outline" className="clinical-record-action" title="Ver perfil" aria-label="Ver perfil" onClick={() => onView(f)}><Eye className="w-4 h-4" /></Button>
              {canManage && canEditThis && !inactive && (
                <Button size="icon" variant="outline" className="clinical-record-action clinical-action-edit" title="Editar" aria-label="Editar" disabled={saving} onClick={() => onEdit(f)}><Pencil className="w-4 h-4" /></Button>
              )}
              {inactive && canManage && canChangeStatus && onReactivate && (
                <Button size="sm" variant="outline" disabled={saving} onClick={() => onReactivate(f)}><RotateCcw className="w-4 h-4 mr-1" />Reativar</Button>
              )}
              {canManage && canChangeStatus && !inactive && (
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button size="icon" variant="ghost" className="text-muted-foreground" disabled={saving} title="Desativar funcionário" aria-label="Desativar funcionário"><Power className="w-4 h-4" /></Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>Desativar funcionário?</AlertDialogTitle>
                      <AlertDialogDescription>Desativar {f.nome} impede novos acessos pelo cadastro ativo e mantém o histórico. Confira previamente os horários e atendimentos futuros. O funcionário poderá ser reativado.</AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>Cancelar</AlertDialogCancel>
                      <AlertDialogAction onClick={() => onDeactivate(f)}>Desativar</AlertDialogAction>
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

const ProfilePanel: React.FC<{ f: FuncionarioDB; unidadeNome: string; scheduleUnits:string[]; canSchedule:boolean }> = ({ f, unidadeNome,scheduleUnits,canSchedule }) => {
  const cd = (f.custom_data as any) || {};
  const dataCadastro = f.criado_em ? new Date(f.criado_em).toLocaleDateString('pt-BR') : '—';
  const [section,setSection]=useState('dados');
  const review=reviewStaff(f);
  return (
    <div className="clinical-hub space-y-3">
      <div className="clinical-premium p-3 flex flex-wrap items-center gap-3"><span className="clinical-dock-icon clinical-tone-teal"><UserCog className="w-4 h-4"/></span><div className="flex-1"><p className="font-semibold">{f.profissao||f.cargo||roleLabels[f.role]||f.role}</p><p className="text-xs text-muted-foreground">{unidadeNome}</p></div><Badge variant="outline">{f.ativo?'Ativo':'Inativo'}</Badge></div>
      <nav className="clinical-hub-tabs" aria-label="Seções do perfil">{[{id:'dados',label:'Dados',Icon:Users},{id:'vinculo',label:'Vínculo',Icon:Building2},{id:'horarios',label:'Horários',Icon:CalendarDays},{id:'acesso',label:'Acesso',Icon:UserCog}].map(({id,label,Icon})=><Button key={id} type="button" variant="ghost" className="clinical-hub-tab gap-1.5" aria-pressed={section===id} onClick={()=>setSection(id)}><Icon className="w-4 h-4"/>{label}</Button>)}</nav>
      {review.length>0&&<div className="clinical-inset rounded-lg border p-2 text-xs"><strong>Conferência cadastral (informativa)</strong><p>{review.map(k=>staffReviewLabels[k]).join(' · ')}</p></div>}
      {section==='dados'&&<><section className="clinical-premium p-3">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-foreground mb-1">Dados Pessoais</h3>
        <Row label="Nome" value={f.nome} />
        <Row label="CPF" value={f.cpf} />
        <Row label="E-mail" value={f.email} />
        <Row label="Usuário" value={f.usuario} />
      </section>
      <section className="clinical-premium p-3">
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
      </>}
      {section==='vinculo'&&<><section className="clinical-premium p-3">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-foreground mb-1">Vínculo e configurações</h3>
        <Row label="Status" value={<Badge variant="outline" className={f.ativo ? 'text-success border-success/50' : ''}>{f.ativo ? 'Ativo' : 'Inativo'}</Badge>} />
        <Row label="Tipo de Vínculo" value={cd.tipo_vinculo} />
        <Row label="Data de Admissão" value={cd.data_admissao ? new Date(cd.data_admissao + 'T12:00:00').toLocaleDateString('pt-BR') : ''} />
        <Row label="Turno" value={cd.turno_trabalho} />
        <Row label="Data de Cadastro" value={dataCadastro} />
        <Row label="Permissão de Retorno" value={f.pode_agendar_retorno ? 'Sim' : 'Não'} />
      </section>
      {cd.observacoes_internas && (
        <section className="clinical-premium p-3">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-foreground mb-1">Observações Internas</h3>
          <p className="text-sm text-foreground whitespace-pre-wrap">{cd.observacoes_internas}</p>
        </section>
      )}</>}
      {section==='horarios'&&<section className="clinical-premium p-3 space-y-2"><h3 className="font-semibold text-sm">Grade vigente carregada</h3><p className="text-xs text-muted-foreground">Não representa presença, vagas livres ou escala informativa. Consulte Disponibilidade para conferência completa.</p>{scheduleUnits.length?scheduleUnits.map(u=><Row key={u} label="Local" value={u}/>):<p className="text-sm text-muted-foreground">Nenhum horário vigente identificado nos dados carregados.</p>}{canSchedule&&<Button asChild variant="outline" className="clinical-record-action"><Link to="/painel/disponibilidade">Consultar disponibilidade</Link></Button>}</section>}
      {section==='acesso'&&<section className="clinical-premium p-3"><h3 className="font-semibold text-sm mb-2">Identificação do acesso</h3><Row label="Usuário" value={f.usuario}/><Row label="Perfil" value={roleLabels[f.role]||f.role}/><Row label="Vínculo de autenticação" value={f.auth_user_id?'Cadastrado':'Não informado'}/><Row label="Status cadastral" value={f.ativo?'Ativo':'Inativo'}/><p className="text-xs text-muted-foreground mt-2">A situação cadastral não comprova sessão ativa nem permissões efetivas.</p></section>}
    </div>
  );
};

export default Funcionarios;
