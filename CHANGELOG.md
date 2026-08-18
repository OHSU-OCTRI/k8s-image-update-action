# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- Initial version of the image update action
- Added README.md with usage instructions

### Changed

- Convert Jest config to TypeScript
- Convert package to ESM-only to prepare for upgrade to `@actions/core` 3.0
- Limit distribution file check to non-Dependabot branches
- Refine events that trigger tests to run

### Dependency Updates

- Bump `@actions/core` from 1.10.1 to 2.0.3
- Bump `@actions/core` from 2.0.3 to 3.0.1
