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
    const rankingMatch = content.match(/^(.+?)\s+\|\s+Rank:\s+\d+\s+\|\s+Score:\s+[-\d.]+.*$/);
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
 * @param rankedTasks Array of ranked tasks with scores and ASAP statistics
 * @returns Sorted markdown content
 */
export const sortMarkdownByRankings = (markdown: string, rankedTasks: any[]): string => {
  console.log('Auto-sorting markdown by rankings...');
  
  const lines = markdown.split('\n');
  const taskLines: { line: string, rank: number, score: number, completed: boolean, originalFormat: string, originalPrefix: string }[] = [];
  const nonTaskLines: { line: string, index: number }[] = [];
  
  // Create a map of task content to full ranking data with ASAP statistics
  const contentRankMap = new Map();
  rankedTasks.forEach(task => {
    contentRankMap.set(task.content, {
      score: task.score,
      rank: task.rank,
      variance: task.variance || 0,
      confidence_interval: task.confidence_interval || [0, 0],
      comparisons_count: task.comparisons_count || 0
    });
  });
  
  // Separate task lines from non-task lines (comments, empty lines)
  lines.forEach((line, index) => {
    const trimmedLine = line.trim();
    
    // Skip empty lines and comments - they'll stay in place
    if (!trimmedLine || trimmedLine.startsWith('#')) {
      nonTaskLines.push({ line, index });
      return;
    }
    
    let content = trimmedLine;
    let completed = false;
    let originalPrefix = '';
    let originalFormat = 'plain'; // 'plain', 'dash', 'checkbox_empty', 'checkbox_checked', 'checkmark'
    
    // Detect and preserve original format
    if (trimmedLine.startsWith('- ')) {
      originalFormat = 'dash';
      originalPrefix = '- ';
      content = trimmedLine.substring(2).trim();
    } else if (trimmedLine.startsWith('✓ ')) {
      originalFormat = 'checkmark';
      originalPrefix = '✓ ';
      completed = true;
      content = trimmedLine.substring(2).trim();
    } else if (trimmedLine.startsWith('- ✓ ')) {
      originalFormat = 'dash_checkmark';
      originalPrefix = '- ✓ ';
      completed = true;
      content = trimmedLine.substring(4).trim();
    } else if (trimmedLine.startsWith('[x] ')) {
      originalFormat = 'checkbox_checked';
      originalPrefix = '[x] ';
      completed = true;
      content = trimmedLine.substring(4).trim();
    } else if (trimmedLine.startsWith('- [x] ')) {
      originalFormat = 'dash_checkbox_checked';
      originalPrefix = '- [x] ';
      completed = true;
      content = trimmedLine.substring(6).trim();
    } else if (trimmedLine.startsWith('[ ] ')) {
      originalFormat = 'checkbox_empty';
      originalPrefix = '[ ] ';
      content = trimmedLine.substring(4).trim();
    } else if (trimmedLine.startsWith('- [ ] ')) {
      originalFormat = 'dash_checkbox_empty';
      originalPrefix = '- [ ] ';
      content = trimmedLine.substring(6).trim();
    }
    
    // Remove existing ranking info if present (updated regex to match new format)
    const rankingMatch = content.match(/^(.+?)\s+\|\s+Rank:\s+\d+\s+\|\s+Score:\s+[-\d.]+.*$/);
    if (rankingMatch) {
      content = rankingMatch[1];
    }
    
    const rankData = contentRankMap.get(content);
    
    if (rankData) {
      taskLines.push({
        line,
        rank: rankData.rank,
        score: rankData.score,
        completed,
        originalFormat,
        originalPrefix
      });
    } else {
      // This is a line that looks like a task but doesn't have ranking data
      nonTaskLines.push({ line, index });
    }
  });
  
  // Sort task lines by rank, with completed tasks at the bottom
  taskLines.sort((a, b) => {
    if (a.completed && !b.completed) return 1;
    if (!a.completed && b.completed) return -1;
    return a.rank - b.rank;
  });
  
  // Rebuild the markdown content
  const rebuiltLines: string[] = [];
  
  // Add non-task lines at the top (comments, headers, etc.)
  const topNonTaskLines = nonTaskLines.filter(item => item.index < taskLines.length);
  topNonTaskLines.forEach(item => {
    rebuiltLines.push(item.line);
  });
  
  // Add sorted task lines with enhanced ASAP statistics
  taskLines.forEach(taskInfo => {
    const rankData = contentRankMap.get(taskInfo.line.replace(taskInfo.originalPrefix, '').split(' |')[0].trim());
    
    if (rankData) {
      // Enhanced ranking info with ASAP statistics
      const confidence = rankData.confidence_interval;
      const confidenceRange = `[${confidence[0].toFixed(2)}, ${confidence[1].toFixed(2)}]`;
      
      // Create detailed ASAP info
      const detailedStats = [
        `Rank: ${rankData.rank}`,
        `Score: ${rankData.score.toFixed(2)}`,
        `Variance: ${rankData.variance.toFixed(3)}`,
        `CI: ${confidenceRange}`,
        `Comps: ${rankData.comparisons_count}`
      ].join(' | ');
      
      // Get the base content without existing ranking info
      let baseContent = taskInfo.line;
      const existingRankMatch = baseContent.match(/^(.+?)\s+\|\s+Rank:/);
      if (existingRankMatch) {
        baseContent = existingRankMatch[1];
      }
      
      const enhancedLine = `${baseContent} | ${detailedStats}`;
      rebuiltLines.push(enhancedLine);
    } else {
      rebuiltLines.push(taskInfo.line);
    }
  });
  
  // Add remaining non-task lines at the bottom
  const bottomNonTaskLines = nonTaskLines.filter(item => item.index >= taskLines.length);
  bottomNonTaskLines.forEach(item => {
    rebuiltLines.push(item.line);
  });
  
  return rebuiltLines.join('\n');
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