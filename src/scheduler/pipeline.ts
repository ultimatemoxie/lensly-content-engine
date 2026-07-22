import { Collector } from '../collectors';
import { storyStorage, generatedPostStorage, postQueueStorage, publishLogStorage } from '../storage';
import { Story, GeneratedPost, PostQueueItem, PublishLog } from '../types';

export interface PipelineContext {
  stories: Story[];
  posts: GeneratedPost[];
  queue: PostQueueItem[];
  logs: PublishLog[];
}

export class Pipeline {
  constructor(
    private collectors: Collector[],
  ) {}

  async run(): Promise<PipelineContext> {
    for (const collector of this.collectors) {
      await collector.collect();
    }

    const ctx: PipelineContext = {
      stories: await storyStorage.readAll(),
      posts: await generatedPostStorage.readAll(),
      queue: await postQueueStorage.readAll(),
      logs: await publishLogStorage.readAll(),
    };

    return ctx;
  }
}
