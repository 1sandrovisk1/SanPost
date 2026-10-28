# Revisão de automações: histórico, edição e prévias

## Escopo e contrato

Atender à revisão visual de 28/10 preservando as regras e provas já concluídas no Escorpiano. Nenhuma edição de regra ativa, envio real ou campanha é necessária para validar a interface. Fazer backup privado de fontes antes das alterações.

- Histórico: feedback ocupado/concluído/erro no refresh manual, sem mudar o polling existente; padding das setas também no histórico; fuso somente em ajuda no cabeçalho Início. Trocar o disclosure de ajuda que expande o layout por tooltip/popover ancorado em portal, com hover, foco, clique, Escape, dismiss externo e posicionamento limitado à viewport. Revisar todos os consumidores de ajuda em Automações.
- Editor: IDs selecionados dentro da área de localização de publicação; expandir galeria por botão de ícone na linha de Publicações específicas. Manter seleção combinada e snapshots de modos. Tirar pendências/accordion da barra e mostrar orientação no corpo do editor; manter erros e impacto operacional visíveis. Avatar na conta/Página e no subtítulo da automação; indicador de conexão no próprio controle, com link para Credenciais em nova aba quando necessário. Preservar acesso às informações de validade e à ativação do recebimento nas Credenciais. Sem verificar todas as contas da lista ou duplicar consultas remotas: usar o mesmo cache de prontidão da conta selecionada.
- Mensagens: espaçamento do label; retirar título redundante Resposta quando a seção pública já tem título/toggle. Componente de variáveis compartilhado que insere tokens reais de cada motor no cursor. Messenger só oferece dados disponíveis (texto/MID; sem nome ou publicação inventados). Variações privadas são alternativas de uma única resposta, até dez; um botão/link comum às alternativas, limites por alternativa e por caminho. Não são novos envios em sequência e não garantem evitar bloqueios.
- Contrato aditivo para variações: `dmMessages?: string[]` na configuração pública/MCP, `messages?: string[]` em SEND_DM V1/V2. Preservar o singular, patches parciais e transição singular/plural explícita. Atualizar capabilities, schemas, facades, quick create/update, extrações/round-trip, compatibilidade do rápido e inspetores. Escolha ocorre uma vez antes do snapshot da execução/PendingPostback; retry e clique reutilizam a mensagem escolhida. V2 comentário e Messenger usam chooser na ingestão, nunca no envio. Vários SEND_DM V2 continuam reunidos em uma resposta única. Gate V1 congela alternativa antes de snapshotFinalDm. Sem migration Prisma.
- Prévia: manter somente telefone e controles úteis; remover labels externos redundantes, tirar tabs do interior do telefone e usar ícones acessíveis com nome/tooltip. Reconhecer Instagram/Facebook/Messenger por cabeçalho, cores, avatares e ícones a partir dos prints, sem simular envio real. Para all/next usar texto de escopo em vez de pedir seleção. Avatar ilustrativo de participante como asset local genérico, sem foto de pessoa real inventada/externa. Variação acompanha foco no campo; retirar seletor e repetição da explicação de sorteio da área de prévia.
- Rotas canônicas em inglês: `/automations`, `/automations/[id]` para V2 (sem compartilhada), `/automations/instagram/[id]` para legado Instagram, `/automations/new`, `/automations/instagram/new`, `/automations/reposts/...`, `/automations/logs`. As URLs portuguesas redirecionam preservando query, especialmente view/tab. Atualizar links do painel sem trocar caminhos das APIs. Menus continuam reconhecendo links antigos durante transição.

## Limites funcionais esclarecidos

Entrega direta atual não cria uma conversa por clique: botão web_url só abre site. Continuação requer evento apropriado e janela de mensagens aplicável; não equivale a permissão para mensagens ilimitadas. O gate Instagram já tem postback específico; generalizar uma conversa em etapas no Facebook exige outro incremento de motor/webhook/snapshot, não será apresentado como opção funcional inexistente nesta revisão. Referência oficial consultada: coleção Messenger da Meta no Postman (Send API e quick replies).

## Verificação

Plano revisado antes de produção. TDD para tooltip em portal/acessibilidade, refresh com sucesso/falha, fuso e setas, conta/avatar/estado, pendências fora do header, galeria e IDs, escopo da prévia, tabs externas e variáveis no cursor. Backend: limites/alternativas, singular/plural, paths de grafo, escolha no snapshot e dedupe, gate, round-trip REST/MCP e schemas, sem perda de campo omitido. Rotas: query preservada, links canônicos e compatibilidade sem loop. Suítes UI e backend relevantes, tsc/builds e validação no navegador nas três redes sem Salvar/ativar/pausar. Revisões de código, segurança, documentação e aceitação; docs e changelog pt-BR atualizados.


## Decisões após revisão de plano

V1 usará ramo `patched('private-message-variants-v1')` somente quando houver lista privada, preservando o caminho que ignorava `messages` nos replays anteriores. A alternativa nova será escolhida por função pura estável de `executionId + nodeId` (sem crypto/I/O nem novo consumo do gerador de respostas públicas); a configuração do grafo já é o resultado gravado da activity. Gate resolve antes de snapshotFinalDm; continuação não escolhe novamente. Testar patched false/true e snapshot do gate. V2 conserva chooser da ingestão e valida o maior comprimento por nó/caminho. Rotas antigas V1 e V2 terão mapeamento explícito conforme as famílias descritas, preservando parâmetros repetidos, sem alterar endpoints de API.

## Resultado e evidências

Implementação concluída nas três superfícies (rápido, construtor e histórico), com rotas canônicas e compatibilidade dos links antigos. Revisões de plano, código, segurança, documentação e aceitação concluídas; os ajustes finais de Story sem thumbnail e refresh do drawer foram incluídos.

- Interface: 317 testes Vitest em 42 arquivos, incluindo RED inicial para ajuda, refresh, pendências, conta/galeria, variáveis/alternativas, escopos e URLs.
- Backend/API/MCP: 147 testes Jest em oito suítes; workflow V1: quatro testes adicionais de patch anterior/novo, estabilidade, gate e limite após interpolação.
- Tipagem frontend, builds Nest isolados de backend/orchestrator e build de produção Next aprovados. `git diff --check` sem erros; chaves novas em pt/en.
- Navegador: redirecionamento português→inglês, atualização manual com progresso e conclusão, ajuda do fuso no cabeçalho, tooltip no drawer modal e Escape sem fechar o drawer, indicadores/avatares, preview e alternativas do Messenger. Nenhuma automação de teste foi salva ou ativada nesta conferência.
- REST/MCP locais anunciam `dmMessages`; após atualizar o runtime, a regra real `3c65ded3-741a-436a-8d42-f8641e0506d1` conserva nome, definição, canais, status ACTIVE e revisão 3. Nenhum comentário antigo reprocessado, envio real solicitado ou anúncio alterado nesta rodada.

Backup privado das fontes e dos runtimes mantido fora do Git. Na atualização local, o worker ainda tinha registro de dependências anterior ao histórico unificado: a cópia parcial foi revertida e os builds Nest completos/coerentes dos dois processos foram aplicados com o contêiner parado. O ambiente voltou saudável; não houve migração de schema ou alteração de regra. Evitar sobrepor módulos de compilações diferentes mesmo quando os imports relativos resolvem.
