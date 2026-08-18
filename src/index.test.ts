import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import * as core from '@actions/core';

import { run } from './index';

jest.mock('@actions/core');

const mockedCore = core as jest.Mocked<typeof core>;

describe('run', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'k8s-image-update-action-'));
    jest.clearAllMocks();
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  function setInputs(inputs: Record<string, string>): void {
    mockedCore.getInput.mockImplementation((name: string) => inputs[name] ?? '');
  }

  function writeManifest(fileName: string, contents: string): string {
    const filePath = path.join(tmpDir, fileName);
    fs.writeFileSync(filePath, contents);
    return filePath;
  }

  it('updates a matching image and reports success outputs', async () => {
    const manifestPath = writeManifest(
      'deployment.yaml',
      [
        'apiVersion: apps/v1',
        'kind: Deployment',
        'spec:',
        '  template:',
        '    spec:',
        '      containers:',
        '        - name: app',
        '          image: registry.example.com/my-app:v1',
        '',
      ].join('\n'),
    );

    setInputs({
      'image-name': 'registry.example.com/my-app',
      'image-digest': 'a'.repeat(64),
      'version-tag': 'v2',
      'yaml-files': manifestPath,
    });

    await run();

    const updated = fs.readFileSync(manifestPath, 'utf8');
    expect(updated).toContain(
      `image: registry.example.com/my-app:v2@sha256:${'a'.repeat(64)}`,
    );

    expect(mockedCore.setFailed).not.toHaveBeenCalled();
    expect(mockedCore.setOutput).toHaveBeenCalledWith(
      'new-image',
      `registry.example.com/my-app:v2@sha256:${'a'.repeat(64)}`,
    );
    expect(mockedCore.setOutput).toHaveBeenCalledWith('updated-count', '1');
  });

  it('omits the tag when version-tag is not provided', async () => {
    const manifestPath = writeManifest(
      'deployment.yaml',
      ['containers:', '  - name: app', '    image: registry.example.com/my-app:v1', ''].join(
        '\n',
      ),
    );

    setInputs({
      'image-name': 'registry.example.com/my-app',
      'image-digest': 'a'.repeat(64),
      'version-tag': '',
      'yaml-files': manifestPath,
    });

    await run();

    const updated = fs.readFileSync(manifestPath, 'utf8');
    expect(updated).toContain(`image: registry.example.com/my-app@sha256:${'a'.repeat(64)}`);
  });

  it('updates matching containers across multiple files', async () => {
    const manifestOne = writeManifest(
      'one.yaml',
      ['containers:', '  - name: app', '    image: registry.example.com/my-app:v1', ''].join(
        '\n',
      ),
    );
    const manifestTwo = writeManifest(
      'two.yaml',
      [
        'containers:',
        '  - name: app',
        '    image: registry.example.com/my-app:v1',
        '  - name: sidecar',
        '    image: registry.example.com/other-app:v1',
        '',
      ].join('\n'),
    );

    setInputs({
      'image-name': 'registry.example.com/my-app',
      'image-digest': 'a'.repeat(64),
      'version-tag': 'v2',
      'yaml-files': `${manifestOne},${manifestTwo}`,
    });

    await run();

    expect(mockedCore.setOutput).toHaveBeenCalledWith('updated-count', '2');
    expect(fs.readFileSync(manifestTwo, 'utf8')).toContain(
      'image: registry.example.com/other-app:v1',
    );
  });

  it('fails when no matching image is found in the given files', async () => {
    const manifestPath = writeManifest(
      'deployment.yaml',
      ['containers:', '  - name: app', '    image: registry.example.com/other-app:v1', ''].join(
        '\n',
      ),
    );

    setInputs({
      'image-name': 'registry.example.com/my-app',
      'image-digest': 'a'.repeat(64),
      'version-tag': 'v2',
      'yaml-files': manifestPath,
    });

    await run();

    expect(mockedCore.setFailed).toHaveBeenCalledWith(
      expect.stringContaining("No containers using image 'registry.example.com/my-app'"),
    );
    expect(mockedCore.setOutput).not.toHaveBeenCalled();
  });

  it('fails when a yaml file does not exist', async () => {
    setInputs({
      'image-name': 'registry.example.com/my-app',
      'image-digest': 'a'.repeat(64),
      'version-tag': 'v2',
      'yaml-files': path.join(tmpDir, 'missing.yaml'),
    });

    await run();

    expect(mockedCore.setFailed).toHaveBeenCalledWith(
      expect.stringContaining('YAML file not found'),
    );
  });

  it('fails when the image digest is invalid', async () => {
    const manifestPath = writeManifest(
      'deployment.yaml',
      ['containers:', '  - name: app', '    image: registry.example.com/my-app:v1', ''].join(
        '\n',
      ),
    );

    setInputs({
      'image-name': 'registry.example.com/my-app',
      'image-digest': 'not-a-digest',
      'version-tag': 'v2',
      'yaml-files': manifestPath,
    });

    await run();

    expect(mockedCore.setFailed).toHaveBeenCalledWith(
      expect.stringContaining('image-digest does not look like a sha256 digest'),
    );
  });

  it('fails when no yaml files are provided', async () => {
    setInputs({
      'image-name': 'registry.example.com/my-app',
      'image-digest': 'a'.repeat(64),
      'version-tag': 'v2',
      'yaml-files': '   ',
    });

    await run();

    expect(mockedCore.setFailed).toHaveBeenCalledWith(
      expect.stringContaining('No YAML files provided'),
    );
  });
});
