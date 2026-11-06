export type LogLevel = 'info' | 'warn' | 'error';

/** Structured log line. Never pass message bodies, emails, or keys. */
export function writeLog(
  event: string,
  level: LogLevel,
  fields: Record<string, string | number | boolean | null | undefined> = {},
): void {
  console.log(JSON.stringify({ event, level, at: new Date().toISOString(), ...fields }));
}

export function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'unknown_error';
}
