import { Pipeline } from '../scheduler/pipeline';
import { RssCollector } from '../collectors/rss-collector';

async function collect() {
  const pipeline = new Pipeline([new RssCollector()]);
  const result = await pipeline.run();
  console.log('Collected ' + result.stories.length + ' stories.');
}

collect().catch((err) => {
  console.error(err);
  process.exit(1);
});
