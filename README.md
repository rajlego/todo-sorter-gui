# Todo Sorter with PostgreSQL

## Database Setup

This project uses PostgreSQL for data persistence. Here's how to set it up:

### Local Development

1. Install PostgreSQL on your machine
2. Create a new database:
   ```bash
   createdb todo_sorter
   ```
3. Configure your database connection in the `.env` file:
   ```
   DATABASE_URL=postgres://postgres:password@localhost:5432/todo_sorter
   ```

### Railway Deployment

1. Create a new project in Railway
2. Add a PostgreSQL database to your project
3. Railway will automatically configure the `DATABASE_URL` environment variable
4. Make sure the following environment variables are set in Railway:
   ```
   PORT=3000
   STATIC_DIR=static
   ```
5. Deploy your application using the Railway CLI or GitHub integration

## Running the Application

To run the application in development mode:

```bash
cargo run api  # Start the backend API server
cd web && yarn dev  # Start the frontend development server
```

For production:

```bash
cargo build --release
cd web && yarn build
cp -r web/dist static
STATIC_DIR=static ./target/release/sorter api
```

## API Endpoints

- `GET /api/health` - Health check
- `GET /api/tasks` - Get all tasks
- `DELETE /api/tasks` - Delete a task
- `GET /api/comparisons` - Get all comparisons
- `POST /api/comparisons` - Add a new comparison
- `GET /api/rankings` - Get task rankings

## Technologies Used

- Backend: Rust with Axum framework and SQLx for database access
- Database: PostgreSQL
- Frontend: React with TypeScript and Tailwind CSS
- Deployment: Railway 