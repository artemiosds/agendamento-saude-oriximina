export type ConfigValues=Record<string,unknown>;
export type ConfigVersion={values:ConfigValues;version:string};
export function createConfigQueue(){
 let tail:Promise<unknown>=Promise.resolve();
 return function enqueue<T>(task:()=>Promise<T>):Promise<T>{
  const result=tail.then(task,task);
  tail=result.then(()=>undefined,()=>undefined);
  return result;
 };
}
export function snapshotConfigPatch(patch:ConfigValues):ConfigValues{
 const copy:unknown=JSON.parse(JSON.stringify(patch));
 if(!copy||typeof copy!=='object'||Array.isArray(copy))throw Error('Configuração inválida.');
 return copy as ConfigValues;
}
export async function commitConfigPatch(patch:ConfigValues,read:()=>Promise<ConfigVersion|null>,write:(values:ConfigValues,version:string|null)=>Promise<boolean>){
 const current=await read();
 const merged={...(current?.values??{}),...patch};
 if(!await write(merged,current?.version??null))throw Error('Configuração alterada ou não autorizada. Recarregue antes de tentar novamente.');
 return merged;
}
