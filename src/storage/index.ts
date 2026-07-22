import { Story, GeneratedPost, PostQueueItem, PublishLog } from '../types';

export class JsonStorage<T> {
  constructor(private filePath: string) {}

  async readAll(): Promise<T[]> {
    const fs = await import('fs');
    if (!fs.existsSync(this.filePath)) {
      return [];
    }
    const raw = fs.readFileSync(this.filePath, 'utf-8');
    try {
      return JSON.parse(raw);
    } catch {
      return [];
    }
  }

  async append(item: T): Promise<void> {
    const fs = await import('fs');
    const all = await this.readAll();
    all.push(item);
    fs.writeFileSync(this.filePath, JSON.stringify(all, null, 2), 'utf-8');
  }

  async writeAll(items: T[]): Promise<void> {
    const fs = await import('fs');
    fs.writeFileSync(this.filePath, JSON.stringify(items, null, 2), 'utf-8');
  }
}

export const storyStorage = new JsonStorage<Story>('./data/stories.json');
export const generatedPostStorage = new JsonStorage<GeneratedPost>('./data/generated-posts.json');
export const postQueueStorage = new JsonStorage<PostQueueItem>('./data/post-queue.json');
export const publishLogStorage = new JsonStorage<PublishLog>('./data/publish-log.json');
