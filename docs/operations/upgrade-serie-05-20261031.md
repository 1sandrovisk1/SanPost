# Atualização desde a série 0.5 — 31/10/2026

A RC.6 corrigiu a troca do índice legado do Mastra, mas isso não equivalia a uma validação do salto direto de todas as versões 0.5. A comparação das sete tags estáveis encontrou outra recusa no boot de bancos 0.5.0, 0.5.1 e 0.5.2: `ALTER TYPE "RepostDestinationFormat" ADD VALUE 'FACEBOOK_STORY'`. O valor surgiu na 0.5.3 e é aditivo.

O sincronizador passa a reconhecer somente essa instrução exata. Mantém a transação, a recusa de outras alterações de enum, de tabelas desconhecidas, de SQL destrutivo e as verificações da migração legada do Mastra. PostgreSQL 17 permite adicionar o valor dentro da transação; seu uso deve ocorrer depois do commit. Nenhum default do plano usa esse valor antes do commit.

## Prova reproduzível

`tools/v05-upgrade-proof.cjs` exige banco inicialmente vazio, em loopback, sem parâmetros de conexão adicionais e com nome `multipost_v05_proof_*`. Nunca recebe um dump de produção. Cria fixtures sintéticas para cada schema distinto encontrado nas tags `v0.5*`, incluindo as sete versões estáveis e as RCs disponíveis no repositório.

Para cada schema aplica o DDL antigo, grava organização, usuário, vínculo de equipe, perfil, canal, post agendado, post publicado, regra e destino de repost. Executa o sincronizador real de boot, inicializa o SDK Mastra duas vezes e repete o boot duas vezes. Confere todos os campos existentes e as contagens dessas oito tabelas, incluindo credenciais sintéticas, conteúdo, mídia, data UTC e referência pública. Confere também gravação/leitura de `FACEBOOK_STORY` depois do commit. A prova antiga `mastra-storage-proof.cjs` continua cobrindo tabelas criadas em runtime pelo SDK anterior, experimentos populados, memória e vetores.

Essa evidência cobre compatibilidade de schema e armazenamento das estruturas oficiais. Não equivale a uma garantia universal sobre APIs externas, históricos Temporal de qualquer idade, schemas personalizados ou instalações com serviços incompatíveis. Backup e preservação das chaves e volumes existentes continuam necessários antes da atualização. Não trocar `JWT_SECRET`, `ENCRYPTION_KEY`, banco, Redis ou namespace Temporal durante o upgrade.

## Editor e responsividade

O compositor novo está ligado diretamente ao fluxo de criar/editar post; não exige variável de ativação. A maior diferença visual aparece até 1025 px: cabeçalho móvel, alternância entre edição/preview, painéis inferiores para canais/configurações/data/tags/recorrência e toolbar adaptada ao teclado. No desktop o desenho continua semelhante. O porte não corresponde a uma reformulação responsiva de todas as telas do aplicativo.

Em 31/10, `localmultipost.automacaosemlimites.com.br` usava bind mounts do checkout principal local em `7efc6646`, identificado como RC.4, sem esse compositor. A VPS de produção foi conferida separadamente na RC.6. Atualizar a imagem da VPS não atualiza automaticamente um ambiente local baseado em fontes de outro checkout.
