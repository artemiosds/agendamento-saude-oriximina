// Imprime o Laudo APAC usando o template oficial como fundo (1 página A4 portrait)
// e sobrepondo os dados do paciente em posicionamento absoluto.

import { getCodigoIbge } from "@/lib/municipiosIbge";
import apacTemplate from "@/assets/apac-laudo-template.jpg.asset.json";

type AnyPaciente = Record<string, any>;

const esc = (v: any): string => {
  if (v === null || v === undefined) return "";
  return String(v).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
};

const formatDataBR = (iso?: string): string => {
  if (!iso) return "";
  const m = String(iso).match(/^(\d{4})-(\d{2})-(\d{2})/);
  return m ? `${m[3]}/${m[2]}/${m[1]}` : String(iso);
};

const onlyDigits = (v?: string) => (v || "").replace(/\D/g, "");

const splitDDD = (v?: string): { ddd: string; numero: string } => {
  const d = onlyDigits(v);
  if (d.length >= 10) return { ddd: d.slice(0, 2), numero: d.slice(2) };
  return { ddd: "", numero: d };
};

const montaEndereco = (cd: AnyPaciente): string => {
  const tipo = cd.tipoLogradouro || cd.tipo_logradouro || "";
  const log = cd.logradouro || "";
  const num = cd.numero || "";
  const bairro = cd.bairro || "";
  const ruaParte = [tipo, log].filter(Boolean).join(" ").trim();
  const partes: string[] = [];
  if (ruaParte) partes.push(ruaParte);
  if (num) partes.push(`Nº ${num}`);
  if (bairro) partes.push(bairro);
  return partes.join(", ");
};

const labelSexo = (v?: string): "M" | "F" | "" => {
  if (!v) return "";
  const s = String(v).toLowerCase();
  if (s.startsWith("m")) return "M";
  if (s.startsWith("f")) return "F";
  return "";
};

