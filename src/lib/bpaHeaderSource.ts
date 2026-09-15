import { supabase } from "@/integrations/supabase/client";

/**
 * Fonte institucional do documento de origem do Header BPA-I.
 *
 * O BPA historicamente tenta ler o documento da unidade nesta ordem:
 * custom_data.cnpj, unidade.cnpj e custom_data.cpf. Além disso, o sistema já
 * possui uma configuração institucional própria em
 * system_config.default.config_sistema.instituicao.cnpj. Essa configuração é a
 * fonte institucional correta quando a unidade usada pelo Header não traz CNPJ.
 *
 * Nada é inventado e nada é persistido por este módulo.
 */

const onlyDigits = (value: unknown): string => String(value ?? "").replace(/\D/g, "");

function normalizeDocumentoLegado(value: unknown): string {
  const digits = onlyDigits(value);
  return digits.length === 11 || digits.length === 14 ? digits : "";
}

function normalizeCnpj(value: unknown): string {
  const digits = onlyDigits(value);
  return digits.length === 14 ? digits : "";
}

function maskDocumento(value: unknown): string {
  const digits = onlyDigits(value);
  if (!digits) return "(vazio)";
  if (digits.length <= 4) return `***${digits}`;
  return `${"*".repeat(Math.max(0, digits.length - 4))}${digits.slice(-4)}`;
}

/** Mantido para diagnóstico/regressão do mapeamento que existia no BPA. */
export function documentoOrigemDaUnidade(unidade: any): string {
  const cd = (unidade?.custom_data as any) || {};
  return (
    normalizeDocumentoLegado(cd.cnpj) ||
    normalizeDocumentoLegado(unidade?.cnpj) ||
    normalizeDocumentoLegado(cd.cpf) ||
    ""
  );
}

function cnpjOrigemDaUnidade(unidade: any): string {
  const cd = (unidade?.custom_data as any) || {};
  return normalizeCnpj(cd.cnpj) || normalizeCnpj(unidade?.cnpj) || "";
}

export function documentoOrigemInstitucionalDaConfig(configuracoes: any): string {
  return normalizeCnpj(configuracoes?.config_sistema?.instituicao?.cnpj);
}

let documentoInstitucional = "";
let documentoInstitucionalFonte = "nenhuma";
let carregamentoConcluido = false;
let loadPromise: Promise<string> | null = null;

export function primeBpaDocumentoOrigemInstitucional(value: unknown): string {
  documentoInstitucional = normalizeCnpj(value);
  documentoInstitucionalFonte = documentoInstitucional ? "teste/manual" : "nenhuma";
  carregamentoConcluido = true;
  return documentoInstitucional;
}

export function getBpaDocumentoOrigemInstitucional(): string {
  return documentoInstitucional;
}

export function getBpaDocumentoOrigemFonte(): string {
  return documentoInstitucionalFonte;
}

export function isBpaDocumentoOrigemLoaded(): boolean {
  return carregamentoConcluido;
}

export function debugBpaDocumentoOrigem(opts: {
  valorOriginal: unknown;
  valorEnviado: unknown;
  fonteDireta?: string;
}): void {
  if (!import.meta.env.DEV) return;
  const originalDigits = onlyDigits(opts.valorOriginal);
  const enviadoDigits = onlyDigits(opts.valorEnviado);
  console.debug("[BPA-Exportar][Header][documentoOrigem]", {
    fonteDireta: opts.fonteDireta || "unidade selecionada",
    valorOriginal: maskDocumento(opts.valorOriginal),
    tamanhoOriginal: originalDigits.length,
    fonteFallback: documentoInstitucionalFonte,
    valorFallback: maskDocumento(documentoInstitucional),
    valorEnviado: maskDocumento(opts.valorEnviado),
    tamanhoNormalizado: enviadoDigits.length,
    motivoVazio: enviadoDigits
      ? null
      : originalDigits
        ? `Documento recebido possui ${originalDigits.length} dígitos; o Header institucional exige CNPJ de 14 dígitos`
        : "Unidade do Header sem CNPJ e configuração institucional sem CNPJ válido",
  });
}

export async function loadBpaDocumentoOrigemInstitucional(): Promise<string> {
  if (carregamentoConcluido) return documentoInstitucional;
  if (loadPromise) return loadPromise;

  loadPromise = (async () => {
    try {
      // Fonte institucional explícita já existente em Configurações > Sistema.
      const { data: cfgRow, error: cfgError } = await (supabase as any)
        .from("system_config")
        .select("configuracoes")
        .eq("id", "default")
        .maybeSingle();

      if (!cfgError) {
        const cnpjConfigurado = documentoOrigemInstitucionalDaConfig(cfgRow?.configuracoes);
        if (cnpjConfigurado) {
          documentoInstitucional = cnpjConfigurado;
          documentoInstitucionalFonte = "system_config.default.config_sistema.instituicao.cnpj";
          return documentoInstitucional;
        }
      } else if (import.meta.env.DEV) {
        console.debug("[BPA-Exportar][Header] configuração institucional indisponível; tentando CNPJ das unidades.", cfgError);
      }

      // Fallback apenas para CNPJ real das unidades. CPF não é usado para
      // satisfazer o campo institucional do Header.
      const { data, error } = await (supabase as any)
        .from("unidades")
        .select("*")
        .eq("ativo", true);
      if (error) throw error;

      const documentos = Array.from(
        new Set(
          ((data || []) as any[])
            .map(cnpjOrigemDaUnidade)
            .filter(Boolean),
        ),
      );

      documentoInstitucional = documentos.length === 1 ? documentos[0] : "";
      documentoInstitucionalFonte = documentoInstitucional
        ? "unidades: CNPJ institucional único"
        : documentos.length > 1
          ? "unidades: múltiplos CNPJs, sem escolha automática"
          : "nenhuma";
      return documentoInstitucional;
    } catch (error) {
      console.warn(
        "[BPA-Exportar] não foi possível resolver o CNPJ institucional do Header.",
        error,
      );
      documentoInstitucional = "";
      documentoInstitucionalFonte = "erro ao carregar fonte institucional";
      return "";
    } finally {
      carregamentoConcluido = true;
      loadPromise = null;
    }
  })();

  return loadPromise;
}
