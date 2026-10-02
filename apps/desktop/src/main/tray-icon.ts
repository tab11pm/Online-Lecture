/**
 * Embedded application/tray icon as a PNG data URL. Kept in a pure module with
 * no Electron import so it can be unit-tested without launching Electron.
 *
 * 32x32 RGBA rounded square with a white play glyph, generated once and
 * committed as a base64 constant.
 */
export const TRAY_ICON_DATA_URL =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAACAAAAAgCAYAAABzenr0AAAAfElEQVR42u3XwQkAIQwEwPRjB9ekJXvcx4+CZ7JxxRjwKTsIaiLSqfTk4rFkVF7BvyCrwruI1eENggpghVfEBWg2fUUHoBAmAAJhBlgREIAFAQNoEVCABgEHzCJcADOI804g7i2I+xLG/Q1vS3ZEZ7zPYEIfzbYYTlnj+QvZhhPCi9dHzAAAAABJRU5ErkJggg==';

const PNG_SIGNATURE = Buffer.from([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
]);

export function trayIconBytes(): Buffer {
  const prefix = 'data:image/png;base64,';
  if (!TRAY_ICON_DATA_URL.startsWith(prefix)) {
    throw new Error('TRAY_ICON_DATA_URL is not a base64 PNG data URL');
  }
  return Buffer.from(TRAY_ICON_DATA_URL.slice(prefix.length), 'base64');
}

export function isPng(bytes: Buffer): boolean {
  return (
    bytes.length >= PNG_SIGNATURE.length &&
    bytes.subarray(0, PNG_SIGNATURE.length).equals(PNG_SIGNATURE)
  );
}
