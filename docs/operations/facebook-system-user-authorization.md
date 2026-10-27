# Comentários do Facebook com usuário de sistema

## Escolher a autorização

O login do Facebook continua sendo a opção padrão. O usuário de sistema é uma
alternativa para quem administra os ativos pelo portfólio empresarial da Meta.
Ambas as opções alimentam a mesma conexão de automação da Página. A troca não
recria canais, posts, fluxos, execuções nem o histórico de mensagens.

### Roteiro para a aula: duas autorizações, o mesmo webhook

| Etapa | Facebook Login | Usuário de sistema |
|---|---|---|
| Aplicativo | App ID e App Secret nas credenciais Facebook | O mesmo cadastro; o token deve ser gerado selecionando esse App ID |
| Autorização | Cadastrar a URL de retorno OAuth na Meta e autorizar a Página pelo login | Atribuir aplicativo/Página e permissões ao usuário de sistema; salvar o token na aba própria e aplicá-lo à Página |
| Receber comentários | Configurar webhook na aba Messenger e assinar `feed` na Meta | A mesma configuração de webhook é necessária |
| Ativar | Verificar/ativar cada Página escolhida | Verificar/ativar cada Página escolhida |
| Responder | Criar automação e escolher posts/resposta | O mesmo criador e as mesmas automações |

A URL de retorno OAuth conclui o login; a URL de callback do webhook recebe
eventos. Uma não substitui a outra. O webhook é configurado uma vez por aplicativo
e compartilhado entre suas Páginas; salvar um token não ativa todas as Páginas.
Essas alternativas autorizam comentários em uma Página já conectada ao MultiPost;
não representam importação automática dos ativos do usuário de sistema.

As ajudas do Facebook (inclusive sem detalhes de Página e durante edição) e do
Instagram mencionam a alternativa. **No Instagram, não ensinar equivalência
universal:** o usuário de sistema é selecionado pelo serviço de mensagens em
funções compatíveis de stories/consulta de seguidores, mas não é selecionado
diretamente pelo resolvedor de tokens dos comentários do feed. A ajuda orienta
manter a conexão/token individual e o webhook, e oferece atalho à aba Usuário de
sistema. Esse atalho apenas navega; não salva nem autoriza ativos.

## Preparar e aplicar pelo painel

1. Nas configurações do portfólio empresarial da Meta, atribua o aplicativo e a
   Página desejada ao usuário de sistema. Gere o token para o mesmo App ID que
   aparece nas credenciais Facebook do MultiPost.
2. Conceda `pages_messaging`, `pages_manage_metadata`, `pages_read_engagement` e
   `pages_read_user_content` e `pages_manage_engagement`. Essa alternativa exige
   também a capacidade de resposta pública para preservar automações existentes. Permissões no token não substituem a atribuição do
   ativo ao usuário de sistema.
3. No perfil correto do MultiPost, abra **Configurações → Credenciais → Meta →
   Usuário de sistema**, cole o token e use **Validar e salvar**.
4. Na aba **Facebook**, selecione a Página. Se ainda não estiver autorizada,
   clique em **Usar usuário de sistema**. Para trocar uma autorização existente,
   abra **Ajuda → Diagnóstico** e use a mesma opção.
5. O MultiPost valida tipo, aplicativo, validade, permissões e identidade da
   Página. Deriva e valida o token da Página, salvando-o cifrado no mesmo registro
   de automação. Não consulta nem conecta todas as Páginas disponíveis no token.
6. Se houver pendência de webhook, siga a ajuda da aba **Messenger**. O webhook
   é compartilhado por aplicativo. Depois use **Verificar e ativar recebimento**
   na Página selecionada; essa ativação é separada da troca de autorização.
7. Crie ou mantenha a automação no mesmo canal. Faça um comentário novo com outra
   conta e confira o histórico de execução e a mensagem recebida.

## Validade e renovação

O diagnóstico distingue a origem da autorização, os prazos do token de sistema
registrados na aplicação e os prazos do token da Página verificados na Meta.
`expires_at = 0` significa sem vencimento programado, não acesso garantido para
sempre. Remover ativos, revogar permissões ou invalidar o token pode interromper
operações. Prazo não informado não é tratado como zero.

Ao trocar o token na aba Usuário de sistema, reaplique-o em **Facebook → Ajuda →
Diagnóstico → Reaplicar usuário de sistema**, em cada Página desejada.
Não há renovação automática nem tentativa silenciosa de usar outro perfil.
É possível voltar ao login do Facebook por **Autorizar pelo Facebook Login**. As
integrações e automações existentes são preservadas.

