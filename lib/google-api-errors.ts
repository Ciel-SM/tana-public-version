const CREDENTIAL_ERROR_PATTERNS = [
  'api key',
  'unauthorized',
  'forbidden',
  'authentication',
  'credential',
  'permission denied',
];

export function normalizeApiKey(apiKey: string | null | undefined): string | null {
  const trimmed = apiKey?.trim() ?? '';
  return trimmed || null;
}

export function isCredentialError(error: unknown): boolean {
  const maybeError = error as { status?: number; message?: string } | undefined;
  const status = maybeError?.status;
  const message = error instanceof Error ? error.message : String(maybeError?.message ?? error ?? '');
  const lowered = message.toLowerCase();

  return (
    status === 400 ||
    status === 401 ||
    status === 403 ||
    CREDENTIAL_ERROR_PATTERNS.some(pattern => lowered.includes(pattern))
  );
}

export function getCredentialErrorMessage(
  error: unknown,
  capability = 'access to this Google API feature',
): string {
  if (!isCredentialError(error)) return '';

  return `Google rejected this API key or it does not have ${capability}. Check the key and try again.`;
}
