export const validSigtapCode=(code:string)=>/^\d{10}$/.test(code);
export const validCompetencia=(value:string)=>/^\d{4}(0[1-9]|1[0-2])$/.test(value);
export function confirmKeys(expected:readonly string[],actual:readonly string[]|null){return !!actual&&new Set(expected).size===expected.length&&new Set(actual).size===actual.length&&actual.length===expected.length&&actual.every(k=>expected.includes(k));}
export function safeIntegrationUrl(value:string){try{const u=new URL(value);return ['http:','https:'].includes(u.protocol)&&!!u.hostname&&!u.username&&!u.password;}catch{return false;}}
export function explicitSuccess(value:unknown){return !!value&&typeof value==='object'&&(value as Record<string,unknown>).success===true;}