Remover o token da aba Usuário de sistema impede novas derivações, mas não revoga
automaticamente um token da Página já derivado. Revogação efetiva deve ser feita
na Meta quando necessária. O cadastro pode continuar atendendo outras funções
compatíveis do Instagram e publicação; esta implementação não muda essas rotas.

## Isolamento e falhas

- Credencial de sistema somente do perfil exato, sem herança Default ou ambiente.
- Escopo esperado enviado pelo navegador e comparado ao contexto autenticado.
- Troca de Página, aplicativo ou token durante a validação aborta a gravação.
- Transação curta com bloqueio das linhas da credencial fonte, perfil e Página,
  seguida de comparação atômica da conexão anterior, impede salvar uma revisão
  ultrapassada ou sobrescrever uma autorização concorrente. Falhas de validação mantêm a autorização anterior.
- Falha do cache após gravar a autorização exige verificar novamente; não implica
  desfazer a autorização já salva. O status é vinculado à credencial/origem.
- A API não retorna tokens de acesso, respostas brutas da Meta nem revisão cifrada.
- Se o token tiver sido gerado para outro aplicativo, o painel orienta gerar um
  novo token para o App ID configurado na aba Facebook. A Meta pode recusar o
  próprio `debug_token` antes de retornar os dados; somente a combinação conhecida
  desse endpoint, HTTP 400, código 100 e mensagem exata de aplicativo divergente
  recebe `SYSTEM_USER_APP_MISMATCH` (HTTP 412). Outros erros 100 continuam genéricos.
  Não troque as credenciais do aplicativo existente para acomodar esse token.

## Registro de validação

Testes automatizados cobrem validação, isolamento, concorrência, preservação da
conexão, escopo HTTP e interface. A autorização e a prova real de **novo comentário
→ resposta privada com usuário de sistema** foram confirmadas em 25/10/2026
somente no Escorpiano, incluindo o recebimento da mensagem com link pelo usuário.
Essa prova é independente da validação anterior com login do Facebook.

Testes reais autorizados somente na Página Escorpião Veneno `271852286004401`,
integração `cmvi6us6q0005pm090b98kalb`. Nenhuma outra Página deve ser autorizada
para a prova. Não registrar tokens nos documentos, terminal ou chat.

### Entrega local — 25/10/2026

- Regressão Facebook/Instagram: 548 testes aprovados, 35 suítes; cinco testes da
  suíte já ignorada continuam ignorados.
- Interface Meta/criador: 90 testes aprovados, 14 suítes.
- Escopo HTTP das credenciais: seis testes aprovados. Total: **644 testes**.
- TypeScript do frontend sem emissão e builds backend/orchestrator aprovados.
- Revisões de código, segurança e documentação concluídas. Cobertura inclui
  falta de `pages_manage_engagement` na origem e no Page token, e corrida entre
  validação e gravação das credenciais/Página.
- Docker atualizado somente no serviço `app`, sem migração ou alteração dos
  volumes. Imagem `multipost-facebook-local:system-user-20261025`, alias `:source`,
  digest `sha256:4711b816824a17d24d72016acd69d772c2854e458b81b4045daabb9e4683cda5`.
  Node 22.23.4; app healthy, sem reinicializações; workers main/Facebook/Instagram
  saudáveis. Testes/builds do host usaram Node 22.22.3 com aviso de engine; o Node
  global não foi alterado.
- Navegador: perfil Escorpiano, Página Escorpião Veneno com recebimento configurado
  e origem **login do Facebook** preservada. Drawer exibe orientação e atalho
  funcional para Usuário de sistema. Campo ainda vazio; nenhuma autorização nova,
  inscrição ou mensagem real foi executada. Console sem erros nessa conferência.
- Capturas locais em `output/facebook-system-user/ajuda-facebook.png` e
  `output/facebook-system-user/diagnostico-facebook.png`.

### Primeira tentativa com token cadastrado — 25/10/2026

O usuário cadastrou o token pelo painel. A ação **Usar usuário de sistema**,
somente no Escorpiano, foi recusada pela Meta na primeira consulta `debug_token`:
HTTP 400/código 100, com indicação explícita de aplicativo divergente. O aplicativo
esperado é `841571281566716`. Nenhum token de Página foi derivado, assinatura
alterada ou mensagem enviada. A autorização anterior por login foi preservada.

A correção do diagnóstico converte esse caso específico no aviso já traduzido
para gerar o token no aplicativo correto, sem retornar o corpo bruto da Meta.
O token não deve ser colado no chat nem incluído no registro da prova.

Validação da correção: RED com duas falhas esperadas; 57 testes focados e
regressão de 561 testes aprovados (35 suítes, cinco testes previamente ignorados).
Builds backend/orchestrator e revisões de código/segurança/documentação aprovados.
Imagem local `multipost-facebook-local:system-user-diagnostic-20261025` aplicada
somente ao serviço `app`. Repetição controlada pelo painel confirmou o aviso
acionável e a origem anterior **login do Facebook**; comparação do registro
cifrado antes/depois confirmou que a autorização permaneceu idêntica. Captura:
`output/facebook-system-user/app-divergente.png`.

