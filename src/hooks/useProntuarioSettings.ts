import { useCallback, useRef } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useConfiguracao } from '@/hooks/useConfiguracao';
import { supabase } from '@/integrations/supabase/client';
import { configObject } from '@/lib/configSectionGuard';
import { createConfigQueue, snapshotConfigPatch } from '@/lib/configWriteQueue';

type Baseline = { key: string; identity: string; raw: unknown };
/** Scoped to administrative editors, not clinical records or professional preferences. */
export function useAdministrativeConfigSection(key: string) {
  const { user } = useAuth();
  const { atualizarConfiguracao } = useConfiguracao();
  const identity = user?.role === 'master' && user.ativo === true ? user.authUserId : undefined;
  const baseline = useRef<Baseline | null>(null);
  const queue = useRef(createConfigQueue());
  const load = useCallback(async () => {
    baseline.current = null;
    if (!identity) throw Error('Sessão administrativa não confirmada.');
    const { data, error } = await supabase.from('system_config').select('configuracoes').eq('id', 'default').maybeSingle();
    if (error || !data) throw Error('Não foi possível confirmar as configurações atuais.');
    const raw = configObject(data.configuracoes)[key];
    const { data: auth, error: authError } = await supabase.auth.getSession();
    if (authError || auth.session?.user.id !== identity) throw Error('Sessão alterada.');
    baseline.current = { key, identity, raw: snapshotConfigPatch({ raw }).raw };
    return raw;
  }, [identity, key]);
  const save = useCallback((build: (previous: unknown) => unknown) => queue.current(async () => {
    const current = baseline.current;
    if (!identity || !current || current.identity !== identity || current.key !== key) throw Error('Leitura ou sessão não confirmada. Nenhuma gravação realizada.');
    const value = snapshotConfigPatch({ value: build(current.raw) }).value;
    const ok = await atualizarConfiguracao(key, value, { silent: true, expectedSection: { key, value: current.raw } });
    if (!ok) return false;
    if (baseline.current === current) baseline.current = { ...current, raw: value };
    return true;
  }), [identity, key, atualizarConfiguracao]);
  return { load, save };
}

// Existing clinical configuration editor API remains compatible.
export const useProntuarioSettings = useAdministrativeConfigSection;
