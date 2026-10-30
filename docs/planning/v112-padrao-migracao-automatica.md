# V112 padrão e migração automática dos agendamentos

Escopo aprovado: novos agendamentos de todos os providers usam V112; ao atualizar,
o sistema recupera automaticamente os workflows antigos de posts futuros ainda
não publicados. Não altera posts publicados, passados, rascunhos nem suas datas.

## Contratos

- `selectPostWorkflowVersion` passa a selecionar V112, inclusive Zernio. As antigas
  variáveis de rollout deixam de ser necessárias e não selecionam mais V102.
- Zernio envia uma vez em `postPending`; `checkPostStatus` apenas consulta.
  Somente `published` confirma sucesso; estados transitórios permanecem pendentes;
  `failed`, `partial` e `cancelled` encerram com erro sem repetir o envio.
- O bootstrap garante um singleton `migrate-post-workflows-v112` na fila `main`.
  O workflow varre lotes de 50 com cursor, repete a varredura e usa `continueAsNew`.
- O repository seleciona apenas raízes QUEUE futuras, não excluídas, sem release.
  Não seleciona credenciais. O service revalida o candidato antes de cada efeito.
- Substituição exige tipo legado conhecido, entrada correspondente ao post/org,
  snapshot correspondente à data atual, timer inicial ainda pendente e pelo menos
  30 minutos até sua execução. Qualquer activity além da leitura inicial impede
  a substituição. O run é fixado pelo runId; nunca terminar por visibilidade.
- Após terminar, o histórico final desse run precisa continuar limpo. O novo V112
  usa USE_EXISTING, preservando concorrentes. Falha entre término/início é retomada
  somente quando o histórico comprova término por esta migração.
- Execuções V112 já existentes são no-op. Casos sem prova, próximos do horário,
  canal indisponível ou edição concorrente são adiados e registrados. Nenhum reset
  em massa nem reutilização de `PostsService.startWorkflow`.
- Código/históricos V101/V102 permanecem compatíveis. Nenhuma chamada externa de
  publicação é feita pela migração; a primeira publicação real exige acompanhamento.

## Verificação

TDD para seleção, Zernio e migração: concorrência, retomada, publicação em curso,
cancelamento/edição, resultado final, payload sem segredo e preservação de datas.
Build backend/orchestrator e replay dos workflows existentes. Um teste isolado de
Temporal deve comprovar a substituição e a retomada sem publicar em redes reais.

## Experiência do aluno

Atualizar a imagem e reaplicar a stack. Não cadastrar IDs, rodar SQL nem reagendar
individualmente. A migração registra quantidades e motivos de adiamento nos logs.
Não prometer migração concluída enquanto houver casos adiados ou sem comprovação.
