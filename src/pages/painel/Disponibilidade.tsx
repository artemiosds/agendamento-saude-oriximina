import { useSearchParams } from 'react-router-dom';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Escala } from '@/components/EscalaProfissionais';
import React, { useState, useEffect, useMemo, useRef, useCallback, useSyncExternalStore } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { queryKeys } from '@/hooks/queries/queryKeys';
import { buildGradeDirectory, gradeSummary, filterGradeDirectory, gradePeriod, gradeMode, gradeProfession, type GradeFilter, type GradePeriod, type GradeMetric } from '@/lib/availabilityDirectory';
import { useOperacional } from '@/contexts/OperacionalContext';
import { useAuth } from '@/contexts/AuthContext';
import { usePermissions } from '@/contexts/PermissionsContext';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Plus, Clock, Calendar, Pencil, Trash2, RefreshCw, Loader2, Info, ClipboardList, Search, Settings2, User, Copy, Save, X, Users, CalendarCheck, CalendarClock, Layers, AlertTriangle, ChevronRight, LayoutGrid, List, ShieldCheck } from 'lucide-react';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import { useUnidadeFilter } from '@/hooks/useUnidadeFilter';
import AvailabilityCapacityReview from '@/components/AvailabilityCapacityReview';
import { draftWindowIssues } from '@/lib/availabilityReview';
import type { TurnoDefinition } from '@/components/config/ConfigFluxoAtendimento';
import { UnitScopeNavigator } from '@/components/operacional/UnitScopeNavigator';
import { saveAvailabilityGroup, type AvailabilitySlot } from '@/services/availabilityGroupService';
import { useOperationalUnitScope } from '@/hooks/useOperationalUnitScope';
import { WEEKDAY_PRESETS, selectDraftDays, copyDraftDays, renewalDateAllowed, nominalWeek } from '@/lib/availabilityDraft';

const diasSemanaLabels = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
const diasSemanaFull = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'];

interface BlocoConfig {
  id?: string;
  sourceSalaId?: string;
  sourceNome?: string;
  nome: string;
  tipo: 'padrao' | 'custom';
  horaInicio: string;
  horaFim: string;
  vagas: number;
  ativo: boolean;
}

interface DiaConfig {
  diaSemana: number;
  ativo: boolean;
  blocos: BlocoConfig[];
}

interface DaySchedule {
  ativo: boolean;
  horaInicio: string;
  horaFim: string;
}

interface TurnoDayConfig {
  ativo: boolean;
  turnosAtivos: string[]; // turno ids active for this day
}

interface TurnoVagas {
  [turnoId: string]: number;
}

const defaultDaySchedules: DaySchedule[] = [
  { ativo: false, horaInicio: '08:00', horaFim: '17:00' },
  { ativo: true, horaInicio: '08:00', horaFim: '17:00' },
  { ativo: true, horaInicio: '08:00', horaFim: '17:00' },
  { ativo: true, horaInicio: '08:00', horaFim: '17:00' },
  { ativo: true, horaInicio: '08:00', horaFim: '17:00' },
  { ativo: true, horaInicio: '08:00', horaFim: '17:00' },
  { ativo: false, horaInicio: '08:00', horaFim: '17:00' },
];

const defaultTurnoDays: TurnoDayConfig[] = Array.from({ length: 7 }, (_, i) => ({
  ativo: i >= 1 && i <= 5,
  turnosAtivos: [],
}));

const timeToMin = (t: string) => {
  const [h, m] = t.split(':').map(Number);
  return (h || 0) * 60 + (m || 0);
};

const rangesOverlap = (a1: string, a2: string, b1: string, b2: string) => a1 <= b2 && b1 <= a2;

type ModoDisponibilidade = 'por_hora' | 'por_turno';

const CONFIG_KEY_MODOS = 'config_modos_disponibilidade';
const periodLabels:Record<GradePeriod,string>={vigente:'Vigente',futuro:'Futuro',encerrado:'Encerrado',invalido:'A conferir'};
const emptyGradeFilter:GradeFilter={metric:'todos',period:'todos',mode:'todos',profession:'todos',search:''};

