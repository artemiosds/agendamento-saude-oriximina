import { supabase } from "@/integrations/supabase/client";

/**
 * Fonte institucional do documento de origem do Header BPA-I.
 *
 * O fluxo histórico do BPA-Exportar lê, nesta ordem, os mesmos campos da
 * unidade: custom_data.cnpj, unidade.cnpj e custom_data.cpf. Este módulo não
 * inventa documento e não persiste nada. Ele serve somente como fallback de
 * exportação quando a unidade escolhida para o header não possui o campo, mas
 * existe um único documento institucional real entre as unidades ativas.
 */

const onlyDigits = (value: unknown): string => String(value ?? "").replace(/\D/g, "");

function normalizeDocumento(value: unknown): string {
  const digits = onlyDigits(value);
  return digits.length === 11 || digits.length === 14 ? digits : "";
}

export function documentoOrigemDaUnidade(unidade: any): string {
  const cd = (unidade?.custom_data as any) || {};
  return (
    normalizeDocumento(cd.cnpj) ||
    normalizeDocumento(unidade?.cnpj) ||
    normalizeDocumento(cd.cpf) ||
    ""
  );
}

let documentoInstitucional = "";
let carregamentoConcluido = false;
let loadPromise: Promise<string> | null = null;

export function primeBpaDocumentoOrigemInstitucional(value: unknown): string {
  documentoInstitucional = normalizeDocumento(value);
  carregamentoConcluido = true;
  return documentoInstitucional;
}

export function getBpaDocumentoOrigemInstitucional(): string {
  return documentoInstitucional;
}

export function isBpaDocumentoOrigemLoaded(): boolean {
  return carregamentoConcluido;
}

export async function loadBpaDocumentoOrigemInstitucional(): Promise<string> {
  if (carregamentoConcluido) return documentoInstitucional;
  if (loadPromise) return loadPromise;

  loadPromise = (async () => {
    try {
      const { data, error } = await (supabase as any)
        .from("unidades")
        .select("*")
        .eq("ativo", true);
      if (error) throw error;

      const documentos = Array.from(
        new Set(
          ((data || []) as any[])
            .map(documentoOrigemDaUnidade)
            .filter(Boolean),
        ),
      );

      // Fallback somente quando há uma única identidade institucional possível.
      // Com documentos divergentes, não escolhemos arbitrariamente nenhum deles.
      documentoInstitucional = documentos.length === 1 ? documentos[0] : "";
      return documentoInstitucional;
    } catch (error) {
      console.warn(
        "[BPA-Exportar] não foi possível resolver o documento institucional das unidades ativas.",
        error,
      );
      documentoInstitucional = "";
      return "";
    } finally {
      carregamentoConcluido = true;
      loadPromise = null;
    }
  })();

  return loadPromise;
}
