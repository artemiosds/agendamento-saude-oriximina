import {ORIGIN_CACHE_MS,ORIGIN_RETRY_MS,parseAuditOrigin,plausibleIp,auditOriginEndpoint,type AuditOrigin} from './auditOrigin';

// Separate cached staff context from ordinary IP lookup. No location request for
// callers that only use the existing getPublicIp() contract.
type Snapshot={ip:string;context:AuditOrigin|null;expires:number};
const caches=new Map<boolean,Snapshot>();
const pending=new Map<boolean,Promise<Snapshot>>();
const now=()=>Date.now();
async function readSnapshot(withOrigin:boolean):Promise<Snapshot>{
  if(withOrigin&&typeof window!=='undefined'){
    try{
      const res=await fetch(auditOriginEndpoint(window.location.origin),{signal:AbortSignal.timeout(1100),cache:'no-store',credentials:'omit',referrerPolicy:'no-referrer'});
      if(res.ok&&(res.headers.get('content-type')||'').includes('application/json')){
        const context=parseAuditOrigin(await res.json());
        if(context?.source==='vercel_geoip')return {ip:context.ip,context,expires:now()+ORIGIN_CACHE_MS};
      }
    }catch{/* Hosting without the endpoint keeps the existing IP-only flow. */}
  }
  try{
    const res=await fetch('https://api.ipify.org?format=json',{signal:AbortSignal.timeout(withOrigin?650:1500),cache:'no-store',credentials:'omit',referrerPolicy:'no-referrer'});
    if(!res.ok)throw Error('IP indisponível');
    const data=await res.json();
    if(!plausibleIp(data.ip))throw Error('IP inválido');
    const context:AuditOrigin|null=withOrigin?{version:1,ip:data.ip,source:'ipify_browser',capturedAt:new Date().toISOString(),network:'not_configured'}:null;
    return {ip:data.ip,context,expires:now()+(withOrigin?60_000:ORIGIN_CACHE_MS)};
  }catch{return {ip:'IP não disponível',context:null,expires:now()+ORIGIN_RETRY_MS};}
}
export async function getPublicIp(onContext?:(value:AuditOrigin|null)=>void):Promise<string>{
  const withOrigin=!!onContext;
  let snapshot=caches.get(withOrigin);
  if(!snapshot||snapshot.expires<=now()){
    let request=pending.get(withOrigin);
    if(!request){
      request=readSnapshot(withOrigin).then(value=>{caches.set(withOrigin,value);return value;}).finally(()=>pending.delete(withOrigin));
      pending.set(withOrigin,request);
    }
    snapshot=await request;
  }
  onContext?.(snapshot.context);
  return snapshot.ip;
}

export function parseDeviceInfo(ua: string, touchPoints = 0) {
  let browser = 'Desconhecido';
  let os = 'Desconhecido';
  let device = 'desktop';

  if (ua.includes('Firefox')) browser = 'Firefox';
  else if (ua.includes('Edg')) browser = 'Edge';
  else if (ua.includes('Chrome')) browser = 'Chrome';
  else if (ua.includes('Safari')) browser = 'Safari';

  if (/iPhone|iPad|iPod/i.test(ua) || (/Macintosh/i.test(ua) && touchPoints > 1)) {
    os = 'iOS'; device = 'mobile';
  } else if (ua.includes('Android')) { os = 'Android'; device = 'mobile'; }
  else if (ua.includes('Windows')) os = 'Windows';
  else if (ua.includes('Mac')) os = 'macOS';
  else if (ua.includes('Linux')) os = 'Linux';

  return { browser, os, device, full: `${browser} / ${os}` };
}

export function getDeviceInfo() {
  return parseDeviceInfo(typeof navigator==='undefined'?'':navigator.userAgent, typeof navigator==='undefined'?0:navigator.maxTouchPoints||0);
}

