import React, { useCallback, useState, useEffect } from 'react';
import { formatCNS, maskCNS } from '@/lib/cnsUtils';
import { Button } from '@/components/ui/button';
import { Printer, Loader2 } from 'lucide-react';
import { loadDocumentConfig, printViaIframe, buildDocumentShell, type DocumentConfig } from '@/lib/printLayout';


interface FichaData {
  paciente: {
    nome: string;
    cpf: string;
    cns: string;
    data_nascimento: string;
    nome_mae: string;
    telefone: string;
    telefone_secundario?: string;
    email?: string;
    endereco?: string;
    responsavel?: string;
    sexo?: string;
    naturalidade?: string;
    nacionalidade?: string;
    raca_cor?: string;
    situacao_rua?: boolean;
    menor_idade?: boolean;
    parentesco_responsavel?: string;
    observacoes_cadastrais?: string;
    informacoes_adicionais?: string;
    origem_cadastro?: string;
    unidade_vinculada?: string;
    // New structured address fields
    tipo_logradouro?: string;
    logradouro?: string;
    numero?: string;
    complemento?: string;
    bairro?: string;
    municipio?: string;
    uf?: string;
    cep?: string;
  };
  dadosClinicos: {
    numero_prontuario: string;
    cid: string;
    tipo_atendimento: string;
    unidade_origem: string;
    unidade_atendimento: string;
    data_atendimento: string;
    especialidade?: string;
    encaminhamento?: string;
  };
  sinaisVitais: {
    pressao_arterial: string;
    frequencia_cardiaca: string;
    temperatura: string;
    saturacao: string;
    peso: string;
    altura: string;
    glicemia?: string;
    frequencia_respiratoria?: string;
  };
  profissional: {
    nome: string;
    cargo: string;
    registro: string;
  };
  evoluciones: Array<{
    data: string;
    observacao: string;
    profissional: string;
  }>;
}

const formatarData = (data: string): string => {
  if (!data) return '___/___/______';
  try {
    const d = new Date(data.length <= 10 ? data + 'T12:00:00' : data);
    if (isNaN(d.getTime())) return '___/___/______';
    return d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' });
  } catch {
    return '___/___/______';
  }
};

const calcIdade = (dataNasc: string): string => {
  if (!dataNasc) return '__';
  try {
    const d = new Date(dataNasc.length <= 10 ? dataNasc + 'T12:00:00' : dataNasc);
    if (isNaN(d.getTime())) return '__';
    const now = new Date();
    let age = now.getFullYear() - d.getFullYear();
    const m = now.getMonth() - d.getMonth();
    if (m < 0 || (m === 0 && now.getDate() < d.getDate())) age--;
    return age >= 0 ? `${age} anos` : '__';
  } catch {
    return '__';
  }
};

const v = (valor: string | undefined): string => valor?.trim() || '';

export type FichaPrintMode = 'completa' | 'dados_pessoais';

interface FichaImpressaoProps {
  data: FichaData;
  mode?: FichaPrintMode;
  onPrintComplete?: () => void;
}

const resolveLogoUrl = (src: string): string => {
  if (src.startsWith('http') || src.startsWith('/')) return src;
  return src;
};

