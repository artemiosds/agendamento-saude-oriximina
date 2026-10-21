export function videoSeguro(value: unknown): value is string {
  if (typeof value !== 'string') return false;
  try { return new URL(value).protocol === 'https:'; } catch { return false; }
}

/** Existing unit playlists are authoritative; retain the legacy configuration as fallback. */
export function playlistPainel(customData: Record<string, unknown>, legacy?: unknown): string[] {
  if (Array.isArray(customData.video_urls)) return customData.video_urls.filter(videoSeguro);
  if (videoSeguro(customData.video_url)) return [customData.video_url];
  return videoSeguro(legacy) ? [legacy] : [];
}

export function videoPrincipalPainel(current: string[], primary: string): string[] {
  return primary ? [...new Set([primary, ...current.slice(1)])] : current.slice(1);
}

export function linkPainelTV(origin: string, unidade: string): string {
  const url = new URL('/painel-tv', origin);
  url.searchParams.set('unidade', unidade);
  return url.toString();
}
