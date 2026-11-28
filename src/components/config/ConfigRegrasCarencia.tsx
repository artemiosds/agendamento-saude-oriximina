import { useCallback, useEffect, useState, useRef } from "react";
import { AlertTriangle, Check, Clock3, Loader2, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import {validCareness,carePreviewKey,validImpact} from "@/lib/adminFlowSettings";
import {sameConfigSection} from "@/lib/configSectionGuard";
import {useAuth} from "@/contexts/AuthContext";

interface ProfessionRule {
  profession_key: string;
  profession_name: string;
  suggested_name: string;
  source_values: string[];
  professional_count: number;
  enabled: boolean;
  duration_value: number;
  duration_unit: "days" | "months";
  scope: "global" | "unit";
}
interface SetupResponse { professions: ProfessionRule[]; mapping_signature: string; mapping_confirmed: boolean }
interface RetroPreview { fingerprint:string; key: string; duration: number; unit: string; total: number; expired: number; blocked: number }

export default function ConfigRegrasCarencia() {
  const {user}=useAuth();
  const lock=useRef(false);
  const baseline=useRef<SetupResponse|null>(null);
  const [failed,setFailed]=useState(false);
  const [status,setStatus]=useState("");
  const [rules, setRules] = useState<ProfessionRule[]>([]);
  const [signature, setSignature] = useState("");
  const [mappingConfirmed, setMappingConfirmed] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);
  const [preview, setPreview] = useState<RetroPreview | null>(null);
  const [retroactiveRequested, setRetroactiveRequested] = useState<string | null>(null);

  const read=useCallback(async():Promise<SetupResponse>=>{
    const {data:auth,error:authError}=await supabase.auth.getSession();
    if(authError||!user?.authUserId||user.role!=='master'||user.ativo!==true||auth.session?.user.id!==user.authUserId)throw Error('Sessão não confirmada.');
    const {data,error}=await (supabase as any).rpc("list_profession_careness_setup");
    if(error||!data||!Array.isArray(data.professions)||typeof data.mapping_signature!=='string'||!data.mapping_signature||typeof data.mapping_confirmed!=='boolean')throw Error('Consulta não confirmada.');
    return data as SetupResponse;
  },[user?.authUserId,user?.role,user?.ativo]);
  const load=useCallback(async()=>{
    setLoading(true);setFailed(false);setPreview(null);setRetroactiveRequested(null);baseline.current=null;
    try{const result=await read();baseline.current=result;setRules(result.professions);setSignature(result.mapping_signature);setMappingConfirmed(result.mapping_confirmed);return true;}
    catch{setFailed(true);setMappingConfirmed(false);toast.error('Não foi possível confirmar a configuração de carência.');return false;}
    finally{setLoading(false);}
  },[read]);
  useEffect(()=>{void load();},[load]);
  const ensureCurrent=async(row?:ProfessionRule)=>{
    const actual=await read(),old=baseline.current;
    if(!old||actual.mapping_signature!==old.mapping_signature||actual.mapping_confirmed!==old.mapping_confirmed||(row&&!sameConfigSection(actual.professions.find(r=>r.profession_key===row.profession_key),old.professions.find(r=>r.profession_key===row.profession_key))))throw Error('Catálogo ou regra alterado. Recarregue antes de repetir.');
  };

  const edit = (key: string, changes: Partial<ProfessionRule>) => {
    if(lock.current||failed)return;
    setPreview(null);
    setRules(current => current.map(row => row.profession_key === key ? { ...row, ...changes } : row));
  };

  const confirmMapping=async()=>{
    if(lock.current||failed||!signature||!window.confirm('Confirmar o De-Para atual? Regras anteriormente ativas podem voltar a ser aplicadas.'))return;
    lock.current=true;setSaving("mapping");
    try{await ensureCurrent();const {error}=await (supabase as any).rpc("confirm_profession_careness_mapping",{p_signature:signature});if(error)throw error;
      if(await load()&&baseline.current?.mapping_confirmed){setStatus('De-Para confirmado');toast.success('De-Para confirmado. Confira as regras existentes.');}
      else{setFailed(true);toast.error('Confirmação não verificada.');}
    }catch{setFailed(true);toast.error('Confirmação não verificada. Recarregue.');}finally{lock.current=false;setSaving(null);}
  };
  const fetchImpact=async(row:ProfessionRule)=>{
    const {data,error}=await (supabase as any).rpc("preview_profession_careness_retroactive",{p_profession_key:row.profession_key,p_duration_value:row.duration_value,p_duration_unit:row.duration_unit});
    if(error||!validImpact(data))throw Error('Impacto não confirmado.');
    return {fingerprint:carePreviewKey(row,signature),key:row.profession_key,duration:row.duration_value,unit:row.duration_unit,total:data.total,expired:data.expired,blocked:data.blocked_now};
  };
  const save=async(row:ProfessionRule,applyRetroactive=false)=>{
    if(lock.current||failed||!validCareness(row)||(row.enabled&&!mappingConfirmed)){toast.error('Confira período, escopo e De-Para.');return;}
    if(applyRetroactive&&(!row.enabled||retroactiveRequested!==row.profession_key||preview?.fingerprint!==carePreviewKey(row,signature))){toast.error('Calcule novamente o impacto.');return;}
    if(!window.confirm(applyRetroactive?'Aplicar carência retroativa? Bloqueios anteriores ativos também podem ser recalculados.':row.enabled?'Salvar regra de carência?':'Desligar a regra e liberar bloqueios existentes desta profissão?'))return;
    lock.current=true;setSaving(row.profession_key);
    try{await ensureCurrent(row);
      if(applyRetroactive){const fresh=await fetchImpact(row);if(!sameConfigSection(fresh,preview)){setPreview(fresh);toast.warning('Impacto alterado. Confira e confirme novamente.');return;}}
      const {data,error}=await (supabase as any).rpc("save_profession_careness_rule",{p_profession_key:row.profession_key,p_profession_name:row.suggested_name,p_enabled:row.enabled,p_duration_value:row.duration_value,p_duration_unit:row.duration_unit,p_scope:row.scope,p_apply_retroactive:applyRetroactive});
      if(error||data?.saved!==true)throw Error('Gravação não confirmada.');
      if(await load()){setStatus('Gravação confirmada');toast.success('Regra salva.');}else setStatus('Gravação confirmada pela RPC; consulta posterior não confirmada.');
    }catch(error){setFailed(true);setPreview(null);toast.error(error instanceof Error?error.message:'Gravação não confirmada.');}finally{lock.current=false;setSaving(null);}
  };
  const requestRetroactivePreview=async(row:ProfessionRule)=>{
    if(lock.current||failed||!row.enabled||!mappingConfirmed||!validCareness(row)){toast.error('Confira a regra antes de calcular o impacto.');return;}
    lock.current=true;setSaving(row.profession_key);setPreview(null);
    try{await ensureCurrent(row);setPreview(await fetchImpact(row));}catch(error){toast.error(error instanceof Error?error.message:'Impacto não confirmado.');}finally{lock.current=false;setSaving(null);}
  };

  const saveClick = async (row: ProfessionRule) => {
    if (row.enabled && retroactiveRequested === row.profession_key) {
      await requestRetroactivePreview(row);
      return;
    }
    await save(row);
  };

  if (loading) return <div className="flex items-center gap-2 py-10 text-muted-foreground"><Loader2 className="w-4 h-4 animate-spin" /> Carregando profissões…</div>;

  return <div className="space-y-5">
    <div className="rounded-xl border bg-card p-4 space-y-2">
      <div className="flex flex-wrap items-center justify-between gap-2"><p role="status" className="text-xs text-muted-foreground">{failed?"Consulta ou gravação não confirmada. Recarregue antes de editar.":status||"Configuração consultada"}</p><Button size="sm" variant="outline" disabled={!!saving} onClick={()=>{if(window.confirm("Recarregar e descartar alterações locais?"))void load();}}>Atualizar regras</Button></div>
      <h2 className="text-xl font-semibold">Regras de Carência Pós‑Alta</h2>
      <p className="text-sm text-muted-foreground mt-1">A carência se aplica somente a altas manuais do tipo conclusão. Regras novas começam desligadas.</p>
    </div>
    <fieldset disabled={!!saving||failed} className="space-y-4 min-w-0">
    <Card className="config-admin-card border-primary/20"><CardContent className="p-4 space-y-3">
      <div className="flex items-start gap-3">
        {mappingConfirmed ? <ShieldCheck className="w-5 h-5 text-success mt-0.5" /> : <AlertTriangle className="w-5 h-5 text-warning mt-0.5" />}
        <div className="flex-1">
          <p className="font-medium">De‑Para sugerido a partir de funcionarios.profissao</p>
          <p className="text-sm text-muted-foreground">
            {mappingConfirmed
              ? "Confira as variantes agrupadas abaixo. As regras continuam desligadas até você ativá-las."
              : "O catálogo mudou ou ainda não foi confirmado. As regras existentes ficam temporariamente suspensas; revise as variantes e confirme o De‑Para para reativar a aplicação."}
          </p>
        </div>
        {mappingConfirmed ? <Badge variant="secondary"><Check className="w-3 h-3 mr-1" /> Confirmado</Badge> :
          <Button size="sm" onClick={confirmMapping} disabled={!!saving || failed || !signature}>
            {saving === "mapping" && <Loader2 className="w-4 h-4 mr-2 animate-spin" />} Confirmar De‑Para
          </Button>}
      </div>
    </CardContent></Card>

    {failed ? <p role="alert" className="text-sm text-destructive">Dados não confirmados. Atualize as regras.</p> : rules.length === 0 ? <Card className="config-admin-card"><CardContent className="p-6 text-sm text-muted-foreground">Não há profissões ativas cadastradas.</CardContent></Card> :
      rules.map(row => <Card key={row.profession_key} className="config-admin-card shadow-sm"><CardContent className="p-4 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="font-semibold">{row.suggested_name}</h3>
            <p className="text-xs text-muted-foreground">{row.professional_count} profissional(is) · variantes atuais: {row.source_values.join(", ")}</p>
          </div>
          <div className="flex items-center gap-2"><Label htmlFor={`rule-${row.profession_key}`}>Regra {row.enabled ? (mappingConfirmed ? "ativa" : "suspensa") : "desligada"}</Label>
            <Switch id={`rule-${row.profession_key}`} checked={row.enabled} disabled={!!saving||failed||(!mappingConfirmed && !row.enabled)}
              onCheckedChange={checked => edit(row.profession_key,{enabled:checked})} />
          </div>
        </div>
        <div className="grid gap-3 sm:grid-cols-3">
          <div className="space-y-1.5"><Label>Período</Label><div className="flex gap-2">
            <Input type="number" min={1} max={3650} value={row.duration_value} onChange={e => edit(row.profession_key,{duration_value:Number(e.target.value)})} />
            <Select value={row.duration_unit} onValueChange={value => edit(row.profession_key,{duration_unit:value as "days"|"months"})}>
              <SelectTrigger className="w-32"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="days">Dias</SelectItem><SelectItem value="months">Meses</SelectItem></SelectContent>
            </Select>
          </div></div>
          <div className="space-y-1.5"><Label>Escopo</Label><Select value={row.scope} onValueChange={value => edit(row.profession_key,{scope:value as "global"|"unit"})}>
            <SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="global">Global (todas as unidades)</SelectItem><SelectItem value="unit">Somente unidade da alta</SelectItem></SelectContent>
          </Select></div>
          <div className="space-y-1.5"><Label>Retroatividade</Label><label className="flex items-center gap-2 text-sm min-h-10"><input type="checkbox" checked={retroactiveRequested===row.profession_key} onChange={e => { setPreview(null); setRetroactiveRequested(e.target.checked ? row.profession_key : null); }} /> Aplicar a altas anteriores</label></div>
        </div>
        <div className="flex justify-end gap-2 flex-wrap">
          {preview?.key===row.profession_key ? <Button variant="outline" size="sm" onClick={() => requestRetroactivePreview(row)} disabled={!!saving}><Clock3 className="w-4 h-4 mr-1" /> Recalcular impacto</Button> : null}
          <Button size="sm" onClick={() => saveClick(row)} disabled={!!saving || failed || !validCareness(row) || (row.enabled && !mappingConfirmed)}>{saving===row.profession_key&&<Loader2 className="w-4 h-4 mr-2 animate-spin" />}{retroactiveRequested===row.profession_key?"Ver impacto": "Salvar regra"}</Button>
          {retroactiveRequested===row.profession_key && preview?.fingerprint===carePreviewKey(row,signature) && preview.key===row.profession_key && <div className="w-full rounded-md bg-warning/10 border border-warning/30 p-3 text-sm">
            <p><strong>Novas altas elegíveis (estimativa):</strong> {preview.total} altas, {preview.expired} já vencidas e {preview.blocked} ainda bloqueadas usando {preview.duration} {preview.unit==="days"?"dia(s)":"mês(es)"}.</p>
            <p className="mt-1 text-xs">Bloqueios anteriores ativos também podem ser recalculados; a contagem acima não inclui todos esses registros.</p>
            <Button className="mt-2" variant="destructive" size="sm" disabled={!!saving} onClick={() => save(row,true)}>Confirmar e aplicar retroatividade</Button>
          </div>}
        </div>
      </CardContent></Card>)}
    </fieldset>
  </div>;
}
