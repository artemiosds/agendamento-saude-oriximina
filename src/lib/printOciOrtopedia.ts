// Impressão do documento OCI - Avaliação Diagnóstica em Ortopedia (Radiologia + TC)

interface OciPaciente {
  nome?: string | null;
  sexo?: string | null;
  id?: string | null;
  cns?: string | null;
  dataNascimento?: string | null;
  cid?: string | null;
  telefone?: string | null;
  endereco?: string | null;
  bairro?: string | null;
  nomeMae?: string | null;
  nome_mae?: string | null;
}

const esc = (v: any) => {
  const s = v == null ? '' : String(v);
  return s.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] as string));
};

const fmtDate = (iso?: string | null) => {
  if (!iso) return '';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return esc(iso);
  return d.toLocaleDateString('pt-BR');
};

export function printOciOrtopedia(paciente: OciPaciente, unidade?: string) {
  const nomeMae = paciente.nomeMae || paciente.nome_mae || '';
  const win = window.open('', '_blank', 'width=900,height=1100');
  if (!win) return;

  const linhas16 = Array.from({ length: 16 })
    .map(() => `<tr><td>&nbsp;</td><td>&nbsp;</td><td>&nbsp;</td></tr>`)
    .join('');

  const html = `<!doctype html>
<html lang="pt-BR"><head><meta charset="utf-8"/>
<title>OCI - Avaliação Diagnóstica em Ortopedia</title>
<style>
  @page { size: A4 portrait; margin: 10mm 12mm; }
  * { box-sizing: border-box; }
  body { font-family: 'Segoe UI', Arial, sans-serif; font-size: 10.5px; color: #0f172a; margin: 0; padding: 8px 12px; }
  h1 { font-size: 13px; text-align: center; margin: 0 0 4px; }
  .sub { text-align: center; font-size: 10px; font-style: italic; margin-bottom: 10px; color: #475569; }
  .sec { background: #1e3a5f; color: #fff; padding: 4px 8px; font-size: 11px; font-weight: 700; text-transform: uppercase; margin: 10px 0 4px; letter-spacing: .3px; }
  table { width: 100%; border-collapse: collapse; margin-bottom: 4px; }
  td, th { border: 1px solid #64748b; padding: 4px 6px; vertical-align: top; font-size: 10.5px; }
  th { background: #e2e8f0; }
  .linha { border-bottom: 1px solid #64748b; min-height: 14px; display: inline-block; width: 100%; }
  .box { border: 1px solid #64748b; padding: 6px; min-height: 32px; margin-bottom: 4px; }
  .assinatura { border-top: 1px solid #0f172a; margin-top: 22px; padding-top: 3px; text-align: center; font-size: 9px; }
  .no-print { text-align: right; margin-bottom: 8px; }
  @media print { .no-print { display: none !important; } body { padding: 0; } }
</style></head>
<body>
  <div class="no-print"><button onclick="window.print()" style="padding:6px 14px;cursor:pointer;">Imprimir</button></div>

  <h1>LAUDO PARA SOLICITAÇÃO/AUTORIZAÇÃO DE OFERTA DE CUIDADOS INTEGRADOS (OCI)</h1>
  <div class="sub">Formulário de Laudo para Solicitação/Autorização de Oferta de Cuidados Integrados (OCI)</div>

  <div class="sec">Identificação do Estabelecimento de Saúde (Solicitante)</div>
  <table><tr>
    <td style="width:70%"><strong>NOME DO ESTABELECIMENTO:</strong> ${esc(unidade || 'CER II Oriximiná')}</td>
    <td><strong>CNES:</strong> ________________</td>
  </tr></table>

  <div class="sec">Identificação do Paciente</div>
  <table>
    <tr>
      <td colspan="2"><strong>NOME:</strong> ${esc(paciente.nome)}</td>
      <td><strong>SEXO:</strong> ${esc(paciente.sexo)}</td>
      <td><strong>Nº PRONTUÁRIO:</strong> ${esc(paciente.id)}</td>
    </tr>
    <tr>
      <td><strong>CNS:</strong> ${esc(paciente.cns)}</td>
      <td><strong>DATA NASC.:</strong> ${fmtDate(paciente.dataNascimento)}</td>
      <td><strong>RAÇA/COR:</strong> ______________</td>
      <td><strong>ETNIA:</strong> ______________</td>
    </tr>
    <tr>
      <td colspan="2"><strong>NOME DA MÃE:</strong> ${esc(nomeMae)}</td>
      <td colspan="2"><strong>TELEFONE:</strong> ${esc(paciente.telefone)}</td>
    </tr>
    <tr>
      <td colspan="2"><strong>NOME DO RESPONSÁVEL:</strong> ______________________</td>
      <td colspan="2"><strong>TELEFONE:</strong> ______________________</td>
    </tr>
    <tr>
      <td colspan="4"><strong>ENDEREÇO (RUA, Nº, BAIRRO):</strong> ${esc([paciente.endereco, paciente.bairro].filter(Boolean).join(' — '))}</td>
    </tr>
    <tr>
      <td><strong>MUNICÍPIO:</strong> Oriximiná</td>
      <td><strong>CÓD. IBGE:</strong> 1505403</td>
      <td><strong>UF:</strong> PA</td>
      <td><strong>CEP:</strong> ______________</td>
    </tr>
  </table>

  <div class="sec">Justificativa do(s) Procedimento(s) Solicitado(s)</div>
  <div><strong>DESCRIÇÃO DO DIAGNÓSTICO:</strong></div>
  <div class="box"></div>
  <table><tr>
    <td><strong>CID10 PRINCIPAL:</strong> ${esc(paciente.cid)}</td>
    <td><strong>CID10 SECUNDÁRIO:</strong> _______</td>
    <td><strong>CID10 CAUSAS ASSOCIADAS:</strong> _______</td>
  </tr></table>
  <div><strong>OBSERVAÇÕES:</strong></div>
  <div class="box"></div>

  <div class="sec">Procedimento Solicitado</div>
  <table><tr>
    <td style="width:22%"><strong>CÓDIGO PRINCIPAL:</strong><br/>______________</td>
    <td><strong>NOME DO PROCEDIMENTO PRINCIPAL:</strong><br/>OCI AVALIAÇÃO DIAGNÓSTICA EM ORTOPEDIA COM RECURSOS DE RADIOLOGIA E TOMOGRAFIA COMPUTADORIZADA</td>
    <td style="width:10%"><strong>QTDE:</strong><br/>_____</td>
  </tr></table>

  <div class="sec">Procedimento(s) Secundário(s)</div>
  <table>
    <thead><tr><th style="width:22%">CÓDIGO</th><th>NOME DO PROCEDIMENTO SECUNDÁRIO</th><th style="width:10%">QTDE</th></tr></thead>
    <tbody>${linhas16}</tbody>
  </table>

  <div class="sec">Solicitação</div>
  <table>
    <tr>
      <td colspan="2"><strong>NOME DO PROFISSIONAL SOLICITANTE:</strong> ______________________________________</td>
      <td><strong>DATA:</strong> ___/___/______</td>
    </tr>
    <tr>
      <td><strong>DOCUMENTO:</strong> [ ] CNS &nbsp; [ ] CPF</td>
      <td colspan="2"><strong>Nº DO DOCUMENTO:</strong> ________________________</td>
    </tr>
    <tr><td colspan="3"><strong>ASSINATURA E CARIMBO / Nº CONSELHO:</strong><div class="assinatura">assinatura do profissional solicitante</div></td></tr>
  </table>

  <div class="sec">Autorização</div>
  <table>
    <tr>
      <td><strong>NOME DO AUTORIZADOR:</strong> ______________</td>
      <td><strong>CÓD. ÓRGÃO EMISSOR:</strong> ______</td>
      <td><strong>Nº APAC:</strong> ______________</td>
    </tr>
    <tr>
      <td><strong>DOCUMENTO:</strong> [ ] CNS &nbsp; [ ] CPF</td>
      <td colspan="2"><strong>Nº DO DOCUMENTO:</strong> ________________________</td>
    </tr>
    <tr>
      <td><strong>DATA AUTORIZAÇÃO:</strong> ___/___/______</td>
      <td colspan="2"><strong>PERÍODO DE VALIDADE DA APAC:</strong> ___/______ a ___/______</td>
    </tr>
    <tr><td colspan="3"><strong>ASSINATURA E CARIMBO (Nº CONSELHO):</strong><div class="assinatura">assinatura do profissional autorizador</div></td></tr>
  </table>

  <script>window.addEventListener('load',()=>setTimeout(()=>window.print(),400));</script>
</body></html>`;

  win.document.open();
  win.document.write(html);
  win.document.close();
}
