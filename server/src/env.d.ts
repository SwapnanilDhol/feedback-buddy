declare namespace Cloudflare {
  interface Env {
    DB: D1Database;
    ATTACHMENTS: R2Bucket;
    ENVIRONMENT: string;
    PUBLIC_BASE_URL: string;
    VERSION?: string;
    ADMIN_PASSWORD: string;
    SESSION_SECRET: string;
    ADMIN_API_TOKEN: string;
    /** Cloudflare Email Sending binding; absent in tests and when not configured. */
    EMAIL?: SendEmail;
    EMAIL_FROM?: string;
  }
}

type Env = Cloudflare.Env;
