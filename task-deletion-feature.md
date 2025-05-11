# Task Deletion Feature Implementation

## Backend Changes

1. Added a new '/tasks' endpoint with GET and DELETE methods
2. Implemented 'get_tasks' to retrieve all unique task contents from comparisons
3. Implemented 'delete_task' to remove tasks and their related comparisons

## Frontend Changes

1. Added 'tasksApi' with 'getAllTasks' and 'deleteTask' methods
2. Added task deletion detection in App.tsx using a comparison of current and previous tasks
3. Implemented automatic deletion of removed tasks from the backend
4. Added refreshing of rankings after task deletion

## How It Works

1. The app tracks the list of task contents in a 'previousTasks' state
2. When tasks are edited in the markdown, it compares the current task list with the previous one
3. If any tasks are missing from the current list (deleted), they are removed from the backend
4. All comparisons containing the deleted tasks are also removed
5. The rankings are refreshed to reflect the changes

This ensures that the markdown remains the single source of truth - when tasks are removed from the markdown, they are also removed from the backend data.

