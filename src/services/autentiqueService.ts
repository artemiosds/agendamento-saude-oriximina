import { supabase } from '@/integrations/supabase/client';

export interface AutentiqueSigner {
  email: string;
  name: string;
  action?: 'SIGN' | 'APPROVE' | 'ACKNOWLEDGE';
}

export const autentiqueService = {
  /** Envia PDF (base64) para assinatura eletrônica na Autentique */
  async criarDocumento(params: {
    nome: string;
    file_base64: string;
    filename?: string;
    message?: string;
    signers: AutentiqueSigner[];
    documento_gerado_id?: string;
  }) {
    const { data, error } = await supabase.functions.invoke('autentique-criar-documento', {
      body: params,
    });
    if (error) console.error('[autentique] criar:', error);
    return { data, error };
  },

  async statusDocumento(document_id: string, documento_gerado_id?: string) {
    const { data, error } = await supabase.functions.invoke('autentique-status-documento', {
      body: { document_id, documento_gerado_id },
    });
    if (error) console.error('[autentique] status:', error);
    return { data, error };
  },

  /** URL pública do webhook para colar no painel da Autentique */
  webhookUrl(): string {
    const projectId = (import.meta as any).env?.VITE_SUPABASE_PROJECT_ID;
    return `https://${projectId}.supabase.co/functions/v1/autentique-webhook`;
  },
};
