# Portal — Fase 6: matriz de autorização e homologação

Referência: código-fonte da rede municipal, não inspeção de políticas ou dados ativos no Lovable Cloud.

| Regra | Controle atual previsto no código | Pendência |
| --- | --- | --- |
| Portal ativo / bloqueios | RPC get_portal_patient_status, RLS de leitura própria e revalidação periódica na interface | Confirmar implantação e sessão revogada |
| Próximas consultas / histórico | Interface; RLS atual restringe a ficha, não cada categoria | Revisão de políticas e projeção de dados no servidor |
| Fila | RLS com verFila, inscrição e reconciliação condicionadas | Testar revogação e notificações |
| Edição | public-scheduling update-patient confere JWT, vínculo e editarDados; campos de login proibidos | Verificar políticas diretas de UPDATE e corrida entre conferência e gravação |
| Cancelamento | RPC e gatilho existentes, antes da chegada, inclusive fluxo externo | Testar sem alterar cotas ou status de terceiros |
| Comprovantes | Interface reconfirma autorização na RPC antes da impressão | Não impede cópia de conteúdo já recebido |
| Meus exames e laudos | Aba existente independente; liberação técnica controla exibição | Não existe permissão institucional independente; revisar exposição de custom_data e projeção de laudos |
| Meus dados | Leitura da própria ficha; edição controlada | Revisar minimização de campos clínicos e dados internos |

Ações futuras de banco exigem autorização específica. Não há migration automática nesta fase.

## Casos de homologação necessários
- Usuário paciente próprio, outro paciente, Master local, Master Global, funcionário e profissional externo.
- Alterar cada flag, verificar sessão aberta e retorno após perda de conexão; não presumir revogação por falha de rede.
- Tentar leitura direta da API para categorias ocultas, campos clínicos internos e laudo não liberado.
- Tentar edição direta de e-mail de login, custom_data interno, outro paciente e após editarDados=false.
- Preservar agendamentos externos, Agenda, Triagem, Prontuário e operações dos funcionários.
- Verificar a ação pública legada update-patient-cns e seus consumidores antes de qualquer alteração de contrato; não é coberta pela proteção de update-patient.
- Confirmar configuração e publicação das funções, Vitest, compilação, impressão e revalidação de permissões em navegador autenticado.

A conferência de permissão antes de uma gravação não equivale a transação atômica com a configuração. Não há garantia de isolamento transacional nesta fase.
