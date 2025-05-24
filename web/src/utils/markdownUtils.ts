export interface Task {
  id: string;
  content: string;
  completed: boolean;
  line: number; // Line number in the markdown file
  rank?: number; // Optional rank from backend
  score?: number; // Optional score from backend
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
 * Format: Supports both plain text lines and markdown list items (- content)
 * Completed tasks can use - [x] content or - ✓ content
 * @param markdown Markdown content
 * @returns Array of Task objects
 */
export const extractTasks = (markdown: string): Task[] => {
  console.log('Extracting tasks from markdown...');
  const tasks: Task[] = [];
  const lines = markdown.split('\n');
  
  lines.forEach((line, index) => {
    // Skip empty lines and comments (lines starting with #)
    const trimmedLine = line.trim();
    if (!trimmedLine || trimmedLine.startsWith('#')) {
      return;
    }
    
    let content = '';
    let completed = false;
    
    // Check for markdown list items with completion markers first
    if (trimmedLine.match(/^-\s+\[x\]\s+(.+)$/)) {
      // - [x] completed task
      const match = trimmedLine.match(/^-\s+\[x\]\s+(.+)$/);
      completed = true;
      content = match![1];
    } else if (trimmedLine.match(/^-\s+\[\s\]\s+(.+)$/)) {
      // - [ ] incomplete task
      const match = trimmedLine.match(/^-\s+\[\s\]\s+(.+)$/);
      completed = false;
      content = match![1];
    } else if (trimmedLine.match(/^-\s+✓\s+(.+)$/)) {
      // - ✓ completed task
      const match = trimmedLine.match(/^-\s+✓\s+(.+)$/);
      completed = true;
      content = match![1];
    } else if (trimmedLine.match(/^-\s+(.+)$/)) {
      // - regular markdown list task
      const match = trimmedLine.match(/^-\s+(.+)$/);
      completed = false;
      content = match![1];
    } else if (trimmedLine.match(/^✓\s+(.+)$/)) {
      // ✓ completed task (without -)
      const match = trimmedLine.match(/^✓\s+(.+)$/);
      completed = true;
      content = match![1];
    } else if (trimmedLine.match(/^\[x\]\s+(.+)$/)) {
      // [x] completed task (without -)
      const match = trimmedLine.match(/^\[x\]\s+(.+)$/);
      completed = true;
      content = match![1];
    } else if (trimmedLine.match(/^\[\s\]\s+(.+)$/)) {
      // [ ] incomplete task (without -)
      const match = trimmedLine.match(/^\[\s\]\s+(.+)$/);
      completed = false;
      content = match![1];
    } else {
      // Plain text line - treat as task
      content = trimmedLine;
      completed = false;
    }
    
    // Skip if content is empty after processing
    if (!content) {
      return;
    }
    
    // Check if this task already has ranking info and strip it for the task content
    const rankingMatch = content.match(/^(.+?)\s+\|\s+Rank:\s+(\d+)\s+\|\s+Score:\s+([-\d.]+)$/);
    if (rankingMatch) {
      // Strip ranking info from content and store rank/score
      content = rankingMatch[1];
      console.log(`Found task with ranking info: "${content}" (Rank: ${rankingMatch[2]}, Score: ${rankingMatch[3]})`);
    }
    
    const taskId = `task-${index + 1}`; // Using 1-based index for task IDs to match backend
    tasks.push({
      id: taskId,
      content: content,
      completed: completed,
      line: index
    });
    console.log(`Extracted task: id=${taskId}, line=${index}, content="${content}", completed=${completed}`);
  });
  
  console.log(`Total tasks extracted: ${tasks.length}`);
  return tasks;
};

/**
 * Sort markdown content by rankings (auto-sort after comparisons)
 * @param markdown Original markdown content
 * @param rankedTasks Array of ranked tasks with scores
 * @returns Sorted markdown content
 */
export const sortMarkdownByRankings = (markdown: string, rankedTasks: any[]): string => {
  console.log('Auto-sorting markdown by rankings...');
  
  const lines = markdown.split('\n');
  const taskLines: { line: string, rank: number, score: number, completed: boolean, wasListItem: boolean }[] = [];
  const nonTaskLines: { line: string, index: number }[] = [];
  
  // Separate task lines from non-task lines (comments, empty lines)
  lines.forEach((line, index) => {
    const trimmedLine = line.trim();
    if (!trimmedLine || trimmedLine.startsWith('#')) {
      nonTaskLines.push({ line, index });
      return;
    }
    
    let content = '';
    let completed = false;
    let wasListItem = false;
    
    // Extract content from various formats
    if (trimmedLine.match(/^-\s+\[x\]\s+(.+)$/)) {
      const match = trimmedLine.match(/^-\s+\[x\]\s+(.+)$/);
      completed = true;
      content = match![1];
      wasListItem = true;
    } else if (trimmedLine.match(/^-\s+\[\s\]\s+(.+)$/)) {
      const match = trimmedLine.match(/^-\s+\[\s\]\s+(.+)$/);
      completed = false;
      content = match![1];
      wasListItem = true;
    } else if (trimmedLine.match(/^-\s+✓\s+(.+)$/)) {
      const match = trimmedLine.match(/^-\s+✓\s+(.+)$/);
      completed = true;
      content = match![1];
      wasListItem = true;
    } else if (trimmedLine.match(/^-\s+(.+)$/)) {
      const match = trimmedLine.match(/^-\s+(.+)$/);
      completed = false;
      content = match![1];
      wasListItem = true;
    } else if (trimmedLine.match(/^✓\s+(.+)$/)) {
      const match = trimmedLine.match(/^✓\s+(.+)$/);
      completed = true;
      content = match![1];
      wasListItem = false;
    } else if (trimmedLine.match(/^\[x\]\s+(.+)$/)) {
      const match = trimmedLine.match(/^\[x\]\s+(.+)$/);
      completed = true;
      content = match![1];
      wasListItem = false;
    } else if (trimmedLine.match(/^\[\s\]\s+(.+)$/)) {
      const match = trimmedLine.match(/^\[\s\]\s+(.+)$/);
      completed = false;
      content = match![1];
      wasListItem = false;
    } else {
      // Plain text line
      content = trimmedLine;
      completed = false;
      wasListItem = false;
    }
    
    // Skip if this looks like a non-task line
    if (!content) {
      nonTaskLines.push({ line, index });
      return;
    }
    
    // Strip existing ranking info
    const rankingMatch = content.match(/^(.+?)\s+\|\s+Rank:\s+\d+\s+\|\s+Score:\s+[-\d.]+$/);
    if (rankingMatch) {
      content = rankingMatch[1];
    }
    
    // Find ranking data for this task
    const rankData = rankedTasks.find(task => task.content === content);
    const rank = rankData ? rankData.rank : 999;
    const score = rankData ? rankData.score : 0;
    
    taskLines.push({ line: content, rank, score, completed, wasListItem });
  });
  
  // Sort task lines by rank (lower rank = higher priority)
  taskLines.sort((a, b) => {
    // Completed tasks go to bottom
    if (a.completed && !b.completed) return 1;
    if (!a.completed && b.completed) return -1;
    // Within same completion status, sort by rank
    return a.rank - b.rank;
  });
  
  // Rebuild markdown with sorted tasks
  const sortedLines: string[] = [];
  
  // Add header comments at the top
  nonTaskLines
    .filter(item => item.index < 3) // Keep initial comments
    .forEach(item => sortedLines.push(item.line));
  
  // Add sorted tasks - convert all to list format for consistency
  taskLines.forEach(({ line, rank, score, completed }) => {
    let prefix = '- ';
    if (completed) {
      prefix = '- [x] ';
    }
    
    let taskLine = `${prefix}${line}`;
    if (rank !== 999 && score !== 0) {
      taskLine += ` | Rank: ${rank} | Score: ${score.toFixed(2)}`;
    }
    
    sortedLines.push(taskLine);
  });
  
  // Add any trailing comments
  nonTaskLines
    .filter(item => item.index >= lines.length - 2) // Keep trailing comments
    .forEach(item => sortedLines.push(item.line));
  
  const result = sortedLines.join('\n');
  console.log('Auto-sorting completed');
  return result;
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

/**
 * Remove duplicate comparisons based on task content
 * @param comparisons Array of comparison objects
 * @returns Deduplicated array of comparisons
 */
export const deduplicateComparisons = (comparisons: Comparison[]): Comparison[] => {
  const seen = new Set<string>();
  const deduplicated: Comparison[] = [];
  
  comparisons.forEach(comparison => {
    // Create a normalized key for the comparison (task contents sorted)
    const contents = [comparison.taskA.content, comparison.taskB.content].sort();
    const key = `${contents[0]}|||${contents[1]}|||${comparison.winner.content}|||${comparison.timestamp.toISOString()}`;
    
    if (!seen.has(key)) {
      seen.add(key);
      deduplicated.push(comparison);
    }
  });
  
  console.log(`Deduplication: ${comparisons.length} -> ${deduplicated.length} comparisons (removed ${comparisons.length - deduplicated.length} duplicates)`);
  return deduplicated;
}; 