const PRINT_CSS = `
  * { margin: 0; padding: 0; box-sizing: border-box; }
  @page { size: A4 portrait; margin: 8mm 10mm 10mm 10mm; }
  body {
    font-family: 'Segoe UI', Arial, sans-serif;
    font-size: 10.5px;
    color: #1a1a1a;
    line-height: 1.4;
    padding: 0;
    width: 100%;
    background: #fff;
  }

  /* ===== HEADER ===== */
  .header {
    display: flex;
    align-items: center;
    gap: 12px;
    padding-bottom: 6px;
    margin-bottom: 8px;
    border-bottom: 2px solid #0c4a6e;
  }
  .header-logo img {
    width: 50px;
    height: 50px;
    object-fit: cover;
    border-radius: 4px;
  }
  .header-center {
    flex: 1;
    text-align: center;
  }
  .header-center h1 {
    font-size: 12px;
    font-weight: 800;
    text-transform: uppercase;
    color: #0c4a6e;
    margin: 0;
  }
  .header-center h2 {
    font-size: 10px;
    font-weight: 700;
    text-transform: uppercase;
    color: #334155;
    margin: 1px 0 0;
  }
  .header-center .ficha-tipo {
    font-size: 11px;
    font-weight: 800;
    text-transform: uppercase;
    color: #0c4a6e;
    margin-top: 3px;
    letter-spacing: 0.5px;
  }
  .header-right {
    text-align: right;
    font-size: 9.5px;
    color: #475569;
    line-height: 1.6;
    min-width: 120px;
  }
  .header-right b { color: #1e293b; }

  /* ===== SECTIONS ===== */
  .bloco {
    margin-top: 6px;
    border: 1px solid #cbd5e1;
    border-radius: 4px;
    overflow: hidden;
    page-break-inside: avoid;
  }
  .bloco-titulo {
    font-size: 9px;
    font-weight: 800;
    text-transform: uppercase;
    letter-spacing: 0.5px;
    background: #f1f5f9;
    color: #0c4a6e;
    padding: 4px 10px;
    border-bottom: 1px solid #cbd5e1;
    margin: 0;
  }
  .bloco-body {
    padding: 6px 10px;
  }

  /* ===== FIELD GRIDS ===== */
  .grid-2 { display: grid; grid-template-columns: 1fr 1fr; gap: 2px 12px; }
  .grid-3 { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 2px 12px; }
  .grid-4 { display: grid; grid-template-columns: repeat(4, 1fr); gap: 2px 8px; }
  .grid-5 { display: grid; grid-template-columns: repeat(5, 1fr); gap: 2px 6px; }

  .campo { margin-bottom: 1px; display: flex; align-items: baseline; gap: 4px; overflow: hidden; }
  .campo b {
    font-size: 8px;
    text-transform: uppercase;
    color: #64748b;
    font-weight: 700;
    white-space: nowrap;
  }
  .campo span { color: #0f172a; font-weight: 600; font-size: 10px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .campo-full { grid-column: 1 / -1; }

  /* ===== CLINICAL AREAS ===== */
  .manual-area {
    margin-top: 4px;
  }
  .manual-label {
    font-size: 8.5px;
    font-weight: 800;
    text-transform: uppercase;
    color: #475569;
    margin-bottom: 2px;
  }
  .manual-lines {
    border-bottom: 1px solid #e2e8f0;
    min-height: 20px;
    margin-bottom: 6px;
  }
  .manual-lines-lg {
    min-height: 60px;
    background-image: linear-gradient(#e2e8f0 1px, transparent 1px);
    background-size: 100% 20px;
    margin-bottom: 8px;
  }

  /* ===== VITALS TABLE ===== */
  .vitais-grid {
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    gap: 6px;
    margin-top: 2px;
  }
  .vital-item {
    border: 1px solid #e2e8f0;
    border-radius: 4px;
    padding: 4px 8px;
    text-align: center;
    background: #f8fafc;
  }
  .vital-item b {
    display: block;
    font-size: 7.5px;
    text-transform: uppercase;
    color: #64748b;
    margin-bottom: 1px;
  }
  .vital-item span {
    font-weight: 700;
    font-size: 11px;
    color: #0f172a;
  }

  /* ===== EVOLUTION ITEMS ===== */
  .evo-item {
    border-bottom: 1px solid #f1f5f9;
    padding: 4px 0;
  }
  .evo-item:last-child { border-bottom: none; }
  .evo-meta { font-size: 8.5px; color: #64748b; font-weight: 700; margin-bottom: 1px; }
  .evo-text { font-size: 9.5px; color: #1e293b; line-height: 1.3; }

  /* ===== SIGNATURE ===== */
  .assinatura-area {
    margin-top: 15px;
    display: flex;
    justify-content: space-between;
    align-items: flex-end;
    page-break-inside: avoid;
  }
  .assinatura-bloco {
    text-align: center;
    width: 200px;
  }
  .assinatura-traco {
    border-top: 1px solid #1e293b;
    padding-top: 18px;
  }
  .assinatura-label {
    font-size: 8.5px;
    color: #64748b;
    margin-top: 2px;
  }
  .assinatura-nome {
    font-size: 9.5px;
    font-weight: 700;
    color: #1e293b;
  }

  /* ===== FOOTER ===== */
  .rodape {
    margin-top: 10px;
    padding-top: 4px;
    border-top: 1px solid #e2e8f0;
    text-align: center;
    font-size: 8px;
    color: #94a3b8;
  }

  @media print {
    body { padding: 0; }
    .bloco { break-inside: avoid; }
    .assinatura-area { break-inside: avoid; }
  }
`;

