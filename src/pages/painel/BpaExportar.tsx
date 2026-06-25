import React, { useState, useEffect, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Loader2, Download, AlertCircle, CheckCircle2, User, UserCog, X, FileSpreadsheet, Printer, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import * as XLSX from "xlsx";
import { useAuth } from "@/contexts/AuthContext";
import { loadDocumentConfig, buildDocumentShell, printViaIframe } from "@/lib/printLayout";
import { bpaService } from "@/services/bpaService";
import BpaResolverSigtapModal, { ResolverSigtapItem } from "@/components/bpa/BpaResolverSigtapModal";
import {
  isValidCnsAlgo,
  pickValidCnsPaciente,
  normalizeRacaCorBpa,
  normalizeEtniaBpa,
  fetchCepInfoMap,
  resolveMunicipioBpa,
  normalizeCep,
  type CepInfo,
} from "@/lib/bpaNormalization";

// Comparador alfabético estável: nome → data
const cmpAlfa = (a: any, b: any) => {
  const na = String(a?.paciente_nome || "").toLocaleLowerCase("pt-BR");
  const nb = String(b?.paciente_nome || "").toLocaleLowerCase("pt-BR");
  const c = na.localeCompare(nb, "pt-BR");
  if (c !== 0) return c;
  return String(a?.data_atendimento || "").localeCompare(String(b?.data_atendimento || ""));
};

/**
 * Funções de Formatação e Utilitários
 */

const limparTexto = (str: string): string => {
  if (!str) return "";
  return str
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "") // remove acentos
    .toUpperCase()
    .replace(/[^A-Z0-9 ]/g, "") // remove tudo que não for A-Z, 0-9 ou espaço (agora sem trocar por espaço para evitar caracteres extras)
    .replace(/\s+/g, " ") // normaliza espaços repetidos
    .trim();
};

const somenteNumeros = (str: any): string => {
  return String(str || "").replace(/\D/g, "");
};

const zfill = (valor: any, tamanho: number): string => {
  const s = somenteNumeros(valor);
  if (s.length > tamanho) return s.slice(0, tamanho);
  return s.padStart(tamanho, "0");
};

const primeiroValorPreenchido = (...valores: any[]): any =>
  valores.find((valor) => valor !== null && valor !== undefined && String(valor).trim() !== "");

const chaveNomePaciente = (nome: any): string => limparTexto(String(nome || "")).toUpperCase();

const scoreCompletudePaciente = (pac: any): number => {
  const cd = pac?.custom_data || {};
  return (
    (primeiroValorPreenchido(pac?.cpf, cd.cpf) ? 1 : 0) +
    (primeiroValorPreenchido(pac?.cns, cd.cns) ? 1 : 0) +
    (primeiroValorPreenchido(pac?.data_nascimento, cd.data_nascimento) ? 1 : 0)
  );
};

const rpad = (valor: any, tamanho: number): string => {
  const s = String(valor || "");
  if (s.length > tamanho) return s.slice(0, tamanho);
  return s.padEnd(tamanho, " ");
};

const parseDataSegura = (date: any): { ano: number; mes: number; dia: number } | null => {
  if (!date) return null;
  const raw = String(date).trim();
  const iso = raw.match(/^(\d{4})-(\d{2})-(\d{2})/);
  const dmy = raw.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})$/);
  const partes = iso
    ? { ano: Number(iso[1]), mes: Number(iso[2]), dia: Number(iso[3]) }
    : dmy
      ? { ano: Number(dmy[3].length === 2 ? `20${dmy[3]}` : dmy[3]), mes: Number(dmy[2]), dia: Number(dmy[1]) }
      : null;
  if (
    !partes ||
    partes.ano < 1900 ||
    partes.ano > 2100 ||
    partes.mes < 1 ||
    partes.mes > 12 ||
    partes.dia < 1 ||
    partes.dia > 31
  )
    return null;
  const validacao = new Date(Date.UTC(partes.ano, partes.mes - 1, partes.dia));
  if (
    validacao.getUTCFullYear() !== partes.ano ||
    validacao.getUTCMonth() + 1 !== partes.mes ||
    validacao.getUTCDate() !== partes.dia
  )
    return null;
  return partes;
};

const formatarData = (date: any): string => {
  const d = parseDataSegura(date);
  if (!d) return "00000000";
  return `${d.ano}${String(d.mes).padStart(2, "0")}${String(d.dia).padStart(2, "0")}`;
};

const formatarDataBR = (date: any): string => {
  const d = parseDataSegura(date);
  if (!d) return "";
  return `${String(d.dia).padStart(2, "0")}/${String(d.mes).padStart(2, "0")}/${d.ano}`;
};

const calcularIdade = (dataNasc: any, dataAtendimento: any): string => {
  const nasc = parseDataSegura(dataNasc);
  const aten = parseDataSegura(dataAtendimento);
  if (!nasc || !aten) return "000";
  let idade = aten.ano - nasc.ano;
  if (aten.mes < nasc.mes || (aten.mes === nasc.mes && aten.dia < nasc.dia)) idade--;
  return zfill(Math.max(0, idade), 3);
};

const obterCboValido = (prof: any): string => {
  if (!prof) return "";
  const cd = prof.custom_data || {};

  // Lista de campos possíveis para CBO
  const candidatos = [
    cd.cbo_codigo,
    cd.cbo,
    cd.codigo_cbo,
    cd.cbo_sus,
    prof.cbo,
    prof.cbo_codigo,
    prof.profissao,
    prof.cargo,
  ];

  for (const c of candidatos) {
    const limpo = somenteNumeros(c);
    if (limpo.length === 6) return limpo;
  }

  return "";
};

