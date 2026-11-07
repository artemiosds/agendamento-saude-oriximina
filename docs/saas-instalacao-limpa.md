# Etapa 5 — pacote de preparação para instalação limpa

## Situação real

O pacote contém a estrutura atual capturada **somente por leitura de metadados**, sem consultar pacientes, atendimentos, prontuários, contas de acesso ou arquivos clínicos. Nenhuma alteração foi executada na instalação atual. Não houve publicação.

**Este é um candidato bloqueado para homologação, não um instalador pronto para venda.** Os arquivos SQL recusam a execução imediatamente; uma segunda barreira também recusa destinos com tabelas ou views existentes. Não remover essas barreiras na instalação de Oriximiná.

## Conteúdo

- Estrutura das 80 tabelas públicas atualmente encontradas, um tipo enumerado, funções, índices, constraints, triggers e políticas.
- Permissões de origem preservadas, sem ampliar acesso. Metadados de buckets, sem objetos ou arquivos.
- Políticas de arquivos separadas; os buckets precisam ser criados pela API no novo ambiente.
- Manifesto com quantidades, verificações de integridade e defaults neutralizados.
- **Não incluídos:** pacientes, agendas, documentos, contratos, usuários/senhas, chaves, catálogos, cron jobs, integrações configuradas ou arquivos de Oriximiná.

O histórico de migrations não é um instalador: contém correções de registros, sementes específicas e operações destrutivas. Não reproduzi-lo indiscriminadamente.

## Sequência segura de provisionamento

1. Autorizar e disponibilizar um projeto novo com Lovable Cloud, separado da instalação de Oriximiná. Confirmar que está vazio e registrar o identificador do destino de forma privada. Este pacote não cria projetos nem executa comandos remotos.
2. Revisar extensões disponíveis e dependências gerenciadas de Auth, Storage e Realtime. Não recriar tabelas internas desses serviços.
3. Revisar o candidato, incluindo a tabela sem RLS indicada no manifesto, funções com execução pública, referências entre schemas e permissões dos arquivos. A equivalência com a origem não constitui aprovação de segurança.
4. Em ambiente descartável, liberar uma cópia revisada do candidato. Restaurar dentro de uma transação e verificar rollback em falhas. Só gerar uma versão aprovada após validação documentada.
5. Criar buckets pela API com as regras revisadas; aplicar somente políticas autorizadas. Nunca copiar objetos da origem.
6. Revisar e disponibilizar as 29 funções de aplicação com configurações próprias. Não copiar segredos, tokens, webhooks, agendas automáticas ou endereços de Oriximiná. Não usar a criação automática atual de dono como procedimento genérico: há vínculo específico com a instalação original.
7. Criar uma conta de dono no Auth do destino por mecanismo confiável e vincular um funcionário ativo, role `master`, usuario `admin.sms`. Não criar senha fixa no SQL, copiar conta da origem ou liberar cadastro anônimo. Testar acesso de dono e negativa de um Master de unidade.
8. Importar CBO/CID/SIGTAP exclusivamente de fontes oficiais aprovadas, com competência registrada. Não fabricar códigos nem copiar produção clínica. Catálogos não vêm neste pacote.
9. Aplicar marca e licença a partir do cadastro verdadeiro do cliente. O JSON baixado no Painel Central é apenas configuração: não instala banco nem sincroniza automaticamente licenças remotas. Revisar antes o fallback público de marca/logo de Oriximiná.
10. Testar em separado: login, permissões, isolamento de unidade, agenda, chegada, triagem, prontuário, PTS/ciclos, documentos/impressão, BPA-I, arquivos e notificações. Usar registros autorizados próprios do destino; não copiar pacientes de Oriximiná e não gerar dados fictícios automaticamente.

## Critérios de aceite antes de liberar

- Todas as 80 tabelas e dependências necessárias restauradas sem erros; nenhum registro da origem presente.
- Login e primeiro dono funcionam; outros Masters não alteram licença/carteira comercial.
- Uma sessão real não pode ser gravada por usuário de outra unidade; duplicatas históricas não sofrem reparos automáticos.
- Criar e ler novamente pela tela um registro autorizado do novo ambiente, sem impacto na instalação original.
- Marca, catálogo e serviços externos pertencem ao destino; nenhum endereço ou segredo da origem permanece.
- Bloqueios comerciais efetivos, limite de usuários e integração com Painel Central homologados — hoje não estão certificados.
- Backup/restauração do novo ambiente testados e aprovação registrada antes de qualquer publicação.

## Bloqueio restante

Não há um novo ambiente autorizado e disponível nesta tarefa. A restauração, configuração de serviços e verificação ponta a ponta ficam pendentes; não é correto declarar o SaaS completo ou risco zero apenas pela geração dos arquivos.