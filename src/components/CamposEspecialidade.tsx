import React, { useMemo, useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { DebouncedInput } from "@/components/ui/debounced-input";
import { DebouncedTextarea } from "@/components/ui/debounced-textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Slider } from "@/components/ui/slider";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Stethoscope } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { normalizeProfissao } from "@/hooks/useProntuarioConfig";

type TipoProntuario = 'avaliacao' | 'retorno' | 'sessao' | 'urgencia' | 'procedimento';

interface CamposEspecialidadeProps {
  profissao: string;
  values: Record<string, string>;
  onChange: (key: string, value: string) => void;
  profissionalId?: string;
  tipoProntuario?: TipoProntuario;
}

interface CondicaoVisibilidade {
  campo: string;
  operador: 'igual' | 'diferente' | 'maior' | 'menor' | 'preenchido';
  valor?: string;
}

interface MasterCampo {
  id: string;
  key: string;
  label: string;
  tipo: string;
  obrigatorio: boolean;
  habilitado: boolean;
  isBuiltin: boolean;
  order: number;
  opcoes?: string[];
  tipos_prontuario?: TipoProntuario[];
  ajuda?: string;
  valor_padrao?: string;
  condicao?: CondicaoVisibilidade;
}

interface MasterEspecialidade {
  key: string;
  label: string;
  ativa: boolean;
  profissoes: string[];
  campos: MasterCampo[];
}

const DEFAULT_TIPOS: TipoProntuario[] = ['avaliacao', 'retorno'];

const KEY_ALIASES: Record<string, string> = {
  forca_muscular: 'forca_mrc',
  comportamento: 'comportamento_obs',
  risco: 'risco_agressao',
  peso: 'peso_kg',
  altura: 'altura_m',
  habitos: 'habitos_alimentares',
  mif: 'mif_score',
  contexto: 'contexto_ambiental',
  exame_fisico: 'exame_fisico_geral',
  sistemas: 'sistemas_avaliados',
  plano_tratamento: 'plano_tratamento_odonto',
  avaliacao_enfermagem: 'avaliacao_enf',
  cuidados: 'cuidados_realizados',
  intercorrencias: 'intercorrencias_enf',
  queixa_odonto: 'queixa_odonto',
};

const aliasFor = (k: string) => KEY_ALIASES[k] || k;

const classificarIMC = (imc: number): { label: string; color: string } => {
  if (imc < 18.5) return { label: "Abaixo do peso", color: "text-warning" };
  if (imc < 25) return { label: "Normal", color: "text-success" };
  if (imc < 30) return { label: "Sobrepeso", color: "text-warning" };
  if (imc < 35) return { label: "Obesidade I", color: "text-destructive" };
  if (imc < 40) return { label: "Obesidade II", color: "text-destructive" };
  return { label: "Obesidade III", color: "text-destructive" };
};

const evaColor = (val: number) => {
  if (val <= 3) return "bg-green-500";
  if (val <= 6) return "bg-yellow-500";
  return "bg-red-500";
};

const SPECIALTY_CONFIG: Record<string, { title: string; icon: string }> = {
  fisioterapia: { title: "Avaliação Fisioterapêutica", icon: "🦴" },
  psicologia: { title: "Avaliação Psicológica", icon: "🧠" },
  fonoaudiologia: { title: "Avaliação Fonoaudiológica", icon: "🗣️" },
  nutricao: { title: "Avaliação Nutricional", icon: "🥗" },
  terapia_ocupacional: { title: "Avaliação de Terapia Ocupacional", icon: "🤲" },
  medicina: { title: "Avaliação Médica", icon: "⚕️" },
  odontologia: { title: "Avaliação Odontológica", icon: "🦷" },
  enfermagem: { title: "Avaliação de Enfermagem", icon: "💉" },
  servico_social: { title: "Avaliação Social", icon: "🤝" },
  assistente_social: { title: "Avaliação Social", icon: "🤝" },
  cirurgia_geral: { title: "Avaliação Cirúrgica", icon: "🔪" },
  cirurgiao: { title: "Avaliação Cirúrgica", icon: "🔪" },
  infectologia: { title: "Avaliação Infectológica", icon: "🦠" },
  infectologista: { title: "Avaliação Infectológica", icon: "🦠" },
};

const CamposEspecialidade: React.FC<CamposEspecialidadeProps> = ({ profissao, values, onChange, profissionalId, tipoProntuario }) => {
  const prof = normalizeProfissao(profissao);
  const [masterEsp, setMasterEsp] = useState<MasterEspecialidade | null>(null);

  // Load Master config for this specialty + Realtime
  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      const { data } = await supabase.from('system_config').select('configuracoes').eq('id', 'default').maybeSingle();
      const cfg = (data?.configuracoes as any)?.config_especialidades_campos as MasterEspecialidade[] | undefined;
      if (cancelled || !cfg) return;
      const found = cfg.find(e => e.profissoes.includes(prof) || e.key === prof);
      setMasterEsp(found || null);
    };
    load();
    const channel = supabase
      .channel(`camposesp_realtime_${prof}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'system_config', filter: 'id=eq.default' }, load)
      .subscribe();
    return () => { cancelled = true; supabase.removeChannel(channel); };
  }, [prof]);

  if (!SPECIALTY_CONFIG[prof] && !masterEsp) return null;

  const config = SPECIALTY_CONFIG[prof] || { title: masterEsp?.label || "Avaliação de Especialidade", icon: "📋" };
  const v = (key: string) => values[`esp_${key}`] || "";
  const set = (key: string, val: string) => onChange(`esp_${key}`, val);

  const condicaoSatisfeita = (cond?: CondicaoVisibilidade): boolean => {
    if (!cond) return true;
    const otherKey = aliasFor(cond.campo);
    const raw = values[`esp_${otherKey}`] ?? '';
    const val = String(raw).trim();
    switch (cond.operador) {
      case 'preenchido': return val.length > 0;
      case 'igual': return val === (cond.valor ?? '');
      case 'diferente': return val !== (cond.valor ?? '');
      case 'maior': return parseFloat(val) > parseFloat(cond.valor ?? '0');
      case 'menor': return parseFloat(val) < parseFloat(cond.valor ?? '0');
      default: return true;
    }
  };

  const visibleFields = useMemo(() => {
    if (!masterEsp) return [];
    return masterEsp.campos
      .filter(c => {
        if (!c.habilitado) return false;
        const tipos = c.tipos_prontuario && c.tipos_prontuario.length > 0 ? c.tipos_prontuario : DEFAULT_TIPOS;
        const currentTipo = tipoProntuario === 'avaliacao_inicial' ? 'avaliacao' : (tipoProntuario as any);
        if (tipoProntuario && !tipos.includes(currentTipo)) return false;
        if (!condicaoSatisfeita(c.condicao)) return false;
        return true;
      })
      .sort((a, b) => a.order - b.order);
  }, [masterEsp, tipoProntuario, values]);

  const renderField = (c: MasterCampo) => {
    const key = aliasFor(c.key);
    const value = v(key);

    switch (c.tipo) {
      case 'textarea':
        return (
          <div key={c.id}>
            <Label>{c.label} {c.obrigatorio && <span className="text-destructive">*</span>}</Label>
            <DebouncedTextarea
              rows={3}
              value={value}
              onChange={e => set(key, e.target.value)}
              placeholder={c.ajuda || ""}
            />
          </div>
        );
      case 'text':
        return (
          <div key={c.id}>
            <Label>{c.label} {c.obrigatorio && <span className="text-destructive">*</span>}</Label>
            <DebouncedInput
              value={value}
              onChange={e => set(key, e.target.value)}
              placeholder={c.ajuda || ""}
            />
          </div>
        );
      case 'number':
        return (
          <div key={c.id}>
            <Label>{c.label} {c.obrigatorio && <span className="text-destructive">*</span>}</Label>
            <DebouncedInput
              type="number"
              value={value}
              onChange={e => set(key, e.target.value)}
              placeholder={c.ajuda || ""}
            />
          </div>
        );
      case 'select':
        return (
          <div key={c.id}>
            <Label>{c.label} {c.obrigatorio && <span className="text-destructive">*</span>}</Label>
            <Select value={value} onValueChange={val => set(key, val)}>
              <SelectTrigger>
                <SelectValue placeholder="Selecione..." />
              </SelectTrigger>
              <SelectContent>
                {c.opcoes?.map(opt => (
                  <SelectItem key={opt} value={opt}>{opt}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            {c.ajuda && <p className="text-[10px] text-muted-foreground mt-1 italic">💡 {c.ajuda}</p>}
          </div>
        );
      case 'slider':
        const numVal = parseInt(value || "0");
        const isEva = key === 'dor_eva';
        return (
          <div key={c.id}>
            <Label className="flex items-center gap-2">
              {c.label}: <Badge className={isEva ? `${evaColor(numVal)} text-white` : "bg-primary"}>{numVal}</Badge>
            </Label>
            <Slider
              min={0}
              max={10}
              step={1}
              value={[numVal]}
              onValueChange={([val]) => set(key, String(val))}
              className="mt-2"
            />
            <div className="flex justify-between text-[10px] text-muted-foreground mt-1">
              <span>{isEva ? "Sem dor" : "Mínimo"}</span>
              <span>{isEva ? "Máxima" : "Máximo"}</span>
            </div>
          </div>
        );
      case 'date':
        return (
          <div key={c.id}>
            <Label>{c.label} {c.obrigatorio && <span className="text-destructive">*</span>}</Label>
            <DebouncedInput
              type="date"
              value={value}
              onChange={e => set(key, e.target.value)}
            />
          </div>
        );
      default:
        return null;
    }
  };

  return (
    <Card className="border-primary/20 bg-primary/5 shadow-sm">
      <CardHeader className="py-3 px-4 flex flex-row items-center gap-2">
        <Stethoscope className="w-4 h-4 text-primary" />
        <CardTitle className="text-sm font-semibold text-primary">{config.icon} {config.title}</CardTitle>
      </CardHeader>
      <CardContent className="px-4 pb-4 pt-0 space-y-4">
        {visibleFields.length > 0 ? (
          visibleFields.map(renderField)
        ) : (
          <p className="text-xs text-muted-foreground italic">Nenhum campo de especialidade configurado para este tipo de prontuário.</p>
        )}
      </CardContent>
    </Card>
  );
};

export default CamposEspecialidade;