// Profissões que EXIGEM procedimento SIGTAP válido para BPA-I.
// Médico e demais perfis NÃO são bloqueados por ausência de SIGTAP.
// Categoria define a origem de busca do SIGTAP:
//   - psicolog / fonoaudiolog / nutricion → buscar APENAS no Prontuário
//   - fisioterap → buscar no Prontuário e, se ausente, também no PTS
type CategoriaSigtap = "psicolog" | "fonoaudiolog" | "nutricion" | "fisioterap" | "";
const CATEGORIAS_SIGTAP: CategoriaSigtap[] = ["psicolog", "fonoaudiolog", "fisioterap", "nutricion"];
const normalizarProfissaoTxt = (v: any) =>
  String(v || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
const profissaoExigeSigtap = (prof: any): { exige: boolean; profissao: string; categoria: CategoriaSigtap } => {
  if (!prof) return { exige: false, profissao: "", categoria: "" };
  const cd = prof.custom_data || {};
  const candidatos = [prof.profissao, prof.cargo, cd.profissao, cd.cargo, cd.especialidade]
    .map(normalizarProfissaoTxt)
    .filter(Boolean);
  const profissao = candidatos[0] || "";
  let categoria: CategoriaSigtap = "";
  for (const p of candidatos) {
    const hit = CATEGORIAS_SIGTAP.find((k) => p.includes(k));
    if (hit) {
      categoria = hit;
      break;
    }
  }
  return { exige: !!categoria, profissao, categoria };
};

// Identifica profissional médico pelo CBO (família 225) ou pela descrição
// cadastrada em profissão, cargo ou especialidade. Essa identificação é usada
// somente para tornar o CID opcional no BPA-I.
const profissionalEhMedico = (prof: any): boolean => {
  if (!prof) return false;
  const cbo = obterCboValido(prof);
  if (cbo.startsWith("225")) return true;

  const cd = prof.custom_data || {};
  const descricoes = [prof.profissao, prof.cargo, cd.profissao, cd.cargo, cd.especialidade]
    .map(normalizarProfissaoTxt)
    .filter(Boolean);

  return descricoes.some((texto) => texto.includes("medic") || texto.includes("medico") || texto.includes("medica"));
};

// Fontes consultadas para o SIGTAP de acordo com a categoria da profissão.
const fontesSigtapParaCategoria = (cat: CategoriaSigtap): string[] => {
  if (cat === "fisioterap") return ["Prontuário", "Procedimentos vinculados", "PTS"];
  if (cat) return ["Prontuário", "Procedimentos vinculados"];
  return [];
};

// Extrai SIGTAP do prontuário olhando em TODAS as fontes possíveis dentro do registro:
// campo fixo (outro_procedimento, procedimentos_texto), custom_data (procedimento_sigtap,
// codigo_sigtap, sigtap, procedimento, procedimento_codigo) e arrays dinâmicos
// (procedimentos[], procedimentos_realizados[], sigtap[]). Retorna o primeiro
// código de 10 dígitos válido encontrado e o nome do campo de origem.
const extrairTodosSigtapDoProntuario = (pront: any): Array<{ codigo: string; campo: string }> => {
  if (!pront) return [];
  const cd = pront.custom_data || {};
  const pickCodigo = (v: any): string => {
    if (v === null || v === undefined) return "";
    if (typeof v === "string" || typeof v === "number") {
      const n = somenteNumeros(v);
      if (n.length >= 6 && n.length <= 10) return n.padStart(10, "0").slice(-10);
      return "";
    }
    if (typeof v === "object") {
      const cand =
        v.codigo_sigtap || v.codigo || v.sigtap || v.procedimento_sigtap || v.procedimento_codigo || v.procedimento;
      return pickCodigo(cand);
    }
    return "";
  };
  const resultado: Array<{ codigo: string; campo: string }> = [];
  const vistos = new Set<string>();
  const push = (codigo: string, campo: string) => {
    if (codigo && !vistos.has(codigo)) {
      vistos.add(codigo);
      resultado.push({ codigo, campo });
    }
  };
  const candidatosSimples: Array<[string, any]> = [
    ["custom_data.procedimento_sigtap", cd.procedimento_sigtap],
    ["custom_data.codigo_sigtap", cd.codigo_sigtap],
    ["custom_data.sigtap", cd.sigtap],
    ["custom_data.procedimento_codigo", cd.procedimento_codigo],
    ["custom_data.procedimento", cd.procedimento],
    ["outro_procedimento", pront.outro_procedimento],
    ["procedimentos_texto", pront.procedimentos_texto],
  ];
  for (const [campo, v] of candidatosSimples) {
    push(pickCodigo(v), campo);
  }
  const arrays: Array<[string, any]> = [
    ["custom_data.procedimentos", cd.procedimentos],
    ["custom_data.procedimentos_realizados", cd.procedimentos_realizados],
    ["custom_data.sigtap_lista", cd.sigtap_lista],
    // Procedimentos EXTRAS adicionados manualmente via BPA-Exportar (somam-se
    // aos códigos do prontuário/PTS sem substituí-los).
    ["custom_data.procedimentos_extras", cd.procedimentos_extras],
  ];
  for (const [campo, arr] of arrays) {
    if (Array.isArray(arr)) {
      for (const item of arr) {
        push(pickCodigo(item), `${campo}[]`);
      }
    }
  }
  return resultado;
};


// Wrapper de compatibilidade: retorna o primeiro código encontrado.
const extrairSigtapDoProntuario = (pront: any): { codigo: string; campo: string } => {
  const todos = extrairTodosSigtapDoProntuario(pront);
  return todos[0] || { codigo: "", campo: "" };
};

// ============================================================================
// Helpers de EXIBIÇÃO (Excel/PDF/Diagnóstico) — NÃO mexem no TXT BPA-I.
// Garantem que SIGTAP apareça sempre como código numérico (igual ao TXT) e
// que CID exibido só apareça quando for um código válido (ex.: M545, F328).
// ============================================================================

// Extrai códigos CID de valores que também contenham descrição ou vários
// diagnósticos. Preserva a ordem informada e remove apenas o ponto.
// Exemplos aceitos:
//   "M545"                     -> "M545"
//   "M54.5"                    -> "M545"
//   "M545 — Dor lombar baixa"  -> "M545"
//   "CID: F84.0 - Autismo"     -> "F840"
//   "I64"                      -> "I64"
//   "F79/G70/G80"              -> ["F79", "G70", "G80"]
//
// Importante: códigos CID de categoria com 3 caracteres podem ser completos.
// Não acrescentamos "0" automaticamente, pois isso pode criar outro
// diagnóstico ou um código inexistente.
const extrairCodigosCid = (v: any): string[] => {
  const texto = String(v ?? "")
    .trim()
    .toUpperCase();
  if (!texto) return [];

  const encontrados: string[] = [];
  const regex = /(?:^|[^A-Z0-9])([A-Z]\d{2}(?:\.[A-Z0-9]|[A-Z0-9])?)(?=$|[^A-Z0-9])/g;
  let match: RegExpExecArray | null;

  while ((match = regex.exec(texto)) !== null) {
    const codigo = match[1].replace(/\./g, "");
    if (!encontrados.includes(codigo)) encontrados.push(codigo);
  }

  return encontrados;
};

const extrairCodigoCid = (v: any): string => {
  return extrairCodigosCid(v)[0] || "";
};

// Normaliza um valor qualquer para o código SIGTAP de 10 dígitos.
// Aceita number/string que contenha o código; ignora descrições textuais.
// Retorna '' quando não houver código resolvível.
const sigtapCodigoExibicao = (v: any): string => {
  if (v === null || v === undefined) return "";
  const n = somenteNumeros(String(v));
  if (n.length < 6 || n.length > 10) return "";
  return n.padStart(10, "0").slice(-10);
};

// Formata "Origem SIGTAP" no padrão "[codigo] - [origem]".
// Se não houver código, devolve apenas a origem (ou '—').
const formatarOrigemSigtap = (codigo: any, origem: any): string => {
  const cod = sigtapCodigoExibicao(codigo);
  const org = String(origem || "").trim();
  if (cod && org) return `${cod} - ${org}`;
  if (cod) return cod;
  return org || "—";
};

// Valida e normaliza CID para exibição: aceita formatos oficiais (ex.: M54,
// M545, F32, F329). Rejeita lixo textual como "DESE", strings vazias, etc.
// Retorna '—' quando inválido. NÃO inventa CID.
const cidExibicao = (v: any): string => {
  return extrairCodigoCid(v) || "—";
};

// Normalização para o campo CID do BPA-I, que possui 4 posições fixas.
// Aceita:
//   - categorias CID completas de 3 caracteres, como I64 e F79;
//   - subcategorias de 4 caracteres, como M545 e F840;
//   - código acompanhado de descrição;
//   - múltiplos códigos, usando o primeiro e registrando aviso na exportação.
// O preenchimento da quarta posição é feito depois com espaço por rpad().
// Nunca acrescenta "0" para inventar uma subcategoria.
const validarCidBpa = (v: any): { valido: boolean; codigo: string; motivo: string; normalizado: string } => {
  const original = String(v ?? "")
    .trim()
    .toUpperCase();
  if (!original) return { valido: false, codigo: "", motivo: "CID vazio", normalizado: "" };

  const codigoExtraido = extrairCodigoCid(original);
  if (codigoExtraido) {
    return { valido: true, codigo: codigoExtraido, motivo: "", normalizado: codigoExtraido };
  }

  const compacto = original.replace(/\./g, "").replace(/\s+/g, "");
  return {
    valido: false,
    codigo: "",
    motivo: `CID inválido "${original}" — nenhum código CID completo foi reconhecido`,
    normalizado: compacto,
  };
};

const inferirSexoPorNome = (nome: string): "M" | "F" | null => {
  if (!nome) return null;
  const primeiroNome = limparTexto(nome).split(" ")[0];

  const femininos = [
    "MARIA",
    "ANA",
    "FRANCISCA",
    "JOSEFA",
    "ANTONIA",
    "JULIA",
    "LUCIANA",
    "PATRICIA",
    "DAMARIS",
    "JESSICA",
    "ADRIANA",
    "ALINE",
    "AMANDA",
    "BEATRIZ",
    "CAMILA",
    "CARLA",
    "CRISTINA",
    "DANIELA",
    "DEBORA",
    "ELIANE",
    "FERNANDA",
    "GABRIELA",
    "ISABELA",
    "JULIANA",
    "LETICIA",
    "MARCELA",
    "NATALIA",
    "PAULA",
    "RAFAELA",
    "RENATA",
    "SIMONE",
    "TATIANE",
    "VANESSA",
    "VITORIA",
  ];

  const masculinos = [
    "JOSE",
    "JOAO",
    "FRANCISCO",
    "ANTONIO",
    "MARCOS",
    "CARLOS",
    "LUCAS",
    "MARCO",
    "LUIZ",
    "ALEXANDRE",
    "ANDRE",
    "BRUNO",
    "DANIEL",
    "DIEGO",
    "EDUARDO",
    "FELIPE",
    "FERNANDO",
    "GABRIEL",
    "GUILHERME",
    "GUSTAVO",
    "IGOR",
    "LEANDRO",
    "LEONARDO",
    "MARCELO",
    "MATEUS",
    "PAULO",
    "RAFAEL",
    "RICARDO",
    "RODRIGO",
    "SAMUEL",
    "TIAGO",
    "VINICIUS",
    "VITOR",
  ];

  if (femininos.includes(primeiroNome)) return "F";
  if (masculinos.includes(primeiroNome)) return "M";

  return null;
};

const BPA_HEADER_LENGTH = 130;
const BPA_I_RECORD_LENGTH = 338;
const CRLF_BYTES = new Uint8Array([0x0d, 0x0a]);

const bytesToHex = (arr: number[] | Uint8Array, sep = " ") =>
  Array.from(arr)
    .map((b) => b.toString(16).toUpperCase().padStart(2, "0"))
    .join(sep);

const toIsoBytes = (content: string): Uint8Array => {
  const bytes = new Uint8Array(content.length);
  for (let i = 0; i < content.length; i++) {
    const code = content.charCodeAt(i);
    bytes[i] = code <= 255 ? code : 0x20;
  }
  return bytes;
};

const fixedText = (valor: any, tamanho: number): string => rpad(limparTexto(String(valor || "")), tamanho);

const fixedDigits = (valor: any, tamanho: number): string => {
  const s = somenteNumeros(valor);
  if (!s) return " ".repeat(tamanho);
  return s.slice(-tamanho).padStart(tamanho, "0");
};

const mapRacaCorBpa = (valor: any): string => {
  const s = limparTexto(String(valor || "")).toLowerCase();
  if (["01", "branca", "branco"].includes(s)) return "01";
  if (["02", "preta", "preto", "negra", "negro"].includes(s)) return "02";
  if (["03", "parda", "pardo"].includes(s)) return "03";
  if (["04", "amarela", "amarelo"].includes(s)) return "04";
  if (["05", "indigena", "indígena"].includes(s)) return "05";
  return "99";
};

const LOGRADOURO_DNE: Record<string, string> = {
  RUA: "081",
  R: "081",
  AVENIDA: "008",
  AV: "008",
  TRAVESSA: "100",
  TV: "100",
  BECO: "011",
  BC: "011",
  ESTRADA: "035",
  EST: "035",
  RODOVIA: "072",
  ROD: "072",
  ALAMEDA: "003",
  AL: "003",
  PRACA: "062",
  PRAÇA: "062",
  PCA: "062",
  RAMAL: "082",
  VILA: "108",
  VL: "108",
  VIA: "107",
  COMUNIDADE: "023",
  COM: "023",
  CONJUNTO: "025",
  CJ: "025",
  LARGO: "044",
  LGO: "044",
  LADEIRA: "043",
  LD: "043",
  PASSARELA: "057",
  PSA: "057",
  QUADRA: "068",
  QD: "068",
  ROTULA: "075",
  ROTATORIA: "075",
  SETOR: "086",
  SET: "086",
  SITIO: "090",
  FAZENDA: "037",
  LOTEAMENTO: "046",
};

// Mapa reverso: código DNE -> nome canônico (descrição que aparece no Excel/PDF)
const LOGRADOURO_NOME_POR_CODIGO: Record<string, string> = (() => {
  const ordem = [
    "RUA",
    "AVENIDA",
    "TRAVESSA",
    "BECO",
    "ESTRADA",
    "RODOVIA",
    "ALAMEDA",
    "PRACA",
    "RAMAL",
    "VILA",
    "VIA",
    "COMUNIDADE",
    "CONJUNTO",
    "LARGO",
    "LADEIRA",
    "PASSARELA",
    "QUADRA",
    "ROTULA",
    "SETOR",
    "SITIO",
    "FAZENDA",
    "LOTEAMENTO",
  ];
  const out: Record<string, string> = {};
  for (const k of ordem) {
    const c = LOGRADOURO_DNE[k];
    if (c && !out[c]) out[c] = k;
  }
  return out;
})();

// Retorna o código oficial DNE (3 dígitos) ou null se não puder determinar com segurança.
const codigoLogradouroBpa = (pac: any): string | null => {
  const cd = pac?.custom_data || {};
  const salvo = somenteNumeros(
    cd.codigo_logradouro || cd.tipo_logradouro_codigo || cd.tipoLogradouroCodigo || cd.tipo_logradouro_dne,
  );
  if (salvo) return salvo.slice(-3).padStart(3, "0");
  const tipo = limparTexto(pac?.tipo_logradouro || cd.tipo_logradouro || cd.tipoLogradouro || "")
    .toUpperCase()
    .split(" ")[0];
  const enderecoPrimeira = limparTexto(pac?.logradouro || pac?.endereco || cd.logradouro || cd.endereco || "")
    .toUpperCase()
    .split(" ")[0];
  return LOGRADOURO_DNE[tipo] || LOGRADOURO_DNE[enderecoPrimeira] || null;
};

// Resolve o TEXTO do tipo de logradouro usando exatamente a mesma regra do TXT BPA-I.
// Se o código DNE foi resolvido, devolve o nome canônico (RUA, AVENIDA, ...).
// Caso contrário, devolve o valor bruto do cadastro em maiúsculas (sem inventar fallback).
const tipoLogradouroTextoBpa = (pac: any): string => {
  const codigo = codigoLogradouroBpa(pac);
  if (codigo && LOGRADOURO_NOME_POR_CODIGO[codigo]) return LOGRADOURO_NOME_POR_CODIGO[codigo];
  const cd = pac?.custom_data || {};
  const bruto = String(pac?.tipo_logradouro || cd.tipo_logradouro || cd.tipoLogradouro || "")
    .trim()
    .toUpperCase();
  return bruto;
};

// Valida e normaliza nacionalidade (3 dígitos). Retorna null se cadastro não tiver código oficial.
// Tabela SIA/SUS de Nacionalidade (DATASUS) — códigos mais comuns. Usada para validar
// que o valor gravado no cadastro está dentro da faixa aceita pelo importador BPA.
const NACIONALIDADE_BPA_VALIDAS = new Set<string>([
  "010",
  "020",
  "022",
  "030",
  "031",
  "035",
  "040",
  "045",
  "050",
  "060",
  "070",
  "080",
  "090",
  "105",
  "110",
  "115",
  "120",
  "130",
  "140",
  "150",
  "160",
  "170",
  "180",
  "190",
  "200",
  "210",
  "220",
  "230",
  "240",
  "250",
  "260",
  "270",
  "280",
  "290",
  "300",
  "999",
]);

// Mapeia textos amigáveis do cadastro -> código oficial SIA/SUS de Nacionalidade
const NACIONALIDADE_TEXTO_MAP: Record<string, string> = {
  brasileiro: "010",
  brasileira: "010",
  brasileiroa: "010",
  brasileirao: "010",
  "brasileirao a": "010",
  brasil: "010",
  "brasileiro nato": "010",
  "brasileira nata": "010",
  nato: "010",
  nata: "010",
  naturalizado: "020",
  naturalizada: "020",
  "brasileiro naturalizado": "020",
  "brasileira naturalizada": "020",
  "naturalizado brasileiro": "020",
  "naturalizada brasileira": "020",
  estrangeiro: "030",
  estrangeira: "030",
};

const normalizarTextoNacionalidade = (s: string): string =>
  s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[()\-_/\\.,;:]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

const resolverNacionalidadeBpa = (
  valorCadastro: any,
): {
  codigo: string | null;
  descricao?: string;
  origem: "numerico" | "texto" | "vazio" | "desconhecido";
  motivoErro?: string;
} => {
  if (valorCadastro === null || valorCadastro === undefined || String(valorCadastro).trim() === "") {
    return { codigo: null, origem: "vazio", motivoErro: "Sem valor no cadastro" };
  }
  const str = String(valorCadastro).trim();
  // Tentativa 1: numérico puro
  if (/^\d+$/.test(str)) {
    const num = somenteNumeros(str);
    if (num.length > 3)
      return { codigo: null, origem: "numerico", motivoErro: `Tamanho inválido (${num.length} dígitos)` };
    const codigo = num.padStart(3, "0");
    if (codigo === "000") return { codigo: null, origem: "numerico", motivoErro: "Código 000 não é aceito" };
    if (!NACIONALIDADE_BPA_VALIDAS.has(codigo)) {
      return { codigo: null, origem: "numerico", motivoErro: `Código ${codigo} fora da tabela SIA conhecida` };
    }
    return { codigo, origem: "numerico" };
  }
  // Tentativa 2: texto amigável -> mapeamento
  const norm = normalizarTextoNacionalidade(str);
  if (NACIONALIDADE_TEXTO_MAP[norm]) {
    return { codigo: NACIONALIDADE_TEXTO_MAP[norm], descricao: str, origem: "texto" };
  }
  // Tentativa 3: heurística por palavra-chave segura
  if (/\bbrasil/.test(norm) && /natural/.test(norm)) {
    return { codigo: "020", descricao: str, origem: "texto" };
  }
  if (/\bbrasil/.test(norm)) {
    return { codigo: "010", descricao: str, origem: "texto" };
  }
  return { codigo: null, origem: "desconhecido", motivoErro: `Valor textual não mapeado: "${str}"` };
};

const nacionalidadeBpa = (pac: any): { codigo: string | null; motivo?: string } => {
  const cd = pac?.custom_data || {};
  const raw = pac?.nacionalidade ?? cd.nacionalidade_codigo ?? cd.nacionalidade ?? cd.nacionalidadeCodigo;
  const res = resolverNacionalidadeBpa(raw);
  if (res.codigo) return { codigo: res.codigo };
  return { codigo: null, motivo: res.motivoErro };
};

const calcularCampoControle = (itens: Array<{ procedimento: string; quantidade: string }>): string => {
  const soma = itens.reduce(
    (acc, item) => acc + Number(somenteNumeros(item.procedimento) || 0) + Number(somenteNumeros(item.quantidade) || 0),
    0,
  );
  return zfill((soma % 1111) + 1111, 4);
};

const buildHeaderOficial = (params: {
  competencia: string;
  totalRegistros: number;
  totalFolhas: number;
  campoControle: string;
  orgaoOrigem: string;
  siglaOrigem: string;
  documentoOrigem: string;
  orgaoDestino: string;
  indicadorDestino: string;
  versaoSistema: string;
}): string => {
  const header =
    "01" +
    "#BPA#" +
    zfill(params.competencia, 6) +
    zfill(params.totalRegistros, 6) +
    zfill(params.totalFolhas, 6) +
    zfill(params.campoControle, 4) +
    fixedText(params.orgaoOrigem, 30) +
    fixedText(params.siglaOrigem, 6) +
    zfill(params.documentoOrigem, 14) +
    fixedText(params.orgaoDestino, 40) +
    (params.indicadorDestino === "E" ? "E" : "M") +
    rpad(limparTexto(params.versaoSistema || "SMSORIXI"), 10);

  return header.slice(0, BPA_HEADER_LENGTH).padEnd(BPA_HEADER_LENGTH, " ");
};

const BpaExportar: React.FC = () => {
  const { user } = useAuth();
  const correcaoAbertaRef = useRef<{
    aberta: boolean;
    categoria: string | null;
    scrollY: number;
  }>({ aberta: false, categoria: null, scrollY: 0 });
  const [formData, setFormData] = useState({
    competencia: "",
    unidade_id: "all",
    cnes: "",
    profissional_id: "all",
    cns_profissional: "",
    cbo: "",
    procedimento_padrao: "0301010072",
    municipio_padrao: "150530",
    exportar_com_pendencias: false,
    incluir_agenda_sem_prontuario: false,
  });

  // Listas de procedimentos SIGTAP padrão (multi). Persistência em localStorage.
  // - procedimentosPadraoList: usado quando o profissional NÃO exige SIGTAP e
  //   nenhum código foi localizado no prontuário.
  // - procedimentosTecnicoEnfList: usado quando CBO === 322205 (Técnico de Enfermagem).
  const LS_KEY_PADRAO = "bpa_procedimentos_padrao_v1";
  const LS_KEY_TEC_ENF = "bpa_procedimentos_tec_enf_v1";
  const loadList = (key: string, fallback: string[]): string[] => {
    try {
      const raw = localStorage.getItem(key);
      if (!raw) return fallback;
      const arr = JSON.parse(raw);
      if (Array.isArray(arr)) return arr.map((s) => String(s).replace(/\D/g, "")).filter((s) => s.length >= 6 && s.length <= 10);
      return fallback;
    } catch {
      return fallback;
    }
  };
  const [procedimentosPadraoList, setProcedimentosPadraoList] = useState<string[]>(() =>
    loadList(LS_KEY_PADRAO, ["0301010072"]),
  );
  const [procedimentosTecnicoEnfList, setProcedimentosTecnicoEnfList] = useState<string[]>(() =>
    loadList(LS_KEY_TEC_ENF, ["0301100030", "0301100021", "0301100013"]),
  );
  useEffect(() => {
    try { localStorage.setItem(LS_KEY_PADRAO, JSON.stringify(procedimentosPadraoList)); } catch {}
  }, [procedimentosPadraoList]);
  useEffect(() => {
    try { localStorage.setItem(LS_KEY_TEC_ENF, JSON.stringify(procedimentosTecnicoEnfList)); } catch {}
  }, [procedimentosTecnicoEnfList]);

  const [unidades, setUnidades] = useState<any[]>([]);
  const [profissionais, setProfissionais] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadingData, setLoadingData] = useState(true);
  const [loadingProfissionais, setLoadingProfissionais] = useState(false);
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);

  const [results, setResults] = useState<{
    totalFound: number;
    exportedCount: number;
    warnings: string[];
    criticalCount: number;
    stats: {
      all: number;
      missingCns: number;
      missingSexo: number;
      inferredSexo: number;
      missingMunicipio: number;
      missingCbo: number;
      fallbackCbo: number;
      invalidCbo: number;
      defaultProc: number;
      invalidNascimento: number;
      missingNacionalidade: number;
      missingLogradouro: number;
      missingSigtap: number;
      autoCorrected: number;
    };
    details: {
      all: any[];
      missingCns: any[];
      missingSexo: any[];
      inferredSexo: any[];
      missingMunicipio: any[];
      missingCbo: any[];
      fallbackCbo: any[];
      invalidCbo: any[];
      defaultProc: any[];
      invalidNascimento: any[];
      missingNacionalidade: any[];
      missingLogradouro: any[];
      missingSigtap: any[];
      autoCorrected: any[];
      critical: any[];
    };

    error: string | null;
    fileName: string;
    confRows: any[];
    pendRows: any[];
    blobUrl: string | null;
    headerPreview: string | null;
    headerDetails: {
      tipo: string;
      identificacao: string;
      competencia: string;
      registros: string;
      totalFolhas: string;
      campoControle: string;
      tamanho: number;
      recordLength: number;
      headerHex: string;
      crlf: boolean;
      bom: boolean;
      firstRecordPreview: string;
      firstRecordLength: number;
    } | null;
  } | null>(null);

  // Modal de correção SIGTAP/CID (somente para pendência "Procedimento SIGTAP Ausente")
  const [resolverModal, setResolverModal] = useState<{ open: boolean; item: ResolverSigtapItem | null }>({
    open: false,
    item: null,
  });

  useEffect(() => {
    fetchInitialData();
  }, []);

  // Carrega somente profissionais que realmente possuem atendimentos
  // finalizados na competência e unidade selecionadas. Funcionários de
  // recepção/administrativo deixam de aparecer por serem apenas "ativos".
  useEffect(() => {
    let cancelado = false;

    const carregarProfissionaisComAtendimento = async () => {
      const competencia = somenteNumeros(formData.competencia);
      const ano = Number(competencia.slice(0, 4));
      const mes = Number(competencia.slice(4, 6));

      if (competencia.length !== 6 || ano < 2000 || mes < 1 || mes > 12) {
        setProfissionais([]);
        setFormData((prev) => ({
          ...prev,
          profissional_id: "all",
          cns_profissional: "",
          cbo: "",
        }));
        return;
      }

      try {
        setLoadingProfissionais(true);
        const startDate = `${String(ano).padStart(4, "0")}-${String(mes).padStart(2, "0")}-01`;
        const endDate = new Date(ano, mes, 0).toISOString().split("T")[0];

        // Paginação recursiva: PostgREST limita a resposta (padrão 1000 linhas)
        // mesmo com .range(0, 9999). Sem isso, profissionais cujos registros
        // ficam além das primeiras N linhas (ordenação interna do servidor)
        // somem da lista. Ex.: médicos com prontuários em datas posteriores.
        const PAGE = 1000;
        let atendimentos: any[] = [];
        for (let offset = 0; ; offset += PAGE) {
          let q = (supabase as any)
            .from("prontuarios")
            .select("profissional_id")
            .gte("data_atendimento", startDate)
            .lte("data_atendimento", endDate)
            .eq("status", "finalizado")
            .not("profissional_id", "is", null)
            .range(offset, offset + PAGE - 1);
          if (formData.unidade_id !== "all") {
            q = q.eq("unidade_id", formData.unidade_id);
          }
          const { data: pageRows, error: pageErr } = await q;
          if (pageErr) throw pageErr;
          const rows = pageRows || [];
          atendimentos = atendimentos.concat(rows);
          if (rows.length < PAGE) break;
          if (offset > 200000) break; // hard safety
        }


        // Também inclui Técnicos de Enfermagem (CBO 322205) que registraram
        // triagens no período. Triagens não geram prontuário, então sem essa
        // união os técnicos sumiriam do filtro de profissionais.
        let tecnicoIdsTriagem: string[] = [];
        try {
          let triagensQuery = (supabase as any)
            .from("triage_records")
            .select("tecnico_id, agendamento_id, criado_em")
            .gte("criado_em", `${startDate}T00:00:00`)
            .lte("criado_em", `${endDate}T23:59:59`)
            .not("tecnico_id", "is", null)
            .range(0, 9999);
          const { data: triagensFiltro } = await triagensQuery;
          let trIds = (triagensFiltro || []).map((t: any) => t.tecnico_id).filter(Boolean);
          if (formData.unidade_id !== "all" && (triagensFiltro || []).length) {
            const agIds = [
              ...new Set((triagensFiltro || []).map((t: any) => t.agendamento_id).filter(Boolean)),
            ] as string[];
            if (agIds.length) {
              const { data: agsRows } = await (supabase as any)
                .from("agendamentos")
                .select("id, unidade_id")
                .in("id", agIds);
              const agMap = new Map<string, any>((agsRows || []).map((a: any) => [a.id, a]));
              trIds = (triagensFiltro || [])
                .filter((t: any) => {
                  const ag = agMap.get(t.agendamento_id);
                  return ag && ag.unidade_id === formData.unidade_id;
                })
                .map((t: any) => t.tecnico_id);

            }
          }
          tecnicoIdsTriagem = trIds;
        } catch (e) {
          console.warn("[BPA-Exportar] falha ao incluir técnicos de triagem no filtro:", e);
        }

        const profissionalIds = [
          ...new Set(
            [...(atendimentos || []).map((item: any) => item.profissional_id), ...tecnicoIdsTriagem].filter(Boolean),
          ),
        ] as string[];


        if (profissionalIds.length === 0) {
          if (!cancelado) {
            setProfissionais([]);
            setFormData((prev) => ({
              ...prev,
              profissional_id: "all",
              cns_profissional: "",
              cbo: "",
            }));
          }
          return;
        }

        const { data: funcionarios, error: funcionariosError } = await supabase
          .from("funcionarios")
          .select("*")
          .in("id", profissionalIds)
          .eq("ativo", true);

        if (funcionariosError) throw funcionariosError;

        if (!cancelado) {
          const lista = [...(funcionarios || [])].sort((a: any, b: any) =>
            String(a.nome || "").localeCompare(String(b.nome || ""), "pt-BR"),
          );
          setProfissionais(lista);

          // Se o profissional anteriormente selecionado não possui atendimento
          // no novo filtro, volta para "Todos os profissionais com atendimento".
          setFormData((prev) =>
            prev.profissional_id === "all" || lista.some((p: any) => p.id === prev.profissional_id)
              ? prev
              : {
                  ...prev,
                  profissional_id: "all",
                  cns_profissional: "",
                  cbo: "",
                },
          );
        }
      } catch (err) {
        console.error("Erro ao carregar profissionais com atendimento:", err);
        if (!cancelado) {
          setProfissionais([]);
          toast.error("Não foi possível carregar os profissionais que realizaram atendimentos.");
        }
      } finally {
        if (!cancelado) setLoadingProfissionais(false);
      }
    };

    void carregarProfissionaisComAtendimento();
    return () => {
      cancelado = true;
    };
  }, [formData.competencia, formData.unidade_id]);

  const fetchInitialData = async () => {
    try {
      setLoadingData(true);
      const unidadesRes = await supabase.from("unidades").select("*").eq("ativo", true);

      if (unidadesRes.error) throw unidadesRes.error;

      setUnidades(unidadesRes.data || []);
    } catch (err: any) {
      console.error("Erro ao carregar dados iniciais:", err);
      toast.error("Erro ao carregar unidades");
    } finally {
      setLoadingData(false);
    }
  };

  const handleUnidadeChange = (unidadeId: string) => {
    const unidade = unidades.find((u) => u.id === unidadeId);
    const customData = unidade?.custom_data as any;
    const cnes = customData?.cnes || "";
    setFormData((prev) => ({
      ...prev,
      unidade_id: unidadeId,
      cnes,
      profissional_id: "all",
      cns_profissional: "",
      cbo: "",
    }));
  };

  const handleProfissionalChange = (profId: string) => {
    const prof = profissionais.find((p) => p.id === profId);
    const customData = prof?.custom_data as any;
    const cns = prof?.cns || customData?.cns || "";
    const cbo = obterCboValido(prof);

    setFormData((prev) => ({
      ...prev,
      profissional_id: profId,
      cns_profissional: cns,
      cbo: cbo,
    }));

    if (profId !== "all" && !cbo) {
      toast.warning("Este profissional não possui CBO numérico de 6 dígitos cadastrado.");
    }
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    if (name === "cbo") {
      const numeric = somenteNumeros(value);
      if (numeric.length > 6) return;
      setFormData((prev) => ({ ...prev, [name]: numeric }));
      return;
    }
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  const handleLimpar = () => {
    setFormData({
      competencia: "",
      unidade_id: "all",
      cnes: "",
      profissional_id: "all",
      cns_profissional: "",
      cbo: "",
      procedimento_padrao: "0301010072",
      municipio_padrao: "150530",
      exportar_com_pendencias: false,
      incluir_agenda_sem_prontuario: false,
    });
    setResults(null);
    setSelectedCategory(null);
  };

  const handleGerar = async () => {
    setResults(null);
    setSelectedCategory(null);

    if (formData.competencia.length !== 6 || isNaN(Number(formData.competencia))) {
      toast.error("Competência deve ter 6 dígitos (AAAAMM)");
      return;
    }

    setLoading(true);
    const warnings: string[] = [];
    const stats = {
      all: 0,
      missingCns: 0,
      missingSexo: 0,
      inferredSexo: 0,
      missingMunicipio: 0,
      missingCbo: 0,
      fallbackCbo: 0,
      invalidCbo: 0,
      defaultProc: 0,
      invalidNascimento: 0,
      missingNacionalidade: 0,
      missingLogradouro: 0,
      missingSigtap: 0,
      autoCorrected: 0,
    };

    const details = {
      all: [] as any[],
      missingCns: [] as any[],
      missingSexo: [] as any[],
      inferredSexo: [] as any[],
      missingMunicipio: [] as any[],
      missingCbo: [] as any[],
      fallbackCbo: [] as any[],
      invalidCbo: [] as any[],
      defaultProc: [] as any[],
      invalidNascimento: [] as any[],
      missingNacionalidade: [] as any[],
      missingLogradouro: [] as any[],
      missingSigtap: [] as any[],
      autoCorrected: [] as any[],
      critical: [] as any[],
    };


    try {
      const { competencia } = formData;
      const ano = competencia.substring(0, 4);
      const mes = competencia.substring(4, 6);

      const startDate = `${ano}-${mes}-01`;
      const endDate = new Date(parseInt(ano), parseInt(mes), 0).toISOString().split("T")[0];

      let query = (supabase as any)
        .from("prontuarios")
        .select("*")
        .gte("data_atendimento", startDate)
        .lte("data_atendimento", endDate)
        .eq("status", "finalizado");

      if (formData.unidade_id !== "all") {
        query = query.eq("unidade_id", formData.unidade_id);
      }
      if (formData.profissional_id !== "all") {
        query = query.eq("profissional_id", formData.profissional_id);
      }

      const { data: prontuariosOriginais, error: pError } = await query;

      if (pError) throw pError;

      // === Inclusão dos Técnicos de Enfermagem (CBO 322205) ===
      // Triagens não geram prontuário. Para que técnicos apareçam na exportação
      // BPA-I, carregamos triage_records do período e convertemos em registros
      // sintéticos compatíveis com o pipeline existente (mesma estrutura usada
      // por prontuarios). O SIGTAP padrão de triagem vem de system_config.
      // (e) Leitura única de system_config.bpa_config — antes era chamado 2x.
      let triagemSigtapDefault = "";
      let bpaConfigValue: any = {};
      try {
        const { data: cfgRowTr } = await (supabase as any)
          .from("system_config")
          .select("value")
          .eq("key", "bpa_config")
          .maybeSingle();
        bpaConfigValue = cfgRowTr?.value || {};
        triagemSigtapDefault = String(bpaConfigValue.bpa_triagem_sigtap || "").replace(/\D/g, "");
      } catch {
        /* sem config → cai no procedimento padrão da exportação */
      }


      let triagemQuery = (supabase as any)
        .from("triage_records")
        .select("id, agendamento_id, tecnico_id, criado_em")
        .gte("criado_em", `${startDate}T00:00:00`)
        .lte("criado_em", `${endDate}T23:59:59`)
        .not("tecnico_id", "is", null)
        .range(0, 9999);
      if (formData.profissional_id !== "all") {
        triagemQuery = triagemQuery.eq("tecnico_id", formData.profissional_id);
      }
      const { data: triagensPeriodo } = await triagemQuery;
      const agIdsTriagem = [
        ...new Set(((triagensPeriodo as any[]) || []).map((t) => t.agendamento_id).filter(Boolean)),
      ] as string[];
      const agsTriagemMap = new Map<string, any>();
      if (agIdsTriagem.length > 0) {
        const { data: agsTr } = await (supabase as any)
          .from("agendamentos")
          .select("id, paciente_id, paciente_nome, unidade_id, data")
          .in("id", agIdsTriagem);
        (agsTr || []).forEach((a: any) => agsTriagemMap.set(a.id, a));
      }

      const prontuariosTriagem = ((triagensPeriodo as any[]) || [])
        .map((t: any) => {
          const ag = t.agendamento_id ? agsTriagemMap.get(t.agendamento_id) : null;
          const unidadeIdTr = ag?.unidade_id || (formData.unidade_id !== "all" ? formData.unidade_id : null);
          if (formData.unidade_id !== "all" && unidadeIdTr !== formData.unidade_id) return null;
          if (!ag?.paciente_id) return null;
          const dataAtend = (ag?.data || String(t.criado_em || "").slice(0, 10)) as string;
          return {
            id: `triagem:${t.id}`,
            paciente_id: ag.paciente_id,
            paciente_nome: ag.paciente_nome || "",
            profissional_id: t.tecnico_id,
            profissional_nome: "",
            unidade_id: unidadeIdTr,
            data_atendimento: dataAtend,
            status: "finalizado",
            tipo_registro: "triagem",
            hipotese: "",
            procedimentos_texto: "",
            outro_procedimento: "",
            origem: "Triagem",
            custom_data: {
              procedimento_sigtap: triagemSigtapDefault || "",
            },
          };
        })
        .filter(Boolean) as any[];

      // Evita duplicidade caso já exista prontuário para mesmo paciente/profissional/data.
      const chavesPront = new Set(
        ((prontuariosOriginais as any[]) || []).map(
          (p) => `${p.paciente_id}|${p.profissional_id}|${String(p.data_atendimento).slice(0, 10)}`,
        ),
      );
      const triagensInseridas = prontuariosTriagem.filter(
        (t) => !chavesPront.has(`${t.paciente_id}|${t.profissional_id}|${String(t.data_atendimento).slice(0, 10)}`),
      );
      const prontuarios: any[] = [...((prontuariosOriginais as any[]) || []), ...triagensInseridas];

      // === Inclusão de pacientes da AGENDA sem prontuário ===
      // Sempre injeta agendamentos com presença confirmada que já tenham
      // produção manual (custom_data.bpa_manual) salva — assim, após corrigir
      // uma vez, a exportação seguinte reaproveita automaticamente o SIGTAP/CID.
      // Quando o checkbox "Incluir pacientes da Agenda sem prontuário" estiver
      // ligado, também traz os agendamentos AINDA sem bpa_manual para que o
      // usuário possa corrigir pelo mesmo modal. Não cria prontuário nem PTS.
      try {
        const STATUS_PRESENCA = [
          "concluido",
          "confirmado_chegada",
          "aguardando_atendimento",
          "em_atendimento",
        ];
        let agQuery = (supabase as any)
          .from("agendamentos")
          .select("id, paciente_id, paciente_nome, profissional_id, profissional_nome, unidade_id, data, custom_data, status")
          .gte("data", startDate)
          .lte("data", endDate)
          .in("status", STATUS_PRESENCA)
          .range(0, 9999);
        if (formData.unidade_id !== "all") agQuery = agQuery.eq("unidade_id", formData.unidade_id);
        if (formData.profissional_id !== "all") agQuery = agQuery.eq("profissional_id", formData.profissional_id);
        const { data: agsRows, error: agsErr } = await agQuery;
        if (agsErr) throw agsErr;

        // Chaves de prontuário/triagem já cobertos: mesmo paciente+profissional+data
        const cobertos = new Set<string>(
          (prontuarios as any[]).map(
            (p) => `${p.paciente_id}|${p.profissional_id}|${String(p.data_atendimento).slice(0, 10)}`,
          ),
        );
        const incluirSemBpa = !!formData.incluir_agenda_sem_prontuario;
        const sinteticos = ((agsRows as any[]) || [])
          .filter((a) => a?.paciente_id && a?.profissional_id && a?.unidade_id && a?.data)
          .filter(
            (a) =>
              !cobertos.has(
                `${a.paciente_id}|${a.profissional_id}|${String(a.data).slice(0, 10)}`,
              ),
          )
          .map((a) => {
            const cd = (a.custom_data as any) || {};
            const manual = (cd.bpa_manual as any) || null;
            const sigtapManual = manual?.sigtap ? String(manual.sigtap).replace(/\D/g, "") : "";
            const cidManual = manual?.cid ? String(manual.cid).toUpperCase() : "";
            return {
              id: `agenda:${a.id}`,
              agendamento_id: a.id,
              paciente_id: a.paciente_id,
              paciente_nome: a.paciente_nome || "",
              profissional_id: a.profissional_id,
              profissional_nome: a.profissional_nome || "",
              unidade_id: a.unidade_id,
              data_atendimento: String(a.data).slice(0, 10),
              status: "finalizado",
              tipo_registro: "agenda_sem_prontuario",
              hipotese: "",
              procedimentos_texto: "",
              outro_procedimento: "",
              origem: "AGENDA_SEM_PRONTUARIO",
              custom_data: {
                procedimento_sigtap: sigtapManual,
                cid: cidManual,
                bpa_manual: manual,
              },
              _hasManual: !!sigtapManual,
            };
          })
          .filter((s) => s._hasManual || incluirSemBpa);

        if (sinteticos.length > 0) {
          prontuarios.push(...sinteticos);
        }
      } catch (e) {
        console.warn("[BPA-Exportar] falha ao injetar agenda sem prontuário:", e);
      }

      if (!prontuarios || prontuarios.length === 0) {

        setResults({
          totalFound: 0,
          exportedCount: 0,
          warnings: ["Nenhum prontuário finalizado encontrado para esta competência e filtros."],
          criticalCount: 0,
          stats,
          details,
          error: null,
          fileName: "",
          blobUrl: null,
          confRows: [],
          pendRows: [],
          headerPreview: null,
          headerDetails: null,
        });
        setLoading(false);
        return;
      }

      const pacienteIds = [...new Set(prontuarios.map((p: any) => p.paciente_id).filter(Boolean))] as string[];
      const profIds = [...new Set(prontuarios.map((p: any) => p.profissional_id).filter(Boolean))] as string[];
      const unidadeIds = [...new Set(prontuarios.map((p: any) => p.unidade_id).filter(Boolean))] as string[];

      // paciente_id é o vínculo oficial. Nome não deve ser usado para escolher
      // outro cadastro, pois pode mudar e pode haver homônimos/duplicidades.
      const [pacientesRes, funcionariosRes, unidadesRes] = await Promise.all([
        supabase.from("pacientes").select("*").in("id", pacienteIds),
        supabase.from("funcionarios").select("*").in("id", profIds),
        supabase.from("unidades").select("*").in("id", unidadeIds),
      ]);

      if (pacientesRes.error) {
        throw new Error(`Erro ao consultar pacientes: ${pacientesRes.error.message}`);
      }
      if (funcionariosRes.error) {
        throw new Error(`Erro ao consultar profissionais: ${funcionariosRes.error.message}`);
      }
      if (unidadesRes.error) {
        throw new Error(`Erro ao consultar unidades: ${unidadesRes.error.message}`);
      }

      const pacMap = new Map((pacientesRes.data || []).map((p: any) => [String(p.id), p]));
      const funcMap = new Map(funcionariosRes.data?.map((f) => [f.id, f]));
      const unitMap = new Map(unidadesRes.data?.map((u) => [u.id, u]));

      // === Procedimentos Aditivos por Competência ===
      // Lê pacientes.custom_data.bpa_aditivos[] e indexa por paciente_id,
      // filtrando pela competência atual (ou "*" = todas as competências).
      // Cada aditivo gera 1 linha BPA-I extra por sessão exportada do paciente.
      const aditivosByPaciente = new Map<string, Array<{ codigo: string; nome?: string; cid?: string }>>();
      const competenciaAtual = String(formData.competencia || "").replace(/\D/g, "");
      pacMap.forEach((pac: any, pid: string) => {
        const lista = Array.isArray(pac?.custom_data?.bpa_aditivos) ? pac.custom_data.bpa_aditivos : [];
        const filtrados: Array<{ codigo: string; nome?: string; cid?: string }> = [];
        const vistos = new Set<string>();
        for (const a of lista) {
          const comp = String(a?.competencia || "").replace(/\D/g, "");
          if (comp && comp !== "*" && comp !== competenciaAtual) continue;
          const cod = somenteNumeros(a?.codigo || a?.codigo_sigtap || "");
          if (!cod || cod.length < 6 || cod.length > 10) continue;
          const codNorm = cod.padStart(10, "0").slice(-10);
          if (vistos.has(codNorm)) continue;
          vistos.add(codNorm);
          filtrados.push({ codigo: codNorm, nome: a?.nome, cid: a?.cid });
        }
        if (filtrados.length) aditivosByPaciente.set(pid, filtrados);
      });

      // === Pré-carrega informações de CEP (ViaCEP) para validar município/IBGE ===
      // (c) Só consulta CEPs de pacientes cujo município_ibge está faltando/inválido.
      // Quando o cadastro já tem IBGE de 6 dígitos, pulamos a chamada externa —
      // isso elimina o gargalo principal nas execuções repetidas.
      const cepsParaConsulta: string[] = [];
      prontuarios.forEach((pr: any) => {
        const pac = pacMap.get(String(pr.paciente_id)) as any;
        const cd = (pac?.custom_data as any) || {};
        const munCadastro = somenteNumeros(pac?.municipio || cd?.municipio_ibge || "").slice(0, 6);
        const cadastroValido = munCadastro.length === 6 && munCadastro !== "000000";
        if (cadastroValido) return; // não precisa consultar ViaCEP
        const c = normalizeCep(pac?.cep || cd.cep);
        if (c) cepsParaConsulta.push(c);
      });
      let cepInfoMap = new Map<string, CepInfo>();
      try {
        cepInfoMap = await fetchCepInfoMap(cepsParaConsulta);
      } catch (e) {
        console.warn("[BPA-Exportar] ViaCEP indisponível — município será resolvido pelo cadastro/padrão.", e);
      }


      // === Carga de SIGTAP via prontuario_procedimentos (todas as profissões) ===
      // Alguns prontuários gravam o procedimento somente na tabela vinculada
      // prontuario_procedimentos -> procedimentos.codigo_sigtap, sem espelhar em
      // custom_data. Carregamos isso para evitar falso "SIGTAP ausente".
      const prontIdsAll = prontuarios
        .map((p: any) => p.id)
        .filter((id: any) => id && !String(id).startsWith("triagem:") && !String(id).startsWith("agenda:"));
      const sigtapPorProntuario = new Map<string, string[]>();
      if (prontIdsAll.length > 0) {
        const { data: ppRows } = await (supabase as any)
          .from("prontuario_procedimentos")
          .select("prontuario_id, procedimento_id")
          .in("prontuario_id", prontIdsAll);
        const procIds = [...new Set((ppRows || []).map((r: any) => r.procedimento_id).filter(Boolean))] as string[];
        const codigoPorProcId = new Map<string, string>();
        if (procIds.length > 0) {
          const { data: procRows } = await (supabase as any)
            .from("procedimentos")
            .select("id, codigo_sigtap")
            .in("id", procIds);
          (procRows || []).forEach((p: any) => {
            const code = somenteNumeros(p.codigo_sigtap || "");
            if (code) codigoPorProcId.set(p.id, code);
          });
        }
        (ppRows || []).forEach((r: any) => {
          const code = codigoPorProcId.get(r.procedimento_id);
          if (!code) return;
          const lista = sigtapPorProntuario.get(r.prontuario_id) || [];
          if (!lista.includes(code)) {
            lista.push(code);
            sigtapPorProntuario.set(r.prontuario_id, lista);
          }
        });
      }

      // === Carga de SIGTAP do PTS (apenas para Fisioterapeuta) ===
      // Para Psicóloga, Fonoaudiólogo(a) e Nutricionista o SIGTAP vem somente do Prontuário.
      // Para Fisioterapeuta, se o Prontuário não tiver SIGTAP, buscamos no PTS ativo do paciente.
      const ptsSigtapByPatient = new Map<string, string>();
      const fisioPatientIds = new Set<string>();
      prontuarios.forEach((pr: any) => {
        const prof = funcMap.get(pr.profissional_id) as any;
        const cat = profissaoExigeSigtap(prof).categoria;
        const inProntCd = extrairSigtapDoProntuario(pr).codigo;
        const inVinculado = (sigtapPorProntuario.get(pr.id) || []).length > 0;
        if (cat === "fisioterap" && !inProntCd && !inVinculado && pr.paciente_id) {
          fisioPatientIds.add(String(pr.paciente_id));
        }
      });
      if (fisioPatientIds.size > 0) {
        const ids = Array.from(fisioPatientIds);
        const { data: ptsRows } = await (supabase as any)
          .from("pts")
          .select("id, patient_id, status, updated_at")
          .in("patient_id", ids);
        const ativos = (ptsRows || []).filter((r: any) => {
          const s = String(r.status || "").toLowerCase();
          return s === "ativo" || s === "em_andamento" || s === "em andamento" || !s;
        });
        const ptsByPatient = new Map<string, any>();
        ativos.forEach((r: any) => {
          const ex = ptsByPatient.get(String(r.patient_id));
          if (!ex || new Date(r.updated_at || 0) > new Date(ex.updated_at || 0)) {
            ptsByPatient.set(String(r.patient_id), r);
          }
        });
        const ptsIds = Array.from(ptsByPatient.values()).map((r: any) => r.id);
        if (ptsIds.length > 0) {
          const { data: sigRows } = await (supabase as any)
            .from("pts_sigtap")
            .select("pts_id, procedimento_codigo")
            .in("pts_id", ptsIds);
          const sigByPts = new Map<string, string>();
          (sigRows || []).forEach((s: any) => {
            const code = somenteNumeros(s.procedimento_codigo || "");
            if (code && !sigByPts.has(s.pts_id)) sigByPts.set(s.pts_id, code);
          });
          ptsByPatient.forEach((pts, pid) => {
            const code = sigByPts.get(pts.id);
            if (code) ptsSigtapByPatient.set(pid, code);
          });
        }
      }

      // === Resolução unificada com BPA-Produção (Psico/Fono/Fisio/Nutri) ===
      // Reutiliza EXATAMENTE a mesma função do BPA-Produção
      // (bpaService.resolveBpaProcedimentosECids) para resolver SIGTAP e CID.
      // Sem lógica paralela: se o BPA-Produção encontra, a Exportar também encontra.
      const producaoByPront = new Map<
        string,
        {
          codigo_sigtap: string;
          cid: string;
          fonte_procedimento: string;
          fonte_cid: string;
          fonte_resolucao: string;
          status: string;
        }
      >();
      try {
        // (e) Reaproveita bpaConfigValue já carregado acima — sem nova ida ao banco.
        const triagemSigtapPadrao = String(bpaConfigValue?.bpa_triagem_sigtap || "").replace(/\D/g, "");

        const linhasProducaoSvc = await bpaService.resolveBpaProcedimentosECids({
          competencia: formData.competencia,
          unidadeId: formData.unidade_id !== "all" ? formData.unidade_id : undefined,
          profissionalId: formData.profissional_id !== "all" ? formData.profissional_id : undefined,
          triagemSigtapPadrao,
        });

        for (const ln of linhasProducaoSvc) {
          if (!ln.prontuario_id) continue;
          const atual = producaoByPront.get(ln.prontuario_id);
          const scoreNew = (ln.codigo_sigtap ? 2 : 0) + (ln.status_bpa === "ok" ? 1 : 0);
          const scoreOld = atual ? (atual.codigo_sigtap ? 2 : 0) + (atual.status === "ok" ? 1 : 0) : -1;
          if (scoreNew > scoreOld) {
            producaoByPront.set(ln.prontuario_id, {
              codigo_sigtap: ln.codigo_sigtap || "",
              cid: ln.cid || "",
              fonte_procedimento: ln.fonte_procedimento || "",
              fonte_cid: ln.fonte_cid || "",
              fonte_resolucao: ln.fonte_resolucao || "",
              status: ln.status_bpa || "",
            });
          }
        }
        console.log("[BPA-Exportar] resoluções herdadas do BPA-Produção:", producaoByPront.size);
      } catch (e) {
        console.warn("[BPA-Exportar] falha ao consultar bpaService (fallback para lógica local):", e);
      }

      let exportedCount = 0;
      let criticalCount = 0;
      const linhasProducao: string[] = [];
      const itensControle: Array<{ procedimento: string; quantidade: string }> = [];
      const confRows: any[] = [];
      const pendRows: any[] = [];
      const chavesAtendimentos = new Set<string>();

      let hasError = false;

      // Linhas de Produção
      prontuarios.forEach((pront: any, index: number) => {
        const pac = pacMap.get(String(pront.paciente_id)) as any;
        const prof = funcMap.get(pront.profissional_id) as any;
        const unit = unitMap.get(pront.unidade_id) as any;

        const ident = pac?.nome || pront.paciente_nome || `Registro ${index + 1}`;
        const itemDetail = {
          id: pront.id,
          paciente_id: pront.paciente_id,
          paciente_nome: ident,
          paciente_cpf: primeiroValorPreenchido(pac?.cpf, (pac?.custom_data as any)?.cpf),
          paciente_nascimento: primeiroValorPreenchido(
            pac?.data_nascimento,
            (pac?.custom_data as any)?.data_nascimento,
          ),
          data_atendimento: pront.data_atendimento,
          profissional_id: pront.profissional_id,
          profissional_nome: prof?.nome || "Profissional não encontrado",
          unidade_id: pront.unidade_id,
          unidade_nome: unit?.nome || "Unidade não encontrada",
          procedimento: pront.custom_data?.procedimento_sigtap || pront.outro_procedimento,
          cns_paciente: primeiroValorPreenchido(pac?.cns, (pac?.custom_data as any)?.cns),
          sexo: pac?.sexo,
          municipio: pac?.municipio || (pac?.custom_data as any)?.municipio_ibge,
          cbo: obterCboValido(prof),
          tipo_registro: pront.tipo_registro,
          agendamento_id: pront.agendamento_id || null,
          origem: pront.tipo_registro === "agenda_sem_prontuario" ? "AGENDA_SEM_PRONTUARIO" : undefined,
        };

        // Lista mestre: TODOS os registros da competência (com ou sem pendência).
        // Permite ao usuário abrir o modal e adicionar Procedimentos Aditivos
        // mesmo em prontuários considerados "limpos".
        stats.all++;
        details.all.push({
          ...itemDetail,
          pendencia: "Sem pendência",
          valor_atual: "Registro válido",
        });


        // Remove apenas duplicidades exatas de atendimento: mesmo paciente,
        // profissional, unidade e data. Múltiplos procedimentos do mesmo
        // atendimento NÃO são duplicidade — viram múltiplas linhas BPA-I.
        const chaveAtendimento = [
          String(pront.paciente_id || ""),
          String(pront.profissional_id || ""),
          String(pront.unidade_id || ""),
          String(pront.data_atendimento || "").slice(0, 10),
        ].join("|");

        if (chavesAtendimentos.has(chaveAtendimento)) {
          stats.autoCorrected++;
          warnings.push(`${ident}: atendimento duplicado removido automaticamente.`);
          details.autoCorrected.push({
            ...itemDetail,
            pendencia: "Atendimento duplicado removido",
            valor_atual: chaveAtendimento,
          });
          return;
        }
        chavesAtendimentos.add(chaveAtendimento);

        // Sem o paciente correspondente ao paciente_id do prontuário não é
        // seguro usar outro cadastro por semelhança de nome.
        if (!pac) {
          criticalCount++;
          const pacienteId = String(pront.paciente_id || "Vazio");
          const motivo =
            `Vínculo inválido: o prontuário aponta para o paciente_id ${pacienteId}, ` +
            `mas esse cadastro não foi encontrado. Prontuário: ${pront.id}.`;
          warnings.push(`${ident}: ${motivo}`);
          details.critical.push({
            ...itemDetail,
            pendencia: "Vínculo de paciente inválido",
            valor_atual: motivo,
          });
          return;
        }

        // O nome atual da tabela pacientes é sempre a fonte oficial. Se o
        // prontuário ainda guardar o nome antigo, apenas registramos o ajuste.
        if (pront.paciente_nome && chaveNomePaciente(pront.paciente_nome) !== chaveNomePaciente(pac.nome)) {
          warnings.push(
            `${pac.nome}: nome do prontuário estava desatualizado ` +
              `("${pront.paciente_nome}"). Foi usado o nome atual do cadastro pelo paciente_id ${pac.id}.`,
          );
        }

        let isCritical = false;
        const errosCadastro: string[] = [];

        // CNS Paciente — validação oficial (mod-11), com substituição automática
        // por outro CNS válido cadastrado, quando disponível.
        const cnsPick = pickValidCnsPaciente(pac);
        const cns_pac_raw = cnsPick.cns || cnsPick.original || "";
        const cns_pac = cnsPick.cns ? cnsPick.cns : zfill("", 15);
        if (!cnsPick.cns) {
          isCritical = true;
          errosCadastro.push(cnsPick.original ? `CNS inválido (${cnsPick.original})` : "CNS ausente");
          stats.missingCns++;
          const detalhe = cnsPick.original
            ? `CNS original "${cnsPick.original}" reprovado na validação oficial e sem alternativa válida no cadastro.`
            : "CNS do paciente ausente.";
          warnings.push(`${ident}: ${detalhe}`);
          details.missingCns.push({
            ...itemDetail,
            pendencia: "CNS Ausente/Inválido",
            valor_atual: cnsPick.original || "Vazio",
          });
        } else if (cnsPick.substituido) {
          stats.autoCorrected++;
          details.autoCorrected.push({
            ...itemDetail,
            pendencia: "CNS substituído",
            valor_atual: `Original "${cnsPick.original}" inválido → usado "${cnsPick.cns}" (fonte: ${cnsPick.fonte})`,
          });
        }

        // Sexo
        let sexo = " ";
        const raw_sexo = (pac?.sexo || (pac?.custom_data as any)?.sexo || "").toUpperCase();
        if (raw_sexo.startsWith("M") || raw_sexo === "MASCULINO" || raw_sexo === "MALE") {
          sexo = "M";
        } else if (raw_sexo.startsWith("F") || raw_sexo === "FEMININO" || raw_sexo === "FEMALE") {
          sexo = "F";
        } else {
          const inferred = inferirSexoPorNome(pac?.nome || pront.paciente_nome || "");
          if (inferred) {
            sexo = inferred;
            stats.inferredSexo++;
            details.inferredSexo.push({
              ...itemDetail,
              pendencia: "Sexo Inferido",
              valor_atual: "Indefinido",
              sugestao: inferred,
            });
          } else {
            isCritical = true;
            errosCadastro.push("Sexo ausente ou não reconhecido");
            stats.missingSexo++;
            warnings.push(`${ident}: Sexo do paciente não informado.`);
            details.missingSexo.push({ ...itemDetail, pendencia: "Sexo Indefinido", valor_atual: "Vazio" });
          }
        }

        // Nascimento
        const raw_nasc = primeiroValorPreenchido(pac?.data_nascimento, (pac?.custom_data as any)?.data_nascimento);
        const data_nasc = formatarData(raw_nasc);
        if (data_nasc === "00000000") {
          isCritical = true;
          errosCadastro.push(`Nascimento inválido (${raw_nasc || "vazio"})`);
          stats.invalidNascimento++;
          warnings.push(`${ident}: Data de nascimento inválida (${raw_nasc || "Vazio"}).`);
          details.invalidNascimento.push({
            ...itemDetail,
            pendencia: "Nascimento Inválido",
            valor_atual: raw_nasc || "Vazio",
          });
        }

        // Município — resolve via cadastro + CEP (ViaCEP) + padrão da exportação.
        // Quando o CEP do paciente pertence a outro município, ajusta IBGE.
        const mun_raw = pac?.municipio || (pac?.custom_data as any)?.municipio_ibge;
        const cepNormalizado = normalizeCep(pac?.cep || (pac?.custom_data as any)?.cep);
        const cepInfo = cepNormalizado ? cepInfoMap.get(cepNormalizado) : undefined;
        const munRes = resolveMunicipioBpa({
          municipioCadastro: mun_raw,
          cepInfo,
          municipioPadrao: formData.municipio_padrao,
        });
        const municipio = munRes.codigo;
        if (!municipio || municipio.length !== 6 || municipio === "000000") {
          isCritical = true;
          errosCadastro.push(`Município/IBGE inválido (${mun_raw || "vazio"})`);
          stats.missingMunicipio++;
          warnings.push(`${ident}: Município de residência inválido ou ausente.`);
          details.missingMunicipio.push({
            ...itemDetail,
            pendencia: "Município Inválido",
            valor_atual: mun_raw || "Vazio",
          });
        } else if (munRes.autoCorrigido) {
          stats.autoCorrected++;
          details.autoCorrected.push({
            ...itemDetail,
            pendencia: munRes.fonte === "cep" ? "Município ajustado pelo CEP" : "Município corrigido",
            valor_atual: `${munRes.motivo || ""} (final: ${municipio})`,
          });
        }

        if (isCritical) {
          criticalCount++;
          details.critical.push({
            ...itemDetail,
            pendencia: "Erro Crítico no cadastro do paciente",
            valor_atual: errosCadastro.join(" + ") || "Motivo não identificado",
          });
        }

        // Se não for crítico ou se o usuário permitiu exportar com pendências
        if (!isCritical || formData.exportar_com_pendencias) {
          const unitCd = unit?.custom_data as any;
          const cnes = zfill(unitCd?.cnes || unit?.cnes || formData.cnes, 7);
          const profCd = prof?.custom_data as any;
          const cns_prof = zfill(prof?.cns || profCd?.cns || formData.cns_profissional, 15);

          let cbo_raw = obterCboValido(prof);
          if (!cbo_raw) {
            cbo_raw = somenteNumeros(formData.cbo);
            if (cbo_raw.length === 6) {
              stats.fallbackCbo++;
            } else {
              stats.missingCbo++;
            }
          }
          const cbo = zfill(cbo_raw, 6);

          let pendenciaPaciente = false;
          const motivosPendencia: string[] = [];
          const sigtapReq = profissaoExigeSigtap(prof);
          // Origem do SIGTAP varia por profissão:
          //   psicólogo / fonoaudiólogo / nutricionista → Prontuário (campo fixo, custom_data
          //     ou tabela vinculada prontuario_procedimentos)
          //   fisioterapeuta → as fontes acima e, se ausente, PTS ativo do paciente
          const sigtapTodos = extrairTodosSigtapDoProntuario(pront);
          const sigtapEmCustom = sigtapTodos[0] || { codigo: "", campo: "" };
          const sigtapVinculadoList = sigtapPorProntuario.get(pront.id) || [];
          const sigtapVinculado = sigtapVinculadoList[0] || "";
          let proc_real = "";
          let proc_origem: "Prontuário" | "Procedimentos vinculados" | "PTS" | "" = "";
          let proc_campo = "";
          if (sigtapEmCustom.codigo) {
            proc_real = sigtapEmCustom.codigo;
            proc_origem = "Prontuário";
            proc_campo = sigtapEmCustom.campo;
          } else if (sigtapVinculado) {
            proc_real = sigtapVinculado;
            proc_origem = "Procedimentos vinculados";
            proc_campo = "prontuario_procedimentos";
          }
          const fontesConsultadas = fontesSigtapParaCategoria(sigtapReq.categoria);
          let ptsConsultado = false;
          let ptsEncontrado = 0;
          if (!proc_real && sigtapReq.categoria === "fisioterap" && pront.paciente_id) {
            ptsConsultado = true;
            const ptsCode = ptsSigtapByPatient.get(String(pront.paciente_id));
            if (ptsCode) {
              proc_real = ptsCode;
              proc_origem = "PTS";
              proc_campo = "pts_sigtap";
              ptsEncontrado = 1;
            }
          }

          // === Override unificado com BPA-Produção (Psico/Fono/Fisio/Nutri) ===
          const producaoResolvida = sigtapReq.exige ? producaoByPront.get(pront.id) : undefined;
          if (producaoResolvida?.codigo_sigtap && producaoResolvida.codigo_sigtap !== proc_real) {
            proc_real = producaoResolvida.codigo_sigtap;
            proc_origem = producaoResolvida.fonte_procedimento === "pts" ? "PTS" : "Prontuário";
            proc_campo = `bpaService:${producaoResolvida.fonte_resolucao || "resolvido"}`;
            if (producaoResolvida.fonte_procedimento === "pts") ptsEncontrado = Math.max(ptsEncontrado, 1);
          } else if (!proc_real && producaoResolvida?.codigo_sigtap) {
            proc_real = producaoResolvida.codigo_sigtap;
            proc_origem = producaoResolvida.fonte_procedimento === "pts" ? "PTS" : "Prontuário";
            proc_campo = `bpaService:${producaoResolvida.fonte_resolucao || "resolvido"}`;
          }

          // === Coleta consolidada de TODOS os procedimentos a exportar ===
          // Suporta múltiplos SIGTAPs no mesmo atendimento (ex.: Fisio + Psico
          // em prontuários distintos OU vários procedimentos do mesmo prontuário).
          const codigosParaExportar: Array<{ codigo: string; origem: string }> = [];
          const codigosVistos = new Set<string>();
          const addCodigo = (codigo: string, origem: string) => {
            const c = somenteNumeros(codigo);
            if (!c || codigosVistos.has(c)) return;
            codigosVistos.add(c);
            codigosParaExportar.push({ codigo: c, origem });
          };
          // 1) Todos os SIGTAPs do prontuário (custom_data, campos fixos, arrays).
          for (const t of sigtapTodos) addCodigo(t.codigo, `Prontuário:${t.campo}`);
          // 2) Todos os SIGTAPs vinculados (prontuario_procedimentos).
          for (const c of sigtapVinculadoList) addCodigo(c, "Procedimentos vinculados");
          // 3) Resolução do BPA-Produção (apenas se ainda não houver nada).
          if (codigosParaExportar.length === 0 && sigtapReq.exige && producaoResolvida?.codigo_sigtap) {
            addCodigo(
              producaoResolvida.codigo_sigtap,
              `bpaService:${producaoResolvida.fonte_resolucao || "resolvido"}`,
            );
          }
          // 4) PTS (apenas Fisio e lista ainda vazia).
          if (codigosParaExportar.length === 0 && sigtapReq.categoria === "fisioterap" && pront.paciente_id) {
            const ptsCode = ptsSigtapByPatient.get(String(pront.paciente_id));
            if (ptsCode) addCodigo(ptsCode, "PTS");
          }
          // 4.5) Técnico de Enfermagem (CBO 322205): injeta toda a lista de
          // procedimentos cadastrados — gera 1 linha BPA-I para cada código.
          const cboParaInjecao = obterCboValido(prof);
          if (cboParaInjecao === "322205" && codigosParaExportar.length === 0) {
            for (const c of procedimentosTecnicoEnfList) {
              addCodigo(c, "Padrão (Téc. Enfermagem)");
            }
          }
          // 4.6) Procedimentos Aditivos por Competência (configurados em
          // pacientes.custom_data.bpa_aditivos). Somam-se aos clínicos — geram
          // 1 linha BPA-I extra por sessão. Set já garante deduplicação.
          const aditivosPac = pront.paciente_id ? aditivosByPaciente.get(String(pront.paciente_id)) || [] : [];
          for (const a of aditivosPac) {
            addCodigo(a.codigo, "Aditivo (competência)");
          }
          // 5) Procedimentos padrão do form (lista vazia e profissão NÃO exige).
          if (codigosParaExportar.length === 0 && !sigtapReq.exige) {
            for (const c of procedimentosPadraoList) {
              addCodigo(c, "Padrão (form)");
            }
            if (codigosParaExportar.length === 0 && formData.procedimento_padrao) {
              addCodigo(formData.procedimento_padrao, "Padrão (form)");
            }
          }

          // Regra oficial: SIGTAP só é obrigatório para Psicóloga, Fonoaudióloga,
          // Fisioterapeuta e Nutricionista. Médico e demais perfis não bloqueiam.
          if (codigosParaExportar.length === 0 && sigtapReq.exige) {
            pendenciaPaciente = true;
            motivosPendencia.push("SIGTAP obrigatório ausente");
            stats.missingSigtap++;
            const fontesTxt = fontesConsultadas.length ? fontesConsultadas.join(" / ") : "Prontuário";
            const motivo = `Profissão "${sigtapReq.profissao || "indefinida"}" exige SIGTAP. Fontes consultadas: ${fontesTxt}. Nenhum código localizado em campo fixo, custom_data, seção dinâmica, prontuario_procedimentos${sigtapReq.categoria === "fisioterap" ? " ou PTS ativo" : ""}.`;
            warnings.push(`${ident}: ${motivo}`);
            details.missingSigtap.push({
              ...itemDetail,
              pendencia: "Procedimento SIGTAP Ausente",
              valor_atual: "Vazio",
              profissao: sigtapReq.profissao || "indefinida",
              profissao_categoria: sigtapReq.categoria,
              sigtap_obrigatorio: "Sim",
              fontes_consultadas: fontesTxt,
              origem_sigtap: "—",
              prontuarios_encontrados: 1,
              pts_consultado: ptsConsultado ? "Sim" : "Não",
              pts_encontrados: ptsEncontrado,
              campo_origem: "—",
              motivo,
            });
          }
          if (codigosParaExportar.length > 1) {
            warnings.push(
              `${ident}: ${codigosParaExportar.length} procedimentos SIGTAP encontrados para este atendimento — geradas ${codigosParaExportar.length} linhas BPA-I.`,
            );
          }
          if (!proc_real && !sigtapReq.exige) stats.defaultProc++;

          const data_atend = formatarData(pront.data_atendimento);
          const idade = calcularIdade(raw_nasc, pront.data_atendimento);
          const nome_pac = limparTexto(pac?.nome || pront.paciente_nome || "");
          const pacCd = (pac?.custom_data as any) || {};
          const unidadeCd = unitCd || {};
          // CID: para Psico/Fono/Fisio/Nutri, reutilizar a resolução do BPA-Produção
          // (mesma função: bpaService.resolveBpaProcedimentosECids → resolveCidForBpaProcedure)
          // como fonte primária. Sem fallback inventado: se o BPA-Produção não achou,
          // a Exportar também não inventa.
          // Técnico de Enfermagem (CBO 322205): CID sempre em branco, igual aos médicos.
          const cboEfetivo = obterCboValido(prof);
          const ehTecnicoEnfermagem = cboEfetivo === "322205";
          const ehMedico = profissionalEhMedico(prof) || ehTecnicoEnfermagem;
          const cidProducao = sigtapReq.exige && !ehTecnicoEnfermagem ? producaoResolvida?.cid || "" : "";
          const cidBruto = ehTecnicoEnfermagem
            ? ""
            : cidProducao || pront.custom_data?.cid || pac?.cid || "";
          const codigosCidEncontrados = extrairCodigosCid(cidBruto);
          if (codigosCidEncontrados.length > 1) {
            const cidEscolhido = codigosCidEncontrados[0];
            const descartados = codigosCidEncontrados.slice(1).join(", ");
            warnings.push(
              `${ident}: foram encontrados vários CIDs (${codigosCidEncontrados.join(", ")}). ` +
                `O BPA-I aceita um CID por linha; foi usado ${cidEscolhido}. ` +
                `Não usados nesta linha: ${descartados}.`,
            );
            stats.autoCorrected++;
            details.autoCorrected.push({
              ...itemDetail,
              pendencia: "Múltiplos CIDs normalizados",
              valor_atual: `${String(cidBruto)} → usado ${cidEscolhido}`,
            });
          } else if (
            codigosCidEncontrados.length === 1 &&
            String(cidBruto || "")
              .trim()
              .toUpperCase()
              .replace(/\./g, "") !== codigosCidEncontrados[0]
          ) {
            stats.autoCorrected++;
            details.autoCorrected.push({
              ...itemDetail,
              pendencia: "CID normalizado automaticamente",
              valor_atual: `${String(cidBruto)} → ${codigosCidEncontrados[0]}`,
            });
          }
          // O campo possui 4 posições, mas códigos CID completos de 3 caracteres
          // são exportados com um espaço à direita (ex.: "I64 ").
          // Para médico, o CID é opcional: quando ausente ou inválido, o campo
          // é exportado em branco e a linha continua normalmente.
          let cid: string;
          if (String(cidBruto || "").trim() === "") {
            // Sem CID → campo em branco (4 espaços). Não é erro por si só.
            cid = "    ";
          } else {
            const cidVal = validarCidBpa(cidBruto);
            if (cidVal.valido) {
              cid = rpad(cidVal.codigo, 4);
            } else if (ehMedico) {
              // BPA-I médico não exige CID. Não inventar nem exportar valor
              // inválido; apenas manter as quatro posições em branco.
              cid = "    ";
              warnings.push(
                `${ident}: CID médico opcional ignorado (${cidVal.motivo}). A linha foi exportada sem CID.`,
              );
            } else {
              // CID é opcional neste modo operacional. Conteúdo inválido,
              // como "FOIO", é removido e a linha segue sem CID.
              cid = "    ";
              warnings.push(
                `${ident}: CID inválido removido automaticamente (${cidVal.motivo}). A linha foi exportada sem CID.`,
              );
              stats.autoCorrected++;
              details.autoCorrected.push({
                ...itemDetail,
                pendencia: "CID inválido removido",
                valor_atual: `${String(cidBruto)} → campo vazio`,
              });
            }
          }

          const quantidade = zfill(pront.custom_data?.quantidade_bpa || pront.custom_data?.quantidade || 1, 6);
          const carater = zfill(pront.custom_data?.carater_atendimento || pront.custom_data?.carater || "01", 2);
          const autorizacao = rpad(
            somenteNumeros(pront.custom_data?.numero_autorizacao || pacCd.numero_autorizacao || ""),
            13,
          );
          // Raça/Cor — nunca emite 99. Quando ausente / "não declarada" / inválida,
          // aplica padrão do fluxo (04 — Amarelo) e marca correção automática.
          const racaRes = normalizeRacaCorBpa(pac?.raca_cor || pacCd.raca_cor || pacCd.racaCor);
          const raca = racaRes.codigo;
          if (racaRes.autoCorrigido) {
            stats.autoCorrected++;
            details.autoCorrected.push({
              ...itemDetail,
              pendencia: "Raça/Cor → padrão Amarelo",
              valor_atual: `${racaRes.valorOriginal || "Vazio"} → 04 (Amarelo). ${racaRes.motivo}`,
            });
          }

          // Nacionalidade: usar APENAS código oficial do cadastro do paciente. Sem fallback.
          const nacRes = nacionalidadeBpa(pac);
          let nacionalidade: string;
          if (nacRes.codigo) {
            nacionalidade = nacRes.codigo;
          } else {
            nacionalidade = "   ";
            pendenciaPaciente = true;
            motivosPendencia.push("Nacionalidade");
            stats.missingNacionalidade++;
            const valorAtual = pac?.nacionalidade || pacCd.nacionalidade_codigo || pacCd.nacionalidade || "Vazio";
            const motivo = nacRes.motivo || "Inválido";
            warnings.push(`${ident}: Nacionalidade inválida — ${motivo} (valor: ${valorAtual}).`);
            details.missingNacionalidade.push({
              ...itemDetail,
              pendencia: `Nacionalidade: ${motivo}`,
              valor_atual: String(valorAtual),
            });
          }

          // Etnia — contextual conforme raça/cor + nacionalidade
          const etniaRes = normalizeEtniaBpa({
            racaCodigo: raca,
            nacionalidadeCodigo: nacionalidade,
            etniaCadastro: pacCd.etnia_codigo || pacCd.etnia,
          });
          const etnia = etniaRes.etniaPadded;
          if (etniaRes.pendencia) {
            pendenciaPaciente = true;
            motivosPendencia.push("Etnia indígena");
            warnings.push(`${ident}: ${etniaRes.motivo}.`);
          }

          const servico = fixedDigits(pront.custom_data?.servico || pront.custom_data?.servico_codigo || "", 3);
          const classificacao = fixedDigits(
            pront.custom_data?.classificacao || pront.custom_data?.classificacao_codigo || "",
            3,
          );
          const sequenciaEquipe = fixedDigits(
            pront.custom_data?.sequencia_equipe || unidadeCd.sequencia_equipe || "",
            8,
          );
          const areaEquipe = fixedDigits(pront.custom_data?.area_equipe || unidadeCd.area_equipe || "", 4);
          const cnpj = fixedDigits(unidadeCd.cnpj || unit?.cnpj || pacCd.cnpj || "", 14);
          const cep = fixedDigits(pac?.cep || pacCd.cep, 8);

          // Código de logradouro: derivar do tipo real. Sem chute.
          const logradouroCodigo = codigoLogradouroBpa(pac);
          let codigoLogradouro: string;
          if (logradouroCodigo) {
            codigoLogradouro = logradouroCodigo;
          } else {
            codigoLogradouro = "   ";
            const temEndereco = !!(pac?.logradouro || pac?.endereco || pacCd.logradouro || pacCd.endereco);
            if (temEndereco) {
              pendenciaPaciente = true;
              motivosPendencia.push("Código de logradouro");
              stats.missingLogradouro++;
              const valorAtual =
                pac?.tipo_logradouro || pacCd.tipo_logradouro || pac?.logradouro || pac?.endereco || "Vazio";
              warnings.push(
                `${ident}: Código do logradouro não pôde ser determinado a partir do cadastro (${valorAtual}).`,
              );
              details.missingLogradouro.push({
                ...itemDetail,
                pendencia: "Código de Logradouro Indeterminado",
                valor_atual: String(valorAtual),
              });
            }
          }
          const endereco = fixedText(pac?.logradouro || pac?.endereco || pacCd.logradouro || pacCd.endereco, 30);
          const complemento = fixedText(pac?.complemento || pacCd.complemento, 10);
          const numero = rpad(limparTexto(pac?.numero || pacCd.numero), 5);
          const bairro = fixedText(pac?.bairro || pacCd.bairro, 30);
          const telefone = fixedDigits(pac?.telefone || pacCd.telefone, 11);
          const email = rpad(
            String(pac?.email || pacCd.email || "")
              .toUpperCase()
              .replace(/[\r\n]/g, " ")
              .slice(0, 40),
            40,
          );
          const ineEquipe = fixedDigits(unidadeCd.ine || pront.custom_data?.ine_equipe || "", 10);

          if (pendenciaPaciente && !formData.exportar_com_pendencias) {
            criticalCount++;
            const motivosTxt = motivosPendencia.length ? motivosPendencia.join(" + ") : "Pendência";
            const apenasSigtap = motivosPendencia.length === 1 && motivosPendencia[0] === "SIGTAP obrigatório ausente";
            const apenasCadastro =
              motivosPendencia.length > 0 && !motivosPendencia.includes("SIGTAP obrigatório ausente");
            const rotulo = apenasSigtap
              ? "Pendência clínica: SIGTAP obrigatório ausente"
              : apenasCadastro
                ? `Pendência cadastral: ${motivosTxt}`
                : `Pendência mista: ${motivosTxt}`;
            details.critical.push({ ...itemDetail, pendencia: rotulo, valor_atual: motivosTxt });
          } else {
            // Novo loop: emite UMA linha BPA-I por SIGTAP encontrado no atendimento.
            // Se a profissão exige SIGTAP e a lista está vazia, nada é emitido
            // (a pendência já foi registrada acima quando exportar_com_pendencias=false).
            const listaParaEmitir =
              codigosParaExportar.length > 0
                ? codigosParaExportar
                : sigtapReq.exige
                  ? []
                  : [{ codigo: somenteNumeros(formData.procedimento_padrao) || "", origem: "Padrão (form)" }];

            for (const procEntry of listaParaEmitir) {
              const proc = zfill(procEntry.codigo, 10);
              const folhaBpa = Math.floor(exportedCount / 20) + 1;
              const sequenciaFolha = (exportedCount % 20) + 1;

              // Montagem do Layout oficial BPA-I: Registro 03 com 338 caracteres antes do CRLF
              let l = "";
              l += "03"; // 001-002 - Tipo Registro
              l += cnes; // 003-009 - CNES
              l += zfill(competencia, 6); // 010-015 - Competência
              l += cns_prof; // 016-030 - CNS Profissional
              l += cbo; // 031-036 - CBO
              l += data_atend; // 037-044 - Data Atendimento
              l += zfill(folhaBpa, 3); // 045-047 - Folha BPA
              l += zfill(sequenciaFolha, 2); // 048-049 - Sequência na folha
              l += proc; // 050-059 - Procedimento SIGTAP
              l += cns_pac; // 060-074 - CNS Paciente
              l += sexo; // 075-075 - Sexo
              l += municipio; // 076-081 - Município IBGE
              l += cid; // 082-085 - CID
              l += idade; // 086-088 - Idade
              l += quantidade; // 089-094 - Quantidade
              l += carater; // 095-096 - Caráter atendimento
              l += autorizacao; // 097-109 - Autorização
              l += "BPA"; // 110-112 - Origem
              l += rpad(nome_pac, 30); // 113-142 - Nome paciente
              l += data_nasc; // 143-150 - Data nascimento
              l += raca; // 151-152 - Raça/cor
              l += etnia; // 153-156 - Etnia
              l += nacionalidade; // 157-159 - Nacionalidade
              l += servico; // 160-162 - Serviço
              l += classificacao; // 163-165 - Classificação
              l += sequenciaEquipe; // 166-173 - Sequência equipe
              l += areaEquipe; // 174-177 - Área equipe
              l += cnpj; // 178-191 - CNPJ
              l += cep; // 192-199 - CEP paciente
              l += codigoLogradouro; // 200-202 - Código logradouro
              l += endereco; // 203-232 - Endereço
              l += complemento; // 233-242 - Complemento
              l += numero; // 243-247 - Número
              l += bairro; // 248-277 - Bairro
              l += telefone; // 278-288 - Telefone
              l += email; // 289-328 - E-mail
              l += ineEquipe; // 329-338 - INE equipe

              l = l.padEnd(BPA_I_RECORD_LENGTH, " ").slice(0, BPA_I_RECORD_LENGTH);

              if (l.length !== BPA_I_RECORD_LENGTH) {
                hasError = true;
                warnings.push(
                  `${ident} (${data_atend}): Erro de tamanho na linha (${l.length}/${BPA_I_RECORD_LENGTH}).`,
                );
              }

              const pacCdAny = (pac?.custom_data as any) || {};
              const rowConf = {
                paciente_nome: String(pac?.nome || pront.paciente_nome || "").toUpperCase(),
                paciente_cns: cns_pac_raw,
                data_nascimento: formatarDataBR(raw_nasc),
                sexo,
                tipo_logradouro: tipoLogradouroTextoBpa(pac),
                logradouro: String(
                  pac?.logradouro || pac?.endereco || pacCdAny.logradouro || pacCdAny.endereco || "",
                ).toUpperCase(),
                numero: String(pac?.numero || pacCdAny.numero || ""),
                bairro: String(pac?.bairro || pacCdAny.bairro || "").toUpperCase(),
                data_atendimento: formatarDataBR(pront.data_atendimento),
                codigo_sigtap:
                  sigtapCodigoExibicao(procEntry.codigo) || procEntry.codigo || formData.procedimento_padrao || "",
                tipo_procedimento: String(procEntry.origem || "").startsWith("Aditivo")
                  ? "Procedimento Aditivo"
                  : "Procedimento Clínico",
                cid_usado: cidExibicao(cidBruto),
                _ctx: {
                  profissional_nome: prof?.nome || "",
                  cns_prof,
                  cbo,
                  unidade_nome: unit?.nome || "",
                  cnes,
                  cpf: primeiroValorPreenchido(pac?.cpf, pacCdAny.cpf) || "",
                  usou_padrao: !procEntry.codigo || procEntry.origem === "Padrão (form)",
                  origem: pront.origem || "Prontuário",
                  origem_sigtap: proc_origem || (sigtapReq.exige ? "—" : "Padrão"),
                  origem_sigtap_real: procEntry.origem,
                  profissao_categoria: sigtapReq.categoria || "",
                },
              };

              linhasProducao.push(l);
              itensControle.push({ procedimento: proc, quantidade });
              exportedCount++;
              confRows.push(rowConf);
            }
          }
        }
      });

      if (hasError) {
        setResults({
          totalFound: prontuarios.length,
          exportedCount: 0,
          warnings,
          criticalCount,
          stats,
          details,
          error:
            "O arquivo não foi gerado porque foram detectadas pendências críticas. Corrija os dados dos pacientes ou marque 'Exportar mesmo com pendências'.",
          fileName: "",
          blobUrl: null,
          confRows: [],
          pendRows: [],
          headerPreview: null,
          headerDetails: null,
        });
        setLoading(false);
        return;
      }

      // Geração do Cabeçalho oficial: Registro 01 com 130 caracteres antes do CRLF
      const qtdRegistros = zfill(exportedCount, 6);
      const totalFolhas = Math.max(1, Math.ceil(exportedCount / 20));
      const campoControle = calcularCampoControle(itensControle);
      const unidadeHeader =
        formData.unidade_id !== "all" ? unidades.find((u) => u.id === formData.unidade_id) : unidades[0];
      const unidadeHeaderCd = (unidadeHeader?.custom_data as any) || {};
      const header = buildHeaderOficial({
        competencia: formData.competencia,
        totalRegistros: exportedCount,
        totalFolhas,
        campoControle,
        orgaoOrigem: unidadeHeader?.nome || "SECRETARIA MUNICIPAL DE SAUDE",
        siglaOrigem: unidadeHeaderCd.sigla || "SMS",
        documentoOrigem: unidadeHeaderCd.cnpj || unidadeHeader?.cnpj || unidadeHeaderCd.cpf || "",
        orgaoDestino:
          unidadeHeaderCd.orgao_destino_bpa || unidadeHeaderCd.orgao_saude_destino || "SECRETARIA MUNICIPAL DE SAUDE",
        indicadorDestino: unidadeHeaderCd.indicador_destino_bpa || "M",
        versaoSistema: unidadeHeaderCd.versao_bpa || "SMSORIXI",
      });
      const headerBytes = toIsoBytes(header);

      // Arquivo ANSI/ISO-8859-1, sem BOM e com CRLF entre todas as linhas.
      const prodContent = linhasProducao.join("\r\n") + (linhasProducao.length ? "\r\n" : "");
      const prodBytes = toIsoBytes(prodContent);

      const total = new Uint8Array(headerBytes.length + CRLF_BYTES.length + prodBytes.length);
      total.set(headerBytes, 0);
      total.set(CRLF_BYTES, headerBytes.length);
      total.set(prodBytes, headerBytes.length + CRLF_BYTES.length);

      const blob = new Blob([total], { type: "application/octet-stream" });
      const url = URL.createObjectURL(blob);
      const fileName = `PA${formData.competencia}.TXT`;

      console.log("[BPA] Header len bytes:", headerBytes.length);
      console.log("[BPA] Header HEX (50):", bytesToHex(Array.from(headerBytes).slice(0, 50)));
      console.log("[BPA] Header texto:", header);

      // Consolidar pendências por registro (Pendências tab)
      const pendMap = new Map<string, any>();
      const pushPend = (item: any, motivo: string) => {
        const key = item.id || `${item.paciente_nome}-${item.data_atendimento}`;
        const cur = pendMap.get(key) || { ...item, pendencias: [] as string[] };
        if (!cur.pendencias.includes(motivo)) cur.pendencias.push(motivo);
        pendMap.set(key, cur);
      };
      const pendCats: Array<[string, string]> = [
        ["missingCns", "CNS paciente ausente"],
        ["missingSexo", "Sexo ausente"],
        ["invalidNascimento", "Data nascimento inválida"],
        ["missingMunicipio", "Município ausente"],
        ["missingCbo", "CBO profissional ausente"],
        ["missingSigtap", "Procedimento SIGTAP ausente"],
        ["missingNacionalidade", "Nacionalidade ausente/inválida"],
        ["missingLogradouro", "Código de logradouro ausente"],
        ["defaultProc", "Usando procedimento padrão"],
        ["critical", "Erro crítico"],
      ];
      pendCats.forEach(([k, lbl]) => {
        (details as any)[k]?.forEach((it: any) => pushPend(it, lbl));
      });
      pendRows.push(...Array.from(pendMap.values()));

      setResults({
        totalFound: prontuarios.length,
        exportedCount,
        warnings,
        criticalCount,
        stats,
        details,
        error: null,
        fileName,
        blobUrl: url,
        confRows,
        pendRows,
        headerPreview: header,
        headerDetails: {
          tipo: header.substring(0, 2),
          identificacao: header.substring(2, 7),
          competencia: formData.competencia,
          registros: qtdRegistros,
          totalFolhas: zfill(totalFolhas, 6),
          campoControle,
          tamanho: header.length,
          recordLength: BPA_I_RECORD_LENGTH,
          headerHex: bytesToHex(Array.from(headerBytes).slice(0, 16)),
          crlf: true,
          bom: false,
          firstRecordPreview: linhasProducao[0] || "",
          firstRecordLength: linhasProducao[0]?.length || 0,
        },
      });

      toast.success("Exportação processada!");
    } catch (err: any) {
      console.error(err);
      setResults({
        totalFound: 0,
        exportedCount: 0,
        warnings: [],
        criticalCount: 0,
        stats,
        details,
        error: err.message || "Erro ao processar dados.",
        fileName: "",
        blobUrl: null,
        confRows: [],
        pendRows: [],
        headerPreview: null,
        headerDetails: null,
      });
    } finally {
      setLoading(false);
    }
  };

  // Abre a tela de correção em outra aba sem alterar nenhuma regra do TXT.
  const abrirPaginaParaCorrecao = (url: string) => {
    correcaoAbertaRef.current = {
      aberta: true,
      categoria: selectedCategory,
      scrollY: window.scrollY,
    };

    const novaAba = window.open(url, "_blank");
    if (!novaAba) {
      correcaoAbertaRef.current.aberta = false;
      toast.error("O navegador bloqueou a nova aba. Libere pop-ups para este sistema.");
      return;
    }

    novaAba.opener = null;
    toast.info("Faça a correção na nova aba. Ao retornar, a análise será atualizada.");
  };

  // Quando esta aba voltar a ficar visível, consulta novamente os dados e
  // restaura a categoria e a posição onde o usuário estava trabalhando.
  useEffect(() => {
    const atualizarAoRetornar = () => {
      const contexto = correcaoAbertaRef.current;
      if (!contexto.aberta || document.visibilityState !== "visible") return;

      correcaoAbertaRef.current.aberta = false;
      const categoriaAnterior = contexto.categoria;
      const posicaoAnterior = contexto.scrollY;

      void handleGerar().finally(() => {
        setSelectedCategory(categoriaAnterior);
        window.requestAnimationFrame(() => {
          window.scrollTo({ top: posicaoAnterior, behavior: "auto" });
        });
      });
    };

    document.addEventListener("visibilitychange", atualizarAoRetornar);
    return () => document.removeEventListener("visibilitychange", atualizarAoRetornar);
  }, [formData.competencia, formData.unidade_id, formData.profissional_id]);

  // ============ Excel & Impressão (Conferência BPA-I) ============
  const obterContextoCabecalho = () => {
    const unid =
      formData.unidade_id !== "all"
        ? unidades.find((u) => u.id === formData.unidade_id)
        : results?.confRows?.[0]?._ctx
          ? { nome: results.confRows[0]._ctx.unidade_nome, custom_data: { cnes: results.confRows[0]._ctx.cnes } }
          : unidades[0];
    const prof =
      formData.profissional_id !== "all" ? profissionais.find((p) => p.id === formData.profissional_id) : null;
    const cd: any = unid?.custom_data || {};
    const competencia = formData.competencia
      ? `${formData.competencia.slice(4, 6)}/${formData.competencia.slice(0, 4)}`
      : "";
    return {
      unidade_nome: (unid?.nome || results?.confRows?.[0]?._ctx?.unidade_nome || "—").toUpperCase(),
      cnes: cd.cnes || (unid as any)?.cnes || results?.confRows?.[0]?._ctx?.cnes || "",
      competencia,
      profissional_nome: (prof?.nome || (formData.profissional_id === "all" ? "TODOS" : "—")).toUpperCase(),
      cns_prof: prof?.cns || (prof?.custom_data as any)?.cns || formData.cns_profissional || "",
      cbo: obterCboValido(prof) || formData.cbo || "",
    };
  };

  const handleBaixarExcel = () => {
    if (!results || !results.confRows.length) {
      toast.error("Gere a exportação BPA-I antes de baixar o Excel.");
      return;
    }
    try {
      const ctx = obterContextoCabecalho();
      const wb = XLSX.utils.book_new();

      // Ordenação alfabética estável
      const confSorted = [...results.confRows].sort(cmpAlfa);
      const pendSorted = [...results.pendRows].sort(cmpAlfa);

      // Aba BPA-I com cabeçalho institucional
      const headerLines = [
        ["SECRETARIA MUNICIPAL DE SAÚDE DE ORIXIMINÁ"],
        ["CONFERÊNCIA BPA-I (Boletim de Produção Ambulatorial Individualizado)"],
        [`UNIDADE DE SAÚDE: ${ctx.unidade_nome}    CNES: ${ctx.cnes}`],
        [`MÊS DE REFERÊNCIA: ${ctx.competencia}`],
        [`PROFISSIONAL: ${ctx.profissional_nome}    CNS: ${ctx.cns_prof}    CBO: ${ctx.cbo}`],
        [`Gerado em ${new Date().toLocaleString("pt-BR")} por ${user?.nome || user?.usuario || "—"}`],
        [],
      ];
      const cols = [
        "paciente_nome",
        "paciente_cns",
        "data_nascimento",
        "sexo",
        "tipo_logradouro",
        "logradouro",
        "numero",
        "bairro",
        "data_atendimento",
        "codigo_sigtap",
        "tipo_procedimento",
        "origem_sigtap",
        "cid_usado",
      ];
      const colsLabels = [
        "PACIENTE",
        "CNS",
        "NASCIMENTO",
        "SEXO",
        "TIPO LOG.",
        "LOGRADOURO",
        "Nº",
        "BAIRRO",
        "ATENDIMENTO",
        "SIGTAP",
        "TIPO",
        "ORIGEM SIGTAP",
        "CID",
      ];
      const dataRows = confSorted.map((r) =>
        cols.map((c) => {
          if (c === "origem_sigtap") {
            return formatarOrigemSigtap((r as any)?.codigo_sigtap, (r as any)?._ctx?.origem_sigtap);
          }
          const v = (r as any)[c] ?? "";
          if (c === "paciente_nome" || c === "logradouro" || c === "bairro" || c === "tipo_logradouro") {
            return String(v).toUpperCase();
          }
          return v;
        }),
      );
      const headerRowIdx = headerLines.length; // índice (0-based) da linha do cabeçalho de colunas
      const aoa = [...headerLines, colsLabels, ...dataRows];
      const ws = XLSX.utils.aoa_to_sheet(aoa);
      // Largura
      ws["!cols"] = [
        { wch: 34 },
        { wch: 18 },
        { wch: 12 },
        { wch: 6 },
        { wch: 12 },
        { wch: 30 },
        { wch: 6 },
        { wch: 20 },
        { wch: 12 },
        { wch: 12 },
        { wch: 18 },
        { wch: 14 },
        { wch: 10 },
      ];
      // Mesclar as linhas institucionais para visual mais limpo
      (ws as any)["!merges"] = headerLines.slice(0, -1).map((_, i) => ({
        s: { c: 0, r: i },
        e: { c: cols.length - 1, r: i },
      }));
      // Congelar abaixo do cabeçalho de colunas
      (ws as any)["!freeze"] = { xSplit: 0, ySplit: headerRowIdx + 1 };
      (ws as any)["!autofilter"] = {
        ref: XLSX.utils.encode_range({
          s: { c: 0, r: headerRowIdx },
          e: { c: cols.length - 1, r: headerRowIdx + dataRows.length },
        }),
      };
      // Estilo cabeçalho institucional
      headerLines.forEach((_, r) => {
        const cell = ws[XLSX.utils.encode_cell({ c: 0, r })];
        if (cell) {
          (cell as any).s = {
            font: { bold: r === 0, sz: r === 0 ? 14 : 10, color: { rgb: r === 0 ? "FFFFFF" : "000000" } },
            fill: r === 0 ? { fgColor: { rgb: "2A6F97" } } : { fgColor: { rgb: "F2F6F9" } },
            alignment: { horizontal: r === 0 ? "center" : "left", vertical: "center" },
          };
        }
      });
      // Estilo cabeçalho de coluna
      colsLabels.forEach((_, i) => {
        const cell = ws[XLSX.utils.encode_cell({ c: i, r: headerRowIdx })];
        if (cell) {
          (cell as any).s = {
            font: { bold: true, color: { rgb: "FFFFFF" } },
            fill: { fgColor: { rgb: "2A6F97" } },
            alignment: { wrapText: true, horizontal: "center", vertical: "center" },
          };
        }
      });
      // Página A4 paisagem + repetir cabeçalho
      (ws as any)["!pageSetup"] = { orientation: "landscape", paperSize: 9, fitToWidth: 1, fitToHeight: 0 };
      (ws as any)["!printHeader"] = `${headerRowIdx + 1}:${headerRowIdx + 1}`;
      XLSX.utils.book_append_sheet(wb, ws, "BPA-I");

      // Aba Pendências (ordem alfabética)
      const pendHead = [
        "SEQ",
        "PACIENTE",
        "CNS",
        "CPF",
        "PROFISSIONAL",
        "PROFISSÃO",
        "CBO",
        "SIGTAP",
        "ORIGEM SIGTAP",
        "FONTES CONSULTADAS",
        "DATA",
        "PENDÊNCIAS",
      ];
      const pendData = pendSorted.map((p: any, i: number) => [
        i + 1,
        String(p.paciente_nome || "").toUpperCase(),
        p.cns_paciente || "",
        p.paciente_cpf || "",
        String(p.profissional_nome || "").toUpperCase(),
        String(p.profissao || "—").toUpperCase(),
        p.cbo || "",
        sigtapCodigoExibicao(p.codigo_sigtap ?? p.procedimento) || "—",
        formatarOrigemSigtap(p.codigo_sigtap ?? p.procedimento, p.origem_sigtap),
        String(p.fontes_consultadas || "—"),
        formatarDataBR(p.data_atendimento),
        (p.pendencias || [p.pendencia || ""]).join("; "),
      ]);
      const wsP = XLSX.utils.aoa_to_sheet([pendHead, ...pendData]);
      wsP["!cols"] = [
        { wch: 5 },
        { wch: 32 },
        { wch: 18 },
        { wch: 14 },
        { wch: 30 },
        { wch: 8 },
        { wch: 14 },
        { wch: 12 },
        { wch: 12 },
        { wch: 12 },
        { wch: 60 },
      ];
      (wsP as any)["!freeze"] = { xSplit: 0, ySplit: 1 };
      (wsP as any)["!autofilter"] = {
        ref: XLSX.utils.encode_range({ s: { c: 0, r: 0 }, e: { c: pendHead.length - 1, r: pendData.length } }),
      };
      pendHead.forEach((_, i) => {
        const cell = wsP[XLSX.utils.encode_cell({ c: i, r: 0 })];
        if (cell)
          (cell as any).s = {
            font: { bold: true, color: { rgb: "FFFFFF" } },
            fill: { fgColor: { rgb: "B91C1C" } },
            alignment: { wrapText: true, horizontal: "center", vertical: "center" },
          };
      });
      // Quebra de texto nas pendências
      pendData.forEach((_, r) => {
        const cell = wsP[XLSX.utils.encode_cell({ c: 10, r: r + 1 })];
        if (cell) (cell as any).s = { alignment: { wrapText: true, vertical: "top" } };
      });
      XLSX.utils.book_append_sheet(wb, wsP, "Pendências");

      // Aba Resumo
      const porProf = new Map<string, number>();
      const porProc = new Map<string, number>();
      const porUnid = new Map<string, number>();
      confSorted.forEach((r: any) => {
        porProf.set(r._ctx?.profissional_nome || "—", (porProf.get(r._ctx?.profissional_nome || "—") || 0) + 1);
        porProc.set(r.codigo_sigtap || "—", (porProc.get(r.codigo_sigtap || "—") || 0) + 1);
        porUnid.set(r._ctx?.unidade_nome || "—", (porUnid.get(r._ctx?.unidade_nome || "—") || 0) + 1);
      });
      const resumo: any[][] = [
        ["RESUMO DA PRODUÇÃO BPA-I"],
        [],
        ["MÉTRICAS GERAIS", ""],
        ["Competência", ctx.competencia],
        ["Unidade", ctx.unidade_nome],
        ["Profissional", ctx.profissional_nome],
        ["Data de geração", new Date().toLocaleString("pt-BR")],
        ["Total de linhas encontradas", results.totalFound],
        ["Válidas (exportadas)", results.exportedCount],
        ["Pendentes", results.pendRows.length],
        ["Fonte Prontuário", results.confRows.length],
        ["Fonte PTS", 0],
        [],
        ["POR PROFISSIONAL", "QTD"],
        ...Array.from(porProf.entries()).sort((a, b) => a[0].localeCompare(b[0], "pt-BR")),
        [],
        ["POR PROCEDIMENTO SIGTAP", "QTD"],
        ...Array.from(porProc.entries()).sort((a, b) => a[0].localeCompare(b[0])),
        [],
        ["POR UNIDADE", "QTD"],
        ...Array.from(porUnid.entries()).sort((a, b) => a[0].localeCompare(b[0], "pt-BR")),
      ];
      const wsR = XLSX.utils.aoa_to_sheet(resumo);
      wsR["!cols"] = [{ wch: 40 }, { wch: 40 }];
      (wsR as any)["!merges"] = [{ s: { c: 0, r: 0 }, e: { c: 1, r: 0 } }];
      // Destacar títulos de seção
      [0, 2, 13, 13 + porProf.size + 2, 13 + porProf.size + 2 + porProc.size + 2].forEach((r) => {
        [0, 1].forEach((c) => {
          const cell = wsR[XLSX.utils.encode_cell({ c, r })];
          if (cell)
            (cell as any).s = {
              font: { bold: true, color: { rgb: "FFFFFF" } },
              fill: { fgColor: { rgb: "2A6F97" } },
              alignment: { horizontal: c === 0 ? "left" : "center" },
            };
        });
      });
      XLSX.utils.book_append_sheet(wb, wsR, "Resumo");

      const sufixo =
        formData.profissional_id !== "all"
          ? ctx.profissional_nome.split(" ").slice(0, 2).join("-") || "PROF"
          : ctx.unidade_nome.split(" ").slice(0, 2).join("-") || "UNID";
      const fname = `BPA-I_${formData.competencia}_${sufixo}.xlsx`.replace(/\s+/g, "_");
      XLSX.writeFile(wb, fname);
      toast.success("Planilha gerada.");
    } catch (e: any) {
      console.error(e);
      toast.error("Falha ao gerar Excel: " + (e.message || e));
    }
  };

  const handleImprimirConferencia = async () => {
    if (!results || !results.confRows.length) {
      toast.error("Gere a exportação BPA-I antes de imprimir.");
      return;
    }
    try {
      const ctx = obterContextoCabecalho();
      const esc = (s: any) =>
        String(s ?? "").replace(/[&<>]/g, (c) => (({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }) as any)[c]);
      const confSorted = [...results.confRows].sort(cmpAlfa);
      const rowsHtml = confSorted
        .map(
          (r: any) => `
        <tr>
          <td class="nome">${esc(String(r.paciente_nome || "").toUpperCase())}</td>
          <td>${esc(r.paciente_cns)}</td>
          <td class="c">${esc(r.data_nascimento)}</td>
          <td class="c">${esc(r.sexo)}</td>
          <td class="c">${esc(r.tipo_logradouro)}</td>
          <td>${esc(String(r.logradouro || "").toUpperCase())}</td>
          <td class="c">${esc(r.numero)}</td>
          <td>${esc(String(r.bairro || "").toUpperCase())}</td>
          <td class="c">${esc(r.data_atendimento)}</td>
          <td class="c">${esc(sigtapCodigoExibicao(r.codigo_sigtap) || r.codigo_sigtap || "—")}</td>
          <td class="c">${esc(formatarOrigemSigtap(r.codigo_sigtap, r?._ctx?.origem_sigtap))}</td>
          <td class="c">${esc(cidExibicao(r.cid_usado))}</td>
        </tr>`,
        )
        .join("");

      // Bloco visual com metadados — fica ENTRE o cabeçalho institucional e a tabela.
      // Não é position:fixed, portanto não sobrepõe o conteúdo.
      const respo = esc(user?.nome || user?.usuario || "—");
      const body = `
<style>
  /* Sobrescreve o @page do shell institucional para paisagem */
  @page { size: A4 landscape; }
  .bpa-meta {
    margin: 0 0 10px;
    padding: 6px 10px;
    border: 1px solid #D6E2EC;
    background: #F2F6F9;
    border-radius: 4px;
    font-size: 9pt;
    line-height: 1.35;
    color: #1f2937;
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 2px 16px;
  }
  .bpa-meta b { color: #0c4a6e; }
  .bpa-meta .full { grid-column: 1 / -1; }
  .bpa-table { width: 100%; border-collapse: collapse; table-layout: fixed; margin-top: 4px; }
  .bpa-table thead { display: table-header-group; }
  .bpa-table th, .bpa-table td {
    border: 1px solid #555;
    padding: 3px 4px;
    font-size: 8.5pt;
    word-wrap: break-word;
    overflow-wrap: anywhere;
    vertical-align: top;
  }
  .bpa-table th { background:#2A6F97; color:#fff; font-weight: 700; text-align:center; }
  .bpa-table td.c { text-align:center; }
  .bpa-table td.nome { font-weight: 600; }
  .bpa-table tbody tr:nth-child(even) td { background:#f5f7fa; }
</style>
<div class="bpa-meta">
  <div><b>Unidade:</b> ${esc(ctx.unidade_nome)}</div>
  <div><b>CNES:</b> ${esc(ctx.cnes || "—")}</div>
  <div><b>Competência:</b> ${esc(ctx.competencia)}</div>
  <div><b>Profissional:</b> ${esc(ctx.profissional_nome)}</div>
  <div><b>CNS:</b> ${esc(ctx.cns_prof || "—")}</div>
  <div><b>CBO:</b> ${esc(ctx.cbo || "—")}</div>
  <div><b>Total de registros:</b> ${confSorted.length}</div>
  <div><b>Responsável pela geração:</b> ${respo}</div>
  <div class="full"><b>Gerado em:</b> ${new Date().toLocaleString("pt-BR")}</div>
</div>
<table class="bpa-table">
  <colgroup>
    <col style="width:17%"/><col style="width:10%"/><col style="width:6%"/><col style="width:4%"/>
    <col style="width:6%"/><col style="width:16%"/><col style="width:4%"/><col style="width:10%"/>
    <col style="width:7%"/><col style="width:7%"/><col style="width:8%"/><col style="width:5%"/>
  </colgroup>
  <thead><tr>
    <th>Paciente</th><th>CNS</th><th>Nasc.</th><th>Sexo</th>
    <th>Tipo Log.</th><th>Logradouro</th><th>Nº</th><th>Bairro</th>
    <th>Atendimento</th><th>SIGTAP</th><th>Origem SIGTAP</th><th>CID</th>
  </tr></thead>
  <tbody>${rowsHtml}</tbody>
</table>`;

      const config = await loadDocumentConfig();
      const title = `Conferência BPA-I — Competência ${ctx.competencia}`;
      const html = buildDocumentShell(title, body, config);
      printViaIframe(html);
    } catch (e: any) {
      console.error(e);
      toast.error("Falha ao gerar impressão: " + (e?.message || e));
    }
  };

  return (
    <div className="container mx-auto p-6 space-y-6">
      <div className="flex flex-col gap-2">
        <h1 className="text-3xl font-bold tracking-tight">Exportar BPA-I Real</h1>
        <p className="text-muted-foreground">
          Gere arquivo BPA-I utilizando atendimentos realizados e dados cadastrais do sistema.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Filtros e Configurações</CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            <div className="space-y-2">
              <Label htmlFor="competencia">Competência (AAAAMM) *</Label>
              <Input
                id="competencia"
                name="competencia"
                placeholder="202605"
                value={formData.competencia}
                onChange={handleChange}
                maxLength={6}
              />
            </div>

            <div className="space-y-2">
              <Label>Unidade</Label>
              <Select onValueChange={handleUnidadeChange} value={formData.unidade_id}>
                <SelectTrigger>
                  <SelectValue placeholder="Selecione a unidade" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todas as Unidades</SelectItem>
                  {unidades.map((u) => (
                    <SelectItem key={u.id} value={u.id}>
                      {u.nome}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Profissional</Label>
              <Select
                onValueChange={handleProfissionalChange}
                value={formData.profissional_id}
                disabled={
                  loadingProfissionais ||
                  somenteNumeros(formData.competencia).length !== 6 ||
                  profissionais.length === 0
                }
              >
                <SelectTrigger>
                  <SelectValue
                    placeholder={
                      loadingProfissionais
                        ? "Carregando profissionais..."
                        : somenteNumeros(formData.competencia).length !== 6
                          ? "Informe a competência"
                          : "Nenhum profissional com atendimento"
                    }
                  />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos com atendimento</SelectItem>
                  {profissionais.map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.nome}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 pt-4 border-t">
            <div className="space-y-2">
              <Label htmlFor="cnes">CNES (Fallback)</Label>
              <Input id="cnes" name="cnes" value={formData.cnes} onChange={handleChange} maxLength={7} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="cns_profissional">CNS Profissional (Fallback)</Label>
              <Input
                id="cns_profissional"
                name="cns_profissional"
                value={formData.cns_profissional}
                onChange={handleChange}
                maxLength={15}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="cbo">CBO (Fallback)</Label>
              <Input id="cbo" name="cbo" value={formData.cbo} onChange={handleChange} maxLength={6} />
            </div>
            <div className="space-y-2 md:col-span-2 lg:col-span-3">
              <Label>Procedimentos Padrão</Label>
              <p className="text-xs text-muted-foreground">
                Lista de SIGTAPs usada quando a profissão NÃO exige SIGTAP e o prontuário não traz código. Cada código gera 1 linha BPA-I.
              </p>
              <div className="space-y-2">
                {procedimentosPadraoList.map((cod, idx) => (
                  <div key={`pad-${idx}`} className="flex items-center gap-2">
                    <Input
                      value={cod}
                      maxLength={10}
                      onChange={(e) => {
                        const v = e.target.value.replace(/\D/g, "").slice(0, 10);
                        setProcedimentosPadraoList((prev) => prev.map((p, i) => (i === idx ? v : p)));
                      }}
                      placeholder="0000000000"
                      className="font-mono max-w-[200px]"
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      onClick={() => setProcedimentosPadraoList((prev) => prev.filter((_, i) => i !== idx))}
                      aria-label="Remover"
                    >
                      <Trash2 className="h-4 w-4 text-red-500" />
                    </Button>
                  </div>
                ))}
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setProcedimentosPadraoList((prev) => [...prev, ""])}
                >
                  <Plus className="h-4 w-4 mr-1" /> Adicionar Procedimento
                </Button>
              </div>
            </div>
            <div className="space-y-2 md:col-span-2 lg:col-span-3">
              <Label>Procedimentos Padrão (Técnico de Enfermagem · CBO 322205)</Label>
              <p className="text-xs text-muted-foreground">
                Quando o profissional for Técnico de Enfermagem (CBO 322205), o sistema gera 1 linha BPA-I para cada procedimento desta lista.
              </p>
              <div className="space-y-2">
                {procedimentosTecnicoEnfList.map((cod, idx) => (
                  <div key={`tec-${idx}`} className="flex items-center gap-2">
                    <Input
                      value={cod}
                      maxLength={10}
                      onChange={(e) => {
                        const v = e.target.value.replace(/\D/g, "").slice(0, 10);
                        setProcedimentosTecnicoEnfList((prev) => prev.map((p, i) => (i === idx ? v : p)));
                      }}
                      placeholder="0000000000"
                      className="font-mono max-w-[200px]"
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      onClick={() => setProcedimentosTecnicoEnfList((prev) => prev.filter((_, i) => i !== idx))}
                      aria-label="Remover"
                    >
                      <Trash2 className="h-4 w-4 text-red-500" />
                    </Button>
                  </div>
                ))}
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setProcedimentosTecnicoEnfList((prev) => [...prev, ""])}
                >
                  <Plus className="h-4 w-4 mr-1" /> Adicionar Procedimento
                </Button>
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="municipio_padrao">Município Padrão (IBGE)</Label>
              <Input
                id="municipio_padrao"
                name="municipio_padrao"
                value={formData.municipio_padrao}
                onChange={handleChange}
                maxLength={6}
              />
            </div>
          </div>

          <div className="flex flex-col gap-4 mt-8">
            <div className="flex items-center space-x-2 border p-3 rounded-md bg-slate-50">
              <input
                type="checkbox"
                id="exportar_com_pendencias"
                checked={formData.exportar_com_pendencias}
                onChange={(e) => setFormData((prev) => ({ ...prev, exportar_com_pendencias: e.target.checked }))}
                className="h-4 w-4 rounded border-gray-300 text-primary focus:ring-primary"
              />
              <div className="grid gap-1.5 leading-none">
                <label
                  htmlFor="exportar_com_pendencias"
                  className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
                >
                  Exportar mesmo com pendências críticas
                </label>
                <p className="text-xs text-muted-foreground">
                  Marque esta opção para permitir o download mesmo que existam dados obrigatórios faltando (CNS, Sexo,
                  Nascimento, Município).
                </p>
            </div>

            <div className="flex items-center space-x-2 border p-3 rounded-md bg-amber-50/40">
              <input
                type="checkbox"
                id="incluir_agenda_sem_prontuario"
                checked={formData.incluir_agenda_sem_prontuario}
                onChange={(e) =>
                  setFormData((prev) => ({ ...prev, incluir_agenda_sem_prontuario: e.target.checked }))
                }
                className="h-4 w-4 rounded border-gray-300 text-primary focus:ring-primary"
              />
              <div className="grid gap-1.5 leading-none">
                <label htmlFor="incluir_agenda_sem_prontuario" className="text-sm font-medium leading-none">
                  Incluir pacientes da Agenda sem prontuário
                </label>
                <p className="text-xs text-muted-foreground">
                  Localiza atendimentos com presença confirmada que não possuem prontuário/PTS e permite cadastrar
                  SIGTAP/CID manualmente (origem: AGENDA_SEM_PRONTUARIO). Produções manuais já salvas sempre
                  são reaproveitadas automaticamente nas próximas exportações.
                </p>
              </div>
            </div>

            </div>

            <div className="flex gap-4">
              <Button onClick={handleGerar} disabled={loading || loadingData} className="px-8">
                {loading ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Gerando...
                  </>
                ) : (
                  "Gerar Arquivo BPA-I"
                )}
              </Button>
              <Button variant="outline" onClick={handleLimpar} disabled={loading}>
                Limpar Filtros
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {results && (
        <div className="space-y-6 animate-in fade-in slide-in-from-top-4 duration-300">
          {results.headerDetails && (
            <Card className="border-blue-200 bg-blue-50/30">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4 text-blue-600" />
                  Diagnóstico Técnico do Cabeçalho (Registro 01)
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
                  <div className="flex flex-col">
                    <span className="text-[10px] uppercase text-muted-foreground">Tipo</span>
                    <span className="font-mono text-sm">{results.headerDetails.tipo}</span>
                  </div>
                  <div className="flex flex-col">
                    <span className="text-[10px] uppercase text-muted-foreground">Identificação</span>
                    <span className="font-mono text-sm">{results.headerDetails.identificacao}</span>
                  </div>
                  <div className="flex flex-col">
                    <span className="text-[10px] uppercase text-muted-foreground">Registros</span>
                    <span className="font-mono text-sm">{results.headerDetails.registros}</span>
                  </div>
                  <div className="flex flex-col">
                    <span className="text-[10px] uppercase text-muted-foreground">Folhas</span>
                    <span className="font-mono text-sm">{results.headerDetails.totalFolhas}</span>
                  </div>
                  <div className="flex flex-col">
                    <span className="text-[10px] uppercase text-muted-foreground">Competência</span>
                    <span className="font-mono text-sm">{results.headerDetails.competencia}</span>
                  </div>
                  <div className="flex flex-col">
                    <span className="text-[10px] uppercase text-muted-foreground">Controle</span>
                    <span className="font-mono text-sm">{results.headerDetails.campoControle}</span>
                  </div>
                </div>
                <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
                  <div className="flex flex-col">
                    <span className="text-[10px] uppercase text-muted-foreground">Cabeçalho sem CRLF</span>
                    <span className="font-mono text-sm">{results.headerDetails.tamanho}</span>
                  </div>
                  <div className="flex flex-col">
                    <span className="text-[10px] uppercase text-muted-foreground">Registro sem CRLF</span>
                    <span className="font-mono text-sm">{results.headerDetails.firstRecordLength}</span>
                  </div>
                  <div className="flex flex-col">
                    <span className="text-[10px] uppercase text-muted-foreground">CRLF</span>
                    <span className="font-mono text-sm">{results.headerDetails.crlf ? "SIM" : "NÃO"}</span>
                  </div>
                  <div className="flex flex-col">
                    <span className="text-[10px] uppercase text-muted-foreground">BOM</span>
                    <span className="font-mono text-sm">{results.headerDetails.bom ? "SIM" : "NÃO"}</span>
                  </div>
                  <div className="flex flex-col">
                    <span className="text-[10px] uppercase text-muted-foreground">Início Registro</span>
                    <span className="font-mono text-sm">{results.headerDetails.firstRecordPreview.slice(0, 2)}</span>
                  </div>
                </div>

                <div className="space-y-1">
                  <span className="text-[10px] uppercase text-muted-foreground">
                    Cabeçalho completo (ANSI / 130 caracteres sem CRLF)
                  </span>
                  <div className="bg-slate-900 text-slate-50 p-3 rounded font-mono text-[10px] break-all whitespace-pre overflow-x-auto">
                    {results.headerPreview}
                  </div>
                  <div className="flex flex-col md:flex-row md:justify-between gap-1 text-[10px] text-muted-foreground">
                    <span>Tamanho real: {results.headerDetails.tamanho} caracteres</span>
                    <span>Primeiros bytes (HEX): {results.headerDetails.headerHex}</span>
                    <span>Encoding: ISO-8859-1 (Sem BOM)</span>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 xl:grid-cols-8 gap-4">
            <Card className="bg-blue-50">
              <CardContent className="p-4 text-center">
                <div className="text-xl font-bold">{results.totalFound}</div>
                <div className="text-xs text-blue-600">Registros</div>
              </CardContent>
            </Card>

            {[
              { id: "all", label: "Todos os Registros", count: results.stats.all, color: "slate" },
              { id: "critical", label: "Pendên. Críticas", count: results.criticalCount, color: "red" },
              { id: "missingCns", label: "Sem CNS Pac.", count: results.stats.missingCns, color: "amber" },

              { id: "missingSexo", label: "Sexo Indef.", count: results.stats.missingSexo, color: "amber" },
              {
                id: "invalidNascimento",
                label: "Nascimento Inv.",
                count: results.stats.invalidNascimento,
                color: "amber",
              },
              { id: "missingMunicipio", label: "Mun. Inválido", count: results.stats.missingMunicipio, color: "amber" },
              {
                id: "missingNacionalidade",
                label: "Sem Nacionalidade",
                count: results.stats.missingNacionalidade,
                color: "amber",
              },
              {
                id: "missingLogradouro",
                label: "Cód. Logradouro",
                count: results.stats.missingLogradouro,
                color: "amber",
              },
              { id: "missingSigtap", label: "SIGTAP Obrigatório", count: results.stats.missingSigtap, color: "red" },
              { id: "missingCbo", label: "Sem CBO Prof.", count: results.stats.missingCbo, color: "amber" },
              { id: "inferredSexo", label: "Sexo Inferido", count: results.stats.inferredSexo, color: "blue" },
              { id: "fallbackCbo", label: "CBO Fallback", count: results.stats.fallbackCbo, color: "blue" },
              {
                id: "autoCorrected",
                label: "Correções Automáticas",
                count: results.stats.autoCorrected,
                color: "emerald",
              },
            ].map((stat) => (
              <Card
                key={stat.id}
                className={`cursor-pointer transition-all hover:ring-2 hover:ring-primary/50 ${
                  selectedCategory === stat.id
                    ? "ring-2 ring-primary bg-white shadow-md"
                    : stat.count > 0
                      ? `bg-${stat.color}-50`
                      : "bg-green-50"
                }`}
                onClick={() => setSelectedCategory(selectedCategory === stat.id ? null : stat.id)}
              >
                <CardContent className="p-4 text-center">
                  <div className="text-xl font-bold">{stat.count}</div>
                  <div className={`text-xs text-${stat.color === "slate" ? "slate-600" : stat.color + "-700"}`}>
                    {stat.label}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>

          {selectedCategory && results.details[selectedCategory as keyof typeof results.details] && (
            <Card className="animate-in slide-in-from-top-2 duration-200 border-primary/20">
              <CardHeader className="pb-2 flex flex-row items-center justify-between">
                <div>
                  <CardTitle className="text-lg flex items-center gap-2">
                    Detalhes da pendência:{" "}
                    {selectedCategory === "critical"
                      ? "Pendências Críticas (Bloqueantes)"
                      : selectedCategory === "missingCns"
                        ? "Sem CNS Paciente"
                        : selectedCategory === "missingSexo"
                          ? "Sexo Indefinido"
                          : selectedCategory === "inferredSexo"
                            ? "Sexo Inferido pelo Nome"
                            : selectedCategory === "missingCbo"
                              ? "Sem CBO Profissional"
                              : selectedCategory === "fallbackCbo"
                                ? "CBO Fallback Informado"
                                : selectedCategory === "invalidCbo"
                                  ? "CBO Inválido"
                                  : selectedCategory === "defaultProc"
                                    ? "Procedimento Padrão Utilizado"
                                    : selectedCategory === "invalidNascimento"
                                      ? "Data de Nascimento Inválida"
                                      : selectedCategory === "missingNacionalidade"
                                        ? "Nacionalidade Ausente ou Sem Código Oficial"
                                        : selectedCategory === "missingLogradouro"
                                          ? "Código do Logradouro Indeterminado"
                                          : selectedCategory === "missingSigtap"
                                            ? "Procedimento SIGTAP Obrigatório Ausente"
                                            : selectedCategory === "missingMunicipio"
                                              ? "Município Inválido ou Ausente"
                                              : selectedCategory === "autoCorrected"
                                                ? "Correções Automáticas Aplicadas (CNS / CEP / Município / Raça-Cor)"
                                                : ""}
                  </CardTitle>
                  <p className="text-sm text-muted-foreground mt-1">
                    Mostrando {results.details[selectedCategory as keyof typeof results.details].length} registros
                    afetados.
                  </p>
                </div>
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-8"
                    onClick={() => {
                      const data = results.details[selectedCategory as keyof typeof results.details];
                      const headers = [
                        "Paciente",
                        "CPF",
                        "Nascimento",
                        "Data Atendimento",
                        "Profissional",
                        "Unidade",
                        "Procedimento",
                        "Pendência",
                        "Valor Atual",
                      ];
                      const csvContent = [
                        headers.join(","),
                        ...data.map((item) =>
                          [
                            `"${item.paciente_nome}"`,
                            `"${item.paciente_cpf || ""}"`,
                            `"${item.paciente_nascimento || ""}"`,
                            `"${item.data_atendimento}"`,
                            `"${item.profissional_nome}"`,
                            `"${item.unidade_nome}"`,
                            `"${item.procedimento || ""}"`,
                            `"${item.pendencia}"`,
                            `"${item.valor_atual || ""}"`,
                          ].join(","),
                        ),
                      ].join("\n");

                      const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
                      const url = URL.createObjectURL(blob);
                      const link = document.createElement("a");
                      link.setAttribute("href", url);
                      link.setAttribute("download", `pendencias_${selectedCategory}_${formData.competencia}.csv`);
                      document.body.appendChild(link);
                      link.click();
                      document.body.removeChild(link);
                    }}
                  >
                    <Download className="mr-2 h-4 w-4" />
                    Exportar CSV
                  </Button>
                  <Button size="sm" variant="ghost" className="h-8 w-8 p-0" onClick={() => setSelectedCategory(null)}>
                    <X className="h-4 w-4" />
                  </Button>
                </div>
              </CardHeader>
              <CardContent>
                <div className="rounded-md border overflow-hidden">
                  <Table>
                    <TableHeader className="bg-slate-50">
                      <TableRow>
                        <TableHead>Paciente</TableHead>
                        <TableHead>Data Atendimento</TableHead>
                        <TableHead>Profissional</TableHead>
                        <TableHead>Unidade</TableHead>
                        <TableHead>Pendência / Valor</TableHead>
                        <TableHead className="text-right">Ação</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {results.details[selectedCategory as keyof typeof results.details].map((item, idx) => (
                        <TableRow key={`${item.id}-${idx}`}>
                          <TableCell>
                            <div className="font-medium">{item.paciente_nome}</div>
                            <div className="text-xs text-muted-foreground">
                              {item.paciente_cpf ? `CPF: ${item.paciente_cpf}` : "Sem CPF"} |{" "}
                              {item.paciente_nascimento
                                ? `Nasc: ${formatarDataBR(item.paciente_nascimento)}`
                                : "Sem Nasc."}
                            </div>
                          </TableCell>
                          <TableCell>{formatarDataBR(item.data_atendimento)}</TableCell>
                          <TableCell>
                            <div className="flex flex-col">
                              <span>{item.profissional_nome}</span>
                              <span className="text-xs text-muted-foreground">CBO: {item.cbo || "---"}</span>
                            </div>
                          </TableCell>
                          <TableCell>{item.unidade_nome}</TableCell>
                          <TableCell>
                            <div className="flex flex-col">
                              <span className="text-xs font-semibold uppercase">{item.pendencia}</span>
                              <span className="text-xs text-muted-foreground">{item.valor_atual}</span>
                              {item.sugestao && (
                                <span className="text-xs text-blue-600 italic">Sugestão: {item.sugestao}</span>
                              )}
                            </div>
                          </TableCell>
                          <TableCell className="text-right">
                            <div className="flex justify-end gap-2 flex-wrap">
                              {selectedCategory === "missingSigtap" && item.paciente_id && item.data_atendimento && (
                                <Button
                                  variant="default"
                                  size="sm"
                                  className="h-8"
                                  title="Resolver pendência selecionando um SIGTAP da tabela oficial"
                                  onClick={() =>
                                    setResolverModal({
                                      open: true,
                                       item: {
                                         paciente_id: item.paciente_id,
                                         paciente_nome: item.paciente_nome,
                                         profissional_id: item.profissional_id,
                                         profissional_nome: item.profissional_nome,
                                         profissao: item.profissao,
                                         profissao_categoria: item.profissao_categoria,
                                         data_atendimento: item.data_atendimento,
                                         unidade_id: item.unidade_id,
                                         unidade_nome: item.unidade_nome,
                                         cbo: item.cbo,
                                         competencia: formData.competencia,
                                         origem: (item as any).origem === "AGENDA_SEM_PRONTUARIO"
                                           ? "agenda_sem_prontuario"
                                           : undefined,
                                         agendamento_id: (item as any).agendamento_id || undefined,
                                       },
                                    })
                                  }
                                >
                                  {(item as any).origem === "AGENDA_SEM_PRONTUARIO"
                                    ? "Corrigir Produção (Agenda)"
                                    : "Resolver SIGTAP"}
                                </Button>
                              )}
                              {item.paciente_id && (
                                <Button
                                  variant="outline"
                                  size="icon"
                                  className="h-8 w-8"
                                  title="Ver Paciente"
                                  onClick={() => abrirPaginaParaCorrecao(`/painel/pacientes?id=${item.paciente_id}`)}
                                >
                                  <User className="h-4 w-4" />
                                </Button>
                              )}
                              {item.profissional_id && (
                                <Button
                                  variant="outline"
                                  size="icon"
                                  className="h-8 w-8"
                                  title="Ver Profissional"
                                  onClick={() =>
                                    abrirPaginaParaCorrecao(`/painel/funcionarios?id=${item.profissional_id}`)
                                  }
                                >
                                  <UserCog className="h-4 w-4" />
                                </Button>
                              )}
                            </div>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </CardContent>
            </Card>
          )}

          {results.error ? (
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertTitle>Erro na Geração</AlertTitle>
              <AlertDescription>{results.error}</AlertDescription>
            </Alert>
          ) : (
            <>
              <Alert className="bg-green-50 border-green-200">
                <CheckCircle2 className="h-4 w-4 text-green-600" />
                <AlertTitle className="text-green-800">Processamento Concluído</AlertTitle>
                <AlertDescription className="text-green-700">
                  {results.exportedCount} linhas geradas com sucesso. Verifique os avisos acima antes de baixar.
                </AlertDescription>
              </Alert>

              {results.blobUrl && (
                <Card className="border-primary/30 bg-slate-50">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-base flex items-center gap-2">
                      <CheckCircle2 className="h-4 w-4 text-primary" />
                      Resumo Final da Exportação
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="text-sm space-y-2">
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                      <div>
                        <div className="text-xs text-muted-foreground">Total encontrado</div>
                        <div className="font-bold text-lg">{results.totalFound}</div>
                      </div>
                      <div>
                        <div className="text-xs text-muted-foreground">Exportados no TXT</div>
                        <div className="font-bold text-lg text-green-700">{results.exportedCount}</div>
                      </div>
                      <div>
                        <div className="text-xs text-muted-foreground">Bloqueados</div>
                        <div className="font-bold text-lg text-red-700">{results.criticalCount}</div>
                      </div>
                      <div>
                        <div className="text-xs text-muted-foreground">Folhas no cabeçalho</div>
                        <div className="font-bold text-lg">{results.headerDetails?.totalFolhas}</div>
                      </div>
                    </div>
                    {results.criticalCount > 0 && (
                      <div className="pt-2 border-t text-xs space-y-1">
                        <div className="font-semibold text-red-700">Motivos dos bloqueios:</div>
                        {results.stats.missingNacionalidade > 0 && (
                          <div>
                            • Nacionalidade inválida/ausente: <b>{results.stats.missingNacionalidade}</b>
                          </div>
                        )}
                        {results.stats.missingLogradouro > 0 && (
                          <div>
                            • Código de logradouro indeterminado: <b>{results.stats.missingLogradouro}</b>
                          </div>
                        )}
                        {results.stats.missingSigtap > 0 && (
                          <div>
                            • Procedimento SIGTAP obrigatório (Psicologia/Fono/Fisio/Nutrição) ausente:{" "}
                            <b>{results.stats.missingSigtap}</b>
                          </div>
                        )}
                        {results.stats.missingCns > 0 && (
                          <div>
                            • CNS ausente: <b>{results.stats.missingCns}</b>
                          </div>
                        )}
                        {results.stats.missingSexo > 0 && (
                          <div>
                            • Sexo indefinido: <b>{results.stats.missingSexo}</b>
                          </div>
                        )}
                        {results.stats.invalidNascimento > 0 && (
                          <div>
                            • Nascimento inválido: <b>{results.stats.invalidNascimento}</b>
                          </div>
                        )}
                        {results.stats.missingMunicipio > 0 && (
                          <div>
                            • Município inválido: <b>{results.stats.missingMunicipio}</b>
                          </div>
                        )}
                      </div>
                    )}
                    {results.stats.autoCorrected > 0 && (
                      <div className="pt-2 border-t text-xs space-y-1">
                        <div className="font-semibold text-emerald-700">
                          Correções automáticas aplicadas (auditável):
                        </div>
                        <div>
                          • Total de correções: <b>{results.stats.autoCorrected}</b>
                        </div>
                        <div className="text-muted-foreground">
                          Inclui: substituição de CNS inválido por CNS válido do cadastro, ajuste de Município pelo IBGE
                          do CEP (ViaCEP) e aplicação do padrão Amarelo quando raça/cor estiver ausente ou não
                          declarada. Veja detalhes em "Correções Automáticas" acima.
                        </div>
                      </div>
                    )}
                    <div className="pt-2 border-t text-xs text-muted-foreground">
                      ✓ Cabeçalho declara <b>{results.headerDetails?.registros}</b> registros — confere com{" "}
                      {results.exportedCount} linhas no arquivo. Registros bloqueados <b>não</b> entram no TXT nem na
                      contagem.
                    </div>
                  </CardContent>
                </Card>
              )}

              {results.blobUrl && (
                <div className="flex flex-wrap justify-center gap-3 p-4 bg-white border rounded-lg shadow-sm">
                  <a
                    href={results.blobUrl}
                    download={results.fileName}
                    className="inline-flex items-center justify-center rounded-md text-sm font-medium ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 bg-primary text-primary-foreground hover:bg-primary/90 h-11 px-8"
                  >
                    <Download className="mr-2 h-5 w-5" />
                    Baixar Arquivo {results.fileName}
                  </a>
                  <Button
                    type="button"
                    variant="outline"
                    className="h-11 px-6"
                    onClick={handleBaixarExcel}
                    disabled={!results.confRows?.length}
                  >
                    <FileSpreadsheet className="mr-2 h-5 w-5 text-emerald-600" />
                    Baixar Excel
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    className="h-11 px-6"
                    onClick={handleImprimirConferencia}
                    disabled={!results.confRows?.length}
                  >
                    <Printer className="mr-2 h-5 w-5" />
                    Imprimir Conferência
                  </Button>
                </div>
              )}

              {results.warnings.length > 0 && !selectedCategory && (
                <Card>
                  <CardHeader>
                    <CardTitle className="text-amber-700 flex items-center gap-2">
                      <AlertCircle className="h-5 w-5" />
                      Avisos e Pendências ({results.warnings.length})
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="max-h-60 overflow-y-auto space-y-1 text-sm text-muted-foreground font-mono bg-slate-50 p-4 rounded border">
                      {results.warnings.map((w, i) => (
                        <div key={i} className="border-b border-slate-200 last:border-0 py-1">
                          {w}
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              )}
            </>
          )}
        </div>
      )}

      <BpaResolverSigtapModal
        open={resolverModal.open}
        item={resolverModal.item}
        userId={(user as any)?.id}
        userNome={(user as any)?.nome || (user as any)?.usuario}
        onClose={() => setResolverModal({ open: false, item: null })}
        onResolved={() => {
          // Regenera análise para refletir a correção em tela, TXT, Excel e PDF
          setResolverModal({ open: false, item: null });
          void handleGerar();
        }}
      />
    </div>
  );
};

export default BpaExportar;
