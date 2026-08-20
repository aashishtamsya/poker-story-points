# Project rules

## Skills

- Before making any code change (writing, adding, refactoring, fixing), invoke the `ponytail` skill first. It enforces the simplest, most minimal solution (YAGNI, stdlib/native-first, shortest diff) before any implementation work begins.
- After making any code change, run the `code-review` skill on the diff before considering the task done.
- For any change touching security-sensitive surfaces (auth, input handling, dependencies, data storage/transmission), also invoke the `owasp-security` skill.
