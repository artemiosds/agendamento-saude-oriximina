import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SPECIALTY_MAP = [
  { grupo: '03', subgrupo: '0205', especialidade: 'fisioterapia' },
  { grupo: '03', subgrupo: '0206', especialidade: 'fisioterapia' },
  { grupo: '03', subgrupo: '0207', especialidade: 'nutricao' },
  { grupo: '03', subgrupo: '0208', especialidade: 'psicologia' },
  { grupo: '03', subgrupo: '0209', especialidade: 'terapia_ocupacional' },
  { grupo: '03', subgrupo: '0210', especialidade: 'fonoaudiologia' },
  { grupo: '03', subgrupo: '0211', especialidade: 'assistencia_social' },
  { grupo: '03', subgrupo: '0101', especialidade: 'enfermagem' },
  { grupo: '03', subgrupo: '0201', especialidade: 'medico' },
];

const DATASUS_URL = "https://servicos.saude.gov.br/sigtap/ProcedimentoService/v1";

function buildSearchEnvelope(grupo: string, subgrupo: string, competencia: string, regInicial: number): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<soapenv:Envelope 
  xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/"
  xmlns:proc="http://servicos.saude.gov.br/sigtap/v1/procedimentoservice"
  xmlns:grup="http://servicos.saude.gov.br/schema/sigtap/procedimento/nivelagregacao/v1/grupo"
  xmlns:sub="http://servicos.saude.gov.br/schema/sigtap/procedimento/nivelagregacao/v1/subgrupo"
  xmlns:com="http://servicos.saude.gov.br/schema/corporativo/v1/competencia"
  xmlns:pag="http://servicos.saude.gov.br/wsdl/mensageria/v1/paginacao">
  <soapenv:Header>
    <wsse:Security 
      xmlns:wsse="http://docs.oasis-open.org/wss/2004/01/oasis-200401-wss-wssecurity-secext-1.0.xsd"
      xmlns:wsu="http://docs.oasis-open.org/wss/2004/01/oasis-200401-wss-wssecurity-utility-1.0.xsd">
      <wsse:UsernameToken wsu:Id="UsernameToken-1">
        <wsse:Username>SIGTAP.PUBLICO</wsse:Username>
        <wsse:Password Type="http://docs.oasis-open.org/wss/2004/01/oasis-200401-wss-username-token-profile-1.0#PasswordText">sigtap#2015public</wsse:Password>
      </wsse:UsernameToken>
    </wsse:Security>
  </soapenv:Header>
  <soapenv:Body>
    <proc:requestPesquisarProcedimentos>
      <grup:codigoGrupo>${grupo}</grup:codigoGrupo>
      <sub:codigoSubgrupo>${subgrupo}</sub:codigoSubgrupo>
      <com:competencia>${competencia}</com:competencia>
      <pag:Paginacao>
        <pag:registroInicial>${regInicial}</pag:registroInicial>
        <pag:quantidadeRegistros>100</pag:quantidadeRegistros>
        <pag:totalRegistros>0</pag:totalRegistros>
      </pag:Paginacao>
    </proc:requestPesquisarProcedimentos>
  </soapenv:Body>
</soapenv:Envelope>`;
}

function buildDetailEnvelope(codigoProcedimento: string, competencia: string): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<soapenv:Envelope
  xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/"
  xmlns:proc="http://servicos.saude.gov.br/sigtap/v1/procedimentoservice"
  xmlns:proc1="http://servicos.saude.gov.br/schema/sigtap/procedimento/v1/procedimento"
  xmlns:com="http://servicos.saude.gov.br/schema/corporativo/v1/competencia"
  xmlns:det="http://servicos.saude.gov.br/wsdl/mensageria/sigtap/v1/detalheadicional"
  xmlns:pag="http://servicos.saude.gov.br/wsdl/mensageria/v1/paginacao">
  <soapenv:Header>
    <wsse:Security
      xmlns:wsse="http://docs.oasis-open.org/wss/2004/01/oasis-200401-wss-wssecurity-secext-1.0.xsd"
      xmlns:wsu="http://docs.oasis-open.org/wss/2004/01/oasis-200401-wss-wssecurity-utility-1.0.xsd">
      <wsse:UsernameToken wsu:Id="UsernameToken-1">
        <wsse:Username>SIGTAP.PUBLICO</wsse:Username>
        <wsse:Password Type="http://docs.oasis-open.org/wss/2004/01/oasis-200401-wss-username-token-profile-1.0#PasswordText">sigtap#2015public</wsse:Password>
      </wsse:UsernameToken>
    </wsse:Security>
  </soapenv:Header>
  <soapenv:Body>
    <proc:requestDetalharProcedimento>
      <proc1:codigoProcedimento>${codigoProcedimento}</proc1:codigoProcedimento>
      <com:competencia>${competencia}</com:competencia>
      <proc:DetalhesAdicionais>
        <det:DetalheAdicional>
          <det:categoriaDetalheAdicional>CIDS</det:categoriaDetalheAdicional>
          <det:Paginacao>
            <pag:registroInicial>1</pag:registroInicial>
            <pag:quantidadeRegistros>999</pag:quantidadeRegistros>
            <pag:totalRegistros>0</pag:totalRegistros>
          </det:Paginacao>
        </det:DetalheAdicional>
      </proc:DetalhesAdicionais>
    </proc:requestDetalharProcedimento>
  </soapenv:Body>
</soapenv:Envelope>`;
}

