import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SUBGROUP_MAP: Record<string, { grupo: string; subgrupos: string[] }> = {
  fisioterapia:        { grupo: "03", subgrupos: ["0205", "0206"] },
  psicologia:          { grupo: "03", subgrupos: ["0208"] },
  fonoaudiologia:      { grupo: "03", subgrupos: ["0210"] },
  nutricao:            { grupo: "03", subgrupos: ["0207"] },
  terapia_ocupacional: { grupo: "03", subgrupos: ["0209"] },
  assistencia_social:  { grupo: "03", subgrupos: ["0211"] },
  enfermagem:          { grupo: "03", subgrupos: ["0101", "0102"] },
  medico:              { grupo: "03", subgrupos: ["0201", "0202", "0203", "0204", "0212", "0213"] },
};

const DATASUS_URL = "https://servicos.saude.gov.br/sigtap/ProcedimentoService/v1";
const DATASUS_USER = "SIGTAP.PUBLICO";
const DATASUS_PASS = "sigtap#2015public";

function buildSearchEnvelope(grupo: string, subgrupo: string, competencia: string, regInicial: number): string {
  return `<soap:Envelope
  xmlns:soap="http://www.w3.org/2003/05/soap-envelope"
  xmlns:proc="http://servicos.saude.gov.br/sigtap/v1/procedimentoservice"
  xmlns:grup="http://servicos.saude.gov.br/schema/sigtap/procedimento/nivelagregacao/v1/grupo"
  xmlns:sub="http://servicos.saude.gov.br/schema/sigtap/procedimento/nivelagregacao/v1/subgrupo"
  xmlns:com="http://servicos.saude.gov.br/schema/corporativo/v1/competencia"
  xmlns:pag="http://servicos.saude.gov.br/wsdl/mensageria/v1/paginacao">
  <soap:Header>
    <wsse:Security xmlns:wsse="http://docs.oasis-open.org/wss/2004/01/oasis-200401-wss-wssecurity-secext-1.0.xsd">
      <wsse:UsernameToken>
        <wsse:Username>${DATASUS_USER}</wsse:Username>
        <wsse:Password>${DATASUS_PASS}</wsse:Password>
      </wsse:UsernameToken>
    </wsse:Security>
  </soap:Header>
  <soap:Body>
    <proc:requestPesquisarProcedimentos>
      <grup:codigoGrupo>${grupo}</grup:codigoGrupo>
      <sub:codigoSubgrupo>${subgrupo}</sub:codigoSubgrupo>
      <com:competencia>${competencia}</com:competencia>
      <pag:Paginacao>
        <pag:registroInicial>${regInicial}</pag:registroInicial>
        <pag:quantidadeRegistros>100</pag:quantidadeRegistros>
      </pag:Paginacao>
    </proc:requestPesquisarProcedimentos>
  </soap:Body>
</soap:Envelope>`;
}

function buildDetailEnvelope(codigo: string, competencia: string): string {
  return `<soap:Envelope
  xmlns:soap="http://www.w3.org/2003/05/soap-envelope"
  xmlns:proc="http://servicos.saude.gov.br/sigtap/v1/procedimentoservice"
  xmlns:proc1="http://servicos.saude.gov.br/schema/sigtap/procedimento/v1/procedimento"
  xmlns:com="http://servicos.saude.gov.br/schema/corporativo/v1/competencia"
  xmlns:det="http://servicos.saude.gov.br/wsdl/mensageria/sigtap/v1/detalheadicional"
  xmlns:pag="http://servicos.saude.gov.br/wsdl/mensageria/v1/paginacao">
  <soap:Header>
    <wsse:Security xmlns:wsse="http://docs.oasis-open.org/wss/2004/01/oasis-200401-wss-wssecurity-secext-1.0.xsd">
      <wsse:UsernameToken>
        <wsse:Username>${DATASUS_USER}</wsse:Username>
        <wsse:Password>${DATASUS_PASS}</wsse:Password>
      </wsse:UsernameToken>
    </wsse:Security>
  </soap:Header>
  <soap:Body>
    <proc:requestDetalharProcedimento>
      <proc1:codigoProcedimento>${codigo}</proc1:codigoProcedimento>
      <com:competencia>${competencia}</com:competencia>
      <proc:DetalhesAdicionais>
        <det:DetalheAdicional>
          <det:categoriaDetalheAdicional>CIDS</det:categoriaDetalheAdicional>
          <det:Paginacao>
            <pag:registroInicial>1</pag:registroInicial>
            <pag:quantidadeRegistros>999</pag:quantidadeRegistros>
          </det:Paginacao>
        </det:DetalheAdicional>
      </proc:DetalhesAdicionais>
    </proc:requestDetalharProcedimento>
  </soap:Body>
</soap:Envelope>`;
}

