// Cached public IP - fetched once per session
let cachedIp: string | null = null;
let fetchPromise: Promise<string> | null = null;

export async function getPublicIp(): Promise<string> {
  if (cachedIp) return cachedIp;
  if (fetchPromise) return fetchPromise;

  fetchPromise = (async () => {
    try {
      const res = await fetch('https://api.ipify.org?format=json', { signal: AbortSignal.timeout(1500) });
      const data = await res.json();
      cachedIp = data.ip || 'IP não disponível';
    } catch {
      cachedIp = 'IP não disponível';
    }
    return cachedIp!;
  })();

  return fetchPromise;
}

export function parseDeviceInfo(ua: string, touchPoints = 0) {
  let browser = 'Desconhecido';
  let os = 'Desconhecido';
  let device = 'desktop';

  if (ua.includes('Firefox')) browser = 'Firefox';
  else if (ua.includes('Edg')) browser = 'Edge';
  else if (ua.includes('Chrome')) browser = 'Chrome';
  else if (ua.includes('Safari')) browser = 'Safari';

  if (/iPhone|iPad|iPod/i.test(ua) || (/Macintosh/i.test(ua) && touchPoints > 1)) {
    os = 'iOS'; device = 'mobile';
  } else if (ua.includes('Android')) { os = 'Android'; device = 'mobile'; }
  else if (ua.includes('Windows')) os = 'Windows';
  else if (ua.includes('Mac')) os = 'macOS';
  else if (ua.includes('Linux')) os = 'Linux';

  return { browser, os, device, full: `${browser} / ${os}` };
}

export function getDeviceInfo() {
  return parseDeviceInfo(typeof navigator==='undefined'?'':navigator.userAgent, typeof navigator==='undefined'?0:navigator.maxTouchPoints||0);
}

