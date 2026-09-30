# Tribal Scholarship and Fellowship Management System

Unified AI-enabled scholarship and fellowship portal for the Ministry of Tribal Affairs. The project contains a React/Vite frontend and a FastAPI backend with MongoDB-compatible persistence.

## Features

- Public scheme discovery and scheme detail pages
- Applicant registration, applications, document uploads, OCR verification, status tracking, and grievances
- Admin dashboard with application pipeline and scheme-level analytics
- Explainable eligibility and document verification views
- English and Hindi interface support
- Browser read-aloud control for the current page
- In-memory MongoDB fallback for local development when MongoDB is unavailable

## Requirements

- Node.js 18 or newer
- Python 3.10 or newer
- npm
- MongoDB Atlas or MongoDB local instance with `tsfms` database

## Frontend Setup

Install dependencies from the project root:

```powershell
npm install
```

Start the Vite development server:

```powershell
npm run dev
```

Open `http://127.0.0.1:5173/` in a browser.

Available frontend commands:

```powershell
npm run build  # TypeScript check and production build
npm run lint   # Oxlint
npm run preview
```

## Backend Setup

Create or activate the project virtual environment, then install backend dependencies:

```powershell
python -m venv .venv
.\.venv\Scripts\Activate.ps1
python -m pip install -r backend\requirements.txt
```

The backend reads configuration from `backend/.env`. Start from `backend/.env.example` if needed. At minimum, configure `MONGO_URI`; a local MongoDB URI is suitable for development.

Start FastAPI from the project root:

```powershell
Push-Location backend
..\.venv\Scripts\python.exe -m uvicorn app.main:app --host 127.0.0.1 --port 8000 --reload
Pop-Location
```

Backend URLs:

- API: `http://127.0.0.1:8000/api`
- Health check: `http://127.0.0.1:8000/api/health`
- Swagger documentation: `http://127.0.0.1:8000/docs`

## Database Configuration
 
The backend connects to MongoDB Atlas using `MONGO_URI` configured in `backend/.env`. All registration, applicant profiles, and application data persist directly in MongoDB Atlas under the `tsfms` database. In-memory and mock fallbacks are completely disabled to guarantee true persistence.

## Application Flow

1. Open the public portal.
2. Browse schemes or use the eligibility tools.
3. Create an applicant account from the Sign Up page.
4. Apply for a scheme and upload the required documents.
5. Track document verification and application status from the applicant dashboard.
6. Authorized administrators can review applications from the Admin dashboard.

The login page intentionally does not display default credentials. Applicant access is created through registration, while administrative access is managed by the backend seed/configuration process.

## Accessibility

The header includes text-size controls, keyboard-focusable navigation, a skip-to-content link, English/Hindi switching, and a speaker button. Select **Read aloud** to have the browser read the current page content; select **Stop** to cancel playback.

Read-aloud uses the browser Web Speech API, so the browser tab and system audio must be enabled.

## Troubleshooting

### Unable to connect to the portal server

Start the backend and confirm the health endpoint responds with `{"status":"ok"}`:

```powershell
Invoke-WebRequest http://127.0.0.1:8000/api/health
```

### Port 8000 is already in use

Stop the existing backend process or start FastAPI on another port and update `VITE_API_BASE_URL` accordingly.

### Frontend changes are not visible

Refresh the Vite page. If needed, stop and restart `npm run dev` after changing environment variables.

## Project Structure

```text
src/       React frontend, layouts, pages, components, API client, and types
backend/   FastAPI application, routes, schemas, services, and database setup
public/    Static images and public assets
```
## 📸 Application Tracking

### Where Is My Application?


Applicants can track the current stage of their individual scholarship or
fellowship application and understand its progress through the workflow.

The tracking interface provides visibility into application status,
processing stages, and required actions.

<img width="1810" height="843" alt="Screenshot 2026-09-30 145249" src="https://github.com/user-attachments/assets/2bd306c7-455a-4f2b-86a1-1a6f06a8f243" />
