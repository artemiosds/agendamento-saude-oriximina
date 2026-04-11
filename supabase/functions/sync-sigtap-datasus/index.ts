import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SPECIALTY_MAP = [
  { grupo: '03', subgrupo: '05', especialidade: 'fisioterapia', label: 'Fisioterapia - Pré/Pós Op e Alterações Motoras' },
  { grupo: '03', subgrupo: '06', especialidade: 'fisioterapia', label: 'Fisioterapia - Neuro e Desenvolvimento' },
  { grupo: '03', subgrupo: '07', especialidade: 'nutricao', label: 'Nutrição' },
  { grupo: '03', subgrupo: '08', especialidade: 'psicologia', label: 'Psicologia' },
  { grupo: '03', subgrupo: '09', especialidade: 'terapia_ocupacional', label: 'Terapia Ocupacional' },
  { grupo: '03', subgrupo: '10', especialidade: 'fonoaudiologia', label: 'Fonoaudiologia' },
  { grupo: '03', subgrupo: '11', especialidade: 'assistencia_social', label: 'Assistência Social' },
  { grupo: '03', subgrupo: '01', especialidade: 'enfermagem', label: 'Enfermagem' },
  { grupo: '03', subgrupo: '02', especialidade: 'medico', label: 'Médico - Consultas e Atendimentos' },
];

const DATASUS_URL = "https://servicos.saude.gov.br/sigtap/ProcedimentoService/v1";

function buildPesquisarRequest(grupo: string, subgrupo: string, competencia: string): string {
  return `<soap:Envelope 
  xmlns:soap="http://www.w3.org/2003/05/soap-envelope" 
  xmlns:proc="http://servicos.saude.gov.br/sigtap/v1/procedimentoservice" 
  xmlns:grup="http://servicos.saude.gov.br/schema/sigtap/procedimento/nivelagregacao/v1/grupo" 
  xmlns:sub="http://servicos.saude.gov.br/schema/sigtap/procedimento/nivelagregacao/v1/subgrupo" 
  xmlns:com="http://servicos.saude.gov.br/schema/corporativo/v1/competencia" 
  xmlns:pag="http://servicos.saude.gov.br/wsdl/mensageria/v1/paginacao">
  <soap:Header>
    <wsse:Security 
      xmlns:wsse="http://docs.oasis-open.org/wss/2004/01/oasis-200401-wss-wssecurity-secext-1.0.xsd">
      <wsse:UsernameToken 
        wsu:Id="Id-0001334008436683-000000002c4a1908-1" 
        xmlns:wsu="http://docs.oasis-open.org/wss/2004/01/oasis-200401-wss-wssecurity-utility-1.0.xsd">
        <wsse:Username>SIGTAP.PUBLICO</wsse:Username>
        <wsse:Password 
          Type="http://docs.oasis-open.org/wss/2004/01/oasis-200401-wss-username-token-profile-1.0#PasswordText">sigtap#2015public</wsse:Password>
      </wsse:UsernameToken>
    </wsse:Security>
  </soap:Header>
  <soap:Body>
    <proc:requestPesquisarProcedimentos>
      <grup:codigoGrupo>${grupo}</grup:codigoGrupo>
      <sub:codigoSubgrupo>${subgrupo}</sub:codigoSubgrupo>
      <com:competencia>${competencia}</com:competencia>
      <pag:Paginacao>
        <pag:registroInicial>01</pag:registroInicial>
        <pag:quantidadeRegistros>100</pag:quantidadeRegistros>
        <pag:totalRegistros>100</pag:totalRegistros>
      </pag:Paginacao>
    </proc:requestPesquisarProcedimentos>
  </soap:Body>
</soap:Envelope>`;
}

