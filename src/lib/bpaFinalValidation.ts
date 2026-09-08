/**
 * Validação final obrigatória do BPA-I (Registro 03).
 *
 * Regra principal do fluxo:
 *   - PERMISSIVO para encontrar/consolidar (prontuário, PTS, histórico, aditivos);
 *   - RIGOROSO para exportar: nenhum procedimento entra no TXT sem passar por
 *     esta validação.
 *
 * Encontrar no prontuário/PTS não torna o procedimento válido para o BPA-I.
 * A consolidação (dedupe) acontece ANTES; esta validação acontece DEPOIS da
 * consolidação e ANTES da geração do TXT.
 *
 * Nada aqui usa first()/find() para escolher "um" procedimento: a função é
 * aplicada item a item sobre a lista consolidada inteira.
 */

import { isValidCnsAlgo } from "./bpaNormalization";

const digits = (v: any) => String(v ?? "").replace(/\D/g, "");

export type BpaProcedimentoStatus =
  | "valido"
  | "incompativel"
  | "duplicado"
  | "ausente";

export interface SigtapRestricao {
  /** "M" | "F" — quando o procedimento é restrito a um sexo. */
  sexo?: string;
  idadeMin?: number;
  idadeMax?: number;
  /** true quando o SIGTAP exige CID na linha. */
  cidObrigatorio?: boolean;
  /** Instrumento de registro oficial: "BPA-I", "BPA-C", "APAC", "AIH"... */
  instrumento?: string;
}

export interface BpaValidacaoContexto {
  competencia: string;
  cbo: string;
  cnes: string;
  cnsProfissional: string;
  municipioPaciente: string;
  sexoPaciente: string;
  idadePaciente: number | null;
  /** Códigos ativos existentes em sigtap_procedimentos (quando carregado). */
  codigosConhecidos?: Set<string>;
  /** codigo SIGTAP → CIDs vinculados (sigtap_procedimento_cids). */
  cidsVinculados?: Map<string, Set<string>>;
  /** Restrições declaradas pelo Master (sexo/idade/CID/instrumento). */
  restricoes?: Record<string, SigtapRestricao>;
  /** CBO → códigos/prefixos liberados explicitamente pelo Master. */
  permitidosPorCbo?: Record<string, string[]>;
  /** CBO → códigos/prefixos bloqueados explicitamente pelo Master. */
  bloqueadosPorCbo?: Record<string, string[]>;
  /** Switch Master "disponibilizar todos os procedimentos". */
  liberarTodos?: boolean;
}

export interface BpaProcedimentoEntrada {
  codigo: string;
  cid?: string;
  origem?: string;
}

export interface BpaValidacaoResultado {
  codigo: string;
  cid: string;
  origem: string;
  status: BpaProcedimentoStatus;
  valido: boolean;
  /** Motivos que impedem a exportação (bloqueantes). */
  rejeicoes: string[];
  /** Observações que NÃO impedem a exportação. */
  avisos: string[];
}

/** CBOs que podem lançar múltiplos procedimentos no mesmo atendimento. */
export const CBOS_MULTIPROCEDIMENTO = new Set(["223810", "251510", "223710"]);

/** Nível médio/técnico: famílias CBO que começam com 3 ou 5. */
const cboEhNivelTecnico = (cbo: string) => /^[35]/.test(cbo);

/** Subgrupos que exigem profissional de nível superior. */
const SUBGRUPOS_NIVEL_SUPERIOR = ["030101", "030104", "030105", "030106"];

/** Grupos/subgrupos cujo instrumento de registro não é BPA (APAC/AIH). */
const GRUPOS_NAO_BPA = ["04", "05"];
const SUBGRUPOS_NAO_BPA = ["0304", "0305", "0306", "0505"];

const combina = (codigo: string, regra: string) => {
  const r = digits(regra);
  if (!r) return false;
  return codigo === r || codigo.startsWith(r);
};

