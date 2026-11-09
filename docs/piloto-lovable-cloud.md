# Piloto real — Lovable Cloud

Ambiente criado exclusivamente para homologação, sem clonar outro projeto:
- Projeto: Gestão Saúde - Piloto SaaS.
- Cloud project ID: b45b5fc2-4ab6-4383-bd72-693800aae0db.
- Preview: https://id-preview--b45b5fc2-4ab6-4383-bd72-693800aae0db.lovable.app
- Não publicado. Nenhuma tela ou funcionalidade do sistema foi implementada via Lovable.
- Banco Cloud habilitado e serviços auth.users/storage.objects presentes.
- Preflight real: zero relações públicas; publicação Realtime presente; quatro extensões necessárias disponíveis (`pg_trgm`, `pgcrypto`, `unaccent`, `uuid-ossp`). O Cloud não suporta `moddatetime`.

A autorização desta fase é exclusiva de homologação. release-pilot-kit.py aceita somente este projeto e o snapshot estrutural cujo SHA-256 é a40521002020b117e9e64af9cfce8e70801ef1189a465535776936f959050304. O script confere o manifesto e os três artefatos; recusa qualquer outro projeto, destino ocupado ou serviços ausentes.

O script gera SQL local para este piloto, preservando a barreira de destino vazio. A adaptação específica do Cloud substitui somente o trigger de `procedimentos.atualizado_em` por `update_updated_at_column()`, após conferir o corpo da função original, e omite a extensão não suportada. Não tem parâmetro de conexão, não executa SQL e não libera políticas de Storage. O candidato original permanece bloqueado e não há liberação geral para produção.

Os códigos oficiais permanecem no GitHub. O ambiente novo foi criado apenas para provisionar recursos e testar a instalação. Oriximiná e Master não são destinos deste SQL.

Antes de aplicar: conferir novamente o projeto-alvo e o destino vazio. Depois: registrar contagens, RLS, ausência de dados e diferenças do Cloud. Auth real, buckets, funções, Secrets, aplicação, convite do administrador, catálogos e licença têm validação própria; não presumir conclusão.
