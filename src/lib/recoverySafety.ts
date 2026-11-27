export const MAX_RECOVERY_BYTES=300*1024*1024;
export const MAX_RECOVERY_ENTRIES=10000;
export const MAX_INVENTORY_BYTES=2*1024*1024;
export type InventoryEntry={path:string;size:number};
export function safeRecoveryPath(path:string){
 return !!path&&path.length<=1024&&path.split('/').every(part=>!!part&&part!=='.'&&part!=='..'&&!/[\\:\u0000-\u001f\u007f]/.test(part));
}
export function parseStorageInventory(raw:string):InventoryEntry[]{
 const value:unknown=JSON.parse(raw);
 if(!value||typeof value!=='object'||!('format' in value)||value.format!=='sms-storage-inventory-v1'||!('files' in value)||!Array.isArray(value.files)||value.files.length>MAX_RECOVERY_ENTRIES)throw Error('Formato de inventário inválido.');
 const seen=new Set<string>();
 return value.files.map(row=>{
  if(!row||typeof row.path!=='string'||!safeRecoveryPath(row.path)||row.path.split('/').length<2||!Number.isSafeInteger(row.size)||row.size<0||seen.has(row.path))throw Error('Inventário contém caminho repetido ou tamanho inválido.');
  seen.add(row.path);return {path:row.path,size:row.size};
 });
}
export function compareStorageInventory(selected:readonly InventoryEntry[],expected:readonly InventoryEntry[]){
 const actual=new Map(selected.map(row=>[row.path,row.size]));
 const reference=new Map(expected.map(row=>[row.path,row.size]));
 let missing=0,extra=0,different=0;
 for(const [path,size] of reference){if(!actual.has(path))missing++;else if(actual.get(path)!==size)different++;}
 for(const path of actual.keys())if(!reference.has(path))extra++;
 return {missing,extra,different,matched:missing===0&&extra===0&&different===0&&actual.size===selected.length&&reference.size===expected.length};
}
// ZIP32 central directory preflight: reject oversized, encrypted, duplicate,
// traversal and unsupported archives before JSZip inflates any entry.
export function inspectRecoveryZip(buffer:ArrayBuffer){
 const view=new DataView(buffer),length=view.byteLength;
 const bad=()=>{throw Error('ZIP inválido, incompatível ou acima dos limites de segurança.');};
 if(length<22||length>MAX_RECOVERY_BYTES+8*1024*1024)bad();
 let end=-1;
 for(let i=length-22;i>=Math.max(0,length-65557);i--){
  if(view.getUint32(i,true)===0x06054b50&&i+22+view.getUint16(i+20,true)===length){end=i;break;}
 }
 if(end<0)bad();
 const count=view.getUint16(end+10,true),size=view.getUint32(end+12,true),offset=view.getUint32(end+16,true);
 if(view.getUint16(end+4,true)||view.getUint16(end+6,true)||view.getUint16(end+8,true)!==count||count>MAX_RECOVERY_ENTRIES*2||offset+size!==end)bad();
 const entries=new Map<string,number>();let cursor=offset,total=0;
 const decoder=new TextDecoder('utf-8',{fatal:true});
 for(let i=0;i<count;i++){
  if(cursor+46>end||view.getUint32(cursor,true)!==0x02014b50)bad();
  const flags=view.getUint16(cursor+8,true),method=view.getUint16(cursor+10,true),compressed=view.getUint32(cursor+20,true),plain=view.getUint32(cursor+24,true);
  const n=view.getUint16(cursor+28,true),extra=view.getUint16(cursor+30,true),comment=view.getUint16(cursor+32,true),local=view.getUint32(cursor+42,true);
  if(flags&1||![0,8].includes(method)||!n||cursor+46+n+extra+comment>end||local+30>offset||view.getUint32(local,true)!==0x04034b50||view.getUint16(cursor+34,true)!==0)bad();
  const localNameSize=view.getUint16(local+26,true),localExtra=view.getUint16(local+28,true);
  if(localNameSize!==n||local+30+localNameSize+localExtra+compressed>offset||view.getUint16(local+8,true)!==method||view.getUint16(local+6,true)&1)bad();
  const path=decoder.decode(new Uint8Array(buffer,cursor+46,n));
  if(decoder.decode(new Uint8Array(buffer,local+30,localNameSize))!==path)bad();
  const dir=path.endsWith('/');
  if(!safeRecoveryPath(dir?path.slice(0,-1):path)||entries.has(path)||plain>MAX_RECOVERY_BYTES||compressed>length||dir&&plain!==0)bad();
  entries.set(path,plain);total+=plain;
  if(total>MAX_RECOVERY_BYTES+MAX_INVENTORY_BYTES+4*1024*1024)bad();
  cursor+=46+n+extra+comment;
 }
 if(cursor!==end)bad();
 return entries;
}
