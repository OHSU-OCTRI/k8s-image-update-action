/**
 * Splits a comma and/or newline separated list of file paths into a clean array.
 */
export function splitFileList(raw: string): string[] {
  return raw
    .split(/[\n,]+/)
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0);
}
