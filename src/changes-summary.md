# Changes Made to Use Markdown as Source of Truth

## Backend Changes

1. Removed TaskInfo storage in AppState
2. Added ContentComparison for task content-based comparisons
3. Updated API to use content-based task identification
4. Removed task registration/storage endpoints
5. Rankings now derived from comparison content

## Frontend Changes

1. Removed registeredTasks state
2. Removed all task synchronization code
3. API client now sends task content directly
4. Task ID generation now just for UI purposes
5. Simplified App.tsx to use markdown as source of truth

## Benefits

1. No more 'ghost' tasks in rankings
2. Tasks only exist in markdown
3. UI shows only what's in the markdown
4. Simple mental model - what you see is what you get

