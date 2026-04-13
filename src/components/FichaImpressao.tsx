import React, { useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Printer } from 'lucide-react';
import logoSms from '@/assets/logo-sms.jpeg';

interface FichaData {
  paciente: {
    nome_completo: string;
    cpf: string;
    cns: string;
    data_nascimento: string;
    nome_mae: string;
    telefone: string;
    endereco?: string;
    responsavel?: string;
    sexo?: string;
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

const resolveLogoUrl = (): string => {
  if (logoSms.startsWith('http') || logoSms.startsWith('/')) return logoSms;
  return logoSms;
};

const PRINT_CSS = `
  * { margin: 0; padding: 0; box-sizing: border-box; }
  @page { size: A4 portrait; margin: 10mm 12mm 14mm 12mm; }
  body {
    font-family: Arial, Helvetica, sans-serif;
    font-size: 11px;
    color: #1a1a1a;
    line-height: 1.45;
    padding: 0;
    width: 100%;
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
  .header-logo img {
    width: 54px;
    height: 54px;
    object-fit: cover;
    border-radius: 6px;
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
    margin: 0;
  }
  .header-center h2 {
    font-size: 11px;
    font-weight: 700;
    text-transform: uppercase;
    color: #334155;
    margin: 2px 0 0;
  }
  .header-center .ficha-tipo {
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
    margin: 0;
  }
  .bloco-body {
    padding: 8px 12px;
  }

  /* ===== FIELD GRIDS ===== */
  .grid-2 { display: grid; grid-template-columns: 1fr 1fr; gap: 3px 18px; }
  .grid-3 { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 3px 14px; }
  .grid-4 { display: grid; grid-template-columns: repeat(4, 1fr); gap: 3px 10px; }

  .campo { margin-bottom: 2px; font-size: 11px; }
  .campo b {
    font-size: 8.5px;
    text-transform: uppercase;
    color: #475569;
    font-weight: 700;
    letter-spacing: 0.2px;
    margin-right: 4px;
  }
  .campo span { color: #0f172a; font-weight: 500; }
  .campo-full { grid-column: 1 / -1; }

  /* ===== VITALS TABLE ===== */
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

  /* ===== EVOLUTION LINES ===== */
  .evo-area {
    min-height: 180px;
    position: relative;
  }
  .evo-line {
    border-bottom: 1px solid #cbd5e1;
    height: 26px;
    line-height: 26px;
    padding: 0 4px;
    font-size: 11px;
  }
  .evo-line:nth-child(odd) { background: #fafbfc; }

  .evo-item {
    border-bottom: 1px solid #e2e8f0;
    padding: 6px 4px;
  }
  .evo-item:last-child { border-bottom: none; }
  .evo-meta { font-size: 9px; color: #64748b; font-weight: 600; }
  .evo-text { font-size: 11px; margin-top: 3px; color: #1e293b; line-height: 1.5; }

  /* ===== CONDUTA ===== */
  .conduta-campo {
    margin-bottom: 3px;
  }
  .conduta-campo b {
    font-size: 9px;
    text-transform: uppercase;
    color: #475569;
    font-weight: 700;
  }
  .conduta-linha {
    border-bottom: 1px solid #cbd5e1;
    min-height: 24px;
    margin-bottom: 8px;
  }

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
    margin: 2px 0 0;
  }
  .assinatura-nome {
    font-size: 10px;
    font-weight: 600;
    color: #1e293b;
  }

  .assinatura-data {
    text-align: left;
    font-size: 10px;
    color: #475569;
  }
  .assinatura-data b { color: #1e293b; }

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
    body { padding: 0; }
    .bloco { break-inside: avoid; }
    .assinatura-area { break-inside: avoid; }
  }
`;

export const FichaImpressao: React.FC<FichaImpressaoProps> = ({ data, mode = 'completa', onPrintComplete }) => {
  const somentePessoais = mode === 'dados_pessoais';
  const buildHTML = useCallback(() => {
    const logo = resolveLogoUrl();
    const now = new Date();
    const dataAtual = formatarData(now.toISOString());
    const horaAtual = now.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
    const idade = calcIdade(data.paciente.data_nascimento);

    const evolucaoHTML = data.evoluciones.length > 0
      ? data.evoluciones.map(evo => `
        <div class="evo-item">
          <div class="evo-meta">${formatarData(evo.data)} &mdash; ${v(evo.profissional) || '—'}</div>
          <div class="evo-text">${v(evo.observacao) || '—'}</div>
        </div>
      `).join('')
      : Array.from({ length: 8 }, () => '<div class="evo-line"></div>').join('');

    return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8" />
  <title>Ficha CER II - ${v(data.paciente.nome_completo)}</title>
  <style>${PRINT_CSS}</style>
</head>
<body>

  <!-- CABEÇALHO -->
  <div class="header">
    <div class="header-logo">
      <img src="${logo}" alt="Logo SMS" />
    </div>
    <div class="header-center">
      <h1>Secretaria Municipal de Saúde de Oriximiná</h1>
      <h2>Centro Especializado em Reabilitação II &mdash; CER II</h2>
      <div class="ficha-tipo">${somentePessoais ? 'Ficha Cadastral do Paciente' : 'Ficha de Atendimento / Prontuário'}</div>
    </div>
    <div class="header-right">
      <div><b>Data:</b> ${dataAtual}</div>
      <div><b>Hora:</b> ${horaAtual}</div>
      <div><b>Prontuário:</b> ${v(data.dadosClinicos.numero_prontuario) || '____________'}</div>
    </div>
  </div>

  <!-- DADOS DO PACIENTE -->
  <div class="bloco">
    <div class="bloco-titulo">Identificação do Paciente</div>
    <div class="bloco-body">
      <div class="campo campo-full" style="margin-bottom:4px"><b>Nome Completo:</b> <span style="font-size:12px;font-weight:700">${v(data.paciente.nome_completo) || '—'}</span></div>
      <div class="grid-3">
        <div class="campo"><b>CPF:</b> <span>${v(data.paciente.cpf) || '—'}</span></div>
        <div class="campo"><b>CNS:</b> <span>${v(data.paciente.cns) || '—'}</span></div>
        <div class="campo"><b>Data Nasc.:</b> <span>${formatarData(data.paciente.data_nascimento)}</span></div>
      </div>
      <div class="grid-4">
        <div class="campo"><b>Idade:</b> <span>${idade}</span></div>
        <div class="campo"><b>Sexo:</b> <span>${v(data.paciente.sexo) || '—'}</span></div>
        <div class="campo"><b>Telefone:</b> <span>${v(data.paciente.telefone) || '—'}</span></div>
        <div class="campo"><b>Responsável:</b> <span>${v(data.paciente.responsavel) || v(data.paciente.nome_mae) || '—'}</span></div>
      </div>
      <div class="grid-2">
        <div class="campo"><b>Endereço:</b> <span>${v(data.paciente.endereco) || '—'}</span></div>
        <div class="campo"><b>Unidade de Origem:</b> <span>${v(data.dadosClinicos.unidade_origem) || '—'}</span></div>
      </div>
    </div>
  </div>

  <!-- ATENDIMENTO -->
  <div class="bloco">
    <div class="bloco-titulo">Dados do Atendimento</div>
    <div class="bloco-body">
      <div class="grid-4">
        <div class="campo"><b>Tipo:</b> <span>${somentePessoais ? '_______________' : (v(data.dadosClinicos.tipo_atendimento) || '—')}</span></div>
        <div class="campo"><b>CID:</b> <span>${somentePessoais ? '_______________' : (v(data.dadosClinicos.cid) || '—')}</span></div>
        <div class="campo"><b>Profissional:</b> <span>${somentePessoais ? '_______________' : (v(data.profissional.nome) || '—')}</span></div>
        <div class="campo"><b>Especialidade:</b> <span>${somentePessoais ? '_______________' : (v(data.dadosClinicos.especialidade) || v(data.profissional.cargo) || '—')}</span></div>
      </div>
      <div class="campo"><b>Encaminhamento:</b> <span>${somentePessoais ? '_______________' : (v(data.dadosClinicos.encaminhamento) || '—')}</span></div>
    </div>
  </div>

  <!-- TRIAGEM / SINAIS VITAIS -->
  <div class="bloco">
    <div class="bloco-titulo">Triagem / Sinais Vitais</div>
    <div class="bloco-body">
      <table class="vitais-table">
        <tbody>
          <tr>
            <td><b>PA</b><span>${somentePessoais ? '___' : (v(data.sinaisVitais.pressao_arterial) || '___')}</span></td>
            <td><b>FC</b><span>${somentePessoais ? '___' : (v(data.sinaisVitais.frequencia_cardiaca) ? v(data.sinaisVitais.frequencia_cardiaca) + ' bpm' : '___')}</span></td>
            <td><b>FR</b><span>${somentePessoais ? '___' : (v(data.sinaisVitais.frequencia_respiratoria) || '___')}</span></td>
            <td><b>Temp</b><span>${somentePessoais ? '___' : (v(data.sinaisVitais.temperatura) ? v(data.sinaisVitais.temperatura) + ' °C' : '___')}</span></td>
          </tr>
          <tr>
            <td><b>SpO₂</b><span>${somentePessoais ? '___' : (v(data.sinaisVitais.saturacao) ? v(data.sinaisVitais.saturacao) + ' %' : '___')}</span></td>
            <td><b>Peso</b><span>${somentePessoais ? '___' : (v(data.sinaisVitais.peso) ? v(data.sinaisVitais.peso) + ' kg' : '___')}</span></td>
            <td><b>Altura</b><span>${somentePessoais ? '___' : (v(data.sinaisVitais.altura) ? v(data.sinaisVitais.altura) + ' m' : '___')}</span></td>
            <td><b>Glicemia</b><span>${somentePessoais ? '___' : (v(data.sinaisVitais.glicemia) ? v(data.sinaisVitais.glicemia) + ' mg/dL' : '___')}</span></td>
          </tr>
        </tbody>
      </table>
    </div>
  </div>

  <!-- QUEIXA PRINCIPAL -->
  <div class="bloco">
    <div class="bloco-titulo">Queixa Principal</div>
    <div class="bloco-body">
      <div class="evo-area" style="min-height:60px">
        <div class="evo-line"></div>
        <div class="evo-line"></div>
        <div class="evo-line"></div>
      </div>
    </div>
  </div>

  <!-- EVOLUÇÃO CLÍNICA -->
  <div class="bloco">
    <div class="bloco-titulo">Evolução Clínica</div>
    <div class="bloco-body">
      <div class="evo-area">
        ${somentePessoais ? Array.from({ length: 8 }, () => '<div class="evo-line"></div>').join('') : evolucaoHTML}
      </div>
    </div>
  </div>

  <!-- CONDUTA -->
  <div class="bloco">
    <div class="bloco-titulo">Conduta / Prescrição</div>
    <div class="bloco-body">
      <div class="conduta-campo"><b>Diagnóstico:</b></div>
      <div class="conduta-linha"></div>
      <div class="conduta-campo"><b>Medicação / Prescrição:</b></div>
      <div class="conduta-linha"></div>
      <div class="conduta-campo"><b>Procedimentos:</b></div>
      <div class="conduta-linha"></div>
      <div class="conduta-campo"><b>Retorno:</b></div>
      <div class="conduta-linha"></div>
    </div>
  </div>

  <!-- ASSINATURA -->
  <div class="assinatura-area">
    <div class="assinatura-data">
      <div>Oriximiná &mdash; PA, ____/____/________</div>
    </div>
    <div class="assinatura-bloco">
      <div class="assinatura-traco"></div>
      <div class="assinatura-nome">${v(data.profissional.nome) || 'Profissional Responsável'}</div>
      <p class="assinatura-label">${v(data.profissional.registro) || 'Registro Profissional'}</p>
    </div>
  </div>

  <!-- RODAPÉ -->
  <div class="rodape">
    SMS Oriximiná &mdash; CER II &mdash; Documento impresso em ${dataAtual} às ${horaAtual} &mdash; ${somentePessoais ? 'Ficha Cadastral' : 'Via do Prontuário'}
  </div>

</body>
</html>`;
  }, [data, somentePessoais]);

  const handlePrint = useCallback(() => {
    const html = buildHTML();
    const win = window.open('', '_blank', 'width=800,height=900');
    if (!win) {
      const iframe = document.createElement('iframe');
      iframe.style.position = 'fixed';
      iframe.style.top = '-9999px';
      iframe.style.left = '-9999px';
      iframe.style.width = '210mm';
      iframe.style.height = '297mm';
      document.body.appendChild(iframe);
      const doc = iframe.contentDocument || iframe.contentWindow?.document;
      if (doc) {
        doc.open();
        doc.write(html);
        doc.close();
        setTimeout(() => {
          iframe.contentWindow?.print();
          setTimeout(() => {
            document.body.removeChild(iframe);
            onPrintComplete?.();
          }, 1000);
        }, 500);
      }
      return;
    }
    win.document.open();
    win.document.write(html);
    win.document.close();
    win.focus();
    setTimeout(() => {
      win.print();
      win.addEventListener('afterprint', () => {
        win.close();
        onPrintComplete?.();
      });
    }, 400);
  }, [buildHTML, onPrintComplete]);

  const idade = calcIdade(data.paciente.data_nascimento);

  return (
    <div className="flex flex-col items-center gap-6 py-4">
      <div className="w-full border rounded-lg bg-white p-6 shadow-sm max-h-[60vh] overflow-y-auto">
        <div className="text-center mb-3 border-b-2 border-foreground/20 pb-3">
          <h2 className="text-xs font-bold uppercase tracking-wide text-foreground">SECRETARIA MUNICIPAL DE SAÚDE DE ORIXIMINÁ</h2>
          <p className="text-[10px] uppercase font-bold text-muted-foreground">CENTRO ESPECIALIZADO EM REABILITAÇÃO II - CER II</p>
          <p className="text-[10px] uppercase text-muted-foreground">{somentePessoais ? 'FICHA CADASTRAL DO PACIENTE' : 'FICHA DE ATENDIMENTO / PRONTUÁRIO'}</p>
        </div>

        <div className="space-y-3 text-sm">
          <div className="border rounded p-3">
            <h3 className="text-[10px] font-bold uppercase text-primary-foreground bg-primary -mx-3 -mt-3 px-3 py-1 rounded-t mb-2">Dados do Paciente</h3>
            <p><span className="text-[9px] font-bold uppercase text-muted-foreground">Nome:</span> {data.paciente.nome_completo || '—'}</p>
            <div className="grid grid-cols-3 gap-2 mt-1">
              <p><span className="text-[9px] font-bold uppercase text-muted-foreground">CPF:</span> {data.paciente.cpf || '—'}</p>
              <p><span className="text-[9px] font-bold uppercase text-muted-foreground">CNS:</span> {data.paciente.cns || '—'}</p>
              <p><span className="text-[9px] font-bold uppercase text-muted-foreground">Nasc.:</span> {formatarData(data.paciente.data_nascimento)}</p>
            </div>
            <div className="grid grid-cols-3 gap-2 mt-1">
              <p><span className="text-[9px] font-bold uppercase text-muted-foreground">Idade:</span> {idade}</p>
              <p><span className="text-[9px] font-bold uppercase text-muted-foreground">Tel.:</span> {data.paciente.telefone || '—'}</p>
              <p><span className="text-[9px] font-bold uppercase text-muted-foreground">Resp.:</span> {data.paciente.responsavel || data.paciente.nome_mae || '—'}</p>
            </div>
          </div>

          {!somentePessoais && (
            <>
              <div className="border rounded p-3">
                <h3 className="text-[10px] font-bold uppercase text-primary-foreground bg-primary -mx-3 -mt-3 px-3 py-1 rounded-t mb-2">Atendimento</h3>
                <div className="grid grid-cols-2 gap-2">
                  <p><span className="text-[9px] font-bold uppercase text-muted-foreground">Tipo:</span> {data.dadosClinicos.tipo_atendimento || '—'}</p>
                  <p><span className="text-[9px] font-bold uppercase text-muted-foreground">CID:</span> {data.dadosClinicos.cid || '—'}</p>
                </div>
                <div className="grid grid-cols-2 gap-2 mt-1">
                  <p><span className="text-[9px] font-bold uppercase text-muted-foreground">Profissional:</span> {data.profissional.nome || '—'}</p>
                  <p><span className="text-[9px] font-bold uppercase text-muted-foreground">Especialidade:</span> {data.dadosClinicos.especialidade || data.profissional.cargo || '—'}</p>
                </div>
              </div>

              <div className="border rounded p-3">
                <h3 className="text-[10px] font-bold uppercase text-primary-foreground bg-primary -mx-3 -mt-3 px-3 py-1 rounded-t mb-2">Triagem / Sinais Vitais</h3>
                <div className="grid grid-cols-4 gap-2 text-xs">
                  <p><strong>PA:</strong> {data.sinaisVitais.pressao_arterial || '—'}</p>
                  <p><strong>FC:</strong> {data.sinaisVitais.frequencia_cardiaca || '—'} bpm</p>
                  <p><strong>Temp:</strong> {data.sinaisVitais.temperatura || '—'} °C</p>
                  <p><strong>SpO₂:</strong> {data.sinaisVitais.saturacao || '—'} %</p>
                  <p><strong>Peso:</strong> {data.sinaisVitais.peso || '—'} kg</p>
                  <p><strong>Altura:</strong> {data.sinaisVitais.altura || '—'} m</p>
                  <p><strong>Glicemia:</strong> {data.sinaisVitais.glicemia || '—'}</p>
                  <p><strong>FR:</strong> {data.sinaisVitais.frequencia_respiratoria || '—'}</p>
                </div>
              </div>

              {data.evoluciones.length > 0 && (
                <div className="border rounded p-3">
                  <h3 className="text-[10px] font-bold uppercase text-primary-foreground bg-primary -mx-3 -mt-3 px-3 py-1 rounded-t mb-2">Evolução Clínica</h3>
                  {data.evoluciones.map((evo, i) => (
                    <div key={i} className="border-b last:border-0 pb-2 mb-2 last:mb-0 last:pb-0">
                      <p className="text-xs text-muted-foreground">{formatarData(evo.data)} — {evo.profissional || '—'}</p>
                      <p className="text-xs">{evo.observacao || '—'}</p>
                    </div>
                  ))}
                </div>
              )}
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
