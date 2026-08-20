# Project rules

## Skills

- Before making any code change (writing, adding, refactoring, fixing), invoke the `ponytail` skill first. It enforces the simplest, most minimal solution (YAGNI, stdlib/native-first, shortest diff) before any implementation work begins.
- After making any code change, run the `code-review` skill on the diff before considering the task done.
- For any change touching security-sensitive surfaces (auth, input handling, dependencies, data storage/transmission), also invoke the `owasp-security` skill.

## Backlog workflow

- Every backlog item (GitHub Issue) is worked on its own branch and PR — never commit fixes directly to master.
- Workflow: create a branch and PR for the issue → run the `code-review` skill on the diff → resolve findings and push updates, repeating code review until the PR is clean and `mergeable`/`mergeStateStatus: CLEAN` (babysit the PR through this loop) → do a final confirmation pass → merge the PR into master.
- Do not merge a PR with unresolved review findings or a non-clean merge status.
