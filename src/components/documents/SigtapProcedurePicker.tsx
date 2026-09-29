import React, { useEffect, useMemo, useState } from "react";
import { Search, Loader2, CheckCircle2, AlertTriangle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  validarCompatibilidadeClinicaSigtap,
  type SigtapClinicalValidationResult,
} from "@/lib/sigtapClinicalValidation";

export interface SigtapPickerValue {
  codigo: string;
  nome: string;
}

interface Props {
  value?: SigtapPickerValue | null;
  onChange: (value: SigtapPickerValue | null) => void;
  placeholder?: string;
  disabled?: boolean;
  validation?: {
    competencia: string;
    cbo: string;
    dataNascimento?: string;
    dataAtendimento?: string;
    sexo?: string;
  };
}

const SigtapProcedurePicker: React.FC<Props> = ({
  value,
  onChange,
  placeholder = "Buscar procedimento SIGTAP por código ou nome...",
  disabled,
  validation,
}) => {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SigtapPickerValue[]>([]);
  const [loading, setLoading] = useState(false);
  const [validationResult, setValidationResult] = useState<SigtapClinicalValidationResult | null>(null);

  useEffect(() => {
    const q = query.trim();
    if (q.length < 2) {
      setResults([]);
      return;
    }
    const timer = window.setTimeout(async () => {
      setLoading(true);
      try {
        const numeric = /^\d+$/.test(q);
        let request = supabase
          .from("sigtap_procedimentos")
          .select("codigo,nome")
          .eq("ativo", true)
          .limit(20);
        request = numeric
          ? request.ilike("codigo", `%${q.replace(/[%_]/g, "")}%`)
          : request.ilike("nome", `%${q.replace(/[%_]/g, " ")}%`);
        const { data, error } = await request;
        if (error) throw error;
        setResults((data || []).map((item: any) => ({ codigo: item.codigo, nome: item.nome })));
      } catch (error) {
        console.error("[SigtapProcedurePicker] busca:", error);
        setResults([]);
      } finally {
        setLoading(false);
      }
    }, 250);
    return () => window.clearTimeout(timer);
  }, [query]);

  useEffect(() => {
    let cancelled = false;
    if (!value?.codigo || !validation?.competencia) {
      setValidationResult(null);
      return;
    }
    void validarCompatibilidadeClinicaSigtap({
      procedimento: value.codigo,
      competencia: validation.competencia,
      cbo: validation.cbo,
      dataNascimento: validation.dataNascimento,
      dataAtendimento: validation.dataAtendimento,
      sexo: validation.sexo,
    }).then((result) => {
      if (!cancelled) setValidationResult(result);
    });
    return () => { cancelled = true; };
  }, [
    value?.codigo,
    validation?.competencia,
    validation?.cbo,
    validation?.dataNascimento,
    validation?.dataAtendimento,
    validation?.sexo,
  ]);

  const status = useMemo(() => {
    if (!validationResult) return null;
    if (validationResult.status === "compatível") {
      return <Badge className="bg-emerald-600 hover:bg-emerald-600"><CheckCircle2 className="w-3 h-3 mr-1" />SIGTAP compatível</Badge>;
    }
    if (validationResult.status === "incompatível") {
      return <Badge variant="destructive"><AlertTriangle className="w-3 h-3 mr-1" />SIGTAP incompatível</Badge>;
    }
    return <Badge variant="outline" className="text-amber-700 border-amber-300">Validação pendente</Badge>;
  }, [validationResult]);

  return (
    <div className="space-y-2">
      {value?.codigo ? (
        <div className="rounded-md border p-2.5 bg-background">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <div className="text-xs font-mono text-muted-foreground">{value.codigo}</div>
              <div className="text-sm font-medium">{value.nome}</div>
            </div>
            {!disabled && (
              <Button type="button" variant="outline" size="sm" onClick={() => onChange(null)}>Trocar</Button>
            )}
          </div>
          {status && <div className="mt-2">{status}</div>}
          {validationResult?.status === "incompatível" && validationResult.motivos.length > 0 && (
            <div className="mt-2 text-xs text-destructive space-y-1">
              {validationResult.motivos.map((motivo, index) => <p key={index}>• {motivo}</p>)}
            </div>
          )}
          {validationResult?.status === "indeterminado" && validationResult.avisos.length > 0 && (
            <div className="mt-2 text-xs text-amber-700 space-y-1">
              {validationResult.avisos.map((aviso, index) => <p key={index}>• {aviso}</p>)}
            </div>
          )}
        </div>
      ) : (
        <>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={placeholder}
              disabled={disabled}
              className="pl-9"
            />
            {loading && <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 animate-spin text-muted-foreground" />}
          </div>
          {results.length > 0 && (
            <div className="border rounded-md max-h-56 overflow-y-auto bg-background shadow-sm">
              {results.map((item) => (
                <button
                  type="button"
                  key={item.codigo}
                  onClick={() => { onChange(item); setQuery(""); setResults([]); }}
                  className="w-full text-left px-3 py-2 border-b last:border-b-0 hover:bg-muted/50"
                >
                  <span className="font-mono text-xs text-muted-foreground mr-2">{item.codigo}</span>
                  <span className="text-sm">{item.nome}</span>
                </button>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
};

export default SigtapProcedurePicker;
