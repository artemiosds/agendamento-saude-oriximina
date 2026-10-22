import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
const fixture = vi.hoisted(() => ({ channels: [] as any[], response: 'recebida' as string | null, transport: 'ok' }));
vi.mock('@/integrations/supabase/client', () => ({ supabase: {
  channel(name: string) {
    const channel = { name, sent: [] as any[], status: (_s: string) => {}, event: (_v: any) => {},
      on(_type: string, _filter: unknown, callback: any) { this.event = callback; return this; },
      subscribe(callback: any) { this.status = callback; void Promise.resolve().then(() => callback('SUBSCRIBED')); return this; },
      async send(message: any) {
        this.sent.push(message);
        if (fixture.response) this.event({ payload: { id: message.payload.id, unidadeId: message.payload.unidadeId, status: fixture.response } });
        return fixture.transport;
      },
    }; fixture.channels.push(channel); return channel;
  }, removeChannel: vi.fn(async () => 'ok'),
} }));
const data = { pacienteNome: 'PACIENTE', local: 'SALA' };
beforeEach(() => { vi.useFakeTimers(); vi.resetModules(); fixture.channels = []; fixture.response = 'recebida'; fixture.transport = 'ok'; localStorage.clear(); });
afterEach(() => { vi.useRealTimers(); });
describe('transporte e confirmação da TV', () => {
  it('não considera ACK do servidor como confirmação da TV e reutiliza o ID no retry', async () => {
    fixture.response = null; const { solicitarChamada } = await import('./painelChamadas');
    const result = solicitarChamada('u1', data); await vi.advanceTimersByTimeAsync(7000);
    expect(await result).toBe('nao_confirmada');
    const sent = fixture.channels.flatMap(c => c.sent); expect(sent).toHaveLength(2); expect(sent[0].payload.id).toBe(sent[1].payload.id);
  });
  it.each(['recebida', 'recebida_sem_audio', 'ocupado'])('informa a resposta real da TV: %s', async status => {
    fixture.response = status; const { solicitarChamada } = await import('./painelChamadas');
    expect(await solicitarChamada('u1', data)).toBe(status);
  });
  it('rejeita chamada sem unidade e payload inválido', async () => {
    const { solicitarChamada, chamadaValida } = await import('./painelChamadas');
    expect(await solicitarChamada('', data)).toBe('erro'); expect(fixture.channels).toHaveLength(0);
    expect(chamadaValida({ id: '1' }, 'u1')).toBe(false);
    expect(chamadaValida({ ...data, id: '1', criadoEm: new Date().toISOString(), unidadeId: 'u2' }, 'u1')).toBe(false);
    expect(chamadaValida({ ...data, id: '1', criadoEm: new Date(0).toISOString() }, 'u1')).toBe(false);
  });
  it('um evento tardio do canal antigo não descarta o novo canal', async () => {
    const { solicitarChamada } = await import('./painelChamadas');
    await solicitarChamada('u1', data); const old = fixture.channels[0]; old.status('CHANNEL_ERROR');
    await solicitarChamada('u1', data); old.status('CLOSED'); await solicitarChamada('u1', data);
    expect(fixture.channels).toHaveLength(2);
  });
  it('separa sala por unidade/contexto e não recupera a preferência global antiga', async () => {
    const { getLocalSalvo, setLocalSalvo } = await import('./painelChamadas');
    localStorage.setItem('painel_chamadas_local', 'SALA ANTIGA');
    expect(getLocalSalvo('u1', 'triagem')).toBe('');
    setLocalSalvo('SALA 1', 'u1', 'consulta');
    expect(getLocalSalvo('u1', 'consulta')).toBe('SALA 1'); expect(getLocalSalvo('u2', 'consulta')).toBe(''); expect(getLocalSalvo('u1', 'triagem')).toBe('');
  });
  it('usa a sala ativa vinculada ao profissional na própria unidade', async () => {
    const { salasDeChamadaPorProfissional } = await import('./painelChamadas');
    const mapa = salasDeChamadaPorProfissional([
      { id: 'prof1', unidadeId: 'u1', salaId: 's3' },
      { id: 'prof2', unidadeId: 'u2', salaId: 's3' },
      { id: 'prof3', unidadeId: 'u1', salaId: 's4' },
    ], [
      { id: 's3', nome: 'CONSULTÓRIO 3', unidadeId: 'u1', ativo: true },
      { id: 's4', nome: 'CONSULTÓRIO 4', unidadeId: 'u1', ativo: false },
    ]);
    expect(mapa.get('prof1|u1')).toBe('CONSULTÓRIO 3');
    expect(mapa.has('prof2|u2')).toBe(false);
    expect(mapa.has('prof3|u1')).toBe(false);
  });
});
