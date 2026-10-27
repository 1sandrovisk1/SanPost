# Gerenciamento de posts e agendamentos para agentes

## Escopo aprovado

Completar consulta, detalhe, edição, reagendamento, cancelamento para rascunho, retomada/publicação explícita e exclusão local de posts/agendamentos por REST e MCP. Inclui mensagens/comentários encadeados, mídia/alt/thumbnail, configurações específicas do provider, tags e recorrência já suportada. Preservar ID interno, integração/perfil, grupo e vínculos de automação. Não alterar views, credenciais, schema nem dados reais para testar.

## Contrato proposto

- Fachada adicional `/public/v1/post-management`: GET capabilities/options, GET lista/detalhe, PUT patch e POST ação por ID. Endpoints `/posts` legados continuam disponíveis.
- MCP: listPostsTool, getPostTool, updatePostTool, managePostScheduleTool e getPostOptionsTool. Criação continua integrationSchedulePostTool, com descoberta de provider existente integrationSchema.
- Escopo autenticado org/perfil; organização sem perfil resolve somente Default. Chave de perfil não escolhe outro perfil. Ferramentas nunca recebem identidade em input.
- Detalhe projeta somente campos editáveis/resultados, sem Integration inteira nem tokens. Snapshot `version` calcula hash da cadeia e tags; alterações exigem `expectedVersion` obtido no detalhe.
- Patch parcial de date, messages (lista completa quando informada; IDs existentes preservados), settings (pares key/value JSON e merge), removeSettingKeys, tags, intervalInDays, shortLink. Outros campos omitidos permanecem. Provider é validado com mapTypeToPost e regras existentes, sem instalar dependências.
- Estado é ação explícita: schedule, cancel (DRAFT), publish_now, delete e sync. Publicados não são reenviados sem republish explícito; edição publicada é apenas local e exige intenção local explícita, não promete editar a rede remota.
- Repositório próprio usa transação, lock de Post e verificação do snapshot; só escreve a cadeia daquele destino, sem recriar a raiz/grupo ou remover outros canais. Tags precisam pertencer ao perfil. Exclusão é local/soft delete, não apaga a publicação na Meta nem a automação vinculada.
- Sincronização Temporal é aguardada em modo estrito, preservando o comportamento dos consumidores antigos. Falha após gravação retorna saved=true e o ID, para retomar por sync sem duplicar o post. Bloquear edição de QUEUE muito próximo/em processamento em vez de prometer cancelar envio já iniciado.

## Ajustes após revisão do plano

- Recorrência publicada não reinicia em edição local. Patch local em PUBLISHED não chama Temporal; alteração de intervalo nessa situação exige reagendamento explícito. cancel de recorrência publicada remove a repetição e termina os workflows, conservando PUBLISHED e releaseId/releaseURL. Sync só aceita QUEUE/DRAFT, nunca PUBLISHED. schedule/publish_now em publicado exigem `republish=true` explícito.
- Uma trava consultiva PostgreSQL por post serializa as operações gerenciadas até finalizar o RPC Temporal. A gravação usa transação separada/commit antes do RPC; RPC tem deadline de 10s, trava com janela maior. Assim uma sincronização antiga não passa por uma gravação gerenciada posterior. Erros de comunicação após salvar são retornados como resultado parcial, não sucesso fictício. Não garante desfazer publicação iniciada pelo provedor.
- Guarda de 60s é margem defensiva da fila, não detecção absoluta de processamento. O contrato informa que publicação já iniciada não é reversível. Publicação recorrente é cancelada explicitamente, não por sync de metadados.
- `shortLink=true` é transformação do conteúdo fornecido; não é estado recuperável. false não desfaz URLs já convertidas. Não encurtar mensagens omitidas.
- Criação MCP será revisada para expor também campos comuns que faltam (tags, intervalo, mídia com alt/thumbnail, delay de comentários), mantendo o payload anterior compatível. Não expor marketplace/pedidos de compra como se fossem opção de agendamento.

## Implementação e revisão

- Contratos REST, MCP e Swagger usam os mesmos schemas estritos. A criação conserva payload legado e expõe tags por ID/perfil, intervalo, metadados de mídia e delay em minutos; settings são convertidos do JSON antes da validação nativa do provider. Limites de texto também são conferidos na edição.
- `sync` só recupera QUEUE futuro/DRAFT. Resultado incerto próximo/depois do horário requer inspeção; `retry_publish` exige `republish=true` explícito. `stop` persiste DRAFT e desliga recorrência antes do RPC, para o recuperador de posts faltantes não reiniciar QUEUE; registros publicados e excluídos conservam seus resultados/estado de exclusão.
- A validade da trava inclui a espera para adquiri-la. Confirmação da transação precede o RPC, com erro parcial controlado quando a sincronização falha. A criação em lote informa tanto IDs confirmados como IDs incertos após falha de armazenamento.
- Revisão de segurança não encontrou vulnerabilidade concreta nas superfícies de escopo, SQL, mídia, segredos e ações. Revisões funcionais levaram aos ajustes de recorrência, recuperação, prazo da trava e resultado parcial acima.
- Referência final de uso: [Posts para agentes](../api/posts-agent-api.md), com vínculos à documentação de automações e agendamentos. Nenhuma alteração de views, credenciais ou schema foi necessária nesta etapa.

## TDD e validação

Specs de DTO/schema, serviço, queries/transação/concorrência em PostgreSQL isolado, HTTP/Swagger, ferramentas/contexto/registro. Provar IDs/vínculos preservados, outro perfil negado, ausência de segredos, patch parcial, conflito, isolamento de canal, publicação já realizada não reenviada, falha Temporal e sync. Regressões de posts e automações. Build e catálogo local, sem criar/agendar/excluir/publicar posts reais. Todas as operações reais permanecem fora desta rodada; qualquer prova Meta futura somente Escorpiano.

## Resultado em 27/10/2026

- 113 testes de regressão passaram em 21 suítes (uma suíte PostgreSQL depende de banco isolado e foi executada separadamente). Após o ajuste final da parada, os 20 testes de serviço/HTTP/MCP afetados passaram novamente.
- PostgreSQL temporário: 32 testes passaram em três suítes, incluindo concorrência, isolamento, cadeia de comentários, preservação de targets, exclusão recuperável e retirada de QUEUE da consulta real de recuperação. Banco temporário removido ao terminar.
- Backend e worker compilaram por `pnpm dev:local`; contêiner saudável, com a mesma imagem anterior, sem rebuild Docker. `git diff --check` passou.
- Validação local somente leitura no Escorpiano: capabilities/lista HTTP 200; sete campos de configuração e sete ações presentes. Catálogo MCP com 27 ferramentas, incluindo as cinco novas, todos os inputs do tipo object e os campos de criação tags/intervalInDays/media/delay disponíveis.
- Revisão funcional final sem blocker restante. Nenhuma publicação, mensagem ou alteração de agendamento real usada para validar esta entrega. Manutenção opcional dos mapas CLAUDE foi apenas proposta pelo revisor, sem editar instruções do repositório.
