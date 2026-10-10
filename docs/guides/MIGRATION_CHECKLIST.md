# Repository migration checklist

## Goal

Move the Git repository completely to a stable location so that human developers, any AI coding tool, editors and automation can continue in the same working tree. Migration must not be tied to a particular AI vendor, client or hosting platform.

## Must keep

- `.git/`: history, branches and remotes;
- `AGENTS.md`, `CONTEXT.md`, `README.md` and `docs/`;
- all of `dist/`, including local vendor libraries;
- all of `datasets/` (dataset releases and their descriptions);
- local offline and container deployment scripts;
- the tests, build and configuration files the project actually uses.

## Optional integration files

Different tools may use their own hidden directories, project files or hosting bindings. These are adapters only and must not hold the only copy of domain knowledge or core configuration.

- To keep publishing to the current hosted instance, keep `.openai/hosting.json`;
- when switching to another host, the file can be ignored;
- editor workspaces, AI tool caches and local session history usually need not be migrated;
- important rules specific to one tool are merged into `AGENTS.md`, `CONTEXT.md` or `docs/` so they do not become an information silo.

The current optional hosting binding is:

```json
{
  "project_id": "appgprj_6ab9287b0fd48191a48589b930c96936",
  "static": {
    "directory": "dist"
  }
}
```

`project_id` is not a runtime secret, but replacing it points to a different hosted instance. Because this host publishes only `dist/`, run `node scripts/sync-datasets.mjs` before publishing.

## Need not migrate

- temporary archives produced by releases;
- browser, editor and AI session caches;
- temporary files that dependency installation, builds or tests can regenerate (including `dist/datasets/` and `dist/data/derived-interfaces/`).

Browser `localStorage` lives in the browser and site origin, not in the repository. Keeping the same hosted URL usually keeps that browser data; a new URL does not migrate it automatically.

## General steps

1. Check the current working tree:

   ```bash
   git status --short
   git log -1 --oneline
   ```

2. Commit changes that must be kept; never rely only on unrecorded tool sessions or chat history.
3. Copy or clone the whole repository, including the hidden `.git` directory.
4. Copy optional hosting bindings and local environment configuration as needed, but not caches.
5. In the new location run:

   ```bash
   git status
   git log -5 --oneline
   node --check dist/app.js
   node --test tests/*.test.mjs
   ```

6. Start the offline version and check the page, datasets, 3D geometry, ray calculation, projections and interaction.
7. Add the new directory to the chosen editor or AI coding tool; the working directory is the repository root.
8. Ask new contributors or AI tools to read `AGENTS.md` and `CONTEXT.md` in full first, then the relevant `docs/` for each task.
9. Make one small verifiable change to test editing, checks and commits.
10. If the hosted instance is kept, run one deployment check; once it succeeds, stop publishing from the old directory. Archive the old directory first rather than deleting it at once.

## Acceptance after migration

- The new environment can read and write the repository;
- different tools see the same `git status` and history;
- the offline site opens;
- the current datasets load;
- subject scale, cavities, complex structures, projections and sidebar behaviour are correct;
- the application does not depend on absolute paths in the old directory;
- if the hosted instance is kept, its URL and publishing process still work;
- project rules and domain context can be understood without the old chats.

## Working with several tools

- Any AI tool and human developer can share the repository, but do not edit the same file at the same time.
- Check `git status` before starting and never overwrite another tool's or developer's uncommitted changes.
- One feature or one explainable refactoring unit per commit.
- Geometry, physics-formula, coordinate and data-format changes are labelled explicitly in commit messages and documentation.
- Chat records, IDE indexes and tool memory are not sources of project truth; long-lived decisions are written to version-controlled documentation.
- Tool-specific instructions must not conflict with `AGENTS.md` and must not become the only way to build, test or understand the project.
