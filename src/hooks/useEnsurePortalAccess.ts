import { useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';

interface PortalAccessParams {
  pacienteId: string;
  contexto: 'agendamento' | 'fila' | 'encaixe';
  data?: string;
  hora?: string;
  unidade?: string;
  profissional?: string;
  tipo?: string;
  posicaoFila?: number;
}

interface PortalAccessResult {
  success: boolean;
  created: boolean;
  alreadyExists: boolean;
  noEmail?: boolean;
  emailSent?: boolean;
  message: string;
}

export function useEnsurePortalAccess() {
  const ensurePortalAccess = useCallback(async (params: PortalAccessParams): Promise<PortalAccessResult> => {
    try {
      const portalUrl = `${window.location.origin}/portal`;

      const { data, error } = await supabase.functions.invoke('ensure-patient-portal', {
        body: { ...params, portalUrl },
      });

      if (error) {
        console.error('Error ensuring portal access:', error);
        return {
          success: false,
          created: false,
          alreadyExists: false,
          message: 'Erro ao provisionar acesso ao portal.',
        };
      }

      return data as PortalAccessResult;
    } catch (err) {
      console.error('Error ensuring portal access:', err);
      return {
        success: false,
        created: false,
        alreadyExists: false,
        message: 'Erro inesperado ao provisionar acesso ao portal.',
      };
    }
  }, []);

  return { ensurePortalAccess };
}
