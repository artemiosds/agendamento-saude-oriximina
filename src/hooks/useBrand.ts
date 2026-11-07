import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import logoSms from '@/assets/logo-sms.jpeg';

/**
 * Marca dinâmica (white-label). Lê config_sistema.instituicao em system_config.
 * Padrão = identidade de Oriximiná, usada sempre que nada for cadastrado.
 * A tela de login (sem sessão) usa a última marca guardada neste dispositivo.
 */
export interface Brand {
  titulo: string;
  subtitulo: string;
  logoUrl: string;
}

export const DEFAULT_BRAND: Brand = {
  titulo: 'SMS Oriximiná',
  subtitulo: 'Secretaria Municipal de Saúde',
  logoUrl: logoSms,
};

const CACHE_KEY = 'brand_cache_v1';

export function resolveBrand(inst: any): Brand {
  return {
    titulo: (inst?.marcaTitulo || '').trim() || DEFAULT_BRAND.titulo,
    subtitulo: (inst?.marcaSubtitulo || '').trim() || DEFAULT_BRAND.subtitulo,
    logoUrl: (inst?.logoUrl || '').trim() || DEFAULT_BRAND.logoUrl,
  };
}

function readCache(): Brand {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (raw) return { ...DEFAULT_BRAND, ...JSON.parse(raw) };
  } catch { /* ignore */ }
  return DEFAULT_BRAND;
}

export function useBrand(): Brand {
  const [brand, setBrand] = useState<Brand>(readCache);

  useEffect(() => {
    let alive = true;
    (async () => {
      const { data: sess } = await supabase.auth.getSession();
      if (!sess.session) return;
      const { data } = await supabase.from('system_config').select('configuracoes').eq('id', 'default').maybeSingle();
      const b = resolveBrand((data?.configuracoes as any)?.config_sistema?.instituicao);
      if (!alive) return;
      setBrand(b);
      try { localStorage.setItem(CACHE_KEY, JSON.stringify(b)); } catch { /* ignore */ }
    })();
    return () => { alive = false; };
  }, []);

  useEffect(() => {
    if (brand.titulo) document.title = brand.titulo;
  }, [brand.titulo]);

  return brand;
}