### Segunda tentativa após novo cadastro — 25/10/2026

O usuário confirmou a atribuição do aplicativo como ativo e o cadastro de outro
token no perfil Escorpiano. A ação pelo painel voltou a ser recusada por aplicativo
divergente, antes de qualquer gravação de autorização. Uma introspecção somente
leitura do próprio token salvo confirmou `type = SYSTEM_USER`, `is_valid = true`,
as cinco permissões necessárias, `expires_at = 0` e `data_access_expires_at = 0`,
mas **App ID `349758807523615`**. O aplicativo configurado no Facebook do perfil
continua sendo **`841571281566716`**.

Não basta atribuir o aplicativo nos ativos do usuário de sistema: é necessário
selecioná-lo também ao gerar o token. A comparação com o snapshot anterior à
tentativa confirmou preservação da autorização, integração/token de publicação,
canal, definição do fluxo e execução existente. Nenhuma outra Página foi
consultada para essa prova e nenhuma mensagem foi enviada.

### Autorização confirmada pelo painel — 25/10/2026

Após o usuário cadastrar o token de outro usuário de sistema, a ação **Facebook →
Escorpião Veneno → Ajuda → Diagnóstico → Usar usuário de sistema** foi aceita.
Às 19:15:27 (America/Sao_Paulo), o painel confirmou **Recebimento configurado** e
**Autorização: usuário de sistema**, no aplicativo `841571281566716` e Página
`271852286004401`. A validação do token de sistema foi registrada às 19:15:26,
sem vencimento programado informado pela Meta. Isso não impede revogação futura
de token, permissões ou ativos.

Comparação com o snapshot imediatamente anterior confirmou:

- O registro de autorização manteve seu ID e recebeu a nova credencial cifrada.
- Integração e token de publicação, canal, definição/revisão do fluxo e execução
  anterior permaneceram idênticos.
- A automação **Teste Facebook — Escorpiano** continua ativa, revisão 2, com
  gatilho de qualquer comentário no post de teste e a resposta privada aprovada.
- Não foi necessário recriar fluxo, renovar webhook ou executar inscrição.
- Console do navegador sem erros; captura em
  `output/facebook-system-user/autorizado-escorpiano.png`.

Nenhuma mensagem manual foi enviada nesta etapa. Não houve alteração de código
nem repetição dos testes já aprovados.

### Comentário e mensagem confirmados — 25/10/2026

Após a troca de autorização, o usuário fez um comentário novo no post de teste.
O webhook foi recebido às **19:17:47** e a execução terminou às **19:17:55**
(America/Sao_Paulo), com status `COMPLETED`. A entrega privada ficou `SENT`, com
ID de mensagem retornado pela Meta. Há **uma única entrega** para essa execução.
O usuário confirmou no chat o recebimento da mensagem com o link no Messenger.

Referências para auditoria, sem credenciais:

- Página: `271852286004401`; aplicativo: `841571281566716`.
- Post: `271852286004401_122321127302221279`.
- Comentário: `122321127302221279_2098991490818619`.
- Evento: `bcf909d0-1ea0-494b-b0bc-ec5d499d031d`.
- Execução: `8b7ef2b6-b95a-4c98-b355-ce0dd6893aa3`.
- Fluxo preservado: `c653c56a-3426-41d2-8ce5-29b3cb86df47`, revisão 2.

A conexão da Página está com origem `SYSTEM_USER` desde 19:15:26. O caminho de
envio Facebook lê essa conexão autorizada novamente antes de chamar a Meta,
sem fallback para o token de publicação. A comparação com o snapshot anterior
confirmou integração/token de publicação, canal, definição do fluxo e execução
antiga preservados; houve somente **uma execução nova**. Nenhuma outra Página ou
conta Instagram participou da prova real.

Resultado: homologado o fluxo de comentários com autorização por usuário de
sistema no Escorpiano. Não é prova de operação indefinida: revogação de token,
permissões ou ativos ainda pode interromper o acesso. Para trocar o token no
futuro, manter a mesma Página e reaplicar a autorização, sem recriar automações.

Para retornar apenas o runtime anterior: retaggear
`multipost-facebook-local:security-sync-20261025` como `:source` e recriar somente
`app` com os quatro overlays locais e `--no-deps --no-build`. Não restaurar banco
nem apagar volumes. Backup do código anterior a esta etapa em
`.secrets/last-facebook-system-user-backup.txt` (não versionar).