export const FichaImpressao: React.FC<FichaImpressaoProps> = ({ data, mode = 'completa', onPrintComplete }) => {
  const [config, setConfig] = useState<DocumentConfig | null>(null);
  const [loading, setLoading] = useState(false);
  const somentePessoais = mode === 'dados_pessoais';

  useEffect(() => {
    loadDocumentConfig().then(setConfig);
  }, []);

  const buildHTML = useCallback(() => {
    if (!config) return '';
    
    const logoLeft = config.logoEsquerda || (logoSmsFallback as string);
    const logoRight = config.logoDireita || (logoCerFallback as string);
    const logoCentral = config.mostrarLogoCentral && config.logoCentral 
      ? `<img src="${config.logoCentral}" alt="Logo Central" style="max-height:50px;max-width:150px;object-fit:contain;margin-bottom:4px;" />` 
      : '';
    
    const now = new Date();
    const dataAtual = formatarData(now.toISOString());
    const horaAtual = now.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
    const idade = calcIdade(data.paciente.data_nascimento);
    const p = data.paciente;

    const evolucaoHTML = '';

    const formatBool = (val?: boolean) => val ? 'SIM' : 'NÃO';

    return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8" />
  <title>Ficha CER II - ${v(p.nome)}</title>
  <style>${PRINT_CSS}</style>
</head>
<body>

  <!-- CABEÇALHO -->
  <div class="header" style="${config.mostrarLinhaDivisoria ? 'border-bottom: 2px solid #0c4a6e;' : 'border-bottom: none;'}">
    <div class="header-logo">
      <img src="${logoLeft}" alt="Logo Esquerda" />
    </div>
    <div class="header-center">
      ${logoCentral}
      <h1 style="font-family: ${config.tipografia.fonte}">${config.linha1}</h1>
      <h2 style="font-family: ${config.tipografia.fonte}">${config.linha2}</h2>
      ${config.linha3 ? `<div style="font-size: 9px; color: #475569; text-transform: uppercase; font-weight: 600;">${config.linha3}</div>` : ''}
      ${config.linha4 ? `<div style="font-size: 8.5px; color: #64748b;">${config.linha4}</div>` : ''}
      <div class="ficha-tipo">${somentePessoais ? 'FICHA CADASTRAL DO PACIENTE' : 'FICHA DE ATENDIMENTO CLÍNICO'}</div>
    </div>
    <div class="header-logo">
      <img src="${logoRight}" alt="Logo Direita" style="max-height:50px;max-width:90px;object-fit:contain;" />
    </div>
    <div class="header-right">
      <div><b>Data:</b> ${dataAtual}</div>
      <div><b>Hora:</b> ${horaAtual}</div>
      <div><b>Prontuário:</b> ________________</div>
    </div>
  </div>

  <!-- IDENTIFICAÇÃO -->
  <div class="bloco">
    <div class="bloco-titulo">1. Identificação do Paciente</div>
    <div class="bloco-body">
      <div class="campo campo-full"><b>Nome Completo:</b> <span style="font-size:11px;font-weight:700">${v(p.nome) || '—'}</span></div>
      <div class="campo campo-full"><b>Nome da Mãe:</b> <span>${v(p.nome_mae) || '—'}</span></div>
      <div class="grid-5">
        <div class="campo"><b>CPF:</b> <span>${v(p.cpf) || '—'}</span></div>
        <div class="campo"><b>CNS:</b> <span>${formatCNS(p.cns) || '—'}</span></div>
        <div class="campo"><b>Data Nasc.:</b> <span>${formatarData(p.data_nascimento)}</span></div>
        <div class="campo"><b>Idade:</b> <span>${idade}</span></div>
        <div class="campo"><b>Sexo:</b> <span>${v(p.sexo) || '—'}</span></div>
      </div>
      <div class="grid-3">
        <div class="campo"><b>Naturalidade:</b> <span>${v(p.naturalidade) || '—'}</span></div>
        <div class="campo"><b>Nacionalidade:</b> <span>${v(p.nacionalidade) || 'BRASILEIRA'}</span></div>
        <div class="campo"><b>Raça/Cor:</b> <span>${v(p.raca_cor) || '—'}</span></div>
      </div>
      <div class="grid-2">
        <div class="campo"><b>Situação de Rua:</b> <span>${formatBool(p.situacao_rua)}</span></div>
        <div class="campo"><b>Menor de Idade:</b> <span>${formatBool(p.menor_idade)}</span></div>
      </div>
    </div>
  </div>

  <!-- ENDEREÇO -->
  <div class="bloco">
    <div class="bloco-titulo">2. Endereço</div>
    <div class="bloco-body">
      <div class="grid-3">
        <div class="campo"><b>CEP:</b> <span>${v(p.cep) || '—'}</span></div>
        <div class="campo"><b>Tipo Logradouro:</b> <span>${v(p.tipo_logradouro) || '—'}</span></div>
        <div class="campo"><b>Município/UF:</b> <span>${v(p.municipio)} / ${v(p.uf)}</span></div>
      </div>
      <div class="grid-3">
        <div class="campo" style="grid-column: span 2"><b>Logradouro:</b> <span>${v(p.logradouro) || '—'}</span></div>
        <div class="campo"><b>Número:</b> <span>${v(p.numero) || '—'}</span></div>
      </div>
      <div class="grid-2">
        <div class="campo"><b>Bairro:</b> <span>${v(p.bairro) || '—'}</span></div>
        <div class="campo"><b>Complemento:</b> <span>${v(p.complemento) || '—'}</span></div>
      </div>
      ${p.endereco ? `<div class="campo campo-full"><b>Ref./Legado:</b> <span>${p.endereco}</span></div>` : ''}
    </div>
  </div>

  <!-- CONTATO -->
  <div class="bloco">
    <div class="bloco-titulo">3. Contato</div>
    <div class="bloco-body">
      <div class="grid-3">
        <div class="campo"><b>Telefone Principal:</b> <span>${v(p.telefone) || '—'}</span></div>
        <div class="campo"><b>Telefone Secundário:</b> <span>${v(p.telefone_secundario) || '—'}</span></div>
        <div class="campo"><b>E-mail:</b> <span>${v(p.email) || '—'}</span></div>
      </div>
    </div>
  </div>

  <!-- COMPLEMENTARES -->
  <div class="bloco">
    <div class="bloco-titulo">4. Complementares</div>
    <div class="bloco-body">
      <div class="grid-2">
        <div class="campo"><b>Responsável:</b> <span>${v(p.responsavel) || '—'}</span></div>
        <div class="campo"><b>Parentesco/Vínculo:</b> <span>${v(p.parentesco_responsavel) || '—'}</span></div>
      </div>
      <div class="grid-2">
        <div class="campo"><b>Origem Cadastro:</b> <span>${v(p.origem_cadastro) || '—'}</span></div>
        <div class="campo"><b>Unidade Vinculada:</b> <span>${v(p.unidade_vinculada) || '—'}</span></div>
      </div>
      <div class="campo campo-full"><b>Observações Cadastrais:</b> <span>${v(p.observacoes_cadastrais) || '—'}</span></div>
      <div class="campo campo-full"><b>Informações Adicionais:</b> <span>${v(p.informacoes_adicionais) || '—'}</span></div>
    </div>
  </div>

  ${!somentePessoais ? `
  <!-- ATENDIMENTO (MODO COMPLETA) -->
  <div class="bloco">
    <div class="bloco-titulo">5. Atendimento</div>
    <div class="bloco-body">
      <div class="grid-4">
        <div class="campo"><b>Tipo:</b> <span>${v(data.dadosClinicos.tipo_atendimento) || '—'}</span></div>
        <div class="campo"><b>CID:</b> <span>${v(data.dadosClinicos.cid) || '—'}</span></div>
        <div class="campo"><b>Profissional:</b> <span>—</span></div>
        <div class="campo"><b>Especialidade:</b> <span>—</span></div>
      </div>
      <div class="grid-2">
        <div class="campo"><b>Unidade:</b> <span>${v(data.dadosClinicos.unidade_atendimento) || '—'}</span></div>
        <div class="campo"><b>Data:</b> <span>${formatarData(data.dadosClinicos.data_atendimento)}</span></div>
      </div>
    </div>
  </div>

  <!-- TRIAGEM / SINAIS VITAIS -->
  <div class="bloco">
    <div class="bloco-titulo">6. Triagem / Sinais Vitais</div>
    <div class="bloco-body">
      <div class="vitais-grid">
        <div class="vital-item"><b>PA</b><span>${v(data.sinaisVitais.pressao_arterial) || '___'}</span></div>
        <div class="vital-item"><b>FC</b><span>${v(data.sinaisVitais.frequencia_cardiaca) || '___'}</span></div>
        <div class="vital-item"><b>FR</b><span>${v(data.sinaisVitais.frequencia_respiratoria) || '___'}</span></div>
        <div class="vital-item"><b>Temp</b><span>${v(data.sinaisVitais.temperatura) || '___'}</span></div>
        <div class="vital-item"><b>SpO₂</b><span>${v(data.sinaisVitais.saturacao) || '___'}</span></div>
        <div class="vital-item"><b>Peso</b><span>${v(data.sinaisVitais.peso) || '___'}</span></div>
        <div class="vital-item"><b>Altura</b><span>${v(data.sinaisVitais.altura) || '___'}</span></div>
        <div class="vital-item"><b>Glicemia</b><span>${v(data.sinaisVitais.glicemia) || '___'}</span></div>
      </div>
    </div>
  </div>

  <!-- CAMPOS CLÍNICOS TEXTUAIS -->
  <div class="bloco">
    <div class="bloco-titulo">7. Avaliação Clínica</div>
    <div class="bloco-body">
      <div class="manual-area">
        <div class="manual-label">Queixa Principal:</div>
        <div class="manual-lines-lg"></div>
      </div>
      <div class="manual-area">
        <div class="manual-label">Evolução Clínica:</div>
        ${evolucaoHTML ? `<div style="margin-bottom:8px">${evolucaoHTML}</div>` : ''}
        <div class="manual-lines-lg"></div>
      </div>
    </div>
  </div>

  <div class="bloco">
    <div class="bloco-titulo">8. Conduta / Prescrição</div>
    <div class="bloco-body">
      <div class="grid-2">
        <div class="manual-area">
          <div class="manual-label">Diagnóstico:</div>
          <div class="manual-lines"></div>
        </div>
        <div class="manual-area">
          <div class="manual-label">Retorno:</div>
          <div class="manual-lines"></div>
        </div>
      </div>
      <div class="manual-area">
        <div class="manual-label">Medicação / Prescrição:</div>
        <div class="manual-lines-lg"></div>
      </div>
      <div class="manual-area">
        <div class="manual-label">Procedimentos:</div>
        <div class="manual-lines-lg"></div>
      </div>
    </div>
  </div>
  ` : ''}

  <!-- ASSINATURA -->
  <div class="assinatura-area">
    <div style="font-size: 10px; color: #475569;">
      Oriximiná &mdash; PA, ____/____/________
    </div>
    <div class="assinatura-bloco">
      <div class="assinatura-traco"></div>
      <div class="assinatura-nome">${!somentePessoais ? 'Profissional Responsável' : 'Responsável pelo Cadastro'}</div>
      <p class="assinatura-label">${!somentePessoais ? 'Registro Profissional' : 'Assinatura'}</p>
    </div>
  </div>

  <!-- RODAPÉ -->
  <div class="rodape">
    SMS Oriximiná &mdash; CER II &mdash; Documento gerado em ${dataAtual} às ${horaAtual} &mdash; ${somentePessoais ? 'Ficha Cadastral' : 'Ficha Completa / Prontuário'}
  </div>

</body>
</html>`;
  }, [data, somentePessoais]);

  const handlePrint = useCallback(() => {
    try {
      const html = buildHTML();
      printViaIframe(html);
      // Fecha o modal um pouco depois para o usuário enxergar o diálogo de impressão
      setTimeout(() => { onPrintComplete?.(); }, 800);
    } catch (err) {
      console.error('[FichaImpressao] erro ao imprimir:', err);
    }
  }, [buildHTML, onPrintComplete]);

  const idade = calcIdade(data.paciente.data_nascimento);

  return (
    <div className="flex flex-col items-center gap-6 py-4">
      <div className="w-full border rounded-lg bg-white p-6 shadow-sm max-h-[60vh] overflow-y-auto">
        <div className="text-center mb-3 border-b-2 border-[#0c4a6e] pb-3">
          <h2 className="text-xs font-bold uppercase tracking-wide text-[#0c4a6e]">SECRETARIA MUNICIPAL DE SAÚDE DE ORIXIMINÁ</h2>
          <p className="text-[10px] uppercase font-bold text-muted-foreground">CENTRO ESPECIALIZADO EM REABILITAÇÃO II - CER II</p>
          <p className="text-[10px] uppercase font-extrabold text-[#0c4a6e] mt-1">{somentePessoais ? 'FICHA CADASTRAL DO PACIENTE' : 'FICHA DE ATENDIMENTO CLÍNICO'}</p>
        </div>

        <div className="space-y-3 text-sm">
          {/* IDENTIFICAÇÃO */}
          <div className="border rounded p-3 bg-slate-50/30">
            <h3 className="text-[10px] font-bold uppercase text-[#0c4a6e] border-b pb-1 mb-2">1. Identificação</h3>
            <p className="mb-1"><span className="text-[9px] font-bold uppercase text-muted-foreground">Nome:</span> <span className="font-bold">{data.paciente.nome || '—'}</span></p>
            <div className="grid grid-cols-2 gap-x-4 gap-y-1">
              <p><span className="text-[9px] font-bold uppercase text-muted-foreground">CPF:</span> {data.paciente.cpf || '—'}</p>
              <p><span className="text-[9px] font-bold uppercase text-muted-foreground">CNS:</span> {formatCNS(data.paciente.cns) || '—'}</p>
              <p><span className="text-[9px] font-bold uppercase text-muted-foreground">Nasc.:</span> {formatarData(data.paciente.data_nascimento)}</p>
              <p><span className="text-[9px] font-bold uppercase text-muted-foreground">Idade:</span> {idade}</p>
            </div>
          </div>

          {/* ENDEREÇO */}
          <div className="border rounded p-3 bg-slate-50/30">
            <h3 className="text-[10px] font-bold uppercase text-[#0c4a6e] border-b pb-1 mb-2">2. Endereço</h3>
            <p className="mb-1"><span className="text-[9px] font-bold uppercase text-muted-foreground">Logradouro:</span> {data.paciente.logradouro || data.paciente.endereco || '—'}</p>
            <div className="grid grid-cols-2 gap-x-4 gap-y-1">
              <p><span className="text-[9px] font-bold uppercase text-muted-foreground">Bairro:</span> {data.paciente.bairro || '—'}</p>
              <p><span className="text-[9px] font-bold uppercase text-muted-foreground">Município/UF:</span> {data.paciente.municipio || '—'} / {data.paciente.uf || '—'}</p>
            </div>
          </div>

          {/* CONTATO */}
          <div className="border rounded p-3 bg-slate-50/30">
            <h3 className="text-[10px] font-bold uppercase text-[#0c4a6e] border-b pb-1 mb-2">3. Contato</h3>
            <div className="grid grid-cols-2 gap-x-4 gap-y-1">
              <p><span className="text-[9px] font-bold uppercase text-muted-foreground">Telefone:</span> {data.paciente.telefone || '—'}</p>
              <p><span className="text-[9px] font-bold uppercase text-muted-foreground">E-mail:</span> {data.paciente.email || '—'}</p>
            </div>
          </div>

          {!somentePessoais && (
            <>
              <div className="border rounded p-3 bg-slate-50/30">
                <h3 className="text-[10px] font-bold uppercase text-[#0c4a6e] border-b pb-1 mb-2">4. Atendimento</h3>
                <div className="grid grid-cols-2 gap-x-4 gap-y-1">
                  <p><span className="text-[9px] font-bold uppercase text-muted-foreground">Tipo:</span> {data.dadosClinicos.tipo_atendimento || '—'}</p>
                  <p><span className="text-[9px] font-bold uppercase text-muted-foreground">CID:</span> {data.dadosClinicos.cid || '—'}</p>
                </div>
              </div>

              <div className="border rounded p-3 bg-slate-50/30">
                <h3 className="text-[10px] font-bold uppercase text-[#0c4a6e] border-b pb-1 mb-2">5. Triagem / Sinais Vitais</h3>
                <div className="grid grid-cols-4 gap-2 text-[10px]">
                  <p><strong>PA:</strong> {data.sinaisVitais.pressao_arterial || '—'}</p>
                  <p><strong>FC:</strong> {data.sinaisVitais.frequencia_cardiaca || '—'}</p>
                  <p><strong>FR:</strong> {data.sinaisVitais.frequencia_respiratoria || '—'}</p>
                  <p><strong>Temp:</strong> {data.sinaisVitais.temperatura || '—'}</p>
                  <p><strong>SpO₂:</strong> {data.sinaisVitais.saturacao || '—'}</p>
                  <p><strong>Peso:</strong> {data.sinaisVitais.peso || '—'}</p>
                  <p><strong>Altura:</strong> {data.sinaisVitais.altura || '—'}</p>
                  <p><strong>Glicemia:</strong> {data.sinaisVitais.glicemia || '—'}</p>
                </div>
              </div>

              <div className="border rounded p-3 bg-slate-50/30">
                <h3 className="text-[10px] font-bold uppercase text-[#0c4a6e] border-b pb-1 mb-2">6. Avaliação Clínica</h3>
                <p className="text-[10px] text-muted-foreground italic">Campos em branco para preenchimento manual no PDF/Impressão</p>
                {/* Evoluções antigas removidas da ficha */}
              </div>
            </>
          )}
        </div>
      </div>

      <Button onClick={handlePrint} className="w-full max-w-xs" size="lg">
        <Printer className="w-4 h-4 mr-2" />
        Imprimir Ficha
      </Button>
    </div>
  );
};

export default FichaImpressao;
