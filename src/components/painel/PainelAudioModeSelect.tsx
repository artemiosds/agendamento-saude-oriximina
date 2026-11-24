import type { PainelAudioMode } from '@/lib/painelAudioMode';

export function PainelAudioModeSelect({ id, value, disabled, onChange }: {
  id: string;
  value: PainelAudioMode;
  disabled?: boolean;
  onChange: (value: PainelAudioMode) => void;
}) {
  return <div className="space-y-1 text-left text-sm font-normal">
    <label htmlFor={id} className="block font-medium">Modo de voz</label>
    <select id={id} value={value} disabled={disabled} onChange={e => onChange(e.target.value === 'mp3' ? 'mp3' : 'navegador')}
      className="h-11 w-full min-w-0 rounded-lg border border-input bg-background px-3 text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50">
      <option value="navegador">Voz do navegador (padrão)</option>
      <option value="mp3">MP3 local · alternativa para TV</option>
    </select>
  </div>;
}
