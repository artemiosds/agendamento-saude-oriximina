import {describe,it,expect} from 'vitest';
import {parseDeviceInfo} from './clientInfo';
describe('detecção de dispositivos da auditoria',()=>{
  it('reconhece Android antes de Linux',()=>{
    expect(parseDeviceInfo('Mozilla/5.0 (Linux; Android 14) Chrome/120 Mobile Safari/537.36').os).toBe('Android');
    expect(parseDeviceInfo('Mozilla/5.0 (Linux; Android 14) Chrome/120 Mobile Safari/537.36').device).toBe('mobile');
  });
  it('reconhece iPhone e iPad antes de macOS',()=>{
    expect(parseDeviceInfo('Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) Safari/604.1').os).toBe('iOS');
    expect(parseDeviceInfo('Mozilla/5.0 (iPad; CPU OS 17_0 like Mac OS X) Safari/604.1').device).toBe('mobile');
    expect(parseDeviceInfo('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15) Safari/605.1',5).os).toBe('iOS');
  });
  it('preserva desktop e contratos existentes',()=>{
    expect(parseDeviceInfo('Mozilla/5.0 (Windows NT 10.0) Chrome/120 Edg/120')).toEqual({browser:'Edge',os:'Windows',device:'desktop',full:'Edge / Windows'});
    expect(parseDeviceInfo('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15) Safari/605.1').os).toBe('macOS');
    expect(parseDeviceInfo('Mozilla/5.0 (X11; Linux x86_64) Firefox/120').os).toBe('Linux');
    expect(parseDeviceInfo('').os).toBe('Desconhecido');
  });
});
