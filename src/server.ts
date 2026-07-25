import http from 'http';
import { loadConfig } from './config';

const config = loadConfig();
const PORT = config.PORT;

function createHealthResponse(): any {
  return {
    status: 'ok',
    service: 'lensly-content-engine',
    storageProvider: process.env.STORAGE_PROVIDER || 'json',
    timestamp: new Date().toISOString(),
  };
}

function logSafeStartupInfo(): void {
  console.log('Lensly Content Engine starting...');
  console.log('  NODE_ENV: ' + (process.env.NODE_ENV || 'development'));
  console.log('  PORT: ' + PORT);
  console.log('  STORAGE_PROVIDER: ' + (process.env.STORAGE_PROVIDER || 'json'));
  console.log('  DATABASE_URL: ' + (process.env.DATABASE_URL ? '[REDACTED]' : 'not configured'));
  console.log('  X_PUBLISHING_ENABLED: ' + (process.env.X_PUBLISHING_ENABLED || 'false'));
  console.log('  X_DRY_RUN: ' + (process.env.X_DRY_RUN || 'true'));
}

function validateRequiredConfig(): void {
  const requiredVars: string[] = [];
  
  if ((process.env.STORAGE_PROVIDER || 'json') === 'postgres' && !process.env.DATABASE_URL) {
    requiredVars.push('DATABASE_URL');
  }

  if (requiredVars.length > 0) {
    console.error('Missing required configuration: ' + requiredVars.join(', '));
    console.error('Set these environment variables before starting the server.');
    process.exit(1);
  }
}

const server = http.createServer((req, res) => {
  if (req.method === 'GET' && req.url === '/health') {
    const health = createHealthResponse();
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(health, null, 2));
    return;
  }

  res.writeHead(404, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ error: 'Not found' }, null, 2));
});

function shutdown(signal: string): void {
  console.log('Received ' + signal + ', shutting down gracefully...');
  server.close(() => {
    console.log('Server closed.');
    process.exit(0);
  });

  setTimeout(() => {
    console.log('Forced shutdown due to timeout.');
    process.exit(1);
  }, 10000);
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

validateRequiredConfig();
logSafeStartupInfo();

server.listen(PORT, () => {
  console.log('Health-check server listening on port ' + PORT);
  console.log('GET /health - health check endpoint');
});
