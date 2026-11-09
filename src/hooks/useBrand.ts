import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import logoSms from '@/assets/logo-sms.jpeg';

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

export type TenantBrandEnvironment = Record<string, string | undefined>;

function envText(env: TenantBrandEnvironment, key: string): string {
  return env[key]?.trim() || '';
}

/**
 * Produz a marca inicial por modo de instalação.
 * O modo legado preserva os defaults oficiais de Oriximiná.
 * Instalações independentes nunca recebem logo, endereço, telefone ou município de Oriximiná.
 */
export function buildDefaultBrand(env: TenantBrandEnvironment, legacyLogoUrl: string): Brand {
  const independent = envText(env, 'VITE_TENANT_MODE').toLowerCase() === 'independent';
  const primary = envText(env, 'VITE_TENANT_PRIMARY_COLOR');

  return {
    titulo: envText(env, 'VITE_TENANT_NAME') || (independent ? 'Gestão Saúde' : 'SMS Oriximiná'),
    subtitulo: envText(env, 'VITE_TENANT_SUBTITLE') || 'Secretaria Municipal de Saúde',
    logoUrl: envText(env, 'VITE_TENANT_LOGO_URL') || (independent ? '' : legacyLogoUrl),
    cidadeUf: envText(env, 'VITE_TENANT_CITY_UF') || (independent ? '' : 'Oriximiná — PA'),
    unidadeCarimbo: envText(env, 'VITE_TENANT_STAMP_UNIT') || (independent ? '' : 'CER II — Oriximiná/PA'),
    mantenedora: envText(env, 'VITE_TENANT_MAINTAINER') || (
      independent ? 'Secretaria Municipal de Saúde' : 'Prefeitura Municipal de Oriximiná — PA'
    ),
    enderecoPublico: envText(env, 'VITE_TENANT_PUBLIC_ADDRESS') || (
      independent ? '' : 'RUA BARÃO DO RIO BRANCO, Nº 2336 CENTRO, CEP: 68270-000'
    ),
    horarioPublico: envText(env, 'VITE_TENANT_PUBLIC_HOURS') || (
      independent ? '' : 'Seg a Sex: 08:00 às 18:00'
    ),
    telefonePublico: envText(env, 'VITE_TENANT_PUBLIC_PHONE') || (
      independent ? '' : '(93) 99109-3163'
    ),
    corPrimaria: /^#[0-9A-Fa-f]{6}$/.test(primary) ? primary : '#2A6F97',
  };
}

const tenantEnv = import.meta.env as unknown as TenantBrandEnvironment;
export const DEFAULT_BRAND: Brand = buildDefaultBrand(tenantEnv, logoSms);

const tenantCacheNamespace = envText(tenantEnv, 'VITE_TENANT_ID')
  || (envText(tenantEnv, 'VITE_TENANT_MODE').toLowerCase() === 'independent' ? 'independent' : 'oriximina-legacy');
const CACHE_KEY = `brand_cache_v2:${tenantCacheNamespace}`;

export function resolveBrand(inst: any): Brand {
  const value = (key: string) => typeof inst?.[key] === 'string' ? inst[key].trim() : '';
  const color = value('marcaCorPrimaria');

  return {
    titulo: value('marcaTitulo') || DEFAULT_BRAND.titulo,
    subtitulo: value('marcaSubtitulo') || DEFAULT_BRAND.subtitulo,
    logoUrl: value('logoUrl') || DEFAULT_BRAND.logoUrl,
    cidadeUf: value('marcaCidadeUf') || DEFAULT_BRAND.cidadeUf,
    unidadeCarimbo: value('marcaUnidadeCarimbo') || DEFAULT_BRAND.unidadeCarimbo,
    mantenedora: value('marcaMantenedora') || DEFAULT_BRAND.mantenedora,
    enderecoPublico: value('marcaEnderecoPublico') || DEFAULT_BRAND.enderecoPublico,
    horarioPublico: value('marcaHorarioPublico') || DEFAULT_BRAND.horarioPublico,
    telefonePublico: value('marcaTelefonePublico') || DEFAULT_BRAND.telefonePublico,
    corPrimaria: /^#[0-9A-Fa-f]{6}$/.test(color) ? color : DEFAULT_BRAND.corPrimaria,
  };
}

function readCache(): Brand {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (raw) return { ...DEFAULT_BRAND, ...JSON.parse(raw) };
  } catch {
    // Ignore unavailable or invalid local cache.
  }
  return DEFAULT_BRAND;
}

export function useBrand(): Brand {
  const [brand, setBrand] = useState<Brand>(readCache);

  useEffect(() => {
    let alive = true;
    (async () => {
      const { data: sess } = await supabase.auth.getSession();
      if (!sess.session) return;
      const { data } = await supabase
        .from('system_config')
        .select('configuracoes')
        .eq('id', 'default')
        .maybeSingle();
      const resolved = resolveBrand((data?.configuracoes as any)?.config_sistema?.instituicao);
      if (!alive) return;
      setBrand(resolved);
      try {
        localStorage.setItem(CACHE_KEY, JSON.stringify(resolved));
      } catch {
        // Branding remains available in memory when storage is disabled.
      }
    })();
    return () => {
      alive = false;
    };
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
