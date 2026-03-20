# /status — Project Status Dashboard

Show current eVoyage project status by reading memory files and git history.

## Steps

### 1. Project Status
- Read `.claude/memory/projects.md`
- Display the feature status table
- Highlight any features marked as in-progress

### 2. Today's Session
- Read `.claude/memory/today.md`
- Show goals, completed items, and blockers
- If file has only template placeholders, note "No session data recorded today"

### 3. Active Tasks
- Read `.claude/memory/active-tasks.json`
- List tasks by status: in_progress first, then todo, then blocked
- Show count: `{N} active, {M} blocked, {K} done`

### 4. Recent Git Activity
```bash
git log --oneline -10
```
Show last 10 commits with short hashes.

### 5. Goals
- Read `.claude/memory/goals.md`
- Show weekly and monthly goals if filled in

### 6. Codebase Health (quick)
- Count total `.ts`/`.tsx` files in `src/`
- Count total test files (`*.test.*`)
- Show largest components by line count (top 5)

## Output Format

```
eVoyage Status Dashboard
=========================

Features:
{table from projects.md}

Active Tasks: {N} active, {M} blocked
{task list}

Recent Commits:
{last 10 commits}

Today:
{session summary or "No data"}

Goals:
{weekly goals}

Codebase:
- {N} source files, {M} test files
- Largest: {file} ({lines} lines)
```
