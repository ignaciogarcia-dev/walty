# Contributing to Walty

Thanks for your interest in contributing to Walty.

This project follows an issue-first workflow to keep collaboration open, clear, and manageable for contributors and maintainers.

## Guiding Principles

- Keep scope small and reviewable.
- Prefer one issue and one pull request per change.
- Document decisions in issues so others can follow context.
- Prioritize predictable behavior over fast but risky merges.

## Before You Start Coding

For anything beyond tiny typo/docs fixes:

1. Open an issue (or pick an existing one).
2. Wait for scope confirmation on large feature or refactor work.
3. Comment that you are working on it to avoid duplicated effort.

Direct PRs without an issue may be closed and redirected to issue discussion first.

## Issue-First Workflow

1. Open an issue using a template:
   - `Bug report`
   - `Feature request`
   - `Contribution proposal`
2. Align on scope and acceptance criteria in the issue comments.
3. Create a branch from `main`.
4. Implement the change.
5. Open a PR and link the issue (`Closes #123`).
6. Address review feedback and update docs/tests as needed.

## Local Development

Setup and workflow details:

- [docs/getting-started.md](docs/getting-started.md)
- [docs/development.md](docs/development.md)

Common commands:

```bash
pnpm lint
pnpm build
pnpm db:migrate
pnpm db:studio
```

## Branch and Commit Conventions

Suggested branch format:

- `fix/123-short-description`
- `feat/456-short-description`
- `docs/789-short-description`

Commit messages should be clear and scoped. Example:

- `fix(send): handle invalid recipient resolution`
- `docs(readme): clarify issue-first contribution flow`

## Pull Request Requirements

Each PR should include:

- Linked issue number.
- Clear summary of what changed and why.
- Notes about validation performed (lint/build/manual checks).
- Screenshots or short video for UI changes.
- Documentation updates when behavior or workflow changed.

Keep PRs focused. Large mixed-scope PRs are harder to review and may be split before merge.

## Review and Merge Policy

- Maintainers review for behavior, safety, clarity, and scope alignment.
- Requested changes should be addressed in follow-up commits.
- PRs are merged when they meet issue scope and quality checks.

## Good First Contributions

If you are new to the project, start with:

- `good first issue` labels
- Documentation improvements
- UI polish and copy fixes
- Small bug fixes with clear reproduction steps
