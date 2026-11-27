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
import AuditOverview from '@/components/audit/AuditOverview';
import AuditRelatedTimeline from '@/components/audit/AuditRelatedTimeline';
import AuditEventFeed, {type AuditFeedEvent} from '@/components/audit/AuditEventFeed';
import {auditFeedCounts} from '@/lib/auditEventFeed';
import {auditUnitLabel,recordedUnitName,pendingAuditUnitIds,unitCatalogName,isAuditUnitField,type AuditUnitRef} from '@/lib/auditUnitIdentity';
import {List,Table2,CheckCircle2,AlertCircle,Clock} from 'lucide-react';
import {auditExportEligibility,readFilteredExport,EXPORT_LIMITS,exportSafeText,auditExportCsv,auditExportHtml,type ExportFormat,type ExportScope} from '@/lib/auditDocumentExport';
import { auditMunicipalDate } from '@/lib/auditOverview';
import { auditReportDays, readAuditReport, REPORT_LIMIT, REPORT_MAX_DAYS, REPORT_METRICS, reportMetricCells, type AuditReport, type ReportEvent } from '@/lib/auditActivityReport';
import {auditComparisons,type AuditValue} from '@/lib/auditInvestigation';
import { auditDateBounds, auditModuleDistribution, AUDIT_FAILURE_STATUSES, AUDIT_CLASSIFIED_STATUSES } from '@/lib/auditOverview';
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
  unidade_atual?:string;
  unidades_comparacao?:Record<string,string>;
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
  portal_paciente: 'Portal do Paciente',
  agenda: 'Agenda',
  agendamentos: 'Agendamentos',
  tratamentos: 'Tratamentos',
  triagem: 'Triagem',
  auditoria: 'Auditoria',
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

