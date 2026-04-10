/**
 * Electronic signature utility for clinical documents.
 * Generates SHA-256 hash and signature block HTML.
 */
import { getPublicIp } from '@/lib/clientInfo';

export interface SignatureData {
  documentId: string;
  hash: string;
  ip: string;
  timestamp: string;
  profissionalNome: string;
  conselho: string;
  numeroRegistro: string;
  uf: string;
}

async function sha256(text: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(text);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

export async function generateSignature(
  conteudo: string,
  profissionalId: string,
  profissionalNome: string,
  conselho: string,
  numeroRegistro: string,
  uf: string
): Promise<SignatureData> {
  const documentId = crypto.randomUUID();
  const timestamp = new Date().toISOString();
  const ip = await getPublicIp();
  const hash = await sha256(`${conteudo}|${profissionalId}|${timestamp}|${documentId}`);

  return {
    documentId,
    hash,
    ip,
    timestamp,
    profissionalNome,
    conselho,
    numeroRegistro,
    uf,
  };
}

export function formatSignatureBlock(sig: SignatureData): string {
  const dt = new Date(sig.timestamp);
  const dataFormatada = dt.toLocaleDateString('pt-BR');
  const horaFormatada = dt.toLocaleTimeString('pt-BR');
  const hashCurto = sig.hash.substring(0, 32).toUpperCase();

  return `
    <div class="signature-block" style="margin-top:40px;border:1px solid #94a3b8;border-radius:8px;padding:16px 20px;background:#f8fafc;page-break-inside:avoid;">
      <div style="text-align:center;font-weight:700;font-size:11px;text-transform:uppercase;color:#0369a1;margin-bottom:10px;letter-spacing:.5px;">
        Assinatura Eletrônica
      </div>
      <div style="font-size:10px;line-height:1.8;color:#334155;">
        <div>Documento assinado eletronicamente por:</div>
        <div style="font-weight:600;font-size:11px;">${sig.profissionalNome} — ${sig.conselho} ${sig.numeroRegistro}/${sig.uf}</div>
        <div style="margin-top:6px;">Data/hora: ${dataFormatada} às ${horaFormatada}</div>
        <div>Código de verificação: <span style="font-family:monospace;font-size:9px;background:#e2e8f0;padding:2px 6px;border-radius:3px;">${hashCurto}</span></div>
        <div>ID do documento: <span style="font-family:monospace;font-size:9px;">${sig.documentId}</span></div>
        <div style="margin-top:8px;font-size:9px;color:#64748b;font-style:italic;">
          Este documento possui validade como assinatura eletrônica simples conforme Art. 10 da MP 2.200-2.
        </div>
      </div>
    </div>`;
}

export interface CarimboData {
  tipo: 'digital' | 'imagem';
  nome: string;
  conselho: string;
  numero_registro: string;
  uf: string;
  especialidade: string;
  cargo: string;
  imagem_url: string;
}

export function formatCarimboBlock(carimbo: CarimboData | null): string {
  if (!carimbo) return '';

  if (carimbo.tipo === 'imagem' && carimbo.imagem_url) {
    return `
      <div class="carimbo-block" style="text-align:right;margin-top:30px;">
        <img src="${carimbo.imagem_url}" alt="Carimbo" style="max-width:250px;max-height:120px;" />
      </div>`;
  }

  if (carimbo.tipo === 'digital') {
    return `
      <div class="carimbo-block" style="margin-top:30px;text-align:right;">
        <div style="display:inline-block;border:1px solid #334155;border-radius:6px;padding:10px 18px;text-align:center;font-size:10px;line-height:1.6;">
          <div style="font-weight:700;font-size:11px;">${carimbo.nome}</div>
          <div>${carimbo.conselho} / ${carimbo.numero_registro}-${carimbo.uf}</div>
          <div>${carimbo.especialidade}</div>
          ${carimbo.cargo ? `<div>${carimbo.cargo}</div>` : ''}
          <div style="font-size:9px;color:#64748b;">CER II — Oriximiná/PA</div>
        </div>
      </div>`;
  }

  return '';
}
