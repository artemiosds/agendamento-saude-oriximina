import logoSms from '@/assets/logo-sms.jpeg';

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

const resolveLogoUrl = (): string => {
  if (logoSms.startsWith('http') || logoSms.startsWith('/')) return logoSms;
  return logoSms;
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

  const historicoRows = (data.historicoAtendimentos || [])
    .slice(0, 8)
    .map(
      (h) => `
      <tr>
        <td style="padding:4px 6px;border:1px solid #ccc;font-size:10px">${formatarData(h.data)}</td>
        <td style="padding:4px 6px;border:1px solid #ccc;font-size:10px">${h.tipo || '—'}</td>
        <td style="padding:4px 6px;border:1px solid #ccc;font-size:10px">${h.profissional || '—'}</td>
        <td style="padding:4px 6px;border:1px solid #ccc;font-size:10px">${h.observacao || '—'}</td>
      </tr>`,
    )
    .join('');

  const html = `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8" />
  <title>Ficha do Paciente — ${data.paciente.nome}</title>
  <style>
    @page { size: A4; margin: 12mm 10mm; }
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: 'Segoe UI', Arial, sans-serif; color: #1e293b; font-size: 10px; line-height: 1.4; }

    /* HEADER */
    .header {
      display: flex; align-items: center; gap: 12px;
      padding: 10px 14px; margin-bottom: 8px;
      border: 1px solid #cbd5e1; border-radius: 6px;
      background: #f8fafc;
    }
    .header img { width: 48px; height: 48px; border-radius: 8px; object-fit: cover; }
    .header-text { flex: 1; }
    .header-text h1 { font-size: 13px; font-weight: 700; color: #0f172a; }
    .header-text .subtitle { font-size: 9px; color: #64748b; margin-top: 1px; }
    .header-text .unidade { font-size: 11px; font-weight: 600; color: #0369a1; margin-top: 3px; }
    .header-right { text-align: right; font-size: 9px; color: #64748b; }

    /* SECTIONS */
    .section {
      border: 1px solid #cbd5e1; border-radius: 5px;
      margin-bottom: 6px; padding: 8px 10px;
      page-break-inside: avoid;
    }
    .section-title {
      font-size: 10px; font-weight: 700; color: #0369a1;
      text-transform: uppercase; letter-spacing: 0.3px;
      border-bottom: 1px solid #e2e8f0; padding-bottom: 3px; margin-bottom: 6px;
    }

    /* GRID FIELDS */
    .fields-grid {
      display: grid; grid-template-columns: 1fr 1fr; gap: 4px 12px;
    }
    .field { display: flex; flex-direction: column; }
    .field-label { font-size: 8px; color: #64748b; text-transform: uppercase; font-weight: 600; }
    .field-value { font-size: 10px; color: #0f172a; min-height: 14px; }

    /* VITAL SIGNS TABLE */
    .vitals-table {
      width: 100%; border-collapse: collapse; margin-top: 4px;
    }
    .vitals-table th {
      background: #f1f5f9; font-size: 8px; font-weight: 600; color: #475569;
      padding: 4px 6px; border: 1px solid #cbd5e1; text-align: center;
    }
    .vitals-table td {
      padding: 6px; border: 1px solid #cbd5e1; text-align: center;
      height: 22px; font-size: 10px;
    }

    /* EVOLUTION TABLE */
    .evo-table {
      width: 100%; border-collapse: collapse; margin-top: 4px;
    }
    .evo-table th {
      background: #f1f5f9; font-size: 8px; font-weight: 600; color: #475569;
      padding: 4px 6px; border: 1px solid #cbd5e1; text-align: left;
    }
    .evo-table td {
      padding: 4px 6px; border: 1px solid #cbd5e1; font-size: 10px; vertical-align: top;
    }

    /* REFERRAL */
    .referral-box {
      border: 1px solid #cbd5e1; border-radius: 4px; padding: 6px 8px;
      background: #fafbfc;
    }
    .referral-row { display: flex; gap: 12px; margin-bottom: 4px; }
    .referral-item { flex: 1; }

    /* SIGNATURE */
    .signature-area {
      margin-top: 16px; display: flex; justify-content: flex-end;
    }
    .signature-block {
      text-align: center; width: 220px;
    }
    .signature-line {
      border-top: 1px solid #334155; margin-bottom: 4px; padding-top: 20px;
    }
    .signature-name { font-size: 10px; font-weight: 600; }
    .signature-reg { font-size: 9px; color: #64748b; }

    /* PRINT */
    @media print {
      body { font-size: 9px; }
      .section { break-inside: avoid; }
    }
  </style>
</head>
<body>
  <!-- HEADER -->
  <div class="header">
    <img src="${logo}" alt="Logo SMS" />
    <div class="header-text">
      <h1>Secretaria Municipal de Saúde</h1>
      <div class="subtitle">Ficha de Atendimento do Paciente</div>
      ${data.unidadeAtual ? `<div class="unidade">${data.unidadeAtual}</div>` : ''}
    </div>
    <div class="header-right">
      <div>Prontuário: <strong>${data.paciente.id}</strong></div>
      <div>Emissão: ${new Date().toLocaleDateString('pt-BR')} ${new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}</div>
    </div>
  </div>

  <!-- IDENTIFICAÇÃO -->
  <div class="section">
    <div class="section-title">Identificação do Paciente</div>
    <div class="fields-grid">
      <div class="field" style="grid-column: span 2">
        <span class="field-label">Nome Completo</span>
        <span class="field-value" style="font-weight:600">${data.paciente.nome}</span>
      </div>
      <div class="field">
        <span class="field-label">CPF</span>
        <span class="field-value">${data.paciente.cpf || '—'}</span>
      </div>
      <div class="field">
        <span class="field-label">CNS (Cartão SUS)</span>
        <span class="field-value">${data.paciente.cns || '—'}</span>
      </div>
      <div class="field">
        <span class="field-label">Data de Nascimento</span>
        <span class="field-value">${formatarData(data.paciente.dataNascimento)}</span>
      </div>
      <div class="field">
        <span class="field-label">Idade</span>
        <span class="field-value">${calcularIdade(data.paciente.dataNascimento)}</span>
      </div>
      <div class="field" style="grid-column: span 2">
        <span class="field-label">Nome da Mãe</span>
        <span class="field-value">${data.paciente.nomeMae || '—'}</span>
      </div>
      <div class="field">
        <span class="field-label">Telefone</span>
        <span class="field-value">${data.paciente.telefone || '—'}</span>
      </div>
      <div class="field">
        <span class="field-label">E-mail</span>
        <span class="field-value">${data.paciente.email || '—'}</span>
      </div>
    </div>
  </div>

  <!-- INFORMAÇÕES CLÍNICAS -->
  <div class="section">
    <div class="section-title">Informações Clínicas</div>
    <div class="fields-grid">
      <div class="field">
        <span class="field-label">CID</span>
        <span class="field-value">${data.paciente.cid || '—'}</span>
      </div>
      <div class="field">
        <span class="field-label">Tipo de Atendimento</span>
        <span class="field-value">${data.tipoAtendimento || '—'}</span>
      </div>
      <div class="field">
        <span class="field-label">Unidade de Origem</span>
        <span class="field-value">${data.unidadeOrigem || '—'}</span>
      </div>
      <div class="field">
        <span class="field-label">Data do Atendimento</span>
        <span class="field-value">${data.dataAtendimento ? formatarData(data.dataAtendimento) : '—'}</span>
      </div>
    </div>
    ${data.paciente.descricaoClinica ? `
    <div style="margin-top:6px">
      <span class="field-label">Descrição Clínica</span>
      <div style="font-size:10px;margin-top:2px;padding:4px 6px;background:#f8fafc;border:1px solid #e2e8f0;border-radius:3px">${data.paciente.descricaoClinica}</div>
    </div>` : ''}
  </div>

  <!-- SINAIS VITAIS -->
  <div class="section">
    <div class="section-title">Sinais Vitais</div>
    <table class="vitals-table">
      <thead>
        <tr>
          <th>Pressão Arterial</th>
          <th>Freq. Cardíaca</th>
          <th>Temperatura</th>
          <th>Saturação O₂</th>
          <th>Peso (kg)</th>
          <th>Altura (cm)</th>
        </tr>
      </thead>
      <tbody>
        <tr>
          <td></td><td></td><td></td><td></td><td></td><td></td>
        </tr>
      </tbody>
    </table>
  </div>

  <!-- ENCAMINHAMENTO -->
  <div class="section">
    <div class="section-title">Encaminhamento</div>
    <div class="referral-box">
      <div class="referral-row">
        <div class="referral-item">
          <span class="field-label">Especialidade</span>
          <div style="border-bottom:1px solid #cbd5e1;height:18px;margin-top:2px"></div>
        </div>
        <div class="referral-item">
          <span class="field-label">Destino</span>
          <div style="border-bottom:1px solid #cbd5e1;height:18px;margin-top:2px"></div>
        </div>
      </div>
      <div style="margin-top:6px">
        <span class="field-label">Observação</span>
        <div style="border-bottom:1px solid #cbd5e1;height:18px;margin-top:2px"></div>
      </div>
    </div>
  </div>

  <!-- EVOLUÇÃO CLÍNICA -->
  <div class="section">
    <div class="section-title">Evolução Clínica</div>
    ${historicoRows ? `
    <table class="evo-table">
      <thead>
        <tr>
          <th style="width:80px">Data</th>
          <th style="width:90px">Tipo</th>
          <th style="width:120px">Profissional</th>
          <th>Observação</th>
        </tr>
      </thead>
      <tbody>
        ${historicoRows}
      </tbody>
    </table>` : `
    <div style="border:1px solid #cbd5e1;border-radius:4px;padding:8px;text-align:center;color:#94a3b8;font-size:9px">
      Nenhum registro de evolução clínica encontrado.
    </div>`}
  </div>

  <!-- ASSINATURA -->
  <div class="signature-area">
    <div class="signature-block">
      <div class="signature-line"></div>
      <div class="signature-name">Nome do Profissional</div>
      <div class="signature-reg">CRM / COREN / Registro</div>
    </div>
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