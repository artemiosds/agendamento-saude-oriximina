# Etapa 5 — instalação limpa

## Prontuário leve e fechamento seguro
- [x] Corrigir fechamento sem descartar alterações silenciosamente e testar falha/repetição de salvamento.
- [x] Reduzir efeitos gráficos e redesenho inicial mantendo configurações clínicas e isolamento.
- [x] Validar testes isolados e compilação; não publicar nem usar registros reais.
- [ ] Validar X/retomada na tela autenticada: sessão restaurada redirecionou para login, sem acesso ao prontuário.

- [x] Capturar apenas metadados da estrutura atual e identificar dependências de implantação.
- [x] Preparar pacote separado, sem dados clínicos, usuários, segredos ou configurações de Oriximiná.
- [x] Incluir barreira contra aplicação em ambiente existente e verificações de integridade.
- [x] Documentar provisionamento, catálogos oficiais e homologação pendente em ambiente isolado.
- [x] Validar sintaxe, testes e arquivo compactado sem publicar nem modificar o banco atual.
- [ ] Homologar restauração e fluxos reais: bloqueado pela ausência de novo ambiente isolado autorizado; revisar funções, marca inicial, integrações e catálogos oficiais no destino antes de liberar instalador.
- [ ] Localizar Vagas na Agenda — correções da revisão feitas; falta teste no navegador com login Recepção e Master (aguarda credenciais de teste)