const Disponibilidade: React.FC = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const activeTab = searchParams.get('aba') === 'escala' ? 'escala' : 'grade';

  const selectTab = (value: string) => {
    setSearchParams(previous => {
      const next = new URLSearchParams(previous);
      if (value === 'escala') next.set('aba', 'escala');
      else next.delete('aba');
      return next;
    }, { replace: true });
  };
  const { disponibilidades, funcionarios, unidades, salas, bloqueios, refreshFuncionarios, refreshDisponibilidades } = useOperacional();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editGroupIds, setEditGroupIds] = useState<string[]>([]);
  const [renewal,setRenewal]=useState<{key:string;profissionalId:string;unidadeId:string;end:string;signature:string}|null>(null);
  const [copySource,setCopySource]=useState<number|null>(null);
  const [copyTargets,setCopyTargets]=useState<number[]>([]);
  const copyPanelRef=useRef<HTMLDivElement|null>(null);
  useEffect(()=>{if(!dialogOpen){setRenewal(null);setCopySource(null);setCopyTargets([]);}},[dialogOpen]);
  const [saving, setSaving] = useState(false);
  const [quotaReservation, setQuotaReservation] = useState<number | null>(null);
  const [quotaLoading, setQuotaLoading] = useState(false);
  const [quotaResultKey,setQuotaResultKey]=useState('');
  const [gradeFilter,setGradeFilter]=useState<GradeFilter>(emptyGradeFilter);
  const [gradeLayout,setGradeLayout]=useState<'cards'|'list'>('cards');
  const [managePeriod,setManagePeriod]=useState<'todos'|GradePeriod>('todos');
  const [manageProfId, setManageProfId] = useState<string | null>(null);
  const [reviewGroupKey,setReviewGroupKey]=useState<string|null>(null);
  useEffect(()=>{setReviewGroupKey(null);},[manageProfId,managePeriod]);

  const profissionais = funcionarios.filter(f => f.role === 'profissional' && f.ativo);
  const { unidadesVisiveis, isGlobalAdmin, userUnidadeId } = useUnidadeFilter();
  const {user}=useAuth();
  const {can,loading:permissionsLoading}=usePermissions();
  const scopeKey=JSON.stringify([user?.id,user?.role,userUnidadeId,isGlobalAdmin]);
  const scopeRef=useRef(scopeKey);scopeRef.current=scopeKey;
  const may=(action:'can_create'|'can_edit'|'can_delete',unit?:string)=>!permissionsLoading&&!!user?.id&&can('disponibilidade','can_view')&&can('disponibilidade',action)&&(isGlobalAdmin||!!userUnidadeId)&&(unit===undefined||(isGlobalAdmin||unit===userUnidadeId)&&unidadesVisiveis.some(u=>u.id===unit));
  const { unitId, setUnitId } = useOperationalUnitScope(unidadesVisiveis, isGlobalAdmin);
  const queryClient=useQueryClient();
  // Observe existing directory cache; no additional data fetch or scheduling query.
  const directoryScope=JSON.stringify([user?.id,user?.authUserId,user?.role,user?.usuario==='admin.sms',userUnidadeId]);
  const subscribeDirectory=useCallback((notify:()=>void)=>queryClient.getQueryCache().subscribe(()=>notify()),[queryClient]);
  const getDirectoryState=useCallback(()=>{
    const states=[queryKeys.unidades.all,queryKeys.funcionarios.all,queryKeys.disponibilidades.all].map(key=>queryClient.getQueryState([...key,'operacional',directoryScope]));
    if(states.some(s=>s?.status==='error'))return 'error';
    if(states.every(s=>s?.status==='success'))return 'ready';
    return 'loading';
  },[queryClient,directoryScope]);
  const directoryState=useSyncExternalStore(subscribeDirectory,getDirectoryState,getDirectoryState);
  const directoryReady=directoryState==='ready'&&!permissionsLoading&&!!user?.id&&can('disponibilidade','can_view')&&(isGlobalAdmin||!!userUnidadeId);
  const directoryMayBeLimited=funcionarios.length>=1000||disponibilidades.length>=1000||unidades.length>=1000;
  const getBlockState=useCallback(()=>queryClient.getQueryState([...queryKeys.bloqueios.all,'operacional',directoryScope])?.status==='success',[queryClient,directoryScope]);
  const blocksReady=useSyncExternalStore(subscribeDirectory,getBlockState,getBlockState)&&bloqueios.length<1000;
  const canReviewAgenda=directoryReady&&can('agenda','can_view');
  const canReviewQuotas=directoryReady&&can('usuarios','can_view');
  const canReviewBlocks=directoryReady&&can('feriados_bloqueios','can_view');
  useEffect(()=>{setGradeFilter(emptyGradeFilter);setManageProfId(null);setManagePeriod('todos');},[scopeKey,unitId]);

  // Mode per professional
  const [modosPorProfissional, setModosPorProfissional] = useState<Record<string, ModoDisponibilidade>>({});
  const [turnosGlobais, setTurnosGlobais] = useState<TurnoDefinition[]>([]);
  const [configLoaded, setConfigLoaded] = useState(false);
  const [configError,setConfigError]=useState(false);
  const configRequest=useRef(0);

  const [form, setForm] = useState({
    profissionalId: '', unidadeId: '', salaId: '', dataInicio: '', dataFim: '',
    vagasPorHora: 3, vagasPorDia: 25, duracaoConsulta: 30, intervalo: 0,
  });

  const [modo, setModo] = useState<ModoDisponibilidade>('por_hora');
  const [configDias, setConfigDias] = useState<DiaConfig[]>(
    Array.from({ length: 7 }, (_, i) => ({
      diaSemana: i,
      ativo: i >= 1 && i <= 5,
      blocos: []
    }))
  );
  const [turnoDays, setTurnoDays] = useState<TurnoDayConfig[]>(defaultTurnoDays.map(d => ({ ...d, turnosAtivos: [] })));
  const [turnoVagas, setTurnoVagas] = useState<TurnoVagas>({});

  const [daySchedules, setDaySchedules] = useState<DaySchedule[]>(defaultDaySchedules.map(d => ({ ...d })));
  const dayInputRefs = useRef<(HTMLInputElement | null)[]>([]);

  const dateParts=new Intl.DateTimeFormat('en-CA',{timeZone:'America/Santarem',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date());
  const todayStr=['year','month','day'].map(type=>dateParts.find(p=>p.type===type)?.value||'').join('-');
  const isEditing = editGroupIds.length > 0;
  const quotaKey=JSON.stringify([scopeKey,form.profissionalId,form.unidadeId,form.dataInicio,form.dataFim]);
  const confirmedQuota=canReviewQuotas&&quotaResultKey===quotaKey?quotaReservation:null;

  useEffect(() => {
    setQuotaResultKey('');
    if (!dialogOpen || !canReviewQuotas || !form.profissionalId || !form.unidadeId || !form.dataInicio || !form.dataFim || form.dataInicio>form.dataFim || (!isGlobalAdmin&&form.unidadeId!==userUnidadeId) || !unidadesVisiveis.some(u=>u.id===form.unidadeId)) {
      setQuotaReservation(null);
      setQuotaLoading(false);
      return;
    }
    let cancelled = false;
    setQuotaLoading(true);
    setQuotaReservation(null);
    const read = async () => {
      const { data, error, count } = await supabase.from('quotas_externas')
        .select('vagas_total',{count:'exact'})
        .eq('profissional_interno_id', form.profissionalId)
        .eq('unidade_id', form.unidadeId)
        .eq('ativo', true)
        .lte('periodo_inicio', form.dataFim)
        .gte('periodo_fim', form.dataInicio);
      if (cancelled) return;
      setQuotaReservation(error||!data||count!==data.length ? null : data.reduce((sum, quota) => sum + Math.max(0, quota.vagas_total || 0), 0));
      setQuotaResultKey(quotaKey);
      setQuotaLoading(false);
    };
    void read().catch(()=>{if(!cancelled){setQuotaReservation(null);setQuotaLoading(false);}});
    return () => { cancelled = true; };
  }, [dialogOpen, quotaKey, canReviewQuotas, isGlobalAdmin, userUnidadeId]);

  // Mode is a draft until the atomic grade RPC confirms the write.
  const loadConfig=useCallback(async()=>{
    const request=++configRequest.current,scope=scopeKey;
    setConfigLoaded(false);setConfigError(false);
    try{
      const {data,error}=await supabase.from('system_config').select('configuracoes').eq('id','default').maybeSingle();
      if(request!==configRequest.current||scopeRef.current!==scope)return false;
      if(error||!data||!data.configuracoes||typeof data.configuracoes!=='object'||Array.isArray(data.configuracoes))throw error||new Error('Configuração não confirmada.');
      const cfg=data.configuracoes as any;
      setModosPorProfissional(cfg[CONFIG_KEY_MODOS]||{});
      setTurnosGlobais(Array.isArray(cfg.config_fluxo_atendimento?.turnos)?cfg.config_fluxo_atendimento.turnos:[]);
      setConfigLoaded(true);return true;
    }catch{
      if(request===configRequest.current&&scopeRef.current===scope){setConfigError(true);setConfigLoaded(false);}
      return false;
    }
  },[scopeKey]);
  useEffect(()=>{setDialogOpen(false);setManageProfId(null);setEditGroupIds([]);setModosPorProfissional({});setTurnosGlobais([]);void loadConfig();return()=>{configRequest.current++;};},[loadConfig]);

  const activeTurnos = turnosGlobais.filter(t => t.ativo);

  const suggestedVagasHora = useMemo(() => {
    const totalMin = form.duracaoConsulta + form.intervalo;
    if (totalMin <= 0) return 1;
    return Math.floor(60 / totalMin) || 1;
  }, [form.duracaoConsulta, form.intervalo]);

  const activeDaysCount = modo === 'por_hora'
    ? daySchedules.filter(ds => ds.ativo).length
    : configDias.filter(d=>d.ativo&&d.blocos.some(b=>b.ativo)).length;

  const groups = useMemo(() => {
    const map = new Map<string, typeof disponibilidades>();
    disponibilidades.forEach(d => {
      const key = `${d.profissionalId}|${d.unidadeId}|${d.dataInicio}|${d.dataFim}`;
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(d);
    });
    return map;
  }, [disponibilidades]);

  // Detect if a group is turno-based (vagas_por_hora === 0 convention)
  const isGroupTurno = (records: typeof disponibilidades) => {
    return records.some(r => r.vagasPorHora === 0);
  };

  const openNew = () => {
    if(!configLoaded||!may('can_create')||gradeWriteInFlight.current)return;
    setRenewal(null);setCopySource(null);setCopyTargets([]);
    setEditGroupIds([]);
    setForm({ profissionalId: '', unidadeId: isGlobalAdmin && unitId !== 'all' ? unitId : '', salaId: '', dataInicio: '', dataFim: '', vagasPorHora: 3, vagasPorDia: 25, duracaoConsulta: 30, intervalo: 0 });
    setDaySchedules(defaultDaySchedules.map(d => ({ ...d })));
    setModo('por_hora');
    setConfigDias(Array.from({ length: 7 }, (_, i) => ({
      diaSemana: i,
      ativo: i >= 1 && i <= 5,
      blocos: []
    })));
    setTurnoDays(defaultTurnoDays.map(d => ({ ...d, turnosAtivos: [] })));
    setTurnoVagas({});
    setDialogOpen(true);
  };

  const openEditGroup = (groupKey: string,renew=false) => {
    const records = groups.get(groupKey);
    if (!records || records.length === 0) return;
    const first = records[0];
    if(!configLoaded||!may(renew?'can_create':'can_edit',first.unidadeId)||gradeWriteInFlight.current||(!renew&&first.dataFim<todayStr))return;
    if(renew&&(!directoryReady||gradePeriod(first.dataInicio,first.dataFim,todayStr)==='invalido'||!unidadesVisiveis.some(u=>u.id===first.unidadeId&&u.ativo))){toast.error('Não foi possível confirmar a origem da renovação.');return;}
    if(!profissionais.some(p=>p.id===first.profissionalId)){toast.error('Profissional ativo não localizado. Preserve a grade e confira o cadastro.');return;}
    const mixed=records.some(r=>r.vagasPorHora===0)&&records.some(r=>r.vagasPorHora!==0);
    const seenDays=new Set<number>();
    const incompatible=records.some(r=>!Array.isArray(r.diasSemana)||r.diasSemana.length===0||r.diasSemana.some(d=>!Number.isInteger(d)||d<0||d>6))||(!isGroupTurno(records)&&records.some(r=>r.salaId!==first.salaId||r.vagasPorHora!==first.vagasPorHora||r.vagasPorDia!==first.vagasPorDia||r.duracaoConsulta!==first.duracaoConsulta||r.diasSemana.some(d=>{if(seenDays.has(d))return true;seenDays.add(d);return false;})));
    if(mixed||incompatible){toast.error('Esta configuração não pode ser reconstruída com segurança pelo formulário atual. Nenhum horário foi alterado.');return;}
    if(renew&&!isGroupTurno(records)&&first.salaId&&!salas.some(s=>s.id===first.salaId&&s.unidadeId===first.unidadeId&&s.ativo)){toast.error('A sala anterior não está ativa. Configure um novo período manualmente.');return;}
    setRenewal(renew?{key:groupKey,profissionalId:first.profissionalId,unidadeId:first.unidadeId,end:first.dataFim,signature:JSON.stringify([...records].sort((a,b)=>a.id.localeCompare(b.id)))}:null);
    setCopySource(null);setCopyTargets([]);
    setEditGroupIds(renew?[]:records.map(r => r.id));

    const profModo = modosPorProfissional[first.profissionalId] || 'por_hora';
    const isTurno = isGroupTurno(records);

    setForm({
      profissionalId: first.profissionalId, unidadeId: first.unidadeId, salaId: first.salaId || '',
      dataInicio: renew?'':first.dataInicio, dataFim: renew?'':first.dataFim,
      vagasPorHora: first.vagasPorHora, vagasPorDia: first.vagasPorDia,
      duracaoConsulta: first.duracaoConsulta || 30, intervalo: 0,
    });

    // Opening a saved grade must not carry the other mode's previous draft.
    const sourceDays=new Set(records.flatMap(r=>r.diasSemana));
    setDaySchedules(defaultDaySchedules.map((ds,index)=>({...ds,ativo:sourceDays.has(index)})));
    setConfigDias(Array.from({length:7},(_,diaSemana)=>({diaSemana,ativo:sourceDays.has(diaSemana),blocos:[]})));
    setTurnoDays(defaultTurnoDays.map(d=>({...d,turnosAtivos:[]})));setTurnoVagas({});
    if (isTurno) {
      setModo('por_turno');
      // Reconstruct DiaConfig from records
      const newConfigDias: DiaConfig[] = Array.from({ length: 7 }, (_, i) => ({
        diaSemana: i,
        ativo: false,
        blocos: []
      }));

      records.forEach(r => {
        // For turno records, salaId stores the turno ID or custom name
        const turnoId = r.salaId || '';
        const turnoObj = turnosGlobais.find(t => t.id === turnoId);
        const tipo: 'padrao' | 'custom' = turnoObj ? 'padrao' : 'custom';
        
        r.diasSemana.forEach(dayNum => {
          if (dayNum >= 0 && dayNum <= 6) {
            newConfigDias[dayNum].ativo = true;
            newConfigDias[dayNum].blocos.push({
              id: renew?undefined:r.id,
              sourceSalaId:turnoId,
              sourceNome:turnoObj?.nome||turnoId||'Turno',
              nome: turnoObj?.nome || turnoId || 'Turno',
              tipo,
              horaInicio: r.horaInicio,
              horaFim: r.horaFim,
              vagas: r.vagasPorDia,
              ativo: true
            });
          }
        });
      });

      setConfigDias(newConfigDias);
    } else {
      setModo('por_hora');
      const newSchedules = defaultDaySchedules.map(ds => ({ ...ds, ativo: false }));
      records.forEach(r => {
        r.diasSemana.forEach(dayNum => {
          if (dayNum >= 0 && dayNum <= 6) {
            newSchedules[dayNum] = { ativo: true, horaInicio: r.horaInicio, horaFim: r.horaFim };
          }
        });
      });
      setDaySchedules(newSchedules);
    }
    setDialogOpen(true);
  };

  // Handle professional change - load saved mode
  const handleProfissionalChange = (profId: string) => {
    if(renewal||gradeWriteInFlight.current)return;
    setCopySource(null);setCopyTargets([]);
    const prof = profissionais.find(p => p.id === profId);
    setForm(p => ({
      ...p,
      profissionalId: profId,
      unidadeId: prof?.unidadeId || p.unidadeId,
      salaId: prof?.salaId || '',
    }));
    const savedModo = modosPorProfissional[profId] || 'por_hora';
    setModo(savedModo);
  };

  const handleModoChange = (newModo: ModoDisponibilidade) => {
    setCopySource(null);setCopyTargets([]);
    setModo(newModo);
    // Initialize turno vagas with defaults
    if (newModo === 'por_turno') {
      const activeGlobalTurnos = turnosGlobais.filter(t => t.ativo);
      setConfigDias(prev => prev.map(pd => ({
        ...pd,
        blocos: pd.ativo && pd.blocos.length === 0 
          ? activeGlobalTurnos.map(t => ({
              nome: t.nome,
              tipo: 'padrao',
              horaInicio: t.horaInicio,
              horaFim: t.horaFim,
              vagas: 20,
              ativo: true
            }))
          : pd.blocos
      })));
    }
  };

  // Day validation for por_hora
  const getDayErrors = () => {
    if (modo !== 'por_hora') return {};
    const errors: Record<number, string> = {};
    daySchedules.forEach((ds, i) => {
      if (!ds.ativo) return;
      const startMin = timeToMin(ds.horaInicio);
      const endMin = timeToMin(ds.horaFim);
      if (endMin <= startMin) errors[i] = 'Hora Fim deve ser maior que Hora Início';
      else if (startMin < 360 || endMin > 1320) errors[i] = 'Horário deve estar entre 06:00 e 22:00';
    });
    return errors;
  };

  const dayErrors = getDayErrors();
  const hasDateError = form.dataInicio && form.dataFim && form.dataFim < form.dataInicio;
  const renewalValid=!renewal||(!isEditing&&form.profissionalId===renewal.profissionalId&&form.unidadeId===renewal.unidadeId&&renewalDateAllowed(form.dataInicio,form.dataFim,renewal.end,todayStr));
  const canSave = renewalValid&&configLoaded&&may(isEditing?'can_edit':'can_create',form.unidadeId)&&activeDaysCount > 0 && !hasDateError && Object.keys(dayErrors).length === 0 && !saving && form.profissionalId && form.unidadeId && form.dataInicio && form.dataFim;

  const checkOverlap = (): string | null => {
    for (const [key, records] of groups.entries()) {
      const first = records[0];
      if (first.profissionalId !== form.profissionalId || first.unidadeId !== form.unidadeId) continue;
      const groupIds = records.map(r => r.id);
      if (isEditing && editGroupIds.every(id => groupIds.includes(id))) continue;
      if (rangesOverlap(form.dataInicio, form.dataFim, first.dataInicio, first.dataFim)) {
        return 'Este profissional já possui disponibilidade cadastrada neste período para esta unidade.';
      }
    }
    return null;
  };

  const gradeWriteInFlight = useRef(false);
  const persistGrade = async (
    ids: string[],
    group: Pick<(typeof disponibilidades)[number], 'profissionalId' | 'unidadeId' | 'dataInicio' | 'dataFim'>,
    slots: AvailabilitySlot[],
    successMessage: string,
  ) => {
    if (gradeWriteInFlight.current) return false;
    const action=slots.length===0?'can_delete':ids.length?'can_edit':'can_create';
    if(!may(action,group.unidadeId)){toast.error('Sem permissão para alterar esta grade.');return false;}
    if(ids.length){const previous=disponibilidades.filter(d=>ids.includes(d.id));if(previous.length!==ids.length||previous.some(d=>!may(action,d.unidadeId)||d.dataFim<todayStr||(slots.length===0&&d.dataInicio<=todayStr))){toast.error('Período protegido ou grade desatualizada. Atualize os dados.');return false;}}
    const scope=scopeKey;
    gradeWriteInFlight.current = true;
    setSaving(true);
    try {
      await saveAvailabilityGroup(ids, group, slots);
      if(scopeRef.current!==scope)return false;
      if(slots.length)setModosPorProfissional(old=>({...old,[group.profissionalId]:slots.some(s=>s.vagasPorHora===0)?'por_turno':'por_hora'}));
      toast.success(successMessage);
      await refreshDisponibilidades().catch(error=>{console.error('Erro ao atualizar a lista de disponibilidades:',error);if(scopeRef.current===scope)toast.warning('Gravação confirmada, mas a lista não foi atualizada. Utilize Atualizar.');});
      return scopeRef.current===scope;
    } catch (err) {
      if(scopeRef.current!==scope)return false;
      const error = err as { code?: string; message?: string } | null;
      console.error('Erro ao gravar a grade de disponibilidade:', err);
      const knownError = ['40001', '23P01', '42501', '22023'].includes(error?.code || '');
      toast.error(knownError && error?.message
        ? error.message
        : 'Não foi possível confirmar a alteração. Atualize a grade e confira os horários antes de tentar novamente.');
      return false;
    } finally {
      setSaving(false);
      gradeWriteInFlight.current = false;
    }
  };

  const handleSave = async () => {
    if(!configLoaded||!may(isEditing?'can_edit':'can_create',form.unidadeId)||gradeWriteInFlight.current)return;
    if(!profissionais.some(p=>p.id===form.profissionalId)||!unidadesVisiveis.some(u=>u.id===form.unidadeId&&u.ativo)){toast.error('Confirme profissional ativo e unidade autorizada.');return;}
    if(renewal){const source=groups.get(renewal.key);if(!renewalValid||!source||JSON.stringify([...source].sort((a,b)=>a.id.localeCompare(b.id)))!==renewal.signature){toast.error('Confira o novo período ou reabra a renovação: a origem pode ter mudado. Nenhuma grade foi gravada.');return;}}
    if (!form.profissionalId || !form.unidadeId || !form.dataInicio || !form.dataFim) {
      toast.error('Preencha todos os campos obrigatórios.');
      return;
    }
    if (hasDateError) {
      toast.error('Data Fim deve ser posterior à Data Início.');
      return;
    }

    let slots: AvailabilitySlot[];
    if (modo === 'por_hora') {
      const activeDays = daySchedules.map((ds, i) => ({ ...ds, dayNum: i })).filter(ds => ds.ativo);
      if (activeDays.length === 0) { toast.error('Ative pelo menos um dia da semana.'); return; }
      if (Object.keys(dayErrors).length > 0) { toast.error('Corrija os erros de horário antes de salvar.'); return; }

      for (const day of activeDays) {
        const startH = parseInt(day.horaInicio.split(':')[0]);
        const endH = parseInt(day.horaFim.split(':')[0]);
        const hoursCount = endH - startH;
        const maxPossible = hoursCount * form.vagasPorHora;
        if (form.vagasPorDia > maxPossible) {
          toast.error(`${diasSemanaFull[day.dayNum]}: Total/dia (${form.vagasPorDia}) excede máximo possível (${maxPossible}).`);
          return;
        }
      }
      slots = activeDays.map(day => ({
        salaId: form.salaId, horaInicio: day.horaInicio, horaFim: day.horaFim,
        vagasPorHora: form.vagasPorHora, vagasPorDia: form.vagasPorDia,
        diasSemana: [day.dayNum], duracaoConsulta: form.duracaoConsulta,
      }));
    } else {
      slots = configDias.filter(dia => dia.ativo).flatMap(dia => dia.blocos.filter(bloco => bloco.ativo).map(bloco => {
        const turno = turnosGlobais.find(item => item.nome === bloco.nome);
        return {
          salaId: bloco.sourceSalaId!==undefined&&bloco.sourceNome===bloco.nome ? bloco.sourceSalaId : bloco.tipo === 'padrao' && turno ? turno.id : bloco.nome,
          horaInicio: bloco.horaInicio, horaFim: bloco.horaFim,
          vagasPorHora: 0, vagasPorDia: bloco.vagas,
          diasSemana: [dia.diaSemana], duracaoConsulta: 0,
        };
      }));
      if (slots.length === 0) { toast.error('Ative pelo menos um dia com turnos.'); return; }
    }
    const overlapMsg = checkOverlap();
    if (overlapMsg) { toast.error(overlapMsg); return; }

    const message = renewal ? 'Novo período criado. Grade anterior preservada!' : isEditing ? 'Disponibilidade atualizada!'
      : modo === 'por_hora' ? `${slots.length} registro(s) criado(s)!` : 'Disponibilidade por turno salva!';
    if (await persistGrade(editGroupIds, form, slots, message)) setDialogOpen(false);
  };

  const updateDaySchedule = (dayIndex: number, field: keyof DaySchedule, value: any) => {
    setDaySchedules(prev => prev.map((ds, i) => {
      if (i !== dayIndex) return ds;
      if (field === 'ativo' && !value) return { ...ds, ativo: false, horaInicio: '08:00', horaFim: '17:00' };
      return { ...ds, [field]: value };
    }));
    if (field === 'ativo' && value) {
      setTimeout(() => dayInputRefs.current[dayIndex]?.focus(), 100);
    }
  };

  const toggleDiaConfig = (dayIndex: number, ativo: boolean) => {
    setConfigDias(prev => prev.map((pd, i) => {
      if (i !== dayIndex) return pd;
      // When activating, if it has no blocks, add defaults from global templates
      const activeGlobalTurnos = turnosGlobais.filter(t => t.ativo);
      const newBlocks = (ativo && pd.blocos.length === 0) 
        ? activeGlobalTurnos.map(t => ({
            nome: t.nome,
            tipo: 'padrao' as const,
            horaInicio: t.horaInicio,
            horaFim: t.horaFim,
            vagas: 20,
            ativo: true
          }))
        : pd.blocos;
      return { ...pd, ativo, blocos: newBlocks };
    }));
  };

  const addBlocoToDia = (dayIndex: number) => {
    setConfigDias(prev => prev.map((pd, i) => {
      if (i !== dayIndex) return pd;
      return {
        ...pd,
        blocos: [
          ...pd.blocos,
          { nome: 'Novo Turno', tipo: 'custom', horaInicio: '13:00', horaFim: '18:00', vagas: 10, ativo: true }
        ]
      };
    }));
  };

  const removeBlocoFromDia = (dayIndex: number, blocoIndex: number) => {
    setConfigDias(prev => prev.map((pd, i) => {
      if (i !== dayIndex) return pd;
      return {
        ...pd,
        blocos: pd.blocos.filter((_, bi) => bi !== blocoIndex)
      };
    }));
  };

  const updateBlocoInDia = (dayIndex: number, blocoIndex: number, field: keyof BlocoConfig, value: any) => {
    setConfigDias(prev => prev.map((pd, i) => {
      if (i !== dayIndex) return pd;
      return {
        ...pd,
        blocos: pd.blocos.map((b, bi) => bi === blocoIndex ? { ...b, [field]: value } : b)
      };
    }));
  };

  // Draft shortcuts do not call the database. Disabled days keep their draft values.
  const draftDays=modo==='por_hora'?daySchedules:configDias;
  const applyDayPreset=(days:readonly number[])=>{
    if(saving||gradeWriteInFlight.current)return;
    setCopySource(null);setCopyTargets([]);
    if(modo==='por_hora')setDaySchedules(prev=>selectDraftDays(prev,days,day=>({...day,ativo:true})));
    else setConfigDias(prev=>selectDraftDays(prev,days,day=>({...day,ativo:true,blocos:day.blocos.length?day.blocos:activeTurnos.map(t=>({nome:t.nome,tipo:'padrao' as const,horaInicio:t.horaInicio,horaFim:t.horaFim,vagas:20,ativo:true}))})));
  };
  const copyDayConfig=(fromIndex:number)=>{
    if(saving||!draftDays[fromIndex]?.ativo)return;
    if(modo==='por_turno'&&!configDias[fromIndex].blocos.some(b=>b.ativo)){toast.error('Configure pelo menos um bloco no dia de origem.');return;}
    setCopySource(fromIndex);setCopyTargets([]);
    requestAnimationFrame(()=>copyPanelRef.current?.scrollIntoView({block:'nearest'}));
  };
  const applyCopy=()=>{
    if(saving||gradeWriteInFlight.current||copySource===null||!draftDays[copySource]?.ativo||!copyTargets.length)return;
    if(modo==='por_turno'&&!configDias[copySource].blocos.some(b=>b.ativo))return;
    if(!window.confirm('Copiar a configuração para os dias selecionados? Os horários desses dias serão substituídos somente neste formulário, sem gravar no banco.'))return;
    if(modo==='por_hora')setDaySchedules(prev=>copyDraftDays(prev,copySource,copyTargets,(from,to)=>({...to,...from,ativo:true})));
    else setConfigDias(prev=>copyDraftDays(prev,copySource,copyTargets,(from,to)=>({...to,ativo:true,blocos:from.blocos.map(b=>({...b,id:undefined}))})));
    setCopySource(null);setCopyTargets([]);toast.success('Configuração copiada no formulário. Confira antes de salvar.');
  };
  const draftSummary=nominalWeek(modo,daySchedules,configDias,form.vagasPorDia);
  const draftIssues=draftWindowIssues(draftSummary.days);
  const draftOverlap=dialogOpen&&form.profissionalId&&form.unidadeId&&form.dataInicio&&form.dataFim&&!hasDateError?checkOverlap():null;

  const filteredSalas = salas.filter(s => s.unidadeId === form.unidadeId && s.ativo);

  const handleRefresh = async () => {
    try{const [, ,ok]=await Promise.all([refreshFuncionarios(),refreshDisponibilidades(),loadConfig()]);if(ok)toast.success('Dados atualizados!');else toast.error('Configuração não confirmada. Tente novamente.');}catch{toast.error('Não foi possível atualizar todos os dados. Tente novamente.');}
  };

  // Calculate turno weekly summary
  const turnoWeeklySummary = useMemo(() => {
    if (modo !== 'por_turno') return { totalVagas: 0, diasAtivos: 0, turnosConfig: 0 };
    let totalVagas = 0;
    let diasAtivos = 0;
    let totalTurnos = 0;
    configDias.forEach(pd => {
      if (!pd.ativo) return;
      diasAtivos++;
      pd.blocos.forEach(b => {
        if (!b.ativo) return;
        totalTurnos++;
        totalVagas += b.vagas;
      });
    });
    return { totalVagas, diasAtivos, turnosConfig: totalTurnos };
  }, [modo, configDias]);

  // Independent read-only projection: the original groups map remains the source for all writes.
  const unitProfGroups=useMemo(()=>buildGradeDirectory(groups,funcionarios,unidadesVisiveis,unitId,isGlobalAdmin,userUnidadeId,todayStr),[groups,funcionarios,unidadesVisiveis,unitId,isGlobalAdmin,userUnidadeId,todayStr]);
  const summary=useMemo(()=>gradeSummary(unitProfGroups,todayStr),[unitProfGroups,todayStr]);
  const professions=useMemo(()=>[...new Set(unitProfGroups.map(([,e])=>gradeProfession(e.prof)))].sort((a,b)=>a.localeCompare(b,'pt-BR')),[unitProfGroups]);
  const filteredProfGroups=useMemo(()=>filterGradeDirectory(unitProfGroups,unidadesVisiveis,gradeFilter,todayStr),[unitProfGroups,unidadesVisiveis,gradeFilter,todayStr]);
  const manageProfData=directoryReady&&manageProfId?unitProfGroups.find(([id])=>id===manageProfId):undefined;
  const selectMetric=(metric:GradeMetric)=>setGradeFilter({...emptyGradeFilter,metric});
  const periodBadge=(period:GradePeriod)=><Badge variant="outline" className={cn('text-[10px]',period==='vigente'&&'text-emerald-700 dark:text-emerald-300',period==='invalido'&&'text-destructive')}>{periodLabels[period]}</Badge>;
  const retryDirectory=()=>void Promise.allSettled([queryClient.invalidateQueries({queryKey:queryKeys.unidades.all}),refreshFuncionarios(),refreshDisponibilidades()]);
  const openManage=(id:string)=>{setReviewGroupKey(null);setManagePeriod('todos');setManageProfId(id);};
  const reviewControl=(key:string,first:(typeof disponibilidades)[number])=>{
    if(!directoryReady||gradePeriod(first.dataInicio,first.dataFim,todayStr)==='invalido'||(!isGlobalAdmin&&first.unidadeId!==userUnidadeId))return null;
    const expanded=reviewGroupKey===key&&!dialogOpen;
    return <div className="border-t pt-2 space-y-2"><Button type="button" size="sm" variant="outline" aria-expanded={expanded} className="clinical-record-action gap-1.5" onClick={()=>setReviewGroupKey(expanded?null:key)}><CalendarCheck className="w-4 h-4"/>{expanded?'Fechar conferência':'Conferir capacidade e bloqueios'}</Button>{expanded&&<AvailabilityCapacityReview key={scopeKey+key} profissionalId={first.profissionalId} unidadeId={first.unidadeId} inicio={first.dataInicio} fim={first.dataFim} today={todayStr} scope={scopeKey} grades={disponibilidades.filter(d=>isGlobalAdmin||d.unidadeId===userUnidadeId)} blocks={bloqueios} directoryComplete={!directoryMayBeLimited} blocksReady={blocksReady} canReadAgenda={canReviewAgenda} canReadQuotas={canReviewQuotas} canReadBlocks={canReviewBlocks}/>}</div>;
  };

  const openNewForProf = (profId: string) => {
    if(!configLoaded||!may('can_create')||gradeWriteInFlight.current)return;
    const prof = profissionais.find(p => p.id === profId);
    if(!prof)return;
    setRenewal(null);setCopySource(null);setCopyTargets([]);
    setEditGroupIds([]);
    setForm({
      profissionalId: profId,
      unidadeId: isGlobalAdmin && unitId !== 'all' ? unitId : prof?.unidadeId || '',
      salaId: prof?.salaId || '',
      dataInicio: '', dataFim: '',
      vagasPorHora: 3, vagasPorDia: 25, duracaoConsulta: 30, intervalo: 0,
    });
    const savedModo = modosPorProfissional[profId] || 'por_hora';
    setModo(savedModo);
    setConfigDias(Array.from({length:7},(_,day)=>({diaSemana:day,ativo:day>=1&&day<=5,blocos:[]})));
    setDaySchedules(defaultDaySchedules.map(d => ({ ...d })));
    setTurnoDays(defaultTurnoDays.map(d => ({ ...d, turnosAtivos: [] })));
    setTurnoVagas({});
    setDialogOpen(true);
  };

  return (
    <div className="clinical-hub space-y-3 animate-fade-in min-w-0">
      <header className="clinical-hub-hero flex flex-wrap items-center gap-3">
        <span className="clinical-patient-avatar flex items-center justify-center shrink-0"><CalendarClock className="w-5 h-5" aria-hidden="true"/></span>
        <div className="flex-1 min-w-[9rem]">
          <p className="clinical-hub-eyebrow">Gestão operacional</p>
          <h1 className="clinical-hub-name text-xl font-bold font-display">Disponibilidade</h1>
          <p className="clinical-patient-sub text-xs mt-1">Horários e vagas dos profissionais{activeTab==='grade'&&directoryReady&&` · ${summary.periodos} período(s) na seleção`}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={handleRefresh} size="sm" className="clinical-hub-new gap-1.5">
            <RefreshCw className="w-4 h-4" />Atualizar
          </Button>
          <Button onClick={openNew} disabled={!configLoaded||!may('can_create')||saving} size="sm" className="clinical-hub-new gap-1.5">
            <Plus className="w-4 h-4" />Configurar
          </Button>
        </div>
      </header>
      <Tabs value={activeTab} onValueChange={selectTab}>
        <TabsList className="clinical-hub-tabs w-full h-auto p-1 bg-transparent rounded-none">
          <TabsTrigger value="grade" className="clinical-hub-tab flex-1 gap-1.5 data-[state=active]:text-primary data-[state=active]:border-primary data-[state=active]:bg-accent data-[state=active]:shadow-none"><CalendarCheck className="w-4 h-4 shrink-0"/>Grade de atendimento</TabsTrigger>
          <TabsTrigger value="escala" className="clinical-hub-tab flex-1 gap-1.5 data-[state=active]:text-primary data-[state=active]:border-primary data-[state=active]:bg-accent data-[state=active]:shadow-none"><Calendar className="w-4 h-4 shrink-0"/>Escala dos profissionais</TabsTrigger>
        </TabsList>
      <TabsContent value="escala"><Escala /></TabsContent><TabsContent value="grade" className="space-y-3">
      {/* Search */}
      {!configLoaded&&<div role={configError?'alert':'status'} className="text-sm text-muted-foreground">{configError?'Não foi possível confirmar a configuração. Use Atualizar antes de editar horários.':'Carregando configuração de horários...'}</div>}
      {isGlobalAdmin && <UnitScopeNavigator units={unidadesVisiveis} value={unitId} onChange={setUnitId} />}
      {directoryState!=='ready'&&<div role={directoryState==='error'?'alert':'status'} className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">{directoryState==='error'?'Não foi possível confirmar os cadastros e horários.':'Carregando profissionais e períodos...'}{directoryState==='error'&&<Button size="sm" variant="outline" onClick={retryDirectory}>Tentar novamente</Button>}</div>}
      {directoryReady&&<>
        <section className="grid grid-cols-1 min-[380px]:grid-cols-2 xl:grid-cols-5 gap-2" aria-label="Indicadores de disponibilidade">
          {[
            {metric:'ativos' as const,label:'Profissionais ativos',value:summary.ativos,Icon:Users,tone:'blue',note:'Na seleção de unidades'},
            {metric:'vigentes' as const,label:'Com grade vigente',value:summary.vigentes,Icon:CalendarCheck,tone:'teal',note:'Profissionais ativos'},
            {metric:'sem_vigencia' as const,label:'Sem grade vigente',value:summary.semVigencia,Icon:CalendarClock,tone:'violet',note:'Profissionais ativos'},
            {metric:'periodos' as const,label:'Períodos cadastrados',value:summary.periodos,Icon:Layers,tone:'blue',note:'Inclui histórico'},
            {metric:'conferencia' as const,label:'Cadastros a conferir',value:summary.conferencia,Icon:AlertTriangle,tone:'neutral',note:'Sem alteração automática'}
          ].map(({metric,label,value,Icon,tone,note})=><button type="button" key={metric} aria-pressed={gradeFilter.metric===metric} onClick={()=>selectMetric(metric)} className={cn('clinical-premium p-3 flex items-center gap-2 text-left min-w-0 focus-visible:ring-2 focus-visible:ring-ring',gradeFilter.metric===metric&&'ring-1 ring-primary')}><span className={`clinical-dock-icon clinical-tone-${tone}`}><Icon className="w-4 h-4" aria-hidden="true"/></span><span className="flex-1 min-w-0"><strong className="block text-xl tabular-nums">{value}</strong><span className="block text-xs font-medium">{label}</span><span className="block text-[11px] text-muted-foreground">{note}</span></span><ChevronRight className="w-3.5 h-3.5 text-muted-foreground shrink-0"/></button>)}
        </section>
        <p className="text-xs text-muted-foreground">Vigência em {todayStr.split('-').reverse().join('/')} · considera as datas inicial e final, não a presença, escala ou vagas livres. Profissionais ativos: lotação na seleção ou grade vinculada à seleção.</p>
        {directoryMayBeLimited&&<p role="alert" className="text-xs text-amber-800 dark:text-amber-300">A consulta operacional pode estar limitada pelo servidor. Os indicadores representam somente os registros carregados; não confirme ausência de grade sem conferência complementar.</p>}
        <section className="clinical-premium p-3 space-y-2" aria-label="Filtros de disponibilidade">
          <div className="flex flex-wrap gap-1.5 items-center" role="group" aria-label="Filtrar por vigência">
            <Button type="button" size="sm" variant={gradeFilter.period==='todos'?'default':'outline'} onClick={()=>setGradeFilter(f=>({...f,period:'todos'}))}>Todos os períodos</Button>
            {(['vigente','futuro','encerrado','invalido'] as const).map(period=>(period!=='invalido'||summary.periods.invalido>0)&&<Button type="button" size="sm" key={period} aria-pressed={gradeFilter.period===period} variant={gradeFilter.period===period?'default':'outline'} onClick={()=>setGradeFilter(f=>({...f,period}))}>{periodLabels[period]} ({summary.periods[period]})</Button>)}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative flex-1 min-w-[12rem]"><Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground"/><Input className="pl-9" value={gradeFilter.search} onChange={e=>setGradeFilter(f=>({...f,search:e.target.value}))} placeholder="Buscar nome, profissão ou unidade..." aria-label="Buscar profissional, profissão ou unidade"/></div>
            <Select value={gradeFilter.profession} onValueChange={profession=>setGradeFilter(f=>({...f,profession}))}><SelectTrigger className="w-full sm:w-48" aria-label="Filtrar profissão"><SelectValue/></SelectTrigger><SelectContent><SelectItem value="todos">Todas as profissões</SelectItem>{professions.map(p=><SelectItem key={p} value={p}>{p}</SelectItem>)}</SelectContent></Select>
            <Select value={gradeFilter.mode} onValueChange={mode=>setGradeFilter(f=>({...f,mode:mode as GradeFilter['mode']}))}><SelectTrigger className="w-full sm:w-40" aria-label="Filtrar modalidade"><SelectValue/></SelectTrigger><SelectContent><SelectItem value="todos">Todas as modalidades</SelectItem><SelectItem value="hora">Por hora</SelectItem><SelectItem value="turno">Por turno</SelectItem><SelectItem value="misto">Mista / conferir</SelectItem></SelectContent></Select>
            <Button type="button" size="sm" variant="outline" onClick={()=>setGradeFilter(emptyGradeFilter)}>Limpar filtros</Button>
          </div>
          <div className="flex flex-wrap gap-2 items-center justify-between border-t pt-2">
            <p className="text-xs text-muted-foreground flex-1 min-w-[10rem]" role="status">{filteredProfGroups.length} cadastro(s) ou vínculo(s) encontrado(s). Os indicadores consideram toda a seleção de unidades.</p>
            <div className="flex gap-1 border rounded-md p-0.5" role="group" aria-label="Visualização dos profissionais">
              <Button type="button" size="sm" variant={gradeLayout==='cards'?'default':'ghost'} aria-pressed={gradeLayout==='cards'} className="h-7 px-2 gap-1.5" onClick={()=>setGradeLayout('cards')}><LayoutGrid className="w-3.5 h-3.5"/>Cards</Button>
              <Button type="button" size="sm" variant={gradeLayout==='list'?'default':'ghost'} aria-pressed={gradeLayout==='list'} className="h-7 px-2 gap-1.5" onClick={()=>setGradeLayout('list')}><List className="w-3.5 h-3.5"/>Lista</Button>
            </div>
          </div>
        </section>
      </>}

      {/* Dialog (add/edit) */}
      <Dialog open={dialogOpen} onOpenChange={v => { if (!gradeWriteInFlight.current) setDialogOpen(v); }}>
        <DialogContent className="w-[calc(100vw-1rem)] max-w-4xl gap-3 max-h-[90dvh] overflow-y-auto">
          <DialogHeader className="clinical-hub-hero text-left pr-9">
            <div className="flex gap-3 items-start"><span className="clinical-patient-avatar flex items-center justify-center shrink-0"><Settings2 className="w-5 h-5" aria-hidden="true"/></span><div className="min-w-0"><p className="clinical-hub-eyebrow">Gestão de horários</p><DialogTitle className="clinical-hub-name font-display">{renewal?'Renovar':isEditing ? 'Editar' : 'Configurar'} Disponibilidade</DialogTitle><p className="clinical-patient-sub text-xs mt-1">Grade de atendimento profissional · {renewal?'Novo período a partir de uma grade anterior':isEditing?'Edição de período':'Novo período'}</p></div></div>
          </DialogHeader>
          {renewal&&<div className="clinical-inset border rounded-lg p-3 text-sm"><strong className="block">Renovação sem alterar histórico</strong><p className="text-xs text-muted-foreground">Grade de origem termina em {renewal.end.split('-').reverse().join('/')}. Informe um novo período posterior à origem e não anterior a hoje. Profissional e unidade permanecem os mesmos. Horários e vagas são uma cópia editável; cotas e agendamentos não são copiados.</p></div>}
          {isEditing&&<p className="text-xs text-muted-foreground">Períodos encerrados são protegidos. Alterações em grade vigente devem ser conferidas antes de salvar; nenhum agendamento será remarcado automaticamente.</p>
          <div className="space-y-4">
            {/* Profissional + Unidade */}
            <section className="clinical-premium p-3 space-y-3 min-w-0"><h3 className="triage-section-title"><User className="w-4 h-4"/>Identificação profissional</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div><Label>Profissional *</Label>
                <Select disabled={!!renewal||saving} value={form.profissionalId} onValueChange={handleProfissionalChange}>
                  <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                  <SelectContent>
                    {profissionais.length === 0 ? (
                      <SelectItem value="__none__" disabled>Nenhum profissional cadastrado</SelectItem>
                    ) : (
                      profissionais.map(p => <SelectItem key={p.id} value={p.id}>{p.nome} — {p.cargo}</SelectItem>)
                    )}
                  </SelectContent>
                </Select>
              </div>
              <div><Label>Unidade *</Label>
                <Select disabled={!!renewal||saving} value={form.unidadeId} onValueChange={v => setForm(p => ({ ...p, unidadeId: v, salaId: '' }))}>
                  <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                  <SelectContent>{unidadesVisiveis.filter(u => u.ativo).map(u => <SelectItem key={u.id} value={u.id}>{u.nome}</SelectItem>)}</SelectContent>
                </Select>
              </div>
            </div>

            {/* Sala - only for por_hora */}
            {modo === 'por_hora' && filteredSalas.length > 0 && (
              <div><Label>Sala (opcional)</Label>
                <Select value={form.salaId || 'none'} onValueChange={v => setForm(p => ({ ...p, salaId: v === 'none' ? '' : v }))}>
                  <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Nenhuma</SelectItem>
                    {filteredSalas.map(s => <SelectItem key={s.id} value={s.id}>{s.nome}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            )}

            </section>
            {/* Mode selector */}
            {form.profissionalId && (
              <Card className="clinical-premium">
                <CardContent className="p-3 space-y-2">
                  <h3 className="triage-section-title"><Settings2 className="w-4 h-4"/>Modalidade de atendimento</h3>
                  <RadioGroup value={modo} onValueChange={v => handleModoChange(v as ModoDisponibilidade)} className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    <div className={cn("clinical-inset border rounded-lg p-3 flex items-center gap-2",modo==='por_hora'&&'ring-1 ring-primary')}>
                      <RadioGroupItem value="por_hora" id="modo_hora" />
                      <label htmlFor="modo_hora" className="text-sm font-medium flex items-center gap-1.5 cursor-pointer">
                        <Clock className="w-4 h-4 text-primary" />Por Hora
                      </label>
                    </div>
                    <div className={cn("clinical-inset border rounded-lg p-3 flex items-center gap-2",modo==='por_turno'&&'ring-1 ring-primary')}>
                      <RadioGroupItem value="por_turno" id="modo_turno" />
                      <label htmlFor="modo_turno" className="text-sm font-medium flex items-center gap-1.5 cursor-pointer">
                        <ClipboardList className="w-4 h-4 text-primary" />Por Turno
                      </label>
                    </div>
                  </RadioGroup>
                  <p className="text-[11px] text-muted-foreground mt-2">Preferência salva por profissional somente após confirmar a grade</p>
                </CardContent>
              </Card>
            )}

            {/* Date range */}
            <section className="clinical-premium p-3 space-y-3"><h3 className="triage-section-title"><Calendar className="w-4 h-4"/>Período de vigência</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <Label>Data Início *</Label>
                <Input type="date" value={form.dataInicio} onChange={e => setForm(p => ({ ...p, dataInicio: e.target.value }))} />
              </div>
              <div>
                <Label>Data Fim *</Label>
                <Input type="date" value={form.dataFim} onChange={e => setForm(p => ({ ...p, dataFim: e.target.value }))} />
                {hasDateError && <p className="text-xs text-destructive mt-1">Data Fim deve ser posterior à Data Início.</p>}
              </div>
            </div>

            </section>
            <section className="clinical-premium p-3 space-y-2 text-sm" role="status">
              <h3 className="triage-section-title"><ShieldCheck className="w-4 h-4"/>Cotas externas</h3>
              <Label htmlFor="external-quota-reservation">Total cadastrado das cotas ativas que intersectam o período</Label>
              <Input id="external-quota-reservation" className="mt-1 max-w-32" readOnly value={quotaLoading&&canReviewQuotas ? 'Carregando' : confirmedQuota ?? 'Indisponível'} />
              <p className="mt-2 text-muted-foreground">{modo === 'por_hora' ? `Recepção limitada a ${form.vagasPorDia} vagas por dia` : 'Recepção limitada às vagas de cada turno abaixo'} · Cotas externas autorizadas no período: {confirmedQuota ?? 'não confirmadas'} · Master sem limite de capacidade para encaixes.</p>
              <p className="mt-1 text-xs text-muted-foreground">O total inclui cotas de data específica e limites de vários dias; não é reserva diária nem saldo de vagas. Consulte a conferência por data em Gerenciar. Ajuste as cotas em Funcionários → Profissionais Externos.</p>
            </section>

            <section className="clinical-premium p-3 space-y-2">
              <h3 className="triage-section-title"><Calendar className="w-4 h-4"/>Seleção rápida dos dias</h3>
              <div className="flex flex-wrap gap-1.5">{([['Segunda a sexta',WEEKDAY_PRESETS.uteis],['Fim de semana',WEEKDAY_PRESETS.fim_semana],['Todos os dias',WEEKDAY_PRESETS.todos],['Desmarcar todos',WEEKDAY_PRESETS.nenhum]] as const).map(([label,days])=><Button key={label} type="button" size="sm" variant="outline" disabled={saving} onClick={()=>applyDayPreset(days)}>{label}</Button>)}</div>
              <div className="grid grid-cols-7 gap-1">{draftDays.map((d,index)=><div key={index} className={cn("rounded-md border p-1 text-center text-xs",d.ativo?'bg-primary/10 text-primary font-semibold':'text-muted-foreground')}>{diasSemanaLabels[index]}<span className="block text-[10px]">{d.ativo?'Ativo':'—'}</span></div>)}</div>
              <p className="text-xs text-muted-foreground">Os atalhos alteram somente o rascunho. Os dias desmarcados não serão gravados.</p>
              <div className="flex flex-wrap gap-2 items-center border-t pt-2"><Label>Copiar configuração de um dia</Label><Select value={copySource===null?'none':String(copySource)} onValueChange={v=>{if(v==='none'){setCopySource(null);setCopyTargets([]);}else copyDayConfig(Number(v));}} disabled={saving}><SelectTrigger className="w-full sm:w-44" aria-label="Dia de origem da cópia"><SelectValue/></SelectTrigger><SelectContent><SelectItem value="none">Escolher dia</SelectItem>{draftDays.map((d,index)=><SelectItem key={index} value={String(index)} disabled={!d.ativo||(modo==='por_turno'&&!configDias[index].blocos.some(b=>b.ativo))}>{diasSemanaFull[index]}</SelectItem>)}</SelectContent></Select></div>
              {copySource!==null&&<div ref={copyPanelRef} className="clinical-inset rounded-lg border p-2 space-y-2"><p className="text-xs font-medium">Destino da cópia de {diasSemanaFull[copySource]}</p><div className="flex flex-wrap gap-1.5">{draftDays.map((_,index)=>index!==copySource&&<Button key={index} type="button" size="sm" variant={copyTargets.includes(index)?'default':'outline'} aria-pressed={copyTargets.includes(index)} disabled={saving} onClick={()=>setCopyTargets(prev=>prev.includes(index)?prev.filter(i=>i!==index):[...prev,index])}>{diasSemanaLabels[index]}</Button>)}</div><div className="flex flex-wrap gap-2"><Button type="button" size="sm" variant="outline" onClick={()=>setCopyTargets(draftDays.flatMap((d,index)=>d.ativo&&index!==copySource?[index]:[]))}>Demais ativos</Button><Button type="button" size="sm" disabled={saving||!copyTargets.length||!draftDays[copySource]?.ativo} onClick={applyCopy}><Copy className="w-3.5 h-3.5 mr-1"/>Aplicar em {copyTargets.length} dia(s)</Button><Button type="button" size="sm" variant="ghost" onClick={()=>{setCopySource(null);setCopyTargets([]);}}>Cancelar cópia</Button></div><p className="text-xs text-muted-foreground">A cópia ativa os destinos selecionados e substitui seus horários/blocos no formulário.</p></div>}
            </section>
            {/* === POR HORA mode === */}
            {modo === 'por_hora' && (
              <section className="clinical-premium p-3 space-y-3 min-w-0">
                <h3 className="triage-section-title"><Clock className="w-4 h-4"/>Parâmetros e horários por hora</h3>
                <div className="grid grid-cols-1 min-[380px]:grid-cols-2 lg:grid-cols-4 gap-3">
                  <div>
                    <Label>Vagas/Hora</Label>
                    <Input type="number" min={1} value={form.vagasPorHora} onChange={e => setForm(p => ({ ...p, vagasPorHora: parseInt(e.target.value) || 1 }))} />
                  </div>
                  <div>
                    <Label htmlFor="regular-reception-limit">Vagas para Recepção / Balcão (Limite Regular)</Label>
                    <Input id="regular-reception-limit" type="number" min={1} value={form.vagasPorDia} onChange={e => setForm(p => ({ ...p, vagasPorDia: parseInt(e.target.value) || 1 }))} />
                  </div>
                  <div>
                    <Label>Duração (min)</Label>
                    <Input type="number" min={10} step={5} value={form.duracaoConsulta} onChange={e => setForm(p => ({ ...p, duracaoConsulta: parseInt(e.target.value) || 30 }))} />
                  </div>
                  <div>
                    <Label>Intervalo (min)</Label>
                    <Input type="number" min={0} step={5} value={form.intervalo} onChange={e => setForm(p => ({ ...p, intervalo: parseInt(e.target.value) || 0 }))} />
                  </div>
                </div>
                {(form.duracaoConsulta > 0 || form.intervalo > 0) && (
                  <p className="text-xs text-muted-foreground flex items-center gap-1">
                    <Info className="w-3.5 h-3.5" />
                    Sugestão: <strong>{suggestedVagasHora} vaga(s)/hora</strong>
                    {form.vagasPorHora !== suggestedVagasHora && (
                      <Button variant="link" size="sm" className="h-auto p-0 ml-1 text-xs" onClick={() => setForm(p => ({ ...p, vagasPorHora: suggestedVagasHora }))}>
                        Aplicar
                      </Button>
                    )}
                  </p>
                )}

                {/* Per-day schedule grid */}
                <div>
                  <Label className="mb-2 block">Horário por Dia da Semana</Label>
                  <div className="clinical-inset rounded-lg border border-border overflow-x-auto"><div className="min-w-[360px]">
                    <div className="grid grid-cols-[1fr_auto_1fr_1fr] gap-0 bg-muted/50 px-3 py-2 text-xs font-medium text-muted-foreground border-b border-border">
                      <span>Dia</span>
                      <span className="text-center px-2">Ativo</span>
                      <span className="text-center">Início</span>
                      <span className="text-center">Fim</span>
                    </div>
                    {daySchedules.map((ds, i) => {
                      const isFds = i === 0 || i === 6;
                      const error = dayErrors[i];
                      return (
                        <div key={i}>
                          <div className={cn(
                            "grid grid-cols-[1fr_auto_1fr_1fr] gap-0 items-center px-3 py-2 border-b border-border last:border-b-0",
                            !ds.ativo && "bg-muted/20",
                            isFds && ds.ativo && "bg-orange-500/5",
                            error && "bg-destructive/5",
                          )}>
                            <span className={cn(
                              "text-sm font-medium",
                              ds.ativo ? "text-foreground" : "text-muted-foreground",
                              isFds && ds.ativo && "text-orange-600 dark:text-orange-400",
                            )}>
                              {diasSemanaFull[i]}
                              {isFds && <span className="text-[10px] ml-1 text-muted-foreground">(FDS)</span>}
                            </span>
                            <div className="flex justify-center px-2">
                              <Switch checked={ds.ativo} onCheckedChange={(checked) => updateDaySchedule(i, 'ativo', checked)} />
                            </div>
                            <div className="px-1">
                              <Input
                                ref={el => { dayInputRefs.current[i] = el; }}
                                type="time" value={ds.horaInicio}
                                onChange={e => updateDaySchedule(i, 'horaInicio', e.target.value)}
                                disabled={!ds.ativo}
                                className={cn("h-8 text-xs", error && "border-destructive")}
                              />
                            </div>
                            <div className="px-1">
                              <Input type="time" value={ds.horaFim}
                                onChange={e => updateDaySchedule(i, 'horaFim', e.target.value)}
                                disabled={!ds.ativo}
                                className={cn("h-8 text-xs", error && "border-destructive")}
                              />
                            </div>
                          </div>
                          {error && <p className="text-[11px] text-destructive px-3 py-1 bg-destructive/5 border-b border-border">{error}</p>}
                        </div>
                      );
                    })}
                  </div></div>
                  <p className="text-xs text-muted-foreground mt-2">{activeDaysCount} dia(s) ativo(s)</p>
                  {daySchedules.some((ds, i) => ds.ativo && (i === 0 || i === 6)) && (
                    <p className="text-xs text-orange-500 mt-1 flex items-center gap-1">⚠️ Atenção: disponibilidade em fim de semana.</p>
                  )}
                </div>
              </section>
            )}

            {/* === POR TURNO mode === */}
            {modo === 'por_turno' && (
              <section className="clinical-premium p-3 space-y-3 min-w-0">
                <h3 className="triage-section-title"><CalendarClock className="w-4 h-4"/>Turnos e blocos por dia</h3>
                <Accordion type="multiple" className="w-full border rounded-lg overflow-hidden">
                  {configDias.map((dia, diaIndex) => {
                    const isFds = diaIndex === 0 || diaIndex === 6;
                    return (
                      <AccordionItem key={diaIndex} value={`dia-${diaIndex}`} className="border-b last:border-0">
                        <div className={cn(
                          "flex items-center justify-between px-4 py-2",
                          !dia.ativo && "bg-muted/30",
                          isFds && dia.ativo && "bg-orange-500/5"
                        )}>
                          <div className="flex items-center gap-3">
                            <Switch 
                              checked={dia.ativo} 
                              onCheckedChange={(v) => toggleDiaConfig(diaIndex, v)} 
                            />
                            <span className={cn(
                              "font-semibold text-sm",
                              !dia.ativo && "text-muted-foreground",
                              isFds && dia.ativo && "text-orange-600"
                            )}>
                              {diasSemanaFull[diaIndex]}
                              {isFds && <span className="text-[10px] ml-1 opacity-70">(FDS)</span>}
                            </span>
                          </div>
                          <div className="flex items-center gap-2">
                            {dia.ativo && (
                              <>
                                <Badge variant="outline" className="text-[10px]">
                                  {dia.blocos.filter(b => b.ativo).length} bloco(s)
                                </Badge>
                                <Button 
                                  variant="ghost" 
                                  size="icon" 
                                  className="h-8 w-8 text-muted-foreground"
                                  onClick={(e) => { e.stopPropagation(); copyDayConfig(diaIndex); }}
                                  title="Copiar para outros dias"
                                >
                                  <Copy className="h-3.5 w-3.5" />
                                </Button>
                              </>
                            )}
                            <AccordionTrigger className="py-2 hover:no-underline" disabled={!dia.ativo} />
                          </div>
                        </div>
                        <AccordionContent className="p-0">
                          {dia.ativo && (
                            <div className="p-4 space-y-3 bg-muted/20">
                              {dia.blocos.map((bloco, blocoIndex) => (
                                <div key={blocoIndex} className="flex flex-col sm:flex-row gap-2 items-start sm:items-center p-3 bg-background border rounded-md shadow-sm">
                                  <div className="flex-1 w-full">
                                    <Label className="text-[10px] uppercase text-muted-foreground mb-1 block">Nome do Turno</Label>
                                    <Input 
                                      value={bloco.nome} 
                                      onChange={e => updateBlocoInDia(diaIndex, blocoIndex, 'nome', e.target.value)} 
                                      className="h-8 text-sm"
                                    />
                                  </div>
                                  <div className="w-full sm:w-24">
                                    <Label className="text-[10px] uppercase text-muted-foreground mb-1 block">Início</Label>
                                    <Input 
                                      type="time" 
                                      value={bloco.horaInicio} 
                                      onChange={e => updateBlocoInDia(diaIndex, blocoIndex, 'horaInicio', e.target.value)} 
                                      className="h-8 text-sm"
                                    />
                                  </div>
                                  <div className="w-full sm:w-24">
                                    <Label className="text-[10px] uppercase text-muted-foreground mb-1 block">Fim</Label>
                                    <Input 
                                      type="time" 
                                      value={bloco.horaFim} 
                                      onChange={e => updateBlocoInDia(diaIndex, blocoIndex, 'horaFim', e.target.value)} 
                                      className="h-8 text-sm"
                                    />
                                  </div>
                                  <div className="w-full sm:w-20">
                                    <Label className="text-[10px] uppercase text-muted-foreground mb-1 block">Vagas</Label>
                                    <div className="space-y-1">
                                      <Input 
                                        type="number" 
                                        value={bloco.vagas} 
                                        onChange={e => updateBlocoInDia(diaIndex, blocoIndex, 'vagas', parseInt(e.target.value) || 0)} 
                                        className="h-8 text-sm"
                                      />
                                    </div>
                                  </div>
                                  <div className="flex items-center gap-1 self-end sm:self-center mt-2 sm:mt-5">
                                    <Button 
                                      variant="ghost" 
                                      size="icon" 
                                      className="h-8 w-8 text-destructive hover:bg-destructive/10"
                                      onClick={() => removeBlocoFromDia(diaIndex, blocoIndex)}
                                    >
                                      <Trash2 className="h-4 w-4" />
                                    </Button>
                                  </div>
                                </div>
                              ))}
                              
                              <div className="flex flex-wrap gap-2 justify-between pt-2">
                                <Button 
                                  variant="outline" 
                                  size="sm" 
                                  className="text-xs h-8 border-dashed"
                                  onClick={() => addBlocoToDia(diaIndex)}
                                >
                                  <Plus className="h-3.5 w-3.5 mr-1" /> Adicionar Bloco
                                </Button>
                                
                                <div className="flex flex-wrap gap-2">
                                  {turnosGlobais.filter(t => t.ativo).map(t => (
                                    <Button 
                                      key={t.id}
                                      variant="secondary" 
                                      size="sm" 
                                      className="text-[10px] h-7 px-2"
                                      onClick={() => {
                                        setConfigDias(prev => prev.map((pd, i) => i === diaIndex ? {
                                          ...pd,
                                          blocos: [...pd.blocos, { 
                                            nome: t.nome, 
                                            tipo: 'padrao', 
                                            horaInicio: t.horaInicio, 
                                            horaFim: t.horaFim, 
                                            vagas: 20, 
                                            ativo: true 
                                          }]
                                        } : pd));
                                      }}
                                    >
                                      + {t.nome}
                                    </Button>
                                  ))}
                                </div>
                              </div>
                            </div>
                          )}
                        </AccordionContent>
                      </AccordionItem>
                    );
                  })}
                </Accordion>

                {/* Summary */}
                <Card className="clinical-inset border border-border">
                  <CardContent className="p-3">
                    <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-3">Resumo da Configuração</h4>
                    <div className="grid grid-cols-2 gap-4 text-sm">
                      <div className="flex flex-col">
                        <span className="text-muted-foreground text-[10px] uppercase">Vagas nominais semanais</span>
                        <span className="font-bold text-lg">{turnoWeeklySummary.totalVagas}</span>
                      </div>
                      <div className="flex flex-col">
                        <span className="text-muted-foreground text-[10px] uppercase">Dias selecionados</span>
                        <span className="font-bold text-lg">{turnoWeeklySummary.diasAtivos} / 7</span>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </section>
            )}

            <section className="clinical-premium p-3 space-y-2"><h3 className="triage-section-title"><ClipboardList className="w-4 h-4"/>Conferência antes de salvar</h3>
              <div className="grid grid-cols-3 gap-2">{[[draftSummary.days.length,'Dias com horários'],[draftSummary.blocks,'Registros previstos'],[draftSummary.nominal,'Vagas nominais/semana']].map(([value,label])=><div key={label} className="clinical-inset rounded-md border p-2 min-w-0"><strong className="block text-lg tabular-nums">{value}</strong><span className="text-xs text-muted-foreground break-words">{label}</span></div>)}</div>
              {draftSummary.days.map(d=><div key={d.day} className="flex flex-wrap gap-x-2 gap-y-1 border-t pt-1.5 text-xs"><strong className="w-20">{diasSemanaFull[d.day]}</strong><span className="flex-1 min-w-[8rem] break-words">{d.blocks.map(b=>b.nome+' · '+b.inicio+'–'+b.fim+' · '+b.vagas+' vagas').join(' / ')}</span></div>)}
              <p className="text-xs text-muted-foreground">Capacidade nominal de uma semana configurada, sem descontar bloqueios, feriados, cotas ou agendamentos. Não representa vagas disponíveis.</p>
              {draftOverlap&&<p role="alert" className="text-xs text-destructive">{draftOverlap}</p>}
              {draftIssues.length>0&&<div role="status" className="text-xs text-amber-800 dark:text-amber-300 space-y-1"><strong>Conferência informativa dos horários</strong>{draftIssues.map((issue,i)=><p key={i}>{issue.replace(/^Dia (\d+):/,(_,day)=>diasSemanaFull[Number(day)]+':')}</p>)}<p>As validações e regras de salvamento existentes continuam valendo.</p></div>}
              {renewal&&form.dataInicio&&form.dataFim&&!renewalValid&&<p role="alert" className="text-xs text-destructive">Novo período deve começar após o término da grade de origem, a partir de hoje, e terminar na mesma data ou depois.</p>}
              {!activeDaysCount&&<p className="text-xs text-muted-foreground">Configure pelo menos um dia com horários.</p>}
            </section>
            <div className="clinical-premium p-3 space-y-2"><p className="text-xs text-muted-foreground flex gap-1.5 items-start"><ShieldCheck className="w-4 h-4 text-primary shrink-0"/>A configuração só é gravada após a confirmação do servidor.</p>
            <Button onClick={handleSave} disabled={!canSave} className="w-full gradient-primary text-primary-foreground">
              {saving ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Salvando...</> : renewal?'Criar novo período':isEditing ? 'Atualizar Disponibilidade' : 'Salvar Disponibilidade'}
            </Button></div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Management Modal */}
      <Dialog open={!!manageProfData} onOpenChange={v => { if (!v) setManageProfId(null); }}>
        <DialogContent className="w-[calc(100vw-1rem)] max-w-5xl gap-3 max-h-[90dvh] overflow-y-auto">
          {manageProfData && (() => {
            const [profId, data] = manageProfData;
            const prof = data.prof;
            const profUnidade = unidades.find(u => u.id === prof?.unidadeId);
            return (
              <>
                <DialogHeader className="clinical-hub-hero text-left pr-9">
                  <div className="flex items-start gap-3"><span className="clinical-patient-avatar flex items-center justify-center shrink-0"><User className="w-5 h-5" aria-hidden="true"/></span><div className="min-w-0"><p className="clinical-hub-eyebrow">Gestão de disponibilidade</p><DialogTitle className="clinical-hub-name font-display break-words">{prof?.nome || 'Cadastro de profissional não localizado'}</DialogTitle><p className="clinical-patient-sub text-xs mt-1 break-words">{[prof?.profissao||prof?.cargo,profUnidade?.nome].filter(Boolean).join(' · ')||'Consulta dos períodos cadastrados'}</p></div></div>
                </DialogHeader>

                <div className="space-y-3">
                  <div className="clinical-premium p-3 flex flex-wrap items-center justify-between gap-2">
                    <div><h3 className="font-semibold text-sm">Períodos de atendimento</h3><p className="text-xs text-muted-foreground">{data.groups.length} disponibilidade(s) cadastrada(s)</p></div>
                    <Button size="sm" disabled={!configLoaded||!may('can_create')||saving||!profissionais.some(p=>p.id===profId)} onClick={() => openNewForProf(profId)} className="gradient-primary text-primary-foreground">
                      <Plus className="w-4 h-4 mr-1" />Adicionar
                    </Button>
                  </div>

                  {data.issues.length>0&&<p role="status" className="text-xs text-amber-800 dark:text-amber-300">{data.issues.join(' · ')}. Os registros foram preservados.</p>}
                  <div className="clinical-premium p-2 flex flex-wrap items-center gap-1.5" role="group" aria-label="Consultar períodos do profissional">
                    <Button type="button" size="sm" variant={managePeriod==='todos'?'default':'outline'} onClick={()=>setManagePeriod('todos')}>Todos ({data.groups.length})</Button>
                    {(['vigente','futuro','encerrado','invalido'] as const).map(period=>{const count=data.groups.filter(([,rows])=>gradePeriod(rows[0].dataInicio,rows[0].dataFim,todayStr)===period).length;return (period!=='invalido'||count>0)&&<Button type="button" key={period} size="sm" aria-pressed={managePeriod===period} variant={managePeriod===period?'default':'outline'} onClick={()=>setManagePeriod(period)}>{periodLabels[period]} ({count})</Button>;})}
                  </div>
                  {!data.groups.some(([,rows])=>managePeriod==='todos'||gradePeriod(rows[0].dataInicio,rows[0].dataFim,todayStr)===managePeriod)&&<p className="text-sm text-muted-foreground">Nenhum período cadastrado para este filtro.</p>}
                  {data.groups.filter(([,rows])=>managePeriod==='todos'||gradePeriod(rows[0].dataInicio,rows[0].dataFim,todayStr)===managePeriod).map(([key, records]) => {
                    const first = records[0];
                    const unidade = unidades.find(u => u.id === first.unidadeId);
                    const isTurno = isGroupTurno(records);
                    const period=gradePeriod(first.dataInicio,first.dataFim,todayStr);
                    const sala = first.salaId && !isTurno ? salas.find(s => s.id === first.salaId) : null;

                    if(gradeMode(records)==='misto')return <Card key={key}><CardContent className="p-3 space-y-2"><div className="flex flex-wrap gap-2 items-center"><Badge variant="outline">Modalidades misturadas</Badge>{periodBadge(period)}</div><p className="text-xs text-muted-foreground">{first.dataInicio} a {first.dataFim} · {unidade?.nome||'Unidade não localizada'}. Consulta somente leitura para evitar interpretação incorreta.</p>{reviewControl(key,first)}{records.map(r=><div key={r.id} className="text-xs border-t pt-1">{r.vagasPorHora===0?'Por turno':'Por hora'} · {r.diasSemana.map(d=>diasSemanaLabels[d]||'Dia inválido').join(', ')} · {r.horaInicio}–{r.horaFim} · {r.vagasPorDia} vagas/dia {r.vagasPorHora!==0&&`· ${r.vagasPorHora} vagas/hora`}</div>)}</CardContent></Card>;
                    if (isTurno) {
                      const turnoBlocks: { bloco: BlocoConfig; dayNum: number }[] = [];
                      records.forEach(r => {
                        const tId = r.salaId || '';
                        const turnoObj = turnosGlobais.find(t => t.id === tId);
                        r.diasSemana.forEach(d => {
                          turnoBlocks.push({
                            dayNum: d,
                            bloco: {
                              nome: turnoObj?.nome || tId || 'Turno',
                              tipo: turnoObj ? 'padrao' : 'custom',
                              horaInicio: r.horaInicio,
                              horaFim: r.horaFim,
                              vagas: r.vagasPorDia,
                              ativo: true
                            }
                          });
                        });
                      });

                      const fmt = (s: string) => s ? s.split('-').reverse().join('/') : '';
                      const periodo = first.dataInicio === first.dataFim ? fmt(first.dataInicio) : `${fmt(first.dataInicio)} a ${fmt(first.dataFim)}`;
                      const sorted = turnoBlocks.sort((a, b) => a.dayNum - b.dayNum || a.bloco.horaInicio.localeCompare(b.bloco.horaInicio));
                      return (
                        <div key={key} className="clinical-premium overflow-hidden min-w-0">
                          <div className="clinical-inset flex flex-wrap items-center justify-between gap-2 p-3 border-b border-border">
                            <div className="flex flex-wrap items-center gap-2 min-w-0">
                              <Badge className="gap-1.5 rounded-full px-3 py-1 text-xs"><Calendar className="w-3.5 h-3.5" />Por turno</Badge>{periodBadge(period)}
                              {unidade && <><span className="h-5 w-px bg-border" /><span className="text-xs text-muted-foreground break-words">{unidade.nome}</span></>}
                            </div>
                            <div className="flex flex-wrap gap-1 shrink-0">
                              <Button type="button" size="sm" variant="outline" className="h-8 gap-1.5" disabled={!configLoaded||!may('can_create',first.unidadeId)||saving||period==='invalido'||!profissionais.some(p=>p.id===first.profissionalId)} onClick={()=>openEditGroup(key,true)}><Copy className="w-3.5 h-3.5"/>Renovar</Button>
                              <Button size="icon" variant="ghost" className="h-8 w-8" title="Editar" disabled={!configLoaded||!may('can_edit',first.unidadeId)||saving||first.dataFim<todayStr||!profissionais.some(p=>p.id===first.profissionalId)} onClick={() => openEditGroup(key)}><Pencil className="w-4 h-4" /></Button>
                              <AlertDialog>
                                <AlertDialogTrigger asChild><Button size="icon" variant="ghost" disabled={!may('can_delete',first.unidadeId)||saving||first.dataInicio<=todayStr} className="h-8 w-8 text-destructive" title="Excluir"><Trash2 className="w-4 h-4" /></Button></AlertDialogTrigger>
                                <AlertDialogContent>
                                  <AlertDialogHeader><AlertDialogTitle>Excluir disponibilidade?</AlertDialogTitle><AlertDialogDescription>Todos os registros serão removidos.</AlertDialogDescription></AlertDialogHeader>
                                  <AlertDialogFooter><AlertDialogCancel>Cancelar</AlertDialogCancel><AlertDialogAction disabled={saving||!may('can_delete',first.unidadeId)||first.dataInicio<=todayStr} onClick={() => void persistGrade(records.map(r => r.id), first, [], 'Disponibilidade excluída!')}>Excluir</AlertDialogAction></AlertDialogFooter>
                                </AlertDialogContent>
                              </AlertDialog>
                            </div>
                          </div>
                          <div className="overflow-x-auto">
                            <table className="w-full min-w-[520px] text-sm">
                              <thead className="bg-muted/50 text-muted-foreground">
                                <tr>
                                  <th className="text-left font-medium px-4 py-2.5"><span className="inline-flex items-center gap-1.5"><Calendar className="w-4 h-4" />Data</span></th>
                                  <th className="text-left font-medium px-4 py-2.5"><span className="inline-flex items-center gap-1.5"><Calendar className="w-4 h-4" />Dia da semana</span></th>
                                  <th className="text-left font-medium px-4 py-2.5"><span className="inline-flex items-center gap-1.5"><Clock className="w-4 h-4" />Turno</span></th>
                                  <th className="text-left font-medium px-4 py-2.5"><span className="inline-flex items-center gap-1.5"><User className="w-4 h-4" />Vagas</span></th>
                                </tr>
                              </thead>
                              <tbody>
                                {sorted.map((tb, idx) => (
                                  <tr key={idx} className="border-t border-border">
                                    <td className="px-4 py-3 font-semibold text-foreground whitespace-nowrap">{periodo}</td>
                                    <td className="px-4 py-3 text-foreground">{diasSemanaFull[tb.dayNum]}</td>
                                    <td className="px-4 py-3 whitespace-nowrap">
                                      <span className="inline-flex items-center rounded-md bg-primary/10 text-primary font-semibold px-2.5 py-1 text-xs mr-3">{tb.bloco.nome}</span>
                                      <span className="text-muted-foreground">{tb.bloco.horaInicio}–{tb.bloco.horaFim}</span>
                                    </td>
                                    <td className="px-4 py-3 font-semibold text-foreground whitespace-nowrap">{tb.bloco.vagas} vagas</td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                          <div className="px-4 py-2">{reviewControl(key,first)}</div>
                        </div>
                      );
                    }

                    // Por Hora
                    const dayEntries = records.flatMap(r => r.diasSemana.map(dayNum => ({ dayNum, horaInicio: r.horaInicio, horaFim: r.horaFim }))).sort((a, b) => a.dayNum - b.dayNum);

                    return (
                      <Card key={key} className="clinical-premium min-w-0">
                        <CardContent className="p-4">
                          <div className="flex flex-wrap items-start justify-between gap-2 mb-2">
                            <div>
                              <div className="flex flex-wrap items-center gap-2 mb-1">
                                <Badge variant="secondary" className="text-[10px] gap-1"><Clock className="w-3 h-3" />Por Hora</Badge>{periodBadge(period)}
                                {unidade && <span className="text-xs text-muted-foreground">{unidade.nome}</span>}
                                {sala && <span className="text-xs text-muted-foreground">• {sala.nome}</span>}
                              </div>
                              <p className="text-xs text-muted-foreground"><Calendar className="w-3.5 h-3.5 inline mr-1" />{first.dataInicio} a {first.dataFim}</p>
                            </div>
                            <div className="flex flex-wrap gap-1">
                              <Button type="button" size="sm" variant="outline" className="h-8 gap-1.5" disabled={!configLoaded||!may('can_create',first.unidadeId)||saving||period==='invalido'||!profissionais.some(p=>p.id===first.profissionalId)} onClick={()=>openEditGroup(key,true)}><Copy className="w-3.5 h-3.5"/>Renovar</Button>
                              <Button size="icon" variant="ghost" className="h-8 w-8" disabled={!configLoaded||!may('can_edit',first.unidadeId)||saving||first.dataFim<todayStr||!profissionais.some(p=>p.id===first.profissionalId)} onClick={() => openEditGroup(key)}><Pencil className="w-3.5 h-3.5" /></Button>
                              <AlertDialog>
                                <AlertDialogTrigger asChild><Button size="icon" variant="ghost" disabled={!may('can_delete',first.unidadeId)||saving||first.dataInicio<=todayStr} className="h-8 w-8 text-destructive"><Trash2 className="w-3.5 h-3.5" /></Button></AlertDialogTrigger>
                                <AlertDialogContent>
                                  <AlertDialogHeader><AlertDialogTitle>Excluir disponibilidade?</AlertDialogTitle><AlertDialogDescription>Todos os {records.length} registro(s) serão removidos.</AlertDialogDescription></AlertDialogHeader>
                                  <AlertDialogFooter><AlertDialogCancel>Cancelar</AlertDialogCancel><AlertDialogAction disabled={saving||!may('can_delete',first.unidadeId)||first.dataInicio<=todayStr} onClick={() => void persistGrade(records.map(r => r.id), first, [], 'Disponibilidade excluída!')}>Excluir</AlertDialogAction></AlertDialogFooter>
                                </AlertDialogContent>
                              </AlertDialog>
                            </div>
                          </div>
                          <div className="flex flex-wrap gap-1.5 mb-2">
                            {dayEntries.map((de, i) => (
                              <span key={i} className={cn(
                                "inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full border",
                                (de.dayNum === 0 || de.dayNum === 6)
                                  ? "bg-orange-100 text-orange-700 border-orange-200 dark:bg-orange-500/15 dark:text-orange-400 dark:border-orange-500/30"
                                  : "bg-primary/10 text-primary border-primary/20"
                              )}>
                                {diasSemanaLabels[de.dayNum]} {de.horaInicio}–{de.horaFim}
                              </span>
                            ))}
                          </div>
                          <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                            <span>{first.vagasPorHora} vagas/hora</span>
                            <span>•</span>
                            <span>{first.vagasPorDia} vagas/dia</span>
                            <span>•</span>
                            <span>{first.duracaoConsulta || 30}min</span>
                          </div>
                          <div className="mt-2">{reviewControl(key,first)}</div>
                        </CardContent>
                      </Card>
                    );
                  })}
                </div>
              </>
            );
          })()}
        </DialogContent>
      </Dialog>

      {/* Professional Cards List */}
      {directoryReady&&(filteredProfGroups.length === 0 ? (
        <Card className="shadow-card border-0"><CardContent className="p-8 text-center text-muted-foreground">
          <Search className="w-12 h-12 mx-auto mb-3 text-muted-foreground/30" />
          Nenhum profissional ou período encontrado para os filtros selecionados.
        </CardContent></Card>
      ) : (
        <div className={gradeLayout==='cards'?'grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-2':'grid grid-cols-1 gap-2'}>
          {filteredProfGroups.map(([profId, data]) => {
            const prof = data.prof;
            const totalDisp = data.groups.length;
            const firstUnidadeId = data.groups[0]?.[1]?.[0]?.unidadeId || '';
            const unidade = unidades.find(u => u.id === (firstUnidadeId||prof?.unidadeId));
            const unitsServed = new Set(data.groups.map(([, records]) => records[0]?.unidadeId).filter(Boolean));
            const hasTurno = data.groups.some(([_, records]) => gradeMode(records)!=='hora');
            const hasHora = data.groups.some(([_, records]) => gradeMode(records)!=='turno');
            const counts={vigente:0,futuro:0,encerrado:0,invalido:0};for(const [,rows] of data.groups)counts[gradePeriod(rows[0].dataInicio,rows[0].dataFim,todayStr)]++;

            return (
              <Card key={profId} className="clinical-premium h-full min-w-0">
                <CardContent className={cn("p-3 min-w-0",gradeLayout==='list'?'flex flex-wrap lg:flex-nowrap lg:items-center gap-3':'flex flex-col gap-2 h-full')}>
                  <div className={cn("flex items-start gap-2.5 min-w-0",gradeLayout==='list'&&'flex-1 basis-60')}>
                    <div className="clinical-dock-icon clinical-tone-blue shrink-0">
                      <User className="w-4 h-4" aria-hidden="true" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <h3><button type="button" className="text-sm font-semibold text-left text-foreground break-words hover:underline rounded focus-visible:ring-2 focus-visible:ring-ring" onClick={()=>openManage(profId)}>{prof?.nome || 'Cadastro não localizado'}</button></h3>
                      <p className="text-xs text-muted-foreground break-words">{prof?.profissao || prof?.cargo || ''}</p>
                      {unidade && <p className="text-xs text-muted-foreground break-words">{unitsServed.size > 1 ? `Atende em ${unitsServed.size} unidades` : unidade.nome}</p>}
                    </div>
                  </div>

                  <div className={cn("min-w-0",gradeLayout==='list'&&'flex-1 basis-52')}><div className="flex flex-wrap items-center gap-1.5">
                    <Badge variant="outline" className="text-xs">
                      <Clock className="w-3 h-3 mr-1" />
                      {totalDisp} período{totalDisp !== 1 ? 's' : ''}
                    </Badge>
                    {hasTurno && <Badge variant="secondary" className="text-[10px]">Turno</Badge>}
                    {hasHora && <Badge variant="secondary" className="text-[10px]">Hora</Badge>}
                  </div>

                  <div className="flex flex-wrap items-center gap-1.5 mt-2 text-xs">{data.active?<span className={data.vigente?'text-emerald-700 dark:text-emerald-300':'text-amber-800 dark:text-amber-300'}>{data.vigente?'Com grade vigente':'Sem grade vigente'}</span>:<span className="text-muted-foreground">Fora do total de profissionais ativos</span>}{(['vigente','futuro','encerrado','invalido'] as const).filter(p=>counts[p]>0).map(p=><Badge key={p} variant="outline" className="text-[10px]">{counts[p]} {periodLabels[p].toLowerCase()}</Badge>)}</div>
                  {data.issues.length>0&&<p className="text-xs text-amber-800 dark:text-amber-300 mt-1">{data.issues.join(' · ')}</p>}</div>
                  <Button
                    variant="outline"
                    size="sm"
                    className={cn("clinical-record-action gap-1.5",gradeLayout==='cards'?'w-full mt-auto':'shrink-0 ml-auto')}
                    onClick={() => openManage(profId)}
                  >
                    <Settings2 className="w-4 h-4 mr-1.5" />
                    Gerenciar
                  </Button>
                </CardContent>
              </Card>
            );
          })}
        </div>
       ))}
      </TabsContent></Tabs>
    </div>
  );
};

export default Disponibilidade;
