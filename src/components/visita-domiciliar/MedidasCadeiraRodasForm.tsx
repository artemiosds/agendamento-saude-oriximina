import React, { useState, useEffect, useRef } from "react";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";

export interface MedidasCadeiraRodasValue {
  data_avaliacao?: string;
  equipamento_solicitado?: string;
  diagnostico_condicao_funcional?: string;
  motivo_solicitacao?: string;
  controle_cervical?: string;
  controle_tronco?: string;
  equilibrio_sentado?: string;
  mobilidade_membros_superiores?: string;
  mobilidade_membros_inferiores?: string;
  deformidades_contraturas?: string;
  risco_lesao_pressao?: string;
  tipo_cadeira_indicada?: string;
  medidas?: Record<string, string>;
  adaptacoes_justificativa?: string;
  orientacoes_parecer?: string;
  observacoes_gerais?: string;
}

interface Props {
  value?: MedidasCadeiraRodasValue;
  onChange?: (value: MedidasCadeiraRodasValue) => void;
  disabled?: boolean;
  paciente?: any;
  unidade?: any;
  dataAtendimento?: string;
}

const TABELA_AM: Array<{ letra: string; label: string }> = [
  { letra: "A", label: "Largura dos Ombros" },
  { letra: "B", label: "Largura do Quadril" },
  { letra: "C", label: "Largura das Costas" },
  { letra: "D", label: "Do assento ao topo da cabeça" },
  { letra: "E", label: "Do assento à Nuca" },
  { letra: "F", label: "Do assento à borda inf. escápula" },
  { letra: "G", label: "Altura do assento ao ombro" },
  { letra: "H", label: "Altura assento axila esquerda" },
  { letra: "I", label: "Altura assento axila direita" },
  { letra: "J", label: "Altura do assento ao cotovelo" },
  { letra: "K", label: "Profundidade do assento" },
  { letra: "L", label: "Do pé à base do joelho" },
  { letra: "M", label: "Tamanho do pé" },
];

