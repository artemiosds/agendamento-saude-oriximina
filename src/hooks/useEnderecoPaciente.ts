import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { buscarEnderecoCep, cepDigits, sanitizeUpper, type EnderecoPaciente } from "@/lib/enderecoPaciente";
import { getMunicipioEndereco } from "@/lib/municipiosIbge";

// Só consulta após interação com CEP, nunca ao montar um paciente em edição.
export function useEnderecoPaciente(
  value: EnderecoPaciente,
  onChange: (patch: Partial<EnderecoPaciente>) => void,
  scopeKey = "",
) {
  const latest = useRef(value);
  const callback = useRef(onChange);
  latest.current = value;
  callback.current = onChange;
  const [loading, setLoading] = useState(false);
  const controller = useRef<AbortController>();
  const timer = useRef<ReturnType<typeof setTimeout>>();
  const sequence = useRef(0);
  const lastCep = useRef("");
  const automatic = useRef<Partial<EnderecoPaciente>>({});

  const cancel = () => {
    sequence.current++;
    clearTimeout(timer.current);
    controller.current?.abort();
    setLoading(false);
  };
  useEffect(() => {
    lastCep.current = "";
    automatic.current = {};
    setLoading(false);
    return () => {
      // Contador de requisições (não é uma ref de nó DOM): invalida o valor atual.
      // eslint-disable-next-line react-hooks/exhaustive-deps
      sequence.current++;
      clearTimeout(timer.current);
      controller.current?.abort();
    };
  }, [scopeKey]);

  const commit = (patch: Partial<EnderecoPaciente>) => {
    latest.current = { ...latest.current, ...patch };
    callback.current(patch);
  };
  const lookupCep = async () => {
    clearTimeout(timer.current);
    const cep = cepDigits(latest.current.cep);
    if (cep.length !== 8 || lastCep.current === cep) return;
    cancel();
    const request = sequence.current;
    lastCep.current = cep;
    controller.current = new AbortController();
    setLoading(true);
    try {
      const data = await buscarEnderecoCep(cep, controller.current.signal);
      if (sequence.current !== request || cepDigits(latest.current.cep) !== cep) return;
      const patch: Partial<EnderecoPaciente> = {
        municipio: data.municipio, uf: data.uf, ibge_municipio: data.ibge_municipio,
      };
      for (const field of ["logradouro", "bairro"] as const) {
        if (data[field] && (!latest.current[field]?.trim() || latest.current[field] === automatic.current[field])) {
          patch[field] = data[field];
          automatic.current[field] = data[field];
        }
      }
      commit(patch);
    } catch {
      if (sequence.current === request) {
        lastCep.current = "";
        toast.warning("Não foi possível consultar o CEP. Confira ou preencha o endereço manualmente.");
      }
    } finally {
      if (sequence.current === request) setLoading(false);
    }
  };

  return {
    loading,
    lookupCep,
    changeCep: (cep: string) => {
      if (cepDigits(cep) === cepDigits(latest.current.cep)) return;
      cancel();
      lastCep.current = "";
      commit({ cep });
      if (cepDigits(cep).length === 8) timer.current = setTimeout(() => void lookupCep(), 350);
    },
    changeField: (field: "logradouro" | "bairro", text: string) => {
      delete automatic.current[field];
      commit({ [field]: text });
    },
    selectMunicipio: (municipio: string, uf?: string) => {
      cancel();
      lastCep.current = "";
      const info = getMunicipioEndereco(municipio, uf) || getMunicipioEndereco(municipio);
      const patch: Partial<EnderecoPaciente> = {
        municipio: sanitizeUpper(info?.nome || municipio), uf: info?.uf || uf || latest.current.uf,
        ibge_municipio: info?.ibge || "",
      };
      const mudouMunicipio = sanitizeUpper(latest.current.municipio).trim() !== patch.municipio
        || sanitizeUpper(latest.current.uf).trim() !== sanitizeUpper(patch.uf).trim();
      if (mudouMunicipio) {
        // A troca explícita do município invalida o CEP do endereço anterior.
        // Não usa prefixos/faixas postais como se fossem CEPs válidos.
        patch.cep = info?.cep || "";
        if (!info?.cep) toast.info("Município selecionado. Digite a rua para buscar o CEP ou informe-o manualmente.");
        for (const field of ["logradouro", "bairro"] as const) {
          if (automatic.current[field] && latest.current[field] === automatic.current[field]) patch[field] = "";
          delete automatic.current[field];
        }
      } else if (!latest.current.cep && info?.cep) {
        patch.cep = info.cep;
      }
      commit(patch);
    },
    selectUf: (uf: string) => {
      cancel();
      lastCep.current = "";
      const info = getMunicipioEndereco(latest.current.municipio, latest.current.uf);
      commit({
        uf,
        ...(uf !== latest.current.uf && (!info || info.uf !== uf)
          ? { municipio: "", ibge_municipio: "", cep: "" } : {}),
      });
    },
    selectEndereco: (address: EnderecoPaciente) => {
      const info = getMunicipioEndereco(latest.current.municipio, latest.current.uf);
      if (!info || address.ibge_municipio !== info.ibge || cepDigits(address.cep).length !== 8) return;
      cancel();
      lastCep.current = cepDigits(address.cep);
      const patch: Partial<EnderecoPaciente> = {
        cep: `${lastCep.current.slice(0, 5)}-${lastCep.current.slice(5)}`,
        municipio: sanitizeUpper(info.nome), uf: info.uf, ibge_municipio: info.ibge,
        logradouro: address.logradouro || latest.current.logradouro,
      };
      if (address.bairro && (!latest.current.bairro || latest.current.bairro === automatic.current.bairro)) {
        patch.bairro = address.bairro;
        automatic.current.bairro = address.bairro;
      }
      automatic.current.logradouro = patch.logradouro;
      commit(patch);
    },
  };
}
