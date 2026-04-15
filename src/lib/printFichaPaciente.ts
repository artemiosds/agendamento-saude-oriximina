import logoSmsFallback from '@/assets/logo-sms-oriximina.jpeg';
import logoCerFallback from '@/assets/logo-cer-ii.png';

interface FichaPacienteData {
  paciente: {
    id: string;
    nome: string;
    cpf: string;
    cns: string;
    nomeMae: string;
    telefone: string;
    dataNascimento: string;
    email: string;
    endereco: string;
    descricaoClinica: string;
    cid: string;
    criadoEm: string;
  };
  unidadeAtual?: string;
  dataAtendimento?: string;
  tipoAtendimento?: string;
  unidadeOrigem?: string;
  ultimoAtendimento?: {
    data: string;
    profissional: string;
    procedimentos: string;
    queixa: string;
    tipo: string;
  };
  historicoAtendimentos?: Array<{
    data: string;
    profissional: string;
    observacao: string;
    tipo: string;
  }>;
}

const resolveLogoUrl = (src: string): string => {
  if (src.startsWith('http') || src.startsWith('/')) return src;
  return src;
};

const formatarData = (data: string): string => {
  if (!data) return '—';
  try {
    const d = new Date(data.length <= 10 ? data + 'T12:00:00' : data);
    if (isNaN(d.getTime())) return data;
    return d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' });
  } catch {
    return data;
  }
};

const calcularIdade = (dataNascimento: string): string => {
  if (!dataNascimento) return '—';
  const parts = dataNascimento.includes('/') ? dataNascimento.split('/').reverse().join('-') : dataNascimento;
  const birth = new Date(parts + 'T12:00:00');
  if (isNaN(birth.getTime())) return '—';
  const today = new Date();
  let age = today.getFullYear() - birth.getFullYear();
  const m = today.getMonth() - birth.getMonth();
  if (m < 0 || (m === 0 && today.getDate() < birth.getDate())) age--;
  return `${age} anos`;
};

