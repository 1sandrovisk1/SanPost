# Isolamento do perfil na criação de automações

## Problema confirmado

No caminho legado Instagram, `createFlow`, `createDraftFlow` e `quickCreateFlow` validavam a integração com o perfil recebido antes de resolver o perfil de armazenamento. Uma chave de organização sem perfil explícito passava pela guarda sem comparação de perfil; depois a automação era salva no Default, mesmo com conta pertencente a outro perfil.

## Contrato da correção

- Resolver primeiro o perfil efetivo: perfil autenticado/explicitamente solicitado e validado na organização; quando omitido, Default da organização.
- Validar o acesso à conta usando exatamente esse perfil antes de preflight Meta, inscrição de webhook, montagem de alvo ou gravação. Conta de outro perfil deve falhar, sem criar rascunho parcial.
- Não inferir o perfil de destino pela conta nem transferir automações existentes. Preservar nesta correção o tratamento documentado de integrações legadas sem perfil (`profileId=null`), sem transformá-las em contas de outro perfil.
- Edição rápida e ativação também conferem a conta contra o perfil armazenado no flow. Para um flow legado sem perfil, resolver o perfil do chamador/Default. Pausar e arquivar continuam possíveis para desligar regras antigas desalinhadas, sem migrar ou reativar registros automaticamente.
- API nova e MCP já passam pelo escopo resolvido da fachada; verificar também essas superfícies e Facebook/Messenger com regressões.
- Não alterar publicação/agendamento de posts, credenciais, schema, rotas ou views. A criação de post continua distinta da criação de automação; sucesso da primeira não autoriza salvar a segunda em perfil incompatível.

## Validação

TDD com conta de outro perfil + chave de organização sem perfil nos três caminhos de criação; Default e perfil explícito corretos aceitos, perfil explícito incompatível recusado, sem efeitos Meta ou gravação no erro. Regressões de serviços, API e MCP; compilar e atualizar ambiente local com a imagem existente. Verificação de runtime somente leitura, sem criar/ativar automações reais.

## Resultado

- RED funcional reproduziu cinco falhas: criação indevida nos três caminhos, edição e ativação de regra desalinhada. A matriz final cobre também perfil explícito correto, Default correto, legado sem perfil e pausa/arquivamento.
- Rodada direcionada: 171 testes passaram em seis suítes de serviço, API e MCP. Regressão ampliada: 681 testes passaram em 37 suítes; 23 casos de ambiente/banco foram pulados. As contagens se sobrepõem e não devem ser somadas.
- Revisões de código e segurança não encontraram blocker adicional. Doc-maintainer propôs somente manutenção opcional de instruções; nenhum CLAUDE/AGENTS foi alterado.
- Backend e worker compilaram e foram atualizados por `pnpm dev:local`; contêiner saudável com a mesma imagem Docker anterior. `git diff --check` passou.
- Consulta local somente leitura encontrou seis flows V1 e nenhum com perfil divergente da conta. Descoberta REST de canais com chave de organização sem perfil e com perfil Escorpiano explícito retornou 200, sem sobreposição entre contas dos dois perfis. Catálogo MCP retornou 200 e a ferramenta de criação explica a negativa de contas fora do Default.
- Nenhuma automação real foi criada, ativada, transferida ou apagada; nenhum webhook Meta ou envio real foi executado para validar a correção.
