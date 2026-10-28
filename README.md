# Strong_Academy

FRONT END:
# React + Vite

The React Compiler is not enabled on this template because of its impact on dev & build performances. To add it, see [this documentation](https://react.dev/learn/react-compiler/installation).

## Expanding the ESLint configuration
production application, we recommend using TypeScript with type-aware lint rules enabled. Check out the [TS template](https://github.com/vitejs/vite/tree/main/packages/create-vite/template-react-ts) for information on how to integrate TypeScript and [`typescript-eslint`](https://typescript-eslint.io) in your project.

If you are developing a 


BACK END :

# SSA Academy backend

The existing Django project is in `backend\`. From PowerShell, run commands in
`backend\backend\` and use the checked-in virtual environment:

```powershell
Set-Location D:\academy\SSA\backend\backend
..\venv\Scripts\pip.exe install -r ..\requirements.txt
```

For local development, the backend uses the existing SQLite database at
`backend\backend\db.sqlite3`. Migrations apply schema changes to that database
without resetting it. From `backend\backend\`, run:

```powershell
..\venv\Scripts\python.exe manage.py check
..\venv\Scripts\python.exe manage.py migrate
..\venv\Scripts\python.exe manage.py runserver
```

To use MySQL instead, install and start a MySQL server, then set these
environment variables in the same PowerShell session before running Django:

$env:SSA_DB_ENGINE = "django.db.backends.mysql"
$env:SSA_DB_NAME = "strong_academy"
$env:SSA_DB_USER = "root"
$env:SSA_DB_PASSWORD = "<your MySQL password>"
$env:SSA_DB_HOST = "localhost"
$env:SSA_DB_PORT = "3306"
..\venv\Scripts\python.exe manage.py migrate
..\venv\Scripts\python.exe manage.py runserver
```

In Django Admin, create a `Profile` with the account's role (`manager`, `hr`,
`trainer`, or `student`). HR-created student records provision a corresponding
student login account and role profile in the same database transaction. HR
must provide a unique Student ID, a unique login email, and an initial
password. Student IDs and student-profile emails are unique without regard to
letter case, and the API also rejects emails already used by another account.
Django validates and hashes the password before storage. Students can sign in
with their Student ID or email and the password HR set. Students are enrolled
in the selected course and matching batch.
For staff records, create an `HRProfile`; trainers
can submit their own professional profile from the trainer dashboard, and HR
can approve it. Create course and batch records, assign trainers to courses,
then use HR's enrollment form to assign students to matching course batches.
Trainer accounts must be linked to their `TrainerProfile` for self-service
screens to work.

The course API's duration values are `weekly`, `weekday`, `2_months`,
`3_months`, and `4_months`; schedule values are `weekly` and `weekday`.
Enrollment status values are `active`, `completed`, and `inactive`. The HR
dashboard sends these backend values directly and routes course and batch
management to `/dashboard/hr/courses` and `/dashboard/hr/batches`.

Set or reset privileged account passwords through Django Admin or a secure
administrator-managed setup process. Public registration creates active
Student accounts only. It never accepts a role from the browser.

The frontend uses `http://127.0.0.1:8000/api/` by default. You can override it
with `VITE_API_BASE_URL` in `frontend\.env.local`. Start the frontend with:

```powershell
Set-Location D:\academy\SSA\frontend
npm run dev
```

To run both development servers, use two PowerShell terminals:

```powershell
# Terminal 1
Set-Location D:\academy\SSA\backend\backend
..\venv\Scripts\python.exe manage.py runserver

# Terminal 2
Set-Location D:\academy\SSA\frontend
npm run dev
```

The initial schema migrations are included for accounts, students, trainers,
courses, attendance, and learning (assignments, submissions, and results).
`manage.py migrate` applies them without removing existing account/profile data.
The student login-identifier uniqueness migration is applied with the same
command, along with the Google account identity migration.
The legacy account profile migration (`accounts.0001_initial`) remains intact.

## Role-protected API

- `POST /api/auth/login/`, `POST /api/auth/register/`
- `POST /api/auth/google/`, authenticated `POST /api/auth/google/link/`
- `POST /api/auth/password-reset/`, `POST /api/auth/password-reset/confirm/`
- `POST /api/auth/token/refresh/`, `GET /api/dashboard/`
- `/api/students/`, `/api/trainers/`, `/api/courses/`, `/api/batches/`
- `/api/enrollments/`, `/api/attendance/`, `/api/attendance/reports/`
- `/api/hr-staff/`, `/api/placements/drives/`, `/api/placements/records/`
- `/api/assignments/`, `/api/submissions/`, `/api/results/`
- `/api/messages/recipients/`, `/api/messages/conversations/`,
  `/api/messages/conversations/{id}/`, `/api/messages/send/`, and
  `/api/messages/unread-count/` for private direct messages and read status.
- `/api/trainer-feedback/options/` and `/api/trainer-feedback/` for student
  feedback; Manager/HR reports use `/api/trainer-feedback/summary/`.
- Authenticated `GET` and multipart `POST /api/profile/photo/` for the signed-in
  user's own profile photo.
- Student-only `/api/materials/` list/detail/download endpoints; access is
  restricted to materials in the student's active enrolled batches.
- Trainer-only `/api/study-materials/` upload, list, retrieve, and delete;
  `/api/study-materials/{id}/download/` streams a private file to its uploader.

All resource endpoints require a JWT bearer token. The API applies server-side
role checks and ownership/assignment filtering; manager mutation requests are
denied even when sent directly. Attendance is unique per student, batch, and
date. Removing a course with batches, enrollments, or historical attendance
archives it instead of destroying related records. Student records with
history are deactivated on HR deletion requests.

## Messaging, trainer feedback, and profile photos

Apply the new `accounts.0007_profile_photo` and `communications.0001_initial`
migrations with `manage.py migrate`; existing account and enrollment data is
preserved. Messages are stored as individual recipient records in private
one-to-one conversations. The API enforces the Manager/HR/Trainer recipient
rules and permits Students to reply only inside an existing conversation.
Opening a conversation marks messages delivered to the current user as read.

Students can submit one review for each trainer and enrolled batch. The API
checks the live student enrollment and trainer/course/batch assignment before
saving ratings. Manager and HR reports use the same stored reviews and
calculated averages; feedback is performance input for review, not a verified
misconduct finding or an employment decision.

Profile photos are limited to 5 MiB and validated as actual JPEG, PNG, or WebP
images. They are stored under `profile_photos/` using generated filenames and
are read through the authenticated `/api/profile/photo/` endpoint for the
signed-in account. Do not serve the configured media directory publicly.

## Trainer study materials

Apply the learning migrations with `manage.py migrate` (including
`learning.0002_studymaterial` and `learning.0003_studymaterial_original_filename`).
Trainers can upload PDF, DOC/DOCX, PPT/PPTX, TXT, ZIP, JPG/JPEG, PNG, and MP4
files up to exactly 50 MiB (52,428,800 bytes) into batches assigned to their
trainer profile. Course and batch IDs must match. List, detail, download, and
delete requests are limited to the authenticated trainer who uploaded the
material; students and other roles cannot use these endpoints.

The student dashboard's Study Materials page uses the separate authenticated
`/api/materials/` read-only API. A student sees only materials linked to a
course and batch matching one of their active enrollments and active student
profile. Detail, download, and preview requests repeat this authorization on
the server, so changing an ID cannot expose another batch's material. Downloads
use the original upload filename. PDF, image, and MP4 previews use signed links
that expire after five minutes and are rechecked against current enrollment;
the private preview stream supports single HTTP byte ranges for browser video
seeking. DOC/DOCX, PPT/PPTX, and ZIP files are offered as downloads instead.

Files use Django's configured media storage under the private
`study_materials/` prefix with generated storage names. Do not serve that
directory as public static content or expose `MEDIA_URL` for these files;
downloads must go through the authenticated API action. In production, use a
private media volume or private object-storage bucket, restrict filesystem and
backup access, and provision quota for expected material retention (at least
the sum of retained file sizes plus operational headroom).
For the default filesystem storage, set `SSA_MEDIA_ROOT` to the mounted private
storage directory before starting Django, for example:

```powershell
$env:SSA_MEDIA_ROOT = "D:\private\strong-academy-media"
```

The Django endpoint accepts request bodies up to 51 MiB to allow 1 MiB of
multipart overhead beyond the 50 MiB file limit. Override that request cap only
when matching the application and proxy limits:

```powershell
$env:SSA_STUDY_MATERIAL_MAX_REQUEST_BYTES = "53477376"
```

Set the reverse proxy's request-body limit to the same 51 MiB (for example,
`client_max_body_size 51m;` in Nginx). The application independently validates
the actual uploaded file size and content; `DATA_UPLOAD_MAX_MEMORY_SIZE` is
not used as the file-size limit. This repository has no production proxy or
deployment configuration, so its production body limit must be set in the
deployment's proxy configuration as described above.

