# Memory Flush Triggers

Auto-save session state to `.claude/memory/` at these moments.

## Before Session End
- Summarize work done in this session
- Write to `.claude/memory/today.md` (overwrite daily)
- Include: files modified, features completed, bugs found, decisions made
- List unfinished work and suggested next-session priorities

## After Feature Completion
- Update `.claude/memory/projects.md` feature status table
- Move feature from planned/in-progress to complete
- Note any follow-up work needed

## On Bug Discovery
- Log to `.claude/memory/today.md` under "Bugs Found"
- Include: file path, reproduction steps, severity, whether it was fixed

## On Architecture Decision
- Log to `.claude/memory/today.md` under "Decisions Made"
- Include: what was decided, why, what alternatives were considered
- If the decision changes a pattern in `.claude/rules/behaviors.md`, update that file too

## On User Preference Discovery
- Save to the existing memory system at `.ccs/instances/personal/projects/.../memory/`
- Follow existing format: create a `feedback_*.md` or `user_*.md` file
- Update `MEMORY.md` index

## On Task State Change
- Update `.claude/memory/active-tasks.json` when:
  - A new task is started (add entry with status `in_progress`)
  - A task is completed (update status to `done`, set `updatedAt`)
  - A task is blocked (update status to `blocked`, note blocker)
