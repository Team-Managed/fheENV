export function errorWithCause(message: string, cause: unknown): Error {
  return Object.assign(new Error(message), { cause });
}
