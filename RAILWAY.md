# Railway Deployment Guide

This guide provides instructions for deploying the Todo Sorter application on Railway.

## Prerequisites

- A Railway account (https://railway.app)
- GitHub repository with your code

## Deployment Steps

1. **Fork or clone this repository**

2. **Connect your GitHub account to Railway**
   - Log in to Railway and go to your dashboard
   - Click "New Project" → "Deploy from GitHub repo"
   - Select your repository

3. **Configure the deployment**
   - Railway will automatically detect the Dockerfile and use it for deployment
   - Make sure the following variables are set in your Railway project settings:
     - `PORT`: 3000
     - `SQLX_OFFLINE`: true 
     - `JWT_SECRET`: A secure random string for JWT token generation
   - You don't need to manually set `DATABASE_URL` as Railway will set it when you add a PostgreSQL service

4. **Add a PostgreSQL database**
   - Click "New" → "Database" → "PostgreSQL"
   - Railway will automatically link the database to your application
   - Railway will set the `DATABASE_URL` environment variable

5. **Deploy your application**
   - Click "Deploy" and wait for the build to complete
   - The app will be available at the provided Railway URL

## Troubleshooting

### SQLx Compile-Time Checking Issues

The application uses SQLx with offline mode enabled. If you make changes to database queries:

1. Run your database locally
2. Generate a new `sqlx-data.json` file with:
   ```bash
   cargo sqlx prepare --database-url "postgres://username:password@localhost:5432/dbname"
   ```
3. Commit the updated `sqlx-data.json` file

### Database Connection Issues

If the application fails to connect to the database:

1. Check the Railway logs to see if PostgreSQL is running
2. Make sure the `DATABASE_URL` is properly set by Railway
3. Verify that migrations are running properly

### Build Failures

If the build fails:

1. Check that `.cargo/config.toml` exists with `SQLX_OFFLINE = "true"`
2. Ensure `sqlx-data.json` is properly formatted and complete
3. Verify that `Cargo.lock` is committed to your repository

## Health Check

The application provides a health check endpoint at `/api/health` which returns detailed information about the deployment environment. Use this endpoint to verify your deployment is working correctly.

## Additional Resources

- [Railway Documentation](https://docs.railway.app/)
- [SQLx Documentation](https://github.com/launchbadge/sqlx)
- [Rust on Railway Guide](https://blog.railway.app/p/rust) 