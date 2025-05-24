# Todo Sorter App

A sophisticated task prioritization application that uses **pairwise comparisons** to rank tasks through an intuitive markdown-based interface. Built with React, TypeScript, and a Rust backend.

## 🎯 What This App Does

The Todo Sorter app helps users prioritize their tasks by:

1. **Writing tasks in markdown format** - No complex forms, just natural text
2. **Making pairwise comparisons** - "Which task is more important?" between two tasks
3. **Automatically calculating rankings** - Uses comparison data to generate priority scores
4. **Updating markdown with rankings** - Rankings are written back into the markdown as `| Rank: 1 | Score: 2.45`

### Key Innovation: Markdown as Source of Truth

Unlike traditional task apps, this app treats **markdown content as the single source of truth**. Tasks are extracted from markdown lines, compared pairwise, and rankings are written back into the markdown automatically.

## 🏗️ Architecture Overview

### Frontend (React + TypeScript)
```
web/
├── src/
│   ├── App.tsx                 # Main app with state management
│   ├── components/
│   │   ├── Editor.tsx          # CodeMirror markdown editor
│   │   ├── ComparisonView.tsx  # Pairwise comparison interface
│   │   ├── TaskRankings.tsx    # Priority visualization with color coding
│   │   ├── TaskSidebar.tsx     # Extracted task list display
│   │   ├── ComparisonLog.tsx   # History of all comparisons
│   │   └── IdManager.tsx       # List access control
│   ├── utils/
│   │   ├── markdownUtils.ts    # Task extraction and CSV export
│   │   └── apiClient.ts        # Backend API integration
│   └── hooks/                  # Custom React hooks
├── tailwind.config.js          # Utility-first CSS configuration
└── vite.config.ts             # Build tool configuration
```

### Backend (Rust + Axum)
```
src/
├── main.rs                     # Server setup and routing
├── models/                     # Data structures (Task, Comparison, etc.)
├── handlers/                   # API endpoint implementations
├── db/                         # Database operations
└── migrations/                 # SQL schema changes
```

## 🎨 Design Patterns & Key Concepts

### 1. Content-Based Task Identification

**Important for LLMs**: Tasks are identified by their **content text**, not by database IDs. This makes the system resilient to markdown editing.

```typescript
// Tasks are identified like this:
const task = {
  content: "Complete the project proposal",  // This is the identifier
  completed: false,
  line: 5
}

// NOT like this:
const task = {
  id: 123,  // No database IDs used for identification
  content: "Complete the project proposal"
}
```

### 2. Markdown Processing Pipeline

```
Raw Markdown → Extract Tasks → Make Comparisons → Calculate Rankings → Update Markdown
```

**Task Extraction Pattern:**
```typescript
// From markdownUtils.ts
const extractTasks = (markdown: string): Task[] => {
  // Matches lines like:
  // "First task to do"
  // "✓ Completed task" 
  // "[ ] Checkbox task"
  // "- [x] Markdown checkbox task"
}
```

### 3. State Management Architecture

**Centralized State in App.tsx:**
```typescript
// Core state variables
const [markdownContent, setMarkdownContent] = useState<string>()  // Source of truth
const [comparisons, setComparisons] = useState<Comparison[]>()    // Pairwise comparison data
const [rankedTasks, setRankedTasks] = useState<RankedTask[]>()    // Calculated priorities
const [isApiConnected, setIsApiConnected] = useState<boolean>()   // Backend connection status
```

**Data Flow:**
1. User edits markdown → `markdownContent` updates
2. Tasks extracted from markdown → Components receive `tasks` prop
3. User makes comparisons → `comparisons` array updates → API called
4. Rankings calculated → `rankedTasks` updates → Markdown updated with rankings

### 4. API Integration Pattern

**Dual Persistence Strategy:**
- **Primary**: REST API to Rust backend
- **Fallback**: Local Storage when API unavailable

```typescript
// API calls with graceful fallback
try {
  await comparisonsApi.addComparison(comparison)
  // Update state with API response
} catch (error) {
  // Fall back to localStorage
  localStorage.setItem('comparisons', JSON.stringify(comparisons))
}
```

## 🎨 UI/UX Design System

### Responsive Layout Strategy
```css
/* Desktop: 5/7 column split */
<div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
  <div className="lg:col-span-5">   <!-- Editor + Task List -->
  <div className="lg:col-span-7">   <!-- Comparison + Rankings -->
```

### Color Coding System
- **High Priority (Top 1/3)**: Emerald colors (`bg-emerald-100`, `text-emerald-800`)
- **Medium Priority (Middle 1/3)**: Amber colors (`bg-amber-100`, `text-amber-800`) 
- **Low Priority (Bottom 1/3)**: Red colors (`bg-red-100`, `text-red-800`)

