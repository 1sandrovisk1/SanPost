# Prova de resposta privada Facebook pelo painel

Autorizada em 22/10/2026, exclusivamente para Escorpiano. Incremento de homologação anterior ao motor compartilhado; não liga automações nem altera Instagram.

## Escopo e contrato propostos

Configuração de servidor opt-in, desativada quando ausente, fixa organização, perfil, integração, App ID, Página, post, comentário e a mensagem aprovada. Na instalação local: Escorpião Veneno (`271852286004401`), integração `cmvi6us6q0005pm090b98kalb`, App `841571281566716`, post `271852286004401_122321127302221279`, comentário `122321127302221279_1740025530415851`. Configuração em arquivo privado montado somente leitura; nenhuma credencial de acesso é copiada para esse arquivo.

Mensagem fixa: “Teste do MultiPost: seu comentário chegou. Aqui está o link: https://www.facebook.com/share/p/1DsHnUeoAy/”. O cliente não pode escolher outro destinatário, comentário ou texto nesta prova.

- `GET /facebook-automations/:integrationId/private-reply-test`: política ADMIN e contexto autenticado. Retorna indisponível fora da allowlist. No alvo, valida integração ativa/perfil/credenciais atuais, mostra prévia fixa, comentário/post, revisão da prévia, estado de bloqueio e resultado persistido. Sem chamada Meta periódica; nenhum token é retornado.
- `POST /facebook-automations/:integrationId/private-reply-test`: política ADMIN, `{revision}` da prévia. Revalida todos os vínculos e o recibo recebido via HMAC; rejeita prévia obsoleta. Consulta token/permissões, callback e inscrição apenas por GET (nunca inscreve outra Página). Consulta `id,created_time,can_reply_privately` do comentário com o Page token, exige identidade correta, elegibilidade explícita e janela válida. Revalida contexto/credenciais/configuração imediatamente antes de reservar e enviar. Um POST remoto `/:pageId/messages`, usando o adaptador existente. Sem retry.
- Resultados sanitizados: SENT (Meta retornou message_id, não comprova leitura), FAILED (rejeição explícita), UNKNOWN (timeout/5xx/resultado ausente ou falha de persistência após envio), SENDING (reserva em andamento). Qualquer reserva impede repetição do comentário, inclusive depois de restart, outra sessão ou mudança de perfil/app.

## Persistência e isolamento

Controller → novo serviço de prova → repositório de prova. Reutilizar o serviço de configuração para resolução/autorização e o adaptador Graph para transporte. Manter o webhook público como diagnóstico, sem envio automático.

Reutilizar `FileProofLedger` (criação exclusiva e fsync antes do envio), encapsulado em repositório novo com leitura do resultado. Diretório em bind mount privado e persistente do host, compartilhado com o CLI (`.secrets/meta-automation-proof-ledger`), fora de uploads e do filesystem efêmero do container; mesma chave Página/comentário entre usuários/perfis. Sem schema novo nesta fase. Arquivo ausente permite a primeira tentativa; arquivo inválido, reserva incompleta ou erro de armazenamento bloqueiam com estado conservador. O ledger nunca é apagado pela UI. Essa implementação é somente para homologação em uma instância; a V2 de produção exigirá ledger no banco, conforme plano principal.

Configurar allowlist e mount somente no ambiente local. O mount usa `create_host_path: false`; o repositório exige diretório previamente inicializado e marcador `.ledger-id` igual ao `ledgerId` da configuração, sem criar armazenamento automaticamente. Ausência do mount/marcador falha antes da reserva. Fora do alvo, a API não chama Graph nem cria reserva e a seção não é oferecida na UI. O target não é inferido a partir do primeiro canal disponível. Nenhuma configuração de outras Páginas, publicação ou Instagram é alterada.

## Interface e validação

Adicionar seção “Testar resposta privada” após o recibo, com texto e destino explícitos, botão de envio único e resultado. Usar `useFetch`, SWR por org/perfil/integração/revisão de credenciais, textos pt/en e primitives existentes; limpar estado ao trocar de Página/perfil. Não mostrar o conteúdo da configuração de outro contexto. A repetição de clique ou refresh consulta o resultado, sem reenviar.

TDD: fora do alvo; perfil/credenciais trocados; ausência/divergência de recibo; comentário incorreto/expirado/futuro/inelegível; token/permissões/callback/inscrição inválidos; prévia obsoleta; concorrência; restart; falha de fsync; timeout e falha de gravação após POST; resultado sem segredos; policies/DTO; traduções e contrato visual. Regressão consolidada de automações/Instagram e TypeScript/build backend. Revisões plan-reviewer, code-reviewer e security-auditor; doc-maintainer ao final. Validar a UI autenticada e executar somente o teste explicitamente autorizado, registrando retorno real sem prometer leitura no Messenger.

## Pendências antes da execução

Revisar este plano contra o código; confirmar o contrato do campo `can_reply_privately` no ambiente Meta. Não usar recibo reduzido para fabricar corpo bruto/assinatura para o CLI antigo. Esta prova tem contrato próprio, ancorado no recibo autenticado e na revalidação remota do comentário. O usuário já definiu conteúdo e alvo; não pedir novo access token manual.

## Revisão e validação inicial — 22/10/2026

Plan-reviewer sem blocker arquitetônico. Incorporados: inspeção do setup sem subscribePage; armazenamento compartilhado com CLI; volume ausente falha fechado; revisão inclui o Page token corrente; recibo perdido não apaga resultado. Leitura real na Graph API v25 retornou HTTP 200 para o comentário aprovado, `created_time=2026-10-22T18:26:45+0000`, `can_reply_privately=true`. Essa leitura não enviou mensagem e será repetida no clique.

TDD: as duas suítes novas falharam inicialmente por ausência dos módulos; 39 testes passaram após implementação. Controller falhou antes da inclusão dos novos handlers; UI falhou antes do novo componente. Validação consolidada e resultado real serão registrados no runbook.

## Entrega da prova

Implementação revisada instalada no Docker e validada pelo painel autenticado. Meta aceitou o único envio autorizado às 16:15:43 de 22/10/2026 (America/Sao_Paulo). Resultado `SENT` persistido no bind compartilhado com CLI, confirmado após reload/GET, botão de envio bloqueado. Mensagem e IDs conforme escopo deste plano. Em 22/10/2026, o usuário confirmou: “Sim, recebi a mensagem com o link”. A prova deste comentário está concluída de ponta a ponta: webhook recebido, envio único pelo botão, aceitação da Meta e recebimento visível no Messenger. A confirmação humana é evidência adicional; o estado `SENT` sozinho não comprova leitura. O motor automático/editor Facebook permanece fora deste incremento. Detalhes, evidência visual, testes, imagem/rollback e continuidade no [guia operacional](../operations/facebook-automation-panel.md#6-prova-de-resposta-privada-pelo-painel--somente-escorpiano).
