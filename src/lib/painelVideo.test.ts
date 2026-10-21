import { describe, expect, it } from 'vitest';
import { linkPainelTV, playlistPainel, videoPrincipalPainel } from './painelVideo';
describe('compatibilidade do vídeo e link da TV', () => {
  it('preserva playlist da unidade e usa configuração antiga somente como fallback', () => {
    expect(playlistPainel({ video_urls: ['https://site/1.mp4', 'https://site/2.mp4'] }, 'https://site/old.mp4')).toEqual(['https://site/1.mp4', 'https://site/2.mp4']);
    expect(playlistPainel({}, 'https://site/old.mp4')).toEqual(['https://site/old.mp4']);
    expect(playlistPainel({ video_urls: [] }, 'https://site/old.mp4')).toEqual([]);
  });
  it('alterar vídeo principal preserva os demais vídeos', () => {
    expect(videoPrincipalPainel(['https://s/1.mp4', 'https://s/2.mp4'], 'https://s/novo.mp4')).toEqual(['https://s/novo.mp4', 'https://s/2.mp4']);
  });
  it('gera link na aplicação atual em vez de direcionar para outro domínio', () => {
    expect(linkPainelTV('https://preview.example', 'u 1')).toBe('https://preview.example/painel-tv?unidade=u+1');
  });
});
