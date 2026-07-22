import { Pipeline } from './scheduler/pipeline';
import { RssCollector } from './collectors/rss-collector';
import { loadConfig } from './config';

async function bootstrap() {
  const config = loadConfig();
  const pipeline = new Pipeline([new RssCollector()]);

  const result = await pipeline.run();
  console.log('Pipeline result:', JSON.stringify(result, null, 2));
}

bootstrap().catch((err) => {
  console.error(err);
  process.exit(1);
});
