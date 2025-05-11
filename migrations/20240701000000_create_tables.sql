-- Create tasks table
CREATE TABLE IF NOT EXISTS tasks (
    id UUID PRIMARY KEY,
    content TEXT NOT NULL,
    completed BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Create comparisons table
CREATE TABLE IF NOT EXISTS comparisons (
    id UUID PRIMARY KEY,
    task_a_id UUID NOT NULL REFERENCES tasks(id),
    task_b_id UUID NOT NULL REFERENCES tasks(id),
    winner_id UUID NOT NULL REFERENCES tasks(id),
    timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_tasks_content ON tasks(content);
CREATE INDEX IF NOT EXISTS idx_comparisons_task_a_id ON comparisons(task_a_id);
CREATE INDEX IF NOT EXISTS idx_comparisons_task_b_id ON comparisons(task_b_id);
CREATE INDEX IF NOT EXISTS idx_comparisons_winner_id ON comparisons(winner_id);
CREATE INDEX IF NOT EXISTS idx_comparisons_timestamp ON comparisons(timestamp); 