export function printFichaPaciente(data: FichaPacienteData): void {
  const logo = resolveLogoUrl();
  const printWindow = window.open('', '_blank');
  if (!printWindow) return;

  const now = new Date();
  const dataAtual = now.toLocaleDateString('pt-BR');
  const horaAtual = now.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });

  const historicoRows = (data.historicoAtendimentos || [])
    .slice(0, 10)
    .map(
      (h) => `
      <tr>
        <td>${formatarData(h.data)}</td>
        <td>${h.tipo || '—'}</td>
        <td>${h.profissional || '—'}</td>
        <td>${h.observacao || '—'}</td>
      </tr>`,
    )
    .join('');

  const html = `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8" />
  <title>Ficha do Paciente — ${data.paciente.nome}</title>
  <style>
    @page { size: A4 portrait; margin: 10mm 12mm 14mm 12mm; }
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: Arial, Helvetica, sans-serif;
      color: #1a1a1a;
      font-size: 11px;
      line-height: 1.45;
    }

    /* ===== HEADER ===== */
    .header {
      display: flex;
      align-items: center;
      gap: 14px;
      padding-bottom: 8px;
      margin-bottom: 6px;
      border-bottom: 3px solid #0c4a6e;
    }
    .header img {
      width: 54px;
      height: 54px;
      border-radius: 6px;
      object-fit: cover;
    }
    .header-center {
      flex: 1;
      text-align: center;
    }
    .header-center h1 {
      font-size: 13px;
      font-weight: 800;
      text-transform: uppercase;
      letter-spacing: 0.8px;
      color: #0c4a6e;
    }
    .header-center h2 {
      font-size: 11px;
      font-weight: 700;
      text-transform: uppercase;
      color: #334155;
      margin-top: 2px;
    }
    .header-center .tipo {
      font-size: 10px;
      font-weight: 600;
      text-transform: uppercase;
      color: #64748b;
      letter-spacing: 0.5px;
      margin-top: 2px;
    }
    .header-right {
      text-align: right;
      font-size: 10px;
      color: #475569;
      line-height: 1.7;
      min-width: 130px;
    }
    .header-right b { color: #1e293b; }

    /* ===== SECTIONS ===== */
    .bloco {
      margin-top: 7px;
      border: 1px solid #94a3b8;
      border-radius: 4px;
      overflow: hidden;
      page-break-inside: avoid;
    }
    .bloco-titulo {
      font-size: 10px;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.6px;
      background: linear-gradient(135deg, #0c4a6e, #0369a1);
      color: #fff;
      padding: 5px 12px;
    }
    .bloco-body { padding: 8px 12px; }

    /* ===== GRIDS ===== */
    .grid-2 { display: grid; grid-template-columns: 1fr 1fr; gap: 3px 18px; }
    .grid-3 { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 3px 14px; }
    .grid-4 { display: grid; grid-template-columns: repeat(4, 1fr); gap: 3px 10px; }

    .campo { margin-bottom: 2px; font-size: 11px; }
    .campo b {
      font-size: 8.5px;
      text-transform: uppercase;
      color: #475569;
      font-weight: 700;
      margin-right: 4px;
    }
    .campo span { color: #0f172a; font-weight: 500; }
    .campo-full { grid-column: 1 / -1; }

    /* ===== VITALS ===== */
    .vitais-table {
      width: 100%;
      border-collapse: collapse;
      margin-top: 4px;
    }
    .vitais-table td {
      border: 1px solid #cbd5e1;
      padding: 6px 10px;
      font-size: 11px;
      text-align: center;
      background: #f8fafc;
    }
    .vitais-table td b {
      display: block;
      font-size: 8px;
      text-transform: uppercase;
      color: #64748b;
      font-weight: 700;
      margin-bottom: 2px;
    }
    .vitais-table td span {
      font-weight: 600;
      color: #0f172a;
      font-size: 12px;
    }

    /* ===== DESCRIPTION ===== */
    .desc-box {
      margin-top: 4px;
      padding: 6px 8px;
      background: #f8fafc;
      border: 1px solid #e2e8f0;
      border-radius: 3px;
      font-size: 10px;
      line-height: 1.5;
    }

    /* ===== HISTORY TABLE ===== */
    .hist-table {
      width: 100%;
      border-collapse: collapse;
      margin-top: 4px;
    }
    .hist-table th {
      background: #f1f5f9;
      font-size: 8.5px;
      font-weight: 700;
      color: #475569;
      text-transform: uppercase;
      padding: 5px 8px;
      border: 1px solid #cbd5e1;
      text-align: left;
    }
    .hist-table td {
      padding: 5px 8px;
      border: 1px solid #cbd5e1;
      font-size: 10px;
      vertical-align: top;
    }
    .hist-table tr:nth-child(even) td { background: #fafbfc; }

    /* ===== EMPTY LINES ===== */
    .write-line {
      border-bottom: 1px solid #cbd5e1;
      height: 26px;
    }
    .write-line:nth-child(odd) { background: #fafbfc; }

    /* ===== SIGNATURE ===== */
    .assinatura-area {
      margin-top: 28px;
      display: flex;
      justify-content: space-between;
      align-items: flex-end;
      page-break-inside: avoid;
    }
    .assinatura-bloco {
      text-align: center;
      width: 240px;
    }
    .assinatura-traco {
      border-top: 1px solid #1e293b;
      padding-top: 24px;
    }
    .assinatura-label {
      font-size: 9px;
      color: #64748b;
    }
    .assinatura-data {
      font-size: 10px;
      color: #475569;
    }

    /* ===== FOOTER ===== */
    .rodape {
      margin-top: 14px;
      padding-top: 5px;
      border-top: 1px solid #cbd5e1;
      text-align: center;
      font-size: 8px;
      color: #94a3b8;
      letter-spacing: 0.3px;
    }

    @media print {
      .bloco { break-inside: avoid; }
      .assinatura-area { break-inside: avoid; }
    }
  </style>
</head>
<body>

  <!-- HEADER -->
  <div class="header">
    <img src="${logo}" alt="Logo SMS" />
    <div class="header-center">
      <h1>Secretaria Municipal de Saúde de Oriximiná</h1>
      <h2>Centro Especializado em Reabilitação II &mdash; CER II</h2>
      <div class="tipo">Ficha de Atendimento do Paciente</div>
    </div>
    <div class="header-right">
      <div><b>Prontuário:</b> ${data.paciente.id}</div>
      <div><b>Emissão:</b> ${dataAtual} — ${horaAtual}</div>
    </div>
  </div>

  <!-- IDENTIFICAÇÃO -->
  <div class="bloco">
    <div class="bloco-titulo">Identificação do Paciente</div>
    <div class="bloco-body">
      <div class="campo campo-full" style="margin-bottom:4px"><b>Nome Completo:</b> <span style="font-size:12px;font-weight:700">${data.paciente.nome}</span></div>
      <div class="grid-3">
        <div class="campo"><b>CPF:</b> <span>${data.paciente.cpf || '—'}</span></div>
        <div class="campo"><b>CNS:</b> <span>${data.paciente.cns || '—'}</span></div>
        <div class="campo"><b>Data Nasc.:</b> <span>${formatarData(data.paciente.dataNascimento)}</span></div>
      </div>
      <div class="grid-3">
        <div class="campo"><b>Idade:</b> <span>${calcularIdade(data.paciente.dataNascimento)}</span></div>
        <div class="campo"><b>Telefone:</b> <span>${data.paciente.telefone || '—'}</span></div>
        <div class="campo"><b>E-mail:</b> <span>${data.paciente.email || '—'}</span></div>
      </div>
      <div class="grid-2">
        <div class="campo"><b>Nome da Mãe:</b> <span>${data.paciente.nomeMae || '—'}</span></div>
        <div class="campo"><b>Endereço:</b> <span>${data.paciente.endereco || '—'}</span></div>
      </div>
    </div>
  </div>

  <!-- INFORMAÇÕES CLÍNICAS -->
  <div class="bloco">
    <div class="bloco-titulo">Informações Clínicas</div>
    <div class="bloco-body">
      <div class="grid-4">
        <div class="campo"><b>CID:</b> <span>${data.paciente.cid || '—'}</span></div>
        <div class="campo"><b>Tipo:</b> <span>${data.tipoAtendimento || '—'}</span></div>
        <div class="campo"><b>Unidade Origem:</b> <span>${data.unidadeOrigem || '—'}</span></div>
        <div class="campo"><b>Data Atend.:</b> <span>${data.dataAtendimento ? formatarData(data.dataAtendimento) : '—'}</span></div>
      </div>
      ${data.paciente.descricaoClinica ? `
      <div style="margin-top:6px">
        <div class="campo"><b>Descrição Clínica:</b></div>
        <div class="desc-box">${data.paciente.descricaoClinica}</div>
      </div>` : ''}
    </div>
  </div>

  <!-- SINAIS VITAIS -->
  <div class="bloco">
    <div class="bloco-titulo">Sinais Vitais</div>
    <div class="bloco-body">
      <table class="vitais-table">
        <tbody>
          <tr>
            <td><b>PA</b><span></span></td>
            <td><b>FC</b><span></span></td>
            <td><b>FR</b><span></span></td>
            <td><b>Temp</b><span></span></td>
            <td><b>SpO₂</b><span></span></td>
            <td><b>Peso</b><span></span></td>
          </tr>
        </tbody>
      </table>
    </div>
  </div>

  ${data.ultimoAtendimento ? `
  <!-- ÚLTIMO ATENDIMENTO -->
  <div class="bloco">
    <div class="bloco-titulo">Último Atendimento</div>
    <div class="bloco-body">
      <div class="grid-4">
        <div class="campo"><b>Data:</b> <span>${formatarData(data.ultimoAtendimento.data)}</span></div>
        <div class="campo"><b>Tipo:</b> <span>${data.ultimoAtendimento.tipo || '—'}</span></div>
        <div class="campo"><b>Profissional:</b> <span>${data.ultimoAtendimento.profissional || '—'}</span></div>
        <div class="campo"><b>Procedimentos:</b> <span>${data.ultimoAtendimento.procedimentos || '—'}</span></div>
      </div>
      ${data.ultimoAtendimento.queixa ? `<div class="campo" style="margin-top:4px"><b>Queixa:</b> <span>${data.ultimoAtendimento.queixa}</span></div>` : ''}
    </div>
  </div>` : ''}

  <!-- EVOLUÇÃO CLÍNICA -->
  <div class="bloco">
    <div class="bloco-titulo">Evolução Clínica / Histórico</div>
    <div class="bloco-body">
      ${historicoRows ? `
      <table class="hist-table">
        <thead>
          <tr>
            <th style="width:75px">Data</th>
            <th style="width:80px">Tipo</th>
            <th style="width:120px">Profissional</th>
            <th>Observação</th>
          </tr>
        </thead>
        <tbody>${historicoRows}</tbody>
      </table>` : `
      <div style="color:#94a3b8;font-size:9px;font-style:italic;margin-bottom:6px">
        Nenhum registro de evolução clínica encontrado.
      </div>`}
      <div style="margin-top:8px">
        ${Array.from({ length: 6 }, () => '<div class="write-line"></div>').join('')}
      </div>
    </div>
  </div>

  <!-- ASSINATURA -->
  <div class="assinatura-area">
    <div class="assinatura-data">Oriximiná &mdash; PA, ____/____/________</div>
    <div class="assinatura-bloco">
      <div class="assinatura-traco"></div>
      <div style="font-size:10px;font-weight:600">Profissional Responsável</div>
      <div class="assinatura-label">CRM / COREN / Registro</div>
    </div>
  </div>

  <!-- RODAPÉ -->
  <div class="rodape">
    SMS Oriximiná &mdash; CER II &mdash; Documento impresso em ${dataAtual} às ${horaAtual} &mdash; Via do Prontuário
  </div>

</body>
</html>`;

  printWindow.document.write(html);
  printWindow.document.close();
  setTimeout(() => {
    printWindow.focus();
    printWindow.print();
  }, 400);
}