import { Publisher } from './index';

export class MockPublisher implements Publisher {
  async publish({ id, content }: { id: string; content: string }): Promise<{ success: boolean }> {
    return { success: true };
  }
}
