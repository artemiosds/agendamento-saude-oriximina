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
  const map = new Map<string, ProfissaoCboOption>();
  for (const p of profissionais) {
    const profissao = (p.profissao || "").trim();
    if (!profissao) continue;
    const cd = (p.customData || (p as any).custom_data || {}) as Record<string, any>;
    const cbo = (cd.cbo_codigo || "").toString().trim();
    const key = norm(profissao);
    const existing = map.get(key);
    if (existing) {
      existing.total += 1;
      if (!existing.cboCodigo && cbo) {
        existing.cboCodigo = cbo;
        existing.label = `${existing.value} • CBO ${cbo}`;
      }
    } else {
      map.set(key, {
        value: profissao,
        label: cbo ? `${profissao} • CBO ${cbo}` : profissao,
        cboCodigo: cbo || undefined,
        total: 1,
      });
    }
  }
  return Array.from(map.values()).sort((a, b) => a.value.localeCompare(b.value, "pt-BR"));
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
}

const ProfissaoCboSelect: React.FC<Props> = ({
  profissionais,
  value,
  onChange,
  placeholder = "Selecione a profissão",
  disabled = false,
}) => {
  const options = useMemo(() => buildProfissaoOptions(profissionais), [profissionais]);

  return (
    <Select value={value || "none"} onValueChange={(v) => onChange(v === "none" ? "" : v)} disabled={disabled}>
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
