import municipios from "@/data/municipiosIbge.json";

// Códigos oficiais: IBGE /api/v1/localidades/municipios?view=nivelado,
// conferidos em 21/10/2026. Sem tabelas ou migrações.
const norm = (s: string) => (s || "").normalize("NFD")
  .replace(/[\u0300-\u036f]/g, "").replace(/\s+/g, " ").trim().toLowerCase();

export interface MunicipioEndereco { nome: string; uf: string; ibge: string; cep: string }

// Somente CEPs gerais confirmados pelo ViaCEP. Cidades com CEP por
// logradouro (ex.: Santarém, Belém e Manaus) exigem o CEP do endereço.
const CEPS: Record<string, string> = {
  "1505304": "68270-000", "1505106": "68250-000", "1503903": "68170-000",
  "1507979": "68285-000", "1503002": "68280-000", "1502855": "68210-000",
  "1500404": "68200-000", "1504802": "68220-000",
  "1506005": "68130-000", "1500503": "68230-000",
};
const porNome = new Map<string, MunicipioEndereco[]>();
for (const m of municipios) {
  const item = { nome: m.n, uf: m.u, ibge: m.i, cep: CEPS[m.i] || "" };
  const key = norm(m.n);
  porNome.set(key, [...(porNome.get(key) || []), item]);
}

export function getMunicipioEndereco(municipio?: string, uf?: string): MunicipioEndereco | undefined {
  const candidates = porNome.get(norm(municipio || "")) || [];
  if (uf) return candidates.find(m => m.uf === uf.toUpperCase());
  // Nomes repetidos em estados diferentes nunca são inferidos.
  return candidates.length === 1 ? candidates[0] : undefined;
}

export function getCodigoIbge(municipio?: string, uf?: string): string {
  if (!municipio || !uf) return "";
  return getMunicipioEndereco(municipio, uf)?.ibge || "";
}
