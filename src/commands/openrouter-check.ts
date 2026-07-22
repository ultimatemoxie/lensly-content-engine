import dotenv from 'dotenv';
import { OpenRouterProvider } from '../ai/providers/openrouter-provider';

dotenv.config();

async function checkOpenRouter() {
  const apiKey = process.env.OPENROUTER_API_KEY?.trim();
  if (!apiKey) {
    console.error('OPENROUTER_API_KEY is not set in .env');
    process.exit(1);
  }

  const provider = new OpenRouterProvider(
    apiKey,
    process.env.OPENROUTER_MODEL || 'openrouter/free',
    process.env.OPENROUTER_SITE_URL || '',
    process.env.OPENROUTER_APP_NAME || 'Lensly AI Content Engine',
    0,
    1,
    1
  );

  console.log('Checking OpenRouter connection...');
  console.log('Provider: ' + provider.providerName);
  console.log('Model: ' + provider.modelName);

  const result = await provider.evaluateAndGenerate({
    title: 'Test connection',
    summary: 'This is a test connection check.',
    rssSummary: 'This is a test connection check.',
    articleText: '',
    contentSource: 'rss',
    sourceName: 'system',
    articleUrl: 'https://example.com',
  });

  if (result.error) {
    console.error('OpenRouter check failed: ' + result.error);
    process.exit(1);
  }

  console.log('Connection successful. Model: ' + provider.modelName + ', Provider: ' + provider.providerName);
}

checkOpenRouter().catch((err) => {
  console.error(err);
  process.exit(1);
});
