# Integração de licença — Saúde Oriximiná e Painel Master

Data: 08/11/2026. Escopo: preparar a consulta assinada de licença sem ativá-la ainda.

## Comportamento preservado

- Nenhuma tabela ou coluna do banco de Saúde foi criada ou alterada.
- Nenhum dado de paciente, agendamento, atendimento, funcionário ou unidade foi alterado.
- A flag pública VITE_BACKOFFICE_LICENSE_ENABLED permanece desligada por padrão. Com false/ausente, o app mantém a configuração local atual e a licença padrão legada.
- O conteúdo das rotas aguarda a primeira verificação de licença antes de renderizar.
- A tela antiga de edição local Licença e Módulos foi retirada das Configurações. A gestão comercial e de licenças passa a ser centralizada no Painel Master.
- Quando a flag for ativada, consulta ausente, configuração incompleta, suspensão, expiração ou assinatura inválida bloqueiam os quatro grupos licenciados. Não existe fallback para a configuração local durante uma ativação central.

## Consulta central

A Edge Function backoffice-license-status é autenticada (verify_jwt=true) e lê segredos somente no runtime do Supabase. Ela consulta a RPC pública check_license_status do Backoffice, verifica localmente a assinatura Ed25519, valida a vigência e só então converte o escopo em quatro grupos que já existem no Saúde Oriximiná:

| Grupo atual do Saúde | Módulo do Painel Master |
|---|---|
| Faturamento SUS & BPA | faturamento_sus |
| Reabilitação (CER II & PTS) | reabilitacao |
| Triagem & Acolhimento | triagem |
| Regulação & Fila Especializada | regulacao |

Outros módulos do catálogo do Painel Master não são bloqueados por este adaptador legado; sua separação funcional depende de homologação própria.

## Configuração futura

Manter VITE_BACKOFFICE_LICENSE_ENABLED=false até concluir todos os itens abaixo. Quando for a hora de ativar, a flag deve ser definida como true no ambiente de build/deploy do Saúde Oriximiná. Ela não é segredo.

Configurar no Supabase do projeto Saúde Oriximiná, como Edge Function Secrets, nunca em VITE_*, arquivos .env, GitHub ou navegador:

- BACKOFFICE_SUPABASE_URL: URL do Supabase/Lovable do Painel Master.
- BACKOFFICE_SUPABASE_PUBLISHABLE_KEY: chave publicável/anon do projeto Backoffice (não usar service_role nem sb_secret_).
- BACKOFFICE_LICENSE_CODE: código LIC- emitido para a instalação de Saúde Oriximiná.
- BACKOFFICE_LICENSE_TRUSTED_KEYS_JSON: objeto JSON com key_id como chave e a chave pública Ed25519 raw/Base64 como valor.

A consulta central não usa cache local offline; falha de rede bloqueia os quatro grupos até a consulta ser restabelecida. Isso impede que flags do navegador sejam usadas para prolongar uma licença não verificada.

## Pendências antes de ativar

1. Cadastrar Prefeitura/Secretaria, contrato real e instalação no Painel Master, usando mensalidade de licença R$ 0,00.
2. Confirmar contrato assinado, datas, domínio/ambiente, módulos e evidências de validação.
3. Emitir a licença Ed25519 no Painel Master e obter a chave pública confiável correspondente ao key_id.
4. Provisionar os quatro segredos acima no projeto Saúde Oriximiná.
5. Implantar a Edge Function pelo fluxo autorizado e homologar status ativo, suspensão, revogação, expiração, rede indisponível, assinatura adulterada e URL direta.
6. Só depois da homologação, alterar a flag VITE_BACKOFFICE_LICENSE_ENABLED para true.

Esta alteração prepara o código no repositório; não implanta Edge Functions, não configura Secrets, não publica build e não ativa bloqueio central em produção.

## Vinculação da instalação e revalidação

A consulta central exige também os seguintes valores no runtime da Edge Function, obtidos do cadastro autorizado do destino:
- BACKOFFICE_CLIENT_ID
- BACKOFFICE_INSTALLATION_ID
- BACKOFFICE_INSTALLATION_ENVIRONMENT
- BACKOFFICE_INSTALLATION_DOMAIN

O código LIC-, cliente, instalação, ambiente e domínio precisam coincidir exatamente com o snapshot assinado. Configuração incompleta nega a consulta central. O navegador reconsulta a cada 60 segundos e ao voltar à aba, sem consultas sobrepostas. Isso não substitui autorização comercial nas operações do backend.

Essas mudanças não configuram Secrets nem implantam a função automaticamente. A flag central permanece opt-in. Instalação limpa, enforcement no banco/Edge Functions, provisionamento e demonstração ainda exigem implementação e homologação independentes.
