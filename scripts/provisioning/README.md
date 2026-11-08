# Preparação de instalação independente por prefeitura

Este diretório contém ferramentas de **pré-instalação**. Elas não criam projetos Supabase, não executam SQL, não criam usuários e não publicam aplicações.

## Barreiras de segurança atuais

1. `build-clean-kit.py` só prepara um pacote candidato a partir de metadados. Não exporta linhas de pacientes, usuários ou produção.
2. A preparação falha se o inventário de tabelas públicas estiver ausente/vazio ou se qualquer tabela não confirmar RLS habilitado.
3. Referências à instalação de Oriximiná, URLs, tokens e chaves privadas são rejeitadas; defaults sensíveis só são neutralizados nos campos explicitamente tratados.
4. O SQL gerado mantém uma exceção de bloqueio e não pode ser executado como instalador.
5. `render-tenant-config.py` gera um `config.toml` de destino substituindo somente o `project_id`, preservando as configurações de funções. Recusa project ref inválido, repetido ou igual ao projeto de origem.

## Gerar configuração de um projeto já criado

O projeto de destino precisa ser criado previamente no painel Supabase e seu project ref deve ser obtido no painel daquele projeto. Não use o project ref de Oriximiná.

```bash
python scripts/provisioning/render-tenant-config.py \
  --source-config supabase/config.toml \
  --project-id <PROJECT_REF_DO_NOVO_CLIENTE> \
  --output /tmp/tenant-supabase/config.toml
```

O comando não recebe nem grava service-role keys, senhas ou tokens. As secrets devem ser configuradas separadamente no ambiente do novo cliente.

## Testes locais

```bash
python -m unittest scripts/provisioning/test_clean_kit.py scripts/provisioning/test_tenant_config.py
```

## O que ainda impede provisionamento autônomo

- Criar o projeto Supabase de destino por API e armazenar credenciais administrativas em cofre seguro.
- Aplicar migrations revisadas e habilitar extensões, buckets, Storage policies, Realtime e Edge Functions.
- Importar catálogos oficiais sem dados pessoais ou dados operacionais de Oriximiná.
- Criar o primeiro administrador via convite seguro no Auth, sem senha padrão.
- Criar projeto de hospedagem, secrets, domínio e identidade institucional próprios.
- Emitir e validar licença Ed25519 com o Painel Master.
- Fazer teste ponta a ponta em uma prefeitura piloto independente.

Até que esses itens sejam implementados e homologados, não chamar o pacote de instalador pronto nem executar o SQL candidato em produção.

## Revisão adicional do pacote

O gerador exige os 13 inventários esperados, todos em formato de lista, e recusa arquivos JSON adicionais. Um diretório de saída não vazio nunca é sobrescrito, evitando misturar versões e checksums de pacotes distintos.

Também são recusadas funções SECURITY DEFINER com execução concedida a PUBLIC/anon, views sem security_invoker=true e privilégios TRUNCATE/TRIGGER para anon/authenticated. Essas verificações exigem revisão do candidato; não corrigem nem modificam o banco de origem.

Conferência somente de metadados em 08/11/2026: profession_careness_mapping_state está sem RLS, mas não foram encontrados grants de tabela para anon/authenticated. Quatro funções SECURITY DEFINER fazem referência a ela. A ausência de RLS impede o pacote pelo critério conservador do gerador; não comprova exposição pública da tabela. É necessário revisar a política do destino e testar as quatro funções antes de homologar. Nenhuma alteração foi aplicada à origem.

Os testes unitários do gerador validam essas barreiras. Eles não equivalem a uma restauração da estrutura completa nem à homologação Auth/Storage/Realtime.
