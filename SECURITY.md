# Security Policy

## Supported version

Security fixes are provided for the latest published version.

## Report a vulnerability

Do not publish vulnerability details in a GitHub issue. Open a private
[GitHub Security Advisory](https://github.com/witqq/agentic-report/security/advisories/new).

Include the affected version, reproduction conditions, expected impact, and the smallest safe source that shows
the problem. Remove credentials, personal information, and unrelated logs before attaching evidence.

## Trust boundary

- The compiler reads only files inside the source root: Markdown, partials, theme files, JSON data and local
  assets. A reference that leaves the root is refused before it is read.
- Raw HTML in Markdown is not passed through; the rendered tree is sanitized against the directive registry.
- The page security policy allows only scripts whose hashes the build computed: the package runtime and the
  extension code that the author explicitly declared.
- Author code is allowed, but only through the extension API: it is declared, bundled with its hash in the
  security policy only on pages that use it, and checked with the same checks as the built-in effects. An
  island runs in a sandboxed `srcdoc` iframe with an opaque origin and its own `default-src 'none'` policy,
  without access to the page or the network; the page policy allows only the hashes of its scripts.
- Building a source or an extension you do not trust is outside the trusted-input boundary: declared extension
  code runs in the reader's browser, and an external provider runs as a local program during the build, in the
  extension directory, without a shell and with only the path, home, temporary-directory and locale
  variables of the environment; its output is sanitized like authored Markdown. A report
  should distinguish behavior of trusted `agentic-report` code from behavior of intentionally declared
  third-party code.
- `validate`, `inspect` and `inspect-review` expand the page exactly as `build` does, so they run its
  providers too: a provider is code, and checking a source is running it. Do not validate or inspect an
  untrusted source that declares providers; read its manifests first.
- An effect module is bundled by esbuild, which follows its imports wherever they resolve, including
  `node_modules` and other files outside the source root. The bundle is the author's code: whatever the
  module imports ships to the reader's browser under the page policy. The build result names the bundled
  files that lie outside the extension folder in the effect's `notes`.
