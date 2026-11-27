import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { usePermissions } from '@/contexts/PermissionsContext';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { 
  Search, Download, FileText, ChevronLeft, ChevronRight, 
  RefreshCw, Filter, X, Eye, BarChart3, User, 
  Info, Shield, History, Monitor, Database, UserCheck, Calendar
} from 'lucide-react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { toast } from 'sonner';
import { openPrintDocument } from '@/lib/printLayout';
import { auditService } from '@/services/auditService';
import { getAuditActorLabel } from '@/lib/auditActor';
import { auditScope, auditDeviceLabel, auditCsvCell, auditEscapeHtml, auditSafeText, isAuditSecret, redactAuditData, maskAuditIdentifier } from '@/lib/auditSecurity';
import { AUDIT_PAGE_SIZE, AUDIT_LOOKUP_LIMIT, AUDIT_RELATED_LIMIT, auditSearchTerm, auditLike, auditQuote, auditCpfVariants, auditActorCpfSearch, auditRelatedSearch, auditTextSearch, auditEntityRef, auditPageRange, auditLastPage, AuditReadCache, type AuditEntityKind } from '@/lib/auditDirectory';

async function sha256Hex(text: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('');
}
import { normalizeSexo } from '@/lib/utils/sexo-normalization';


interface LogEntry {
  id: string;
  acao: string;
  acao_legivel?: string;
  tipo_evento?: string;
  modulo: string;
  entidade: string;
  entidade_id: string;
  entidade_nome?: string;
  user_id: string;
  user_nome: string;
  origem?: string;
  role: string;
  unidade_id: string;
  unidade_nome?: string;
  paciente_id?: string;
  paciente_nome?: string;
  profissional_id?: string;
  profissional_nome?: string;
  agendamento_id?: string;
  prontuario_id?: string;
  documento_id?: string;
  status: string;
  error_message?: string;
  ip: string;
  navegador?: string;
  dispositivo?: string;
  sistema_operacional?: string;
  user_agent?: string;
  rota?: string;
  detalhes: Record<string, any>;
  before?: any;
  after?: any;
  changes?: Record<string, any>;
  campos_alterados?: string[];
  created_at: string;
}

function formatDispositivo(log: Partial<LogEntry>): string { return auditDeviceLabel(log); }

interface ResolvedEntity {
  tipo: "paciente" | "agendamento" | "prontuario" | "profissional" | "unidade" | "documento" | "cota" | "desconhecido";
  titulo: string;
  subtitulo?: string;
  detalhes?: Record<string, any>;
  idTecnico: string;
  carregando?: boolean;
}

interface EnrichedLog extends LogEntry {
  nome_entidade?: string;
  entidade_resolvida?: ResolvedEntity;
  detalhes_resolvidos?: {
    paciente?: string;
    profissional?: string;
    agendamento?: string;
    unidade?: string;
    [key: string]: any;
  };
}


const ITEMS_PER_PAGE = AUDIT_PAGE_SIZE;
// Keep fields needed for the existing list/export; full before/after/changes are fetched on demand.
const AUDIT_LIST_FIELDS = 'id,acao,acao_legivel,tipo_evento,modulo,entidade,entidade_id,user_id,user_nome,origem,role,unidade_id,unidade_nome,paciente_id,paciente_nome,profissional_id,profissional_nome,agendamento_id,prontuario_id,documento_id,status,error_message,ip,navegador,dispositivo,sistema_operacional,user_agent,rota,detalhes,campos_alterados,created_at';
const AUDIT_ENTITY_TABLES = {paciente:'pacientes',agendamento:'agendamentos',prontuario:'prontuarios',profissional:'funcionarios'} as const;
const AUDIT_ENTITY_FIELDS = {paciente:'id,nome,cpf,cns',agendamento:'id,data,hora,paciente_nome,profissional_nome',prontuario:'id,data_atendimento,paciente_nome,profissional_nome',profissional:'id,nome,profissao,cargo,cpf'} as const;
const AUDIT_DETAIL_FIELDS = {...AUDIT_ENTITY_FIELDS,paciente:'id,nome,cpf,cns,telefone,data_nascimento,sexo,unidade_id',agendamento:'id,data,hora,paciente_nome,profissional_nome,status,unidade_id'};
const recordedEntityName = (log:LogEntry,kind?:AuditEntityKind) => log.entidade_nome || (typeof log.detalhes?.entidade_nome==='string'?log.detalhes.entidade_nome:'') || ((kind==='paciente'||kind==='agendamento'||kind==='prontuario') ? log.paciente_nome : kind==='profissional' ? log.profissional_nome : '') || '';
const entityCacheKey = (kind:AuditEntityKind,id:string)=>JSON.stringify([kind,id]);
function currentEntity(kind:AuditEntityKind,row:any): ResolvedEntity {
  const date=(v:unknown)=>typeof v==='string' && Number.isFinite(Date.parse(v+'T12:00:00')) ? format(new Date(v+'T12:00:00'),'dd/MM/yyyy') : '';
  const titulo = (kind==='paciente'||kind==='profissional' ? row.nome : row.paciente_nome) || row.id;
  const subtitle=kind==='paciente' ? 'CPF: '+maskAuditIdentifier(row.cpf,'cpf')+' | CNS: '+maskAuditIdentifier(row.cns,'cns') :
    kind==='profissional' ? (row.profissao||row.cargo||'Funcionário')+' | CPF: '+maskAuditIdentifier(row.cpf,'cpf') :
    [row.profissional_nome,date(kind==='agendamento'?row.data:row.data_atendimento),kind==='agendamento'?row.hora:''].filter(Boolean).join(' · ');
  return {tipo:kind,titulo:auditSafeText(String(titulo)),subtitulo:'Cadastro atual: '+auditSafeText(subtitle),idTecnico:row.id};
}
function enrichAuditRow(log:EnrichedLog, current?:ResolvedEntity):EnrichedLog {
  const ref=auditEntityRef(log);
  const title=recordedEntityName(log,ref?.kind);
  const entity:ResolvedEntity={tipo:ref?.kind||'desconhecido',titulo:title||current?.titulo||log.entidade_id||log.entidade,idTecnico:log.entidade_id,
    subtitulo:current?.subtitulo,detalhes:current?.detalhes};
  if(!title && current?.titulo) entity.subtitulo='Cadastro atual (não histórico) · '+(current.subtitulo||'');
  const enriched={...log,entidade_resolvida:entity,nome_entidade:entity.titulo,detalhes_resolvidos:{paciente:entity.titulo,unidade:log.unidade_nome}};
  return {...enriched,human_summary:generateHumanSummary(enriched)} as EnrichedLog;
}

const moduloLabels: Record<string, string> = {
  '': 'Todos',
  pacientes: 'Pacientes',
  agendamento: 'Agendamentos',
  fila_espera: 'Fila de Espera',
  atendimento: 'Atendimento',
  prontuario: 'Prontuário',
  funcionarios: 'Funcionários',
  disponibilidade: 'Disponibilidade',
  bloqueio: 'Bloqueios',
  configuracoes: 'Configurações',
  notificacao: 'Notificações',
  integracao: 'Integrações',
  auth: 'Autenticação',
  relatorio: 'Relatórios',
  portal: 'Portal Paciente',
};

const formatAuditAction = (acao: string): string => {
  const customLabels: Record<string, string> = {
    // Pacientes
    edicao_paciente_pagina_pacientes: 'Edição de cadastro do paciente pela Página Pacientes',
    criacao_paciente: 'Cadastro de novo paciente',
    excluir_paciente: 'Exclusão de paciente',
    
    // Agendamentos
    novo_agendamento: 'Criação de novo agendamento',
    confirmar_chegada: 'Confirmação de chegada do paciente',
    agendar_sessao_tratamento: 'Agendamento de sessão de tratamento',
    desmarcar_sessao: 'Desmarcação de sessão',
    agendar_ciclo_completo: 'Agendamento de ciclo completo',
    status_change: 'Alteração de status de agendamento',
    
    // Atendimento / Prontuário
    iniciar_atendimento: 'Início de atendimento clínico',
    atendimento_iniciado: 'Atendimento iniciado',
    atendimento_finalizado: 'Atendimento finalizado',
    finalizar_atendimento: 'Finalização de atendimento',
    edicao_prontuario: 'Edição de prontuário',
    finalizar_prontuario: 'Finalização de prontuário',
    prontuario_visualizado: 'Visualização de prontuário',
    prontuario_criado: 'Criação de prontuário',
    prontuario_editado: 'Edição de prontuário',
    prontuario_exportado_pdf: 'Exportação de prontuário para PDF',
    
    // Autenticação
    login: 'Tentativa de login',
    login_sucesso: 'Login realizado com sucesso',
    login_falha: 'Falha na tentativa de login',
    logout: 'Saída do sistema (logout)',
    sessao_expirada: 'Sessão de usuário expirada',
    
    // Outros
    gerar_documento: 'Geração de documento oficial',
    baixar_pdf: 'Download de arquivo PDF',
    exportar: 'Exportação de dados',
    imprimir: 'Impressão de documento',
    vaga_liberada: 'Liberação de vaga na agenda',
    fila_chamada: 'Chamada de paciente da fila',
    fila_encaixe: 'Encaixe de paciente na fila',
  };

  if (customLabels[acao]) return customLabels[acao];

  // Fallback: transform snake_case to readable text
  return acao
    .split('_')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
};

