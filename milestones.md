- [x] Create a new frontend directory (web/)
- [ ] Initialize a Vite + React + TypeScript project [[rid::2]]
- [ ] Set up Tailwind CSS [[rid::3]]
- [ ] Install Monaco Editor and set up API client for Railway backend [[rid::1]]
- [ ] Add a basic Netlify configuration file
- [ ] Add a placeholder page and test the dev server

# Milestones for Comparison Sorter App (React + Vite Frontend, Railway Backend)

---

## 1. Project Setup

**Goal:**  
Establish a working development environment with all dependencies and basic project structure.

**Frontend:** React + Vite (TypeScript)
**Backend:** Rust web API (Axum or Actix-web) on Railway

**Tasks:**
- Initialize Git repository.
- Set up Vite + React + Tailwind CSS in `web/` directory.
- Add Monaco Editor (or CodeMirror) as a dependency.
- Set up Netlify configuration for local dev and deploy.
- Set up a new Rust web API project (e.g., with Axum or Actix-web) in a `backend/` directory.
- Initialize a Railway project for backend hosting.

**Tests:**
- `npm run dev` starts the React app and shows a placeholder page.
- Monaco/CodeMirror editor renders on the page.
- Rust API can be run locally and responds to a test request (e.g., `/healthz`).
- Netlify CLI (`netlify dev`) serves the React frontend locally.
- Railway CLI can deploy the backend and provide a public API URL.

---

## 2. Authentication (Optional, if needed)

**Goal:**  
Users can sign up, log in, and log out if authentication is required. (Otherwise, skip this step for a single-user app.)

**Tasks:**
- (Optional) Implement authentication in the backend (JWT, session, or basic auth).
- (Optional) Add login/logout UI in the React frontend.
- Store user session in app state.
- Protect main app routes from unauthenticated access if needed.

**Tests:**
- User can log in and access their data (if auth is enabled).
- User cannot access main app routes when logged out.
- User can log out and is redirected to login page.
- Invalid login shows an error.

---

## 3. Markdown File Management (via API)

**Goal:**  
Users can upload, create, view, and edit a markdown file, with changes saved via the Rust API (hosted on Railway).

**Tasks:**
- UI for uploading a markdown file (React).
- UI for creating a new markdown file (React).
- Display markdown in Monaco/CodeMirror editor (React).
- Save file content to the backend via API on change.
- Load file content from the backend on login or page load.

**Tests:**
- User can upload a markdown file and see its content in the editor.
- User can create a new file and edit it.
- Edits are saved to the backend and persist after reload.
- User sees their file after logging out and back in (if auth is enabled).

---

## 4. Task Extraction & Sidebar (Frontend)

**Goal:**  
Extract TODOs from the markdown file and display them in a sidebar.

**Tasks:**
- Parse markdown for lines like `- [ ] Task description` (in React frontend).
- Display extracted tasks in a sidebar (React).
- Update sidebar in real time as the markdown is edited.

**Tests:**
- Given a markdown file with TODOs, the sidebar lists all TODOs.
- Editing the markdown (adding/removing TODOs) updates the sidebar instantly.
- Sidebar only shows TODOs, not other markdown content.

---

## 5. Pairwise Comparison UI (Frontend + API)

**Goal:**  
Present two tasks for comparison and allow the user to select the preferred one. Log the comparison via the backend API.

**Tasks:**
- UI to display two randomly selected TODOs (React).
- Keyboard shortcuts (e.g., `1`/`2` or arrow keys) to select a winner (React).
- Button-based selection as fallback (React).
- After selection, send the comparison result to the backend API and show the next pair.

**Tests:**
- Two tasks are shown for comparison.
- Pressing `1` or `2` selects the corresponding task.
- Clicking a button selects the corresponding task.
- After selection, a new pair is shown.
- No duplicate pairs are shown until all pairs are compared (or as per algorithm).
- Each comparison is logged in the backend and can be retrieved via API.

---

## 6. Comparison Log (API)

**Goal:**  
Store and display a log of all comparisons, synced with the backend API.

**Tasks:**
- Log each comparison (task A, task B, winner, timestamp) to the backend API.
- Display comparison history in a table or list (React fetches from API).
- Allow export of log as CSV/JSON (React fetches from API).

**Tests:**
- Each comparison is recorded in the backend.
- Refreshing the page shows the full comparison history.
- Exported CSV/JSON matches the log in the backend.

---

## 7. Live Sync (Optional, Advanced)

**Goal:**  
All changes (markdown, tasks, comparisons) are synced in real time across devices/tabs (if needed).

**Tasks:**
- (Optional) Implement WebSocket or polling endpoints in the backend for live updates.
- Subscribe to changes and update UI instantly (React).
- Handle merge conflicts gracefully (last write wins, or show warning).

**Tests:**
- Editing the markdown in one tab updates the editor in another tab in real time (if live sync is implemented).
- Making a comparison in one tab updates the log in another tab instantly.
- No data is lost or duplicated during simultaneous edits.

---

## 8. UI/UX Polish & Error Handling

**Goal:**  
Ensure the app is user-friendly, responsive, and robust.

**Tasks:**
- Responsive layout for desktop and mobile (React + Tailwind).
- Loading and error states for all async actions (React).
- Clear feedback for save, sync, and errors (React).
- Accessibility (keyboard navigation, ARIA labels) (React).

**Tests:**
- App looks good and works on different screen sizes.
- All async actions show loading indicators.
- Errors (e.g., network, auth) are displayed to the user.
- App is navigable via keyboard and screen reader.

---

## 9. Deployment

**Goal:**  
App is deployed to Netlify (React frontend) and Railway (Rust backend) and works end-to-end.

**Tasks:**
- Set up Netlify site and environment variables for API URL.
- Configure build and deploy scripts for React frontend.
- Set up Railway project and deploy backend API.
- Test production build with live backend.

**Tests:**
- App is accessible at the Netlify URL and connects to the Railway API.
- All features work as in local dev.
- Environment variables are correctly set and used.

---

# Summary Table

| Milestone                | Key Tests/Acceptance Criteria                                      |
|--------------------------|--------------------------------------------------------------------|
| Project Setup            | App runs locally, editor renders, backend API responds              |
| Authentication           | User can log in/out if enabled, protected routes work               |
| Markdown File Management | Upload/create/edit file, persists via API, loads on login           |
| Task Extraction/Sidebar  | TODOs parsed and shown, updates live with edits                    |
| Pairwise Comparison UI   | Two tasks shown, keyboard/buttons work, new pair after selection   |
| Comparison Log           | Comparisons logged in backend, history shown, export works         |
| Live Sync                | Edits/comparisons sync across tabs/devices in real time (optional) |
| UI/UX Polish             | Responsive, accessible, error/loading states present               |
| Deployment               | App works on Netlify, backend on Railway, end-to-end tested        | 