export async function imprimirLaudoApac(paciente: AnyPaciente, opts?: { unidadeNome?: string; cnesUnidade?: string }) {
  const cd: AnyPaciente = paciente?.custom_data || {};

  const nome = paciente?.nome || paciente?.nome_completo || "";
  const prontuario =
    paciente?.numeroProntuario || paciente?.numero_prontuario || cd.numeroProntuario || cd.numero_prontuario ||
    (paciente?.id ? String(paciente.id).slice(0, 8).toUpperCase() : "");
  const cns = paciente?.cns || cd.cns || "";
  const dataNasc = formatDataBR(paciente?.dataNascimento || paciente?.data_nascimento || cd.data_nascimento);
  const sexo = labelSexo(paciente?.sexo || cd.sexo);
  const racaCor = paciente?.raca_cor || cd.racaCor || cd.raca_cor || "";
  const nomeMae = paciente?.nomeMae || paciente?.nome_mae || cd.nome_mae || "";
  const telSplit = splitDDD(paciente?.telefone || cd.telefone);
  const responsavel = paciente?.nome_responsavel || cd.nome_responsavel || "";
  const telRespSplit = splitDDD(paciente?.telefone_responsavel || cd.telefone_responsavel || cd.telefoneResponsavel || "");
  const endereco = montaEndereco(cd);
  const municipio = paciente?.municipio || cd.municipio || "";
  const uf = cd.uf || paciente?.uf || cd.naturalidade_uf || "";
  const ibge =
    paciente?.codigo_ibge || paciente?.cod_ibge || cd.codigo_ibge || cd.codigoIbge ||
    cd.cod_ibge || cd.municipio_ibge || cd.ibge || getCodigoIbge(municipio, uf);
  const cep = cd.cep || "";

  const unidadeNome = opts?.unidadeNome || "";
  const cnesUnidade = opts?.cnesUnidade || "";

  // Coordenadas (mm) aproximadas dos campos da ficha oficial APAC.
  // Origem: canto superior esquerdo da página A4 (210x297mm).
  const V = (top: number, left: number, value: string, width?: number, extra: string = "") =>
    `<div class="apac-value" style="top:${top}mm;left:${left}mm;${width ? `width:${width}mm;` : ""}${extra}">${esc(value)}</div>`;

  const css = `
    @page { size: A4 portrait; margin: 0; }
    html, body { margin: 0; padding: 0; background: #fff; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    body { font-family: Arial, Helvetica, sans-serif; color: #000; }
    * { box-sizing: border-box; }
    .apac-page {
      position: relative;
      width: 210mm; height: 297mm;
      background-image: url("${apacTemplate.url}");
      background-size: 210mm 297mm;
      background-repeat: no-repeat;
      background-position: top left;
      overflow: hidden;
      page-break-after: avoid;
      page-break-inside: avoid;
    }
    .apac-value {
      position: absolute;
      font-family: Arial, Helvetica, sans-serif;
      font-size: 8px;
      line-height: 1;
      color: #000;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
      font-weight: 600;
    }
    .apac-x { font-size: 9px; font-weight: bold; }
    .print-btn { position: fixed; top: 10px; right: 10px; padding: 8px 14px; background: #2A6F97; color: #fff; border: 0; border-radius: 6px; cursor: pointer; font-weight: 600; z-index: 9999; }
    @media print { .print-btn { display: none !important; } }
  `;

  const html = `<!doctype html>
<html lang="pt-BR">
<head>
  <meta charset="utf-8" />
  <title>Laudo APAC - ${esc(nome)}</title>
  <style>${css}</style>
</head>
<body>
  <button class="print-btn" onclick="window.print()">Imprimir</button>
  <div class="apac-page">
    <!-- 1 - Nome do estabelecimento solicitante -->
    ${V(38, 8, unidadeNome, 140)}
    <!-- 2 - CNES -->
    ${V(38, 158, cnesUnidade, 45)}

    <!-- 3 - Nome do paciente -->
    ${V(64, 8, nome, 145)}
    <!-- 4 - Nº do prontuário -->
    ${V(64, 160, prontuario, 45)}

    <!-- 5 - CNS -->
    ${V(78, 8, cns, 95)}
    <!-- 6 - Data de Nascimento -->
    ${V(78, 108, dataNasc, 38)}
    <!-- 7 - Sexo (Masc/Fem) -->
    ${V(78, 153.5, sexo === "M" ? "X" : "", 4, "font-size:10px;")}
    ${V(78, 167, sexo === "F" ? "X" : "", 4, "font-size:10px;")}
    <!-- 8 - Raça/Cor -->
    ${V(78, 178, racaCor, 28)}

    <!-- 9 - Nome da Mãe -->
    ${V(92, 8, nomeMae, 140)}
    <!-- 10 - DDD + telefone -->
    ${V(92, 152, telSplit.ddd, 10)}
    ${V(92, 165, telSplit.numero, 40)}

    <!-- 11 - Nome do responsável -->
    ${V(106, 8, responsavel, 140)}
    <!-- 12 - DDD + telefone -->
    ${V(106, 152, telRespSplit.ddd, 10)}
    ${V(106, 165, telRespSplit.numero, 40)}

    <!-- 13 - Endereço -->
    ${V(120, 8, endereco, 198)}

    <!-- 14 - Município de residência -->
    ${V(133, 8, municipio, 130)}
    <!-- 15 - Cód. IBGE Município -->
    ${V(133, 143, ibge, 25)}
    <!-- 16 - UF -->
    ${V(133, 172, uf, 8)}
    <!-- 17 - CEP -->
    ${V(133, 184, cep, 22)}
  </div>
</body>
</html>`;

  const w = window.open("", "_blank", "width=900,height=1200");
  if (!w) {
    alert("Não foi possível abrir a janela de impressão. Verifique o bloqueador de pop-ups.");
    return;
  }
  w.document.open();
  w.document.write(html);
  w.document.close();
}