## Public academy website API

The public React pages use these additional endpoints without authentication:

- `GET /api/public/courses/` returns active course catalogue fields only.
- `GET /api/public/placement-drives/` returns future drives in scheduled status.
- `POST /api/public/enquiries/` validates and stores a course, general, or
  placement enquiry. Requests are limited to five per hour per client IP.

Enquiries are available to staff with Django Admin access. Email notifications
are not configured for this endpoint; configure an official recipient and
notification policy before promising automatic email follow-up.

## Common login and Google sign-in

The common React login sends only email and password to Django. Django reads
the account's `Profile.role`; React never selects or assigns a role. The
canonical dashboard routes are `/manager/dashboard`, `/hr/dashboard`,
`/trainer/dashboard`, and `/student/dashboard`. Protected routes redirect
unauthenticated users to `/login` and send an authenticated user with the
wrong role to their own dashboard. The existing API role permissions remain
the server-side security boundary.

Public registration validates password confirmation and Django password
validators, creates only a Student role, makes a StudentProfile with a
generated Student ID, and signs the student in. Password reset sends a
time-limited Django reset link. In development, Django prints reset email
content to the backend terminal. For production configure SMTP with
`DJANGO_EMAIL_BACKEND`, `EMAIL_HOST`, `EMAIL_PORT`, `EMAIL_HOST_USER`,
`EMAIL_HOST_PASSWORD`, `EMAIL_USE_TLS`, and `DEFAULT_FROM_EMAIL`; also set
`SSA_FRONTEND_URL` to the public frontend origin.

