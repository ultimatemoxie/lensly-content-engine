import { Pipeline } from './scheduler/pipeline';
import { MockCollector } from './collectors/mock-collector';
import { MockAIClient } from './ai/mock-client';
import { MockPublisher } from './publisher/mock-publisher';
import { loadConfig } from './config';

async function bootstrap() {
  const config = loadConfig();
  const pipeline = new Pipeline([new MockCollector()]);

  const result = await pipeline.run();
  console.log('Mock pipeline result:', JSON.stringify(result, null, 2));
}

bootstrap().catch((err) => {
  console.error(err);
  process.exit(1);
});
