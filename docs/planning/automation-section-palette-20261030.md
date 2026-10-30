# Paleta das etapas de automação

## Escopo

Usar cores distintas por responsabilidade: gatilho/conta ardósia #64748B, origem azul #2563EB, condições âmbar #D97706, resposta pública esmeralda #059669, DM violeta #7C3AED e seguidores ciano #0891B2. Fundos claros: #F8FAFC, #EFF6FF, #FFFBEB, #ECFDF5, #F5F3FF e #ECFEFF, respectivamente. Extras e espera conservam suas identidades teal/laranja, sem inventar etapas ou nós novos.

Centralizar tokens CSS e classes de aplicação para editor rápido, nós React Flow compartilhados V1/V2 e indicadores/paleta/minimapa V1. O gatilho reúne conta/origem no canvas existente: usa ardósia; o pedido para seguir embutido no gatilho usa badge ciano. Preservar as cores semânticas das saídas corresponde/não corresponde e a ação de excluir conexão.

Manter fundo da etapa expandida/recolhida, borda esquerda de 4px, bordas restantes suaves, títulos neutros, ícones e numeração. Corpo expandido usa superfície interna do tema (branca no claro). Nó selecionado realça a própria cor, sem vermelho de marca. Tema escuro mantém as identidades com fundos escuros e texto auxiliar de contraste adequado. Sem alterar dados, eventos, APIs, ativação ou persistência.

## Verificação

Backup privado das views antes da alteração. Reutilizar os testes existentes de etapas e canvas para conferir que recolhimento e edição mantêm seu comportamento; conferir cores e seleção diretamente no navegador. Não adicionar testes que apenas espelhem os valores CSS. Validar tipos, build frontend e navegador local claro/escuro, editor e construtor sem salvar regras. Atualizar guia operacional e CHANGELOG em pt-BR. Revisão de plano/código/documentação conforme CLAUDE; não modificar CLAUDE/AGENTS. Não promover a release ou criar imagem nesta rodada.

## Resultado

Paleta aplicada aos grupos e nós compartilhados V1/V2, paleta/minimapa V1 e badge de seguidores. Seleção usa a própria cor; foco usa box-shadow, pois o CSS global remove outlines. Campos continuam montados ao recolher. Sem alteração de dados/API.

338 testes em 46 arquivos, tipagem frontend e build de produção aprovados. Contraste calculado entre texto auxiliar e fundo: mínimo 5,15:1 no claro e 8,31:1 no escuro. Isso verifica os tokens, mas não substitui inspeção de pixels no navegador.

A conferência visual não foi concluída: a extensão Chrome não estava disponível na sessão CUA, a captura da aplicação nativa teve timeout e o navegador interno também expirou ao navegar e vincular a aba de teste. Não foram alteradas permissões, sessões de autenticação, regras ou anúncios. Backup privado das views preservado.
