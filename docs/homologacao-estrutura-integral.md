# Restauração integral do candidato — 08/11/2026

Escopo: estrutura real capturada somente por leitura de metadados do ambiente original. Não foram consultados ou exportados registros clínicos, contas ou objetos de Storage. Não houve escrita no Lovable Cloud, criação de projeto, publicação ou alteração de produção.

## Resultado local reproduzível

O candidato de provisioning/candidates/2026-11-08 foi restaurado em PostgreSQL descartável (PGlite 0.5.15):

| Objeto | Quantidade conferida |
|---|---:|
| Tabelas públicas | 80 |
| Funções da aplicação | 115 |
| Constraints explícitas | 152 |
| Índices fora de constraints | 198 |
| Triggers de aplicação | 52 |
| View | 1 |
| Políticas públicas e Storage do candidato | 240 |

Todas as tabelas estavam vazias antes das fixtures sintéticas de teste e com RLS. As 115 definições foram recriadas com check_function_bodies=true após restaurar as dependências. Isso não equivale a executar todos os caminhos de negócio das funções.

Passaram: bloqueio original do candidato; recusa de destino não vazio; rollback de restauração completa com falha inserida ao final; negativa de configuração de carência para não-Master; negativa de escrita direta na tabela interna; leitura da própria unidade e recusa de leitura/exclusão de agendamento da unidade alheia.

As fixtures de agendamentos existem somente na memória descartável, com triggers desabilitadas apenas durante sua carga. O teste de RLS não valida o fluxo de agendamento de negócio. Nenhuma fixture vem nos SQL do candidato.

## Correções descobertas na restauração real

- Papéis de políticas capturados como name[] textual eram iterados caractere a caractere. A captura passa a usar JSON e o gerador aceita o formato anterior de forma controlada.
- security_invoker=on é representação válida e agora aceita, além de true/1.
- Resolução de extensões durante a instalação exige search_path local public,extensions.

## Diferenças somente no destino

O preparador cria uma cópia de metadados, nunca modifica a origem:
- Habilita RLS na tabela interna profession_careness_mapping_state, somente se as quatro funções relacionadas coincidirem com os hashes revisados e não houver grants diretos a anon/authenticated.
- Retira 81 grants PUBLIC/anon de funções SECURITY DEFINER.
- Retira 312 grants TRUNCATE/TRIGGER de anon/authenticated.
- Acrescenta uma política RESTRICTIVE de unidade em agendamentos. O teste anterior encontrou leitura cruzada entre unidades; com a política do candidato, o teste passou.

As três funções de configuração da carência verificam Master ativo. O quarto helper somente consulta se o mapeamento está atual e permanece interno. Não foi criado ou copiado estado confirmado de produção.

## Limites de aceite

A restauração estrutural local passou. O candidato continua BLOQUEADO para execução remota.
Auth e storage.objects foram emulados no teste; buckets reais, Storage API, Realtime, Edge Functions, pg_cron, pg_net, Vault, convite do administrador, catálogos oficiais, identidade, licença e fluxos completos no Cloud ainda não foram homologados.
O isolamento local verificado é o de agendamentos; outros módulos e acessos de profissionais externos/pacientes exigem seus próprios cenários. Não declarar o SaaS concluído.

A integração contínua executa o mesmo teste completo sem Secrets, sem rede para bancos e sem conexão com Oriximiná.
