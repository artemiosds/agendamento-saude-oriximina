# Permitir gerar o BPA-I com pendências autorizadas

## Objetivo
Fazer a opção **“Exportar mesmo com pendências críticas”** valer também na validação final, permitindo gerar e baixar o TXT quando o problema for um dado cadastral já autorizado por essa opção, como CNS ausente.

## Alterações
1. Separar os achados finais em duas classes:
   - **Pendência autorizável:** campo obrigatório ausente que já está coberto pela opção “Exportar mesmo com pendências críticas”.
   - **Falha estrutural real:** linha diferente de 338 posições, cabeçalho diferente de 130 posições, campo deslocado ou valor alterado durante a serialização.
2. Quando a opção estiver marcada:
   - manter a linha no arquivo com o valor ausente em branco, sem inventar CNS ou outros dados;
   - exibir o paciente, campo e motivo na lista de pendências e no relatório;
   - não mostrar “Erro na Geração” nem impedir o download por esse tipo de aviso.
3. Quando a opção estiver desmarcada, preservar o bloqueio atual para dados obrigatórios ausentes.
4. Manter o bloqueio incondicional para corrupção estrutural real, independentemente da opção, evitando gerar TXT com posições quebradas ou dados deslocados.
5. Ajustar a mensagem da opção para deixar claro que pendências autorizadas serão exportadas e registradas para auditoria.

## Validação
- Testar geração com CNS ausente e a opção marcada: arquivo disponível, pendência visível e CNS não convertido em zeros.
- Testar o mesmo cenário com a opção desmarcada: geração bloqueada.
- Testar adulteração estrutural: geração continua bloqueada.
- Confirmar cabeçalho com 130 posições e todos os Registros 03 com 338 posições.
- Executar os testes localizados do BPA-I e validar o fluxo real pela página.

## Limites
Não alterar Agenda, Prontuário, PTS, Sessões, consolidação, deduplicação, regras SIGTAP, DNE, telefone, cabeçalho ou contagem da produção.
