import React, { useEffect, useRef } from 'react';
import logoSms from '@/assets/logo-sms.jpeg';

interface FichaImpressaoProps {
  paciente: {
    nomeCompleto: string;
    cpf: string;
    cns: string;
    dataNascimento: string;
    nomeMae: string;
    telefone: string;
  };
  dadosClinicos: {
    numeroProntuario: string;
    cid: string;
    tipoAtendimento: string;
    unidadeOrigem: string;
    unidadeAtendimento: string;
    dataAtendimento: string;
  };
  sinaisVitais: {
    pressaoArterial: string;
    frequenciaCardiaca: string;
    temperatura: string;
    saturacao: string;
    peso: string;
    altura: string;
  };
  evolucoesClinicas: {
    data: string;
    observacao: string;
    profissionalResponsavel: string;
  }[];
  nomeProfissional: string;
  perfilProfissional: string;
  registroProfissional: string;
  unidadeSaude?: string;
  onPrintComplete?: () => void;
}

const BLANK = '___________';

const FichaImpressao: React.FC<FichaImpressaoProps> = ({
  paciente,
  dadosClinicos,
  sinaisVitais,
  evolucoesClinicas,
  nomeProfissional,
  perfilProfissional,
  registroProfissional,
  unidadeSaude,
  onPrintComplete,
}) => {
  const fichaRef = useRef<HTMLDivElement>(null);
  const now = new Date();
  const dataEmissao = now.toLocaleDateString('pt-BR');
  const horaEmissao = now.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });

  useEffect(() => {
    // Auto-trigger print after a short delay to ensure rendering
    const timer = setTimeout(() => {
      window.print();
    }, 500);

    const handleAfterPrint = () => {
      onPrintComplete?.();
    };
    window.addEventListener('afterprint', handleAfterPrint);
    return () => {
      clearTimeout(timer);
      window.removeEventListener('afterprint', handleAfterPrint);
    };
  }, [onPrintComplete]);

  return (
    <>
      <style>{`
        @media print {
          body * { visibility: hidden !important; }
          #ficha-impressao,
          #ficha-impressao * { visibility: visible !important; }
          #ficha-impressao {
            position: absolute !important;
            left: 0 !important;
            top: 0 !important;
            width: 100% !important;
            margin: 0 !important;
            padding: 0 !important;
            background: white !important;
          }
          .no-print { display: none !important; }
          .print-only { display: block !important; }
          @page {
            size: A4 portrait;
            margin: 15mm 15mm 20mm 15mm;
          }
          .secao { page-break-inside: avoid; }
          table { page-break-inside: avoid; }
        }
        .print-only { display: none; }
        .ficha-container {
          font-family: Arial, sans-serif;
          font-size: 11px;
          color: #1a1a1a;
          max-width: 210mm;
          margin: 0 auto;
          padding: 12mm;
          background: white;
        }
        .ficha-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding-bottom: 10px;
          border-bottom: 2px solid #333;
          margin-bottom: 16px;
        }
        .ficha-logo {
          width: 60px;
          height: 60px;
          object-fit: contain;
        }
        .ficha-logo-fallback {
          width: 60px;
          height: 60px;
          display: flex;
          align-items: center;
          justify-content: center;
          font-weight: bold;
          font-size: 9px;
          text-align: center;
          color: #333;
          border: 1px solid #ccc;
          border-radius: 4px;
        }
        .ficha-title {
          text-align: center;
          flex: 1;
          padding: 0 16px;
        }
        .ficha-title h1 {
          font-size: 14px;
          font-weight: bold;
          margin: 0 0 2px 0;
          color: #000;
          text-transform: uppercase;
        }
        .ficha-title h2 {
          font-size: 12px;
          font-weight: bold;
          margin: 0 0 4px 0;
          color: #111;
        }
        .ficha-title h3 {
          font-size: 10px;
          font-weight: normal;
          margin: 0;
          color: #444;
        }
        .ficha-date {
          text-align: right;
          font-size: 10px;
          color: #555;
          min-width: 120px;
        }
        .secao {
          border: 1px solid #ccc;
          padding: 10px 12px;
          margin-bottom: 12px;
          border-radius: 2px;
        }
        .secao-title {
          font-size: 11px;
          font-weight: bold;
          color: #222;
          margin: 0 0 8px 0;
          padding-bottom: 4px;
          border-bottom: 1px solid #eee;
          text-transform: uppercase;
        }
        .field-row {
          display: flex;
          flex-wrap: wrap;
          margin-bottom: 6px;
        }
        .field {
          flex: 1;
          min-width: 200px;
          margin-bottom: 4px;
        }
        .field-label {
          font-size: 9px;
          color: #666;
          text-transform: uppercase;
          margin-bottom: 2px;
        }
        .field-value {
          font-size: 11px;
          color: #111;
          min-height: 16px;
        }
        .field-value.blank {
          color: #999;
        }
        .vitals-table {
          width: 100%;
          border-collapse: collapse;
          margin-top: 4px;
        }
        .vitals-table td {
          border: 1px solid #ccc;
          padding: 6px 8px;
          font-size: 11px;
        }
        .vitals-table td:first-child {
          font-weight: bold;
          color: #444;
          width: 120px;
        }
        .evolucao-bloco {
          border: 1px solid #ddd;
          padding: 8px;
          margin-bottom: 8px;
          border-radius: 2px;
        }
        .evolucao-header {
          display: flex;
          justify-content: space-between;
          font-size: 10px;
          color: #555;
          margin-bottom: 6px;
          padding-bottom: 4px;
          border-bottom: 1px dashed #eee;
        }
        .evolucao-text {
          font-size: 11px;
          color: #111;
          white-space: pre-wrap;
          min-height: 40px;
        }
        .evolucao-blank {
          color: #999;
          font-style: italic;
        }
        .signature-section {
          margin-top: 30px;
          text-align: right;
          padding-right: 20px;
        }
        .signature-line {
          margin-bottom: 8px;
          font-size: 11px;
        }
        .signature-line span {
          display: inline-block;
          width: 250px;
          border-bottom: 1px solid #333;
          margin-left: 8px;
        }
        .print-footer {
          margin-top: 20px;
          padding-top: 8px;
          border-top: 1px solid #999;
          text-align: center;
          font-size: 9px;
          color: #666;
        }
        .triagem-note {
          font-size: 9px;
          color: #888;
          font-style: italic;
          margin-bottom: 6px;
        }
      `}</style>

      <div id="ficha-impressao" className="ficha-container" ref={fichaRef}>
        {/* CABEÇALHO */}
        <div className="ficha-header">
          <div>
            <img
              src={logoSms}
              alt="Logo SMS"
              className="ficha-logo"
              onError={(e) => {
                (e.target as HTMLImageElement).style.display = 'none';
                const fallback = e.target.nextElementSibling as HTMLElement;
                if (fallback) fallback.style.display = 'flex';
              }}
            />
            <div className="ficha-logo-fallback" style={{ display: 'none' }}>
              SECRETARIA<br />MUNICIPAL<br />DE SAÚDE
            </div>
          </div>
          <div className="ficha-title">
            <h1>{unidadeSaude || 'SECRETARIA MUNICIPAL DE SAÚDE'}</h1>
            <h2>FICHA DE ATENDIMENTO CLÍNICO</h2>
            <h3>Registro de Atendimento ao Paciente</h3>
          </div>
          <div className="ficha-date">
            <div>Data de emissão: {dataEmissao}</div>
            <div>Hora: {horaEmissao}</div>
          </div>
        </div>

        {/* SEÇÃO 1 — IDENTIFICAÇÃO DO PACIENTE */}
        <div className="secao">
          <h3 className="secao-title">Identificação do Paciente</h3>
          <div className="field-row">
            <div className="field" style={{ flex: '2' }}>
              <div className="field-label">Nome Completo</div>
              <div className={`field-value ${!paciente.nomeCompleto ? 'blank' : ''}`}>
                {paciente.nomeCompleto || BLANK}
              </div>
            </div>
          </div>
          <div className="field-row">
            <div className="field">
              <div className="field-label">CPF</div>
              <div className={`field-value ${!paciente.cpf ? 'blank' : ''}`}>
                {paciente.cpf || BLANK}
              </div>
            </div>
            <div className="field">
              <div className="field-label">CNS (Cartão SUS)</div>
              <div className={`field-value ${!paciente.cns ? 'blank' : ''}`}>
                {paciente.cns || BLANK}
              </div>
            </div>
          </div>
          <div className="field-row">
            <div className="field">
              <div className="field-label">Data de Nascimento</div>
              <div className={`field-value ${!paciente.dataNascimento ? 'blank' : ''}`}>
                {paciente.dataNascimento || BLANK}
              </div>
            </div>
            <div className="field">
              <div className="field-label">Telefone</div>
              <div className={`field-value ${!paciente.telefone ? 'blank' : ''}`}>
                {paciente.telefone || BLANK}
              </div>
            </div>
          </div>
          <div className="field-row">
            <div className="field" style={{ flex: '2' }}>
              <div className="field-label">Nome da Mãe</div>
              <div className={`field-value ${!paciente.nomeMae ? 'blank' : ''}`}>
                {paciente.nomeMae || BLANK}
              </div>
            </div>
          </div>
        </div>

        {/* SEÇÃO 2 — INFORMAÇÕES CLÍNICAS */}
        <div className="secao">
          <h3 className="secao-title">Informações Clínicas</h3>
          <div className="field-row">
            <div className="field">
              <div className="field-label">Nº Prontuário</div>
              <div className={`field-value ${!dadosClinicos.numeroProntuario ? 'blank' : ''}`}>
                {dadosClinicos.numeroProntuario || BLANK}
              </div>
            </div>
            <div className="field">
              <div className="field-label">CID</div>
              <div className={`field-value ${!dadosClinicos.cid ? 'blank' : ''}`}>
                {dadosClinicos.cid || BLANK}
              </div>
            </div>
          </div>
          <div className="field-row">
            <div className="field">
              <div className="field-label">Tipo de Atendimento</div>
              <div className={`field-value ${!dadosClinicos.tipoAtendimento ? 'blank' : ''}`}>
                {dadosClinicos.tipoAtendimento || BLANK}
              </div>
            </div>
          </div>
          <div className="field-row">
            <div className="field">
              <div className="field-label">Unidade de Origem</div>
              <div className={`field-value ${!dadosClinicos.unidadeOrigem ? 'blank' : ''}`}>
                {dadosClinicos.unidadeOrigem || BLANK}
              </div>
            </div>
            <div className="field">
              <div className="field-label">Unidade de Atendimento</div>
              <div className={`field-value ${!dadosClinicos.unidadeAtendimento ? 'blank' : ''}`}>
                {dadosClinicos.unidadeAtendimento || BLANK}
              </div>
            </div>
          </div>
          <div className="field-row">
            <div className="field">
              <div className="field-label">Data do Atendimento</div>
              <div className={`field-value ${!dadosClinicos.dataAtendimento ? 'blank' : ''}`}>
                {dadosClinicos.dataAtendimento || BLANK}
              </div>
            </div>
          </div>
        </div>

        {/* SEÇÃO 3 — SINAIS VITAIS */}
        <div className="secao">
          <h3 className="secao-title">Sinais Vitais</h3>
          <p className="triagem-note no-print">
            Dados preenchidos automaticamente se paciente passou pela triagem.
          </p>
          <table className="vitals-table">
            <tbody>
              <tr>
                <td>P.A.</td>
                <td className={!sinaisVitais.pressaoArterial ? 'blank' : ''}>
                  {sinaisVitais.pressaoArterial || BLANK}
                </td>
                <td>FC</td>
                <td className={!sinaisVitais.frequenciaCardiaca ? 'blank' : ''}>
                  {sinaisVitais.frequenciaCardiaca ? `${sinaisVitais.frequenciaCardiaca} bpm` : BLANK}
                </td>
                <td>Temp.</td>
                <td className={!sinaisVitais.temperatura ? 'blank' : ''}>
                  {sinaisVitais.temperatura ? `${sinaisVitais.temperatura} °C` : BLANK}
                </td>
              </tr>
              <tr>
                <td>Sat. O₂</td>
                <td className={!sinaisVitais.saturacao ? 'blank' : ''}>
                  {sinaisVitais.saturacao ? `${sinaisVitais.saturacao} %` : BLANK}
                </td>
                <td>Peso</td>
                <td className={!sinaisVitais.peso ? 'blank' : ''}>
                  {sinaisVitais.peso ? `${sinaisVitais.peso} kg` : BLANK}
                </td>
                <td>Altura</td>
                <td className={!sinaisVitais.altura ? 'blank' : ''}>
                  {sinaisVitais.altura ? `${sinaisVitais.altura} m` : BLANK}
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        {/* SEÇÃO 4 — ENCAMINHAMENTO */}
        <div className="secao">
          <h3 className="secao-title">Encaminhamento</h3>
          <div className="field-row">
            <div className="field">
              <div className="field-label">Especialidade</div>
              <div className="field-value blank">{BLANK}</div>
            </div>
            <div className="field">
              <div className="field-label">Destino</div>
              <div className="field-value blank">{BLANK}</div>
            </div>
          </div>
          <div className="field-row">
            <div className="field" style={{ flex: '1' }}>
              <div className="field-label">Observação</div>
              <div className="field-value blank" style={{ minHeight: '32px' }}>
                {BLANK}
              </div>
            </div>
          </div>
        </div>

        {/* SEÇÃO 5 — EVOLUÇÃO CLÍNICA */}
        <div className="secao">
          <h3 className="secao-title">Evolução Clínica</h3>
          {evolucoesClinicas.length > 0 ? (
            evolucoesClinicas.map((ev, idx) => (
              <div key={idx} className="evolucao-bloco">
                <div className="evolucao-header">
                  <span>Data: {ev.data || BLANK}</span>
                  <span>Profissional: {ev.profissionalResponsavel || BLANK}</span>
                </div>
                <div className="evolucao-text">
                  {ev.observacao || <span className="evolucao-blank">{BLANK}</span>}
                </div>
              </div>
            ))
          ) : (
            <>
              <div className="evolucao-bloco">
                <div className="evolucao-header">
                  <span>Data: {BLANK}</span>
                  <span>Profissional: {BLANK}</span>
                </div>
                <div className="evolucao-text evolucao-blank">
                  {BLANK}
                </div>
              </div>
              <div className="evolucao-bloco">
                <div className="evolucao-header">
                  <span>Data: {BLANK}</span>
                  <span>Profissional: {BLANK}</span>
                </div>
                <div className="evolucao-text evolucao-blank">
                  {BLANK}
                </div>
              </div>
            </>
          )}
        </div>

        {/* SEÇÃO 6 — ASSINATURA DO PROFISSIONAL */}
        <div className="signature-section">
          <div className="signature-line">
            Assinatura: <span>&nbsp;</span>
          </div>
          <div className="signature-line">
            Nome: <span>{nomeProfissional || BLANK}</span>
          </div>
          <div className="signature-line">
            Registro (CRM / COREN / Matrícula): <span>{registroProfissional || BLANK}</span>
          </div>
        </div>

        {/* RODAPÉ — apenas na impressão */}
        <div className="print-footer print-only">
          Impresso por: {nomeProfissional || '___________'} — {perfilProfissional || '___________'} — {dataEmissao} às {horaEmissao}
        </div>
      </div>
    </>
  );
};

export default FichaImpressao;