const statusBadge: Record<string, string> = {
  sucesso: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-400',
  erro: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400',
  falha: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400',
  tentativa: 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400',
  pendente: 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400',
  bloqueado: 'bg-gray-100 text-gray-800 dark:bg-gray-900/30 dark:text-gray-400',
};

const acaoLabels: Record<string, string> = {
  criar: 'Criação',
  editar: 'Edição',
  excluir: 'Exclusão',
  cancelar: 'Cancelamento',
  login: 'Login',
  login_sucesso: 'Login Sucesso',
  login_falha: 'Login Falha',
  logout: 'Logout',
  sessao_expirada: 'Sessão Expirada',
  login_erro: 'Login (erro)',
  status_change: 'Alteração Status',
  confirmar_chegada: 'Confirmar Chegada',
  iniciar_atendimento: 'Iniciar Atendimento',
  atendimento_iniciado: 'Atendimento Iniciado',
  atendimento_finalizado: 'Atendimento Finalizado',
  finalizar_atendimento: 'Finalizar Atendimento',
  prontuario_visualizado: 'Prontuário Visualizado',
  prontuario_criado: 'Prontuário Criado',
  prontuario_editado: 'Prontuário Editado',
  prontuario_exportado_pdf: 'Prontuário Exportado PDF',
  paciente_chamado: 'Paciente Chamado',
  paciente_rechamado: 'Paciente Rechamado',
  vaga_liberada: 'Vaga Liberada',
  fila_chamada: 'Fila - Chamada',
  fila_encaixe: 'Fila - Encaixe',
  exportar: 'Exportação',
  imprimir: 'Impressão',
  envio_email: 'Envio E-mail',
  envio_webhook: 'Envio Webhook',
  portal_acesso: 'Acesso Portal',
  agendar_retorno: 'Agendar Retorno',
};

const eventoGrupos: Record<string, { label: string; acoes: string[] }> = {
  todos: { label: 'Todos', acoes: [] },
  autenticacao: { label: 'Autenticação', acoes: ['login', 'login_sucesso', 'login_falha', 'logout', 'sessao_expirada', 'login_erro'] },
  prontuario: { label: 'Prontuário', acoes: ['prontuario_visualizado', 'prontuario_criado', 'prontuario_editado', 'prontuario_exportado_pdf'] },
  atendimento: { label: 'Atendimento', acoes: ['atendimento_iniciado', 'atendimento_finalizado', 'iniciar_atendimento', 'finalizar_atendimento'] },
  chamada: { label: 'Chamada de Paciente', acoes: ['paciente_chamado', 'paciente_rechamado', 'fila_chamada'] },
};

const maskCpf = (cpf: string) => maskAuditIdentifier(cpf, 'cpf');

const formatAuditFieldLabel = (field: string): string => {
  const labels: Record<string, string> = {
    nome: "Nome",
    nome_completo: "Nome completo",
    nome_mae: "Nome da mãe",
    data_nascimento: "Data de nascimento",
    telefone_principal: "Telefone principal",
    telefone: "Telefone",
    telefone_secundario: "Telefone secundário",
    logradouro: "Logradouro",
    numero: "Número",
    bairro: "Bairro",
    municipio: "Município",
    uf: "UF",
    sexo: "Sexo",
    cpf: "CPF",
    cns: "CNS",
    unidade_id: "Unidade",
    profissional_id: "Profissional",
    paciente_id: "Paciente",
    status: "Status",
    data: "Data",
    hora: "Hora",
    email: "E-mail",
    endereco: "Endereço",
    cid: "CID",
    observacoes: "Observações",
    custom_data: "Dados customizados"
  };
  return labels[field] || field.split('_').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
};

const formatAuditValue = (field: string, value: any): string => {
  if (isAuditSecret(field)) return "********";
  if (value === null || value === undefined || value === "") return "Não informado";
  
  if (field === "sexo") {
    const s = normalizeSexo(value);
    if (s === "masculino") return "Masculino";
    if (s === "feminino") return "Feminino";
    return value;
  }

  if (field === "cpf") return maskCpf(String(value));
  if (/(?:^|[._])cpf(?:$|[._])/i.test(field)) return maskAuditIdentifier(value,'cpf');
  if (/(?:^|[._])cns(?:$|[._])/i.test(field)) return maskAuditIdentifier(value,'cns');
  if (typeof value === 'object') return JSON.stringify(redactAuditData(value,true,field));
  
  if (field === "data" || field === "data_nascimento" || field === "data_atendimento") {
    try {
      return format(new Date(value + 'T12:00:00'), "dd/MM/yyyy");
    } catch {
      return value;
    }
  }

  return auditSafeText(String(value));
};

const generateHumanSummary = (log: EnrichedLog) => {
  const user = getAuditActorLabel(log);
  const acao = log.acao_legivel || formatAuditAction(log.acao);
  const entidade = log.entidade_resolvida?.titulo || log.entidade_nome || log.entidade_id || log.entidade;
  const data = format(new Date(log.created_at), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR });
  const unidade = log.unidade_nome || 'unidade não identificada';

  if (log.tipo_evento === 'login') return `${user} realizou login no sistema em ${data}.`;
  
  const entityType = log.entidade === 'paciente' ? 'o cadastro do paciente' : 
                     log.entidade === 'agendamento' ? 'o agendamento de' : 
                     log.entidade === 'prontuario' ? 'o prontuário de' : log.entidade;

  if (log.tipo_evento === 'criacao') return `${user} cadastrou ${entityType} "${entidade}" na ${unidade} em ${data}.`;
  
  if (log.tipo_evento === 'edicao') {
    const changesCount = log.campos_alterados?.length ?? Object.keys(log.changes || {}).length;
    const campos = log.campos_alterados?.map(formatAuditFieldLabel).join(', ') || 
                   (log.changes ? Object.keys(log.changes).map(formatAuditFieldLabel).join(', ') : 'campos');
    
    if (!log.campos_alterados && !log.changes) return `${user} editou ${entityType} "${entidade}" na ${unidade} em ${data}.`;
    return `${user} editou ${entityType} "${entidade}", alterando ${changesCount} ${changesCount === 1 ? 'campo' : 'campos'} (${campos}), na ${unidade} em ${data}.`;
  }
  
  if (log.tipo_evento === 'exclusao') return `${user} removeu ${entityType} "${entidade}" na ${unidade} em ${data}.`;
  
  return `${user} realizou a ação "${acao}" em ${data}.`;
};


const Auditoria: React.FC = () => {
  const { user } = useAuth();
  const { can } = usePermissions();
  const scope = auditScope(user, can('logs_auditoria', 'can_view'));
  const canExport = !!user && (user.role === 'master' || can('logs_auditoria', 'can_execute'));
  if (!scope.allowed) return <div className="flex items-center justify-center h-64"><p className="text-muted-foreground">Você não tem permissão ou unidade autorizada para acessar esta página.</p></div>;
  return <AuditoriaContent key={JSON.stringify([user?.id,user?.authUserId,user?.role,scope.unit,scope.global,canExport])} unitId={scope.unit} canExport={canExport}/>;
};

