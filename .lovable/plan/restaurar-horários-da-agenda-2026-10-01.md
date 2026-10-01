# Restaurar horários da Agenda

## Objetivo
Corrigir somente **Novo Agendamento** e **Editar pelo lápis** para voltarem ao comportamento anterior.

## Alterações
- Remover integralmente a exigência de antecedência de 30 minutos desses dois fluxos.
- Permitir escolher um horário sugerido ou digitar qualquer horário válido dentro da disponibilidade cadastrada do profissional.
- Garantir que o botão **Agendar/Salvar** seja liberado quando paciente, profissional, data e horário forem válidos.
- Restaurar o encaixe forçado conforme as permissões já existentes, mantendo confirmação e justificativa auditável.
- Manter bloqueios de indisponibilidade, unidade, permissões, duplicidade e demais regras clínicas existentes.

## Limites
- Não alterar Gestão de Tratamentos, ciclos, prontuário, cotas externas ou operações de sessões.
- Não criar migração, não modificar dados reais e não publicar.

## Validação
- Testes da seleção digitada e pré-selecionada dentro e fora da disponibilidade.
- Conferência visual autenticada do Novo Agendamento e da edição pelo lápis, sem concluir gravações reais.
