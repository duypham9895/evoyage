---
name: session-end
description: Auto wrap-up at end of session — summarize work, update memory, suggest next priorities
trigger: User says "done", "wrap up", "end session", or session is ending
---

# Session End Wrap-Up

## Steps

1. **Gather session activity**
   - List all files modified in this session (use `git diff --name-only` against session start)
   - List all features completed or partially completed
   - List any bugs found or fixed
   - List any architecture decisions made

2. **Update `.claude/memory/today.md`**
   - Replace `{DATE}` with today's date
   - Fill in Goals, Completed, Decisions Made, Bugs Found, Blockers, Next Steps
   - Be specific: include file paths, function names, issue descriptions

3. **Update `.claude/memory/projects.md`**
   - If a feature status changed, update the table
   - If new tech debt was identified, add to Tech Debt section
   - If a new issue was found, add to Known Issues section

4. **Update `.claude/memory/active-tasks.json`**
   - Mark completed tasks as `done`
   - Add any new tasks discovered during the session
   - Update `updatedAt` timestamps

5. **Generate summary for user**
   - Brief list of what was accomplished
   - Any unfinished work with current state
   - Suggested priorities for next session
   - Any blockers that need user (PM) input

## Output Format

```
Session Summary — {DATE}

Completed:
- {concise list}

In Progress:
- {item}: {current state}

Next Session:
- {priority 1}
- {priority 2}

Needs PM Input:
- {question or decision needed}
```
