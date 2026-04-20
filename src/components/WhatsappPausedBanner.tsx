import React from 'react';
import { AlertTriangle } from 'lucide-react';
import { useWhatsappStatus } from '@/hooks/useWhatsappStatus';

/**
 * Banner global persistente exibido quando as automações de WhatsApp
 * estão pausadas para a unidade do usuário logado.
 */
const WhatsappPausedBanner: React.FC = () => {
  const { ativo, loading } = useWhatsappStatus();
  if (loading || ativo) return null;
  return (
    <div className="bg-warning/15 border-b border-warning/30 text-warning-foreground">
      <div className="px-4 lg:px-6 py-2 flex items-center gap-2 text-sm">
        <AlertTriangle className="w-4 h-4 text-warning shrink-0" />
        <span className="font-medium text-warning">
          ⚠️ Automações de WhatsApp estão pausadas para esta unidade.
        </span>
        <span className="text-muted-foreground hidden sm:inline">
          Nenhuma mensagem (lembretes, confirmações, cancelamentos) será enviada até a reativação.
        </span>
      </div>
    </div>
  );
};

export default WhatsappPausedBanner;
