const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Guards a lookup by `id`: Postgres uuid columns reject any other shape. */
export function isUuid(value: string): boolean {
  return UUID_PATTERN.test(value);
}
