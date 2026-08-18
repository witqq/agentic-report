import { test as base, expect } from '@playwright/test';

interface AutoLogFixture {
  readonly autoCaptureLogs: undefined;
}

export const test = base.extend<AutoLogFixture>({
  autoCaptureLogs: [
    async ({ page }, use, testInfo) => {
      const logs: string[] = [];
      const errors: string[] = [];
      page.on('console', (message) => {
        const entry = `[${message.type()}] ${message.text()}`;
        logs.push(entry);
        if (message.type() === 'error') {
          errors.push(entry);
        }
      });
      page.on('pageerror', (error) => {
        const entry = `[pageerror] ${error.message}`;
        logs.push(entry);
        errors.push(entry);
      });
      await use(undefined);
      if (testInfo.status !== testInfo.expectedStatus || errors.length > 0) {
        await testInfo.attach('browser-logs', {
          body: Buffer.from(logs.join('\n'), 'utf8'),
          contentType: 'text/plain',
        });
      }
      if (errors.length > 0) {
        throw new Error(`Generated artifact emitted browser errors:\n${errors.join('\n')}`);
      }
    },
    { auto: true },
  ],
});

export { expect };
