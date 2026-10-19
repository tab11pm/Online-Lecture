export type RuntimeMode = 'development' | 'packaged';

export function isRuntimeMode(value: unknown): value is RuntimeMode {
  return value === 'development' || value === 'packaged';
}
