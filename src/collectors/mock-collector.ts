import { Collector } from '../collectors';
import { storyStorage } from '../storage';
import { Story } from '../types';

export class MockCollector implements Collector {
  name = 'mock-collector';

  async collect(): Promise<Story[]> {
    const stories: Story[] = [
      {
        id: 'story-1',
        source: 'mock',
        title: 'Sample Story',
        content: 'This is a sample collected story for testing.',
        url: 'https://example.com/story-1',
        collectedAt: new Date().toISOString(),
      },
    ];
    for (const story of stories) {
      await storyStorage.append(story);
    }
    return stories;
  }
}
