# Edge Functions — piloto Lovable Cloud

Inventário estático do repositório oficial. Nenhum valor de segredo é lido, copiado ou versionado.

## Escopo

O repositório contém 30 entrypoints em `supabase/functions/*/index.ts`. A conferência automatizada está em:

```bash
python scripts/provisioning/validate-edge-function-inventory.py supabase/functions
```

O script registra somente nomes de variáveis de ambiente e caminhos de imports relativos. Ele não publica funções nem configura credenciais.

## Variáveis de runtime

Variáveis comuns usadas pelo código das funções:

- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `SUPABASE_ANON_KEY`

O provedor do novo projeto deve fornecer os valores próprios do piloto. Nunca reutilizar as chaves de Oriximiná nem colocá-las no Git.

## Segredos de integrações opcionais

| Grupo | Variáveis | Funções |
|---|---|---|
| Autentique | `AUTENTIQUE_API_TOKEN` | `autentique-criar-documento`, `autentique-status-documento`, `autentique-webhook` |
| Google Calendar | `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` | `google-calendar-auth`, `google-calendar-sync` |
| Integração entre sistemas | `INTEGRATION_SELF_IDENTIFIER` | `integracao-admin`, `integracao-receber-encaminhamento` |
| Licença Master | `BACKOFFICE_CLIENT_ID`, `BACKOFFICE_INSTALLATION_DOMAIN`, `BACKOFFICE_INSTALLATION_ENVIRONMENT`, `BACKOFFICE_INSTALLATION_ID`, `BACKOFFICE_LICENSE_CODE`, `BACKOFFICE_LICENSE_TRUSTED_KEYS_JSON`, `BACKOFFICE_SUPABASE_PUBLISHABLE_KEY`, `BACKOFFICE_SUPABASE_URL` | `backoffice-license-status` |

As integrações externas devem permanecer desabilitadas até que o cliente do piloto possua suas próprias credenciais e a configuração tenha sido validada. O valor da licença deve ser emitido pelo Master para a instalação de homologação, não copiado de Oriximiná.

## Entry points identificados

1. `autentique-criar-documento`
2. `autentique-status-documento`
3. `autentique-webhook`
4. `auth-login`
5. `backoffice-license-status`
6. `ensure-patient-portal`
7. `generate-bpa`
8. `google-calendar-auth`
9. `google-calendar-sync`
10. `integracao-admin`
11. `integracao-receber-encaminhamento`
12. `manage-employee`
13. `manage-external`
14. `manage-patient-portal`
15. `mcp`
16. `patient-first-access`
17. `patient-signup`
18. `process-whatsapp-queue`
19. `public-scheduling`
20. `reset-password`
21. `send-email`
22. `send-reminders-whatsapp`
23. `send-reminders`
24. `send-whatsapp-evolution`
25. `send-whatsapp-uazapigo`
26. `sync-sigtap-datasus`
27. `system-backup`
28. `webhook-notify`
29. `whatsapp-health-snapshot`
30. `whatsapp-webhook-receiver`

## Situação da implantação

- Inventário e nomes de variáveis identificados.
- Código e testes permanecem no repositório oficial.
- As funções ainda precisam ser publicadas no runtime do projeto piloto e testadas com os Secrets próprios.
- A conexão Supabase disponível nesta sessão aceita somente project refs Supabase de 20 letras; o ID do projeto Lovable Cloud é um UUID e não é reconhecido por essa conexão. Não apontar as funções para outro projeto como alternativa.
- A publicação no Cloud precisa ocorrer pelo mecanismo de deploy de Edge Functions do próprio projeto Lovable Cloud ou por credencial de deploy suportada pelo provedor.
- Não criar Secrets com valores vazios, nem ativar integrações sem credenciais reais.
