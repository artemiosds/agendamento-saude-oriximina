import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
// Retired legacy endpoint: never exports database rows, files, auth or secrets.
// Native Lovable Cloud backup plus local recovery package is the supported path.
serve((req)=>{
 const headers={"Cache-Control":"private, no-store","Content-Type":"application/json; charset=utf-8","Access-Control-Allow-Origin":"*","Access-Control-Allow-Headers":"authorization, x-client-info, apikey, content-type","Access-Control-Allow-Methods":"POST, OPTIONS"};
 if(req.method==="OPTIONS")return new Response(null,{status:204,headers});
 if(req.method!=="POST")return new Response(JSON.stringify({error:"Método não permitido."}),{status:405,headers:{...headers,Allow:"POST"}});
 return new Response(JSON.stringify({error:"Exportador auxiliar desativado. Utilize o backup nativo do Lovable Cloud e o pacote local."}),{status:410,headers});
});