const auditEventClock = new Intl.DateTimeFormat('pt-BR',{timeZone:'America/Santarem',dateStyle:'short',timeStyle:'medium'});
const auditEventTime = (value:string) => Number.isFinite(Date.parse(value)) ? auditEventClock.format(new Date(value)) : 'Horário não registrado';
const generateHumanSummary = (log: EnrichedLog) => {
  const user = getAuditActorLabel(log);
  const acao = log.acao_legivel || formatAuditAction(log.acao);
  const entidade = log.entidade_resolvida?.titulo || log.entidade_nome || log.entidade_id || log.entidade;
  const data = auditEventTime(log.created_at);
  const unidade = auditUnitLabel(log,log.unidade_atual);

  if (log.tipo_evento === 'login') return log.status==='sucesso' ? `${user} realizou login no sistema em ${data}.` : `${user} teve um evento de autenticação registrado (${log.status || 'status não informado'}) em ${data}.`;
  if(log.status!=='sucesso')return `${user}: evento "${acao}" registrado com status ${log.status || 'não informado'}, em ${data}.`;
  
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
  const exportController=useRef<AbortController|null>(null);
  const reportController=useRef<AbortController|null>(null);
  useEffect(()=>{active.current=true;return()=>{active.current=false;requestId.current++;reportController.current?.abort();exportController.current?.abort();};},[]);
  const unitFilter = useMemo<Record<string,string>>(()=>unitId ? {unidade_id:unitId} : {},[unitId]);
  const [directory,setDirectory] = useState<{key:string;rows:EnrichedLog[];count:number;warning:string;error:string;apply?: (q:any)=>any;partial?:boolean}|null>(null);
  const [revision,setRevision] = useState(0);
  const [page, setPage] = useState(0);
  const [recordsView,setRecordsView]=useState<'feed'|'table'>('feed');
  const [search, setSearch] = useState('');
  const [showFilters, setShowFilters] = useState(false);
  const [exportRequest, setExportRequest] = useState<'csv' | 'pdf' | 'report_csv' | 'report_pdf' | null>(null);
  const [exportMotivo, setExportMotivo] = useState('');
  const [exportBusy, setExportBusy] = useState(false);
  const [exportScope,setExportScope]=useState<ExportScope>('page');
  const [exportError,setExportError]=useState('');
  const [exportProgress,setExportProgress]=useState('');

  const registrarExportacao = async (formato: 'csv' | 'pdf', motivo: string, hash: string, protocolo: string, report = false, manifest?:{scope:ExportScope;count:number;total:number;cutoff:string;warning:string;filters:Record<string,unknown>;hashTarget:string}) => {
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
        motivo_exportacao: exportSafeText(motivo),
        formato,
        protocolo,
        sha256: hash,
        quantidade_registros: manifest?.count ?? (report ? reportResult?.report.totals.totalAcoes : logs.length),
        total_filtrado: manifest?.total ?? (report ? reportResult?.report.totals.totalAcoes : totalCount),
        abrangencia: manifest ? (manifest.scope==='filtered'?'registros_filtrados':'pagina_atual') : report ? 'relatorio_profissionais_unidades_periodo' : 'pagina_atual',
        corte_consulta:manifest?.cutoff,
        alvo_hash:manifest?.hashTarget || (report?(formato==='pdf'?'HTML do conteúdo antes do rodapé, não bytes do PDF':'UTF-8 conteúdo antes do rodapé, sem BOM, LF'):undefined),
        aviso_consulta: manifest?.warning ?? (report ? undefined : searchWarning || undefined),
        filtros: manifest?.filters ?? (report ? reportResult?.period : { de: filterDateFrom, ate: filterDateTo, usuario:filterUser, perfil:filterRole, modulo:filterModulo, acao:filterAcao, status:filterStatus, unidade:filterUnidade, grupo:filterEventoGrupo, cpf_informado:!!filterCpf, busca_informada:!!search, pagina:page+1 }),
      },
    }, {requireConfirmation:true});
    if (!active.current) throw Error('A sessão ou abrangência foi alterada.');
  };
  const [selectedLog, setSelectedLog] = useState<EnrichedLog | null>(null);
  const [detailState,setDetailState] = useState<{id:string;error:string;full?:boolean}|null>(null);
  const [showAllChanges,setShowAllChanges]=useState(false);
  const [showReport, setShowReport] = useState(false);
  const [reportLoading, setReportLoading] = useState(false);
  const [reportDraft,setReportDraft]=useState(()=>({de:auditMunicipalDate(new Date()),ate:auditMunicipalDate(new Date()),unidade:unitId||''}));
  const [reportResult,setReportResult]=useState<{report:AuditReport;period:{de:string;ate:string;unidade:string;cutoff:string}}|null>(null);
  const [reportError,setReportError]=useState('');
  const [reportProgress,setReportProgress]=useState({n:0,total:0});
  const [reportTab,setReportTab]=useState<'actors'|'units'>('actors');
  const [reportPage,setReportPage]=useState(0);
  const reportRows=reportResult?.report[reportTab]||[];
  const reportPageSize=25;
  const reportPageCount=Math.max(1,Math.ceil(reportRows.length/reportPageSize));
  const reportExportable=!!reportResult?.report.totals.totalAcoes && !reportLoading;
  const reportPdfAllowed=reportExportable && (reportResult!.report.actors.length+reportResult!.report.units.length<=500);
  const resetReport=(draft:typeof reportDraft)=>{setReportDraft(draft);setReportResult(null);setReportError('');setReportPage(0);};


  const cacheRef = useRef(new AuditReadCache<ResolvedEntity>());
  const unitCache=useRef(new AuditReadCache<string>());
  const resolveUnits=useCallback(async(refs:readonly AuditUnitRef[],signal:AbortSignal)=>{
    const ids=pendingAuditUnitIds(refs,unitId);
    const names=new Map<string,string>();
    const missing:string[]=[];
    for(const id of ids){const cached=unitCache.current.get(id);if(cached!==undefined){if(cached)names.set(id,cached);}else missing.push(id);}
    // Exact ID matches only; inactive units are intentionally included for historical events.
    for(let i=0;i<missing.length&&!signal.aborted;i+=50){
      const batch=missing.slice(i,i+50);
      try{
        const {data,error}=await supabase.from('unidades').select('id,nome,nome_exibicao').in('id',batch).abortSignal(signal);
        if(signal.aborted||error||!data)continue;
        const found=new Map(data.map(row=>[row.id,unitCatalogName(row)]));
        for(const id of batch){const name=found.get(id)||'';unitCache.current.set(id,name);if(name)names.set(id,name);}
      }catch{/* Keep events visible and clearly unidentified if the catalog is unavailable. */}
    }
    return names;
  },[unitId]);
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
    const unitNamesPromise=resolveUnits(rows,signal);
    await Promise.all([...groups].map(async ([kind,ids])=>{
      try {
        const {data,error}=await (supabase as any).from(AUDIT_ENTITY_TABLES[kind]).select(AUDIT_ENTITY_FIELDS[kind]).match(unitFilter).in('id',[...ids]).abortSignal(signal);
        if(signal.aborted) return;
        if(error||!data){unavailable=true;return;}
        for(const row of data) cacheRef.current.set(entityCacheKey(kind,row.id),currentEntity(kind,row));
      } catch { if(!signal.aborted) unavailable=true; }
    }));
    const names=await unitNamesPromise;
    return {rows:rows.map(log=>{
      const ref=auditEntityRef(log);
      return enrichAuditRow({...log,unidade_atual:names.get(log.unidade_id)},ref&&!recordedEntityName(log,ref.kind)?cacheRef.current.get(entityCacheKey(ref.kind,ref.id)):undefined);
    }),unavailable};
  },[unitFilter,resolveUnits]);

  const detailId=selectedLog?.id;
  useEffect(()=>{
    if(!detailId) return;
    const controller=new AbortController();
    setDetailState(null); setShowAllChanges(false);
    void(async()=>{
      try {
        const {data,error}=await supabase.from('action_logs').select('*').eq('id',detailId).match(unitFilter).abortSignal(controller.signal).maybeSingle();
        if(controller.signal.aborted || !active.current) return;
        if(error||!data||data.id!==detailId) throw Error('Evento completo não confirmado.');
        const raw=redactAuditData(data) as EnrichedLog;
        const comparisonRefs=auditComparisons(raw).filter(row=>isAuditUnitField(row.field)).flatMap(row=>[row.before,row.after]).filter(v=>v.present&&typeof v.value==='string').map(v=>({unidade_id:String(v.value)}));
        const names=await resolveUnits([raw,...comparisonRefs],controller.signal);
        if(controller.signal.aborted||!active.current)return;
        const full={...raw,unidade_atual:names.get(raw.unidade_id),unidades_comparacao:Object.fromEntries(names)};
        setSelectedLog(previous=>previous?.id===detailId?enrichAuditRow(full,previous.entidade_resolvida):previous);
        let warning='';
        try {
          const enriched=await readEntity(full,controller.signal);
          if(!controller.signal.aborted&&active.current) setSelectedLog(previous=>previous?.id===detailId?enriched:previous);
        } catch {warning='Cadastro atual não confirmado; os dados registrados no evento foram preservados.';}
        if(!controller.signal.aborted&&active.current)setDetailState({id:detailId,error:warning,full:true});
      } catch {if(!controller.signal.aborted&&active.current)setDetailState({id:detailId,error:'Não foi possível consultar o evento completo. Abra novamente para tentar.'});}
    })();
    return()=>controller.abort();
  },[detailId,readEntity,unitFilter,resolveUnits]);

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
        const predicates:((q:any)=>any)[]=[];
        const add=(fn:(q:any)=>any)=>{predicates.push(fn);};
        const bounds=auditDateBounds(filterDateFrom,filterDateTo);
        if(bounds.start) add(q=>q.gte('created_at',bounds.start));
        if(bounds.end) add(q=>q.lt('created_at',bounds.end));
        const actorTerm=auditSearchTerm(filterUser);
        if(filterUser.trim()&&!actorTerm)throw Error('Informe um nome de usuário válido.');
        if(actorTerm)add(q=>q.ilike('user_nome',auditLike(actorTerm)));
        if(filterRole)add(q=>q.eq('role',filterRole));
        if(filterModulo)add(q=>q.eq('modulo',filterModulo));
        if(filterAcao)add(q=>q.eq('acao',filterAcao));
        if(filterStatus==='_failures')add(q=>q.in('status',AUDIT_FAILURE_STATUSES));
        else if(filterStatus==='_other')add(q=>q.not('status','in','('+AUDIT_CLASSIFIED_STATUSES.join(',')+')'));
        else if(filterStatus)add(q=>q.eq('status',filterStatus));
        if(filterUnidade)add(q=>q.eq('unidade_id',filterUnidade));
        if(unitId)add(q=>q.eq('unidade_id',unitId));
        if(filterEventoGrupo&&filterEventoGrupo!=='todos'){
          const group=eventoGrupos[filterEventoGrupo];if(group?.acoes.length)add(q=>q.in('acao',group.acoes));
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
          add(q=>q.or(auditActorCpfSearch(cpfVariants,ids)));
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
          add(q=>q.or(expression.expression));
        }
        const apply=(query:any)=>predicates.reduce((q,fn)=>fn(q),query);
        const partial=warnings.length>0;
        const q=apply(supabase.from('action_logs').select(AUDIT_LIST_FIELDS,{count:'exact'})).order('created_at',{ascending:false}).order('id',{ascending:false});
        const range=auditPageRange(page);
        const {data,count,error}=await q.range(range.from,range.to).abortSignal(controller.signal);
        if(!valid())return;
        if(count!==null&&page>auditLastPage(count)){setPage(auditLastPage(count));return;}
        if(error||!data||count===null)throw Error('Não foi possível confirmar a consulta de auditoria.');
        const rows=data.map(l=>redactAuditData(l) as EnrichedLog);
        const result=await enrichPage(rows,controller.signal);
        if(!valid())return;
        if(result.unavailable)warnings.push('Alguns dados atuais das entidades não puderam ser consultados; os eventos permanecem disponíveis.');
        setDirectory({key:queryKey,rows:result.rows,count,warning:[...new Set(warnings)].join(' '),error:'',apply,partial});
      }catch(e){
        if(valid())setDirectory({key:queryKey,rows:[],count:0,warning:'',error:e instanceof Error?e.message:'Não foi possível consultar a auditoria.'});
      }
    },300);
    return()=>{clearTimeout(timer);controller.abort();};
  },[queryKey,page,filterDateFrom,filterDateTo,filterUser,filterRole,filterModulo,filterAcao,filterStatus,filterUnidade,filterCpf,filterEventoGrupo,search,unitId,unitFilter,enrichPage]);

  const totalPages=Math.ceil(totalCount/ITEMS_PER_PAGE);
  const feedEvents=useMemo<AuditFeedEvent[]>(()=> (current?.rows||[]).map(log=>({
    id:log.id,createdAt:log.created_at,status:log.status,
    action:exportSafeText(log.acao_legivel||formatAuditAction(log.acao)),
    module:exportSafeText(moduloLabels[log.modulo]||log.modulo||log.entidade),
    actor:exportSafeText(getAuditActorLabel(log)),role:exportSafeText(log.role||'Perfil não informado'),
    entity:exportSafeText(log.nome_entidade||log.entidade_id||log.entidade),
    entityType:exportSafeText(log.entidade||''),entitySubtitle:exportSafeText(log.entidade_resolvida?.subtitulo||''),
    unit:exportSafeText(auditUnitLabel(log,log.unidade_atual)),
    device:exportSafeText(formatDispositivo(log)),summary:exportSafeText(generateHumanSummary(log)),
    error:exportSafeText(log.error_message||''),
    fields:Array.isArray(log.campos_alterados)?[...new Set(log.campos_alterados.filter((f):f is string=>typeof f==='string'&&!!f.trim()))].map(f=>isAuditSecret(f)?'Campo protegido':exportSafeText(formatAuditFieldLabel(f))):[]
  })),[current]);
  const feedCounts=useMemo(()=>auditFeedCounts(feedEvents),[feedEvents]);
  const openFeedEvent=(id:string)=>{const log=logs.find(row=>row.id===id);if(log){setDetailState(null);setSelectedLog(log);}};
  const comparisons=useMemo(()=>selectedLog?auditComparisons(selectedLog):[],[selectedLog]);
  const comparisonValue=(field:string,v:AuditValue)=>!v.present?'Não registrado':v.value===null?'Nulo registrado':v.value===''?'Vazio registrado':typeof v.value==='boolean'?(v.value?'Verdadeiro':'Falso'):isAuditUnitField(field)&&typeof v.value==='string'?auditUnitLabel({unidade_id:v.value},selectedLog?.unidades_comparacao?.[v.value]):formatAuditValue(field,v.value);
  const detailConfirmed=!!selectedLog&&detailState?.id===selectedLog.id&&detailState.full===true;

  const clearFilters = () => {
    setFilterDateFrom(''); setFilterDateTo(''); setFilterUser(''); setFilterRole('');
    setFilterModulo(''); setFilterAcao(''); setFilterStatus(''); setFilterUnidade('');
    setFilterCpf(''); setFilterEventoGrupo('');
    setSearch(''); setPage(0);
  };

  const activeFilters = [
    {label:filterDateFrom?'De '+filterDateFrom.split('-').reverse().join('/'):'',clear:()=>setFilterDateFrom('')},
    {label:filterDateTo?'Até '+filterDateTo.split('-').reverse().join('/'):'',clear:()=>setFilterDateTo('')},
    {label:search?'Pesquisa textual':'',clear:()=>setSearch('')},
    {label:filterUser?'Usuário informado':'',clear:()=>setFilterUser('')},
    {label:filterCpf?'CPF informado':'',clear:()=>setFilterCpf('')},
    {label:filterRole?'Perfil: '+filterRole:'',clear:()=>setFilterRole('')},
    {label:filterModulo?'Módulo: '+(moduloLabels[filterModulo]||filterModulo):'',clear:()=>setFilterModulo('')},
    {label:filterAcao?'Ação: '+formatAuditAction(filterAcao):'',clear:()=>setFilterAcao('')},
    {label:filterStatus?'Status: '+(filterStatus==='_failures'?'Erros e falhas':filterStatus==='_other'?'Demais situações':filterStatus):'',clear:()=>setFilterStatus('')},
    {label:filterUnidade?'Unidade informada':'',clear:()=>setFilterUnidade('')},
    {label:filterEventoGrupo&&filterEventoGrupo!=='todos'?'Evento: '+(eventoGrupos[filterEventoGrupo]?.label||filterEventoGrupo):'',clear:()=>setFilterEventoGrupo('')},
  ].filter(item=>item.label);
  const modules=useMemo(()=>auditModuleDistribution(current?.rows||[]),[current]);
  const moduleOptions=[...new Set([...Object.keys(moduloLabels).filter(Boolean),...modules.map(m=>m.key).filter(Boolean),...(filterModulo?[filterModulo]:[])])];
  const getCpfDisplay = (log: LogEntry) => {
    const cpf = String((log.detalhes as any)?.usuario_cpf || '');
    if (!cpf) return '-';
    return maskCpf(cpf);
  };

  // Professional activity report
  const openReport = () => {
    if(!canExport||!active.current||exportLock.current)return;
    const today=auditMunicipalDate(new Date());
    const days=auditReportDays(filterDateFrom,filterDateTo);
    resetReport({de:days>=1&&days<=REPORT_MAX_DAYS?filterDateFrom:today,ate:days>=1&&days<=REPORT_MAX_DAYS?filterDateTo:today,unidade:unitId||filterUnidade||''});
    setReportTab('actors');setShowReport(true);
  };

  const generateReport = async () => {
    if(!active.current || !canExport || reportController.current || exportLock.current) return;
    const draft={...reportDraft,unidade:unitId||reportDraft.unidade.trim()};
    const days=auditReportDays(draft.de,draft.ate);
    if(!Number.isFinite(days)||days<1||days>REPORT_MAX_DAYS){setReportError('Informe um período válido de até '+REPORT_MAX_DAYS+' dias.');return;}
    if(draft.unidade.length>120){setReportError('Identificador de unidade inválido.');return;}
    const controller=new AbortController();
    reportController.current=controller;
    const valid=()=>active.current&&!controller.signal.aborted&&reportController.current===controller;
    const cutoff=new Date().toISOString();
    const bounds=auditDateBounds(draft.de,draft.ate);
    setReportLoading(true);setReportResult(null);setReportError('');setReportProgress({n:0,total:0});setReportPage(0);
    try {
      // Only administrative metadata. No patient, before/after, or free-form log payload.
      const scopeQuery=(q:any)=>{
        q=q.gte('created_at',bounds.start).lt('created_at',bounds.end).lte('created_at',cutoff);
        if(draft.unidade)q=q.eq('unidade_id',draft.unidade);
        return q;
      };
      const count=async()=>{
        const {count,error}=await scopeQuery(supabase.from('action_logs').select('id',{head:true,count:'exact'})).abortSignal(controller.signal);
        if(error||count===null)throw Error('Contagem do relatório não confirmada.');
        return count;
      };
      const read=async(from:number,to:number)=>{
        const {data,error}=await scopeQuery(supabase.from('action_logs').select('id,created_at,user_id,user_nome,role,unidade_id,unidade_nome,acao,status,usuario_cpf:detalhes->>usuario_cpf'))
          .order('created_at',{ascending:false}).order('id',{ascending:false}).range(from,to).abortSignal(controller.signal);
        if(error||!data)throw Error('Não foi possível consultar uma página do relatório.');
        return data as ReportEvent[];
      };
      const report=await readAuditReport(count,read,controller.signal,(n,total)=>{if(valid())setReportProgress({n,total});});
      const names=await resolveUnits(report.units.map(row=>({unidade_id:row.unitId,unidade_nome:row.nomeRegistrado})),controller.signal);
      if(valid())setReportResult({report:{...report,units:report.units.map(row=>({...row,nome:auditUnitLabel({unidade_id:row.unitId,unidade_nome:row.nomeRegistrado},names.get(row.unitId))}))},period:{...draft,cutoff}});
    }catch(err){if(valid())setReportError(err instanceof Error?err.message:'Não foi possível confirmar o relatório.');}
    finally{if(reportController.current===controller){reportController.current=null;if(active.current)setReportLoading(false);}}
  };

  const closeReport=(open:boolean)=>{
    if(exportRequest||exportLock.current)return;
    if(!open){
      reportController.current?.abort();reportController.current=null;setReportLoading(false);setReportResult(null);setReportError('');setReportPage(0);
    }
    setShowReport(open);
  };

  const reportTables=()=>{
    if(!reportResult||!reportExportable)throw Error('Nenhum relatório confirmado para exportar.');
    const {report}=reportResult;
    const headers=REPORT_METRICS.map(([label])=>label);
    return [
      {title:'Por responsável identificado',headers:['Nome registrado','CPF mascarado','Perfil registrado','ID do responsável',...headers],rows:report.actors.map(r=>[exportSafeText(r.nome),r.cpf,exportSafeText(r.role),r.userId,...reportMetricCells(r)])},
      {title:'Por unidade registrada',headers:['Unidade','ID da unidade','Responsáveis distintos','Eventos sem responsável individual',...headers],rows:report.units.map(r=>[exportSafeText(r.nome),r.unitId,String(r.actors),String(r.semResponsavel),...reportMetricCells(r)])}
    ];
  };
  const reportMetadata=(motivo:string)=>{
    if(!reportResult)throw Error('Relatório não confirmado.');
    const {period,report}=reportResult;
    return [['Emissor',exportSafeText(user?.nome)],['CPF do emissor',maskCpf(user?.cpf||'')],['Perfil do emissor',exportSafeText(user?.role)],['Emissão (Oriximiná)',new Intl.DateTimeFormat('pt-BR',{timeZone:'America/Santarem',dateStyle:'short',timeStyle:'medium'}).format(new Date())],['Motivo',exportSafeText(motivo)],['Período',period.de+' a '+period.ate],['Abrangência',period.unidade||'Rede municipal autorizada'],['Corte da consulta (UTC)',period.cutoff],['Eventos consultados',String(report.totals.totalAcoes)],['Eventos sem responsável individual',String(report.semResponsavel)],['Cobertura','Contagem inicial e final coincidentes; sem snapshot transacional.'],['Metodologia','Contagem de eventos registrados, não de atendimentos únicos, frequência ou produtividade. Horários dos logins em Oriximiná.']];
  };
  const exportReportPDF=async(motivo:string)=>{
    if(!reportPdfAllowed)throw Error('Use CSV para relatórios com mais de 500 grupos.');
    const esc=auditEscapeHtml;
    // Split the wide report into compact sections for the institutional A4 portrait template.
    const pdfTables=reportTables().flatMap(t=>{
      const identity=[0, t.title==='Por responsável identificado'?3:1];
      const sections=[{title:'Identificação e totais',indices:[0,1,2,3,4]},{title:'Autenticação e erros',indices:[...identity,5,6,7,8,14,15]},{title:'Atendimento e prontuário',indices:[...identity,9,10,11,12,13]}];
      return sections.map(section=>({title:t.title+' — '+section.title,headers:section.indices.map(i=>t.headers[i]),rows:t.rows.map(row=>section.indices.map(i=>row[i]))}));
    });
    const body=reportMetadata(motivo).map(([k,v])=>'<p><strong>'+esc(k)+':</strong> '+esc(v)+'</p>').join('')+
      pdfTables.map(t=>'<h3>'+esc(t.title)+'</h3><table style="width:100%;border-collapse:collapse;font-size:8px"><thead><tr>'+t.headers.map(h=>'<th style="border:1px solid #ddd;padding:3px">'+esc(h)+'</th>').join('')+'</tr></thead><tbody>'+t.rows.map(r=>'<tr>'+r.map(v=>'<td style="border:1px solid #ddd;padding:3px;overflow-wrap:anywhere">'+esc(v)+'</td>').join('')+'</tr>').join('')+'</tbody></table>').join('');
    const hash=await sha256Hex(body);
    const protocolo='AUD-'+format(new Date(),'yyyyMMddHHmmss')+'-'+crypto.randomUUID().replace(/-/g,'').slice(0,16).toUpperCase();
    await registrarExportacao('pdf',motivo,hash,protocolo,true);
    await openPrintDocument('Relatório de Atividade por Profissional e Unidade',body+'<p>Protocolo: '+protocolo+' · SHA-256 do HTML do conteúdo antes do rodapé (não bytes do PDF): '+hash+'</p>',{});
  };
  const exportReportCSV=async(motivo:string)=>{
    const line=(r:string[])=>r.map(auditCsvCell).join(';');
    const content=[...reportMetadata(motivo).map(line),...reportTables().flatMap(t=>['',line([t.title]),line(t.headers),...t.rows.map(line)])].join('\n');
    const hash=await sha256Hex(content);
    const protocolo='AUD-'+format(new Date(),'yyyyMMddHHmmss')+'-'+crypto.randomUUID().replace(/-/g,'').slice(0,16).toUpperCase();
    await registrarExportacao('csv',motivo,hash,protocolo,true);
    const csv=content+'\n'+line(['PROTOCOLO',protocolo])+'\n'+line(['SHA-256 (conteúdo acima, UTF-8 sem BOM, LF)',hash]);
    const blob=new Blob(['\ufeff'+csv],{type:'text/csv;charset=utf-8;'});
    const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download='relatorio_atividade_'+format(new Date(),'yyyyMMdd')+'.csv';a.click();URL.revokeObjectURL(url);
  };

  const startListExport=(format:ExportFormat)=>{
    if(!canExport||loading||!logs.length||exportLock.current)return;
    setExportScope('page');setExportError('');setExportProgress('');setExportRequest(format);
  };
  const filteredExportError=exportRequest==='csv'||exportRequest==='pdf'
    ? auditExportEligibility(exportRequest,filterDateFrom,filterDateTo,totalCount,!!current?.partial) : '';
  const exportList=async(formatType:ExportFormat,motivo:string)=>{
    if(!current||!logs.length||!canExport||!active.current)throw Error('Listagem não confirmada.');
    const scope=exportScope;
    const cutoff=scope==='filtered'?new Date().toISOString():'';
    const snapshotFilters={de:filterDateFrom,ate:filterDateTo,usuario:exportSafeText(filterUser),perfil:filterRole,modulo:filterModulo,acao:filterAcao,status:filterStatus,unidade:unitId||filterUnidade||'rede autorizada',grupo:filterEventoGrupo,cpf_informado:!!filterCpf,busca_informada:!!search,pagina:scope==='page'?page+1:undefined};
    let source=logs;
    let total=totalCount;
    const warning=scope==='page'?searchWarning:'Contagem inicial e final conferidas no corte; não é snapshot transacional. Vínculos da busca confirmada na listagem.';
    if(scope==='filtered'){
      const eligibility=auditExportEligibility(formatType,filterDateFrom,filterDateTo,totalCount,!!current.partial);
      if(eligibility||!current.apply)throw Error(eligibility||'Atualize a listagem antes de exportar.');
      const controller=new AbortController();exportController.current=controller;
      const apply=(q:any)=>current.apply!(q).lte('created_at',cutoff);
      const count=async()=>{
        const {count,error}=await apply(supabase.from('action_logs').select('id',{head:true,count:'exact'})).abortSignal(controller.signal);
        if(error||count===null)throw Error('Contagem da exportação não confirmada.');
        return count;
      };
      const read=async(from:number,to:number)=>{
        const {data,error}=await apply(supabase.from('action_logs').select('id,created_at,user_id,user_nome,role,acao,acao_legivel,tipo_evento,modulo,entidade,entidade_id,paciente_nome,profissional_nome,unidade_id,unidade_nome,status,ip,navegador,dispositivo,sistema_operacional,error_message,campos_alterados,usuario_cpf:detalhes->>usuario_cpf,entidade_registrada:detalhes->>entidade_nome'))
          .order('created_at',{ascending:false}).order('id',{ascending:false}).range(from,to).abortSignal(controller.signal);
        if(error||!data)throw Error('Não foi possível consultar um lote.');
        return (data as any[]).map(row=>{
          const {usuario_cpf,entidade_registrada,...event}=row;
          return enrichAuditRow(redactAuditData({...event,detalhes:{usuario_cpf,entidade_nome:entidade_registrada}}) as EnrichedLog);
        });
      };
      try{source=await readFilteredExport(formatType,count,read,controller.signal,(done,n)=>{if(active.current)setExportProgress(done.toLocaleString('pt-BR')+' de '+n.toLocaleString('pt-BR')+' eventos');});const names=await resolveUnits(source,controller.signal);if(controller.signal.aborted)throw Error('Consulta cancelada.');source=source.map(log=>({...log,unidade_atual:names.get(log.unidade_id)}));total=source.length;}
      finally{if(exportController.current===controller)exportController.current=null;}
    }
    if(!active.current)throw Error('Sessão alterada.');
    const issued=new Date();
    const time=auditEventTime;
    const metadata=[
      ['Emissor',exportSafeText(user?.nome)],['CPF do emissor',maskCpf(user?.cpf||'')],['Perfil do emissor',exportSafeText(user?.role)],['Emissão (Oriximiná)',time(issued.toISOString())],
      ['Motivo',exportSafeText(motivo)],['Abrangência',scope==='filtered'?'Todos os resultados do recorte filtrado':'Página atual'],['Eventos',String(source.length)],['Total consultado',String(total)],
      ['Corte da consulta (UTC)',cutoff||'Página já carregada'],['Filtros',exportSafeText(JSON.stringify(snapshotFilters))],['Aviso',exportSafeText(warning)],['Metodologia','Metadados de eventos; não comprova autoria ou imutabilidade. Busca textual/CPF indicados sem divulgar o termo.']
    ];
    const headers=['Data/Hora (Oriximiná)','Usuário','CPF','Perfil','Ação','Resumo','Módulo','Registro afetado','Entidade','ID registro','Unidade','Status','IP','Dispositivo','Erro','ID evento'];
    const rows=source.map(l=>[time(l.created_at),getAuditActorLabel(l),getCpfDisplay(l),l.role,l.acao_legivel||acaoLabels[l.acao]||l.acao,generateHumanSummary(l),moduloLabels[l.modulo]||l.modulo||l.entidade,l.paciente_nome||l.nome_entidade||'',l.entidade,l.entidade_id,auditUnitLabel(l,l.unidade_atual),l.status,l.ip,formatDispositivo(l),l.error_message||'',l.id].map((v,i)=>i===9||i===15?auditSafeText(String(v??'')):exportSafeText(v)));
    const pdfHeaders=['Data/hora','Responsável / CPF / perfil','Ação / módulo','Registro / unidade','Status / IP','ID do evento'];
    const pdfRows=rows.map(r=>[r[0],[r[1],r[2],r[3]].filter(Boolean).join(' · '),[r[4],r[6]].filter(Boolean).join(' · '),[r[7],r[10]].filter(Boolean).join(' · '),[r[11],r[12]].filter(Boolean).join(' · '),r[15]]);
    const content=formatType==='csv'?auditExportCsv(metadata,headers,rows):auditExportHtml(metadata,pdfHeaders,pdfRows);
    const hash=await sha256Hex(content);
    const protocolo='AUD-'+format(issued,'yyyyMMddHHmmss')+'-'+crypto.randomUUID().replace(/-/g,'').slice(0,16).toUpperCase();
    const hashTarget=formatType==='csv'?'UTF-8 conteúdo antes do rodapé, sem BOM, CRLF':'HTML do conteúdo antes do rodapé, não bytes do PDF';
    setExportProgress('Confirmando registro de auditoria…');
    await registrarExportacao(formatType,motivo,hash,protocolo,false,{scope,count:source.length,total,cutoff,warning,filters:snapshotFilters,hashTarget});
    if(!active.current)throw Error('Sessão alterada.');
    if(formatType==='csv'){
      const footer=[['PROTOCOLO',protocolo],['SHA-256',hash],['ALVO DO HASH',hashTarget]].map(r=>r.map(auditCsvCell).join(';')).join('\r\n');
      const blob=new Blob(['\ufeff'+content+'\r\n'+footer],{type:'text/csv;charset=utf-8;'});
      const url=URL.createObjectURL(blob);const link=document.createElement('a');link.href=url;link.download='auditoria_'+protocolo+'.csv';link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
      toast.success('CSV solicitado — protocolo '+protocolo);
    }else{
      const esc=auditEscapeHtml;
      await openPrintDocument('Relatório de Auditoria',content+'<section style="font-size:9px;overflow-wrap:anywhere"><p>Protocolo: '+esc(protocolo)+'</p><p>SHA-256: '+esc(hash)+'</p><p>'+esc(hashTarget)+'. Solicitação registrada; não comprova impressão ou autoria.</p></section>',{});
    }
  };

  return (
    <div className="space-y-4">
      {/* Header */}
      <header className="rounded-xl border border-border bg-card p-4 sm:p-5 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-start gap-3 min-w-0">
            <div className="rounded-xl bg-primary/10 text-primary p-2.5 shrink-0"><Shield className="h-6 w-6" aria-hidden="true"/></div>
            <div className="min-w-0">
              <p className="text-[11px] uppercase tracking-wider font-semibold text-muted-foreground">Secretaria Municipal de Saúde · Rastreabilidade</p>
              <h1 className="text-xl sm:text-2xl font-bold text-foreground">Logs & Auditoria</h1>
              <p className="text-sm text-muted-foreground">Central de acompanhamento e investigação administrativa</p>
            </div>
          </div>
          <Badge variant="outline">{unitId?'Minha unidade':'Rede municipal'}</Badge>
        </div>
        <div className="flex gap-2 flex-wrap border-t border-border pt-3">
          <Button variant="outline" size="sm" disabled={exportBusy} onClick={() => { cacheRef.current.clear(); unitCache.current.clear(); setPage(0); setRevision(n=>n+1); }}>
            <RefreshCw className="w-4 h-4 mr-1" /> Atualizar
          </Button>
          <Button variant="outline" size="sm" aria-expanded={showFilters} onClick={() => setShowFilters(!showFilters)}>
            <Filter className="w-4 h-4 mr-1" /> Filtros {activeFilters.length>0?"("+activeFilters.length+")":""}
          </Button>
          <Button variant="outline" size="sm" onClick={openReport} disabled={reportLoading || !canExport || exportBusy}>
            <BarChart3 className="w-4 h-4 mr-1" /> {reportLoading ? 'Gerando...' : 'Relatório por Profissional'}
          </Button>
          <Button variant="outline" size="sm" disabled={!canExport || loading || !logs.length || exportBusy} onClick={()=>startListExport('csv')}>
            <Download className="w-4 h-4 mr-1" /> CSV
          </Button>
          <Button variant="outline" size="sm" disabled={!canExport || loading || !logs.length || exportBusy} onClick={()=>startListExport('pdf')}>
            <FileText className="w-4 h-4 mr-1" /> PDF
          </Button>
        </div>
      </header>
      <AuditOverview unitId={unitId} revision={revision} disabled={exportBusy}
        activeRange={{from:filterDateFrom,to:filterDateTo,status:filterStatus,hasOtherFilters:!!(search||filterUser||filterCpf||filterRole||filterModulo||filterAcao||filterUnidade||filterEventoGrupo)}}
        onApply={(range,status)=>{clearFilters();setFilterDateFrom(range.from);setFilterDateTo(range.to);setFilterStatus(status);}}/>

      <Dialog open={!!exportRequest} onOpenChange={(o) => { if (!o && !exportLock.current) { setExportRequest(null); setExportMotivo(''); setExportError(''); } }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Exportação com registro ({exportRequest?.endsWith('csv') ? 'CSV' : 'PDF'})</DialogTitle>
          </DialogHeader>
          <div className="space-y-2">
            <p className="text-sm text-muted-foreground">
              Informe o motivo da exportação (ex.: "Atendimento ao Ofício Judicial nº 045/2026"). O motivo, o emissor e o hash SHA-256 serão enviados à auditoria. A emissão exige confirmação de gravação. Escolha a abrangência da listagem. O relatório por profissional e unidade usa o período confirmado da consulta.
            </p>
            {(exportRequest==='csv'||exportRequest==='pdf')&&<fieldset disabled={exportBusy} className="rounded-lg border p-3 space-y-2">
              <legend className="text-sm font-medium px-1">Abrangência</legend>
              <label className="flex gap-2 items-start text-sm"><input type="radio" name="audit-export-scope" checked={exportScope==='page'} onChange={()=>setExportScope('page')}/>Página atual ({logs.length} eventos)</label>
              <label className="flex gap-2 items-start text-sm"><input type="radio" name="audit-export-scope" checked={exportScope==='filtered'} onChange={()=>setExportScope('filtered')}/>Todos os resultados filtrados (até {EXPORT_LIMITS[exportRequest].toLocaleString('pt-BR')} eventos)</label>
              {exportScope==='filtered'&&<p className="text-xs text-muted-foreground">{filteredExportError||'Nova leitura do recorte com corte no momento da emissão. O total pode variar em relação à listagem.'}</p>}
              {exportScope==='page'&&searchWarning&&<p className="text-xs text-muted-foreground">{searchWarning}</p>}
            </fieldset>}
            {exportError&&<p role="alert" className="text-sm text-destructive">{exportError}</p>}
            {exportBusy&&exportProgress&&<p role="status" className="text-sm text-muted-foreground">{exportProgress}</p>}
            <textarea
              className="w-full min-h-[90px] rounded-md border border-input bg-background p-2 text-sm"
              value={exportMotivo} maxLength={500} disabled={exportBusy}
              onChange={(e) => setExportMotivo(e.target.value)}
              placeholder="Motivo da exportação (mínimo 10 caracteres)"
            />
            <div className="flex justify-end gap-2">
              {exportBusy&&exportScope==='filtered'&&(exportRequest==='csv'||exportRequest==='pdf')&&exportController.current&&<Button variant="outline" onClick={()=>exportController.current?.abort()}>Cancelar consulta</Button>}
              <Button variant="outline" disabled={exportBusy} onClick={() => { setExportRequest(null); setExportMotivo(''); setExportError(''); }}>Cancelar</Button>
              <Button
                disabled={!canExport || exportMotivo.trim().length < 10 || exportMotivo.trim().length > 500 || exportBusy || (!exportRequest?.startsWith('report_') && (loading || !logs.length || (exportScope==='filtered'&&!!filteredExportError)))}
                onClick={async () => {
                  if(!active.current || !canExport || exportLock.current || !exportRequest) return;
                  exportLock.current=true; setExportBusy(true);setExportError('');setExportProgress('Preparando exportação…');
                  try {
                    const reason=exportMotivo.trim();
                    if (exportRequest === 'csv'||exportRequest==='pdf') await exportList(exportRequest,reason);
                    else if (exportRequest === 'report_csv') await exportReportCSV(reason);
                    else await exportReportPDF(reason);
                    if(active.current){setExportRequest(null); setExportMotivo('');}
                  } catch(err) { if(active.current){setExportError(err instanceof Error?err.message:'Exportação não concluída.');toast.error('Exportação não concluída. Confira a auditoria antes de repetir.');} }
                  finally { exportLock.current=false; if(active.current){setExportBusy(false);setExportProgress('');} }
                }}
              >
                {exportBusy ? 'Gerando...' : 'Gerar exportação'}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Search */}
      <section className="rounded-xl border border-border bg-card p-3 space-y-3" aria-label="Busca e filtros">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" aria-hidden="true"/>
          <Input aria-label="Pesquisar eventos de auditoria" placeholder="Pesquisar usuário, paciente, CPF, ação ou registro..." maxLength={100} value={search}
            onChange={e=>{setSearch(e.target.value);setPage(0);}} className="pl-10 pr-20"/>
          {search&&<Button size="sm" variant="ghost" className="absolute right-1 top-1/2 -translate-y-1/2 h-7" onClick={()=>{setSearch('');setPage(0);}}>Limpar</Button>}
        </div>
        <div className="flex flex-wrap gap-1" aria-label="Filtros rápidos de status">
          {[['','Todos'],['sucesso','Sucesso'],['_failures','Erros e falhas'],['tentativa','Tentativas'],['_other','Demais situações']].map(([value,label])=><Button key={value} type="button" size="sm" variant={filterStatus===value?'default':'outline'} aria-pressed={filterStatus===value} onClick={()=>{setFilterStatus(value);setPage(0);}}>{label}</Button>)}
        </div>
        {!!activeFilters.length&&<div className="flex flex-wrap items-center gap-1.5 border-t border-border pt-2" aria-label="Filtros ativos">
          <span className="text-xs text-muted-foreground">Filtros ativos:</span>
          {activeFilters.map((item,i)=><Button key={i+':'+item.label} variant="outline" size="sm" className="h-auto min-h-7 text-xs whitespace-normal" aria-label={'Remover filtro '+item.label} onClick={()=>{item.clear();setPage(0);}}>{item.label}<X className="h-3 w-3 ml-1 shrink-0"/></Button>)}
          <Button size="sm" variant="ghost" onClick={clearFilters}>Limpar todos</Button>
        </div>}
      </section>

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
                    {moduleOptions.map(k => (
                      <SelectItem key={k} value={k}>{moduloLabels[k]||k}</SelectItem>
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
                    <SelectItem value="_failures">Erros e falhas</SelectItem>
                    <SelectItem value="erro">Erro</SelectItem>
                    <SelectItem value="falha">Falha</SelectItem>
                    <SelectItem value="tentativa">Tentativa</SelectItem>
                    <SelectItem value="pendente">Pendente</SelectItem>
                    <SelectItem value="bloqueado">Bloqueado</SelectItem>
                    <SelectItem value="_other">Demais situações</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div><label htmlFor="audit-action" className="text-xs font-medium text-muted-foreground mb-1 block">Código exato da ação</label><Input id="audit-action" maxLength={100} value={filterAcao} onChange={e=>{setFilterAcao(e.target.value);setPage(0);}} placeholder="Ex.: login_sucesso"/></div>
              {!unitId&&<div><label htmlFor="audit-unit" className="text-xs font-medium text-muted-foreground mb-1 block">ID da unidade</label><Input id="audit-unit" maxLength={120} value={filterUnidade} onChange={e=>{setFilterUnidade(e.target.value);setPage(0);}} placeholder="Identificador exato"/></div>}
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
      {!loading&&!queryError&&modules.length>0&&<details className="rounded-xl border border-border bg-card p-3">
        <summary className="cursor-pointer text-sm font-medium">Distribuição por módulo · {logs.length} eventos desta página</summary>
        <div className="mt-3 space-y-2"><p className="text-xs text-muted-foreground">Apenas a página exibida, não o total histórico. Clique em um módulo para filtrar a lista.</p>
          {modules.map(m=><button type="button" key={m.key||'_missing'} disabled={!m.key} onClick={()=>{setFilterModulo(m.key);setPage(0);}} className="w-full grid grid-cols-[minmax(0,130px)_1fr_44px] gap-2 items-center text-left text-xs rounded-md p-1 hover:bg-muted/50 focus-visible:ring-2 focus-visible:ring-ring">
            <span className="truncate" title={moduloLabels[m.key]||m.key||'Não informado'}>{moduloLabels[m.key]||m.key||'Não informado'}</span><span className="h-2 rounded-full bg-muted overflow-hidden"><span className="block h-full bg-primary rounded-full" style={{width:m.percent+'%'}}/></span><span className="text-right tabular-nums">{m.count}</span>
          </button>)}
        </div>
      </details>}
      {/* Table */}
      <Card className="overflow-hidden rounded-xl border-border">
        <div className="border-b border-border bg-card p-3 sm:p-4 space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex min-w-0 items-center gap-3">
              <div className="rounded-xl bg-primary/10 p-2.5 text-primary"><History className="h-5 w-5" aria-hidden="true"/></div>
              <div className="min-w-0"><h2 className="text-base sm:text-lg font-bold tracking-tight">Registros de auditoria</h2><p role="status" className="text-xs text-muted-foreground">{loading?'Consultando registros…':queryError?'Total não confirmado':totalCount.toLocaleString('pt-BR')+' registros no recorte consultado · '+logs.length+' nesta página'}</p></div>
            </div>
            <div className="inline-flex rounded-lg border border-border bg-muted/40 p-1 gap-1" aria-label="Visualização dos registros">
              <Button type="button" size="sm" variant={recordsView==='feed'?'default':'ghost'} aria-pressed={recordsView==='feed'} className="h-8 gap-1.5" onClick={()=>setRecordsView('feed')}><List className="h-4 w-4" aria-hidden="true"/>Linha do tempo</Button>
              <Button type="button" size="sm" variant={recordsView==='table'?'default':'ghost'} aria-pressed={recordsView==='table'} className="h-8 gap-1.5" onClick={()=>setRecordsView('table')}><Table2 className="h-4 w-4" aria-hidden="true"/>Tabela</Button>
            </div>
          </div>
          {!loading&&!queryError&&logs.length>0&&<div className="flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-border/70 pt-3 text-xs">
            <span className="font-semibold text-muted-foreground">Nesta página</span>
            <span className="inline-flex items-center gap-1.5"><CheckCircle2 className="h-4 w-4 text-emerald-600 dark:text-emerald-400" aria-hidden="true"/><strong className="tabular-nums">{feedCounts.success}</strong> sucessos</span>
            <span className="inline-flex items-center gap-1.5"><AlertCircle className="h-4 w-4 text-red-600 dark:text-red-400" aria-hidden="true"/><strong className="tabular-nums">{feedCounts.failure}</strong> erros/falhas</span>
            <span className="inline-flex items-center gap-1.5"><Clock className="h-4 w-4 text-amber-600 dark:text-amber-400" aria-hidden="true"/><strong className="tabular-nums">{feedCounts.other}</strong> demais situações</span>
            <span className="sm:ml-auto text-muted-foreground">Mais recentes primeiro · Horário de Oriximiná</span>
          </div>}
        </div>
        <CardContent className="p-0">
          {queryError ? <div role="alert" className="py-12 px-4 text-center space-y-3"><p className="text-sm text-muted-foreground">{queryError}</p><Button size="sm" variant="outline" onClick={()=>setRevision(n=>n+1)}>Tentar novamente</Button></div> : loading ? (
            <div className="flex items-center justify-center py-16">
              <div className="animate-spin w-6 h-6 border-2 border-primary border-t-transparent rounded-full" />
            </div>
          ) : logs.length === 0 ? (
            <div className="text-center py-16 text-muted-foreground">Nenhum registro encontrado.</div>
          ) : recordsView==='feed' ? <AuditEventFeed events={feedEvents} onOpen={openFeedEvent}/> : (
            <div>
              <div className="md:hidden divide-y divide-border">
                {logs.map(log=><button key={log.id} type="button" onClick={()=>{setDetailState(null);setSelectedLog(log);}} className="block w-full text-left p-3 space-y-2 hover:bg-muted/40 focus-visible:ring-2 focus-visible:ring-ring">
                  <div className="flex flex-wrap items-center justify-between gap-2"><span className="text-xs text-muted-foreground tabular-nums">{auditEventTime(log.created_at)}</span><Badge className={'text-[10px] '+(statusBadge[log.status]||'bg-muted text-muted-foreground')}>{log.status}</Badge></div>
                  <div className="flex justify-between items-center gap-2"><span className="font-semibold text-sm break-words min-w-0">{formatAuditAction(log.acao)}</span><ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground"/></div>
                  <div className="grid grid-cols-2 gap-2 text-xs"><div className="min-w-0"><p className="text-muted-foreground">Usuário · {log.role||'Perfil não informado'}</p><p className="font-medium break-words">{getAuditActorLabel(log)}</p></div><div className="min-w-0"><p className="text-muted-foreground">Registro afetado</p><p className="font-medium break-words">{log.nome_entidade||log.entidade_id||log.entidade}</p></div></div>
                  <div className="flex flex-wrap gap-2 items-center"><Badge variant="outline">{moduloLabels[log.modulo]||log.modulo||log.entidade}</Badge><span className="text-xs text-muted-foreground">{formatDispositivo(log)}</span></div>
                </button>)}
              </div>
              <div className="hidden md:block overflow-x-auto">
              <Table>
                <TableHeader className="bg-muted/40">
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
                    <TableRow key={log.id} className="cursor-pointer hover:bg-muted/50 even:bg-muted/15 transition-colors" onClick={() => {setDetailState(null);setSelectedLog(log);}}>
                      <TableCell className="whitespace-nowrap text-[11px] font-mono">
                        {auditEventTime(log.created_at)}
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
                            <span className="text-[11px] text-muted-foreground line-clamp-1" title={(log as any).human_summary}>
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
                        <Button variant="ghost" size="sm" aria-label="Ver detalhes do evento" className="h-8 w-8 p-0 rounded-full hover:bg-primary/10" onClick={e=>{e.stopPropagation();setDetailState(null);setSelectedLog(log);}}>
                          <Eye className="w-4 h-4 text-primary" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Pagination */}
      {totalPages > 1 && (
        <nav aria-label="Paginação da auditoria" className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border bg-card p-3">
          <p className="text-sm text-muted-foreground">
            Página {page + 1} de {totalPages} · {Math.min(page*ITEMS_PER_PAGE+1,totalCount)}–{Math.min((page+1)*ITEMS_PER_PAGE,totalCount)} de {totalCount.toLocaleString('pt-BR')}
          </p>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" aria-label="Página anterior" disabled={loading || page === 0 || exportBusy} onClick={() => setPage(p => p - 1)}>
              <ChevronLeft className="w-4 h-4" />
            </Button>
            <Button variant="outline" size="sm" aria-label="Próxima página" disabled={loading || page >= totalPages - 1 || exportBusy} onClick={() => setPage(p => p + 1)}>
              <ChevronRight className="w-4 h-4" />
            </Button>
          </div>
        </nav>
      )}

      {/* Detail Side Panel */}
      <Sheet open={!!selectedLog} onOpenChange={open=>{if(!open){setSelectedLog(null);setDetailState(null);}}}>
        <SheetContent className="w-full sm:max-w-2xl overflow-y-auto p-4 sm:p-6">
          <SheetHeader className="border-b pb-4">
            <div className="flex items-center gap-2">
              <div className="p-2 bg-primary/10 rounded-lg text-primary">
                <Shield className="w-5 h-5" />
              </div>
              <div>
                <SheetTitle className="text-xl">Detalhes da Auditoria</SheetTitle>
                <p className="text-xs text-muted-foreground font-mono break-all">{selectedLog?.id}</p>
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
                    <p className="text-base font-semibold leading-tight text-foreground break-words">{selectedLog.acao_legivel || formatAuditAction(selectedLog.acao)}</p>
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
                      <p className="text-sm font-medium">{auditEventTime(selectedLog.created_at)}</p>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <p className="text-[10px] uppercase font-bold text-muted-foreground tracking-wider mb-1">Módulo</p>
                      <p className="text-sm font-medium">{moduloLabels[selectedLog.modulo] || selectedLog.modulo}</p>
                    </div>
                    <div>
                      <p className="text-[10px] uppercase font-bold text-muted-foreground tracking-wider mb-1">Tipo de Evento</p>
                      <Badge variant="outline" className="text-[10px] font-bold uppercase">{selectedLog.tipo_evento || 'Não informado'}</Badge>
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
                      <p className="text-xs font-medium">{auditUnitLabel(selectedLog,selectedLog.unidade_atual)}</p>{selectedLog.unidade_id&&!recordedUnitName(selectedLog)&&!selectedLog.unidade_atual&&<p className="text-[10px] text-muted-foreground">Identificador técnico: {selectedLog.unidade_id}</p>}
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
              <section className="space-y-3">
                <div className="flex items-center justify-between gap-2">
                  <h3 className="flex items-center gap-2 text-sm font-semibold text-primary"><History className="w-4 h-4"/>ALTERAÇÕES REGISTRADAS</h3>
                  {detailConfirmed&&<Badge variant="outline">{comparisons.length} campos</Badge>}
                </div>
                {!detailConfirmed?<p className="text-xs text-muted-foreground">A comparação depende da confirmação do evento completo.</p>:comparisons.length===0?
                  <p className="text-xs text-muted-foreground p-3 rounded-lg border border-dashed">Não há comparação de valores disponível no evento. Isso não comprova que nada foi alterado.</p>:
                  <>
                    <p className="text-xs text-muted-foreground">Dados capturados no evento, não no cadastro atual. Valores não registrados não significam exclusão. Credenciais ficam ocultas.</p>
                    {(showAllChanges?comparisons:comparisons.slice(0,20)).map(row=><div key={row.field} className="rounded-xl border border-border p-3 space-y-2">
                      <div className="flex flex-wrap items-center justify-between gap-1"><p className="text-sm font-semibold break-all">{formatAuditFieldLabel(row.field)}</p><Badge variant="outline" className="text-[10px]">{row.protected?'Protegido':row.source==='explicit'?'Alteração registrada':row.source==='snapshot'?'Snapshot':'Campo informado'}</Badge></div>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                        <div className="min-w-0 rounded-lg border border-border bg-muted/40 p-2.5"><p className="text-[10px] uppercase font-semibold text-muted-foreground mb-1">Antes</p><p className="text-xs break-all whitespace-pre-wrap">{comparisonValue(row.field,row.before)}</p></div>
                        <div className="min-w-0 rounded-lg border border-border bg-primary/5 p-2.5"><p className="text-[10px] uppercase font-semibold text-primary mb-1">Depois</p><p className="text-xs break-all whitespace-pre-wrap">{comparisonValue(row.field,row.after)}</p></div>
                      </div>
                    </div>)}
                    {comparisons.length>20&&<Button variant="outline" size="sm" className="w-full" onClick={()=>setShowAllChanges(v=>!v)}>{showAllChanges?'Mostrar primeiros 20':'Ver todos os '+comparisons.length+' campos'}</Button>}
                  </>}
              </section>
              {detailConfirmed&&<AuditRelatedTimeline key={selectedLog.id} event={selectedLog} unitId={unitId} actionLabel={formatAuditAction}
                onOpen={row=>{setDetailState(null);setSelectedLog(enrichAuditRow({...row,ip:'',detalhes:{}} as EnrichedLog));}}/>}
              {/* 5. CONTEXTO TÉCNICO */}
              <section className="space-y-4">
                <div className="flex items-center gap-2 text-sm font-semibold text-primary">
                  <Monitor className="w-4 h-4" />
                  CONTEXTO TÉCNICO
                </div>
                <div className="grid grid-cols-2 gap-4 bg-muted/30 p-4 rounded-xl border">
                  <div>
                    <p className="text-[10px] uppercase font-bold text-muted-foreground mb-1">Endereço IP</p>
                    <p className="text-xs font-mono break-all">{selectedLog.ip || 'Não registrado'}</p>
                  </div>
                  <div>
                    <p className="text-[10px] uppercase font-bold text-muted-foreground mb-1">Navegador</p>
                    <p className="text-xs break-words">{formatDispositivo(selectedLog)}</p>
                  </div>
                  <div className="col-span-2">
                    <p className="text-[10px] uppercase font-bold text-muted-foreground mb-1">Rota / Origem</p>
                    <p className="text-[11px] font-mono text-muted-foreground break-all">{auditSafeText(String(selectedLog.rota || selectedLog.detalhes?.rota || selectedLog.detalhes?.origin || '-'))}</p>
                    <p className="text-xs text-muted-foreground mt-2">Origem registrada: {selectedLog.origem || 'Não informada'}</p>
                  </div>
                </div>
              </section>

              {/* 6. DADOS TÉCNICOS COMPLETOS */}
              {detailConfirmed&&<Accordion type="single" collapsible className="w-full">
                <AccordionItem value="json-data" className="border-none">
                  <AccordionTrigger className="hover:no-underline bg-muted/50 rounded-xl px-4 py-3 text-xs font-bold text-muted-foreground">
                    VER DADOS TÉCNICOS PROTEGIDOS (JSON)
                  </AccordionTrigger>
                  <AccordionContent className="pt-2">
                    <div className="relative">
                      <pre className="text-[10px] bg-slate-950 text-slate-300 p-4 rounded-xl overflow-auto max-h-[300px] font-mono leading-relaxed">
                        {JSON.stringify(redactAuditData(selectedLog.detalhes,true),null,2)}
                      </pre>
                      <Button 
                        size="icon" 
                        variant="ghost" 
                        aria-label="Copiar JSON protegido" className="absolute top-2 right-2 text-slate-400 hover:text-white hover:bg-white/10"
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
              </Accordion>}
            </div>
          )}
        </SheetContent>
      </Sheet>

      {/* Professional Activity Report Dialog */}
      <Dialog open={showReport && !exportRequest} onOpenChange={closeReport}>
        <DialogContent className="max-w-6xl max-h-[90dvh] overflow-y-auto">
          <DialogHeader><DialogTitle className="flex items-center gap-2"><BarChart3 className="w-5 h-5"/>Relatório de Atividade por Profissional e Unidade</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div className="rounded-xl border border-border p-3 space-y-3">
              <p className="text-xs text-muted-foreground">Consulta independente da listagem: apenas período e unidade. Limite de {REPORT_MAX_DAYS} dias e {REPORT_LIMIT.toLocaleString('pt-BR')} eventos. Não há consultas automáticas.</p>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                <div><label htmlFor="report-from" className="text-xs font-medium">Data inicial</label><Input id="report-from" type="date" value={reportDraft.de} disabled={reportLoading||exportBusy} onChange={e=>resetReport({...reportDraft,de:e.target.value})}/></div>
                <div><label htmlFor="report-to" className="text-xs font-medium">Data final</label><Input id="report-to" type="date" value={reportDraft.ate} disabled={reportLoading||exportBusy} onChange={e=>resetReport({...reportDraft,ate:e.target.value})}/></div>
                <div><label htmlFor="report-unit" className="text-xs font-medium">Unidade</label><Input id="report-unit" value={reportDraft.unidade} maxLength={120} disabled={!!unitId||reportLoading||exportBusy} placeholder="ID exato ou vazio (rede)" onChange={e=>resetReport({...reportDraft,unidade:e.target.value})}/></div>
              </div>
              <div className="flex flex-wrap gap-2 items-center"><Button disabled={!canExport||reportLoading||exportBusy} onClick={()=>void generateReport()}>{reportLoading?'Consultando…':'Gerar relatório'}</Button>
                {reportLoading&&<Button variant="outline" onClick={()=>{reportController.current?.abort();reportController.current=null;setReportLoading(false);setReportError('Consulta cancelada.');}}>Cancelar consulta</Button>}
                {reportLoading&&<span role="status" className="text-xs text-muted-foreground">{reportProgress.total?reportProgress.n.toLocaleString('pt-BR')+' de '+reportProgress.total.toLocaleString('pt-BR')+' eventos':'Conferindo contagem…'}</span>}
              </div>
            </div>
            {reportError&&<p role="alert" className="rounded-lg border border-destructive/40 p-3 text-sm text-destructive">{reportError}</p>}
            {reportResult&&<>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">{[['Eventos',reportResult.report.totals.totalAcoes],['Responsáveis',reportResult.report.actors.length],['Unidades registradas',reportResult.report.units.length],['Sem responsável individual',reportResult.report.semResponsavel],['Logins confirmados',reportResult.report.totals.logins],['Tentativas registradas',reportResult.report.totals.tentativas],['Falhas de login',reportResult.report.totals.falhasLogin],['Erros / falhas',reportResult.report.totals.erros]].map(([label,value])=><div key={label} className="rounded-lg border p-3"><p className="text-xl font-semibold tabular-nums">{Number(value).toLocaleString('pt-BR')}</p><p className="text-xs text-muted-foreground">{label}</p></div>)}</div>
              <p className="text-xs text-muted-foreground">Contagens inicial e final coincidentes no recorte autorizado, sem garantia de snapshot transacional. Nomes e perfis dos responsáveis correspondem ao último evento registrado no período. Nomes históricos de unidades têm prioridade; na ausência, o nome do cadastro atual é identificado como tal. Os números são eventos, não atendimentos únicos, frequência ou produtividade. Horário de Oriximiná.</p>
              <div className="flex flex-wrap justify-between gap-2">
                <div className="flex flex-wrap gap-1">{(['actors','units'] as const).map(tab=><Button key={tab} size="sm" variant={reportTab===tab?'default':'outline'} aria-pressed={reportTab===tab} onClick={()=>{setReportTab(tab);setReportPage(0);}}>{tab==='actors'?'Por profissional':'Por unidade'}</Button>)}</div>
                <div className="flex gap-2"><Button variant="outline" size="sm" disabled={!canExport||!reportExportable||exportBusy} onClick={()=>setExportRequest('report_csv')}><Download className="w-4 h-4 mr-1"/>CSV</Button><Button variant="outline" size="sm" disabled={!canExport||!reportPdfAllowed||exportBusy} onClick={()=>setExportRequest('report_pdf')}><FileText className="w-4 h-4 mr-1"/>PDF</Button></div>
              </div>
              <p className="text-xs text-muted-foreground">CSV e PDF abrangem os dois agrupamentos, independentemente da página exibida.</p>
              {!reportPdfAllowed&&reportExportable&&<p className="text-xs text-muted-foreground">Para mais de 500 grupos, utilize CSV para evitar travar a impressão. O CSV abrange os dois agrupamentos.</p>}
              {reportRows.length===0?<p className="text-center text-muted-foreground py-8">Nenhum registro neste agrupamento.</p>:<>
                <div className="overflow-x-auto rounded-lg border"><Table><TableHeader className="bg-muted/40"><TableRow>
                  <TableHead>{reportTab==='actors'?'Nome / ID':'Unidade / ID'}</TableHead>
                  {reportTab==='actors'?<><TableHead>CPF</TableHead><TableHead>Perfil</TableHead></>:<><TableHead>Responsáveis</TableHead><TableHead>Sem responsável individual</TableHead></>}
                  {REPORT_METRICS.map(([label])=><TableHead key={label} className="text-center whitespace-nowrap">{label}</TableHead>)}
                </TableRow></TableHeader><TableBody>
                  {reportRows.slice(reportPage*reportPageSize,(reportPage+1)*reportPageSize).map(r=><TableRow key={'userId' in r?r.userId:r.unitId}>
                    <TableCell className="font-medium min-w-[180px]">{r.nome}<p className="text-[10px] text-muted-foreground break-all">{'userId' in r?r.userId:r.unitId||'Não registrada'}</p></TableCell>
                    {'userId' in r?<><TableCell className="font-mono text-xs">{r.cpf}</TableCell><TableCell>{r.role}</TableCell></>:<><TableCell>{r.actors}</TableCell><TableCell>{r.semResponsavel}</TableCell></>}
                    {reportMetricCells(r).map((v,i)=><TableCell key={i} className="text-center text-xs whitespace-nowrap tabular-nums">{v}</TableCell>)}
                  </TableRow>)}
                </TableBody></Table></div>
                <nav aria-label="Paginação do relatório" className="flex items-center justify-between gap-2"><p className="text-xs text-muted-foreground">Página {reportPage+1} de {reportPageCount} · {reportRows.length} grupos</p><div className="flex gap-1"><Button size="sm" variant="outline" aria-label="Página anterior" disabled={reportPage===0} onClick={()=>setReportPage(p=>p-1)}><ChevronLeft className="w-4 h-4"/></Button><Button size="sm" variant="outline" aria-label="Próxima página" disabled={reportPage+1>=reportPageCount} onClick={()=>setReportPage(p=>p+1)}><ChevronRight className="w-4 h-4"/></Button></div></nav>
              </>}
            </>}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default Auditoria;
