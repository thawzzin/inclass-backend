/* global AbortSignal, Request, URL, scheduler */
import { DurableObject } from 'cloudflare:workers';

const port = 4000;
const idleTimeout = 2 * 60 * 1000;

export class InclassApi extends DurableObject {
  starting;

  async fetch(request) {
    this.starting ??= this.startAndWait().finally(() => {
      this.starting = undefined;
    });
    await this.starting;

    const url = new URL(request.url);
    url.protocol = 'http:';
    url.host = 'container';
    const forwarded = new Request(url, request);
    forwarded.headers.delete('host');
    forwarded.headers.delete('x-forwarded-for');
    const clientIp = request.headers.get('cf-connecting-ip');
    if (clientIp) forwarded.headers.set('x-forwarded-for', clientIp);
    return this.ctx.container.getTcpPort(port).fetch(forwarded);
  }

  async startAndWait() {
    const container = this.ctx.container;
    if (!container.running) {
      container.start({
        image: container.images.base,
        instance: 'basic',
        env: {
          NODE_ENV: this.env.NODE_ENV,
          PORT: this.env.PORT,
          DATABASE_URL: this.env.DATABASE_URL,
          JWT_ACCESS_SECRET: this.env.JWT_ACCESS_SECRET,
          CSRF_SECRET: this.env.CSRF_SECRET,
          ACCESS_TOKEN_EXPIRES_IN: this.env.ACCESS_TOKEN_EXPIRES_IN,
          REFRESH_TOKEN_EXPIRES_IN_DAYS: this.env.REFRESH_TOKEN_EXPIRES_IN_DAYS,
          FRONTEND_URL: this.env.FRONTEND_URL,
          LOG_LEVEL: this.env.LOG_LEVEL,
          TRUST_PROXY: this.env.TRUST_PROXY,
        },
      });
    }
    await container.setInactivityTimeout(idleTimeout);

    const endpoint = container.getTcpPort(port);
    for (let attempt = 0; attempt < 100; attempt++) {
      try {
        const response = await endpoint.fetch('http://container/api/v1/health', {
          signal: AbortSignal.timeout(1000),
        });
        await response.body?.cancel();
        if (response.ok) return;
      } catch {
        // The container may still be starting.
      }
      await scheduler.wait(200);
    }
    throw new Error('InClass API container did not become healthy');
  }
}

export default {
  fetch(request, env) {
    return env.API.getByName('api').fetch(request);
  },
};
