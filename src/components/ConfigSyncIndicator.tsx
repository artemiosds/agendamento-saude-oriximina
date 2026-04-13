import React, { useEffect, useState } from 'react';
import { Cloud, CloudOff } from 'lucide-react';

const DRAFT_KEY = 'config_draft_pending';

/**
 * Small indicator that shows when there are unsaved config drafts pending sync.
 * Place it in the config page header.
 */
export const ConfigSyncIndicator: React.FC = () => {
  const [hasDraft, setHasDraft] = useState(false);

  useEffect(() => {
    const check = () => {
      try {
        setHasDraft(!!localStorage.getItem(DRAFT_KEY));
      } catch {
        setHasDraft(false);
      }
    };
    check();
    const interval = setInterval(check, 3000);
    return () => clearInterval(interval);
  }, []);

  if (!hasDraft) {
    return (
      <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
        <Cloud className="w-3.5 h-3.5" /> Sincronizado
      </span>
    );
  }

  return (
    <span className="inline-flex items-center gap-1 text-xs text-orange-500 animate-pulse">
      <CloudOff className="w-3.5 h-3.5" /> Sincronizando...
    </span>
  );
};
