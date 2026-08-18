# Update Image Action

A GitHub Action that updates container image references (tag/digest) in Kubernetes deployment manifests. It scans one or more YAML files for containers (including `initContainers` and templates like a CronJob's `jobTemplate`) whose `image` matches a given image name, and rewrites them to a fully resolved `image@sha256:<digest>` (optionally with a `:<tag>` as well).

## Inputs

| Name | Required | Default | Description |
| --- | --- | --- | --- |
| `image-name` | Yes | | Container image name, e.g. `ghcr.io/ohsu-octri/example` |
| `image-digest` | Yes | | SHA256 digest of the image, with or without the `sha256:` prefix |
| `yaml-files` | Yes | | Kubernetes manifest files to update. Comma or newline separated list of paths. |
| `version-tag` | No | `''` | Optional version tag, e.g. `1.2.3`. If omitted, containers are pinned to the digest only. |

## Outputs

| Name | Description |
| --- | --- |
| `new-image` | The fully resolved image reference that was applied |
| `updated-count` | Number of container image references updated |

## Usage

```yaml
- name: Update image references
  id: update
  uses: ohsu-octri/k8s-image-update-action@v1
  with:
    image-name: ghcr.io/ohsu-octri/example
    image-digest: sha256:abcdef0123456789...
    yaml-files: |
      k8s/prod/deployment.yaml
      k8s/prod/cronjob.yaml
    version-tag: 1.2.3
```

This action only updates the image references in the specified manifests. A full workflow would also need to commit the change, push, and possibly create a tag. See the sample below for an example.

```yaml
name: Update Deployment Manifests

on:
  workflow_dispatch:
    inputs:
      image_name:
        description: "Container image name, e.g. ghcr.io/ohsu-octri/example"
        required: true
        type: string
      image_digest:
        description: "SHA256 digest of the image, with or without the 'sha256:' prefix"
        required: true
        type: string
      yaml_files:
        description: "Kubernetes manifest files to update. Comma or newline separated list of paths."
        required: true
        type: string
      version_tag:
        description: "Optional version tag, e.g. 1.2.3."
        required: false
        type: string

permissions:
  contents: write

jobs:
  update-manifests:
    runs-on: ubuntu-latest
    steps:
      - name: Determine default branch
        id: default_branch
        run: echo "branch=${{ github.event.repository.default_branch }}" >> "$GITHUB_OUTPUT"

      - name: Check out repository
        uses: actions/checkout@v7
        with:
          ref: ${{ steps.default_branch.outputs.branch }}
          fetch-depth: 0

      - name: Update image references
        id: update
        uses: ohsu-octri/k8s-image-update-action@v1
        with:
          image-name: ${{ inputs.image_name }}
          image-digest: ${{ inputs.image_digest }}
          yaml-files: ${{ inputs.yaml_files }}
          version-tag: ${{ inputs.version_tag }}

      - name: Check for changes
        id: git_diff
        run: |
          if git diff --quiet; then
            echo "changed=false" >> "$GITHUB_OUTPUT"
          else
            echo "changed=true" >> "$GITHUB_OUTPUT"
          fi

      - name: Commit changes
        if: steps.git_diff.outputs.changed == 'true'
        env:
          YAML_FILES: ${{ inputs.yaml_files }}
          NEW_IMAGE: ${{ steps.update.outputs.new-image }}
        run: |
          git config user.name "github-actions[bot]"
          git config user.email "github-actions[bot]@users.noreply.github.com"

          echo "$YAML_FILES" | tr ',' '\n' | while IFS= read -r file; do
            file="$(echo "$file" | xargs)"
            [ -n "$file" ] && git add "$file"
          done

          git commit -m "Update ${{ inputs.image_name }} to ${NEW_IMAGE}"

      - name: Create version tag
        if: steps.git_diff.outputs.changed == 'true' && inputs.version_tag != ''
        run: git tag "v${{ inputs.version_tag }}"

      - name: Push changes
        if: steps.git_diff.outputs.changed == 'true'
        run: |
          git push origin HEAD:${{ steps.default_branch.outputs.branch }}
          if [ -n "${{ inputs.version_tag }}" ]; then
            git push origin "v${{ inputs.version_tag }}"
          fi
```

## Notes

- The action fails if no matching `image` reference is found in the given YAML files, or if any of the files can't be found or parsed.
- Matching is based on the bare image name; any existing `:tag` and/or `@sha256:digest` suffix on that image is replaced.