function buildDetalharRequest(codigoProcedimento: string, competencia: string): string {
  return `<soap:Envelope 
  xmlns:soap="http://www.w3.org/2003/05/soap-envelope" 
  xmlns:proc="http://servicos.saude.gov.br/sigtap/v1/procedimentoservice" 
  xmlns:proc1="http://servicos.saude.gov.br/schema/sigtap/procedimento/v1/procedimento" 
  xmlns:com="http://servicos.saude.gov.br/schema/corporativo/v1/competencia" 
  xmlns:det="http://servicos.saude.gov.br/wsdl/mensageria/sigtap/v1/detalheadicional" 
  xmlns:pag="http://servicos.saude.gov.br/wsdl/mensageria/v1/paginacao">
  <soap:Header>
    <wsse:Security 
      xmlns:wsse="http://docs.oasis-open.org/wss/2004/01/oasis-200401-wss-wssecurity-secext-1.0.xsd">
      <wsse:UsernameToken 
        wsu:Id="Id-0001334008436683-000000002c4a1908-1" 
        xmlns:wsu="http://docs.oasis-open.org/wss/2004/01/oasis-200401-wss-wssecurity-utility-1.0.xsd">
        <wsse:Username>SIGTAP.PUBLICO</wsse:Username>
        <wsse:Password 
          Type="http://docs.oasis-open.org/wss/2004/01/oasis-200401-wss-username-token-profile-1.0#PasswordText">sigtap#2015public</wsse:Password>
      </wsse:UsernameToken>
    </wsse:Security>
  </soap:Header>
  <soap:Body>
    <proc:requestDetalharProcedimento>
      <proc1:codigoProcedimento>${codigoProcedimento}</proc1:codigoProcedimento>
      <com:competencia>${competencia}</com:competencia>
      <proc:DetalhesAdicionais>
        <det:DetalheAdicional>
          <det:categoriaDetalheAdicional>CIDS</det:categoriaDetalheAdicional>
          <det:Paginacao>
            <pag:registroInicial>1</pag:registroInicial>
            <pag:quantidadeRegistros>999</pag:quantidadeRegistros>
            <pag:totalRegistros>999</pag:totalRegistros>
          </det:Paginacao>
        </det:DetalheAdicional>
      </proc:DetalhesAdicionais>
    </proc:requestDetalharProcedimento>
  </soap:Body>
</soap:Envelope>`;
}

// Namespace-agnostic XML element extraction by local name
function extractByLocalName(xml: string, localName: string): string[] {
  const results: string[] = [];
  const regex = new RegExp(`<(?:[a-zA-Z0-9]+:)?${localName}(?:\\s[^>]*)?>([^<]*)</(?:[a-zA-Z0-9]+:)?${localName}>`, "gi");
  let m: RegExpExecArray | null;
  while ((m = regex.exec(xml)) !== null) {
    const val = m[1].trim();
    if (val) results.push(val);
  }
  return results;
}

function extractFault(xml: string): string | null {
  if (!xml.includes("Fault") && !xml.includes("fault")) return null;
  const match = xml.match(/<(?:[a-zA-Z0-9]+:)?faultstring[^>]*>([\s\S]*?)<\/(?:[a-zA-Z0-9]+:)?faultstring>/i);
  if (match) return match[1].trim();
  const reason = xml.match(/<(?:[a-zA-Z0-9]+:)?Text[^>]*>([\s\S]*?)<\/(?:[a-zA-Z0-9]+:)?Text>/i);
  if (reason) return reason[1].trim();
  return "Erro desconhecido do DATASUS";
}

interface ProcInfo { codigo: string; nome: string; }

function parseProcedimentos(xml: string): ProcInfo[] {
  const procs: ProcInfo[] = [];
  // Try codigoProcedimento/nomeProcedimento first
  let codigos = extractByLocalName(xml, "codigoProcedimento");
  let nomes = extractByLocalName(xml, "nomeProcedimento");
  
  // Fallback: try just 'codigo' and 'nome' if specific ones not found
  if (codigos.length === 0) {
    codigos = extractByLocalName(xml, "codigo");
    nomes = extractByLocalName(xml, "nome");
  }
  
  for (let i = 0; i < codigos.length; i++) {
    // Filter: procedure codes are numeric strings like "0302050019"
    if (/^\d{10}$/.test(codigos[i])) {
      procs.push({ codigo: codigos[i], nome: nomes[i] || codigos[i] });
    }
  }
  return procs;
}

interface CidInfo { codigo: string; descricao: string; }

function parseCids(xml: string): CidInfo[] {
  const cids: CidInfo[] = [];
  const codigos = extractByLocalName(xml, "codigoCID");
  const descricoes = extractByLocalName(xml, "nomeCID");
  
  if (codigos.length > 0) {
    for (let i = 0; i < codigos.length; i++) {
      cids.push({ codigo: codigos[i], descricao: descricoes[i] || '' });
    }
    return cids;
  }
  
  // Fallback: scan for CID-like codes (e.g., G800, F840, M199)
  const cidPattern = /([A-Z]\d{2,3}\.?\d*)/g;
  const allCodes = [...new Set(xml.match(cidPattern) || [])];
  for (const code of allCodes) {
    // Only real CID codes, skip XML artifacts
    if (/^[A-Z]\d{2,3}$/.test(code) || /^[A-Z]\d{2}\.\d{1,2}$/.test(code)) {
      cids.push({ codigo: code, descricao: '' });
    }
  }
  return cids;
}

