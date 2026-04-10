// Manchester Triage Protocol — 5 Levels
export type ManchesterLevel = 'vermelho' | 'laranja' | 'amarelo' | 'verde' | 'azul';

export interface ManchesterConfig {
  level: ManchesterLevel;
  label: string;
  subtitle: string;
  tempo: string;
  color: string;
  bgLight: string;
  borderColor: string;
  textColor: string;
  order: number;
  pulse: boolean;
}

export const MANCHESTER_LEVELS: ManchesterConfig[] = [
  {
    level: 'vermelho',
    label: 'VERMELHO',
    subtitle: 'Emergência',
    tempo: 'Imediato',
    color: '#DC2626',
    bgLight: 'bg-red-50 dark:bg-red-950/30',
    borderColor: 'border-[#DC2626]',
    textColor: 'text-[#DC2626]',
    order: 1,
    pulse: true,
  },
  {
    level: 'laranja',
    label: 'LARANJA',
    subtitle: 'Muito Urgente',
    tempo: '≤ 10 min',
    color: '#EA580C',
    bgLight: 'bg-orange-50 dark:bg-orange-950/30',
    borderColor: 'border-[#EA580C]',
    textColor: 'text-[#EA580C]',
    order: 2,
    pulse: true,
  },
  {
    level: 'amarelo',
    label: 'AMARELO',
    subtitle: 'Urgente',
    tempo: '≤ 60 min',
    color: '#CA8A04',
    bgLight: 'bg-yellow-50 dark:bg-yellow-950/30',
    borderColor: 'border-[#CA8A04]',
    textColor: 'text-[#CA8A04]',
    order: 3,
    pulse: false,
  },
  {
    level: 'verde',
    label: 'VERDE',
    subtitle: 'Pouco Urgente',
    tempo: '≤ 120 min',
    color: '#16A34A',
    bgLight: 'bg-green-50 dark:bg-green-950/30',
    borderColor: 'border-[#16A34A]',
    textColor: 'text-[#16A34A]',
    order: 4,
    pulse: false,
  },
  {
    level: 'azul',
    label: 'AZUL',
    subtitle: 'Não Urgente',
    tempo: '≤ 240 min',
    color: '#2563EB',
    bgLight: 'bg-blue-50 dark:bg-blue-950/30',
    borderColor: 'border-[#2563EB]',
    textColor: 'text-[#2563EB]',
    order: 5,
    pulse: false,
  },
];

export const MANCHESTER_ORDER: Record<string, number> = {
  vermelho: 1,
  laranja: 2,
  amarelo: 3,
  verde: 4,
  azul: 5,
};

export function getManchesterConfig(level: string | null | undefined): ManchesterConfig | null {
  if (!level) return null;
  return MANCHESTER_LEVELS.find((m) => m.level === level.toLowerCase()) || null;
}

export function getManchesterBadgeStyle(level: string | null | undefined): { bg: string; text: string; label: string; color: string; pulse: boolean } {
  const config = getManchesterConfig(level);
  if (!config) return { bg: 'bg-muted', text: 'text-muted-foreground', label: '—', color: '#888', pulse: false };
  return {
    bg: config.bgLight,
    text: config.textColor,
    label: config.subtitle,
    color: config.color,
    pulse: config.pulse,
  };
}
