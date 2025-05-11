-- Create extension for UUID generation
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- Users table
CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  username TEXT UNIQUE NOT NULL,
  email TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Markdown files table
CREATE TABLE IF NOT EXISTS markdown_files (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  content TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  last_accessed TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Tasks extracted from markdown files
CREATE TABLE IF NOT EXISTS tasks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  file_id UUID NOT NULL REFERENCES markdown_files(id) ON DELETE CASCADE,
  content TEXT NOT NULL,
  completed BOOLEAN NOT NULL DEFAULT FALSE,
  line_number INTEGER NOT NULL,
  rank FLOAT,
  score FLOAT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Task comparisons
CREATE TABLE IF NOT EXISTS comparisons (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  file_id UUID NOT NULL REFERENCES markdown_files(id) ON DELETE CASCADE,
  task_a_id UUID NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  task_b_id UUID NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  winner_id UUID NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Table for file version history
CREATE TABLE IF NOT EXISTS file_versions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  file_id UUID NOT NULL REFERENCES markdown_files(id) ON DELETE CASCADE,
  content TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  created_by UUID NOT NULL REFERENCES users(id)
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_markdown_files_user_id ON markdown_files(user_id);
CREATE INDEX IF NOT EXISTS idx_tasks_file_id ON tasks(file_id);
CREATE INDEX IF NOT EXISTS idx_comparisons_file_id ON comparisons(file_id);
CREATE INDEX IF NOT EXISTS idx_file_versions_file_id ON file_versions(file_id); 