async function soapFetch(body: string, timeoutMs = 30000): Promise<string> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    console.log(`[SIGTAP] Sending SOAP request to ${DATASUS_URL}`);
    const resp = await fetch(DATASUS_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/soap+xml;charset=UTF-8",
        "SOAPAction": "",
      },
      body,
      signal: controller.signal,
    });
    const text = await resp.text();
    console.log(`[SIGTAP] Response status: ${resp.status}, length: ${text.length}`);
    if (!resp.ok) {
      const fault = extractFault(text);
      throw new Error(fault || `DATASUS HTTP ${resp.status}: ${text.substring(0, 200)}`);
    }
    return text;
  } catch (err) {
    if (err instanceof DOMException && err.name === "AbortError") {
      throw new Error("DATASUS: Timeout - servidor não respondeu em 30s");
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

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

    const resultado: Array<{ especialidade: string; procedimentos: number; cids: number; error?: string; label?: string }> = [];
    let grandTotalProcs = 0;
    let grandTotalCids = 0;

    // Group subgroups by specialty
    const specSubgroups: Record<string, typeof SPECIALTY_MAP> = {};
    for (const m of SPECIALTY_MAP) {
      if (!requestedSpecs.includes(m.especialidade)) continue;
      if (!specSubgroups[m.especialidade]) specSubgroups[m.especialidade] = [];
      specSubgroups[m.especialidade].push(m);
    }

    for (const esp of requestedSpecs) {
      const mappings = specSubgroups[esp];
      if (!mappings || mappings.length === 0) {
        resultado.push({ especialidade: esp, procedimentos: 0, cids: 0, error: "subgrupo_desconhecido" });
        continue;
      }

      let espProcs: ProcInfo[] = [];
      let espTotalCids = 0;

      try {
        for (const mapping of mappings) {
          console.log(`[SIGTAP] Fetching ${esp} grupo=${mapping.grupo} subgrupo=${mapping.subgrupo}`);
          
          const xml = await soapFetch(buildPesquisarRequest(mapping.grupo, mapping.subgrupo, competencia));
          
          const fault = extractFault(xml);
          if (fault) {
            console.error(`[SIGTAP] SOAP Fault ${esp}/${mapping.subgrupo}: ${fault}`);
            throw new Error(`DATASUS: ${fault}`);
          }

          const found = parseProcedimentos(xml);
          console.log(`[SIGTAP] Found ${found.length} procedures for ${esp}/${mapping.subgrupo}`);
          espProcs.push(...found);
          
          await sleep(1500);
        }

        // Deduplicate
        const uniqueMap = new Map<string, ProcInfo>();
        for (const p of espProcs) uniqueMap.set(p.codigo, p);
        espProcs = Array.from(uniqueMap.values());

        // Upsert procedures
        for (const p of espProcs) {
          const { error: upsertErr } = await sb.from("sigtap_procedimentos").upsert({
            codigo: p.codigo,
            nome: p.nome,
            especialidade: esp,
            ativo: true,
            updated_at: new Date().toISOString(),
          }, { onConflict: "codigo" });
          if (upsertErr) console.error(`[SIGTAP] Upsert error ${p.codigo}:`, upsertErr);
        }

        // Fetch CIDs for each procedure
        for (const proc of espProcs) {
          try {
            const detailXml = await soapFetch(buildDetalharRequest(proc.codigo, competencia));
            
            const fault = extractFault(detailXml);
            if (fault) {
              console.error(`[SIGTAP] CID fault ${proc.codigo}: ${fault}`);
              await sleep(1500);
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

            await sb.from("sigtap_procedimentos")
              .update({ total_cids: cids.length })
              .eq("codigo", proc.codigo);

            await sleep(1500);
          } catch (cidErr) {
            console.error(`[SIGTAP] CID error ${proc.codigo}:`, cidErr);
          }
        }

        if (espProcs.length === 0) {
          resultado.push({
            especialidade: esp,
            procedimentos: 0,
            cids: 0,
            error: `nenhum_procedimento`,
            label: mappings[0]?.label,
          });
        } else {
          resultado.push({ especialidade: esp, procedimentos: espProcs.length, cids: espTotalCids });
          grandTotalProcs += espProcs.length;
          grandTotalCids += espTotalCids;
        }
      } catch (espErr) {
        console.error(`[SIGTAP] Error syncing ${esp}:`, espErr);
        const errMsg = String(espErr);
        resultado.push({
          especialidade: esp,
          procedimentos: 0,
          cids: 0,
          error: errMsg.includes("DATASUS") ? errMsg : "conexao_falha",
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
    console.error("[SIGTAP] Fatal error:", err);
    return new Response(JSON.stringify({ success: false, error: String(err) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
