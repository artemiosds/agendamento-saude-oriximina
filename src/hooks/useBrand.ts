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
  /** Cidade/UF usada em locais e datas de documentos impressos. */
  cidadeUf: string;
  /** Linha de unidade nos carimbos impressos. */
  unidadeCarimbo: string;
  /** Prefeitura/instituição mantenedora (capas de relatório). */
  mantenedora: string;
  /** Dados públicos de contato da instalação; nunca presumidos para outro município. */
  enderecoPublico: string;
  horarioPublico: string;
  telefonePublico: string;
  corPrimaria: string;
}

const tenantEnv = import.meta.env as unknown as Record<string, string | undefined>;

export const DEFAULT_BRAND: Brand = {
  // Sem variáveis de instalação, preserva exatamente a identidade oficial de Oriximiná.
  // Instalações novas recebem sua identidade pelo manifesto de provisionamento.
  titulo: tenantEnv.VITE_TENANT_NAME?.trim() || 'SMS Oriximiná',
  subtitulo: tenantEnv.VITE_TENANT_SUBTITLE?.trim() || 'Secretaria Municipal de Saúde',
  logoUrl: tenantEnv.VITE_TENANT_LOGO_URL?.trim() || logoSms,
  cidadeUf: tenantEnv.VITE_TENANT_CITY_UF?.trim() || 'Oriximiná — PA',
  unidadeCarimbo: tenantEnv.VITE_TENANT_STAMP_UNIT?.trim() || 'CER II — Oriximiná/PA',
  mantenedora: tenantEnv.VITE_TENANT_MAINTAINER?.trim() || 'Prefeitura Municipal de Oriximiná — PA',
  enderecoPublico: tenantEnv.VITE_TENANT_PUBLIC_ADDRESS?.trim() || 'RUA BARÃO DO RIO BRANCO, Nº 2336 CENTRO, CEP: 68270-000',
  horarioPublico: tenantEnv.VITE_TENANT_PUBLIC_HOURS?.trim() || 'Seg a Sex: 08:00 às 18:00',
  telefonePublico: tenantEnv.VITE_TENANT_PUBLIC_PHONE?.trim() || '(93) 99109-3163',
  corPrimaria: /^#[0-9A-Fa-f]{6}$/.test(tenantEnv.VITE_TENANT_PRIMARY_COLOR || '')
    ? tenantEnv.VITE_TENANT_PRIMARY_COLOR!
    : '#2A6F97',
};

const CACHE_KEY = 'brand_cache_v1';

export function resolveBrand(inst: any): Brand {
  return {
    titulo: (inst?.marcaTitulo || '').trim() || DEFAULT_BRAND.titulo,
    subtitulo: (inst?.marcaSubtitulo || '').trim() || DEFAULT_BRAND.subtitulo,
    logoUrl: (inst?.logoUrl || '').trim() || DEFAULT_BRAND.logoUrl,
    cidadeUf: (inst?.marcaCidadeUf || '').trim() || DEFAULT_BRAND.cidadeUf,
    unidadeCarimbo: (inst?.marcaUnidadeCarimbo || '').trim() || DEFAULT_BRAND.unidadeCarimbo,
    mantenedora: (inst?.marcaMantenedora || '').trim() || DEFAULT_BRAND.mantenedora,
    enderecoPublico: (inst?.marcaEnderecoPublico || '').trim() || DEFAULT_BRAND.enderecoPublico,
    horarioPublico: (inst?.marcaHorarioPublico || '').trim() || DEFAULT_BRAND.horarioPublico,
    telefonePublico: (inst?.marcaTelefonePublico || '').trim() || DEFAULT_BRAND.telefonePublico,
    corPrimaria: /^#[0-9A-Fa-f]{6}$/.test(inst?.marcaCorPrimaria || '')
      ? inst.marcaCorPrimaria
      : DEFAULT_BRAND.corPrimaria,
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

/** Leitura síncrona para geradores de impressão (fora de componentes React). */
export function getBrandSync(): Brand {
  return readCache();
}
