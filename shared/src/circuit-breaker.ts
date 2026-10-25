export enum CircuitState {
  CLOSED = 'CLOSED',
  OPEN = 'OPEN',
  HALF_OPEN = 'HALF_OPEN',
}

export class CircuitBreaker {
  private state: CircuitState = CircuitState.CLOSED;
  private failureCount = 0;
  private successCount = 0;
  private lastFailureTime = 0;
  private readonly name: string;
  private readonly failureThreshold: number;
  private readonly recoveryTimeout: number;
  private readonly successThreshold: number;

  constructor(
    name: string,
    failureThreshold = 5,
    recoveryTimeout = 30000,
    successThreshold = 2,
  ) {
    this.name = name;
    this.failureThreshold = failureThreshold;
    this.recoveryTimeout = recoveryTimeout;
    this.successThreshold = successThreshold;
  }

  async execute<T>(fn: () => Promise<T>, fallback?: () => T | Promise<T>): Promise<T> {
    if (this.state === CircuitState.OPEN) {
      if (Date.now() - this.lastFailureTime >= this.recoveryTimeout) {
        this.state = CircuitState.HALF_OPEN;
        this.successCount = 0;
        console.log(`[CB:${this.name}] Trạng thái chuyển từ OPEN -> HALF_OPEN (Thử nghiệm 1 request)`);
      } else {
        const remaining = Math.ceil((this.recoveryTimeout - (Date.now() - this.lastFailureTime)) / 1000);
        console.warn(`[CB:${this.name}] Đang OPEN — Chặn request (Thử lại sau ${remaining}s)`);
        if (fallback) return fallback();
        throw new Error(`Circuit breaker [${this.name}] đang ở trạng thái OPEN`);
      }
    }

    try {
      const result = await fn();
      this.onSuccess();
      return result;
    } catch (error) {
      this.onFailure();
      if (fallback && this.state === CircuitState.OPEN) return fallback();
      throw error;
    }
  }

  private onSuccess() {
    this.failureCount = 0;
    if (this.state === CircuitState.HALF_OPEN) {
      this.successCount++;
      if (this.successCount >= this.successThreshold) {
        this.state = CircuitState.CLOSED;
        console.log(`[CB:${this.name}] HALF_OPEN -> CLOSED (Dịch vụ đã phục hồi hoàn toàn)`);
      }
    }
  }

  private onFailure() {
    this.failureCount++;
    this.lastFailureTime = Date.now();
    if (this.failureCount >= this.failureThreshold) {
      this.state = CircuitState.OPEN;
      console.error(`[CB:${this.name}] -> OPEN (${this.failureCount} lỗi liên tiếp)`);
    }
  }

  getState(): CircuitState {
    return this.state;
  }

  getMetrics() {
    return {
      name: this.name,
      state: this.state,
      failureCount: this.failureCount,
      successCount: this.successCount,
      lastFailureTime: this.lastFailureTime ? new Date(this.lastFailureTime).toISOString() : null,
    };
  }
}