// Extract text content from XML elements by local name (namespace-agnostic)
function extractByLocalName(xml: string, localName: string): string[] {
  const results: string[] = [];
  // Match any namespace prefix (or none) before the local name
  const regex = new RegExp(`<(?:[a-zA-Z0-9]+:)?${localName}[^>]*>([^<]*)</(?:[a-zA-Z0-9]+:)?${localName}>`, "gi");
  let m: RegExpExecArray | null;
  while ((m = regex.exec(xml)) !== null) {
    const val = m[1].trim();
    if (val) results.push(val);
  }
  return results;
}

function hasFault(xml: string): string | null {
  const faultStrings = extractByLocalName(xml, "faultstring");
  if (faultStrings.length > 0) return faultStrings[0];
  // Also check for Fault element
  if (xml.includes("Fault") && xml.includes("faultstring")) {
    const match = xml.match(/<(?:[a-zA-Z0-9]+:)?faultstring[^>]*>([\s\S]*?)<\/(?:[a-zA-Z0-9]+:)?faultstring>/i);
    if (match) return match[1].trim();
  }
  return null;
}

interface ProcInfo { codigo: string; nome: string; }

function parseProcedimentos(xml: string): ProcInfo[] {
  const procs: ProcInfo[] = [];
  const codigos = extractByLocalName(xml, "codigoProcedimento");
  const nomes = extractByLocalName(xml, "nomeProcedimento");
  for (let i = 0; i < codigos.length; i++) {
    procs.push({ codigo: codigos[i], nome: nomes[i] || codigos[i] });
  }
  return procs;
}

interface CidInfo { codigo: string; descricao: string; }

function parseCids(xml: string): CidInfo[] {
  const cids: CidInfo[] = [];
  const codigos = extractByLocalName(xml, "codigoCID");
  const descricoes = extractByLocalName(xml, "nomeCID");
  for (let i = 0; i < codigos.length; i++) {
    cids.push({ codigo: codigos[i], descricao: descricoes[i] || '' });
  }
  return cids;
}

async function soapSearch(body: string): Promise<string> {
  const resp = await fetch(DATASUS_URL, {
    method: "POST",
    headers: {
      "Content-Type": "text/xml;charset=UTF-8",
      "SOAPAction": '"http://servicos.saude.gov.br/sigtap/v1/procedimentoservice/pesquisarProcedimentos"',
    },
    body,
  });
  if (!resp.ok) {
    const txt = await resp.text();
    throw new Error(`DATASUS HTTP ${resp.status}: ${txt.substring(0, 300)}`);
  }
  return await resp.text();
}

async function soapDetail(body: string): Promise<string> {
  const resp = await fetch(DATASUS_URL, {
    method: "POST",
    headers: {
      "Content-Type": "text/xml;charset=UTF-8",
      "SOAPAction": '"http://servicos.saude.gov.br/sigtap/v1/procedimentoservice/detalharProcedimento"',
    },
    body,
  });
  if (!resp.ok) {
    const txt = await resp.text();
    throw new Error(`DATASUS HTTP ${resp.status}: ${txt.substring(0, 300)}`);
  }
  return await resp.text();
}

