// Administrative playlist presentation only; no changes to the TV playback engine.
export function moveVideoEntry(list:readonly string[],index:number,delta:number):string[]{
  const target=index+delta;
  if(!Number.isInteger(index)||!Number.isInteger(delta)||index<0||index>=list.length||target<0||target>=list.length)return [...list];
  const next=[...list];[next[index],next[target]]=[next[target],next[index]];return next;
}
export function videoEntryLabel(value:string,index:number):string{
  const raw=value.split(/[?#]/,1)[0].split('/').pop()||'';
  try{return decodeURIComponent(raw).replace(/[\u0000-\u001f\u007f]/g,'').trim().slice(0,100)||'Vídeo '+(index+1);}
  catch{return raw.slice(0,100)||'Vídeo '+(index+1);}
}
export function playlistDraftChanged(current:readonly string[],original:readonly string[],pending:string):boolean{
  return !!pending.trim()||current.length!==original.length||current.some((url,i)=>url!==original[i]);
}
export function videoPreviewAllowed(value:string):boolean{
  try{const u=new URL(value);return u.protocol==='https:'&&!u.username&&!u.password;}catch{return false;}
}
