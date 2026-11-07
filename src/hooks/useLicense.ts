import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { DEFAULT_LICENSE, LicenseState, normalizeLicense } from '@/lib/licenseModules';

const CACHE_KEY = 'license_cache_v1';
const listeners = new Set<(l: LicenseState) => void>();

function readCache(): LicenseState {
  try { const r = localStorage.getItem(CACHE_KEY); if (r) return normalizeLicense(JSON.parse(r)); } catch { /* ignore */ }
  return DEFAULT_LICENSE;
}

function publish(l: LicenseState) {
  try { localStorage.setItem(CACHE_KEY, JSON.stringify(l)); } catch { /* ignore */ }
  listeners.forEach(fn => fn(l));
}

export function useLicense() {
  const [license, setLicense] = useState<LicenseState>(readCache);

  useEffect(() => {
    listeners.add(setLicense);
    let alive = true;
    (async () => {
      const { data } = await supabase.from('system_config').select('configuracoes').eq('id', 'licenca').maybeSingle();
      if (!alive) return;
      publish(normalizeLicense((data?.configuracoes as any)?.modulos));
    })();
    return () => { alive = false; listeners.delete(setLicense); };
  }, []);

  const save = useCallback(async (next: LicenseState, motivo: string) => {
    const { data: u } = await supabase.auth.getUser();
    const { error } = await supabase.from('system_config').upsert({
      id: 'licenca',
      configuracoes: { modulos: next, motivo_alteracao: motivo, alterado_por: u.user?.id ?? null, alterado_em: new Date().toISOString() } as any,
    });
    if (error) throw error;
    publish(next);
  }, []);

  return { license, save };
}
