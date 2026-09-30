import { useCallback, useEffect, useState } from "react";
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
interface RetroPreview { key: string; duration: number; unit: string; total: number; expired: number; blocked: number }

export default function ConfigRegrasCarencia() {
  const [rules, setRules] = useState<ProfessionRule[]>([]);
  const [signature, setSignature] = useState("");
  const [mappingConfirmed, setMappingConfirmed] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);
  const [preview, setPreview] = useState<RetroPreview | null>(null);
  const [retroactiveRequested, setRetroactiveRequested] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data, error } = await (supabase as any).rpc("list_profession_careness_setup");
      if (error) throw error;
      const result = data as SetupResponse;
      setRules(result.professions || []);
      setSignature(result.mapping_signature || "");
      setMappingConfirmed(Boolean(result.mapping_confirmed));
    } catch (error) {
      console.error("Falha ao carregar configuração de carência:", error);
      toast.error("Não foi possível carregar a configuração. Confirme se a migração SQL foi aplicada.");
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const edit = (key: string, changes: Partial<ProfessionRule>) => {
    setPreview(null);
    setRetroactiveRequested(null);
    setRules(current => current.map(row => row.profession_key === key ? { ...row, ...changes } : row));
  };

  const confirmMapping = async () => {
    if (!signature) return;
    setSaving("mapping");
    try {
      const { error } = await (supabase as any).rpc("confirm_profession_careness_mapping", { p_signature: signature });
      if (error) throw error;
      setMappingConfirmed(true);
      toast.success("De‑Para confirmado. As regras continuam desligadas até você ativar cada profissão.");
    } catch (error) {
      console.error(error);
      toast.error(error instanceof Error ? error.message : "Não foi possível confirmar o De‑Para.");
    } finally { setSaving(null); }
  };

  const save = async (row: ProfessionRule, applyRetroactive = false) => {
    if (row.enabled && !mappingConfirmed) {
      toast.error("Confira e confirme primeiro a lista consolidada de profissões.");
      return;
    }
    setSaving(row.profession_key);
    try {
      const { error } = await (supabase as any).rpc("save_profession_careness_rule", {
        p_profession_key: row.profession_key,
        p_profession_name: row.suggested_name,
        p_enabled: row.enabled,
        p_duration_value: Number(row.duration_value),
        p_duration_unit: row.duration_unit,
        p_scope: row.scope,
        p_apply_retroactive: applyRetroactive,
      });
      if (error) throw error;
      setPreview(null);
      toast.success(row.enabled ? `Regra de ${row.suggested_name} salva.` : `Regra de ${row.suggested_name} desligada; os bloqueios existentes foram liberados.`);
      await load();
    } catch (error) {
      console.error(error);
      toast.error(error instanceof Error ? error.message : "Não foi possível salvar a regra.");
    } finally { setSaving(null); }
  };

  const requestRetroactivePreview = async (row: ProfessionRule) => {
    setSaving(row.profession_key);
    try {
      const { data, error } = await (supabase as any).rpc("preview_profession_careness_retroactive", {
        p_profession_key: row.profession_key,
        p_duration_value: Number(row.duration_value),
        p_duration_unit: row.duration_unit,
      });
      if (error) throw error;
      setPreview({ key: row.profession_key, duration: Number(row.duration_value), unit: row.duration_unit,
        total: data.total || 0, expired: data.expired || 0, blocked: data.blocked_now || 0 });
    } catch (error) {
      console.error(error);
      toast.error(error instanceof Error ? error.message : "Falha ao calcular o impacto retroativo.");
    } finally { setSaving(null); }
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
    <div>
      <h2 className="text-xl font-semibold">Regras de Carência Pós‑Alta</h2>
      <p className="text-sm text-muted-foreground mt-1">A carência se aplica somente a altas manuais do tipo conclusão. Regras novas começam desligadas.</p>
    </div>
    <Card className="border-primary/20"><CardContent className="p-4 space-y-3">
      <div className="flex items-start gap-3">
        {mappingConfirmed ? <ShieldCheck className="w-5 h-5 text-success mt-0.5" /> : <AlertTriangle className="w-5 h-5 text-warning mt-0.5" />}
        <div className="flex-1">
          <p className="font-medium">De‑Para sugerido a partir de funcionarios.profissao</p>
          <p className="text-sm text-muted-foreground">Confira as variantes agrupadas abaixo. Nenhuma regra pode ser ativada até confirmar este agrupamento.</p>
        </div>
        {mappingConfirmed ? <Badge variant="secondary"><Check className="w-3 h-3 mr-1" /> Confirmado</Badge> :
          <Button size="sm" onClick={confirmMapping} disabled={saving === "mapping" || !signature}>
            {saving === "mapping" && <Loader2 className="w-4 h-4 mr-2 animate-spin" />} Confirmar De‑Para
          </Button>}
      </div>
    </CardContent></Card>

    {rules.length === 0 ? <Card><CardContent className="p-6 text-sm text-muted-foreground">Não há profissões ativas cadastradas.</CardContent></Card> :
      rules.map(row => <Card key={row.profession_key} className="shadow-sm"><CardContent className="p-4 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="font-semibold">{row.suggested_name}</h3>
            <p className="text-xs text-muted-foreground">{row.professional_count} profissional(is) · variantes atuais: {row.source_values.join(", ")}</p>
          </div>
          <div className="flex items-center gap-2"><Label htmlFor={`rule-${row.profession_key}`}>Regra {row.enabled ? "ativa" : "desligada"}</Label>
            <Switch id={`rule-${row.profession_key}`} checked={row.enabled} disabled={!mappingConfirmed && !row.enabled}
              onCheckedChange={checked => edit(row.profession_key,{enabled:checked})} />
          </div>
        </div>
        <div className="grid gap-3 sm:grid-cols-3">
          <div className="space-y-1.5"><Label>Período</Label><div className="flex gap-2">
            <Input type="number" min={1} max={3650} value={row.duration_value} onChange={e => edit(row.profession_key,{duration_value:Math.max(1,Number(e.target.value)||1)})} />
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
          <Button size="sm" onClick={() => saveClick(row)} disabled={!!saving || (row.enabled && !mappingConfirmed)}>{saving===row.profession_key&&<Loader2 className="w-4 h-4 mr-2 animate-spin" />}{retroactiveRequested===row.profession_key?"Ver impacto": "Salvar regra"}</Button>
          {retroactiveRequested===row.profession_key && preview?.key===row.profession_key && <div className="w-full rounded-md bg-warning/10 border border-warning/30 p-3 text-sm">
            <p><strong>Impacto previsto:</strong> {preview.total} altas, {preview.expired} já vencidas e {preview.blocked} ainda bloqueadas usando {preview.duration} {preview.unit==="days"?"dia(s)":"mês(es)"}.</p>
            <Button className="mt-2" variant="destructive" size="sm" disabled={!!saving} onClick={() => save(row,true)}>Confirmar e aplicar retroatividade</Button>
          </div>}
        </div>
      </CardContent></Card>)}
  </div>;
}
