import { useCallback } from 'react';
import { saveSystemConfigPatch } from '@/lib/systemConfigWriter';
import type { ExpectedConfigSection } from '@/lib/configSectionGuard';
import { useOperacional } from '@/contexts/OperacionalContext';
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

/** Validação e gravação serializada, com confirmação do banco. */
export function useConfiguracao() {
  const { configuracoes } = useOperacional();
  const { user } = useAuth();

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

  const atualizarConfiguracao = useCallback(
    async (key:string,value:unknown,options?:{silent?:boolean;auditAcao?:string;expectedSection?:ExpectedConfigSection}):Promise<boolean>=>{
      if(!user||user.role!=='master'||user.ativo!==true){toast.error('Acesso não autorizado.');return false;}
      const err=validate(key,value);
      if(err){toast.error('Validação falhou: '+err);return false;}
      try{
        await saveSystemConfigPatch({[key]:value},user.authUserId,options?.expectedSection);
        // Do not copy full configuration payloads, tokens or passwords into audit logs.
        void auditService.log({acao:options?.auditAcao||`ALTERAR_CONFIG_${key.toUpperCase()}`,entidade:'system_config',entidadeId:'default',modulo:'configuracoes',user:{id:user.id,nome:user.nome,role:user.role,unidadeId:user.unidadeId},detalhes:{chave_configuracao:key,gravacao_confirmada:true}});
        if(!options?.silent)toast.success('Configuração salva com sucesso');
        return true;
      }catch(error){toast.error(error instanceof Error?error.message:'Erro ao salvar. Alteração não confirmada.');return false;}
    },[user,validate]
  );
  // Legacy drafts are not scoped to a user/version; do not replay silently.
  const syncPendingDrafts=useCallback(async()=>{
    try{if(localStorage.getItem(DRAFT_KEY))toast.warning('Existe um rascunho antigo não aplicado. Confira os valores atuais antes de editar.');}catch{}
  },[]);

  return {
    configuracoes,
    atualizarConfiguracao,
    syncPendingDrafts,
    validate,
    isMaster: user?.role === 'master',
  };
}
