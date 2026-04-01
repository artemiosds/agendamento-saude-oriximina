"use client";

import React from 'react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';

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
}

const FichaImpressao: React.FC<FichaImpressaoProps> = ({
  paciente,
  dadosClinicos,
  sinaisVitais,
  evolucoesClinicas,
  nomeProfissional,
  perfilProfissional,
}) => {
  const now = new Date();
  const dataEmissao = format(now, "dd/MM/yyyy HH:mm", { locale: ptBR });

  return (
    <div id="ficha-impressao" className="font-sans">
      <style jsx>{`
        @media print {
          body * { visibility: hidden; }
          #ficha-impressao, #ficha-impressao * { visibility: visible; }
          #ficha-impressao { position: absolute; left: 0; top: 0; width: 100%; }
          .no-print { display: none !important; }
          @page { size: A4; margin: 15mm 15mm 20mm 15mm; }
        }
      `}</style>
      <div className="header">
        <div className="logo">SECRETARIA MUNICIPAL DE SAÚDE</div>
        <div className="title">FICHA DE ATENDIMENTO CLÍNICO</div>
        <div className="date">Data de emissão: {dataEmissao}</div>
      </div>
      <div className="section">
        <h2>Identificação do Paciente</h2>
        <p>Nome completo: {paciente.nomeCompleto || "_________________________________"}</p>
        <p>CPF: {paciente.cpf || "________________"} CNS: {paciente.cns || "________________"}</p>
        <p>Data de nascimento: {paciente.dataNascimento || "__________"} Telefone: {paciente.telefone || "__________"}</p>
        <p>Nome da mãe: {paciente.nomeMae || "___________________________________"}</p>
      </div>
      <div className="section">
        <h2>Informações Clínicas</h2>
        <p>Nº Prontuário: {dadosClinicos.numeroProntuario || "_______"} CID: {dadosClinicos.cid || "__________________"}</p>
        <p>Tipo de atendimento: {dadosClinicos.tipoAtendimento || "__________________________"}</p>
        <p>Unidade de origem: {dadosClinicos.unidadeOrigem || "____________________________"}</p>
        <p>Unidade de atendimento: {dadosClinicos.unidadeAtendimento || "_______________________"}</p>
        <p>Data do atendimento: {dadosClinicos.dataAtendimento || "__________________________"}</p>
      </div>
      <div className="section">
        <h2>Sinais Vitais</h2>
        <p>P.A.: {sinaisVitais.pressaoArterial || "_______"} FC: {sinaisVitais.frequenciaCardiaca || "_________"} Temp.: {sinaisVitais.temperatura || "______"}</p>
        <p>Sat.: {sinaisVitais.saturacao || "_______"} Peso: {sinaisVitais.peso || "_______"} Altura: {sinaisVitais.altura || "_____"} </p>
      </div>
      <div className="section">
        <h2>Encaminhamento</h2>
        <p>Especialidade: _________________________________</p>
        <p>Destino: _______________________________________</p>
        <p>Observação: ____________________________________</p>
        <p>________________________________________________</p>
      </div>
      <div className="section">
        <h2>Evolução Clínica</h2>
        {evolucoesClinicas.length > 0 ? (
          evolucoesClinicas.map((evolucao, index) => (
            <div key={index}>
              <h3>Data: {evolucao.data} Profissional: {evolucao.profissionalResponsavel}</h3>
              <p>Observação: {evolucao.observacao}</p>
            </div>
          ))
        ) : (
          <>
            <h3>Data: ___________ Profissional: ______________</h3>
            <p>Observação: ____________________________________</p>
            <p>________________________________________________</p>
            <p>________________________________________________</p>
            <h3>Data: ___________ Profissional: ______________</h3>
            <p>Observação: ____________________________________</p>
            <p>________________________________________________</p>
            <p>________________________________________________</p>
          </>
        )}
      </div>
      <div className="signature">
        <p>Assinatura: ___________________________________</p>
        <p>Nome: {nomeProfissional} </p>
        <p>Registro (CRM/COREN): _______________________</p>
      </div>
      <div className="footer">
        <hr />
        <p>Impresso por: {nomeProfissional} — {perfilProfissional} — {dataEmissao}</p>
      </div>
    </div>
  );
};

export default FichaImpressao;