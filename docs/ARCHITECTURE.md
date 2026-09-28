# DSH Toolchain Architecture

This repository is an **environment adapter**, not an Agent product. It owns
only reproducible runtime assembly, validation and packaging for DSH Office.
It does not start a model, a UI, an MCP server, a scheduler or a background
process.

## Borrowed engineering shape, not borrowed product code

The design follows the useful parts of ZCode's public build discipline: one
version-pinned root declaration, explicit prepare/verify/package stages, and
separate optional runtime assets. It deliberately excludes ZCode's Agent,
desktop, web and provider layers.

```
toolchain.lock.json  ->  prepare:runtime  ->  runtime/<platform>
        |                         |                  |
        |                         v                  v
        +------------------> hash checks      verify:runtime
                                                   |
                                                   v
                                             pack:runtime (.tgz)
                                                   |
                                                   v
                                      DSH Office resolves paths only
```

`toolchain.lock.json` is the single source of truth for versions, download
URLs, SHA-256 values, runtime layout, executable probes and Python wheels.
`scripts/fetch-runtime.ps1` is the Windows extractor; it must consume this
lock rather than carry independent pins. `scripts/verify-runtime.mjs` is the
strict acceptance gate. `scripts/pack-runtime.mjs` creates the separate,
offline runtime package.

## Extension model

Adding a Java-backed (or other) DSH module is a profile change, not a rewrite:

1. declare a component and its ownership in `toolchain.lock.json`;
2. decide whether it is bundled or host-owned;
3. add its safe executable probe to the verifier;
4. add contract tests and update `docs/CONTRACT.md`.

Components marked `required: false` are reported as available or unavailable
but never block the existing Office path. Java is intentionally in this state
today. A future bundled Java profile must use a new explicit artifact pin and
must not silently use or modify a system JDK.
