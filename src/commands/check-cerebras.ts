import dotenv from 'dotenv';
import { CerebrasProvider } from '../ai/providers/cerebras-provider';

dotenv.config();

async function checkCerebras() {
  const apiKey = process.env.CEREBRAS_API_KEY?.trim();
  if (!apiKey) {
    console.error('CEREBRAS_API_KEY is not set in .env');
    process.exit(1);
  }

  const provider = new CerebrasProvider(
    apiKey,
    process.env.CEREBRAS_MODEL || '',
    parseInt(process.env.AI_REQUEST_DELAY_MS || '3000', 10),
    parseInt(process.env.AI_MAX_RETRIES || '3', 10),
    1
  );

  console.log('Checking Cerebras connection...');
  console.log('Provider: ' + provider.providerName);
  console.log('Model: ' + provider.modelName);

  const result = await provider.checkConnection();
  if (result.success) {
    console.log('Cerebras connection successful. Provider: ' + provider.providerName + ', Model: ' + provider.modelName);
  } else {
    console.error('Cerebras check failed: ' + result.error);
    process.exit(1);
  }
}

checkCerebras().catch((err) => {
  console.error(err);
  process.exit(1);
});
