import {afterEach,beforeEach,describe,expect,it,vi} from 'vitest';
const geo={version:1,ip:'203.0.113.10',source:'vercel_geoip',capturedAt:'2026-11-27T15:00:00Z',city:'Oriximiná',network:'not_configured'};
const response=(data:unknown)=>({ok:true,headers:{get:()=> 'application/json'},json:async()=>data});
describe('cache e fallback do contexto de rede',()=>{
 let now:number;
 beforeEach(()=>{vi.resetModules();now=100_000;vi.spyOn(Date,'now').mockImplementation(()=>now);vi.stubGlobal('AbortSignal',{timeout:()=>undefined});});
 afterEach(()=>{vi.restoreAllMocks();vi.unstubAllGlobals();});
 it('compartilha requisição concorrente e expira a captura',async()=>{
   const fetchMock=vi.fn().mockResolvedValue(response(geo));vi.stubGlobal('fetch',fetchMock);
   const {getPublicIp}=await import('./clientInfo');const cb=vi.fn();
   expect(await Promise.all([getPublicIp(cb),getPublicIp(cb)])).toEqual([geo.ip,geo.ip]);
   expect(fetchMock).toHaveBeenCalledTimes(1);expect(cb.mock.calls[0][0].city).toBe('Oriximiná');
   await getPublicIp(cb);expect(fetchMock).toHaveBeenCalledTimes(1);
   now+=300_001;await getPublicIp(cb);expect(fetchMock).toHaveBeenCalledTimes(2);
 });
 it('mantém IP-only quando endpoint não existe e separa os demais chamadores',async()=>{
   const fetchMock=vi.fn().mockResolvedValueOnce({ok:false,headers:{get:()=> 'text/html'}}).mockResolvedValue(response({ip:'203.0.113.11'}));
   vi.stubGlobal('fetch',fetchMock);const {getPublicIp}=await import('./clientInfo');const cb=vi.fn();
   expect(await getPublicIp(cb)).toBe('203.0.113.11');expect(cb.mock.calls[0][0].source).toBe('ipify_browser');expect(cb.mock.calls[0][0].city).toBeUndefined();
   await getPublicIp();expect(fetchMock.mock.calls[2][0]).toBe('https://api.ipify.org?format=json');
 });
 it('não reaproveita contexto vencido após falha e permite nova tentativa',async()=>{
   const fetchMock=vi.fn().mockResolvedValueOnce(response(geo)).mockRejectedValue(Error('offline'));
   vi.stubGlobal('fetch',fetchMock);const {getPublicIp}=await import('./clientInfo');const cb=vi.fn();
   await getPublicIp(cb);now+=300_001;expect(await getPublicIp(cb)).toBe('IP não disponível');expect(cb.mock.calls.at(-1)?.[0]).toBeNull();
   await getPublicIp(cb);expect(fetchMock).toHaveBeenCalledTimes(3);
   now+=15_001;fetchMock.mockResolvedValueOnce(response(geo));expect(await getPublicIp(cb)).toBe(geo.ip);
 });
});
