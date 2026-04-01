import React, { useEffect, useRef } from 'react';
import logoSms from '@/assets/logo-sms.jpeg';

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
  if (!data) return '___________';
  try {
    const d = new Date(data.length <= 10 ? data + 'T12:00:00' : data);
    if (isNaN(d.getTime())) return '___________';
    return d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' });
  } catch {
    return '___________';
  }
};

const formatarHora = (data: string): string => {
  if (!data) return '__:__';
  try {
    const d = new Date(data);
    if (isNaN(d.getTime())) return '__:__';
    return d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
  } catch {
    return '__:__';
  }
};

const campo = (valor: string | undefined): string => {
  if (!valor || valor.trim() === '') return '___________';
  return valor;
};

interface FichaImpressaoProps {
  data: FichaData;
  onPrintComplete?: () => void;
}

export const FichaImpressao: React.FC<FichaImpressaoProps> = ({ data, onPrintComplete }) => {
  const fichaRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleAfterPrint = () => {
      onPrintComplete?.();
    };

    window.addEventListener('afterprint', handleAfterPrint);

    const timer = setTimeout(() => {
      window.print();
    }, 300);

    return () => {
      clearTimeout(timer);
      window.removeEventListener('afterprint', handleAfterPrint);
    };
  }, [onPrintComplete]);

  const logoSrc = logoSms.startsWith('http') || logoSms.startsWith('/') ? logoSms : logoSms;

  return (
    <div id="ficha-impressao" ref={fichaRef} className="ficha-container">
      {/* CABEÇALHO */}
      <header className="ficha-header">
        <div className="header-col header-logo">
          <img src={logoSrc} alt="Logo SMS" className="logo-img" />
        </div>
        <div className="header-col header-center">
          <h1 className="unidade-nome">SECRETARIA MUNICIPAL DE SAÚDE</h1>
          <p className="ficha-titulo">FICHA DE ATENDIMENTO CLÍNICO</p>
        </div>
        <div className="header-col header-right">
          <p className="header-info">Data: {formatarData(new Date().toISOString())}</p>
          <p className="header-info">Hora: {formatarHora(new Date().toISOString())}</p>
        </div>
      </header>

      {/* SEÇÃO 1 — IDENTIFICAÇÃO */}
      <section className="secao">
        <h2 className="secao-titulo">IDENTIFICAÇÃO DO PACIENTE</h2>
        <div className="campo-linha">
          <span className="campo-label">Nome completo:</span>
          <span className="campo-valor">{campo(data.paciente.nome_completo)}</span>
        </div>
        <div className="campo-grid-2">
          <div className="campo-linha">
            <span className="campo-label">CPF:</span>
            <span className="campo-valor">{campo(data.paciente.cpf)}</span>
          </div>
          <div className="campo-linha">
            <span className="campo-label">CNS (Cartão SUS):</span>
            <span className="campo-valor">{campo(data.paciente.cns)}</span>
          </div>
        </div>
        <div className="campo-grid-2">
          <div className="campo-linha">
            <span className="campo-label">Data de nascimento:</span>
            <span className="campo-valor">{formatarData(data.paciente.data_nascimento)}</span>
          </div>
          <div className="campo-linha">
            <span className="campo-label">Telefone:</span>
            <span className="campo-valor">{campo(data.paciente.telefone)}</span>
          </div>
        </div>
        <div className="campo-linha">
          <span className="campo-label">Nome da mãe:</span>
          <span className="campo-valor">{campo(data.paciente.nome_mae)}</span>
        </div>
      </section>

      {/* SEÇÃO 2 — INFORMAÇÕES CLÍNICAS */}
      <section className="secao">
        <h2 className="secao-titulo">INFORMAÇÕES CLÍNICAS</h2>
        <div className="campo-grid-2">
          <div className="campo-linha">
            <span className="campo-label">Nº Prontuário:</span>
            <span className="campo-valor">{campo(data.dadosClinicos.numero_prontuario)}</span>
          </div>
          <div className="campo-linha">
            <span className="campo-label">CID:</span>
            <span className="campo-valor">{campo(data.dadosClinicos.cid)}</span>
          </div>
        </div>
        <div className="campo-grid-2">
          <div className="campo-linha">
            <span className="campo-label">Tipo de atendimento:</span>
            <span className="campo-valor">{campo(data.dadosClinicos.tipo_atendimento)}</span>
          </div>
          <div className="campo-linha">
            <span className="campo-label">Unidade de origem:</span>
            <span className="campo-valor">{campo(data.dadosClinicos.unidade_origem)}</span>
          </div>
        </div>
        <div className="campo-linha">
          <span className="campo-label">Unidade de atendimento:</span>
          <span className="campo-valor">{campo(data.dadosClinicos.unidade_atendimento)}</span>
        </div>
        <div className="campo-linha">
          <span className="campo-label">Data do atendimento:</span>
          <span className="campo-valor">{formatarData(data.dadosClinicos.data_atendimento)}</span>
        </div>
      </section>

      {/* SEÇÃO 3 — SINAIS VITAIS */}
      <section className="secao">
        <h2 className="secao-titulo">SINAIS VITAIS</h2>
        <p className="no-print nota-triagem">
          Dados preenchidos automaticamente se paciente passou pela triagem.
        </p>
        <table className="tabela-vitais">
          <tbody>
            <tr>
              <td className="vitais-celula">
                <span className="vitais-label">P.A.:</span> {campo(data.sinaisVitais.pressao_arterial)}
              </td>
              <td className="vitais-celula">
                <span className="vitais-label">FC:</span> {campo(data.sinaisVitais.frequencia_cardiaca)} bpm
              </td>
              <td className="vitais-celula">
                <span className="vitais-label">Temp.:</span> {campo(data.sinaisVitais.temperatura)} °C
              </td>
            </tr>
            <tr>
              <td className="vitais-celula">
                <span className="vitais-label">Sat.:</span> {campo(data.sinaisVitais.saturacao)} %
              </td>
              <td className="vitais-celula">
                <span className="vitais-label">Peso:</span> {campo(data.sinaisVitais.peso)} kg
              </td>
              <td className="vitais-celula">
                <span className="vitais-label">Altura:</span> {campo(data.sinaisVitais.altura)} m
              </td>
            </tr>
          </tbody>
        </table>
      </section>

      {/* SEÇÃO 4 — ENCAMINHAMENTO */}
      <section className="secao">
        <h2 className="secao-titulo">ENCAMINHAMENTO</h2>
        <div className="campo-linha">
          <span className="campo-label">Especialidade:</span>
          <span className="campo-valor linha-tracejada">___________</span>
        </div>
        <div className="campo-linha">
          <span className="campo-label">Destino:</span>
          <span className="campo-valor linha-tracejada">___________</span>
        </div>
        <div className="campo-linha-vertical">
          <span className="campo-label">Observação:</span>
          <div className="linha-tracejada-multipla">
            <div className="linha-tracejada"></div>
            <div className="linha-tracejada"></div>
          </div>
        </div>
      </section>

      {/* SEÇÃO 5 — EVOLUÇÃO CLÍNICA */}
      <section className="secao">
        <h2 className="secao-titulo">EVOLUÇÃO CLÍNICA</h2>
        {data.evoluciones.length > 0 ? (
          data.evoluciones.map((evo, idx) => (
            <div key={idx} className="bloco-evolucao">
              <div className="evo-header">
                <span className="campo-label">Data:</span> {formatarData(evo.data)}
                <span className="campo-label" style={{ marginLeft: '16px' }}>Profissional:</span> {campo(evo.profissional)}
              </div>
              <div className="campo-label" style={{ marginTop: '6px' }}>Observação:</div>
              <div className="evo-observacao">{campo(evo.observacao)}</div>
            </div>
          ))
        ) : (
          <>
            <div className="bloco-evolucao bloco-vazio">
              <div className="evo-header">
                <span className="campo-label">Data:</span> ___________
                <span className="campo-label" style={{ marginLeft: '16px' }}>Profissional:</span> ___________
              </div>
              <div className="campo-label" style={{ marginTop: '6px' }}>Observação:</div>
              <div className="linha-tracejada-multipla">
                <div className="linha-tracejada"></div>
                <div className="linha-tracejada"></div>
              </div>
            </div>
            <div className="bloco-evolucao bloco-vazio">
              <div className="evo-header">
                <span className="campo-label">Data:</span> ___________
                <span className="campo-label" style={{ marginLeft: '16px' }}>Profissional:</span> ___________
              </div>
              <div className="campo-label" style={{ marginTop: '6px' }}>Observação:</div>
              <div className="linha-tracejada-multipla">
                <div className="linha-tracejada"></div>
                <div className="linha-tracejada"></div>
              </div>
            </div>
          </>
        )}
      </section>

      {/* SEÇÃO 6 — ASSINATURA */}
      <section className="secao-assinatura">
        <div className="assinatura-bloco">
          <div className="assinatura-linha"></div>
          <p className="assinatura-label">Assinatura</p>
        </div>
        <div className="campo-linha" style={{ marginTop: '12px' }}>
          <span className="campo-label">Nome:</span>
          <span className="campo-valor linha-tracejada">{campo(data.profissional.nome)}</span>
        </div>
        <div className="campo-linha">
          <span className="campo-label">Registro (CRM / COREN / Matrícula):</span>
          <span className="campo-valor linha-tracejada">{campo(data.profissional.registro)}</span>
        </div>
      </section>

      {/* RODAPÉ — apenas na impressão */}
      <footer className="print-only ficha-rodape">
        <p>
          Impresso por: {data.profissional.nome} — {data.profissional.cargo} — {formatarData(new Date().toISOString())} às {formatarHora(new Date().toISOString())}
        </p>
      </footer>
    </div>
  );
};

export default FichaImpressao;