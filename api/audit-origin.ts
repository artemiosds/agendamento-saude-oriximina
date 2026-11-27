import type {IncomingMessage,ServerResponse} from 'node:http';
import {isIP} from 'node:net';
import {originText,type AuditOrigin} from '../src/lib/auditOrigin';

type Headers=IncomingMessage['headers'];
const one=(headers:Headers,key:string)=>typeof headers[key]==='string'?headers[key] as string:'';
function cityName(raw:string){
  try{return originText(decodeURIComponent(raw));}catch{return '';}
}
// Optional server-only exact public-IP allowlist. No client-supplied IP, arbitrary
// lookup, network discovery, GPS, or patient identifiers. Fail closed on ambiguity.
export function matchInstitutionalNetwork(ip:string,raw?:string):Pick<AuditOrigin,'network'|'networkLabel'>{
  if(!raw||raw.length>32_000)return {network:'not_configured'};
  try{
    const config:unknown=JSON.parse(raw);
    if(!config||typeof config!=='object'||Array.isArray(config))return {network:'not_configured'};
    const entries=Object.entries(config).filter(([key,label])=>isIP(key)!==0&&typeof label==='string'&&!!originText(label));
    if(!entries.length)return {network:'not_configured'};
    const matches=entries.filter(([key])=>key.toLowerCase()===ip.toLowerCase());
    if(matches.length!==1)return {network:'unrecognized'};
    return {network:'matched',networkLabel:originText(matches[0][1])};
  }catch{return {network:'not_configured'};}
}
export function buildAuditOrigin(headers:Headers,enabled:boolean,networks?:string,now=new Date()):AuditOrigin|null{
  if(!enabled)return null;
  // Vercel-provided request IP, not a query parameter or a caller-provided body.
  const ip=one(headers,'x-vercel-forwarded-for').trim();
  if(!isIP(ip))return null; // Reject ambiguous forwarding chains.
  const country=one(headers,'x-vercel-ip-country').trim().toUpperCase();
  const region=one(headers,'x-vercel-ip-country-region').trim();
  return {version:1,ip,source:'vercel_geoip',capturedAt:now.toISOString(),
    city:cityName(one(headers,'x-vercel-ip-city'))||undefined,
    region:/^[A-Za-z0-9-]{1,12}$/.test(region)?region:undefined,
    country:/^[A-Z]{2}$/.test(country)?country:undefined,
    ...matchInstitutionalNetwork(ip,networks)};
}
export default function handler(req:IncomingMessage,res:ServerResponse){
  res.setHeader('Cache-Control','private, no-store, max-age=0');
  res.setHeader('Vercel-CDN-Cache-Control','no-store');
  res.setHeader('Content-Type','application/json; charset=utf-8');
  res.setHeader('X-Content-Type-Options','nosniff');
  if(req.method!=='GET'){res.setHeader('Allow','GET');res.statusCode=405;res.end(JSON.stringify({error:'method'}));return;}
  // Do not disclose configuration to other origins or accept arbitrary IP queries.
  const origin=buildAuditOrigin(req.headers,process.env.VERCEL==='1',process.env.AUDIT_INSTITUTIONAL_NETWORKS);
  res.statusCode=origin?200:503;
  res.end(JSON.stringify(origin||{error:'origin_unavailable'}));
}
