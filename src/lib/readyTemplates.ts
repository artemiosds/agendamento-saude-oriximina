// Templates prontos que o usuário pode inserir com um clique no editor de modelos.

export interface ReadyTemplate {
  id: string;
  nome: string;
  tipo: string;
  conteudo: string;
  descricao?: string;
}

const ociOrtopedia = `
<h2 style="text-align:center;margin:0 0 4px 0;">LAUDO PARA SOLICITAÇÃO/AUTORIZAÇÃO DE OFERTA DE CUIDADOS INTEGRADOS (OCI)</h2>
<p style="text-align:center;font-size:11px;margin:0 0 12px 0;"><em>Formulário de Laudo para Solicitação/Autorização de Oferta de Cuidados Integrados (OCI)</em></p>

<h3 style="background:#1e3a5f;color:#fff;padding:4px 8px;margin:12px 0 6px;font-size:12px;">IDENTIFICAÇÃO DO ESTABELECIMENTO DE SAÚDE (SOLICITANTE)</h3>
<table>
  <tbody>
    <tr>
      <td><strong>NOME DO ESTABELECIMENTO:</strong> {{nome_unidade}}</td>
      <td style="width:30%"><strong>CNES:</strong> _______________</td>
    </tr>
  </tbody>
</table>

<h3 style="background:#1e3a5f;color:#fff;padding:4px 8px;margin:12px 0 6px;font-size:12px;">IDENTIFICAÇÃO DO PACIENTE</h3>
<table>
  <tbody>
    <tr>
      <td colspan="2"><strong>NOME:</strong> {{paciente.nome}}</td>
      <td><strong>SEXO:</strong> {{paciente.sexo}}</td>
      <td><strong>Nº PRONTUÁRIO:</strong> {{paciente.id}}</td>
    </tr>
    <tr>
      <td><strong>CNS:</strong> {{paciente.cns}}</td>
      <td><strong>DATA NASC.:</strong> {{paciente.data_nascimento}}</td>
      <td><strong>RAÇA/COR:</strong> _______________</td>
      <td><strong>ETNIA:</strong> _______________</td>
    </tr>
    <tr>
      <td colspan="2"><strong>NOME DA MÃE:</strong> {{paciente.nome_mae}}</td>
      <td colspan="2"><strong>TELEFONE:</strong> {{paciente.telefone}}</td>
    </tr>
    <tr>
      <td colspan="2"><strong>NOME DO RESPONSÁVEL:</strong> _______________</td>
      <td colspan="2"><strong>TELEFONE:</strong> _______________</td>
    </tr>
    <tr>
      <td colspan="4"><strong>ENDEREÇO (RUA, Nº, BAIRRO):</strong> {{paciente.endereco}} — {{paciente.bairro}}</td>
    </tr>
    <tr>
      <td><strong>MUNICÍPIO:</strong> Oriximiná</td>
      <td><strong>CÓD. IBGE:</strong> 1505403</td>
      <td><strong>UF:</strong> PA</td>
      <td><strong>CEP:</strong> _______________</td>
    </tr>
  </tbody>
</table>

<h3 style="background:#1e3a5f;color:#fff;padding:4px 8px;margin:12px 0 6px;font-size:12px;">JUSTIFICATIVA DO(S) PROCEDIMENTO(S) SOLICITADO(S)</h3>
<p><strong>DESCRIÇÃO DO DIAGNÓSTICO:</strong></p>
<div class="tt-textbox"><p>_______________________________________________________________</p><p>_______________________________________________________________</p></div>
<table>
  <tbody>
    <tr>
      <td><strong>CID10 PRINCIPAL:</strong> {{paciente.cid}}</td>
      <td><strong>CID10 SECUNDÁRIO:</strong> _______</td>
      <td><strong>CID10 CAUSAS ASSOCIADAS:</strong> _______</td>
    </tr>
  </tbody>
</table>
<p><strong>OBSERVAÇÕES:</strong></p>
<div class="tt-textbox"><p>_______________________________________________________________</p></div>

<h3 style="background:#1e3a5f;color:#fff;padding:4px 8px;margin:12px 0 6px;font-size:12px;">PROCEDIMENTO SOLICITADO</h3>
<table>
  <tbody>
    <tr>
      <td style="width:22%"><strong>CÓDIGO PRINCIPAL:</strong><br/>_______________</td>
      <td><strong>NOME DO PROCEDIMENTO PRINCIPAL:</strong><br/>OCI AVALIAÇÃO DIAGNÓSTICA EM ORTOPEDIA COM RECURSOS DE RADIOLOGIA E TOMOGRAFIA COMPUTADORIZADA</td>
      <td style="width:12%"><strong>QTDE:</strong><br/>_____</td>
    </tr>
  </tbody>
</table>

<h3 style="background:#1e3a5f;color:#fff;padding:4px 8px;margin:12px 0 6px;font-size:12px;">PROCEDIMENTO(S) SECUNDÁRIO(S)</h3>
<table>
  <thead>
    <tr><th style="width:20%">CÓDIGO</th><th>NOME DO PROCEDIMENTO SECUNDÁRIO</th><th style="width:10%">QTDE</th></tr>
  </thead>
  <tbody>
    ${Array.from({ length: 16 })
      .map(() => `<tr><td>&nbsp;</td><td>&nbsp;</td><td>&nbsp;</td></tr>`)
      .join('')}
  </tbody>
</table>

<h3 style="background:#1e3a5f;color:#fff;padding:4px 8px;margin:12px 0 6px;font-size:12px;">SOLICITAÇÃO</h3>
<table>
  <tbody>
    <tr>
      <td colspan="2"><strong>NOME DO PROFISSIONAL SOLICITANTE:</strong> {{profissional.nome}}</td>
      <td><strong>DATA:</strong> {{data_atendimento}}</td>
    </tr>
    <tr>
      <td colspan="3"><strong>ASSINATURA E CARIMBO / Nº CONSELHO:</strong> {{profissional.conselho}}<br/><br/>__________________________________________________</td>
    </tr>
    <tr>
      <td><strong>DOCUMENTO:</strong> [ ] CNS &nbsp; [ ] CPF</td>
      <td colspan="2"><strong>Nº DO DOCUMENTO:</strong> _______________________</td>
    </tr>
  </tbody>
</table>

<h3 style="background:#1e3a5f;color:#fff;padding:4px 8px;margin:12px 0 6px;font-size:12px;">AUTORIZAÇÃO</h3>
<table>
  <tbody>
    <tr>
      <td><strong>NOME DO AUTORIZADOR:</strong> _______________</td>
      <td><strong>CÓD. ÓRGÃO EMISSOR:</strong> _______</td>
      <td><strong>Nº APAC:</strong> _______________</td>
    </tr>
    <tr>
      <td><strong>DOCUMENTO:</strong> [ ] CNS &nbsp; [ ] CPF</td>
      <td colspan="2"><strong>Nº DO DOCUMENTO:</strong> _______________________</td>
    </tr>
    <tr>
      <td><strong>DATA AUTORIZAÇÃO:</strong> ___/___/______</td>
      <td colspan="2"><strong>PERÍODO DE VALIDADE DA APAC:</strong> ___/______ a ___/______</td>
    </tr>
    <tr>
      <td colspan="3"><strong>ASSINATURA E CARIMBO (Nº CONSELHO):</strong><br/><br/>__________________________________________________</td>
    </tr>
  </tbody>
</table>
`.trim();

export const READY_TEMPLATES: ReadyTemplate[] = [
  {
    id: 'oci-ortopedia',
    nome: 'OCI Avaliação Diagnóstica em Ortopedia (Radiologia + TC)',
    tipo: 'Laudo Clínico',
    descricao: 'Formulário OCI completo com identificação do paciente, justificativa, procedimento principal fixo e até 16 procedimentos secundários.',
    conteudo: ociOrtopedia,
  },
];
