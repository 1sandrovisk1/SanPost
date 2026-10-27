# Propostas para configuração avançada do Facebook

Propostas visuais de 24/10/2026, preparadas com GPT Image (ferramenta integrada). Não implementadas. O trabalho no guia de estilo permanece pausado.

## Problema observado

A seção atual reúne o procedimento inicial do webhook, o diagnóstico de uma Página e a prova manual de mensagem. Quando os detalhes ficam abertos, ações de manutenção e teste parecem etapas obrigatórias. Datas, identificadores e instruções extensas competem com a próxima ação necessária.

## Alternativas

1. **Resumo com configuração guiada — recomendada.** No uso diário, mostrar o estado registrado e entradas curtas para webhook, diagnóstico e teste opcional. Ao configurar, abrir um painel com uma etapa por vez. A prévia mostra o painel aberto; na tela inicial ele fica fechado. Exige mais organização de estado, mas reduz a informação simultânea e diferencia rotina de configuração inicial.
2. **Passos na própria página.** Abrir apenas a etapa necessária, recolhendo as demais. Diagnóstico e teste manual aparecem fora da sequência obrigatória. É a mudança mais próxima da estrutura atual, embora ainda ocupe mais espaço na página.
3. **Abas por assunto.** Webhook, Diagnóstico e Teste manual mostram somente seu próprio conteúdo. A prévia mostra Diagnóstico. Facilita consultas recorrentes, mas adiciona um segundo nível de abas dentro das abas Meta e oferece menos orientação para a primeira configuração.

Os estados apresentados são ilustrativos e variam para mostrar a interação de cada alternativa. Não são uma nova verificação da conexão nem um registro de teste real.

## Regras que qualquer alternativa deve preservar

- Webhook configurado uma vez por aplicativo; autorização e ativação são individuais por Página.
- Aviso visível junto à alteração do webhook: mudar o callback afeta todas as Páginas que usam o aplicativo.
- A instrução essencial de salvar na Meta e assinar `feed` permanece visível durante a configuração.
- Tooltips ou ajudas acionáveis por toque/teclado explicam termos como token de verificação; não escondem riscos ou etapas obrigatórias.
- O selo de configuração reflete a verificação registrada. Exibir sua data e distinguir resultado anterior de uma checagem atual; não inventar estados de conexão ao vivo.
- IDs de aplicativo, Página, post e comentário ficam em detalhes técnicos. O aluno vê nome da Página, estado da autorização e último recebimento.
- Validade do token e do acesso aos dados continuam distintas. Ausência de vencimento informado não significa autorização permanente.
- Teste manual é opcional e permanece condicionado à disponibilidade do backend. Ao abrir, mostrar destinatário, mensagem e confirmação de envio real. Não disparar teste ao navegar ou expandir uma seção.
- Manter comportamento, isolamento por perfil/Página e restrições atuais. Qualquer implementação deve preservar regressão do Instagram e limitar testes reais ao Escorpiano.

## Artefatos

Imagens e prompts em `output/imagegen/facebook-advanced-proposals-20261024/`. Os dados de callback e token nas imagens são ilustrativos. A interface da aplicação não foi modificada nesta etapa.
