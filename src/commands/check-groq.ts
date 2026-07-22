import dotenv from 'dotenv';
import { GroqProvider } from '../ai/providers/groq-provider';

dotenv.config();

async function checkGroq() {
  const apiKey = process.env.GROQ_API_KEY?.trim();
  if (!apiKey) {
    console.error('GROQ_API_KEY is not set in .env');
    process.exit(1);
  }

  const provider = new GroqProvider(
    apiKey,
    process.env.GROQ_MODEL || '',
    parseInt(process.env.AI_REQUEST_DELAY_MS || '3000', 10),
    parseInt(process.env.AI_MAX_RETRIES || '3', 10),
    1
  );

  console.log('Checking Groq connection...');
  console.log('Provider: ' + provider.providerName);
  console.log('Model: ' + provider.modelName);

  const result = await provider.checkConnection();
  if (result.success) {
    console.log('Groq connection successful. Provider: ' + provider.providerName + ', Model: ' + provider.modelName);
  } else {
    console.error('Groq check failed: ' + result.error);
    process.exit(1);
  }
}

checkGroq().catch((err) => {
  console.error(err);
  process.exit(1);
});