export function validarProcedimentoBpaI(
  entrada: BpaProcedimentoEntrada,
  ctx: BpaValidacaoContexto,
): BpaValidacaoResultado {
  const codigo = digits(entrada.codigo);
  const cid = String(entrada.cid || "").trim().toUpperCase().replace(/\./g, "");
  const origem = entrada.origem || "—";
  const rejeicoes: string[] = [];
  const avisos: string[] = [];

  const cbo = digits(ctx.cbo);
  const competencia = digits(ctx.competencia);
  const cnes = digits(ctx.cnes);
  const cnsProf = digits(ctx.cnsProfissional);
  const municipio = digits(ctx.municipioPaciente);
  const sexo = String(ctx.sexoPaciente || "").trim().toUpperCase();
  const idade = ctx.idadePaciente;

  // 1) Código SIGTAP
  if (!codigo) {
    rejeicoes.push("Código SIGTAP ausente");
  } else if (codigo.length !== 10) {
    rejeicoes.push(`Código SIGTAP com ${codigo.length} dígitos (o BPA-I exige 10): ${codigo}`);
  } else if (/^0+$/.test(codigo)) {
    rejeicoes.push("Código SIGTAP zerado");
  } else if (ctx.codigosConhecidos && ctx.codigosConhecidos.size > 0 && !ctx.codigosConhecidos.has(codigo)) {
    rejeicoes.push(`Código ${codigo} não encontrado na tabela SIGTAP ativa do sistema`);
  }

  // 2) Competência AAAAMM
  if (competencia.length !== 6) {
    rejeicoes.push(`Competência inválida (${ctx.competencia || "vazia"}) — esperado AAAAMM`);
  } else {
    const ano = Number(competencia.slice(0, 4));
    const mes = Number(competencia.slice(4, 6));
    if (ano < 2000 || ano > 2100 || mes < 1 || mes > 12) {
      rejeicoes.push(`Competência fora do intervalo válido (${competencia})`);
    }
  }

  // 3) CBO do profissional
  if (cbo.length !== 6 || /^0+$/.test(cbo)) {
    rejeicoes.push(`CBO do profissional inválido ou ausente (${ctx.cbo || "vazio"})`);
  }

  // 4) CNES
  if (cnes.length !== 7 || /^0+$/.test(cnes)) {
    rejeicoes.push(`CNES inválido ou ausente (${ctx.cnes || "vazio"})`);
  }

  // 5) CNS do profissional
  if (!cnsProf) {
    rejeicoes.push("CNS do profissional ausente");
  } else if (!isValidCnsAlgo(cnsProf)) {
    rejeicoes.push(`CNS do profissional reprovado na validação oficial (${cnsProf})`);
  }

  // 6) Município de residência do paciente
  if (municipio.length !== 6 || /^0+$/.test(municipio)) {
    rejeicoes.push(`Município de residência (IBGE) inválido ou ausente (${ctx.municipioPaciente || "vazio"})`);
  }

  const restricao = (ctx.restricoes || {})[codigo];

  // 7) Sexo, quando houver restrição
  if (restricao?.sexo) {
    const exigido = restricao.sexo.trim().toUpperCase().slice(0, 1);
    if (!sexo) {
      rejeicoes.push(`Procedimento ${codigo} restrito ao sexo ${exigido} e o paciente está sem sexo definido`);
    } else if (sexo !== exigido) {
      rejeicoes.push(`Procedimento ${codigo} restrito ao sexo ${exigido} (paciente ${sexo})`);
    }
  }

  // 8) Idade / faixa etária, quando houver restrição
  if (restricao && (restricao.idadeMin != null || restricao.idadeMax != null)) {
    if (idade == null || Number.isNaN(idade)) {
      rejeicoes.push(`Procedimento ${codigo} tem restrição de faixa etária e a idade do paciente não foi apurada`);
    } else {
      if (restricao.idadeMin != null && idade < restricao.idadeMin) {
        rejeicoes.push(`Procedimento ${codigo} exige idade mínima ${restricao.idadeMin} (paciente ${idade})`);
      }
      if (restricao.idadeMax != null && idade > restricao.idadeMax) {
        rejeicoes.push(`Procedimento ${codigo} exige idade máxima ${restricao.idadeMax} (paciente ${idade})`);
      }
    }
  }

  // 9) Instrumento de registro
  if (restricao?.instrumento) {
    const inst = restricao.instrumento.toUpperCase().replace(/[\s-]/g, "");
    if (!inst.includes("BPAI") && !inst.includes("BPAINDIVIDUALIZADO")) {
      rejeicoes.push(`Instrumento de registro do procedimento ${codigo} é ${restricao.instrumento} — não é BPA-I`);
    }
  } else if (codigo.length === 10) {
    const grupo = codigo.slice(0, 2);
    const subgrupo = codigo.slice(0, 4);
    if (GRUPOS_NAO_BPA.includes(grupo) || SUBGRUPOS_NAO_BPA.includes(subgrupo)) {
      rejeicoes.push(`Procedimento ${codigo} pertence ao grupo ${grupo} — instrumento de registro incompatível com BPA-I`);
    }
  }

  // 10) Compatibilidade CBO × SIGTAP
  const bloqueados = (ctx.bloqueadosPorCbo || {})[cbo] || [];
  const permitidos = (ctx.permitidosPorCbo || {})[cbo] || [];
  const bloqueadoExplicito = bloqueados.some((r) => combina(codigo, r));
  const permitidoExplicito = permitidos.some((r) => combina(codigo, r));

  if (bloqueadoExplicito) {
    rejeicoes.push(`Procedimento ${codigo} bloqueado para o CBO ${cbo} na configuração do Master`);
  } else if (permitidoExplicito || ctx.liberarTodos) {
    if (ctx.liberarTodos && !permitidoExplicito) {
      avisos.push("Compatibilidade CBO × SIGTAP liberada pelo switch Master (disponibilizar todos)");
    }
  } else if (permitidos.length > 0) {
    rejeicoes.push(
      `Procedimento ${codigo} não consta na lista de procedimentos liberados para o CBO ${cbo} na competência ${competencia}`,
    );
  } else if (
    cbo.length === 6 &&
    cboEhNivelTecnico(cbo) &&
    SUBGRUPOS_NIVEL_SUPERIOR.some((s) => codigo.startsWith(s))
  ) {
    rejeicoes.push(
      `Procedimento ${codigo} exige profissional de nível superior e o CBO ${cbo} é de nível médio/técnico — incompatível na competência ${competencia}`,
    );
  }

  // 11) CID, quando exigido ou aplicável
  const cidsDoProc = ctx.cidsVinculados?.get(codigo);
  if (restricao?.cidObrigatorio && !cid) {
    rejeicoes.push(`Procedimento ${codigo} exige CID e a linha está sem CID`);
  } else if (cid && cidsDoProc && cidsDoProc.size > 0 && !cidsDoProc.has(cid)) {
    avisos.push(`CID ${cid} não consta entre os CIDs vinculados ao procedimento ${codigo}`);
  }

  const valido = rejeicoes.length === 0;
  return {
    codigo,
    cid,
    origem,
    status: valido ? "valido" : codigo ? "incompativel" : "ausente",
    valido,
    rejeicoes,
    avisos,
  };
}

/**
 * Aplica a validação final na lista JÁ consolidada. Não descarta itens antes da
 * validação: percorre todos e devolve válidos + rejeitados separadamente.
 */
export function validarListaProcedimentosBpaI(
  lista: BpaProcedimentoEntrada[],
  ctx: BpaValidacaoContexto,
): { validos: BpaValidacaoResultado[]; rejeitados: BpaValidacaoResultado[]; todos: BpaValidacaoResultado[] } {
  const todos = lista.map((item) => validarProcedimentoBpaI(item, ctx));
  return {
    validos: todos.filter((r) => r.valido),
    rejeitados: todos.filter((r) => !r.valido),
    todos,
  };
}

export interface ResumoIntegridadeBpa {
  totalAtendimentos: number;
  totalProcedimentosEncontrados: number;
  totalProcedimentosValidos: number;
  totalRegistros03: number;
  totalDuplicadosRemovidos: number;
  rejeitados: Array<{ paciente: string; data: string; codigo: string; cbo: string; motivo: string }>;
  municipios: string[];
  codigosIbge: string[];
  inconsistencias: string[];
}
