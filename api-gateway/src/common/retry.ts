export interface RetryOptions {
  maxRetries?: number;
  baseDelay?: number;
  maxDelay?: number;
  jitter?: boolean;
}

export async function retryWithBackoff<T>(
  fn: () => Promise<T>,
  options: RetryOptions = {},
): Promise<T> {
  const {
    maxRetries = 3,
    baseDelay = 500,
    maxDelay = 5000,
    jitter = true,
  } = options;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      if (attempt === maxRetries) {
        throw error;
      }

      let delay = Math.min(baseDelay * Math.pow(2, attempt - 1), maxDelay);
      if (jitter) {
        delay += Math.random() * baseDelay;
      }

      console.warn(
        `[Retry] Lần thử ${attempt}/${maxRetries} thất bại: ${error.message}. ` +
        `Thử lại sau ${Math.round(delay)}ms...`
      );
      await new Promise((r) => setTimeout(r, delay));
    }
  }
  throw new Error('Unreachable code reached in retryWithBackoff');
}
