import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { DEFAULT_LICENSE, LicenseState, normalizeLicense } from '@/lib/licenseModules';

const CACHE_KEY = 'license_cache_v1';
// A ativação central é deliberadamente opt-in: manter false preserva o licenciamento atual.
const CENTRAL_LICENSE_ENABLED = import.meta.env.VITE_BACKOFFICE_LICENSE_ENABLED === 'true';
const DENIED_LICENSE: LicenseState = {
  faturamento_sus: false,
  reabilitacao: false,
  triagem: false,
  regulacao: false,
};

export type LicenseSource = 'local' | 'backoffice' | 'backoffice_unavailable';
export type LicenseCheckStatus =
  | 'local'
  | 'valid'
  | 'inactive'
  | 'invalid'
  | 'configuration_error'
  | 'unavailable';

function readLegacyCache(): LicenseState {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (raw) return normalizeLicense(JSON.parse(raw));
  } catch { /* usa o padrão legado */ }
  return DEFAULT_LICENSE;
}

function strictRemoteLicense(raw: unknown): LicenseState {
  const value = raw && typeof raw === 'object' && !Array.isArray(raw)
    ? raw as Record<string, unknown>
    : {};
  return {
    faturamento_sus: value.faturamento_sus === true,
    reabilitacao: value.reabilitacao === true,
    triagem: value.triagem === true,
    regulacao: value.regulacao === true,
  };
}

export function useLicense() {
  const [license, setLicense] = useState<LicenseState>(() =>
    CENTRAL_LICENSE_ENABLED ? DENIED_LICENSE : readLegacyCache()
  );
  const [loading, setLoading] = useState(true);
  const [source, setSource] = useState<LicenseSource>(
    CENTRAL_LICENSE_ENABLED ? 'backoffice_unavailable' : 'local'
  );
  const [status, setStatus] = useState<LicenseCheckStatus>(
    CENTRAL_LICENSE_ENABLED ? 'unavailable' : 'local'
  );

  useEffect(() => {
    let alive = true;

    const load = async () => {
      try {
        if (!CENTRAL_LICENSE_ENABLED) {
          const { data, error } = await supabase
            .from('system_config')
            .select('configuracoes')
            .eq('id', 'licenca')
            .maybeSingle();
          if (error) throw error;
          const modules = normalizeLicense((data?.configuracoes as any)?.modulos);
          if (!alive) return;
          setLicense(modules);
          setSource('local');
          setStatus('local');
          try { localStorage.setItem(CACHE_KEY, JSON.stringify(modules)); } catch { /* cache opcional */ }
          return;
        }

        const { data, error } = await supabase.functions.invoke('backoffice-license-status', {
          body: {},
        });
        if (!alive) return;

        // Quando a flag central estiver ativa, qualquer resposta ausente/legada/inválida
        // bloqueia os grupos licenciados. Não há fallback para a configuração local.
        if (error || !data || data.mode !== 'backoffice') {
          setLicense(DENIED_LICENSE);
          setSource('backoffice_unavailable');
          setStatus('unavailable');
          return;
        }

        if (data.status !== 'valid') {
          setLicense(DENIED_LICENSE);
          setSource('backoffice');
          setStatus(
            data.status === 'inactive' || data.status === 'invalid' || data.status === 'configuration_error'
              ? data.status
              : 'unavailable'
          );
          return;
        }

        setLicense(strictRemoteLicense(data.modules));
        setSource('backoffice');
        setStatus('valid');
      } catch {
        if (!alive) return;
        if (CENTRAL_LICENSE_ENABLED) {
          setLicense(DENIED_LICENSE);
          setSource('backoffice_unavailable');
          setStatus('unavailable');
        } else {
          setLicense(readLegacyCache());
          setSource('local');
          setStatus('local');
        }
      } finally {
        if (alive) setLoading(false);
      }
    };

    void load();
    return () => { alive = false; };
  }, []);

  return { license, loading, source, status };
}
