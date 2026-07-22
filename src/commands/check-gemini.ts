import dotenv from 'dotenv';
import { GeminiProvider } from '../ai/providers/gemini-provider';

dotenv.config();

async function checkGemini() {
  const apiKey = process.env.GEMINI_API_KEY?.trim();
  if (!apiKey) {
    console.error('GEMINI_API_KEY is not set in .env');
    process.exit(1);
  }

  const provider = new GeminiProvider(
    apiKey,
    process.env.GEMINI_MODEL || 'gemini-2.0-flash',
    parseInt(process.env.GEMINI_REQUEST_DELAY_MS || '5000', 10),
    parseInt(process.env.GEMINI_MAX_RETRIES || '3', 10),
    1
  );

  console.log('Checking Gemini connection...');
  console.log('Provider: ' + provider.providerName);
  console.log('Model: ' + provider.modelName);

  const result = await provider.checkConnection();
  if (result.success) {
    console.log('Gemini connection successful. Provider: ' + provider.providerName + ', Model: ' + provider.modelName);
  } else {
    console.error('Gemini check failed: ' + result.error);
    process.exit(1);
  }
}

checkGemini().catch((err) => {
  console.error(err);
  process.exit(1);
});
