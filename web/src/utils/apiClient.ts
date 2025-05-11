import axios from 'axios';
import type { Task, Comparison } from './markdownUtils';

// Define API base URL
const API_BASE_URL = 'https://web-production-fa895.up.railway.app'; // Always use Railway URL

// API client instance
const apiClient = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Interface for ranked tasks from the backend
export interface RankedTask extends Task {
  score: number;
  rank: number;
}

// API endpoints for tasks
export const tasksApi = {
  // Get all tasks
  getAllTasks: async (): Promise<Task[]> => {
    try {
      const response = await apiClient.get('/tasks');
      return response.data.tasks.map((task: any) => ({
        id: `task-${task.id}`,
        content: task.content,
        completed: task.completed,
        line: task.line
      }));
    } catch (error) {
      console.error('Error fetching tasks:', error);
      throw error;
    }
  },

  // Add a new task
  addTask: async (task: Omit<Task, 'id'>): Promise<Task> => {
    try {
      const response = await apiClient.post('/tasks', {
        content: task.content,
        completed: task.completed,
        line: task.line,
        file: 'default.md',
      });
      return {
        id: `task-${response.data.id}`,
        content: response.data.content,
        completed: response.data.completed,
        line: response.data.line
      };
    } catch (error) {
      console.error('Error adding task:', error);
      throw error;
    }
  },
};

// API endpoints for comparisons
export const comparisonsApi = {
  // Get all comparisons
  getAllComparisons: async (): Promise<Comparison[]> => {
    try {
      const response = await apiClient.get('/comparisons');
      return response.data.comparisons.map((comp: any) => ({
        id: comp.id || generateId(),
        taskA: { id: `task-${comp.task_a_id}`, content: '', completed: false, line: 0 },
        taskB: { id: `task-${comp.task_b_id}`, content: '', completed: false, line: 0 },
        winner: { id: `task-${comp.winner_id}`, content: '', completed: false, line: 0 },
        timestamp: new Date(comp.timestamp)
      }));
    } catch (error) {
      console.error('Error fetching comparisons:', error);
      throw error;
    }
  },

  // Add a new comparison
  addComparison: async (comparison: Omit<Comparison, 'id' | 'timestamp'>): Promise<Comparison> => {
    try {
      // Extract numeric IDs from the task IDs (remove "task-" prefix)
      const taskAId = parseInt(comparison.taskA.id.replace('task-', ''));
      const taskBId = parseInt(comparison.taskB.id.replace('task-', ''));
      const winnerId = parseInt(comparison.winner.id.replace('task-', ''));

      // Make sure we have valid numeric IDs
      if (isNaN(taskAId) || isNaN(taskBId) || isNaN(winnerId)) {
        throw new Error('Invalid task IDs - could not parse numeric IDs');
      }
      
      // Make sure winner is one of the tasks being compared
      if (winnerId !== taskAId && winnerId !== taskBId) {
        throw new Error(`Winner ID (${winnerId}) must be either task A (${taskAId}) or task B (${taskBId})`);
      }

      // Ensure task IDs are positive numbers
      if (taskAId <= 0 || taskBId <= 0 || winnerId <= 0) {
        throw new Error('Task IDs must be positive numbers');
      }

      console.log('Sending comparison to API:', {
        task_a_id: taskAId,
        task_b_id: taskBId,
        winner_id: winnerId
      });

      // Send the comparison to the API
      try {
        await apiClient.post('/comparisons', {
          task_a_id: taskAId,
          task_b_id: taskBId,
          winner_id: winnerId
        });
      } catch (err: any) {
        // Log more details about the error response
        if (err.response) {
          console.error('API error response:', {
            status: err.response.status,
            statusText: err.response.statusText,
            data: err.response.data
          });
        }
        throw err;
      }

      return {
        id: generateId(),
        taskA: comparison.taskA,
        taskB: comparison.taskB,
        winner: comparison.winner,
        timestamp: new Date()
      };
    } catch (error) {
      console.error('Error adding comparison:', error);
      throw error;
    }
  },
};

// API endpoint for rankings
export const rankingsApi = {
  // Get task rankings
  getRankings: async (): Promise<RankedTask[]> => {
    console.log('rankingsApi.getRankings: Fetching rankings from API');
    try {
      const response = await apiClient.get('/rankings');
      console.log('Rankings API response:', response.data);
      
      if (!response.data.rankings || !Array.isArray(response.data.rankings)) {
        console.error('Invalid rankings format:', response.data);
        return [];
      }
      
      const rankings = response.data.rankings.map((task: any) => {
        // Make sure we have a numeric ID from the backend
        const taskId = typeof task.id === 'number' ? task.id : parseInt(task.id);
        if (isNaN(taskId)) {
          console.error('Invalid task ID in rankings:', task.id);
        }
        
        return {
          id: `task-${taskId}`, // Ensure consistent ID format
          content: task.content || '',
          completed: !!task.completed,
          line: typeof task.line === 'number' ? task.line : 0,
          score: typeof task.score === 'number' ? task.score : 0,
          rank: typeof task.rank === 'number' ? task.rank : 0
        };
      });
      
      console.log(`rankingsApi.getRankings: Processed ${rankings.length} ranked tasks`);
      console.log('Task IDs after processing:', rankings.map(t => t.id));
      return rankings;
    } catch (error) {
      console.error('Error fetching rankings:', error);
      
      // Log more details if it's an API error
      if (error.response) {
        console.error('API error response:', {
          status: error.response.status,
          statusText: error.response.statusText,
          data: error.response.data
        });
      }
      
      throw error;
    }
  },
};

// Health check endpoint
export const healthCheck = async (): Promise<boolean> => {
  try {
    const response = await apiClient.get('/health');
    return response.status === 200;
  } catch (error) {
    console.error('API health check failed:', error);
    return false;
  }
};

// Helper function to generate a unique ID
const generateId = (): string => {
  return Math.random().toString(36).substring(2, 15) + 
    Math.random().toString(36).substring(2, 15);
}; 