---
name: Relatório Fonoaudiológico Avaliativo
description: Modelo individual exclusivo para Fonoaudiologia (CBO 223810) com proteção em frontend e banco
type: feature
---
- Acesso somente para profissionais cujo `funcionarios.custom_data->>cbo_codigo` normalizado seja exatamente `223810`. `admin.sms` é exceção (bypass).
- Trigger `enforce_fono_avaliativo_cbo` em `prontuarios` bloqueia INSERT/UPDATE com `tipo_registro='alta_individual_fono_v1'` quando o usuário autenticado não atende ao CBO.
- Função `current_user_cbo_codigo()` (SECURITY DEFINER) devolve o CBO normalizado do usuário logado.
- Aparece como sub-seletor após clicar em "Relatório Individual" no `RelatorioAlta.tsx`; outros CBOs seguem o fluxo individual padrão.
- Template estrutural em `src/lib/fonoAvaliativoTemplate.ts` (Versão 1) — formulário em `src/components/RelatorioFonoAvaliativo.tsx`.
- Persistência: reusa `prontuarios` com `tipo_registro='alta_individual_fono_v1'`, sem novas tabelas; respostas salvas em JSON em `observacoes`.
