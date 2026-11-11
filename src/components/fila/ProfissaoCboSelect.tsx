import React, { useMemo } from "react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

interface FuncionarioLike {
  id: string;
  nome: string;
  profissao?: string;
  customData?: Record<string, any> | null;
  custom_data?: Record<string, any> | null;
}

export interface ProfissaoCboOption {
  /** Valor salvo em fila_espera.especialidade_destino */
  value: string;
  /** Rótulo exibido: "Fisioterapeuta • CBO 223605" */
  label: string;
  cboCodigo?: string;
  total: number;
}

const norm = (s: string) =>
  (s || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();

/** Monta a lista de profissões (com CBO quando cadastrado) a partir dos profissionais visíveis. */
export function buildProfissaoOptions(profissionais: FuncionarioLike[]): ProfissaoCboOption[] {
  const map = new Map<string, { option: ProfissaoCboOption; cboCodes: Set<string>; missingCbo: boolean }>();
  for (const p of profissionais) {
    const profissao = (p.profissao || "").trim();
    if (!profissao) continue;
    const cd = (p.customData || (p as any).custom_data || {}) as Record<string, any>;
    const cbo = (cd.cbo_codigo || "").toString().trim().toUpperCase();
    const key = norm(profissao);
    const existing = map.get(key);
    if (existing) {
      existing.option.total += 1;
      if (cbo) existing.cboCodes.add(cbo);
      else existing.missingCbo = true;
    } else {
      map.set(key, {
        option: { value: profissao, label: profissao, total: 1 },
        cboCodes: new Set(cbo ? [cbo] : []),
        missingCbo: !cbo,
      });
    }
  }

  return Array.from(map.values()).map(({ option, cboCodes, missingCbo }) => {
    if (cboCodes.size === 1 && !missingCbo) {
      option.cboCodigo = [...cboCodes][0];
      option.label = option.value + " • CBO " + option.cboCodigo;
    } else if (cboCodes.size > 1) {
      option.cboCodigo = undefined;
      option.label = option.value + " • CBO múltiplos";
    } else if (missingCbo && cboCodes.size === 1) {
      option.cboCodigo = undefined;
      option.label = option.value + " • CBO não confirmado";
    }
    return option;
  }).sort((a, b) => a.value.localeCompare(b.value, "pt-BR"));
}

/** Rótulo amigável para uma profissão de destino já salva. */
export function getProfissaoLabel(profissionais: FuncionarioLike[], profissao: string): string {
  if (!profissao) return "";
  const opt = buildProfissaoOptions(profissionais).find((o) => norm(o.value) === norm(profissao));
  return opt?.label || profissao;
}

interface Props {
  profissionais: FuncionarioLike[];
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  disabled?: boolean;
  onCboChange?: (code: string | null) => void;
}

const ProfissaoCboSelect: React.FC<Props> = ({
  profissionais,
  value,
  onChange,
  placeholder = "Selecione a profissão",
  disabled = false,
  onCboChange,
}) => {
  const options = useMemo(() => buildProfissaoOptions(profissionais), [profissionais]);

  return (
    <Select
      value={value || "none"}
      onValueChange={(v) => {
        const selected = v === "none" ? "" : v;
        onChange(selected);
        const option = options.find((item) => norm(item.value) === norm(selected));
        onCboChange?.(option?.cboCodigo || null);
      }}
      disabled={disabled}
    >
      <SelectTrigger>
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="none">Qualquer profissão</SelectItem>
        {options.map((o) => (
          <SelectItem key={o.value} value={o.value}>
            {o.label}
            {o.total > 1 ? ` (${o.total} profissionais)` : ""}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
};

export default ProfissaoCboSelect;
