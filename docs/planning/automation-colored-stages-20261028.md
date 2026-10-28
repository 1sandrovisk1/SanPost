# Etapas visuais e pendências da automação

## Decisão

Organizar o editor rápido em grupos numerados, com cores suaves, ícone, título e resumo. Conta, origem, condições, resposta pública, mensagem privada, seguidores e extras aparecem apenas quando suportados pelo gatilho. Grupos recolhíveis independentes começam abertos para preservar o acesso aos campos; recolher não desmonta nem perde os dados. Não mudar contratos, execução, prévia ou ações de salvar/status. Reutilizar o componente nos comentários Instagram, Story e editor compartilhado Facebook/Messenger.

O card abaixo do telefone mostra exclusivamente as pendências reais que impedem salvar/ativar (sem dica genérica). Fonte única: validação existente do workspace, distribuída por contexto ao painel de prévia. Retirar a lista duplicada acima do rápido, conservar feedback de erro de operação e fallback para construtor sem prévia. Nenhuma afirmação de prontidão baseada somente no status da regra.

O estado de conexão indisponível usa triângulo de alerta, distinto da informação. Ajuda flutuante por portal deve funcionar no hover/foco, com Escape/saída; o ícone continua sendo link para Credenciais em nova aba. Campo select desabilitado não desabilita o link adjacente. Estado pronto e carregando permanecem corretos.

## Implementação e validação

Backup privado das views antes de editar. TDD nos componentes e integrações: grupos/ordem por gatilho, recolhimento conserva inputs, pendências apenas no painel de prévia, ausência quando válido, fallback do construtor, ícone/tooltip/link acessíveis. i18n pt/en. Revisões obrigatórias de plano/código/documentação/aceitação; sem mudança de backend nem credenciais. Build/tipagem, suítes afetadas e navegador local autenticado, sem salvar/ativar automações reais. Documentação e CHANGELOG em pt-BR. Não reaplicar elementos do mockup que já foram removidos por pedido do usuário (labels de prévia, avisos repetidos de conexão ou botão Pausar no rodapé).


## Resultado

Implementado nos três editores rápidos com os recursos efetivamente suportados. Grupos mantêm filhos montados e resumos acessíveis; pluralização dos contadores e pendência de palavra-chave do Messenger são explícitas. O alerta é link real, sem elementos interativos aninhados, com tooltip por portal.

Validação: suíte visual completa após sincronizar main 327/327 (45 arquivos), incluindo a nova regressão Messenger; frontend TypeScript e build Next aprovados. Plano, código, documentação e aceitação revisados, sem bloqueadores nem alterações de CLAUDE. Backup privado em `.secrets/colored-stages-20261028/views-before.tgz`. Não houve alteração de API, execução, status ou gravação de automações reais.


Navegador local: grupos Instagram recolhidos preservaram os valores e Salvar desabilitado; rascunho não salvo do Messenger exibiu pendência de palavra-chave, depois de resposta e ocultou o card ao preencher os campos. A escala do telefone se reduz somente com pendências reais para deixar o card visível. Não foi gravada ou ativada nenhuma regra. Evidências em `output/automation-colored-stages-20261028.png` e `output/automation-requirements-card-20261028.png` (fora do Git).

Branch sincronizada com origin/main, preservando as novas traduções de ambas as linhas por resolução de três vias. Build frontend e testes passaram após a integração; não foi realizada mudança de banco nesta rodada.