function extractTagValues(xml: string, tagName: string): string[] {
  const results: string[] = [];
  const regex = new RegExp(`<[^>]*?${tagName}[^>]*?>([^<]*)<`, "gi");
  let m: RegExpExecArray | null;
  while ((m = regex.exec(xml)) !== null) {
    if (m[1].trim()) results.push(m[1].trim());
  }
  return results;
}

interface ProcInfo { codigo: string; nome: string; }

function parseProcedimentos(xml: string): ProcInfo[] {
  const procs: ProcInfo[] = [];
  const codigos = extractTagValues(xml, "codigoProcedimento");
  const nomes = extractTagValues(xml, "nomeProcedimento");
  for (let i = 0; i < codigos.length; i++) {
    procs.push({ codigo: codigos[i], nome: nomes[i] || codigos[i] });
  }
  return procs;
}

interface CidInfo { codigo: string; descricao: string; }

function parseCids(xml: string): CidInfo[] {
  const cids: CidInfo[] = [];
  const codigos = extractTagValues(xml, "codigoCID");
  const descricoes = extractTagValues(xml, "nomeCID");
  for (let i = 0; i < codigos.length; i++) {
    cids.push({ codigo: codigos[i], descricao: descricoes[i] || '' });
  }
  return cids;
}

async function soapRequest(body: string): Promise<string> {
  const resp = await fetch(DATASUS_URL, {
    method: "POST",
    headers: { "Content-Type": "text/xml; charset=utf-8" },
    body,
  });
  if (!resp.ok) {
    const txt = await resp.text();
    throw new Error(`DATASUS HTTP ${resp.status}: ${txt.substring(0, 200)}`);
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
    const requestedSpecs: string[] = body.especialidades || Object.keys(SUBGROUP_MAP);
    
    const now = new Date();
    const competencia = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, "0")}`;
    
    const resultado: Array<{ especialidade: string; procedimentos: number; cids: number; error?: string }> = [];
    let grandTotalProcs = 0;
    let grandTotalCids = 0;

    for (const esp of requestedSpecs) {
      const mapping = SUBGROUP_MAP[esp];
      if (!mapping) {
        resultado.push({ especialidade: esp, procedimentos: 0, cids: 0, error: "subgrupo_desconhecido" });
        continue;
      }

      let espProcs: ProcInfo[] = [];
      let espTotalCids = 0;

      try {
        for (const subgrupo of mapping.subgrupos) {
          let regInicial = 1;
          let hasMore = true;
          while (hasMore) {
            const xml = await soapRequest(buildSearchEnvelope(mapping.grupo, subgrupo, competencia, regInicial));
            const found = parseProcedimentos(xml);
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
          const rows = espProcs.map(p => ({
            codigo: p.codigo,
            nome: p.nome,
            especialidade: esp,
            ativo: true,
            updated_at: new Date().toISOString(),
          }));
          
          for (const row of rows) {
            await sb.from("sigtap_procedimentos").upsert(row, { onConflict: "codigo" });
          }
        }

        // Fetch CIDs for each procedure
        for (const proc of espProcs) {
          try {
            const detailXml = await soapRequest(buildDetailEnvelope(proc.codigo, competencia));
            const cids = parseCids(detailXml);
            
            if (cids.length > 0) {
              const cidRows = cids.map(c => ({
                procedimento_codigo: proc.codigo,
                cid_codigo: c.codigo,
                cid_descricao: c.descricao,
              }));
              
              for (const cidRow of cidRows) {
                await sb.from("sigtap_procedimento_cids").upsert(cidRow, {
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
      } catch (espErr) {
        resultado.push({ especialidade: esp, procedimentos: 0, cids: 0, error: String(espErr) });
        continue;
      }

      resultado.push({ especialidade: esp, procedimentos: espProcs.length, cids: espTotalCids });
      grandTotalProcs += espProcs.length;
      grandTotalCids += espTotalCids;
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
