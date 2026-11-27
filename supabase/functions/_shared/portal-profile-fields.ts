// Patient-controlled address/contact fields from serializeDadosPaciente.
export const PORTAL_CUSTOM_FIELDS = ['cep','logradouro','numero','complemento','bairro','endereco_municipio','endereco_uf','uf','ibge_municipio','telefone_secundario','nacionalidade'] as const;
export function portalCustomPatch(previous: unknown, supplied: unknown): Record<string,unknown> {
  const old = previous && typeof previous==='object' && !Array.isArray(previous) ? previous as Record<string,unknown> : {};
  const patch = supplied && typeof supplied==='object' && !Array.isArray(supplied) ? supplied as Record<string,unknown> : {};
  const result={...old};
  for (const key of PORTAL_CUSTOM_FIELDS) {
    if (!Object.prototype.hasOwnProperty.call(patch,key)) continue;
    const value=patch[key];
    if (typeof value==='string' || value===null || (key==='ibge_municipio' && typeof value==='number' && Number.isFinite(value))) result[key]=value;
  }
  return result;
}