const MedidasCadeiraRodasForm: React.FC<Props> = ({
  value,
  onChange,
  disabled,
  dataAtendimento,
}) => {
  const controlled = typeof onChange === "function";
  const [local, setLocal] = useState<MedidasCadeiraRodasValue>(
    value ?? { data_avaliacao: dataAtendimento || "", medidas: {} }
  );
  const data = controlled
    ? (value ?? { data_avaliacao: dataAtendimento || "", medidas: {} })
    : local;

  // Keep local in sync if controlled value object changes from outside.
  const lastExternal = useRef(value);
  useEffect(() => {
    if (controlled && value !== lastExternal.current) {
      lastExternal.current = value;
    }
  }, [value, controlled]);

  const updateField = <K extends keyof MedidasCadeiraRodasValue>(key: K, value: MedidasCadeiraRodasValue[K]) => {
    const next = { ...data, [key]: value };
    if (controlled) onChange!(next);
    else setLocal(next);
  };

  const update = (patch: Partial<MedidasCadeiraRodasValue>) => {
    const next = { ...data, ...patch };
    if (controlled) onChange!(next);
    else setLocal(next);
  };

  const updateMedida = (letra: string, v: string) => {
    const next = {
      ...data,
      medidas: { ...(data.medidas || {}), [letra]: v },
    };
    if (controlled) onChange!(next);
    else setLocal(next);
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 pt-2">
        <div className="h-px flex-1 bg-border" />
        <span className="text-xs font-semibold text-primary uppercase tracking-wide">
          Prescrição e Medidas
        </span>
        <div className="h-px flex-1 bg-border" />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <div className="space-y-1">
          <Label>Data da avaliação</Label>
          <Input
            type="date"
            value={data.data_avaliacao || ""}
            onChange={(e) => updateField("data_avaliacao", e.target.value)}
            disabled={disabled}
          />
        </div>
        <div className="space-y-1">
          <Label>Equipamento solicitado</Label>
          <Input
            value={data.equipamento_solicitado || ""}
            onChange={(e) => updateField("equipamento_solicitado", e.target.value)}
            placeholder="Ex.: Cadeira de rodas adulto, almofada antiescaras..."
            disabled={disabled}
          />
        </div>
        <div className="space-y-1">
          <Label>Diagnóstico / Condição funcional</Label>
          <Textarea
            rows={3}
            value={data.diagnostico_condicao_funcional || ""}
            onChange={(e) => updateField("diagnostico_condicao_funcional", e.target.value)}
            disabled={disabled}
          />
        </div>
        <div className="space-y-1">
          <Label>Motivo da solicitação</Label>
          <Textarea
            rows={3}
            value={data.motivo_solicitacao || ""}
            onChange={(e) => updateField("motivo_solicitacao", e.target.value)}
            disabled={disabled}
          />
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
        {[
          { key: "controle_cervical", label: "Controle cervical" },
          { key: "controle_tronco", label: "Controle de tronco" },
          { key: "equilibrio_sentado", label: "Equilíbrio sentado" },
          { key: "risco_lesao_pressao", label: "Risco de lesão por pressão" },
        ].map((f) => (
          <div key={f.key} className="space-y-1">
            <Label>{f.label}</Label>
            <Input
              value={(data as any)[f.key] || ""}
              onChange={(e) => update({ [f.key]: e.target.value } as any)}
              disabled={disabled}
            />
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {[
          { key: "mobilidade_membros_superiores", label: "Mobilidade membros superiores" },
          { key: "mobilidade_membros_inferiores", label: "Mobilidade membros inferiores" },
          { key: "deformidades_contraturas", label: "Deformidades / Contraturas" },
          { key: "tipo_cadeira_indicada", label: "Tipo de cadeira indicada" },
        ].map((f) => (
          <div key={f.key} className="space-y-1">
            <Label>{f.label}</Label>
            <Input
              value={(data as any)[f.key] || ""}
              onChange={(e) => update({ [f.key]: e.target.value } as any)}
              disabled={disabled}
            />
          </div>
        ))}
      </div>

      <Card className="p-4 space-y-3">
        <div className="text-center text-xs font-semibold text-primary uppercase tracking-wide">
          Diagrama de Medidas Anatômicas
        </div>
        <img
          src="/images/diagrama-cadeira-rodas.png"
          alt="Diagrama de medidas anatômicas para cadeira de rodas"
          className="mx-auto h-auto max-h-[360px] w-full max-w-[640px] object-contain"
        />

        <div className="text-xs font-semibold text-primary uppercase tracking-wide pt-2">
          Tabela de Medidas (cm)
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2">
          {TABELA_AM.map((m) => (
            <div
              key={m.letra}
              className="flex items-center gap-2 border border-border rounded-md px-2 py-1.5"
            >
              <span className="flex-shrink-0 w-6 h-6 rounded-full bg-primary text-primary-foreground text-xs font-bold flex items-center justify-center">
                {m.letra}
              </span>
              <Label className="flex-1 text-xs font-normal cursor-default">{m.label}</Label>
              <Input
                type="number"
                inputMode="decimal"
                step="0.1"
                className="w-20 h-8 text-right"
                value={(data.medidas || {})[m.letra] || ""}
                onChange={(e) => updateMedida(m.letra, e.target.value)}
                disabled={disabled}
              />
            </div>
          ))}
        </div>
      </Card>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <div className="space-y-1">
          <Label>Adaptações necessárias / Justificativa técnica</Label>
          <Textarea
            rows={4}
            value={data.adaptacoes_justificativa || ""}
            onChange={(e) => update({ adaptacoes_justificativa: e.target.value })}
            disabled={disabled}
          />
        </div>
        <div className="space-y-1">
          <Label>Orientações / Parecer do profissional</Label>
          <Textarea
            rows={4}
            value={data.orientacoes_parecer || ""}
            onChange={(e) => update({ orientacoes_parecer: e.target.value })}
            disabled={disabled}
          />
        </div>
      </div>

      <div className="space-y-1">
        <Label>Observações gerais</Label>
        <Textarea
          rows={3}
          value={data.observacoes_gerais || ""}
          onChange={(e) => update({ observacoes_gerais: e.target.value })}
          disabled={disabled}
        />
      </div>
    </div>
  );
};

export default MedidasCadeiraRodasForm;
