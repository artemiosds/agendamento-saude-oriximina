# 12.6 — Padronização visual institucional
Risco baixo para regras de negócio, médio para regressão visual. Base d114a85d643dd3040f9f956eb8df68e4bbbc2377.
- Cabeçalho usa as mesmas classes clinical-hub-hero, clinical-patient-avatar, clinical-hub-name, clinical-hub-eyebrow e clinical-patient-sub da Gestão Operacional e Dados.
- Mantém menu lateral, pesquisa, as 12/10 seções, IDs, callbacks e acessos. Nav usa clinical-premium e clinical-dock-icon, tons existentes, destaque ativo, largura compacta e rolagem em desktop.
- Cards, abas e modais administrativos recebem classes locais; preservados tamanhos e rolagens específicos, estados semânticos, rascunhos e eventos. Componentes compartilhados recebem prop visual opcional adminAppearance, padrão false; não altera aparência de seus modais em outros chamadores. Nenhum conteúdo, template, layout de documento ou impressão alterado.
- Corrigida referência da única falha do CI anterior (1517 aprovados, 1 falha): teste usa o rótulo de carência do próprio catálogo, incluindo hífen Unicode. Nenhuma verificação removida.
- Nenhuma alteração de dados, schemas, políticas, credenciais, modelos, HTML de impressão, chamadas de API ou lógica assistencial. Inspeção visual autenticada de viewport e diálogos ainda pendente; resultado CI deve ser conferido.
