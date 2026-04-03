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
const blank = '________________________';

interface FichaImpressaoProps {
  data: FichaData;
  onPrintComplete?: () => void;
}

const PRINT_CSS = `
  * { margin: 0; padding: 0; box-sizing: border-box; }
  @page { size: A4 portrait; margin: 12mm; }
  body {
    font-family: Arial, 'Segoe UI', sans-serif;
    font-size: 12px;
    color: #111;
    line-height: 1.5;
    padding: 15mm;
    width: 210mm;
    min-height: 297mm;
  }

  /* HEADER */
  .header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    border-bottom: 2px solid #000;
    padding-bottom: 8px;
    margin-bottom: 10px;
  }
  .header-left { display: flex; align-items: center; gap: 12px; }
  .titulo { text-align: center; }
  .titulo h1 { font-size: 13px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.3px; margin: 0; }
  .titulo h2 { font-size: 11px; font-weight: 700; text-transform: uppercase; margin: 2px 0; color: #333; }
  .titulo p { font-size: 10px; font-weight: 600; text-transform: uppercase; color: #555; margin: 0; }
  .info-direita { text-align: right; font-size: 10px; color: #333; line-height: 1.6; }

  /* BLOCOS */
  .bloco {
    margin-top: 8px;
    border: 1px solid #000;
    padding: 0;
    page-break-inside: avoid;
  }
  .bloco-titulo {
    font-size: 10px;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.5px;
    background: #1e3a5f;
    color: #fff;
    padding: 4px 10px;
    margin: 0;
  }
  .bloco-body { padding: 6px 10px; }

  /* GRID */
  .grid-2 { display: grid; grid-template-columns: 1fr 1fr; gap: 2px 16px; }
  .grid-3 { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 2px 12px; }
  .grid-4 { display: grid; grid-template-columns: repeat(4, 1fr); gap: 2px 8px; }

  /* CAMPOS */
  .campo { margin-bottom: 3px; font-size: 11px; }
  .campo b { font-size: 9px; text-transform: uppercase; color: #333; font-weight: 700; margin-right: 4px; }
  .campo span { color: #000; font-weight: 500; }
  .campo-full { grid-column: 1 / -1; }

  /* SINAIS VITAIS TABLE */
  .vitais-table { width: 100%; border-collapse: collapse; margin-top: 2px; }
  .vitais-table td {
    border: 1px solid #999;
    padding: 5px 8px;
    font-size: 11px;
    text-align: left;
    width: 25%;
  }
  .vitais-table td b { font-size: 9px; text-transform: uppercase; color: #333; font-weight: 700; }

  /* BOXES */
  .box-grande { min-height: 80px; border: 1px solid #999; margin: 4px 0; padding: 4px 6px; font-size: 11px; }
  .box-evolucao { min-height: 150px; border: 1px solid #999; margin: 4px 0; padding: 4px 6px; font-size: 11px; }

  /* CONDUTA */
  .linha-conduta { border-bottom: 1px solid #999; min-height: 22px; margin-bottom: 6px; padding: 2px 0; font-size: 11px; }

  /* ASSINATURA */
  .assinatura-area { margin-top: 24px; text-align: center; page-break-inside: avoid; }
  .assinatura-traco { border-top: 1px solid #000; width: 250px; margin: 0 auto; padding-top: 4px; }
  .assinatura-label { font-size: 10px; color: #555; margin: 0; }

  /* RODAPE */
  .rodape {
    margin-top: 12px;
    padding-top: 4px;
    border-top: 1px solid #999;
    text-align: center;
    font-size: 8px;
    color: #999;
  }

  /* EVOLUCAO PREENCHIDA */
  .evo-item { border-bottom: 1px solid #ddd; padding: 4px 0; margin-bottom: 2px; }
  .evo-item:last-child { border-bottom: none; }
  .evo-meta { font-size: 10px; color: #555; }
  .evo-text { font-size: 11px; margin-top: 2px; }
`;

