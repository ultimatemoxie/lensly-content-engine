export interface EnvConfig {
  NODE_ENV: string;
  PORT: number;
}

export function loadConfig(): EnvConfig {
  return {
    NODE_ENV: process.env.NODE_ENV ?? 'development',
    PORT: parseInt(process.env.PORT ?? '3000', 10),
  };
}
