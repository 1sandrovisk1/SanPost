# Portes sociais adicionais — 30/10/2026

Escopo autorizado: áudio em Reels do Instagram, fundos de texto do Facebook e Tumblr. Base `4689264e`, preservando o novo compositor e os portes de IA/MCP. Login com Apple excluído. Sem deploy ou publicação real neste trabalho.

## Contratos antes da implementação

- Instagram: `InstagramDto.audio` opcional (`id`, metadados e volumes 0–100). Busca `audioSearch` pela rota autenticada existente `/integrations/function`, token e internalId do canal. Disponível somente para Instagram com Facebook Login: um único vídeo Reel, sem stories/carrossel/Instagram Login/Zernio. Busca vazia traz tendências; escolha persistida e enviada como `audio_configuration` na criação. Host/versão pelas constantes Meta; nenhuma chave/token exposto ao navegador.
- Facebook: `FacebookDto.text_format_preset_id` opcional, catálogo compartilhado. Aplica apenas a texto puro de até 130 caracteres, sem mídia, link ou story. UI e preview seguem a mesma regra. Presets são comunitários e podem deixar de funcionar; fallback sem fundo somente diante de recusa explícita do parâmetro. Falha de rede ou resposta ambígua não dispara segunda publicação automática.
- Tumblr: provider nativo OAuth2 com credenciais por workspace/perfil (`ClientInformation` em autenticação/refresh, env apenas no caminho legado). Descoberta de blogs e seleção server-side, reconexão do mesmo blog, editor de texto/mídia, tags/título/link/fonte, DTO compartilhado com API/MCP. Criação em NPF e resposta com ID externo confirmado. Mídia própria/local com confinamento; remota com SSRF, limites e prazo. Sem sucesso em corpo inválido/ID vazio, sem retry de publicação de resultado incerto.
- Preservar escopo por organização/perfil, criptografia de tokens, OAuth state seguro, allowlist de métodos, Zernio, V102/V112 e confirmações do compositor. Novas strings em pt/en.

## Plano de execução e validação

1. Revisão do plano contra código atual; testes RED de DTO, payload/limitações e OAuth/erros.
2. Porte manual dos três providers/DTOs, registros, credenciais e componentes do novo compositor.
3. Testes GREEN, revisão de código/segurança, testes de interface desktop/mobile com API local de fixture.
4. Builds backend/frontend/orchestrator, changelog e aceitação final. Consolidar na branch de integração sem alterar main/release.

## Referências e limites

Base de implementação: commits Postiz `eaf866ad`, `f328583c`, `3b9a7896`, `fc07ab8d`, conferidos contra `upstream/main` local. Meta Audio API é exclusiva de Facebook Login; fundos do Facebook não têm catálogo oficial estável. Tumblr requer app OAuth e callback `/integrations/social/tumblr` no app do operador.

## Resultado e evidências

- Implementados os três portes com DTOs compartilhados, registro no catálogo/manager, credenciais, seleção de blog e componentes do novo compositor; 104 novas chaves em pt/en. Sem dependências novas, migração de banco ou mudanças em Apple, cobrança e produção.
- Revisão do plano, código e segurança concluída. O único ajuste de contrato da revisão final — thread do Tumblr omitindo blocos no V112 — foi corrigido em RED/GREEN no serviço antes das escritas e no compositor. Provider real obtido no servidor; não se confia no `__type` do cliente. Sem HIGH/MEDIUM confirmado na revisão de segurança.
- **345 testes backend em 28 suítes**: DTOs, manager/allowlist, OAuth, User Token do áudio, payloads Instagram/Facebook, elegibilidade/fallback, criação de posts em lote, NPF, IDs longos, upload multipart, confinamento/symlink, SSRF, limites individuais/agregados, ausência de replay e entropia OAuth. Executados pelo Jest com transformação isolada; checagem de tipos separada pelo compilador/build.
- **6 testes Vitest**: seleção/persistência e volume zero, tendências, erro de busca, remoção de áudio incompatível e restrição de thread/mídia do Tumblr.
- Browser com componentes reais e API de fixture local em **1280 e 390 px**: busca/seleção de áudio, volume zero, remoção após mudar conexão, erro de busca visível; fundo atualizando no preview, limite de 130 caracteres e link desabilitando fundo, limpeza de escolha; campos Tumblr e seleção do blog. Sem overflow horizontal ou exceção JavaScript nos dois tamanhos. Conferidos requests e screenshot mobile. Rota/servidores temporários removidos após a validação; nenhuma credencial ou publicação real usada.
- Typechecks frontend/backend e os três builds de produção (backend, frontend e orchestrator) aprovados. A aceitação final confirmou também `mapTypeToPost` (edição/ações API-MCP) e `changeDate` (calendário) antes de persistir ou enfileirar threads Tumblr. Workflows V102/V112 preservados.
- Lint não validado: não há script `lint` no package.json da raiz; `pnpm lint` resolve um binário global externo. A tentativa direta de ESLint 8.57 falha ao carregar a configuração existente com `Converting circular structure to JSON` no plugin React, antes de analisar arquivos. Sem alteração dessa configuração fora do escopo.
- Ambiente local Node 22.22.3 abaixo do mínimo declarado 22.23.4; o aviso foi registrado, sem mudar versões do projeto.

Comandos principais:

```sh
pnpm exec jest --selectProjects nestjs-libraries --runInBand --globals '{"ts-jest":{"isolatedModules":true}}' --testPathPattern='database/prisma/posts/.*service.*spec|social.extras.spec|integration.manager.spec|instagram.audio.spec|facebook.background.spec|tumblr.provider.spec|tumblr.media.spec|mutation.once.spec|instagram.provider.spec|facebook.provider.spec|oauth.state.entropy.spec'
pnpm exec vitest run --config tools/vitest.social-extras.config.mts
pnpm build:backend
pnpm build:frontend
pnpm build:orchestrator
```

Operação e limites: [guia dos três recursos](../operations/instagram-audio-facebook-fundos-tumblr.md). Validação externa ainda depende do app Tumblr do operador e de canais Meta autorizados; não foi feita publicação real neste trabalho.

O doc-maintainer propôs, sem aplicar, atualizar o mapa de providers/credenciais no `social/CLAUDE.md` e corrigir a orientação antiga de logar `ClientInformation`. Essas propostas de instruções aguardam aprovação específica e não afetam o porte implementado.
