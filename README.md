# WiseUp Backend

## For Supervisors - Quick Start Instructions

To run the complete WiseUp application (Frontend + Backend + Database):

1. **Move docker-compose.yml**: Take the `docker-compose.yml` file from this backend folder and move it to the parent directory (where both `Frontend/` and `Backend/` folders are located). **YOU need to adjust the MONGODB_URI in docker-compose.yml** that is a bug currently.

2. 

3. **Start the application**: In the parent directory, run:

   ```bash
   docker compose up -d
   ```

4. **Access the application**:

   - Frontend: http://localhost:5173
   - Backend API: http://localhost:4000

5. **Stop the application**:
   ```bash
   docker compose down
   ```

### Email Verification for Testing

For testing purposes, if you use an email address with the domain `example.com`, the magic link verification process will be skipped. This allows to test the application without needing to verify email addresses.

---

### Forms Dummy Data

To make testing, development, and submission easier, the application provides a set dummy data button in each form. This button populates the form with realistic data, allowing you to test the application without manually entering information.

## For Developers - Development Commands

### Setup

```
npm install
```

### Lint

```
npm run lint
```

### Development

```
npm run dev
```

### Build

```
npm run build
```

### Start build (requires building before)

```
npm run start
```

### Regenerate OpenAPI client (run this after the OpenAPI spec changed in the backend)

Note: The backend repository must be cloned next to this repo at ../Frontend

```
npm run generate:api // this will generate the OpenAPI client in Backend folder only
```

or

```
npm run generate:api:all // this will generate the OpenAPI client in Frontend and Backend folders
```

or

```
npm run generate:api:frontend // this will generate the OpenAPI client in Frontend folder only
```

### Docker

We use two separate Docker Compose configs:

1. **Backend-Only** (MinIO + Stripe):
   `docker-compose.backend.yml` - For development only

2. **Full-Stack** (MinIO + Stripe + Backend + Frontend):  
   `docker-compose.yml` - For complete application testing and submission

#### 1. Backend-Only Development (MinIO + Stripe)

Use this when developing backend features and you want to run the frontend separately.

**Directory:** Backend folder

```bash
docker compose -f docker-compose.backend.yml up -d    # Start backend services
docker compose -f docker-compose.backend.yml down     # Stop backend services
```

#### 2. Full-Stack for Submission / Development Testing

This is mainly for submission purposes, but can also be used to test the complete application during development.

**Directory:** Parent folder (where both Frontend/ and Backend/ folders are located)

First, copy `docker-compose.yml` from the backend folder to the parent directory, then:

```bash
docker compose up -d    # Start all services
docker compose down     # Stop all services
```

**Ports:**

- Frontend: 5173
- Backend: 4000

**Note:** Run `npm run db:seed` in the backend folder if you need to reseed the database after rebuilding containers.

### Database Seed Values (Development)

Adds default values to the database, useful for development and testing.

```bash
npm run db:seed
```

### Database Wipe (Development)

This command will wipe the database, removing all data. Use with caution!

```bash
npm run db:wipe
```
