import { PatientReferral } from "@/services/patientReferralService";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { loadDocumentConfig } from "@/lib/printLayout";
import logoSmsFallback from "@/assets/logo-sms-oriximina.jpeg";
import logoCerFallback from "@/assets/logo-cer-ii.png";

export async function printReferral(referral: PatientReferral, patient: any) {
  const config = await loadDocumentConfig();
  
  const logoLeft = config.logoEsquerda || (logoSmsFallback as string);
  const logoRight = config.logoDireita || (logoCerFallback as string);
  const logoCentral = config.mostrarLogoCentral && config.logoCentral 
    ? `<img src="${config.logoCentral}" alt="Logo Central" style="max-height:60px;max-width:200px;object-fit:contain;margin-bottom:8px;" />` 
    : '';

  const dataEncaminhamento = referral.data_encaminhamento 
    ? format(new Date(referral.data_encaminhamento), "dd/MM/yyyy")
    : format(new Date(), "dd/MM/yyyy");

  const html = `
    <!DOCTYPE html>
    <html lang="pt-BR">
    <head>
      <meta charset="UTF-8">
      <title>Encaminhamento - ${patient.nome}</title>
      <style>
        body { font-family: 'Segoe UI', Arial, sans-serif; margin: 0; padding: 20mm; color: #333; }
        .header { display: flex; align-items: center; justify-content: space-between; border-bottom: 2px solid #0c4a6e; padding-bottom: 10px; margin-bottom: 20px; }
        .header-logo { width: 80px; height: 80px; object-fit: contain; }
        .header-center { flex: 1; text-align: center; }
        .header-center h1 { font-size: 16px; margin: 0; color: #0c4a6e; text-transform: uppercase; }
        .header-center h2 { font-size: 14px; margin: 5px 0 0; color: #444; }
        .title { text-align: center; margin: 30px 0; }
        .title h3 { font-size: 20px; text-decoration: underline; text-transform: uppercase; }
        .section { margin-bottom: 20px; }
        .section-title { font-weight: bold; text-transform: uppercase; font-size: 12px; color: #666; border-bottom: 1px solid #eee; padding-bottom: 5px; margin-bottom: 10px; }
        .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
        .field { margin-bottom: 8px; }
        .label { font-weight: bold; font-size: 12px; color: #555; }
        .value { font-size: 14px; }
        .justification { border: 1px solid #ddd; padding: 15px; border-radius: 4px; min-height: 100px; white-space: pre-wrap; margin-top: 10px; }
        .footer { margin-top: 50px; text-align: center; }
        .signature-line { border-top: 1px solid #333; width: 250px; margin: 50px auto 10px; }
        .signature-text { font-size: 12px; }
        @media print {
          body { padding: 0; }
          .no-print { display: none; }
        }
      </style>
    </head>
    <body>
      <div class="header">
        <img src="${logoLeft}" class="header-logo" alt="Logo">
        <div class="header-center">
          ${logoCentral}
          <h1>${config.linha1}</h1>
          <h2>${config.linha2}</h2>
          <div style="font-size: 11px;">${config.linha3 || ''}</div>
        </div>
        <img src="${logoRight}" class="header-logo" alt="Logo">
      </div>

      <div class="title">
        <h3>Guia de Encaminhamento</h3>
      </div>

      <div class="section">
        <div class="section-title">Dados do Paciente</div>
        <div class="grid">
          <div class="field"><div class="label">Nome:</div><div class="value">${patient.nome}</div></div>
          <div class="field"><div class="label">CPF:</div><div class="value">${patient.cpf || '---'}</div></div>
          <div class="field"><div class="label">CNS:</div><div class="value">${patient.cns || '---'}</div></div>
          <div class="field"><div class="label">Data de Nasc.:</div><div class="value">${patient.data_nascimento ? format(new Date(patient.data_nascimento), "dd/MM/yyyy") : '---'}</div></div>
        </div>
      </div>

      <div class="section">
        <div class="section-title">Informações do Encaminhamento</div>
        <div class="grid">
          <div class="field"><div class="label">Especialidade Destino:</div><div class="value" style="font-weight: bold; color: #0c4a6e;">${referral.especialidade_destino.toUpperCase()}</div></div>
          <div class="field"><div class="label">Data:</div><div class="value">${dataEncaminhamento}</div></div>
          <div class="field"><div class="label">UBS de Origem:</div><div class="value">${referral.ubs_origem || '---'}</div></div>
          <div class="field"><div class="label">Tipo:</div><div class="value">${referral.tipo_encaminhamento || '---'}</div></div>
          <div class="field"><div class="label">Profissional Solicitante:</div><div class="value">${referral.profissional_solicitante || '---'}</div></div>
          <div class="field"><div class="label">CID-10:</div><div class="value">${referral.cid || '---'}</div></div>
        </div>
      </div>

      <div class="section">
        <div class="section-title">Diagnóstico Resumido</div>
        <div class="value">${referral.diagnostico_resumido || 'Não informado.'}</div>
      </div>

      <div class="section">
        <div class="section-title">Justificativa Clínica</div>
        <div class="justification">${referral.justificativa || 'Nenhuma justificativa fornecida.'}</div>
      </div>

      <div class="footer">
        <div class="signature-line"></div>
        <div class="signature-text">Assinatura e Carimbo do Profissional</div>
        <div style="font-size: 10px; margin-top: 20px; color: #999;">
          Documento gerado em ${format(new Date(), "dd/MM/yyyy HH:mm")}
        </div>
      </div>

      <script>
        window.onload = function() {
          window.print();
          window.onafterprint = function() {
            window.close();
          };
        };
      </script>
    </body>
    </html>
  `;

  const printWindow = window.open('', '_blank');
  if (printWindow) {
    printWindow.document.write(html);
    printWindow.document.close();
  }
}
