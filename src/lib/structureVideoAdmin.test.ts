import { describe,expect,it } from 'vitest';
import { moveVideoEntry,videoEntryLabel,playlistDraftChanged,videoPreviewAllowed } from './structureVideoAdmin';
describe('administração local da sequência de vídeos',()=>{
  it('reordena sem alterar a fonte, preservando entradas repetidas',()=>{
    const list=['a','b','a','c'];
    expect(moveVideoEntry(list,1,-1)).toEqual(['b','a','a','c']);
    expect(list).toEqual(['a','b','a','c']);
  });
  it('não move além dos limites',()=>{
    const list=['a','b'];
    expect(moveVideoEntry(list,0,-1)).toEqual(list);
    expect(moveVideoEntry(list,1,1)).toEqual(list);
    expect(moveVideoEntry(list,-1,1)).toEqual(list);
  });
  it('não exibe parâmetros assinados nem credenciais na identificação',()=>{
    expect(videoEntryLabel('https://example.invalid/Boas%20vindas.mp4?token=secret#x',0)).toBe('Boas vindas.mp4');
    expect(videoEntryLabel('https://user:pass@example.invalid',0)).toBe('Vídeo 1');
    expect(videoEntryLabel('https://example.invalid/%XX.mp4?token=secret',1)).toBe('%XX.mp4');
  });
  it('detecta alterações, remoções e endereço pendente',()=>{
    expect(playlistDraftChanged(['a','b'],['a','b'],' ')).toBe(false);
    expect(playlistDraftChanged(['b','a'],['a','b'],'')).toBe(true);
    expect(playlistDraftChanged(['a'],['a','b'],'')).toBe(true);
    expect(playlistDraftChanged(['a'],['a'],'https://example.invalid/video.mp4')).toBe(true);
  });
  it('prévia somente com HTTPS e sem credenciais embutidas',()=>{
    expect(videoPreviewAllowed('https://example.invalid/video.mp4')).toBe(true);
    expect(videoPreviewAllowed('http://example.invalid/video.mp4')).toBe(false);
    expect(videoPreviewAllowed('javascript:alert(1)')).toBe(false);
    expect(videoPreviewAllowed('https://user:pass@example.invalid/video.mp4')).toBe(false);
  });
});
