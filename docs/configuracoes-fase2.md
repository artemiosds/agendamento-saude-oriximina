# Configurações — Fase 2 (arquitetura e navegação)
- As mesmas 12 chaves e componentes, sem mover operações entre permissões. Master global mantém 12 seções; outros Masters mantêm 10; não-Master mantém redirecionamento existente. Seleção revalidada se o escopo mudar.
- Navegação agrupada em três categorias, busca local por título, descrição e palavras-chave, insensível a acentos, sem consultar dados ou mostrar resultados restritos. A busca não troca a seção ativa até o clique.
- Cabeçalho institucional, navegação responsiva, foco de teclado, indicador de seção ativa e mensagem de carregamento. Dez componentes de configuração carregados sob demanda por React.lazy. Efeitos existentes da página, regras de negócio, formulários e gravações da Fase 1 foram mantidos; não foram adicionados caches de dados nem persistência de rascunhos.
- Corrigidas duas inferências TypeScript preexistentes na Auditoria (TS2589), limitando explicitamente o tipo de retorno das projeções JSON; filtros e colunas não mudaram.
- Sem migration, dependências, alterações de banco, RLS, credenciais, integrações ou rotas. A seção legada Unidades e Setores continua abrigando SIGTAP/procedimentos/integrações tal como antes.
- Testes de catálogo, restrição de acesso, seleção e busca adicionados. Build, testes de aplicação e homologação autenticada dependem dos resultados de CI/preview; não presumir aprovação.
