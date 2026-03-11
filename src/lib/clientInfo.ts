// Cached public IP - fetched once per session
let cachedIp: string | null = null;
let fetchPromise: Promise<string> | null = null;

export async function getPublicIp(): Promise<string> {
  if (cachedIp) return cachedIp;
  if (fetchPromise) return fetchPromise;

  fetchPromise = (async () => {
    try {
      const res = await fetch('https://api.ipify.org?format=json', { signal: AbortSignal.timeout(5000) });
      const data = await res.json();
      cachedIp = data.ip || 'IP não disponível';
    } catch {
      cachedIp = 'IP não disponível';
    }
    return cachedIp!;
  })();

  return fetchPromise;
}

export function getDeviceInfo(): string {
  const ua = navigator.userAgent;
  let browser = 'Desconhecido';
  let os = 'Desconhecido';
  if (ua.includes('Firefox')) browser = 'Firefox';
  else if (ua.includes('Edg')) browser = 'Edge';
  else if (ua.includes('Chrome')) browser = 'Chrome';
  else if (ua.includes('Safari')) browser = 'Safari';
  if (ua.includes('Windows')) os = 'Windows';
  else if (ua.includes('Mac')) os = 'macOS';
  else if (ua.includes('Linux')) os = 'Linux';
  else if (ua.includes('Android')) os = 'Android';
  else if (ua.includes('iPhone') || ua.includes('iPad')) os = 'iOS';
  return `${browser} / ${os}`;
}
