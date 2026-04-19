import React, { useMemo, useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
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

// Mapeamento entre o `key` exibido na config Master e o `fieldKey` interno usado pelos blocos
// (alguns são iguais, outros divergem por motivos históricos)
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

// Map of built-in field keys per specialty for visibility control
const BUILTIN_FIELDS: Record<string, string[]> = {
  fisioterapia: ['avaliacao_funcional', 'adm', 'forca_mrc', 'dor_eva', 'postura_marcha'],
  psicologia: ['estado_emocional', 'comportamento_obs', 'relato_subjetivo', 'risco_agressao'],
  fonoaudiologia: ['comunicacao', 'linguagem', 'degluticao', 'voz'],
  nutricao: ['peso_kg', 'altura_m', 'avaliacao_nutricional', 'habitos_alimentares', 'plano_alimentar'],
  terapia_ocupacional: ['mif_score', 'avd', 'aivd', 'contexto_ambiental'],
  medicina: ['exame_fisico_geral', 'sistemas_avaliados', 'hipotese_cid', 'prescricao_sol'],
  odontologia: ['exame_intrabucal', 'queixa_odonto', 'plano_tratamento_odonto'],
  enfermagem: ['avaliacao_enf', 'cuidados_realizados', 'intercorrencias_enf'],
  servico_social: ['situacao_socioeconomica', 'rede_apoio', 'vulnerabilidade', 'encaminhamentos_sociais', 'parecer_social'],
  cirurgia_geral: ['indicacao_cirurgica', 'avaliacao_preop', 'descricao_procedimento', 'orientacoes_posop'],
  infectologia: ['agente_infeccioso', 'exames_lab', 'esquema_terapeutico', 'medidas_controle'],
};

interface ProfConfig {
  campos_especialidade?: Record<string, { visivel: boolean; favorito: boolean; ordem: number }>;
  campos_especialidade_custom?: Array<{
    id: string; key: string; label: string; tipo: string;
    opcoes?: string[]; order: number;
  }>;
}

const CamposEspecialidade: React.FC<CamposEspecialidadeProps> = ({ profissao, values, onChange, profissionalId, tipoProntuario }) => {
  const prof = normalizeProfissao(profissao);
  const [profConfig, setProfConfig] = useState<ProfConfig | null>(null);
  const [masterEsp, setMasterEsp] = useState<MasterEspecialidade | null>(null);

  // Load professional config for custom fields
  useEffect(() => {
    if (!profissionalId) return;
    let cancelled = false;
    (async () => {
      const { data } = await (supabase as any)
        .from('prontuario_config')
        .select('config')
        .eq('profissional_id', profissionalId)
        .limit(1);
      if (!cancelled && data?.[0]?.config) {
        setProfConfig(data[0].config as ProfConfig);
      }
    })();
    return () => { cancelled = true; };
  }, [profissionalId]);

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

  if (!SPECIALTY_CONFIG[prof]) return null;

  const config = SPECIALTY_CONFIG[prof];
  const v = (key: string) => values[`esp_${key}`] || "";
  const set = (key: string, val: string) => onChange(`esp_${key}`, val);

  const masterCampoFor = (fieldKey: string): MasterCampo | undefined => {
    if (!masterEsp) return undefined;
    return masterEsp.campos.find(c => aliasFor(c.key) === fieldKey || c.key === fieldKey);
  };

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

  // Built-in field visibility: profissional pref AND master habilitado AND tipoProntuario AND condicional
  const isFieldVisible = (fieldKey: string) => {
    if (profConfig?.campos_especialidade) {
      const cfg = profConfig.campos_especialidade[fieldKey];
      if (cfg && cfg.visivel === false) return false;
    }
    const m = masterCampoFor(fieldKey);
    if (m) {
      if (!m.habilitado) return false;
      const tipos = m.tipos_prontuario && m.tipos_prontuario.length > 0 ? m.tipos_prontuario : DEFAULT_TIPOS;
      if (tipoProntuario && !tipos.includes(tipoProntuario)) return false;
      if (!condicaoSatisfeita(m.condicao)) return false;
    }
    return true;
  };

  // Get custom fields (do profissional)
  const customFields = profConfig?.campos_especialidade_custom || [];

  // Custom fields criados pelo Master nesta especialidade
  const masterCustomFields: MasterCampo[] = (masterEsp?.campos || []).filter(c => {
    if (c.isBuiltin) return false;
    if (!c.habilitado) return false;
    const tipos = c.tipos_prontuario && c.tipos_prontuario.length > 0 ? c.tipos_prontuario : DEFAULT_TIPOS;
    if (tipoProntuario && !tipos.includes(tipoProntuario)) return false;
    if (!condicaoSatisfeita(c.condicao)) return false;
    return true;
  });

  const renderFisioterapia = () => {
    const mrc = parseInt(v("forca_mrc") || "0");
    const eva = parseInt(v("dor_eva") || "0");
    return (
      <div className="space-y-3">
        {isFieldVisible('avaliacao_funcional') && (
          <div><Label>Avaliação Funcional</Label><Textarea rows={2} value={v("avaliacao_funcional")} onChange={e => set("avaliacao_funcional", e.target.value)} placeholder="Descreva a funcionalidade do paciente..." /></div>
        )}
        {isFieldVisible('adm') && (
          <div><Label>Amplitude de Movimento (ADM)</Label><Textarea rows={2} value={v("adm")} onChange={e => set("adm", e.target.value)} placeholder="ADM ativa/passiva das articulações avaliadas..." /></div>
        )}
        {isFieldVisible('forca_mrc') && (
          <div>
            <Label>Força Muscular (MRC 0–5): <strong>{mrc}</strong></Label>
            <Slider min={0} max={5} step={1} value={[mrc]} onValueChange={([val]) => set("forca_mrc", String(val))} className="mt-2" />
            <div className="flex justify-between text-[10px] text-muted-foreground mt-1">
              <span>0 (Ausente)</span><span>1</span><span>2</span><span>3</span><span>4</span><span>5 (Normal)</span>
            </div>
          </div>
        )}
        {isFieldVisible('dor_eva') && (
          <div>
            <Label className="flex items-center gap-2">
              Dor EVA (0–10): <Badge className={`${evaColor(eva)} text-white`}>{eva}</Badge>
            </Label>
            <Slider min={0} max={10} step={1} value={[eva]} onValueChange={([val]) => set("dor_eva", String(val))} className="mt-2" />
            <div className="flex justify-between text-[10px] text-muted-foreground mt-1">
              <span className="text-green-600">0 (Sem dor)</span><span className="text-yellow-600">5</span><span className="text-red-600">10 (Máxima)</span>
            </div>
          </div>
        )}
        {isFieldVisible('postura_marcha') && (
          <div><Label>Postura e Marcha</Label><Textarea rows={2} value={v("postura_marcha")} onChange={e => set("postura_marcha", e.target.value)} placeholder="Observações sobre postura e padrão de marcha..." /></div>
        )}
      </div>
    );
  };

  const renderPsicologia = () => (
    <div className="space-y-3">
      {isFieldVisible('estado_emocional') && (
        <div><Label>Estado Emocional</Label><Textarea rows={2} value={v("estado_emocional")} onChange={e => set("estado_emocional", e.target.value)} placeholder="Humor, afeto, ansiedade..." /></div>
      )}
      {isFieldVisible('comportamento_obs') && (
        <div><Label>Comportamento Observado</Label><Textarea rows={2} value={v("comportamento_obs")} onChange={e => set("comportamento_obs", e.target.value)} placeholder="Postura, colaboração, interação..." /></div>
      )}
      {isFieldVisible('relato_subjetivo') && (
        <div><Label>Relato Subjetivo</Label><Textarea rows={2} value={v("relato_subjetivo")} onChange={e => set("relato_subjetivo", e.target.value)} placeholder="O que o paciente relata..." /></div>
      )}
      {isFieldVisible('risco_agressao') && (
        <div>
          <Label>Risco Auto/Heteroagressão</Label>
          <Select value={v("risco_agressao") || "ausente"} onValueChange={val => set("risco_agressao", val)}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="ausente">Ausente</SelectItem>
              <SelectItem value="baixo">Baixo</SelectItem>
              <SelectItem value="moderado">Moderado</SelectItem>
              <SelectItem value="alto">Alto ⚠️</SelectItem>
            </SelectContent>
          </Select>
          {v("risco_agressao") === "alto" && (
            <div className="mt-2 p-2 bg-destructive/10 border border-destructive/30 rounded-md text-xs text-destructive font-medium">
              ⚠️ RISCO ALTO IDENTIFICADO — Acionar protocolo de segurança conforme norma institucional.
            </div>
          )}
        </div>
      )}
    </div>
  );

  const renderFonoaudiologia = () => (
    <div className="space-y-3">
      {isFieldVisible('comunicacao') && <div><Label>Avaliação da Comunicação</Label><Textarea rows={2} value={v("comunicacao")} onChange={e => set("comunicacao", e.target.value)} /></div>}
      {isFieldVisible('linguagem') && <div><Label>Linguagem</Label><Textarea rows={2} value={v("linguagem")} onChange={e => set("linguagem", e.target.value)} /></div>}
      {isFieldVisible('degluticao') && <div><Label>Deglutição</Label><Textarea rows={2} value={v("degluticao")} onChange={e => set("degluticao", e.target.value)} /></div>}
      {isFieldVisible('voz') && <div><Label>Voz</Label><Textarea rows={2} value={v("voz")} onChange={e => set("voz", e.target.value)} /></div>}
    </div>
  );

  const renderNutricao = () => {
    const peso = parseFloat(v("peso_kg") || "0");
    const altura = parseFloat(v("altura_m") || "0");
    const imc = peso > 0 && altura > 0 ? peso / (altura * altura) : 0;
    const imcInfo = imc > 0 ? classificarIMC(imc) : null;
    return (
      <div className="space-y-3">
        {(isFieldVisible('peso_kg') || isFieldVisible('altura_m')) && (
          <div className="grid grid-cols-3 gap-2">
            <div><Label>Peso (kg)</Label><Input type="number" step="0.1" value={v("peso_kg")} onChange={e => set("peso_kg", e.target.value)} className="h-8" /></div>
            <div><Label>Altura (m)</Label><Input type="number" step="0.01" value={v("altura_m")} onChange={e => set("altura_m", e.target.value)} className="h-8" placeholder="1.70" /></div>
            <div>
              <Label>IMC</Label>
              <div className="flex items-center gap-2 h-8">
                {imc > 0 ? (<><span className="font-bold">{imc.toFixed(1)}</span><Badge variant="outline" className={`text-xs ${imcInfo?.color}`}>{imcInfo?.label}</Badge></>) : <span className="text-xs text-muted-foreground">—</span>}
              </div>
            </div>
          </div>
        )}
        {isFieldVisible('avaliacao_nutricional') && <div><Label>Avaliação Nutricional</Label><Textarea rows={2} value={v("avaliacao_nutricional")} onChange={e => set("avaliacao_nutricional", e.target.value)} /></div>}
        {isFieldVisible('habitos_alimentares') && <div><Label>Hábitos Alimentares</Label><Textarea rows={2} value={v("habitos_alimentares")} onChange={e => set("habitos_alimentares", e.target.value)} /></div>}
        {isFieldVisible('plano_alimentar') && <div><Label>Plano Alimentar</Label><Textarea rows={2} value={v("plano_alimentar")} onChange={e => set("plano_alimentar", e.target.value)} /></div>}
      </div>
    );
  };

  const renderTerapiaOcupacional = () => {
    const mif = parseInt(v("mif_score") || "18");
    return (
      <div className="space-y-3">
        {isFieldVisible('mif_score') && (
          <div>
            <Label>MIF (18–126): <strong>{mif}</strong></Label>
            <Slider min={18} max={126} step={1} value={[mif]} onValueChange={([val]) => set("mif_score", String(val))} className="mt-2" />
            <div className="flex justify-between text-[10px] text-muted-foreground mt-1"><span>18 (Dependência total)</span><span>126 (Independência)</span></div>
          </div>
        )}
        {isFieldVisible('avd') && <div><Label>Atividades de Vida Diária (AVD)</Label><Textarea rows={2} value={v("avd")} onChange={e => set("avd", e.target.value)} /></div>}
        {isFieldVisible('aivd') && <div><Label>Atividades Instrumentais (AIVD)</Label><Textarea rows={2} value={v("aivd")} onChange={e => set("aivd", e.target.value)} /></div>}
        {isFieldVisible('contexto_ambiental') && <div><Label>Contexto Ambiental e Social</Label><Textarea rows={2} value={v("contexto_ambiental")} onChange={e => set("contexto_ambiental", e.target.value)} /></div>}
      </div>
    );
  };

  const renderMedicina = () => (
    <div className="space-y-3">
      {isFieldVisible('exame_fisico_geral') && <div><Label>Exame Físico Geral</Label><Textarea rows={3} value={v("exame_fisico_geral")} onChange={e => set("exame_fisico_geral", e.target.value)} /></div>}
      {isFieldVisible('sistemas_avaliados') && <div><Label>Sistemas Avaliados</Label><Textarea rows={2} value={v("sistemas_avaliados")} onChange={e => set("sistemas_avaliados", e.target.value)} placeholder="Cardiovascular, respiratório, neurológico..." /></div>}
      {isFieldVisible('hipotese_cid') && <div><Label>Hipótese Diagnóstica com CID</Label><Textarea rows={2} value={v("hipotese_cid")} onChange={e => set("hipotese_cid", e.target.value)} placeholder="CID + descrição..." /></div>}
      {isFieldVisible('prescricao_sol') && <div><Label>Prescrição e Solicitações</Label><Textarea rows={2} value={v("prescricao_sol")} onChange={e => set("prescricao_sol", e.target.value)} /></div>}
    </div>
  );

  const renderOdontologia = () => (
    <div className="space-y-3">
      {isFieldVisible('exame_intrabucal') && <div><Label>Exame Intrabucal</Label><Textarea rows={2} value={v("exame_intrabucal")} onChange={e => set("exame_intrabucal", e.target.value)} /></div>}
      {isFieldVisible('queixa_odonto') && <div><Label>Queixa Odontológica</Label><Textarea rows={2} value={v("queixa_odonto")} onChange={e => set("queixa_odonto", e.target.value)} /></div>}
      {isFieldVisible('plano_tratamento_odonto') && <div><Label>Plano de Tratamento</Label><Textarea rows={2} value={v("plano_tratamento_odonto")} onChange={e => set("plano_tratamento_odonto", e.target.value)} /></div>}
    </div>
  );

  const renderEnfermagem = () => (
    <div className="space-y-3">
      {isFieldVisible('avaliacao_enf') && <div><Label>Avaliação de Enfermagem</Label><Textarea rows={2} value={v("avaliacao_enf")} onChange={e => set("avaliacao_enf", e.target.value)} /></div>}
      {isFieldVisible('cuidados_realizados') && <div><Label>Cuidados Realizados</Label><Textarea rows={2} value={v("cuidados_realizados")} onChange={e => set("cuidados_realizados", e.target.value)} /></div>}
      {isFieldVisible('intercorrencias_enf') && <div><Label>Intercorrências</Label><Textarea rows={2} value={v("intercorrencias_enf")} onChange={e => set("intercorrencias_enf", e.target.value)} /></div>}
    </div>
  );

  const renderServicoSocial = () => (
    <div className="space-y-3">
      {isFieldVisible('situacao_socioeconomica') && <div><Label>Situação Socioeconômica</Label><Textarea rows={2} value={v("situacao_socioeconomica")} onChange={e => set("situacao_socioeconomica", e.target.value)} placeholder="Renda, moradia, composição familiar..." /></div>}
      {isFieldVisible('rede_apoio') && <div><Label>Rede de Apoio</Label><Textarea rows={2} value={v("rede_apoio")} onChange={e => set("rede_apoio", e.target.value)} placeholder="Família, comunidade, serviços..." /></div>}
      {isFieldVisible('vulnerabilidade') && (
        <div><Label>Vulnerabilidade Social</Label>
          <Select value={v("vulnerabilidade") || "baixa"} onValueChange={val => set("vulnerabilidade", val)}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="baixa">Baixa</SelectItem>
              <SelectItem value="media">Média</SelectItem>
              <SelectItem value="alta">Alta</SelectItem>
              <SelectItem value="extrema">Extrema ⚠️</SelectItem>
            </SelectContent>
          </Select>
        </div>
      )}
      {isFieldVisible('encaminhamentos_sociais') && <div><Label>Encaminhamentos Sociais</Label><Textarea rows={2} value={v("encaminhamentos_sociais")} onChange={e => set("encaminhamentos_sociais", e.target.value)} placeholder="CRAS, CREAS, benefícios..." /></div>}
      {isFieldVisible('parecer_social') && <div><Label>Parecer Social</Label><Textarea rows={2} value={v("parecer_social")} onChange={e => set("parecer_social", e.target.value)} /></div>}
    </div>
  );

  const renderCirurgiaGeral = () => (
    <div className="space-y-3">
      {isFieldVisible('indicacao_cirurgica') && <div><Label>Indicação Cirúrgica</Label><Textarea rows={2} value={v("indicacao_cirurgica")} onChange={e => set("indicacao_cirurgica", e.target.value)} placeholder="Motivo e tipo de cirurgia indicada..." /></div>}
      {isFieldVisible('avaliacao_preop') && <div><Label>Avaliação Pré-operatória</Label><Textarea rows={2} value={v("avaliacao_preop")} onChange={e => set("avaliacao_preop", e.target.value)} placeholder="Exames, risco cirúrgico..." /></div>}
      {isFieldVisible('descricao_procedimento') && <div><Label>Descrição do Procedimento</Label><Textarea rows={2} value={v("descricao_procedimento")} onChange={e => set("descricao_procedimento", e.target.value)} /></div>}
      {isFieldVisible('orientacoes_posop') && <div><Label>Orientações Pós-operatórias</Label><Textarea rows={2} value={v("orientacoes_posop")} onChange={e => set("orientacoes_posop", e.target.value)} /></div>}
    </div>
  );

  const renderInfectologia = () => (
    <div className="space-y-3">
      {isFieldVisible('agente_infeccioso') && <div><Label>Agente Infeccioso / Suspeita</Label><Textarea rows={2} value={v("agente_infeccioso")} onChange={e => set("agente_infeccioso", e.target.value)} placeholder="Agente etiológico ou suspeita clínica..." /></div>}
      {isFieldVisible('exames_lab') && <div><Label>Exames Laboratoriais</Label><Textarea rows={2} value={v("exames_lab")} onChange={e => set("exames_lab", e.target.value)} placeholder="Resultados de sorologias, culturas..." /></div>}
      {isFieldVisible('esquema_terapeutico') && <div><Label>Esquema Terapêutico</Label><Textarea rows={2} value={v("esquema_terapeutico")} onChange={e => set("esquema_terapeutico", e.target.value)} placeholder="Antibióticos, antivirais, duração..." /></div>}
      {isFieldVisible('medidas_controle') && <div><Label>Medidas de Controle</Label><Textarea rows={2} value={v("medidas_controle")} onChange={e => set("medidas_controle", e.target.value)} placeholder="Isolamento, notificação, profilaxia..." /></div>}
    </div>
  );

  // Render custom fields created by the professional
  const renderCustomFields = () => {
    if (customFields.length === 0) return null;
    return (
      <div className="space-y-3 pt-2 border-t border-border/40">
        {customFields.map(campo => {
          const fieldKey = campo.key;
          if (!isFieldVisible(fieldKey)) return null;
          return (
            <div key={campo.key}>
              <Label className="flex items-center gap-2">
                {campo.label}
                <Badge variant="outline" className="text-[9px] px-1 py-0 text-blue-400 border-blue-500/30">Personalizado</Badge>
              </Label>
              {campo.tipo === 'textarea' && (
                <Textarea rows={2} value={v(fieldKey)} onChange={e => set(fieldKey, e.target.value)} />
              )}
              {campo.tipo === 'text' && (
                <Input value={v(fieldKey)} onChange={e => set(fieldKey, e.target.value)} />
              )}
              {campo.tipo === 'number' && (
                <Input type="number" value={v(fieldKey)} onChange={e => set(fieldKey, e.target.value)} className="h-8" />
              )}
              {campo.tipo === 'select' && campo.opcoes && (
                <Select value={v(fieldKey) || ''} onValueChange={val => set(fieldKey, val)}>
                  <SelectTrigger><SelectValue placeholder="Selecione..." /></SelectTrigger>
                  <SelectContent>
                    {campo.opcoes.map(op => <SelectItem key={op} value={op}>{op}</SelectItem>)}
                  </SelectContent>
                </Select>
              )}
              {campo.tipo === 'slider' && (
                <div>
                  <Slider min={0} max={10} step={1} value={[parseInt(v(fieldKey) || "0")]} onValueChange={([val]) => set(fieldKey, String(val))} className="mt-2" />
                  <div className="flex justify-between text-[10px] text-muted-foreground mt-1"><span>0</span><span>10</span></div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    );
  };

  const renderFields = () => {
    switch (prof) {
      case 'fisioterapia': return renderFisioterapia();
      case 'psicologia': return renderPsicologia();
      case 'fonoaudiologia': return renderFonoaudiologia();
      case 'nutricao': return renderNutricao();
      case 'terapia_ocupacional': return renderTerapiaOcupacional();
      case 'medicina': return renderMedicina();
      case 'odontologia': return renderOdontologia();
      case 'enfermagem': return renderEnfermagem();
      case 'servico_social': case 'assistente_social': return renderServicoSocial();
      case 'cirurgia_geral': case 'cirurgiao': return renderCirurgiaGeral();
      case 'infectologia': case 'infectologista': return renderInfectologia();
      default: return null;
    }
  };

  return (
    <Card className="border shadow-sm border-primary/20">
      <CardHeader className="pb-2 pt-3 px-4">
        <CardTitle className="text-sm font-semibold flex items-center gap-2">
          <Stethoscope className="w-4 h-4 text-primary" />
          <span>{config.icon} {config.title}</span>
        </CardTitle>
      </CardHeader>
      <CardContent className="px-4 pb-4 pt-0 space-y-0">
        {renderFields()}
        {renderCustomFields()}
      </CardContent>
    </Card>
  );
};

export default CamposEspecialidade;