function delay(ms: number): Promise<void> {
  return new Promise(r => setTimeout(r, ms));
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const sb = createClient(supabaseUrl, serviceKey);

    const body = await req.json().catch(() => ({}));
    const requestedSpecs: string[] = body.especialidades || [...new Set(SPECIALTY_MAP.map(s => s.especialidade))];

    const now = new Date();
    const competencia = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, "0")}`;

    const resultado: Array<{ especialidade: string; procedimentos: number; cids: number; error?: string }> = [];
    let grandTotalProcs = 0;
    let grandTotalCids = 0;

    for (const esp of requestedSpecs) {
      const mappings = SPECIALTY_MAP.filter(m => m.especialidade === esp);
      if (mappings.length === 0) {
        resultado.push({ especialidade: esp, procedimentos: 0, cids: 0, error: "subgrupo_desconhecido" });
        continue;
      }

      let espProcs: ProcInfo[] = [];
      let espTotalCids = 0;

      try {
        // Fetch procedures from all subgroups for this specialty
        for (const mapping of mappings) {
          let regInicial = 1;
          let hasMore = true;
          while (hasMore) {
            console.log(`Fetching ${esp} grupo=${mapping.grupo} subgrupo=${mapping.subgrupo} reg=${regInicial}`);
            const xml = await soapSearch(buildSearchEnvelope(mapping.grupo, mapping.subgrupo, competencia, regInicial));
            
            // Check for SOAP fault
            const fault = hasFault(xml);
            if (fault) {
              console.error(`SOAP Fault for ${esp}/${mapping.subgrupo}: ${fault}`);
              throw new Error(`DATASUS retornou erro: ${fault}`);
            }

            const found = parseProcedimentos(xml);
            console.log(`Found ${found.length} procedures for ${esp}/${mapping.subgrupo}`);
            espProcs.push(...found);
            hasMore = found.length >= 100;
            regInicial += found.length;
            await delay(1000);
          }
        }

        // Deduplicate by codigo
        const uniqueMap = new Map<string, ProcInfo>();
        for (const p of espProcs) uniqueMap.set(p.codigo, p);
        espProcs = Array.from(uniqueMap.values());

        // Upsert procedures
        if (espProcs.length > 0) {
          for (const p of espProcs) {
            await sb.from("sigtap_procedimentos").upsert({
              codigo: p.codigo,
              nome: p.nome,
              especialidade: esp,
              ativo: true,
              updated_at: new Date().toISOString(),
            }, { onConflict: "codigo" });
          }
        }

        // Fetch CIDs for each procedure
        for (const proc of espProcs) {
          try {
            const detailXml = await soapDetail(buildDetailEnvelope(proc.codigo, competencia));
            
            const fault = hasFault(detailXml);
            if (fault) {
              console.error(`CID fault for ${proc.codigo}: ${fault}`);
              await delay(1000);
              continue;
            }

            const cids = parseCids(detailXml);

            if (cids.length > 0) {
              for (const c of cids) {
                await sb.from("sigtap_procedimento_cids").upsert({
                  procedimento_codigo: proc.codigo,
                  cid_codigo: c.codigo,
                  cid_descricao: c.descricao,
                }, {
                  onConflict: "procedimento_codigo,cid_codigo",
                  ignoreDuplicates: true,
                });
              }
              espTotalCids += cids.length;
            }

            // Update total_cids on the procedure
            await sb.from("sigtap_procedimentos")
              .update({ total_cids: cids.length })
              .eq("codigo", proc.codigo);

            await delay(1000);
          } catch (cidErr) {
            console.error(`Error fetching CIDs for ${proc.codigo}:`, cidErr);
          }
        }

        if (espProcs.length === 0) {
          const subgrupos = mappings.map(m => m.subgrupo).join(', ');
          resultado.push({ 
            especialidade: esp, 
            procedimentos: 0, 
            cids: 0, 
            error: `nenhum_procedimento_subgrupo_${subgrupos}_competencia_${competencia}` 
          });
        } else {
          resultado.push({ especialidade: esp, procedimentos: espProcs.length, cids: espTotalCids });
          grandTotalProcs += espProcs.length;
          grandTotalCids += espTotalCids;
        }
      } catch (espErr) {
        console.error(`Error syncing ${esp}:`, espErr);
        resultado.push({ 
          especialidade: esp, 
          procedimentos: 0, 
          cids: 0, 
          error: String(espErr).includes("DATASUS") ? String(espErr) : `conexao_falha` 
        });
      }
    }

    // Log sync
    await sb.from("pts_import_log").insert({
      tipo: body.tipo || "sync_datasus_manual",
      especialidade: "todas",
      total_procedimentos: grandTotalProcs,
      total_cids: grandTotalCids,
      competencia,
      detalhes: resultado,
    });

    return new Response(JSON.stringify({
      success: true,
      competencia,
      resultado,
      total_procedimentos: grandTotalProcs,
      total_cids: grandTotalCids,
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("sync-sigtap-datasus error:", err);
    return new Response(JSON.stringify({ success: false, error: String(err) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
