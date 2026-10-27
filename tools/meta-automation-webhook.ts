import {
  createCaptureServer,
  FileCaptureStore,
  loadCaptureConfig,
  createCaptureDiagnosticWriter,
} from '../libraries/nestjs-libraries/src/integrations/automations/meta-automation-capture';

async function main() {
  const [
    configPath,
    captureDirectory,
    host = '127.0.0.1',
    rawPort = '3033',
    ...extra
  ] = process.argv.slice(2);
  if (configPath === '--help') {
    process.stdout.write(
      'Uso: pnpm automations:meta-webhook <config-privado.json> <capturas> [127.0.0.1|0.0.0.0] [porta]\nSomente captura assinada para uma Pagina/perfil. Nao envia mensagens nem configura a Meta.\n'
    );
    return;
  }
  const port = Number(rawPort);
  if (
    !configPath ||
    !captureDirectory ||
    extra.length ||
    !['127.0.0.1', '0.0.0.0'].includes(host) ||
    !Number.isInteger(port) ||
    port < 1024 ||
    port > 65535
  )
    throw new Error();
  const config = await loadCaptureConfig(configPath);
  const store = await FileCaptureStore.open(captureDirectory);
  const server = createCaptureServer(
    config,
    store,
    createCaptureDiagnosticWriter(process.stdout)
  );
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, host, () => {
      server.removeListener('error', reject);
      resolve();
    });
  });
  server.on('error', () => {
    process.stderr.write('CAPTURE_SERVER_ERROR\n');
    process.exit(1);
  });
  process.stdout.write('CAPTURE_READY\n');
  const stop = () => {
    server.close(() => process.exit(0));
    setTimeout(() => process.exit(1), 10000).unref();
  };
  process.once('SIGTERM', stop);
  process.once('SIGINT', stop);
}

main().catch(() => {
  process.stderr.write('CAPTURE_START_FAILED\n');
  process.exitCode = 1;
});
