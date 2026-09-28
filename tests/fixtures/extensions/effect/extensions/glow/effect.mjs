import { defineEffect } from 'agentic-report/effect';

export default defineEffect({
  mount(context) {
    for (const host of context.hosts) host.dataset.glowMounted = 'true';
    return {
      at() {},
      rebuild() {},
      unmount() {},
    };
  },
});
