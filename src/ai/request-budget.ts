export class RequestBudget {
  private total = 0;
  private initial = 0;
  private retries = 0;
  private fallbacks = 0;
  private successes = 0;
  private failures = 0;
  private max: number;

  constructor(max: number) {
    this.max = max;
  }

  canRequest(): boolean {
    return this.total < this.max;
  }

  recordInitial(): boolean {
    if (!this.canRequest()) return false;
    this.total++;
    this.initial++;
    return true;
  }

  recordRetry(): boolean {
    if (!this.canRequest()) return false;
    this.total++;
    this.retries++;
    return true;
  }

  recordFallback(): boolean {
    if (!this.canRequest()) return false;
    this.total++;
    this.fallbacks++;
    return true;
  }

  reclassifyInitialToFallback(): void {
    if (this.initial > 0) {
      this.initial--;
      this.fallbacks++;
    }
  }

  recordSuccess(): void {
    this.successes++;
  }

  recordFailure(): void {
    this.failures++;
  }

  getTotal(): number {
    return this.total;
  }

  getInitial(): number {
    return this.initial;
  }

  getRetries(): number {
    return this.retries;
  }

  getFallbacks(): number {
    return this.fallbacks;
  }

  getSuccesses(): number {
    return this.successes;
  }

  getFailures(): number {
    return this.failures;
  }

  getRemaining(): number {
    return Math.max(0, this.max - this.total);
  }

  getMax(): number {
    return this.max;
  }
}
