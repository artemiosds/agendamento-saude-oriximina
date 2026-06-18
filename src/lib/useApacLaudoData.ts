// Hook que retorna os dados do Laudo APAC e tenta resolver o código IBGE
// automaticamente via API oficial do IBGE quando não houver código salvo.

import { useEffect, useRef, useState } from "react";
import { normalizePaciente, type AnyPaciente, type ApacLaudoData } from "./apacLaudoData";
import { lookupIbgeCode } from "./ibgeLookup";

export interface ApacResolved {
  data: ApacLaudoData;
  ibgeLoading: boolean;
}

export function useApacLaudoData(paciente: AnyPaciente | null): ApacResolved {
  const base = normalizePaciente(paciente);
  const [ibge, setIbge] = useState<string>(base.ibge);
  const [loading, setLoading] = useState<boolean>(false);
  const key = `${base.uf}|${base.municipio}|${base.ibge}`;
  const lastKey = useRef<string>("");

  useEffect(() => {
    if (lastKey.current === key) return;
    lastKey.current = key;

    if (base.ibge) {
      setIbge(base.ibge);
      setLoading(false);
      return;
    }
    if (!base.municipio || !base.uf) {
      setIbge("");
      setLoading(false);
      return;
    }
    setIbge("");
    setLoading(true);
    let cancelled = false;
    lookupIbgeCode(base.municipio, base.uf)
      .then((code) => {
        if (cancelled) return;
        setIbge(code);
      })
      .catch(() => {
        if (cancelled) return;
        setIbge("");
      })
      .finally(() => {
        if (cancelled) return;
        setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [key, base.ibge, base.municipio, base.uf]);

  return {
    data: { ...base, ibge },
    ibgeLoading: loading,
  };
}
