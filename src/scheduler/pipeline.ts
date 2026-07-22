import { Collector } from '../collectors';
import { AIClient } from '../ai';
import { Publisher } from '../publisher';
import { storyStorage, generatedPostStorage, postQueueStorage, publishLogStorage } from '../storage';
import { Story, GeneratedPost, PostQueueItem, PublishLog, Platform } from '../types';

export interface PipelineContext {
  stories: Story[];
  posts: GeneratedPost[];
  queue: PostQueueItem[];
  logs: PublishLog[];
}

export class Pipeline {
  constructor(
    private collectors: Collector[],
    private ai: AIClient,
    private publisher: Publisher
  ) {}

  async run(): Promise<PipelineContext> {
    for (const collector of this.collectors) {
      const stories = await collector.collect();
      for (const story of stories) {
        const generated = await this.generatePost(story, 'threads');
        await generatedPostStorage.append(generated);
      }
    }

    const ctx: PipelineContext = {
      stories: await storyStorage.readAll(),
      posts: await generatedPostStorage.readAll(),
      queue: await postQueueStorage.readAll(),
      logs: await publishLogStorage.readAll(),
    };

    return ctx;
  }

  private async generatePost(story: Story, platform: Platform): Promise<GeneratedPost> {
    const response = await this.ai.complete({
      prompt: `Write a short post about: ${story.title}. Context: ${story.summary}`,
    });

    return {
      id: `post-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
      storyId: story.id,
      platform,
      content: response.text,
      hashtags: ['#lensly'],
      status: 'queued',
      createdAt: new Date().toISOString(),
    };
  }
}