Google sign-in is optional and stays unavailable until configured. Create a
Google OAuth 2.0 **Web application** client in Google Cloud Console. Add the
frontend origins (for example `http://localhost:5173` and
`http://127.0.0.1:5173`) under Authorized JavaScript origins. This integration
uses Google Identity Services' popup credential flow, so it does not require
a redirect URI. Set the same public client ID in both environments:

- Backend: `GOOGLE_OAUTH_CLIENT_ID`
- Frontend `frontend\.env.local`: `VITE_GOOGLE_CLIENT_ID`

Restart both servers after changing environment variables. The backend
validates each Google ID token, audience, and verified email. A first-time
Google user becomes a Student with an unusable local password. Existing
accounts are not silently claimed by a matching email; sign in to that account
and use the authenticated `auth/google/link/` endpoint, which requires the
Google verified email to match the account email. Google cannot grant staff
roles.

JWTs remain in browser local storage to preserve the existing client
architecture. The frontend refreshes access tokens once when expired and
clears stored tokens if refresh fails or when the user logs out. Use HTTPS in
production and consider moving JWTs to Secure, HttpOnly cookies for stronger
protection from script-based token theft.

Run focused verification with:

```powershell
..\venv\Scripts\python.exe manage.py test accounts
..\venv\Scripts\python.exe manage.py check
```

Before production deployment, configure a non-debug environment, a private
`SECRET_KEY`, allowed hosts, HTTPS, and an appropriate database through
environment-specific settings. The checked-in development defaults are not
production settings.

