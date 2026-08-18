import * as core from '@actions/core';
import * as fs from 'fs';
import { parseAllDocuments, Document, isMap, isSeq } from 'yaml';

import { splitFileList } from './input-util';
import { normalizeDigest, buildImagePattern, updateImagesInNode } from './manifest-util';
import type { Counter } from './manifest-util';

export async function run(): Promise<void> {
  try {
    const imageName = core.getInput('image-name', { required: true }).trim();
    const rawDigest = core.getInput('image-digest', { required: true });
    const versionTag = core.getInput('version-tag').trim();
    const rawYamlFiles = core.getInput('yaml-files', { required: true });

    const digest = normalizeDigest(rawDigest);
    const newImage = versionTag
      ? `${imageName}:${versionTag}@sha256:${digest}`
      : `${imageName}@sha256:${digest}`;

    const files = splitFileList(rawYamlFiles);
    if (files.length === 0) {
      throw new Error('No YAML files provided in yaml-files input');
    }

    const pattern = buildImagePattern(imageName);
    const counter: Counter = { count: 0 };

    for (const filePath of files) {
      if (!fs.existsSync(filePath)) {
        throw new Error(`YAML file not found: ${filePath}`);
      }

      const original = fs.readFileSync(filePath, 'utf8');
      const documents = parseAllDocuments(original, { keepSourceTokens: true }) as Document[];

      for (const doc of documents) {
        if (doc.errors.length > 0) {
          throw new Error(`Failed to parse ${filePath}: ${doc.errors.join('; ')}`);
        }
        if (doc.contents) {
          updateImagesInNode(doc.contents, pattern, newImage, counter);
        }
      }

      const output = documents.map((doc) => doc.toString()).join('---\n');
      fs.writeFileSync(filePath, output);
      core.info(`Processed ${filePath}`);
    }

    if (counter.count === 0) {
      throw new Error(
        `No containers using image '${imageName}' were found in the given YAML files. ` +
          'Check the image-name input and the yaml-files list for typos.'
      );
    }

    core.info(`Updated ${counter.count} container image reference(s) to ${newImage}`);
    core.setOutput('new-image', newImage);
    core.setOutput('updated-count', String(counter.count));
  } catch (error) {
    core.setFailed(error instanceof Error ? error.message : String(error));
  }
}

if (require.main === module) {
  run();
}
