import { describe, expect, it } from 'vitest';
import { PORTAL_PUBLIC_URL, PORTAL_GUIDE_STEPS, PORTAL_GUIDE_SECURITY, portalAssistanceRoute, canContinueAssistedCreate } from './portalAssistance';

const base = {settingsReady:true,enabled:true,blocked:false,cpf:'123.456.789-01',diagnosis:{state:'unlinked' as const,emailValid:true,emailConfirmed:null}};
describe('inclusão digital orientada no portal', () => {
  it('não orienta ativação sem regras confirmadas, com portal desativado ou bloqueio', () => {
    expect(portalAssistanceRoute({...base,settingsReady:false})).toBe('unknown');
    expect(portalAssistanceRoute({...base,enabled:undefined})).toBe('unknown');
    expect(portalAssistanceRoute({...base,enabled:false})).toBe('disabled');
    expect(portalAssistanceRoute({...base,blocked:true})).toBe('blocked');
  });
  it('não inventa conta, acesso ou e-mail para resolver cadastro incompleto', () => {
    expect(portalAssistanceRoute({...base,diagnosis:undefined})).toBe('unknown');
    expect(portalAssistanceRoute({...base,diagnosis:{...base.diagnosis,state:'unknown'}})).toBe('unknown');
    expect(portalAssistanceRoute({...base,diagnosis:{...base.diagnosis,state:'divergent'}})).toBe('review');
    expect(portalAssistanceRoute({...base,diagnosis:{...base.diagnosis,emailValid:false},cpf:null})).toBe('contact');
  });
  it('diferencia primeiro acesso de cadastro legado sem CPF', () => {
    expect(portalAssistanceRoute(base)).toBe('first');
    expect(portalAssistanceRoute({...base,cpf:null})).toBe('legacy');
    expect(portalAssistanceRoute({...base,cpf:'123'})).toBe('legacy');
  });
  it('reutiliza conta existente sem propor criação de outra', () => {
    const verified = {...base,diagnosis:{state:'verified' as const,emailValid:true,emailConfirmed:true}};
    expect(portalAssistanceRoute(verified)).toBe('login');
    expect(portalAssistanceRoute({...verified,cpf:null})).toBe('login');
    const pending = {...verified,diagnosis:{...verified.diagnosis,emailConfirmed:false}};
    expect(portalAssistanceRoute(pending)).toBe('pending');
    expect(portalAssistanceRoute({...pending,cpf:null})).toBe('review');
    expect(portalAssistanceRoute({...verified,diagnosis:{...verified.diagnosis,emailConfirmed:null}})).toBe('unknown');
  });
  it('só libera continuação assistida após as três confirmações locais', () => {
    const checks = {identified:true,ownEmail:true,agreed:true};
    expect(canContinueAssistedCreate('first',checks)).toBe(true);
    expect(canContinueAssistedCreate('legacy',checks)).toBe(true);
    expect(canContinueAssistedCreate('legacy',{...checks,identified:false})).toBe(false);
    expect(canContinueAssistedCreate('first',{...checks,ownEmail:false})).toBe(false);
    expect(canContinueAssistedCreate('first',{...checks,agreed:false})).toBe(false);
    for (const route of ['unknown','disabled','blocked','review','contact','pending','login'] as const) expect(canContinueAssistedCreate(route,checks)).toBe(false);
  });
  it('gera somente instruções públicas sem dados do paciente nem credenciais no endereço', () => {
    expect(PORTAL_PUBLIC_URL).toBe('https://agendamento-saude-sms-oriximina.site/portal');
    expect(PORTAL_PUBLIC_URL.startsWith('https://')).toBe(true);
    expect(PORTAL_PUBLIC_URL.endsWith('/portal')).toBe(true);
    expect(/[?#]/.test(PORTAL_PUBLIC_URL)).toBe(false);
    expect(PORTAL_GUIDE_STEPS.length).toBe(4);
    expect(PORTAL_GUIDE_SECURITY.includes('Nunca compartilhe')).toBe(true);
  });
});
