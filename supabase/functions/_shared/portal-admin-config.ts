export const PORTAL_KEYS = ['verProximas','cancelar','verHistorico','verFila','editarDados','imprimirComprovante'] as const;
export type PortalKey = typeof PORTAL_KEYS[number];
type Obj = Record<string, unknown>;
export type PortalChange =
  | { kind: 'block'; patientId: string; value: boolean }
  | { kind: 'enabled'; value: boolean }
  | { kind: 'permission'; key: PortalKey; value: boolean };
const object = (v: unknown): v is Obj => !!v && typeof v === 'object' && !Array.isArray(v);
const uuid = (v: unknown): v is string => typeof v === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);
export function parsePortalChange(v: unknown): PortalChange | null {
  if (!object(v) || typeof v.value !== 'boolean') return null;
  if (v.kind === 'block' && uuid(v.patientId)) return { kind: 'block', patientId: v.patientId, value: v.value };
  if (v.kind === 'enabled') return { kind: 'enabled', value: v.value };
  if (v.kind === 'permission' && PORTAL_KEYS.includes(v.key as PortalKey)) return { kind: 'permission', key: v.key as PortalKey, value: v.value };
  return null;
}
export function readPortalConfig(config: unknown) {
  if (!object(config)) throw Error('invalid config');
  const raw = config.portalPaciente;
  if (raw !== undefined && !object(raw)) throw Error('invalid portal');
  const portal: Obj = raw === undefined ? {} : raw as Obj;
  const blocks = portal.pacientesBloqueados;
  if (blocks !== undefined && (!Array.isArray(blocks) || blocks.some(id => !uuid(id)))) throw Error('invalid blocks');
  if (portal.permitirPortal !== undefined && typeof portal.permitirPortal !== 'boolean') throw Error('invalid enabled');
  if (portal.permissoes !== undefined && !object(portal.permissoes)) throw Error('invalid permissions');
  const rawPerms = (portal.permissoes ?? {}) as Obj;
  const permissions = Object.fromEntries(PORTAL_KEYS.map(k => {
    const flag = rawPerms[k];
    if (flag !== undefined && typeof flag !== 'boolean') throw Error('invalid permission');
    return [k, flag ?? true];
  })) as Record<PortalKey, boolean>;
  return { portal, rawPerms, enabled: portal.permitirPortal !== false, blocked: (blocks ?? []) as string[], permissions };
}
export function applyPortalChange(config: unknown, change: PortalChange) {
  const current = readPortalConfig(config);
  const previous = change.kind === 'block' ? current.blocked.includes(change.patientId) :
    change.kind === 'enabled' ? current.enabled : current.permissions[change.key];
  if (previous === change.value) return { changed: false, config: config as Obj, previous };
  const patch: Obj = change.kind === 'block' ? { pacientesBloqueados: change.value ? [...current.blocked, change.patientId] : current.blocked.filter(id => id !== change.patientId) } :
    change.kind === 'enabled' ? { permitirPortal: change.value } : { permissoes: { ...current.rawPerms, [change.key]: change.value } };
  return { changed: true, config: { ...(config as Obj), portalPaciente: { ...current.portal, ...patch } }, previous };
}
export type PortalSnapshot = { config: unknown; version: string };
export async function persistPortalChange(change: PortalChange, read: () => Promise<PortalSnapshot>, write: (snapshot: PortalSnapshot, next: Obj) => Promise<boolean>) {
  for (let attempt = 0; attempt < 3; attempt++) {
    const snapshot = await read();
    const result = applyPortalChange(snapshot.config, change);
    if (!result.changed) return { changed: false, previous: result.previous };
    if (await write(snapshot, result.config)) return { changed: true, previous: result.previous };
    // Retry only a confirmed version conflict (zero rows); errors/ambiguous writes throw.
  }
  throw Error('portal_config_conflict');
}
