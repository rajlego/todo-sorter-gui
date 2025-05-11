export interface Task {
  id: string;
  content: string;
  completed: boolean;
  line: number; // Line number in the markdown file
}

export interface Comparison {
  id: string;
  taskA: Task;
  taskB: Task;
  winner: Task;
  timestamp: Date;
}

/**
 * Extract tasks from markdown content
 * @param markdown Markdown content
 * @returns Array of Task objects
 */
export const extractTasks = (markdown: string): Task[] => {
  const tasks: Task[] = [];
  const lines = markdown.split('\n');
  
  lines.forEach((line, index) => {
    // Match Markdown task syntax: - [ ] Task description or - [x] Task description
    const taskMatch = line.match(/^-\s\[([ x])\]\s(.+)$/);
    if (taskMatch) {
      tasks.push({
        id: `task-${index}`,
        content: taskMatch[2],
        completed: taskMatch[1] === 'x',
        line: index
      });
    }
  });
  
  return tasks;
};

/**
 * Format comparisons data as CSV
 * @param comparisons Array of comparison objects
 * @returns CSV formatted string
 */
export const comparisonsToCSV = (comparisons: Comparison[]): string => {
  if (comparisons.length === 0) return '';
  
  const headers = ['Date', 'Task A', 'Task B', 'Winner'];
  const csvContent = [
    headers.join(','),
    ...comparisons.map(c => [
      new Date(c.timestamp).toISOString(),
      `"${c.taskA.content.replace(/"/g, '""')}"`,
      `"${c.taskB.content.replace(/"/g, '""')}"`,
      `"${c.winner.content.replace(/"/g, '""')}"`
    ].join(','))
  ].join('\n');
  
  return csvContent;
};

/**
 * Convert comparisons data to JSON
 * @param comparisons Array of comparison objects
 * @returns JSON string
 */
export const comparisonsToJSON = (comparisons: Comparison[]): string => {
  return JSON.stringify(comparisons, null, 2);
};

/**
 * Generate a unique ID
 * @returns String ID
 */
export const generateId = (): string => {
  return Math.random().toString(36).substring(2, 15) + 
    Math.random().toString(36).substring(2, 15);
}; 