### Dark Mode Implementation
- **System preference detection**: `darkMode: 'media'` in Tailwind config
- **Automatic theme switching**: CodeMirror editor detects system preference
- **Consistent dark variants**: All components have `dark:` prefixed classes

## 🔧 Technical Implementation Details

### Task Extraction Logic
```typescript
// Key regex pattern for task detection
const taskMatch = line.match(/^-\s\[([ x])\]\s(.+)$/)  // Markdown checkboxes
const taskMatch = line.match(/^✓\s(.+)$/)              // Checkmark tasks
const taskMatch = line.match(/^(.+)$/)                 // Plain text tasks
```

### Comparison Generation Algorithm
```typescript
// Generate all possible pairs, filter out completed comparisons
const allPairs: [Task, Task][] = []
for (let i = 0; i < tasks.length; i++) {
  for (let j = i + 1; j < tasks.length; j++) {
    allPairs.push([tasks[i], tasks[j]])
  }
}
// Filter already compared pairs and shuffle
```

### Ranking Update Strategy
```typescript
// Content-based ranking insertion
const updatedLines = lines.map(line => {
  const content = extractTaskContent(line)
  const rankData = contentRankMap.get(content)
  if (rankData) {
    return `${baseTask} | Rank: ${rankData.rank} | Score: ${rankData.score.toFixed(2)}`
  }
  return line
})
```

## 🚀 Getting Started

### Prerequisites
- **Node.js 18+** for frontend
- **Rust 1.70+** for backend  
- **PostgreSQL** for database

### Frontend Setup
```bash
cd web
npm install
npm run dev  # Starts on http://localhost:5173
```

### Backend Setup
```bash
# Install Rust dependencies
cargo build

# Set up database
createdb todo_sorter
sqlx migrate run

# Start server
cargo run  # Starts on http://localhost:3000
```

### Environment Variables
```bash
# Backend (.env)
DATABASE_URL=postgresql://localhost/todo_sorter
PORT=3000

# Frontend (optional - uses localStorage fallback)
VITE_API_URL=http://localhost:3000
```

## 📱 Usage Guide

### 1. Writing Tasks
```markdown
# Welcome to the Todo Sorter App!

# Each line below is a task - comments start with #
First task to do
Second task to do
Another important task

# You can mark completed tasks with ✓ or [x]
✓ Example completed task
[x] Another completed task
```

### 2. Making Comparisons
- Navigate to "Editor & Compare" tab
- Click on tasks in the comparison view or use keyboard shortcuts:
  - Press `1` for first task
  - Press `2` for second task
- Continue until all pairs are compared

### 3. Viewing Rankings
- Rankings automatically appear in the "Task Rankings" section
- Color-coded by priority level
- Click "Update Rankings" to refresh markdown with latest scores

### 4. Exporting Data
- **Export Markdown**: Download `.md` file with rankings
- **Export CSV**: Download comparison history for analysis

## 🎯 Key Features for LLM Understanding

### Unique Architecture Decisions

1. **Markdown-First Design**: Unlike traditional CRUD apps, this treats markdown as the primary data store
2. **Content-Based Identification**: Tasks identified by text content, not database IDs
3. **Pairwise Comparison Algorithm**: Uses Bradley-Terry model for ranking calculation
4. **Resilient State Management**: Handles API failures gracefully with localStorage fallback
5. **Real-time Ranking Updates**: Rankings written back into markdown automatically

### Component Interaction Patterns

```
App.tsx (State Manager)
├── Editor.tsx → markdownContent updates → tasks extracted
├── ComparisonView.tsx → receives tasks → emits comparisons
├── TaskRankings.tsx → receives tasks + comparisons → displays rankings
└── ComparisonLog.tsx → receives comparisons → displays history
```

### API Design Philosophy

- **RESTful endpoints** for standard CRUD operations
- **Content-based payloads** instead of ID-based
- **Batch operations** for efficiency
- **Health check endpoints** for connection monitoring

## 🔍 Debugging & Development

### Common Issues
1. **Tasks not appearing**: Check markdown syntax and task extraction regex
2. **Rankings not updating**: Verify API connection and comparison data
3. **Styling issues**: Check Tailwind classes and dark mode variants

### Development Tools
- **React DevTools**: Monitor component state and props
- **Network Tab**: Debug API calls and responses
- **Console Logs**: Extensive logging for state changes and API calls

This architecture makes the app both powerful and maintainable, with clear separation of concerns and robust error handling throughout. 