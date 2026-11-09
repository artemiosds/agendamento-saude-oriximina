import { describe, expect, it } from 'vitest';
import { buildDefaultBrand, resolveBrand } from './useBrand';

describe('tenant white-label defaults', () => {
  it('preserves the existing Oriximiná branding when tenant mode is not configured', () => {
    const brand = buildDefaultBrand({}, '/assets/orix-logo.png');

    expect(brand.titulo).toBe('SMS Oriximiná');
    expect(brand.logoUrl).toBe('/assets/orix-logo.png');
    expect(brand.cidadeUf).toBe('Oriximiná — PA');
    expect(brand.mantenedora).toContain('Oriximiná');
    expect(brand.enderecoPublico).toContain('68270-000');
    expect(brand.telefonePublico).toBe('(93) 99109-3163');
  });

  it('does not inherit Oriximiná identity or contacts for an independent tenant', () => {
    const brand = buildDefaultBrand({ VITE_TENANT_MODE: 'independent' }, '/assets/orix-logo.png');

    expect(brand.titulo).toBe('Gestão Saúde');
    expect(brand.logoUrl).toBe('');
    expect(brand.cidadeUf).toBe('');
    expect(brand.unidadeCarimbo).toBe('');
    expect(brand.mantenedora).toBe('Secretaria Municipal de Saúde');
    expect(brand.enderecoPublico).toBe('');
    expect(brand.horarioPublico).toBe('');
    expect(brand.telefonePublico).toBe('');
    expect(JSON.stringify(brand)).not.toContain('Oriximiná');
    expect(JSON.stringify(brand)).not.toContain('68270-000');
  });

  it('uses the configured tenant identity and validates the primary color', () => {
    const brand = buildDefaultBrand({
      VITE_TENANT_MODE: 'independent',
      VITE_TENANT_ID: 'municipio-piloto',
      VITE_TENANT_NAME: 'Secretaria Municipal de Saúde de Município Modelo',
      VITE_TENANT_SUBTITLE: 'Prefeitura de Município Modelo',
      VITE_TENANT_LOGO_URL: 'https://cdn.example.invalid/logo.png',
      VITE_TENANT_CITY_UF: 'Município Modelo — PA',
      VITE_TENANT_STAMP_UNIT: 'Unidade Central — Município Modelo/PA',
      VITE_TENANT_MAINTAINER: 'Prefeitura de Município Modelo — PA',
      VITE_TENANT_PUBLIC_ADDRESS: 'Rua Principal, 100',
      VITE_TENANT_PUBLIC_HOURS: 'Seg a Sex: 08:00 às 17:00',
      VITE_TENANT_PUBLIC_PHONE: '(93) 00000-0000',
      VITE_TENANT_PRIMARY_COLOR: '#125577',
    }, '/assets/orix-logo.png');

    expect(brand).toMatchObject({
      titulo: 'Secretaria Municipal de Saúde de Município Modelo',
      subtitulo: 'Prefeitura de Município Modelo',
      logoUrl: 'https://cdn.example.invalid/logo.png',
      cidadeUf: 'Município Modelo — PA',
      unidadeCarimbo: 'Unidade Central — Município Modelo/PA',
      mantenedora: 'Prefeitura de Município Modelo — PA',
      enderecoPublico: 'Rua Principal, 100',
      horarioPublico: 'Seg a Sex: 08:00 às 17:00',
      telefonePublico: '(93) 00000-0000',
      corPrimaria: '#125577',
    });
  });

  it('falls back to the neutral primary color when an independent tenant color is invalid', () => {
    const brand = buildDefaultBrand({
      VITE_TENANT_MODE: 'independent',
      VITE_TENANT_PRIMARY_COLOR: 'blue',
    }, '/assets/orix-logo.png');

    expect(brand.corPrimaria).toBe('#2A6F97');
  });

  it('uses only configured institution fields and safe tenant defaults', () => {
    const brand = resolveBrand({ marcaTitulo: 'Unidade Teste' });

    expect(brand.titulo).toBe('Unidade Teste');
    expect(brand.logoUrl).toBeTruthy();
  });
});
