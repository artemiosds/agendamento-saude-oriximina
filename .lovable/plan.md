# Fase 4A — carregamento sob demanda do Histórico Clínico

## Implementação
- Impedir `HistoricoCompletoModal` de consultar enquanto estiver fechado ou sem paciente válido.
- Cancelar consultas em andamento ao fechar ou trocar de paciente, usando `AbortController` e identificação monotônica da carga.
- Remover somente a consulta redundante de triagem com `limit(0)`, preservando todas as demais fontes, campos, filtros e ordenação.
- Manter uma única instância do modal completo na página e encaminhar para ela o botão já existente dentro do histórico.
- Controlar a aba ativa e montar documentos, encaminhamentos e anexos somente após a respectiva aba ser aberta.
- Adiar a consulta auxiliar de encaminhamentos feita na carga principal para a aba correspondente, sem alterar conteúdo ou permissões.

## Arquivos previstos
- `src/components/HistoricoCompletoModal.tsx`
- `src/components/HistoricoClinico.tsx`
- `src/pages/painel/Prontuario.tsx`

## Proteções
- Não alterar persistência clínica, criação, edição, autosave, sessão, exclusão, BPA, impressão, PDF, SIGTAP, Fases 1–3, banco ou permissões.
- Não alterar campos das consultas mantidas, filtros, aparência ou ordem cronológica.

## Verificação
- Conferir por instrumentação do navegador que não existem consultas de histórico antes da abertura, que cada aba carrega sob demanda e que fechar/trocar paciente não mistura respostas.
- Testar abrir, fechar, reabrir, alternar pacientes, visualizar, copiar e imprimir individualmente.
- Executar testes, verificação de tipos, build automático, lint e `git diff --check`; comparar lint antes/depois para separar problemas anteriores.
