# Roadmap

- [x] Fase 4B: carregar o Histórico Completo progressivamente em faixas semiabertas de 90 dias.
- [x] Usar `data >= início` e `data < fim`; a faixa anterior termina no início da atual.
- [x] Ordenar sem horário como `00:00`; desempatar por prioridade fixa da fonte e ID.
- [x] Carregar detalhes clínicos por evento e drenar todas as faixas antes da impressão completa.
- [x] Validar isolamento por paciente, deduplicação, testes, tipos, build, lint e diff check.
