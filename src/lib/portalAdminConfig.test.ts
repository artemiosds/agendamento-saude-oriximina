import { describe, expect, it, vi } from 'vitest';
import { applyPortalChange, parsePortalChange, persistPortalChange, readPortalConfig, type PortalChange } from '../../supabase/functions/_shared/portal-admin-config';

const a = '00000000-0000-4000-8000-000000000001';
const b = '00000000-0000-4000-8000-000000000002';
const block = (patientId: string, value = true): PortalChange => ({ kind: 'block', patientId, value });
describe('integridade das configurações administrativas do portal', () => {
  it('preserva configurações não relacionadas, permissões futuras e bloqueios de terceiros', () => {
    const original = { agenda: { limite: 2 }, portalPaciente: { custom: 'preservar', pacientesBloqueados: [a], permissoes: { cancelar: false, futura: 7 } } };
    const next = applyPortalChange(original, block(b));
    expect(next.changed).toBe(true);
    expect(next.config).toEqual({ ...original, portalPaciente: { ...original.portalPaciente, pacientesBloqueados: [a,b] } });
    expect(original.portalPaciente.pacientesBloqueados).toEqual([a]);
    expect(applyPortalChange(next.config, block(a,false)).config).toEqual({ ...original, portalPaciente: { ...original.portalPaciente, pacientesBloqueados: [b] } });
  });
  it('altera apenas uma permissão ou o estado institucional', () => {
    const c = { portalPaciente: { pacientesBloqueados: [a], permissoes: { cancelar: false, futura: 1 } }, externo: true };
    const p = applyPortalChange(c, {kind:'permission',key:'verFila',value:false});
    expect(p.config).toEqual({ ...c, portalPaciente: { ...c.portalPaciente, permissoes: { cancelar:false,futura:1,verFila:false } } });
    const enabled = applyPortalChange(p.config, {kind:'enabled',value:false});
    expect(readPortalConfig(enabled.config).enabled).toBe(false);
    expect(readPortalConfig(enabled.config).blocked).toEqual([a]);
    expect(readPortalConfig(enabled.config).permissions.cancelar).toBe(false);
  });
  it('mantém padrões legados e não escreve operação que já está no estado solicitado', () => {
    expect(readPortalConfig({}).enabled).toBe(true);
    expect(readPortalConfig({}).permissions.verFila).toBe(true);
    expect(applyPortalChange({}, {kind:'enabled',value:true}).changed).toBe(false);
    expect(applyPortalChange({portalPaciente:{pacientesBloqueados:[a]}},block(a)).changed).toBe(false);
    expect(applyPortalChange({},block(a,false)).changed).toBe(false);
  });
  it('nega comandos malformados ou configurações inconsistentes sem sobrescrever dados', () => {
    expect(parsePortalChange({kind:'permission',key:'outra',value:true})).toBeNull();
    expect(parsePortalChange({kind:'block',patientId:'inválido',value:true})).toBeNull();
    expect(parsePortalChange({kind:'enabled',value:'false'})).toBeNull();
    expect(parsePortalChange(block(a))).toEqual(block(a));
    expect(() => readPortalConfig({portalPaciente:{pacientesBloqueados:'inválido'}})).toThrow();
    expect(() => readPortalConfig({portalPaciente:{permissoes:{verFila:'false'}}})).toThrow();
    expect(() => readPortalConfig({portalPaciente:null})).toThrow();
  });
  it('reaplica apenas a intenção sobre a versão mais recente em conflito confirmado', async () => {
    let config: unknown = { portalPaciente:{pacientesBloqueados:[]}, agenda:1 };
    let version = 'v1'; let writes = 0;
    const result = await persistPortalChange(block(b), async () => ({config,version}), async (snapshot,next) => {
      writes++;
      if (writes === 1) { config = {portalPaciente:{pacientesBloqueados:[a]}, agenda:2}; version='v2'; return false; }
      expect(snapshot.version).toBe('v2'); config=next; return true;
    });
    expect(result.changed).toBe(true);
    expect(writes).toBe(2);
    expect(config).toEqual({portalPaciente:{pacientesBloqueados:[a,b]},agenda:2});
  });
  it('limita conflitos e nunca repete gravação de resultado desconhecido', async () => {
    const read = async () => ({config:{},version:'v1'});
    const conflict = vi.fn(async () => false);
    await expect(persistPortalChange(block(a),read,conflict)).rejects.toThrow('portal_config_conflict');
    expect(conflict).toHaveBeenCalledTimes(3);
    const ambiguous = vi.fn(async () => { throw Error('network'); });
    await expect(persistPortalChange(block(a),read,ambiguous)).rejects.toThrow('network');
    expect(ambiguous).toHaveBeenCalledTimes(1);
    const noop = vi.fn(async () => true);
    expect((await persistPortalChange(block(a,false),read,noop)).changed).toBe(false);
    expect(noop).not.toHaveBeenCalled();
  });
});
