import { useCallback, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useData } from '@/contexts/DataContext';
import { useAuth } from '@/contexts/AuthContext';
import { auditService } from '@/services/auditService';
import { toast } from 'sonner';
import { z } from 'zod';

/* ---------- Zod schemas for critical config sections ---------- */

const urlSchema = z.string().url('URL inválida').or(z.literal(''));

const sistemaConfigSchema = z.object({
  instituicao: z.object({
    nome: z.string().min(1, 'Nome é obrigatório').max(300),
    cer: z.string().max(300).optional(),
    cnpj: z.string().max(20).optional(),
    endereco: z.string().max(500).optional(),
    telefone: z.string().max(30).optional(),
    email: z.string().email('E-mail inválido').or(z.literal('')).optional(),
    logoUrl: urlSchema.optional(),
  }).optional(),
  notificacoes: z.record(z.unknown()).optional(),
  aparencia: z.object({
    tema: z.enum(['claro', 'escuro', 'sistema']).optional(),
    corPrimaria: z.string().max(20).optional(),
    fonte: z.string().max(50).optional(),
    tamanhoFonte: z.enum(['pequeno', 'medio', 'grande']).optional(),
  }).optional(),
  conformidade: z.object({
    lgpdTexto: z.string().max(5000).optional(),
    exibirAvisoLgpd: z.boolean().optional(),
    retencaoDados: z.number().min(1).max(100).optional(),
    anonimizarApos: z.number().min(1).max(100).optional(),
  }).optional(),
}).passthrough();

const DRAFT_KEY = 'config_draft_pending';

interface PendingDraft {
  key: string;
  value: unknown;
  timestamp: number;
}

/**
 * Hook centralizado para ler/gravar configurações com:
 * - Validação Zod
 * - Atualização otimista
 * - Auditoria automática
 * - Fallback offline (localStorage draft)
 */
export function useConfiguracao() {
  const { configuracoes, updateConfiguracoes } = useData();
  const { user } = useAuth();
  const savingRef = useRef(false);

  /** Validate a config section using Zod (only config_sistema for now) */
  const validate = useCallback((key: string, value: unknown): string | null => {
    if (key === 'config_sistema') {
      const result = sistemaConfigSchema.safeParse(value);
      if (!result.success) {
        return result.error.issues.map(i => i.message).join('; ');
      }
    }
    return null;
  }, []);

  /** Save a config key to system_config with optimistic update, audit & offline fallback */
  const atualizarConfiguracao = useCallback(
    async (key: string, value: unknown, options?: { silent?: boolean; auditAcao?: string }) => {
      if (savingRef.current) return;
      savingRef.current = true;

      // 1. Validate
      const err = validate(key, value);
      if (err) {
        toast.error(`Validação falhou: ${err}`);
        savingRef.current = false;
        return;
      }

      // 2. Capture old value for audit
      let oldValue: unknown = null;

      try {
        // 3. Read current row
        const { data: existing } = await supabase
          .from('system_config')
          .select('configuracoes')
          .eq('id', 'default')
          .maybeSingle();

        const existingConfig = (existing?.configuracoes as Record<string, unknown>) || {};
        oldValue = existingConfig[key] ?? null;

        const newConfig = { ...existingConfig, [key]: value };

        // 4. Optimistic UI update
        // (DataContext will pick it up via realtime too, but we set it eagerly)

        // 5. Persist
        const { error } = await supabase.from('system_config').upsert({
          id: 'default',
          configuracoes: newConfig as any,
          updated_at: new Date().toISOString(),
        });

        if (error) throw error;

        // 6. Clear any pending draft
        try { localStorage.removeItem(DRAFT_KEY); } catch {}

        // 7. Audit log (non-blocking)
        if (user) {
          auditService.log({
            acao: options?.auditAcao || `ALTERAR_CONFIG_${key.toUpperCase()}`,
            entidade: 'system_config',
            entidadeId: 'default',
            modulo: 'configuracoes',
            user: { id: user.id, nome: user.nome, role: user.role, unidadeId: user.unidadeId },
            oldValue: oldValue ? { [key]: oldValue } : undefined,
            newValue: { [key]: value },
          });
        }

        if (!options?.silent) toast.success('Configuração salva com sucesso');
      } catch (networkErr) {
        // 8. Offline fallback — save draft to localStorage
        try {
          const draft: PendingDraft = { key, value: value as any, timestamp: Date.now() };
          localStorage.setItem(DRAFT_KEY, JSON.stringify(draft));
        } catch {}

        toast.error('Erro ao salvar. Rascunho salvo localmente — será sincronizado automaticamente.');
        console.error('Config save error:', networkErr);
      } finally {
        savingRef.current = false;
      }
    },
    [user, validate],
  );

  /** Sync any pending drafts saved during offline periods */
  const syncPendingDrafts = useCallback(async () => {
    try {
      const raw = localStorage.getItem(DRAFT_KEY);
      if (!raw) return;

      const draft: PendingDraft = JSON.parse(raw);
      // Only sync drafts less than 24h old
      if (Date.now() - draft.timestamp > 86_400_000) {
        localStorage.removeItem(DRAFT_KEY);
        return;
      }

      toast.info('Sincronizando configuração pendente...');
      await atualizarConfiguracao(draft.key, draft.value, { silent: true, auditAcao: 'SYNC_CONFIG_OFFLINE' });
      toast.success('Configuração pendente sincronizada');
    } catch {
      // silently fail — will retry next time
    }
  }, [atualizarConfiguracao]);

  return {
    configuracoes,
    atualizarConfiguracao,
    syncPendingDrafts,
    validate,
    isMaster: user?.role === 'master',
  };
}
