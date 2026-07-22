export interface Publisher {
  publish(post: { id: string; content: string }): Promise<{ success: boolean }>;
}
