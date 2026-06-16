import React, { useState, useEffect, useRef } from "react";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Home, Printer } from "lucide-react";
import MedidasCadeiraRodasForm, {
  MedidasCadeiraRodasValue,
} from "./MedidasCadeiraRodasForm";
import { imprimirVisitaDomiciliar } from "@/lib/visitaDomiciliarPdf";

export type FinalidadeVisita = "geral" | "medidas_cadeira_rodas";

export interface VisitaDomiciliarValue {
  evolucao_visita?: string;
  conduta_orientacoes?: string;
  observacoes?: string;
  finalidade_atendimento?: FinalidadeVisita;
  medidas_cadeira_rodas?: MedidasCadeiraRodasValue;
}

const MEDIDAS_LETRAS = ["A","B","C","D","E","F","G","H","I","J","K","L","M"] as const;

export const createEmptyMedidasCadeiraRodas = (
  dataAtendimento?: string
): MedidasCadeiraRodasValue => ({
  data_avaliacao: dataAtendimento || "",
  equipamento_solicitado: "",
  diagnostico_condicao_funcional: "",
  motivo_solicitacao: "",
  controle_cervical: "",
  controle_tronco: "",
  equilibrio_sentado: "",
  mobilidade_membros_superiores: "",
  mobilidade_membros_inferiores: "",
  deformidades_contraturas: "",
  risco_lesao_pressao: "",
  tipo_cadeira_indicada: "",
  medidas: MEDIDAS_LETRAS.reduce((acc, l) => ({ ...acc, [l]: "" }), {} as Record<string, string>),
  adaptacoes_justificativa: "",
  orientacoes_parecer: "",
  observacoes_gerais: "",
});

interface Props {
  value?: VisitaDomiciliarValue;
  onChange?: (value: VisitaDomiciliarValue) => void;
  disabled?: boolean;
  paciente?: any;
  profissional?: any;
  unidade?: any;
  dataAtendimento?: string;
}

const VisitaDomiciliarProntuario: React.FC<Props> = ({
  value,
  onChange,
  disabled,
  paciente,
  profissional,
  unidade,
  dataAtendimento,
}) => {
  const controlled = value !== undefined && typeof onChange === "function";
  const [local, setLocal] = useState<VisitaDomiciliarValue>(
    value ?? { finalidade_atendimento: "geral" }
  );
  const data = controlled ? (value as VisitaDomiciliarValue) : local;

  const lastExternal = useRef(value);
  useEffect(() => {
    if (controlled && value !== lastExternal.current) {
      lastExternal.current = value;
    }
  }, [value, controlled]);

  // Ref sincrônica do snapshot atual para suportar updates consecutivos
  // (ex.: A-M digitados em sequência) sem perder o anterior.
  const dataRef = useRef(data);
  useEffect(() => {
    dataRef.current = data;
  });

  const update = (patch: Partial<VisitaDomiciliarValue>) => {
    const next = { ...dataRef.current, ...patch };
    dataRef.current = next;
    if (controlled) onChange!(next);
    else setLocal(next);
  };

  const finalidade: FinalidadeVisita = data.finalidade_atendimento || "geral";

  // Seed skeleton se finalidade já é medidas_cadeira_rodas mas o objeto ainda não existe
  useEffect(() => {
    if (
      finalidade === "medidas_cadeira_rodas" &&
      !data.medidas_cadeira_rodas
    ) {
      update({
        medidas_cadeira_rodas: createEmptyMedidasCadeiraRodas(dataAtendimento),
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [finalidade, data.medidas_cadeira_rodas]);

  return (
    <Card className="p-4 space-y-4 border-teal-500/30 bg-teal-500/5">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <div className="w-10 h-10 rounded-lg bg-teal-500/20 text-teal-600 dark:text-teal-400 flex items-center justify-center">
            <Home className="w-5 h-5" />
          </div>
          <div>
            <h4 className="text-sm font-semibold text-foreground">Visita Domiciliar</h4>
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground">
              Fluxo isolado e seguro
            </p>
          </div>
        </div>
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={() =>
            imprimirVisitaDomiciliar({
              paciente,
              profissional,
              unidade,
              dataAtendimento,
              data,
              impressoPor: profissional,
            })
          }
          disabled={disabled}
        >
          <Printer className="w-4 h-4 mr-1" />
          Imprimir Visita Domiciliar
        </Button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <div className="space-y-1">
          <Label>Evolução da Visita</Label>
          <Textarea
            rows={4}
            placeholder="Descreva detalhadamente o que foi observado e realizado durante a visita..."
            value={data.evolucao_visita || ""}
            onChange={(e) => update({ evolucao_visita: e.target.value })}
            disabled={disabled}
          />
        </div>
        <div className="space-y-1">
          <Label>Conduta / Orientações</Label>
          <Textarea
            rows={4}
            placeholder="Orientações fornecidas ao paciente e cuidadores, planos para próximas etapas..."
            value={data.conduta_orientacoes || ""}
            onChange={(e) => update({ conduta_orientacoes: e.target.value })}
            disabled={disabled}
          />
        </div>
      </div>

      <div className="space-y-1">
        <Label>Observações</Label>
        <Textarea
          rows={3}
          placeholder="Notas internas, intercorrências, riscos ambientais ou outras informações relevantes..."
          value={data.observacoes || ""}
          onChange={(e) => update({ observacoes: e.target.value })}
          disabled={disabled}
        />
      </div>

      <Card className="p-3 bg-background/60">
        <Label className="text-xs uppercase tracking-wide text-muted-foreground">
          Finalidade do Atendimento na Visita
        </Label>
        <RadioGroup
          className="grid grid-cols-1 md:grid-cols-2 gap-2 mt-2"
          value={finalidade}
          onValueChange={(v) => {
            const next = v as FinalidadeVisita;
            if (next === "medidas_cadeira_rodas") {
              update({
                finalidade_atendimento: next,
                medidas_cadeira_rodas:
                  data.medidas_cadeira_rodas ||
                  createEmptyMedidasCadeiraRodas(dataAtendimento),
              });
            } else {
              update({ finalidade_atendimento: next });
            }
          }}
          disabled={disabled}
        >
          <label
            htmlFor="finalidade-geral"
            className="flex items-center gap-2 border border-border rounded-md px-3 py-2 cursor-pointer hover:bg-accent/30 transition"
          >
            <RadioGroupItem value="geral" id="finalidade-geral" />
            <span className="text-sm">Atendimento domiciliar geral</span>
          </label>
          <label
            htmlFor="finalidade-cadeira"
            className="flex items-center gap-2 border border-border rounded-md px-3 py-2 cursor-pointer hover:bg-accent/30 transition"
          >
            <RadioGroupItem value="medidas_cadeira_rodas" id="finalidade-cadeira" />
            <span className="text-sm">Medidas para cadeira de rodas</span>
          </label>
        </RadioGroup>
      </Card>

      {finalidade === "medidas_cadeira_rodas" && (
        <MedidasCadeiraRodasForm
          value={data.medidas_cadeira_rodas}
          onChange={(v) => update({ medidas_cadeira_rodas: v })}
          disabled={disabled}
          paciente={paciente}
          unidade={unidade}
          dataAtendimento={dataAtendimento}
        />
      )}
    </Card>
  );
};

export default VisitaDomiciliarProntuario;
