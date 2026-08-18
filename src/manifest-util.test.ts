import { parseDocument } from 'yaml';
import {
  normalizeDigest,
  splitFileList,
  buildImagePattern,
  updateImagesInNode,
  Counter,
} from './manifest-util.js';

describe('normalizeDigest', () => {
  const validHex = 'a'.repeat(64);

  it('returns the digest unchanged when there is no prefix', () => {
    expect(normalizeDigest(validHex)).toBe(validHex);
  });

  it('strips a sha256: prefix', () => {
    expect(normalizeDigest(`sha256:${validHex}`)).toBe(validHex);
  });

  it('trims surrounding whitespace before validating', () => {
    expect(normalizeDigest(`  sha256:${validHex}  `)).toBe(validHex);
  });

  it('throws on a digest that is too short', () => {
    expect(() => normalizeDigest('sha256:abc123')).toThrow(
      'image-digest does not look like a sha256 digest',
    );
  });

  it('throws on a digest with non-hex characters', () => {
    const invalid = `z${'a'.repeat(63)}`;
    expect(() => normalizeDigest(invalid)).toThrow(
      'image-digest does not look like a sha256 digest',
    );
  });

  it('throws on an unsupported prefix', () => {
    expect(() => normalizeDigest(`sha512:${validHex}`)).toThrow(
      'image-digest does not look like a sha256 digest',
    );
  });
});

describe('splitFileList', () => {
  it('splits comma and newline separated values, trimming and dropping empties', () => {
    expect(splitFileList('a.yaml, b.yaml\n\nc.yaml,')).toEqual(['a.yaml', 'b.yaml', 'c.yaml']);
  });

  it('returns an empty array for empty input', () => {
    expect(splitFileList('')).toEqual([]);
  });
});

describe('buildImagePattern', () => {
  const pattern = buildImagePattern('registry.example.com/my-app');

  it('matches the bare image name', () => {
    expect(pattern.test('registry.example.com/my-app')).toBe(true);
  });

  it('matches the image name with a tag', () => {
    expect(pattern.test('registry.example.com/my-app:v1.2.3')).toBe(true);
  });

  it('matches the image name with a sha256 digest', () => {
    expect(
      pattern.test(`registry.example.com/my-app@sha256:${'a'.repeat(64)}`),
    ).toBe(true);
  });

  it('matches the image name with both a tag and a sha256 digest', () => {
    expect(
      pattern.test(`registry.example.com/my-app:v1.2.3@sha256:${'a'.repeat(64)}`),
    ).toBe(true);
  });

  it('does not match a different image name', () => {
    expect(pattern.test('registry.example.com/other-app')).toBe(false);
  });

  it('does not match when the image name is only a prefix', () => {
    expect(pattern.test('registry.example.com/my-app-extra:v1')).toBe(false);
  });

  it('escapes regex special characters in the image name', () => {
    const dotPattern = buildImagePattern('registry.example.com/my-app');
    // "." in the name must be literal, not "any character"
    expect(dotPattern.test('registryXexampleXcom/my-app')).toBe(false);
  });
});

describe('updateImagesInNode', () => {
  function parse(yaml: string) {
    return parseDocument(yaml).contents;
  }

  it('updates a matching image value and increments the counter', () => {
    const node = parse(`
containers:
  - name: app
    image: registry.example.com/my-app:v1
`);
    const pattern = buildImagePattern('registry.example.com/my-app');
    const counter: Counter = { count: 0 };

    updateImagesInNode(node, pattern, 'registry.example.com/my-app:v2', counter);

    expect(counter.count).toBe(1);
    expect((node as any).getIn(['containers', 0, 'image'])).toBe(
      'registry.example.com/my-app:v2',
    );
  });

  it('does not update non-matching image values', () => {
    const node = parse(`
containers:
  - name: app
    image: registry.example.com/other-app:v1
`);
    const pattern = buildImagePattern('registry.example.com/my-app');
    const counter: Counter = { count: 0 };

    updateImagesInNode(node, pattern, 'registry.example.com/my-app:v2', counter);

    expect(counter.count).toBe(0);
    expect((node as any).getIn(['containers', 0, 'image'])).toBe(
      'registry.example.com/other-app:v1',
    );
  });

  it('does not increment the counter when the new value equals the existing value', () => {
    const node = parse(`
containers:
  - name: app
    image: registry.example.com/my-app:v2
`);
    const pattern = buildImagePattern('registry.example.com/my-app');
    const counter: Counter = { count: 0 };

    updateImagesInNode(node, pattern, 'registry.example.com/my-app:v2', counter);

    expect(counter.count).toBe(0);
  });

  it('recurses into nested sequences and maps, including a CronJob jobTemplate', () => {
    const node = parse(`
spec:
  jobTemplate:
    spec:
      template:
        spec:
          initContainers:
            - name: init
              image: registry.example.com/my-app:v1
          containers:
            - name: app
              image: registry.example.com/my-app:v1
            - name: sidecar
              image: registry.example.com/other-app:v1
`);
    const pattern = buildImagePattern('registry.example.com/my-app');
    const counter: Counter = { count: 0 };

    updateImagesInNode(node, pattern, 'registry.example.com/my-app:v2', counter);

    expect(counter.count).toBe(2);
    expect(
      (node as any).getIn([
        'spec',
        'jobTemplate',
        'spec',
        'template',
        'spec',
        'initContainers',
        0,
        'image',
      ]),
    ).toBe('registry.example.com/my-app:v2');
    expect(
      (node as any).getIn([
        'spec',
        'jobTemplate',
        'spec',
        'template',
        'spec',
        'containers',
        0,
        'image',
      ]),
    ).toBe('registry.example.com/my-app:v2');
    expect(
      (node as any).getIn([
        'spec',
        'jobTemplate',
        'spec',
        'template',
        'spec',
        'containers',
        1,
        'image',
      ]),
    ).toBe('registry.example.com/other-app:v1');
  });

  it('counts multiple matches across sibling containers', () => {
    const node = parse(`
containers:
  - name: app1
    image: registry.example.com/my-app:v1
  - name: app2
    image: registry.example.com/my-app:v1
`);
    const pattern = buildImagePattern('registry.example.com/my-app');
    const counter: Counter = { count: 0 };

    updateImagesInNode(node, pattern, 'registry.example.com/my-app:v2', counter);

    expect(counter.count).toBe(2);
  });
});
