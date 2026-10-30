# Fixtures de replay

`v112-before-accepted-reference.json` é um histórico sintético de V112 anterior
ao marcador `zernio-accepted-reference-v1`. Foi gerado em Temporal isolado com o
workflow do commit `c5568b21`, activities simuladas e nenhuma chamada externa.
Não contém credenciais ou mídia privada. Identidades e stack traces foram
sanitizados. O teste comprova que o código novo reproduz esse histórico sem
inserir retroativamente a gravação da referência aceita.

`migration-workflows.ts` reúne os workflows reais V102/V112 para o teste isolado
de substituição e de persistência do aceite. O servidor usado pelo teste é
exclusivamente `127.0.0.1:17233`, nunca o `TEMPORAL_ADDRESS` da aplicação.
