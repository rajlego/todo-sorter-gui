import axios from 'axios';
import type { Task, Comparison } from './markdownUtils';

// Define API base URL
const API_BASE_URL = process.env.NODE_ENV === 'production' 
  ? 'https://todo-sorter-backend.up.railway.app' // Replace with your Railway URL when deployed
  : 'http://localhost:3000';

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

      const response = await apiClient.post('/comparisons', {
        task_a_id: taskAId,
        task_b_id: taskBId,
        winner_id: winnerId
      });

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
    try {
      const response = await apiClient.get('/rankings');
      return response.data.rankings.map((task: any) => ({
        id: `task-${task.id}`,
        content: task.content,
        completed: task.completed,
        line: task.line,
        score: task.score,
        rank: task.rank
      }));
    } catch (error) {
      console.error('Error fetching rankings:', error);
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