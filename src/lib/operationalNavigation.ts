export const OPERATIONAL_DATA_PATH='/painel/configuracoes-avancadas';
export const LEGACY_MONITORING_PATH='/painel/monitoramento';
export const MONITORING_DESTINATION=OPERATIONAL_DATA_PATH+'?aba=monitoramento';
export type OperationalSection='monitoramento'|'dados';
type OperationalIdentity={id?:string|null;role?:string|null;ativo?:boolean|null};
export function operationalAccess(user:OperationalIdentity|null|undefined,monitorPermission:boolean){
  const active=!!user?.id&&user.ativo===true;
  const master=active&&user?.role?.trim().toLowerCase()==='master';
  return {monitoramento:active&&(master||monitorPermission===true),dados:master};
}
export function operationalSection(requested:string|null,access:ReturnType<typeof operationalAccess>):OperationalSection|null{
  // An explicit restricted tab is denied, never silently replaced with privileged content.
  if(requested==='dados')return access.dados?'dados':null;
  if(requested==='monitoramento')return access.monitoramento?'monitoramento':null;
  if(access.monitoramento)return 'monitoramento';
  if(access.dados)return 'dados';
  return null;
}
export function operationalDestination(section:OperationalSection){
  return OPERATIONAL_DATA_PATH+'?aba='+section;
}
