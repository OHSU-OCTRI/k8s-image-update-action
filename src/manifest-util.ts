import { parseAllDocuments, Document, isMap, isSeq, isScalar } from 'yaml';

/**
 * Strips an optional "sha256:" prefix and validates the remaining hex digest.
 */
export function normalizeDigest(rawDigest: string): string {
  const trimmed = rawDigest.trim();
  const withoutPrefix = trimmed.startsWith('sha256:')
    ? trimmed.slice('sha256:'.length)
    : trimmed;

  if (!/^[0-9a-fA-F]{64}$/.test(withoutPrefix)) {
    throw new Error(`image-digest does not look like a sha256 digest: ${withoutPrefix}`);
  }

  return withoutPrefix;
}

/**
 * Splits a comma and/or newline separated list of file paths into a clean array.
 */
export function splitFileList(raw: string): string[] {
  return raw
    .split(/[\n,]+/)
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0);
}

/**
 * Builds a regex that matches the bare image name, optionally followed by
 * :tag and/or @sha256:digest, so any existing reference form gets replaced.
 */
export function buildImagePattern(imageName: string): RegExp {
  const escaped = imageName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`^${escaped}(:[^@\\s]+)?(@sha256:[0-9a-fA-F]+)?$`);
}

export interface Counter {
  count: number;
}

/**
 * Recursively walks a parsed YAML node looking for mappings with an "image"
 * key whose value matches the target image name, updating it in place.
 * Works regardless of whether the mapping is under containers, initContainers,
 * a CronJob's jobTemplate, etc.
 */
export function updateImagesInNode(node: unknown, pattern: RegExp, newImage: string, counter: Counter): void {
  if (isMap(node)) {
    const imageItem = node.items.find((item) => String(item.key) === 'image');
    if (imageItem && isScalar(imageItem.value) && typeof imageItem.value.value === 'string') {
      const currentValue = imageItem.value.value;
      if (pattern.test(currentValue) && currentValue !== newImage) {
        imageItem.value.value = newImage;
        counter.count += 1;
      }
    }
    for (const item of node.items) {
      updateImagesInNode(item.value, pattern, newImage, counter);
    }
  } else if (isSeq(node)) {
    for (const item of node.items) {
      updateImagesInNode(item, pattern, newImage, counter);
    }
  }
}
