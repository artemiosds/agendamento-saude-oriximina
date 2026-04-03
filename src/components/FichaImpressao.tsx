import React, { useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Printer } from 'lucide-react';

interface FichaData {
  paciente: {
    nome_completo: string;
    cpf: string;
    cns: string;
    data_nascimento: string;
    nome_mae: string;
    telefone: string;
  };
  dadosClinicos: {
    numero_prontuario: string;
    cid: string;
    tipo_atendimento: string;
    unidade_origem: string;
    unidade_atendimento: string;
    data_atendimento: string;
  };
  sinaisVitais: {
    pressao_arterial: string;
    frequencia_cardiaca: string;
    temperatura: string;
    saturacao: string;
    peso: string;
    altura: string;
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

const campo = (valor: string | undefined): string => {
  if (!valor || valor.trim() === '') return '________________________';
  return valor;
};

interface FichaImpressaoProps {
  data: FichaData;
  onPrintComplete?: () => void;
}

const PRINT_CSS = `
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body {
    font-family: Arial, 'Segoe UI', sans-serif;
    font-size: 11px;
    color: #1a1a1a;
    line-height: 1.6;
    padding: 15mm 15mm 20mm 15mm;
  }
  .header {
    display: flex;
    align-items: center;
    gap: 14px;
    padding-bottom: 8px;
    margin-bottom: 10px;
    border-bottom: 3px double #1e3a5f;
  }
  .header-center { text-align: center; flex: 1; }
  .header-center h1 {
    font-size: 14px;
    font-weight: 700;
    color: #0f172a;
    text-transform: uppercase;
    letter-spacing: 0.5px;
    margin: 0;
  }
  .header-center p {
    font-size: 11px;
    color: #475569;
    font-weight: 600;
    text-transform: uppercase;
    margin: 2px 0 0;
  }
  .header-right {
    text-align: right;
    font-size: 9px;
    color: #64748b;
  }
  .secao {
    border: 1px solid #94a3b8;
    border-radius: 3px;
    padding: 8px 10px;
    margin-bottom: 8px;
    page-break-inside: avoid;
  }
  .secao-titulo {
    font-size: 10px;
    font-weight: 700;
    color: #fff;
    text-transform: uppercase;
    letter-spacing: 0.5px;
    background: #1e3a5f;
    margin: -8px -10px 8px -10px;
    padding: 4px 10px;
    border-radius: 2px 2px 0 0;
  }
  .campo-linha {
    display: flex;
    align-items: baseline;
    margin-bottom: 4px;
  }
  .campo-label {
    font-size: 8.5px;
    color: #475569;
    text-transform: uppercase;
    font-weight: 700;
    margin-right: 5px;
    white-space: nowrap;
  }
  .campo-valor {
    font-size: 11px;
    color: #0f172a;
    flex: 1;
    font-weight: 500;
  }
  .campo-grid-2 {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 3px 14px;
    margin-bottom: 4px;
  }
  .tabela-vitais {
    width: 100%;
    border-collapse: collapse;
    margin-top: 2px;
  }
  .tabela-vitais td {
    border: 1px solid #94a3b8;
    padding: 6px 8px;
    text-align: left;
    font-size: 10px;
  }
  .vitais-label {
    font-weight: 700;
    color: #334155;
    font-size: 9px;
    text-transform: uppercase;
  }
  .bloco-evolucao {
    border: 1px solid #cbd5e1;
    border-radius: 3px;
    padding: 6px 8px;
    margin-bottom: 6px;
    page-break-inside: avoid;
  }
  .bloco-vazio { background: #f8fafc; }
  .evo-header {
    display: flex;
    align-items: baseline;
    font-size: 10px;
    gap: 4px;
  }
  .evo-observacao {
    margin-top: 4px;
    min-height: 28px;
    font-size: 10px;
    color: #334155;
    line-height: 1.5;
  }
  .linha-tracejada {
    border-bottom: 1px dotted #94a3b8;
    min-height: 16px;
    display: block;
    margin-bottom: 14px;
  }
  .secao-assinatura {
    margin-top: 20px;
    text-align: right;
    page-break-inside: avoid;
  }
  .assinatura-bloco {
    display: inline-block;
    text-align: center;
    width: 220px;
  }
  .assinatura-linha {
    border-top: 1px solid #1e293b;
    margin-bottom: 3px;
    padding-top: 28px;
  }
  .assinatura-label {
    font-size: 9px;
    color: #64748b;
    margin: 0;
  }
  .rodape {
    margin-top: 16px;
    padding-top: 6px;
    border-top: 1px solid #94a3b8;
    text-align: center;
    font-size: 8px;
    color: #94a3b8;
  }
  .campo-linha-vertical { margin-bottom: 4px; }
  @page {
    size: A4 portrait;
    margin: 12mm;
  }
`;

export const FichaImpressao: React.FC<FichaImpressaoProps> = ({ data, onPrintComplete }) => {

  const buildHTML = useCallback(() => {
    const now = new Date();
    const dataAtual = formatarData(now.toISOString());
    const horaAtual = now.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });

    const evolucaoHTML = data.evoluciones.length > 0
      ? data.evoluciones.map(evo => `
        <div class="bloco-evolucao">
          <div class="evo-header">
            <span class="campo-label">Data:</span> ${formatarData(evo.data)}
            <span class="campo-label" style="margin-left:16px">Profissional:</span> ${campo(evo.profissional)}
          </div>
          <div class="campo-label" style="margin-top:6px">Observação:</div>
          <div class="evo-observacao">${campo(evo.observacao)}</div>
        </div>
      `).join('')
      : `
        <div class="bloco-evolucao bloco-vazio">
          <div class="evo-header">
            <span class="campo-label">Data:</span> ___/___/______
            <span class="campo-label" style="margin-left:16px">Profissional:</span> ________________________
          </div>
          <div class="campo-label" style="margin-top:6px">Observação:</div>
          <div class="linha-tracejada"></div>
          <div class="linha-tracejada"></div>
        </div>
        <div class="bloco-evolucao bloco-vazio">
          <div class="evo-header">
            <span class="campo-label">Data:</span> ___/___/______
            <span class="campo-label" style="margin-left:16px">Profissional:</span> ________________________
          </div>
          <div class="campo-label" style="margin-top:6px">Observação:</div>
          <div class="linha-tracejada"></div>
          <div class="linha-tracejada"></div>
        </div>
      `;

    return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8" />
  <title>Ficha de Atendimento - ${campo(data.paciente.nome_completo)}</title>
  <style>${PRINT_CSS}</style>
</head>
<body>
  <!-- CABEÇALHO -->
  <div class="header">
    <div class="header-center">
      <h1>SECRETARIA MUNICIPAL DE SAÚDE</h1>
      <p>Ficha de Atendimento Clínico</p>
    </div>
    <div class="header-right">
      <p>Data: ${dataAtual}</p>
      <p>Hora: ${horaAtual}</p>
    </div>
  </div>

  <!-- IDENTIFICAÇÃO -->
  <section class="secao">
    <h2 class="secao-titulo">IDENTIFICAÇÃO DO PACIENTE</h2>
    <div class="campo-linha">
      <span class="campo-label">Nome completo:</span>
      <span class="campo-valor">${campo(data.paciente.nome_completo)}</span>
    </div>
    <div class="campo-grid-2">
      <div class="campo-linha">
        <span class="campo-label">CPF:</span>
        <span class="campo-valor">${campo(data.paciente.cpf)}</span>
      </div>
      <div class="campo-linha">
        <span class="campo-label">CNS (Cartão SUS):</span>
        <span class="campo-valor">${campo(data.paciente.cns)}</span>
      </div>
    </div>
    <div class="campo-grid-2">
      <div class="campo-linha">
        <span class="campo-label">Data de nascimento:</span>
        <span class="campo-valor">${formatarData(data.paciente.data_nascimento)}</span>
      </div>
      <div class="campo-linha">
        <span class="campo-label">Telefone:</span>
        <span class="campo-valor">${campo(data.paciente.telefone)}</span>
      </div>
    </div>
    <div class="campo-linha">
      <span class="campo-label">Nome da mãe:</span>
      <span class="campo-valor">${campo(data.paciente.nome_mae)}</span>
    </div>
  </section>

  <!-- INFORMAÇÕES CLÍNICAS -->
  <section class="secao">
    <h2 class="secao-titulo">INFORMAÇÕES CLÍNICAS</h2>
    <div class="campo-grid-2">
      <div class="campo-linha">
        <span class="campo-label">Nº Prontuário:</span>
        <span class="campo-valor">${campo(data.dadosClinicos.numero_prontuario)}</span>
      </div>
      <div class="campo-linha">
        <span class="campo-label">CID:</span>
        <span class="campo-valor">${campo(data.dadosClinicos.cid)}</span>
      </div>
    </div>
    <div class="campo-grid-2">
      <div class="campo-linha">
        <span class="campo-label">Tipo de atendimento:</span>
        <span class="campo-valor">${campo(data.dadosClinicos.tipo_atendimento)}</span>
      </div>
      <div class="campo-linha">
        <span class="campo-label">Unidade de origem:</span>
        <span class="campo-valor">${campo(data.dadosClinicos.unidade_origem)}</span>
      </div>
    </div>
    <div class="campo-linha">
      <span class="campo-label">Unidade de atendimento:</span>
      <span class="campo-valor">${campo(data.dadosClinicos.unidade_atendimento)}</span>
    </div>
    <div class="campo-linha">
      <span class="campo-label">Data do atendimento:</span>
      <span class="campo-valor">${formatarData(data.dadosClinicos.data_atendimento)}</span>
    </div>
  </section>

  <!-- SINAIS VITAIS -->
  <section class="secao">
    <h2 class="secao-titulo">SINAIS VITAIS</h2>
    <table class="tabela-vitais">
      <tbody>
        <tr>
          <td><span class="vitais-label">P.A.:</span> ${campo(data.sinaisVitais.pressao_arterial)}</td>
          <td><span class="vitais-label">FC:</span> ${campo(data.sinaisVitais.frequencia_cardiaca)} bpm</td>
          <td><span class="vitais-label">Temp.:</span> ${campo(data.sinaisVitais.temperatura)} °C</td>
        </tr>
        <tr>
          <td><span class="vitais-label">Sat.:</span> ${campo(data.sinaisVitais.saturacao)} %</td>
          <td><span class="vitais-label">Peso:</span> ${campo(data.sinaisVitais.peso)} kg</td>
          <td><span class="vitais-label">Altura:</span> ${campo(data.sinaisVitais.altura)} m</td>
        </tr>
      </tbody>
    </table>
  </section>

  <!-- ENCAMINHAMENTO -->
  <section class="secao">
    <h2 class="secao-titulo">ENCAMINHAMENTO</h2>
    <div class="campo-linha">
      <span class="campo-label">Especialidade:</span>
      <span class="campo-valor">________________________</span>
    </div>
    <div class="campo-linha">
      <span class="campo-label">Destino:</span>
      <span class="campo-valor">________________________</span>
    </div>
    <div class="campo-linha-vertical">
      <span class="campo-label">Observação:</span>
      <div class="linha-tracejada"></div>
      <div class="linha-tracejada"></div>
    </div>
  </section>

  <!-- EVOLUÇÃO CLÍNICA -->
  <section class="secao">
    <h2 class="secao-titulo">EVOLUÇÃO CLÍNICA</h2>
    ${evolucaoHTML}
  </section>

  <!-- ASSINATURA -->
  <section class="secao-assinatura">
    <div class="assinatura-bloco">
      <div class="assinatura-linha"></div>
      <p class="assinatura-label">Assinatura</p>
    </div>
    <div class="campo-linha" style="margin-top:12px">
      <span class="campo-label">Nome:</span>
      <span class="campo-valor">${campo(data.profissional.nome)}</span>
    </div>
    <div class="campo-linha">
      <span class="campo-label">Registro (CRM / COREN / Matrícula):</span>
      <span class="campo-valor">${campo(data.profissional.registro)}</span>
    </div>
  </section>

  <!-- RODAPÉ -->
  <div class="rodape">
    Impresso por: ${campo(data.profissional.nome)} — ${campo(data.profissional.cargo)} — ${dataAtual} às ${horaAtual}
  </div>
</body>
</html>`;
  }, [data]);

  const handlePrint = useCallback(() => {
    const html = buildHTML();
    const win = window.open('', '_blank', 'width=800,height=900');
    if (!win) {
      // Fallback: try without popup
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

  return (
    <div className="flex flex-col items-center gap-6 py-4">
      {/* Preview */}
      <div className="w-full border rounded-lg bg-white p-6 shadow-sm max-h-[60vh] overflow-y-auto">
        <div className="text-center mb-4 border-b-2 border-[#1e3a5f] pb-3">
          <h2 className="text-sm font-bold uppercase tracking-wide text-foreground">SECRETARIA MUNICIPAL DE SAÚDE</h2>
          <p className="text-xs text-muted-foreground uppercase font-semibold">Ficha de Atendimento Clínico</p>
        </div>

        <div className="space-y-3 text-sm">
          <div className="border rounded p-3">
            <h3 className="text-xs font-bold uppercase text-white bg-[#1e3a5f] -mx-3 -mt-3 px-3 py-1 rounded-t mb-2">Identificação do Paciente</h3>
            <p><span className="text-xs font-bold uppercase text-muted-foreground">Nome:</span> {data.paciente.nome_completo || '—'}</p>
            <div className="grid grid-cols-2 gap-2 mt-1">
              <p><span className="text-xs font-bold uppercase text-muted-foreground">CPF:</span> {data.paciente.cpf || '—'}</p>
              <p><span className="text-xs font-bold uppercase text-muted-foreground">CNS:</span> {data.paciente.cns || '—'}</p>
            </div>
            <div className="grid grid-cols-2 gap-2 mt-1">
              <p><span className="text-xs font-bold uppercase text-muted-foreground">Nasc.:</span> {formatarData(data.paciente.data_nascimento)}</p>
              <p><span className="text-xs font-bold uppercase text-muted-foreground">Tel.:</span> {data.paciente.telefone || '—'}</p>
            </div>
            <p className="mt-1"><span className="text-xs font-bold uppercase text-muted-foreground">Mãe:</span> {data.paciente.nome_mae || '—'}</p>
          </div>

          <div className="border rounded p-3">
            <h3 className="text-xs font-bold uppercase text-white bg-[#1e3a5f] -mx-3 -mt-3 px-3 py-1 rounded-t mb-2">Informações Clínicas</h3>
            <div className="grid grid-cols-2 gap-2">
              <p><span className="text-xs font-bold uppercase text-muted-foreground">CID:</span> {data.dadosClinicos.cid || '—'}</p>
              <p><span className="text-xs font-bold uppercase text-muted-foreground">Tipo:</span> {data.dadosClinicos.tipo_atendimento || '—'}</p>
            </div>
            <p className="mt-1"><span className="text-xs font-bold uppercase text-muted-foreground">Unidade:</span> {data.dadosClinicos.unidade_atendimento || '—'}</p>
          </div>

          <div className="border rounded p-3">
            <h3 className="text-xs font-bold uppercase text-white bg-[#1e3a5f] -mx-3 -mt-3 px-3 py-1 rounded-t mb-2">Sinais Vitais</h3>
            <div className="grid grid-cols-3 gap-2 text-xs">
              <p><strong>P.A.:</strong> {data.sinaisVitais.pressao_arterial || '—'}</p>
              <p><strong>FC:</strong> {data.sinaisVitais.frequencia_cardiaca || '—'} bpm</p>
              <p><strong>Temp.:</strong> {data.sinaisVitais.temperatura || '—'} °C</p>
              <p><strong>Sat.:</strong> {data.sinaisVitais.saturacao || '—'} %</p>
              <p><strong>Peso:</strong> {data.sinaisVitais.peso || '—'} kg</p>
              <p><strong>Altura:</strong> {data.sinaisVitais.altura || '—'} m</p>
            </div>
          </div>

          {data.evoluciones.length > 0 && (
            <div className="border rounded p-3">
              <h3 className="text-xs font-bold uppercase text-white bg-[#1e3a5f] -mx-3 -mt-3 px-3 py-1 rounded-t mb-2">Evolução Clínica</h3>
              {data.evoluciones.map((evo, i) => (
                <div key={i} className="border-b last:border-0 pb-2 mb-2 last:mb-0 last:pb-0">
                  <p className="text-xs text-muted-foreground">{formatarData(evo.data)} — {evo.profissional || '—'}</p>
                  <p className="text-xs">{evo.observacao || '—'}</p>
                </div>
              ))}
            </div>
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
