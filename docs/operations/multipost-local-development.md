# Desenvolvimento local sem reconstruir imagens

Atualizado em 27/10/2026. Usa a stack recuperada, seus dados e o túnel existentes. O frontend lê os fontes do checkout; backend e worker leem JavaScript compilado localmente. As dependências nativas continuam na imagem Linux.

## Iniciar

Com Docker Desktop aberto, Node.js 22 (versão indicada em `package.json`) e PNPM instalados, na raiz deste checkout:

```bash
pnpm dev:local
```

Abra [MultiPost local](https://localmultipost.automacaosemlimites.com.br). O comando usa os overlays `local`, `tunnel`, `restored`, `meta-proof` e `dev-local`, nessa ordem. Recusa contextos Docker remotos; nesta máquina usa o socket Unix de `desktop-linux`. O túnel Cloudflare permanece no serviço do Mac, sem criar outro conector.

- **Tela, CSS e traduções:** salve o arquivo. O Next em desenvolvimento atualiza a tela; não rode build nem reinicie a cada ajuste. Se uma tradução não aparecer, recarregue a página.
- **Backend/worker/domínio:** rode `pnpm dev:local` novamente. O hash detecta alterações, para o app, compila os dois servidores e o inicia. Não substitua `dist` manualmente enquanto estiver montado no app ativo.
- **Dependências:** o comando recusa divergência do lockfile em relação à imagem; exigem atualização explícita da imagem.
- **Schema Prisma:** revise/aplique a migração explicitamente. No overlay de desenvolvimento, o start gera o cliente Prisma Linux dentro do contêiner quando o schema fonte difere do cliente. Não cria imagem, não monta `node_modules` do Mac e não aplica migração automaticamente. Não basta compilar TypeScript.
- **Primeira execução:** compila os servidores. Nas seguintes, fontes inalterados e saídas presentes dispensam compilação. Marcador em `tmp/local-dev-server.sha256`.

O comando não constrói imagens, apaga dados, limpa cache Docker nem altera o túnel. O serviço `schema` recuperado executa apenas `prisma validate`. `RUN_CRON` continua vazio. Imagens antigas não são removidas automaticamente; limpeza é uma operação separada.

Se a compilação do backend ou worker falhar, o app permanece parado para não carregar arquivos parcialmente compilados. Corrija o erro e execute `pnpm dev:local` novamente, ou siga o retorno à imagem descrito abaixo.

## Montagens e limites

Somente leitura: fontes/public/Tailwind do frontend, fontes React compartilhados, helpers/domínio e os dois diretórios `dist`. Não monta a raiz do checkout nem substitui `node_modules` Linux pelos do Mac. Configurações Next/nginx, uploads recuperados e a prova manual são preservados.

É um ambiente de desenvolvimento: a primeira compilação de uma rota ainda pode levar tempo. Não usar o overlay para distribuir produção. Frontend usa hot reload; backend/worker usam compilação e reinício controlados pelo comando.

## Contas e isolamento

A pedido do usuário, `SHARED_AUTOMATION_TEST_INTEGRATION` passou a vazio em 26/10/2026. Automações compartilhadas podem usar canais elegíveis do **perfil atual**, até uma Página Facebook e uma conta Instagram por fluxo. Filtros de organização/perfil/integração, assinatura, verificação do post e deduplicação continuam ativos. Isso não ativa rascunhos nem autoriza Páginas automaticamente.

A prova manual histórica mantém configuração própria. O bloqueio entre automações antigas de comentários do Instagram e compartilhadas na mesma conta permanece, evitando respostas duplicadas.

## Voltar à imagem

Recrie somente o app com os quatro overlays anteriores, omitindo `dev-local`. Isso volta ao código **contido na imagem**, que pode ser anterior aos ajustes atuais; confira a versão antes. Não use `down -v`, `prune` ou arquivos sem `restored` para reiniciar.

## Validação em 26/10/2026

- Frontend Meta e automações compartilhadas: 131 testes aprovados em 18 arquivos; checagem TypeScript aprovada. Após o ajuste final de escala da prévia, os seis testes do editor rápido foram repetidos e aprovados.
- Regressão das automações: 567 testes aprovados em 35 suites. Os seis testes PostgreSQL opt-in foram executados separadamente em `multipost_shared_test_20261022`, com aprovação; não usaram o banco recuperado. Dois testes adicionais do repositório de credenciais aprovaram a atualização condicional por perfil e ciphertext.
- Builds de backend e worker aprovados. App saudável, sem reinicializações, e pollers das filas `main`, `facebook` e `instagram` presentes na verificação.
- Imagem preservada: `multipost-facebook-local:source`, ID `sha256:de4e3f969a83f8b0bbb9fc5889aed501cc6cc8e48690e6d133af3cc35bbbbb00`. Uma segunda execução do comando, sem alteração de fontes, dispensou compilação e preservou o container. A alteração de frontend chegou ao Next sem nova imagem nem reinício do app.
- Navegação autenticada validou edição rápida, construtor visual e histórico do rascunho `Teste`, preservando os campos. Formulário lateral e prévia aparecem lado a lado em desktop e empilhados em viewport estreita, sem transbordamento horizontal. Capturas: `output/shared-quick-editor-20261026/desktop.png` e `narrow.png`.
- O rascunho não foi ativado e nenhuma mensagem real foi enviada nesta validação. A conta Instagram selecionada ainda mostrou pendência de autorização em Credenciais; isso é uma checagem normal da conexão, independente da restrição local removida. A causa dessa pendência não foi determinada nesta verificação visual.

Referências: [dados recuperados](multipost-local-recovered.md), [túnel e Docker](multipost-local-docker.md), [automações](facebook-shared-automations.md), [bind mounts do Docker](https://docs.docker.com/engine/storage/bind-mounts/).
