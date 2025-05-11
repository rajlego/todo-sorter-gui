-- Create tasks table
CREATE TABLE IF NOT EXISTS tasks (
    id UUID PRIMARY KEY,
    content TEXT NOT NULL,
    completed BOOLEAN NOT NULL DEFAULT false,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Create comparisons table
CREATE TABLE IF NOT EXISTS comparisons (
    id UUID PRIMARY KEY,
    task_a_id UUID NOT NULL REFERENCES tasks(id),
    task_b_id UUID NOT NULL REFERENCES tasks(id),
    winner_id UUID NOT NULL REFERENCES tasks(id),
    timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT winner_is_task_a_or_b CHECK (winner_id = task_a_id OR winner_id = task_b_id)
); 