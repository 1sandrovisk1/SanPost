# Integração Postiz e novo compositor — 30/10/2026

Escopo autorizado: consolidar os portes concluídos, enviar texto alternativo ao Instagram, corrigir calendário/Discord, persistir fuso horário por usuário e adotar o novo compositor responsivo. Mastra/CopilotKit/MCP formam o último lote, após validar os demais.

Base: `origin/main` em `43f70fdc`; upstream em `35a48290`. Trabalho no checkout `upstream-composer-integration`, sem deploy nem acesso ao banco existente.

## Contratos preservados

- Credenciais e autorização por organização/perfil; automações e rascunhos existentes.
- V112 padrão, migração automática e referência de aceite Zernio antes do polling.
- Salvamento por canal/lote, confirmação explícita de republicação, datas próprias e falha parcial do fork.
- Captura de mídia e miniatura persistida; validação real do vídeo do usuário fica para depois.
- Datas persistidas em UTC. Fuso IANA opcional no usuário, mantendo o offset numérico legado.

## API de fuso

`POST /user/timezone` recebe `{timezoneName: string | null}`. Nome IANA é validado; null retorna ao fuso do navegador. Atualiza somente o usuário autenticado e responde `{timezoneName}`. `/user/self` inclui a preferência. Não altera agendamentos existentes nem os horários UTC dos canais.

## Validação

Testes integrados dos seis branches; testes de alt text e erros; replay V112/longos; transições DST e conversões de datas; compositor desktop/mobile com múltiplos canais, mídia, rascunho, configuração, confirmação de fechamento e republicação. Migrações somente aditivas, com schema validado em banco temporário antes de qualquer entrega.

## Estado

Os seis branches concluídos foram integrados preservando o V112 padrão e a migração automática. Instagram, Discord, DnD, fuso persistido e novo compositor implementados. Mastra/CopilotKit/MCP permanecem como último lote.

Validação já executada: 80 testes orchestrator (replay incluído), 188 testes integrados de bibliotecas/backend e 109 Farcaster após instalar os tipos do QR, 44 Instagram/Discord, 23 serviço/DTO/repositório de fuso, 9 conversões/DST, 26 compositor/inline e 17 regressões de mídia. Alguns testes se repetem entre comandos; não somar como cobertura única.

Browser local com componentes reais e API de fixture: desktop 1440×1000 e mobile 390×844, rascunho em um/dois canais, tag, edição/preview, configurações e confirmação de republicação. Lote existente envia `update` somente ao publicado e `schedule` ao irmão, com datas e IDs originais; nenhum POST antes da escolha. 12h São Paulo envia 15h UTC. Nenhuma publicação real.

Banco PostgreSQL 17 temporário: schema aplicado e preferência relida, inclusive null, preservando o offset legado. Diff de schema contém somente acréscimos. Container isolado, sem acesso aos bancos existentes.

Revisões: correções do sanitizer cliente e de canais V112 indisponíveis aplicadas; revisão de segurança não confirmou novo CRITICAL/HIGH. Seletor nativo e calendário receberam regressões específicas para fuso do navegador diferente do usuário. Resultado final das suítes e builds será registrado no relatório de entrega.

Regressões adicionais: 14 testes Vitest de UI/calendário, incluindo callbacks nativos em São Paulo/Nova York/Tóquio e slots UTC cruzando meia-noite/hora repetida. Prisma validate requer DATABASE_URL mesmo sem consultar o banco; executado com a URL do banco temporário.

## Fechamento do primeiro bloco

- Builds de frontend, backend e orchestrator: exit 0.
- UI/calendário: 15 testes, incluindo ausência de slot no dia local de 23 horas (linha omitida, sem agendar no dia anterior).
- Banco temporário encerrado e removido; rota/servidores de QA removidos/parados. Screenshots locais: `/tmp/multipost-composer-desktop-final.png` e `/tmp/multipost-composer-mobile-final.png`.
- Typecheck amplo de backend mantém três diagnósticos anteriores em `wallet.provider.ts` e nas duas classes legadas `agent.graph*`; as tipagens do QR foram instaladas e os 109 testes Farcaster passaram.
- Runtime local Node 22.22.3 abaixo do mínimo declarado 22.23.4; lint continua com a configuração circular pré-existente. Nenhum deploy ou merge na main.
- Propostas de instruções não aplicadas: mapa do compositor/mobile e helpers, contrato de fuso, filas de e-mail e reserva atômica Farcaster.
