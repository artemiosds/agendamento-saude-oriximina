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
  /** Chave única para distinguir a mesma profissão com CBOs diferentes. */
  key: string;
  /** Profissão gravada em fila_espera.especialidade_destino. */
  value: string;
  /** Rótulo exibido no seletor. */
  label: string;
  cboCodigo?: string;
  total: number;
}

const norm = (s: string) =>
  (s || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();

const optionKey = (profissao: string, cbo?: string | null) =>
  JSON.stringify([norm(profissao), (cbo || "").trim().toUpperCase()]);

/** Cria uma opção para cada combinação explícita de profissão e CBO. */
export function buildProfissaoOptions(profissionais: FuncionarioLike[]): ProfissaoCboOption[] {
  const map = new Map<string, ProfissaoCboOption>();
  for (const p of profissionais) {
    const profissao = (p.profissao || "").trim();
    if (!profissao) continue;
    const cd = (p.customData || p.custom_data || {}) as Record<string, any>;
    const cbo = (cd.cbo_codigo || "").toString().trim().toUpperCase();
    const key = optionKey(profissao, cbo);
    const existing = map.get(key);
    if (existing) {
      existing.total += 1;
      continue;
    }
    map.set(key, {
      key,
      value: profissao,
      label: cbo ? profissao + " • CBO " + cbo : profissao + " • CBO não informado",
      cboCodigo: cbo || undefined,
      total: 1,
    });
  }

  return Array.from(map.values()).sort((a, b) =>
    a.value.localeCompare(b.value, "pt-BR") ||
    (a.cboCodigo || "").localeCompare(b.cboCodigo || "", "pt-BR"),
  );
}

/** Rótulo amigável sem escolher arbitrariamente um CBO quando há vários. */
export function getProfissaoLabel(profissionais: FuncionarioLike[], profissao: string): string {
  if (!profissao) return "";
  const matches = buildProfissaoOptions(profissionais).filter((option) => norm(option.value) === norm(profissao));
  if (matches.length === 0) return profissao;
  if (matches.length === 1) return matches[0].label;
  return matches[0].value + " • CBO múltiplos";
}

interface Props {
  profissionais: FuncionarioLike[];
  value: string;
  cboValue?: string | null;
  onChange: (value: string) => void;
  placeholder?: string;
  disabled?: boolean;
  onCboChange?: (code: string | null) => void;
}

const ProfissaoCboSelect: React.FC<Props> = ({
  profissionais,
  value,
  cboValue,
  onChange,
  placeholder = "Selecione a profissão",
  disabled = false,
  onCboChange,
}) => {
  const options = useMemo(() => buildProfissaoOptions(profissionais), [profissionais]);
  const selectedKey = value ? optionKey(value, cboValue) : "none";
  const selectionOptions = useMemo(() => {
    if (!value || options.some((option) => option.key === selectedKey)) return options;
    const selectedCbo = (cboValue || "").trim().toUpperCase();
    return [...options, {
      key: selectedKey,
      value,
      label: value + (selectedCbo ? " • CBO " + selectedCbo : " • CBO não cadastrado"),
      cboCodigo: selectedCbo || undefined,
      total: 0,
    }];
  }, [options, value, cboValue, selectedKey]);

  return (
    <Select
      value={selectedKey}
      onValueChange={(key) => {
        if (key === "none") {
          onChange("");
          onCboChange?.(null);
          return;
        }
        const selected = selectionOptions.find((option) => option.key === key);
        if (!selected) return;
        onChange(selected.value);
        onCboChange?.(selected.cboCodigo || null);
      }}
      disabled={disabled}
    >
      <SelectTrigger>
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="none">Qualquer profissão</SelectItem>
        {selectionOptions.map((option) => (
          <SelectItem key={option.key} value={option.key}>
            {option.label}
            {option.total > 1 ? " (" + option.total + " profissionais)" : option.total === 0 ? " (CBO anterior)" : ""}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
};

export default ProfissaoCboSelect;