const AuditoriaContent: React.FC<{unitId:string|null;canExport:boolean}> = ({unitId,canExport}) => {
  const { user } = useAuth();
  const active = useRef(false);
  const requestId = useRef(0);
  const exportLock = useRef(false);
  useEffect(()=>{active.current=true;return()=>{active.current=false;requestId.current++;};},[]);
  const unitFilter = useMemo<Record<string,string>>(()=>unitId ? {unidade_id:unitId} : {},[unitId]);
  const [directory,setDirectory] = useState<{key:string;rows:EnrichedLog[];count:number;warning:string;error:string}|null>(null);
  const [revision,setRevision] = useState(0);
  const [page, setPage] = useState(0);
  const [search, setSearch] = useState('');
  const [showFilters, setShowFilters] = useState(false);
  const [exportRequest, setExportRequest] = useState<'csv' | 'pdf' | 'report_csv' | 'report_pdf' | null>(null);
  const [exportMotivo, setExportMotivo] = useState('');
  const [exportBusy, setExportBusy] = useState(false);

  const registrarExportacao = async (formato: 'csv' | 'pdf', motivo: string, hash: string, protocolo: string, report = false) => {
    if (!active.current || !canExport || !user) throw Error('Exportação não autorizada.');
    await auditService.log({
      acao: 'exportar',
      acaoLegivel: `Solicitação de exportação de auditoria (${formato.toUpperCase()})`,
      tipoEvento: 'download',
      modulo: 'auditoria',
      entidade: 'action_logs',
      entidadeId: protocolo,
      user,
      detalhes: {
        motivo_exportacao: auditSafeText(motivo),
        formato,
        protocolo,
        sha256: hash,
        quantidade_registros: report ? reportData.length : logs.length,
        total_filtrado: report ? undefined : totalCount,
        abrangencia: report ? 'relatorio_profissionais_recorte_consultado' : 'pagina_atual',
        aviso_consulta: report ? undefined : searchWarning || undefined,
        filtros: report ? reportPeriod : { de: filterDateFrom, ate: filterDateTo, usuario:filterUser, perfil:filterRole, modulo:filterModulo, acao:filterAcao, status:filterStatus, unidade:filterUnidade, grupo:filterEventoGrupo, cpf_informado:!!filterCpf, busca_informada:!!search, pagina:page+1 },
      },
    }, {requireConfirmation:true});
    if (!active.current) throw Error('A sessão ou abrangência foi alterada.');
  };
  const [selectedLog, setSelectedLog] = useState<EnrichedLog | null>(null);
  const [detailState,setDetailState] = useState<{id:string;error:string}|null>(null);
  const [showReport, setShowReport] = useState(false);
  const [reportData, setReportData] = useState<any[]>([]);
  const [reportLoading, setReportLoading] = useState(false);
  const [reportPeriod,setReportPeriod] = useState({de:'',ate:''});


  const cacheRef = useRef(new AuditReadCache<ResolvedEntity>());
  const readEntity = useCallback(async (log:EnrichedLog,signal:AbortSignal) => {
    const ref=auditEntityRef(log);
    if(!ref) return enrichAuditRow(log);
    // Current details are read only on opening; never cache the full patient record.
    const {data,error}=await (supabase as any).from(AUDIT_ENTITY_TABLES[ref.kind]).select(AUDIT_DETAIL_FIELDS[ref.kind]).match(unitFilter).eq('id',ref.id).abortSignal(signal).maybeSingle();
    if(error) throw Error('Cadastro atual não confirmado.');
    if(!data) return enrichAuditRow(log);
    return enrichAuditRow(log,{...currentEntity(ref.kind,data),detalhes:redactAuditData(data)});
  },[unitFilter]);

  const enrichPage=useCallback(async (rows:EnrichedLog[],signal:AbortSignal) => {
    const groups=new Map<AuditEntityKind,Set<string>>();
    for(const log of rows) {
      const ref=auditEntityRef(log);
      if(!ref || recordedEntityName(log,ref.kind) || cacheRef.current.get(entityCacheKey(ref.kind,ref.id))) continue;
      const ids=groups.get(ref.kind)||new Set<string>(); ids.add(ref.id);groups.set(ref.kind,ids);
    }
    let unavailable=false;
    await Promise.all([...groups].map(async ([kind,ids])=>{
      try {
        const {data,error}=await (supabase as any).from(AUDIT_ENTITY_TABLES[kind]).select(AUDIT_ENTITY_FIELDS[kind]).match(unitFilter).in('id',[...ids]).abortSignal(signal);
        if(signal.aborted) return;
        if(error||!data){unavailable=true;return;}
        for(const row of data) cacheRef.current.set(entityCacheKey(kind,row.id),currentEntity(kind,row));
      } catch { if(!signal.aborted) unavailable=true; }
    }));
    return {rows:rows.map(log=>{
      const ref=auditEntityRef(log);
      return enrichAuditRow(log,ref&&!recordedEntityName(log,ref.kind)?cacheRef.current.get(entityCacheKey(ref.kind,ref.id)):undefined);
    }),unavailable};
  },[unitFilter]);

  const detailId=selectedLog?.id;
  useEffect(()=>{
    if(!detailId) return;
    const controller=new AbortController();
    setDetailState(null);
    void(async()=>{
      try {
        const {data,error}=await supabase.from('action_logs').select('*').eq('id',detailId).match(unitFilter).abortSignal(controller.signal).maybeSingle();
        if(controller.signal.aborted || !active.current) return;
        if(error||!data||data.id!==detailId) throw Error('Evento completo não confirmado.');
        const full=redactAuditData(data) as EnrichedLog;
        setSelectedLog(previous=>previous?.id===detailId?enrichAuditRow(full,previous.entidade_resolvida):previous);
        let warning='';
        try {
          const enriched=await readEntity(full,controller.signal);
          if(!controller.signal.aborted&&active.current) setSelectedLog(previous=>previous?.id===detailId?enriched:previous);
        } catch {warning='Cadastro atual não confirmado; os dados registrados no evento foram preservados.';}
        if(!controller.signal.aborted&&active.current)setDetailState({id:detailId,error:warning});
      } catch {if(!controller.signal.aborted&&active.current)setDetailState({id:detailId,error:'Não foi possível consultar o evento completo. Abra novamente para tentar.'});}
    })();
    return()=>controller.abort();
  },[detailId,readEntity,unitFilter]);

  // Filters
  const [filterDateFrom, setFilterDateFrom] = useState('');
  const [filterDateTo, setFilterDateTo] = useState('');
  const [filterUser, setFilterUser] = useState('');
  const [filterRole, setFilterRole] = useState('');
  const [filterModulo, setFilterModulo] = useState('');
  const [filterAcao, setFilterAcao] = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const [filterUnidade, setFilterUnidade] = useState('');
  const [filterCpf, setFilterCpf] = useState('');
  const [filterEventoGrupo, setFilterEventoGrupo] = useState('');


  const queryKey=JSON.stringify([page,revision,filterDateFrom,filterDateTo,filterUser,filterRole,filterModulo,filterAcao,filterStatus,filterUnidade,filterCpf,filterEventoGrupo,search]);
  const current=directory?.key===queryKey?directory:null;
  const logs=current?.rows??[];
  const totalCount=current?.count??0;
  const loading=!current;
  const queryError=current?.error||'';
  const searchWarning=current?.warning||'';

  useEffect(()=>{
    const controller=new AbortController();
    const seq=++requestId.current;
    const valid=()=>active.current&&!controller.signal.aborted&&seq===requestId.current;
    const timer=setTimeout(async()=>{
      if(!valid())return;
      const warnings:string[]=[];
      try {
        const term=auditSearchTerm(search);
        const cpfVariants=auditCpfVariants(filterCpf.trim());
        if(filterCpf.trim()&&!cpfVariants.length) throw Error('Informe o CPF completo do funcionário (11 dígitos).');
        if(search.trim()&&!term) throw Error('Informe um termo de pesquisa válido.');
        if(filterDateFrom&&filterDateTo&&filterDateFrom>filterDateTo) throw Error('A data inicial deve ser anterior ou igual à final.');
        let q=supabase.from('action_logs').select(AUDIT_LIST_FIELDS,{count:'exact'}).order('created_at',{ascending:false}).order('id',{ascending:false});
        if(filterDateFrom) q=q.gte('created_at',filterDateFrom+'T00:00:00');
        if(filterDateTo) q=q.lte('created_at',filterDateTo+'T23:59:59');
        const actorTerm=auditSearchTerm(filterUser);
        if(filterUser.trim()&&!actorTerm)throw Error('Informe um nome de usuário válido.');
        if(actorTerm)q=q.ilike('user_nome',auditLike(actorTerm));
        if(filterRole)q=q.eq('role',filterRole);
        if(filterModulo)q=q.eq('modulo',filterModulo);
        if(filterAcao)q=q.eq('acao',filterAcao);
        if(filterStatus)q=q.eq('status',filterStatus);
        if(filterUnidade)q=q.eq('unidade_id',filterUnidade);
        if(unitId)q=q.eq('unidade_id',unitId);
        if(filterEventoGrupo&&filterEventoGrupo!=='todos'){
          const group=eventoGrupos[filterEventoGrupo];if(group?.acoes.length)q=q.in('acao',group.acoes);
        }
        if(cpfVariants.length){
          let ids:string[]=[];
          try{
            const {data,error,count}=await supabase.from('funcionarios').select('id',{count:'exact'}).match(unitFilter).in('cpf',cpfVariants).order('id').limit(AUDIT_LOOKUP_LIMIT).abortSignal(controller.signal);
            if(!valid())return;
            if(error||!data)throw Error('lookup');
            ids=data.map(x=>x.id).filter(id=>typeof id==='string'&&id.length<=120);
            if(count===null||count>ids.length)warnings.push('Vínculos por CPF limitados.');
          }catch{if(!valid())return;warnings.push('Cadastro de funcionários não confirmado; pesquisa pelo CPF histórico disponível.');}
          q=q.or(auditActorCpfSearch(cpfVariants,ids));
        }
        if(term){
          const digits=term.replace(/\D/g,'');
          const groups:{ids:string[];field:string;entity:string}[]=[];
          try{
            let pq=supabase.from('pacientes').select('id',{count:'exact'}).match(unitFilter).order('id').limit(AUDIT_LOOKUP_LIMIT);
            const parts=['nome.ilike.'+auditQuote(auditLike(term))];
            if(digits.length>=3&&/^[\d.\-\s()+]+$/.test(term)){
              for(const field of ['cpf','cns','telefone']) {
                parts.push(field+'.ilike.'+auditQuote(auditLike(digits)));
                if(term!==digits)parts.push(field+'.ilike.'+auditQuote(auditLike(term)));
              }
            }
            const {data,error,count}=await pq.or(parts.join(',')).abortSignal(controller.signal);
            if(!valid())return;
            if(error||!data)throw Error('lookup');
            const ids=data.map(x=>x.id).filter(id=>typeof id==='string'&&id.length<=120);
            if(count===null||count>ids.length)warnings.push('Busca por pacientes limitada; refine o nome ou CPF.');
            if(ids.length){
              groups.push({ids,field:'paciente_id',entity:'paciente'});
              const related=[['agendamentos','agendamento_id','agendamento'],['prontuarios','prontuario_id','prontuario'],['documentos_gerados','documento_id','documento']] as const;
              const found=await Promise.all(related.map(async([table,field,entity])=>{
                try{
                  const {data,error,count}=await supabase.from(table).select('id',{count:'exact'}).match(unitFilter).in('paciente_id',ids).order('id').limit(AUDIT_RELATED_LIMIT).abortSignal(controller.signal);
                  if(error||!data)return {group:null,limited:true};
                  return {group:{ids:data.map(x=>x.id),field,entity},limited:count===null||count>data.length};
                }catch{return {group:null,limited:true};}
              }));
              if(!valid())return;
              for(const item of found){if(item.group)groups.push(item.group);if(item.limited)warnings.push('Vínculos históricos parcialmente consultados.');}
            }
          }catch{if(!valid())return;warnings.push('Vínculos de pacientes não confirmados; pesquisa textual disponível.');}
          const expression=auditRelatedSearch(auditTextSearch(term),groups);
          if(expression.limited)warnings.push('Limite seguro da pesquisa por vínculos atingido.');
          q=q.or(expression.expression);
        }
        const range=auditPageRange(page);
        const {data,count,error}=await q.range(range.from,range.to).abortSignal(controller.signal);
        if(!valid())return;
        if(count!==null&&page>auditLastPage(count)){setPage(auditLastPage(count));return;}
        if(error||!data||count===null)throw Error('Não foi possível confirmar a consulta de auditoria.');
        const rows=data.map(l=>redactAuditData(l) as EnrichedLog);
        const result=await enrichPage(rows,controller.signal);
        if(!valid())return;
        if(result.unavailable)warnings.push('Alguns dados atuais das entidades não puderam ser consultados; os eventos permanecem disponíveis.');
        setDirectory({key:queryKey,rows:result.rows,count,warning:[...new Set(warnings)].join(' '),error:''});
      }catch(e){
        if(valid())setDirectory({key:queryKey,rows:[],count:0,warning:'',error:e instanceof Error?e.message:'Não foi possível consultar a auditoria.'});
      }
    },300);
    return()=>{clearTimeout(timer);controller.abort();};
  },[queryKey,page,filterDateFrom,filterDateTo,filterUser,filterRole,filterModulo,filterAcao,filterStatus,filterUnidade,filterCpf,filterEventoGrupo,search,unitId,unitFilter,enrichPage]);

  const totalPages=Math.ceil(totalCount/ITEMS_PER_PAGE);

  const clearFilters = () => {
    setFilterDateFrom(''); setFilterDateTo(''); setFilterUser(''); setFilterRole('');
    setFilterModulo(''); setFilterAcao(''); setFilterStatus(''); setFilterUnidade('');
    setFilterCpf(''); setFilterEventoGrupo('');
    setSearch(''); setPage(0);
  };

  const getCpfDisplay = (log: LogEntry) => {
    const cpf = String((log.detalhes as any)?.usuario_cpf || '');
    if (!cpf) return '-';
    return maskCpf(cpf);
  };

  // Professional activity report
  const generateReport = useCallback(async () => {
    if(!active.current || !canExport) return;
    setReportLoading(true); setReportData([]);
    try {
      let query = supabase
        .from('action_logs' as any)
        .select('*')
        .order('created_at', { ascending: false });

      if (filterDateFrom) query = query.gte('created_at', `${filterDateFrom}T00:00:00`);
      if (filterDateTo) query = query.lte('created_at', `${filterDateTo}T23:59:59`);
      if (unitId) query = query.eq('unidade_id', unitId);

      const { data, error } = await query;
      if (error) throw error;

      const allLogs = ((data as unknown as LogEntry[]) || []).map(l=>redactAuditData(l) as LogEntry);

      // Group by user
      const byUser: Record<string, { nome: string; cpf: string; role: string; logs: LogEntry[] }> = {};
      allLogs.forEach(l => {
        if (!l.user_id || l.user_id === '' || l.role === 'sistema') return;
        if (!byUser[l.user_id]) {
          byUser[l.user_id] = {
            nome: l.user_nome,
            cpf: String((l.detalhes as any)?.usuario_cpf || ''),
            role: l.role,
            logs: [],
          };
        }
        byUser[l.user_id].logs.push(l);
      });

      const report = Object.entries(byUser).map(([userId, data]) => {
        const logins = data.logs.filter(l => ['login', 'login_sucesso'].includes(l.acao)).length;
        const atendimentosIniciados = data.logs.filter(l => l.acao === 'atendimento_iniciado' || l.acao === 'iniciar_atendimento').length;
        const atendimentosFinalizados = data.logs.filter(l => l.acao === 'atendimento_finalizado' || l.acao === 'finalizar_atendimento').length;
        const prontuariosVisualizados = data.logs.filter(l => l.acao === 'prontuario_visualizado').length;
        const prontuariosEditados = data.logs.filter(l => l.acao === 'prontuario_editado').length;
        const prontuariosCriados = data.logs.filter(l => l.acao === 'prontuario_criado').length;

        const sorted = [...data.logs].sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
        const primeiroAcesso = sorted[0]?.created_at || '';
        const ultimoAcesso = sorted[sorted.length - 1]?.created_at || '';

        return {
          userId, nome: data.nome, cpf: data.cpf, role: data.role,
          logins, atendimentosIniciados, atendimentosFinalizados,
          prontuariosVisualizados, prontuariosEditados, prontuariosCriados,
          primeiroAcesso, ultimoAcesso, totalAcoes: data.logs.length,
        };
      }).sort((a, b) => b.totalAcoes - a.totalAcoes);

      if(!active.current) return;
      setReportData(report); setReportPeriod({de:filterDateFrom,ate:filterDateTo});
      setShowReport(true);
    } catch (err) {
      if(active.current) toast.error('Erro ao gerar relatório.');
    } finally {
      if(active.current) setReportLoading(false);
    }
  }, [filterDateFrom, filterDateTo, unitId, canExport]);

  const exportReportPDF = async (motivo: string) => {
    if (!reportData.length) throw Error('Nenhum dado disponível para exportar.');
    const rows = reportData.map(r => `
      <tr>
        <td style="padding:4px 8px;border:1px solid #ddd;font-size:11px">${auditEscapeHtml(r.nome)}</td>
        <td style="padding:4px 8px;border:1px solid #ddd;font-size:11px">${maskCpf(r.cpf)}</td>
        <td style="padding:4px 8px;border:1px solid #ddd;font-size:11px">${auditEscapeHtml(r.role)}</td>
        <td style="padding:4px 8px;border:1px solid #ddd;font-size:11px;text-align:center">${r.logins}</td>
        <td style="padding:4px 8px;border:1px solid #ddd;font-size:11px;text-align:center">${r.atendimentosIniciados}</td>
        <td style="padding:4px 8px;border:1px solid #ddd;font-size:11px;text-align:center">${r.atendimentosFinalizados}</td>
        <td style="padding:4px 8px;border:1px solid #ddd;font-size:11px;text-align:center">${r.prontuariosVisualizados}</td>
        <td style="padding:4px 8px;border:1px solid #ddd;font-size:11px;text-align:center">${r.prontuariosEditados}</td>
        <td style="padding:4px 8px;border:1px solid #ddd;font-size:11px;font-size:10px">${r.primeiroAcesso ? format(new Date(r.primeiroAcesso), 'dd/MM HH:mm') : '-'}</td>
        <td style="padding:4px 8px;border:1px solid #ddd;font-size:11px;font-size:10px">${r.ultimoAcesso ? format(new Date(r.ultimoAcesso), 'dd/MM HH:mm') : '-'}</td>
      </tr>
    `).join('');

    const periodo = reportPeriod.de || reportPeriod.ate
      ? `${reportPeriod.de ? format(new Date(reportPeriod.de + 'T12:00:00'), 'dd/MM/yyyy') : '...'} a ${reportPeriod.ate ? format(new Date(reportPeriod.ate + 'T12:00:00'), 'dd/MM/yyyy') : '...'}`
      : 'Todo o período';

    const body = `
      <div class="info-grid">
        <div><span class="info-label">Período:</span><br/><span class="info-value">${periodo}</span></div>
        <div><span class="info-label">Total de profissionais:</span><br/><span class="info-value">${reportData.length}</span></div>
      </div>
      <table style="width:100%;border-collapse:collapse;margin-top:16px">
        <thead><tr style="background:#f0f0f0">
          <th style="padding:6px 8px;border:1px solid #ddd;font-size:10px;text-align:left">Nome</th>
          <th style="padding:6px 8px;border:1px solid #ddd;font-size:10px;text-align:left">CPF</th>
          <th style="padding:6px 8px;border:1px solid #ddd;font-size:10px;text-align:left">Perfil</th>
          <th style="padding:6px 8px;border:1px solid #ddd;font-size:10px;text-align:center">Logins</th>
          <th style="padding:6px 8px;border:1px solid #ddd;font-size:10px;text-align:center">Atend. Inic.</th>
          <th style="padding:6px 8px;border:1px solid #ddd;font-size:10px;text-align:center">Atend. Fin.</th>
          <th style="padding:6px 8px;border:1px solid #ddd;font-size:10px;text-align:center">Pront. Vis.</th>
          <th style="padding:6px 8px;border:1px solid #ddd;font-size:10px;text-align:center">Pront. Edit.</th>
          <th style="padding:6px 8px;border:1px solid #ddd;font-size:10px;text-align:center">1º Acesso</th>
          <th style="padding:6px 8px;border:1px solid #ddd;font-size:10px;text-align:center">Último</th>
        </tr></thead>
        <tbody>${rows}</tbody>
      </table>`;

    const hash = await sha256Hex(body);
    const protocolo = 'AUD-'+format(new Date(),'yyyyMMddHHmmss')+'-'+hash.slice(0,8).toUpperCase();
    await registrarExportacao('pdf',motivo,hash,protocolo,true);
    await openPrintDocument('Relatório de Atividade por Profissional', body + `<p>Protocolo: ${protocolo} · SHA-256 do conteúdo: ${hash}</p><p>Recorte consultado; cobertura integral ainda não confirmada.</p>`, { 'Período': periodo });
  };

  const exportReportCSV = async (motivo:string) => {
    if (!reportData.length) throw Error('Nenhum dado disponível para exportar.');
    const headers = ['Nome', 'CPF', 'Perfil', 'Logins', 'Atend. Iniciados', 'Atend. Finalizados', 'Pront. Visualizados', 'Pront. Editados', 'Pront. Criados', 'Primeiro Acesso', 'Último Acesso'];
    const rows = reportData.map(r => [
      r.nome, maskCpf(r.cpf), r.role,
      r.logins, r.atendimentosIniciados, r.atendimentosFinalizados,
      r.prontuariosVisualizados, r.prontuariosEditados, r.prontuariosCriados,
      r.primeiroAcesso ? format(new Date(r.primeiroAcesso), 'dd/MM/yyyy HH:mm') : '',
      r.ultimoAcesso ? format(new Date(r.ultimoAcesso), 'dd/MM/yyyy HH:mm') : '',
    ]);
    const content = [headers.join(';'), ...rows.map(r=>r.map(auditCsvCell).join(';'))].join('\n');
    const hash=await sha256Hex(content);
    const protocolo='AUD-'+format(new Date(),'yyyyMMddHHmmss')+'-'+hash.slice(0,8).toUpperCase();
    await registrarExportacao('csv',motivo,hash,protocolo,true);
    const csv=content+'\n'+[['PROTOCOLO',protocolo],['SHA-256 (conteúdo acima)',hash],['ABRANGÊNCIA','Recorte consultado; cobertura integral não confirmada']].map(r=>r.map(auditCsvCell).join(';')).join('\n');
    const blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `relatorio_profissionais_${format(new Date(), 'yyyyMMdd')}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const exportCSV = async (motivo: string) => {
    if (!logs.length) throw Error('Nenhum dado disponível para exportar.');
    const headers = ['Data/Hora', 'Usuário', 'CPF', 'Perfil', 'Ação', 'Resumo', 'Módulo', 'Registro Afetado', 'Entidade', 'ID Registro', 'Unidade', 'Status', 'IP', 'Navegador', 'Erro'];
    const rows = logs.map(l => [
      format(new Date(l.created_at), 'dd/MM/yyyy HH:mm:ss'),
      l.user_nome, getCpfDisplay(l), l.role,
      acaoLabels[l.acao] || l.acao,
      generateHumanSummary(l),
      moduloLabels[l.modulo] || l.modulo || l.entidade,
      l.paciente_nome || l.nome_entidade || '',
      l.entidade, l.entidade_id,
      l.unidade_nome || '',
      l.status, l.ip, l.navegador || '',
      l.error_message || '',
    ]);
    const content = [headers.join(';'), ...rows.map(r=>r.map(auditCsvCell).join(';'))].join('\n');
    const geradoEm = new Date();
    const hash = await sha256Hex(content);
    const protocolo = `AUD-${format(geradoEm, 'yyyyMMddHHmmss')}-${hash.slice(0, 8).toUpperCase()}`;
    await registrarExportacao('csv', motivo, hash, protocolo);
    const rodape = [
      ['PROTOCOLO',protocolo],['EMITIDO POR',user?.nome||''],['DATA/HORA',format(geradoEm,'dd/MM/yyyy HH:mm:ss')],
      ['MOTIVO',auditSafeText(motivo)],['ABRANGÊNCIA','Página atual'],['AVISO DA CONSULTA',searchWarning],['SHA-256 (conteúdo acima do rodapé)',hash],
    ].map(r=>r.map(auditCsvCell).join(';')).join('\n');
    const csv = content + '\n' + rodape;
    const blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `auditoria_${format(geradoEm, 'yyyyMMdd_HHmmss')}_${protocolo}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success(`CSV exportado — protocolo ${protocolo}`);
  };


  const exportPDF = async (motivo: string) => {
    if (!logs.length) throw Error('Nenhum dado disponível para exportar.');
    const esc = auditEscapeHtml;
    const tableRows = logs.map(l => `
      <tr>
        <td style="padding:4px 8px;border:1px solid #ddd;font-size:11px">${format(new Date(l.created_at), 'dd/MM/yy HH:mm:ss')}</td>
        <td style="padding:4px 8px;border:1px solid #ddd;font-size:11px">${esc(l.user_nome)}</td>
        <td style="padding:4px 8px;border:1px solid #ddd;font-size:11px">${esc(getCpfDisplay(l))}</td>
        <td style="padding:4px 8px;border:1px solid #ddd;font-size:11px">${esc(l.role)}</td>
        <td style="padding:4px 8px;border:1px solid #ddd;font-size:11px">${esc(acaoLabels[l.acao] || l.acao)}</td>
        <td style="padding:4px 8px;border:1px solid #ddd;font-size:11px">${esc(l.ip)}</td>
        <td style="padding:4px 8px;border:1px solid #ddd;font-size:11px">${esc(l.status)}</td>
      </tr>
    `).join('');

    const tableHtml = `
      <table style="width:100%;border-collapse:collapse">
        <thead><tr style="background:#f0f0f0">
          <th style="padding:6px 8px;border:1px solid #ddd;font-size:11px;text-align:left">Data/Hora</th>
          <th style="padding:6px 8px;border:1px solid #ddd;font-size:11px;text-align:left">Usuário</th>
          <th style="padding:6px 8px;border:1px solid #ddd;font-size:11px;text-align:left">CPF</th>
          <th style="padding:6px 8px;border:1px solid #ddd;font-size:11px;text-align:left">Perfil</th>
          <th style="padding:6px 8px;border:1px solid #ddd;font-size:11px;text-align:left">Ação</th>
          <th style="padding:6px 8px;border:1px solid #ddd;font-size:11px;text-align:left">IP</th>
          <th style="padding:6px 8px;border:1px solid #ddd;font-size:11px;text-align:left">Status</th>
        </tr></thead>
        <tbody>${tableRows}</tbody>
      </table>`;
    const geradoEm = new Date();
    const hash = await sha256Hex(tableHtml);
    const protocolo = `AUD-${format(geradoEm, 'yyyyMMddHHmmss')}-${hash.slice(0, 8).toUpperCase()}`;
    await registrarExportacao('pdf', motivo, hash, protocolo);

    const body = `
      <div style="font-size:11px;margin:10px 0;padding:8px;border:1px solid #999">
        <div><strong>Protocolo:</strong> ${protocolo}</div>
        <div><strong>Emitido por:</strong> ${esc(user?.nome)} — CPF ${esc(maskCpf(user?.cpf || ''))} — perfil ${esc(user?.role)}</div>
        <div><strong>Data/hora da emissão:</strong> ${format(geradoEm, 'dd/MM/yyyy HH:mm:ss')}</div>
        <div><strong>Motivo:</strong> ${esc(auditSafeText(motivo))}</div>
        <div><strong>Registros:</strong> ${logs.length} de ${totalCount} no recorte consultado</div>
        ${searchWarning ? '<div><strong>Aviso:</strong> '+esc(searchWarning)+'</div>' : ''}
      </div>
      ${tableHtml}
      <div style="font-size:10px;margin-top:12px;padding:8px;border-top:1px solid #999;word-break:break-all">
        <strong>Selo de integridade (SHA-256 da tabela):</strong> ${hash}<br/>
        A solicitação de exportação foi registrada sob o protocolo acima. O hash corresponde à tabela, não comprova autoria ou imutabilidade.
      </div>`;

    await openPrintDocument('Relatório de Auditoria', body, {});
  };


  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Logs & Auditoria</h1>
          <p className="text-sm text-muted-foreground">{loading?'Consultando registros…':queryError?'Total não confirmado':totalCount.toLocaleString('pt-BR')+' registros no recorte consultado'}</p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <Button variant="outline" size="sm" disabled={exportBusy} onClick={() => { cacheRef.current.clear(); setPage(0); setRevision(n=>n+1); }}>
            <RefreshCw className="w-4 h-4 mr-1" /> Atualizar
          </Button>
          <Button variant="outline" size="sm" onClick={() => setShowFilters(!showFilters)}>
            <Filter className="w-4 h-4 mr-1" /> Filtros
          </Button>
          <Button variant="outline" size="sm" onClick={generateReport} disabled={reportLoading || !canExport}>
            <BarChart3 className="w-4 h-4 mr-1" /> {reportLoading ? 'Gerando...' : 'Relatório por Profissional'}
          </Button>
          <Button variant="outline" size="sm" disabled={!canExport || loading || !logs.length || exportBusy} onClick={() => logs.length && setExportRequest('csv')}>
            <Download className="w-4 h-4 mr-1" /> CSV
          </Button>
          <Button variant="outline" size="sm" disabled={!canExport || loading || !logs.length || exportBusy} onClick={() => logs.length && setExportRequest('pdf')}>
            <FileText className="w-4 h-4 mr-1" /> PDF
          </Button>
        </div>
      </div>

      <Dialog open={!!exportRequest} onOpenChange={(o) => { if (!o && !exportLock.current) { setExportRequest(null); setExportMotivo(''); } }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Exportação com registro ({exportRequest?.endsWith('csv') ? 'CSV' : 'PDF'})</DialogTitle>
          </DialogHeader>
          <div className="space-y-2">
            <p className="text-sm text-muted-foreground">
              Informe o motivo da exportação (ex.: "Atendimento ao Ofício Judicial nº 045/2026"). O motivo, o emissor e o hash SHA-256 serão enviados à auditoria. A emissão exige confirmação de gravação. A listagem exporta somente a página atual; o relatório por profissional usa o recorte consultado.
            </p>
            <textarea
              className="w-full min-h-[90px] rounded-md border border-input bg-background p-2 text-sm"
              value={exportMotivo} maxLength={500} disabled={exportBusy}
              onChange={(e) => setExportMotivo(e.target.value)}
              placeholder="Motivo da exportação (mínimo 10 caracteres)"
            />
            <div className="flex justify-end gap-2">
              <Button variant="outline" disabled={exportBusy} onClick={() => { setExportRequest(null); setExportMotivo(''); }}>Cancelar</Button>
              <Button
                disabled={!canExport || exportMotivo.trim().length < 10 || exportMotivo.trim().length > 500 || exportBusy || (!exportRequest?.startsWith('report_') && (loading || !logs.length))}
                onClick={async () => {
                  if(!active.current || !canExport || exportLock.current || !exportRequest) return;
                  exportLock.current=true; setExportBusy(true);
                  try {
                    const reason=exportMotivo.trim();
                    if (exportRequest === 'csv') await exportCSV(reason);
                    else if (exportRequest === 'pdf') await exportPDF(reason);
                    else if (exportRequest === 'report_csv') await exportReportCSV(reason);
                    else await exportReportPDF(reason);
                    if(active.current){setExportRequest(null); setExportMotivo('');}
                  } catch { if(active.current) toast.error('Exportação não concluída. Confira a auditoria antes de repetir.'); }
                  finally { exportLock.current=false; if(active.current)setExportBusy(false); }
                }}
              >
                {exportBusy ? 'Gerando...' : 'Gerar exportação'}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <Input
          placeholder="Pesquisar por usuário, ação, entidade..."
          value={search}
          onChange={(e) => { setSearch(e.target.value); setPage(0); }}
          className="pl-10"
        />
      </div>

      {/* Filters */}
      {showFilters && (
        <Card>
          <CardContent className="pt-4 pb-3">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1 block">Data Início</label>
                <Input type="date" value={filterDateFrom} onChange={(e) => { setFilterDateFrom(e.target.value); setPage(0); }} />
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1 block">Data Fim</label>
                <Input type="date" value={filterDateTo} onChange={(e) => { setFilterDateTo(e.target.value); setPage(0); }} />
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1 block">Usuário</label>
                <Input placeholder="Nome do usuário" value={filterUser} onChange={(e) => { setFilterUser(e.target.value); setPage(0); }} />
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1 block">CPF do Funcionário</label>
                <Input placeholder="CPF completo do funcionário" value={filterCpf} onChange={(e) => { setFilterCpf(e.target.value); setPage(0); }} />
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1 block">Perfil</label>
                <Select value={filterRole} onValueChange={(v) => { setFilterRole(v === '_all' ? '' : v); setPage(0); }}>
                  <SelectTrigger><SelectValue placeholder="Todos" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="_all">Todos</SelectItem>
                    <SelectItem value="master">Master</SelectItem>
                    <SelectItem value="coordenador">Coordenador</SelectItem>
                    <SelectItem value="recepcao">Recepção</SelectItem>
                    <SelectItem value="profissional">Profissional</SelectItem>
                    <SelectItem value="gestao">Gestão</SelectItem>
                    <SelectItem value="sistema">Sistema</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1 block">Tipo de Evento</label>
                <Select value={filterEventoGrupo} onValueChange={(v) => { setFilterEventoGrupo(v === '_all' ? '' : v); setPage(0); }}>
                  <SelectTrigger><SelectValue placeholder="Todos" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="_all">Todos</SelectItem>
                    {Object.entries(eventoGrupos).map(([k, v]) => (
                      <SelectItem key={k} value={k}>{v.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1 block">Módulo</label>
                <Select value={filterModulo} onValueChange={(v) => { setFilterModulo(v === '_all' ? '' : v); setPage(0); }}>
                  <SelectTrigger><SelectValue placeholder="Todos" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="_all">Todos</SelectItem>
                    {Object.entries(moduloLabels).filter(([k]) => k).map(([k, v]) => (
                      <SelectItem key={k} value={k}>{v}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1 block">Status</label>
                <Select value={filterStatus} onValueChange={(v) => { setFilterStatus(v === '_all' ? '' : v); setPage(0); }}>
                  <SelectTrigger><SelectValue placeholder="Todos" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="_all">Todos</SelectItem>
                    <SelectItem value="sucesso">Sucesso</SelectItem>
                    <SelectItem value="erro">Erro</SelectItem>
                    <SelectItem value="tentativa">Tentativa</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="flex items-end">
                <Button variant="ghost" size="sm" onClick={clearFilters} className="w-full">
                  <X className="w-4 h-4 mr-1" /> Limpar Filtros
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {searchWarning && <div role="status" className="rounded-lg border border-border bg-muted/40 p-3 text-sm text-muted-foreground">{searchWarning} A contagem corresponde somente ao recorte consultado.</div>}
      {/* Table */}
      <Card>
        <CardContent className="p-0">
          {queryError ? <div role="alert" className="py-12 px-4 text-center space-y-3"><p className="text-sm text-muted-foreground">{queryError}</p><Button size="sm" variant="outline" onClick={()=>setRevision(n=>n+1)}>Tentar novamente</Button></div> : loading ? (
            <div className="flex items-center justify-center py-16">
              <div className="animate-spin w-6 h-6 border-2 border-primary border-t-transparent rounded-full" />
            </div>
          ) : logs.length === 0 ? (
            <div className="text-center py-16 text-muted-foreground">Nenhum registro encontrado.</div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="whitespace-nowrap">Data/Hora</TableHead>
                    <TableHead>Usuário</TableHead>
                    <TableHead>Ação</TableHead>
                    <TableHead>Registro Afetado</TableHead>
                    <TableHead>Módulo</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Dispositivo</TableHead>
                    <TableHead className="w-10"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {logs.map((log) => (
                    <TableRow key={log.id} className="cursor-pointer hover:bg-muted/50 transition-colors" onClick={() => {setDetailState(null);setSelectedLog(log);}}>
                      <TableCell className="whitespace-nowrap text-[11px] font-mono">
                        {format(new Date(log.created_at), 'dd/MM/yy HH:mm:ss')}
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-col">
                          <span className="text-sm font-medium leading-none">{getAuditActorLabel(log)}</span>
                          <span className="text-[10px] text-muted-foreground mt-1 uppercase tracking-wider font-semibold">{log.role}</span>
                        </div>
                      </TableCell>
                      <TableCell className="max-w-[200px]">
                        <div className="flex flex-col gap-0.5 overflow-hidden">
                          <span className="text-xs font-semibold truncate" title={formatAuditAction(log.acao)}>
                            {formatAuditAction(log.acao)}
                          </span>
                          {(log as any).human_summary && (
                            <span className="text-[9px] text-muted-foreground line-clamp-1 italic" title={(log as any).human_summary}>
                              "{(log as any).human_summary}"
                            </span>
                          )}
                        </div>
                      </TableCell>

                      <TableCell className="max-w-[200px]">
                        <div className="flex flex-col gap-0.5 overflow-hidden">
                          <span className="text-xs font-semibold truncate" title={log.nome_entidade || log.entidade_id}>
                            {log.nome_entidade || (log.entidade_id && log.entidade_id.length > 5 ? log.entidade_id : log.entidade)}
                          </span>
                          {log.entidade_resolvida?.subtitulo && (
                            <span className="text-[10px] text-muted-foreground truncate">
                              {log.entidade_resolvida.subtitulo}
                            </span>
                          )}
                        </div>
                      </TableCell>


                      <TableCell>
                        <Badge variant="secondary" className="text-[10px] font-normal uppercase tracking-tight">
                          {moduloLabels[log.modulo] || log.modulo || log.entidade}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <Badge className={`text-[10px] uppercase font-bold tracking-tight shadow-none ${statusBadge[log.status] || 'bg-muted text-muted-foreground'}`}>
                          {log.status}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-[10px] text-muted-foreground max-w-[100px] truncate">
                        {formatDispositivo(log)}
                      </TableCell>
                      <TableCell>
                        <Button variant="ghost" size="sm" className="h-7 w-7 p-0 rounded-full hover:bg-primary/10">
                          <Eye className="w-4 h-4 text-primary" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between">
          <p className="text-sm text-muted-foreground">
            Página {page + 1} de {totalPages} · {Math.min(page*ITEMS_PER_PAGE+1,totalCount)}–{Math.min((page+1)*ITEMS_PER_PAGE,totalCount)} de {totalCount.toLocaleString('pt-BR')}
          </p>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" disabled={loading || page === 0 || exportBusy} onClick={() => setPage(p => p - 1)}>
              <ChevronLeft className="w-4 h-4" />
            </Button>
            <Button variant="outline" size="sm" disabled={loading || page >= totalPages - 1 || exportBusy} onClick={() => setPage(p => p + 1)}>
              <ChevronRight className="w-4 h-4" />
            </Button>
          </div>
        </div>
      )}

      {/* Detail Side Panel */}
      <Sheet open={!!selectedLog} onOpenChange={open=>{if(!open){setSelectedLog(null);setDetailState(null);}}}>
        <SheetContent className="w-full sm:max-w-lg overflow-y-auto">
          <SheetHeader className="border-b pb-4">
            <div className="flex items-center gap-2">
              <div className="p-2 bg-primary/10 rounded-lg text-primary">
                <Shield className="w-5 h-5" />
              </div>
              <div>
                <SheetTitle className="text-xl">Detalhes da Auditoria</SheetTitle>
                <p className="text-xs text-muted-foreground font-mono">{selectedLog?.id}</p>
              </div>
            </div>
          </SheetHeader>
          
          {selectedLog && (
            <div className="space-y-6 mt-6 pb-20">
              {detailState?.id!==selectedLog.id ? <p role="status" className="text-sm text-muted-foreground">Consultando detalhes completos…</p> : detailState.error ? <p role="status" className="text-sm text-muted-foreground">{detailState.error}</p> : null}
              {/* 1. RESUMO DO EVENTO */}
              <section className="space-y-4">
                <div className="flex items-center gap-2 text-sm font-semibold text-primary">
                  <Info className="w-4 h-4" />
                  RESUMO DO EVENTO
                </div>
                <div className="grid grid-cols-1 gap-4 bg-muted/30 p-4 rounded-xl border">
                  <div>
                    <p className="text-[10px] uppercase font-bold text-muted-foreground tracking-wider mb-1">Ação Realizada</p>
                    <p className="text-sm font-semibold leading-tight text-foreground">{formatAuditAction(selectedLog.acao)}</p>
                    <p className="text-xs text-muted-foreground mt-2 italic">
                      {generateHumanSummary(selectedLog)}
                    </p>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <p className="text-[10px] uppercase font-bold text-muted-foreground tracking-wider mb-1">Status</p>
                      <Badge className={`text-[10px] font-bold uppercase ${statusBadge[selectedLog.status] || ''}`}>{selectedLog.status}</Badge>
                    </div>
                    <div>
                      <p className="text-[10px] uppercase font-bold text-muted-foreground tracking-wider mb-1">Data e Hora</p>
                      <p className="text-sm font-medium">{format(new Date(selectedLog.created_at), "dd/MM/yyyy 'às' HH:mm:ss", { locale: ptBR })}</p>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <p className="text-[10px] uppercase font-bold text-muted-foreground tracking-wider mb-1">Módulo</p>
                      <p className="text-sm font-medium">{moduloLabels[selectedLog.modulo] || selectedLog.modulo}</p>
                    </div>
                    <div>
                      <p className="text-[10px] uppercase font-bold text-muted-foreground tracking-wider mb-1">Tipo de Evento</p>
                      <Badge variant="outline" className="text-[10px] font-bold uppercase">{selectedLog.tipo_evento || 'Sistema'}</Badge>
                    </div>
                  </div>
                </div>
              </section>


              {/* 2. RESPONSÁVEL */}
              <section className="space-y-4">
                <div className="flex items-center gap-2 text-sm font-semibold text-primary">
                  <UserCheck className="w-4 h-4" />
                  RESPONSÁVEL
                </div>
                <div className="grid grid-cols-1 gap-3 bg-muted/30 p-4 rounded-xl border">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center text-primary font-bold">
                      {getAuditActorLabel(selectedLog).charAt(0)}
                    </div>
                    <div>
                      <p className="text-sm font-bold">{getAuditActorLabel(selectedLog)}</p>
                      <p className="text-[10px] text-muted-foreground uppercase tracking-widest font-bold">{selectedLog.role || (selectedLog.user_nome ? 'Perfil não informado' : getAuditActorLabel(selectedLog) === 'Sistema / Automação' ? 'ORIGEM AUTOMATIZADA' : 'IDENTIFICAÇÃO AUSENTE')}</p>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-4 mt-1">
                    <div>
                      <p className="text-[10px] uppercase font-bold text-muted-foreground tracking-wider mb-1">CPF</p>
                      <p className="text-xs font-mono">{getCpfDisplay(selectedLog)}</p>
                    </div>
                    <div>
                      <p className="text-[10px] uppercase font-bold text-muted-foreground tracking-wider mb-1">Unidade</p>
                      <p className="text-xs font-medium">{selectedLog.detalhes_resolvidos?.unidade || 'Não informada'}</p>
                    </div>
                  </div>
                </div>
              </section>

              {/* 3. REGISTRO AFETADO */}
              {(selectedLog.entidade_id || selectedLog.nome_entidade || selectedLog.entidade_resolvida) && (
                <section className="space-y-4">
                  <div className="flex items-center gap-2 text-sm font-semibold text-primary">
                    <Database className="w-4 h-4" />
                    REGISTRO AFETADO
                  </div>
                  <div className="grid grid-cols-1 gap-3 bg-primary/5 p-4 rounded-xl border border-primary/10">
                    <div>
                      <p className="text-[10px] uppercase font-bold text-primary tracking-wider mb-1">
                        {selectedLog.entidade_resolvida?.tipo ? selectedLog.entidade_resolvida.tipo.charAt(0).toUpperCase() + selectedLog.entidade_resolvida.tipo.slice(1) : 'Identificação do Registro'}
                      </p>
                      <p className="text-sm font-bold text-foreground">{selectedLog.entidade_resolvida?.titulo || selectedLog.nome_entidade || 'N/D'}</p>
                      <p className="text-[10px] font-mono text-muted-foreground mt-1">ID Técnico: {selectedLog.entidade_id || 'N/D'}</p>
                    </div>
                    
                    {selectedLog.entidade_resolvida?.subtitulo && (
                      <div className="border-t border-primary/10 pt-2">
                        <p className="text-xs text-muted-foreground">{selectedLog.entidade_resolvida.subtitulo}</p>
                      </div>
                    )}

                    {selectedLog.entidade_resolvida?.detalhes && (
                      <div className="border-t border-primary/10 pt-2 grid grid-cols-2 gap-2">
                        <p className="col-span-2 text-xs text-muted-foreground">Informações atuais do cadastro, não necessariamente iguais às da data do evento.</p>
                        {Object.entries(selectedLog.entidade_resolvida.detalhes).map(([k, v]) => {
                          if (['id', 'unidade_id', 'custom_data', 'created_at', 'updated_at'].includes(k)) return null;
                          if (!v) return null;
                          return (
                            <div key={k}>
                              <p className="text-[9px] uppercase font-bold text-muted-foreground">{formatAuditFieldLabel(k)}</p>
                              <p className="text-[11px] font-medium">{formatAuditValue(k, v)}</p>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                </section>
              )}


              {/* 4. ALTERAÇÕES REALIZADAS */}
              {(selectedLog.before || selectedLog.after || selectedLog.changes || selectedLog.detalhes?.old_value || selectedLog.detalhes?.new_value || selectedLog.detalhes?.campos_alterados || selectedLog.detalhes?.old_data || selectedLog.detalhes?.new_data) && (
                <section className="space-y-4">
                  <div className="flex items-center gap-2 text-sm font-semibold text-primary">
                    <History className="w-4 h-4" />
                    ALTERAÇÕES REALIZADAS
                  </div>
                  <div className="space-y-2">
                    {/* Render changes (new structure or legacy in details) */}
                    {(() => {
                      const changes = selectedLog.changes || 
                                     selectedLog.detalhes?.changes || 
                                     selectedLog.detalhes?.alteracoes;
                      
                      if (changes && Object.entries(changes).length > 0) {
                        return (
                          <div className="space-y-2">
                            {Object.entries(changes).map(([key, vals]: [string, any]) => (
                              <div key={key} className="bg-muted/50 rounded-xl p-3 border">
                                <p className="text-xs font-bold text-foreground mb-2 uppercase tracking-tight">{formatAuditFieldLabel(key)}</p>
                                <div className="grid grid-cols-1 gap-2">
                                  <div className="flex items-center gap-2">
                                    <Badge variant="outline" className="text-[9px] border-red-200 text-red-600 bg-red-50 uppercase">DE</Badge>
                                    <span className="text-xs text-muted-foreground line-through">{formatAuditValue(key, vals?.from ?? vals?.before ?? vals?.anterior ?? vals?.old)}</span>
                                  </div>
                                  <div className="flex items-center gap-2">
                                    <Badge variant="outline" className="text-[9px] border-emerald-200 text-emerald-600 bg-emerald-50 uppercase">PARA</Badge>
                                    <span className="text-xs font-medium text-foreground">{formatAuditValue(key, vals?.to ?? vals?.after ?? vals?.novo ?? vals?.new)}</span>
                                  </div>
                                </div>
                              </div>
                            ))}
                          </div>
                        );
                      }

                      // Check for before/after pairs
                      const before = selectedLog.before || selectedLog.detalhes?.old_value || selectedLog.detalhes?.before || selectedLog.detalhes?.old_data;
                      const after = selectedLog.after || selectedLog.detalhes?.new_value || selectedLog.detalhes?.after || selectedLog.detalhes?.new_data;

                      if (before && after) {
                        const allKeys = new Set([...Object.keys(before), ...Object.keys(after)]);
                        const entries = Array.from(allKeys).filter(k => {
                          if (['id', 'created_at', 'updated_at', 'unidade_id', 'user_id', 'custom_data'].includes(k)) return false;
                          return JSON.stringify(before[k]) !== JSON.stringify(after[k]);
                        });

                        if (entries.length > 0) {
                          return (
                            <div className="space-y-2">
                              {entries.map(key => (
                                <div key={key} className="bg-muted/50 rounded-xl p-3 border">
                                  <p className="text-xs font-bold text-foreground mb-2 uppercase tracking-tight">{formatAuditFieldLabel(key)}</p>
                                  <div className="grid grid-cols-1 gap-2">
                                    <div className="flex items-center gap-2">
                                      <Badge variant="outline" className="text-[9px] border-red-200 text-red-600 bg-red-50 uppercase">DE</Badge>
                                      <span className="text-xs text-muted-foreground line-through">{formatAuditValue(key, before[key])}</span>
                                    </div>
                                    <div className="flex items-center gap-2">
                                      <Badge variant="outline" className="text-[9px] border-emerald-200 text-emerald-600 bg-emerald-50 uppercase">PARA</Badge>
                                      <span className="text-xs font-medium text-foreground">{formatAuditValue(key, after[key])}</span>
                                    </div>
                                  </div>
                                </div>
                              ))}
                            </div>
                          );
                        }
                      }

                      // Check for fields explicitly mapped in legacy format
                      if (selectedLog.detalhes?.campos_alterados) {
                        return (
                          <div className="space-y-2">
                            {Object.entries(selectedLog.detalhes.campos_alterados).map(([campo, vals]: [string, any]) => (
                              <div key={campo} className="bg-muted/50 rounded-xl p-3 border">
                                <p className="text-xs font-bold text-foreground mb-2 uppercase tracking-tight">{campo}</p>
                                <div className="grid grid-cols-1 gap-2">
                                  <div className="flex items-center gap-2">
                                    <Badge variant="outline" className="text-[9px] border-red-200 text-red-600 bg-red-50 uppercase">DE</Badge>
                                    <span className="text-xs text-muted-foreground">{formatAuditValue(campo, vals?.anterior ?? vals?.old)}</span>
                                  </div>
                                  <div className="flex items-center gap-2">
                                    <Badge variant="outline" className="text-[9px] border-emerald-200 text-emerald-600 bg-emerald-50 uppercase">PARA</Badge>
                                    <span className="text-xs font-medium text-foreground">{formatAuditValue(campo, vals?.novo ?? vals?.new)}</span>
                                  </div>
                                </div>
                              </div>
                            ))}
                          </div>
                        );
                      }

                      return (
                        <p className="text-xs text-muted-foreground italic p-4 bg-muted/20 rounded-lg border border-dashed text-center">
                          Este log não possui comparação antes/depois registrada.
                        </p>
                      );
                    })()}
                  </div>
                </section>
              )}
              {/* 5. CONTEXTO TÉCNICO */}
              <section className="space-y-4">
                <div className="flex items-center gap-2 text-sm font-semibold text-primary">
                  <Monitor className="w-4 h-4" />
                  CONTEXTO TÉCNICO
                </div>
                <div className="grid grid-cols-2 gap-4 bg-muted/30 p-4 rounded-xl border">
                  <div>
                    <p className="text-[10px] uppercase font-bold text-muted-foreground mb-1">Endereço IP</p>
                    <p className="text-xs font-mono">{selectedLog.ip || 'Local/Sistema'}</p>
                  </div>
                  <div>
                    <p className="text-[10px] uppercase font-bold text-muted-foreground mb-1">Navegador</p>
                    <p className="text-xs truncate">{formatDispositivo(selectedLog)}</p>
                  </div>
                  <div className="col-span-2">
                    <p className="text-[10px] uppercase font-bold text-muted-foreground mb-1">Rota / Origem</p>
                    <p className="text-[11px] font-mono text-muted-foreground truncate">{auditSafeText(String(selectedLog.rota || selectedLog.detalhes?.rota || selectedLog.detalhes?.origin || '-'))}</p>
                  </div>
                </div>
              </section>

              {/* 6. DADOS TÉCNICOS COMPLETOS */}
              <Accordion type="single" collapsible className="w-full">
                <AccordionItem value="json-data" className="border-none">
                  <AccordionTrigger className="hover:no-underline bg-muted/50 rounded-xl px-4 py-3 text-xs font-bold text-muted-foreground">
                    VER DADOS TÉCNICOS COMPLETOS (JSON)
                  </AccordionTrigger>
                  <AccordionContent className="pt-2">
                    <div className="relative">
                      <pre className="text-[10px] bg-slate-950 text-slate-300 p-4 rounded-xl overflow-auto max-h-[300px] font-mono leading-relaxed">
                        {JSON.stringify(redactAuditData(selectedLog.detalhes,true),null,2)}
                      </pre>
                      <Button 
                        size="icon" 
                        variant="ghost" 
                        className="absolute top-2 right-2 text-slate-400 hover:text-white hover:bg-white/10"
                        onClick={async () => {
                          try { await navigator.clipboard.writeText(JSON.stringify(redactAuditData(selectedLog.detalhes,true),null,2)); if(active.current)toast.success('JSON protegido copiado!'); }
                          catch { if(active.current)toast.error('Não foi possível copiar o JSON.'); }
                        }}
                      >
                        <FileText className="w-4 h-4" />
                      </Button>
                    </div>
                  </AccordionContent>
                </AccordionItem>
              </Accordion>
            </div>
          )}
        </SheetContent>
      </Sheet>

      {/* Professional Activity Report Dialog */}
      <Dialog open={showReport && !exportRequest} onOpenChange={open=>{if(!exportRequest)setShowReport(open);}}>
        <DialogContent className="max-w-4xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <BarChart3 className="w-5 h-5" />
              Relatório de Atividade por Profissional
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <p className="text-xs text-muted-foreground">Relatório do recorte consultado. A cobertura integral do período será tratada na revisão de relatórios.</p>
            <div className="flex gap-2 justify-end">
              <Button variant="outline" size="sm" disabled={!canExport || !reportData.length || exportBusy} onClick={()=>setExportRequest('report_csv')}>
                <Download className="w-4 h-4 mr-1" /> CSV
              </Button>
              <Button variant="outline" size="sm" disabled={!canExport || !reportData.length || exportBusy} onClick={()=>setExportRequest('report_pdf')}>
                <FileText className="w-4 h-4 mr-1" /> PDF
              </Button>
            </div>

            {reportData.length === 0 ? (
              <p className="text-center text-muted-foreground py-8">Nenhum dado encontrado para o período.</p>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Nome</TableHead>
                      <TableHead>CPF</TableHead>
                      <TableHead>Perfil</TableHead>
                      <TableHead className="text-center">Logins</TableHead>
                      <TableHead className="text-center">Atend. Inic.</TableHead>
                      <TableHead className="text-center">Atend. Fin.</TableHead>
                      <TableHead className="text-center">Pront. Vis.</TableHead>
                      <TableHead className="text-center">Pront. Edit.</TableHead>
                      <TableHead className="text-center">1º Acesso</TableHead>
                      <TableHead className="text-center">Último</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {reportData.map((r) => (
                      <TableRow key={r.userId}>
                        <TableCell className="font-medium text-sm">{r.nome}</TableCell>
                        <TableCell className="text-xs font-mono">{maskCpf(r.cpf)}</TableCell>
                        <TableCell><Badge variant="outline" className="text-xs">{r.role}</Badge></TableCell>
                        <TableCell className="text-center">{r.logins}</TableCell>
                        <TableCell className="text-center">{r.atendimentosIniciados}</TableCell>
                        <TableCell className="text-center">{r.atendimentosFinalizados}</TableCell>
                        <TableCell className="text-center">{r.prontuariosVisualizados}</TableCell>
                        <TableCell className="text-center">{r.prontuariosEditados}</TableCell>
                        <TableCell className="text-center text-xs">
                          {r.primeiroAcesso ? format(new Date(r.primeiroAcesso), 'dd/MM HH:mm') : '-'}
                        </TableCell>
                        <TableCell className="text-center text-xs">
                          {r.ultimoAcesso ? format(new Date(r.ultimoAcesso), 'dd/MM HH:mm') : '-'}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default Auditoria;
