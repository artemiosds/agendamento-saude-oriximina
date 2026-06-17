// Mapa mínimo e extensível de códigos IBGE por município/UF.
// Não cria migration nem depende de tabela. Adicione novos pares quando necessário.

const norm = (s: string) =>
  (s || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();

// chave: `${municipio}|${uf}` normalizado
const MAP: Record<string, string> = {
  "oriximina|pa": "1505304",
  "obidos|pa": "1505205",
  "santarem|pa": "1506807",
  "alenquer|pa": "1500404",
  "juruti|pa": "1504000",
  "terra santa|pa": "1507458",
  "faro|pa": "1502608",
  "curua|pa": "1502764",
  "monte alegre|pa": "1504802",
  "belem|pa": "1501402",
  "manaus|am": "1302603",
  "sao paulo|sp": "3550308",
  "rio de janeiro|rj": "3304557",
  "brasilia|df": "5300108",
  "salvador|ba": "2927408",
  "fortaleza|ce": "2304400",
  "belo horizonte|mg": "3106200",
  "curitiba|pr": "4106902",
  "porto alegre|rs": "4314902",
  "recife|pe": "2611606",
};

export function getCodigoIbge(municipio?: string, uf?: string): string {
  if (!municipio || !uf) return "";
  const key = `${norm(municipio)}|${norm(uf)}`;
  return MAP[key] || "";
}