export const FichaImpressao: React.FC<FichaImpressaoProps> = ({ data, onPrintComplete }) => {

  const buildHTML = useCallback(() => {
    const now = new Date();
    const dataAtual = formatarData(now.toISOString());
    const horaAtual = now.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
    const idade = calcIdade(data.paciente.data_nascimento);

    const evolucaoHTML = data.evoluciones.length > 0
      ? data.evoluciones.map(evo => `
        <div class="evo-item">
          <div class="evo-meta"><b>Data:</b> ${formatarData(evo.data)} &nbsp; <b>Profissional:</b> ${v(evo.profissional) || blank}</div>
          <div class="evo-text">${v(evo.observacao) || '—'}</div>
        </div>
      `).join('')
      : `
        <div style="min-height:140px; color:#aaa; font-style:italic; padding-top:8px;">
          (Espaço para evolução clínica)
        </div>
      `;

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
    <div class="header-left">
      <div class="titulo">
        <h1>SECRETARIA MUNICIPAL DE SAÚDE DE ORIXIMINÁ</h1>
        <h2>CENTRO ESPECIALIZADO EM REABILITAÇÃO II - CER</h2>
        <p>FICHA DE ATENDIMENTO / PRONTUÁRIO</p>
      </div>
    </div>
    <div class="info-direita">
      <p><b>Data:</b> ${dataAtual}</p>
      <p><b>Hora:</b> ${horaAtual}</p>
      <p><b>Prontuário:</b> ${v(data.dadosClinicos.numero_prontuario) || '____________'}</p>
    </div>
  </div>

  <!-- DADOS DO PACIENTE -->
  <div class="bloco">
    <div class="bloco-titulo">DADOS DO PACIENTE</div>
    <div class="bloco-body">
      <div class="grid-2">
        <div class="campo campo-full"><b>Nome:</b> <span>${v(data.paciente.nome_completo) || blank}</span></div>
      </div>
      <div class="grid-3">
        <div class="campo"><b>CPF:</b> <span>${v(data.paciente.cpf) || blank}</span></div>
        <div class="campo"><b>CNS:</b> <span>${v(data.paciente.cns) || blank}</span></div>
        <div class="campo"><b>Data Nasc.:</b> <span>${formatarData(data.paciente.data_nascimento)}</span></div>
      </div>
      <div class="grid-3">
        <div class="campo"><b>Idade:</b> <span>${idade}</span></div>
        <div class="campo"><b>Sexo:</b> <span>${v(data.paciente.sexo) || '________'}</span></div>
        <div class="campo"><b>Telefone:</b> <span>${v(data.paciente.telefone) || blank}</span></div>
      </div>
      <div class="grid-2">
        <div class="campo"><b>Responsável:</b> <span>${v(data.paciente.responsavel) || v(data.paciente.nome_mae) || blank}</span></div>
        <div class="campo"><b>Endereço:</b> <span>${v(data.paciente.endereco) || blank}</span></div>
      </div>
      <div class="campo"><b>Unidade de Origem:</b> <span>${v(data.dadosClinicos.unidade_origem) || blank}</span></div>
    </div>
  </div>

  <!-- ATENDIMENTO -->
  <div class="bloco">
    <div class="bloco-titulo">ATENDIMENTO</div>
    <div class="bloco-body">
      <div class="grid-2">
        <div class="campo"><b>Tipo:</b> <span>${v(data.dadosClinicos.tipo_atendimento) || blank}</span></div>
        <div class="campo"><b>CID:</b> <span>${v(data.dadosClinicos.cid) || blank}</span></div>
      </div>
      <div class="grid-2">
        <div class="campo"><b>Profissional:</b> <span>${v(data.profissional.nome) || blank}</span></div>
        <div class="campo"><b>Especialidade:</b> <span>${v(data.dadosClinicos.especialidade) || v(data.profissional.cargo) || blank}</span></div>
      </div>
      <div class="campo"><b>Encaminhamento:</b> <span>${v(data.dadosClinicos.encaminhamento) || blank}</span></div>
    </div>
  </div>

  <!-- TRIAGEM / SINAIS VITAIS -->
  <div class="bloco">
    <div class="bloco-titulo">TRIAGEM / SINAIS VITAIS</div>
    <div class="bloco-body">
      <table class="vitais-table">
        <tbody>
          <tr>
            <td><b>PA:</b> ${v(data.sinaisVitais.pressao_arterial) || '______'}</td>
            <td><b>Temp:</b> ${v(data.sinaisVitais.temperatura) ? v(data.sinaisVitais.temperatura) + ' °C' : '______'}</td>
            <td><b>FC:</b> ${v(data.sinaisVitais.frequencia_cardiaca) ? v(data.sinaisVitais.frequencia_cardiaca) + ' bpm' : '______'}</td>
            <td><b>FR:</b> ${v(data.sinaisVitais.frequencia_respiratoria) || '______'}</td>
          </tr>
          <tr>
            <td><b>SpO₂:</b> ${v(data.sinaisVitais.saturacao) ? v(data.sinaisVitais.saturacao) + ' %' : '______'}</td>
            <td><b>Peso:</b> ${v(data.sinaisVitais.peso) ? v(data.sinaisVitais.peso) + ' kg' : '______'}</td>
            <td><b>Altura:</b> ${v(data.sinaisVitais.altura) ? v(data.sinaisVitais.altura) + ' m' : '______'}</td>
            <td><b>Glicemia:</b> ${v(data.sinaisVitais.glicemia) ? v(data.sinaisVitais.glicemia) + ' mg/dL' : '______'}</td>
          </tr>
        </tbody>
      </table>
    </div>
  </div>

  <!-- QUEIXA PRINCIPAL -->
  <div class="bloco">
    <div class="bloco-titulo">QUEIXA PRINCIPAL</div>
    <div class="bloco-body">
      <div class="box-grande"></div>
    </div>
  </div>

  <!-- OBSERVAÇÃO CLÍNICA -->
  <div class="bloco">
    <div class="bloco-titulo">OBSERVAÇÃO CLÍNICA</div>
    <div class="bloco-body">
      <div class="box-grande"></div>
    </div>
  </div>

  <!-- EVOLUÇÃO -->
  <div class="bloco">
    <div class="bloco-titulo">EVOLUÇÃO</div>
    <div class="bloco-body">
      <div class="box-evolucao">
        ${evolucaoHTML}
      </div>
    </div>
  </div>

  <!-- CONDUTA -->
  <div class="bloco">
    <div class="bloco-titulo">CONDUTA</div>
    <div class="bloco-body">
      <div class="campo" style="margin-bottom:2px"><b>Diagnóstico:</b></div>
      <div class="linha-conduta"></div>
      <div class="campo" style="margin-bottom:2px"><b>Medicação:</b></div>
      <div class="linha-conduta"></div>
      <div class="campo" style="margin-bottom:2px"><b>Procedimentos:</b></div>
      <div class="linha-conduta"></div>
    </div>
  </div>

  <!-- ASSINATURA -->
  <div class="assinatura-area">
    <div class="assinatura-traco"></div>
    <p class="assinatura-label">Profissional Responsável</p>
    <p style="font-size:10px; margin-top:2px;">${v(data.profissional.nome) || ''} ${v(data.profissional.registro) ? '— ' + v(data.profissional.registro) : ''}</p>
  </div>

  <!-- RODAPÉ -->
  <div class="rodape">
    SMS Oriximiná — CER II — Impresso em ${dataAtual} às ${horaAtual}
  </div>

</body>
</html>`;
  }, [data]);

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
      {/* Preview */}
      <div className="w-full border rounded-lg bg-white p-6 shadow-sm max-h-[60vh] overflow-y-auto">
        {/* Header preview */}
        <div className="text-center mb-3 border-b-2 border-foreground/20 pb-3">
          <h2 className="text-xs font-bold uppercase tracking-wide text-foreground">SECRETARIA MUNICIPAL DE SAÚDE DE ORIXIMINÁ</h2>
          <p className="text-[10px] uppercase font-bold text-muted-foreground">CENTRO ESPECIALIZADO EM REABILITAÇÃO II - CER</p>
          <p className="text-[10px] uppercase text-muted-foreground">FICHA DE ATENDIMENTO / PRONTUÁRIO</p>
        </div>

        <div className="space-y-3 text-sm">
          {/* Dados do Paciente */}
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

          {/* Atendimento */}
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

          {/* Sinais Vitais */}
          <div className="border rounded p-3">
            <h3 className="text-[10px] font-bold uppercase text-primary-foreground bg-primary -mx-3 -mt-3 px-3 py-1 rounded-t mb-2">Triagem / Sinais Vitais</h3>
            <div className="grid grid-cols-4 gap-2 text-xs">
              <p><strong>PA:</strong> {data.sinaisVitais.pressao_arterial || '—'}</p>
              <p><strong>Temp:</strong> {data.sinaisVitais.temperatura || '—'} °C</p>
              <p><strong>FC:</strong> {data.sinaisVitais.frequencia_cardiaca || '—'} bpm</p>
              <p><strong>SpO₂:</strong> {data.sinaisVitais.saturacao || '—'} %</p>
              <p><strong>Peso:</strong> {data.sinaisVitais.peso || '—'} kg</p>
              <p><strong>Altura:</strong> {data.sinaisVitais.altura || '—'} m</p>
              <p><strong>Glicemia:</strong> {data.sinaisVitais.glicemia || '—'}</p>
            </div>
          </div>

          {/* Evolução */}
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
