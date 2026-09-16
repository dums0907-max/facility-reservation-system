# Facility Reservation and Approval System

## Setup

1. **Create a Supabase project** at supabase.com.
2. In the SQL Editor, run `sql/schema.sql` (this creates tables, roles logic, business-rule triggers, and RLS policies, plus 3 sample facilities).
3. In **Project Settings → API**, copy your Project URL and `anon` public key into `js/supabaseClient.js`.
4. In **Authentication → Providers**, make sure Email is enabled. For quicker testing, you can turn off "Confirm email" in Authentication → Settings so new accounts can sign in immediately.
5. Push this folder to a GitHub repository, then enable **GitHub Pages** (Settings → Pages → deploy from the branch root).

## Trying it out

1. Open the deployed site and **sign up** three times with different emails, choosing role "Administrator", "Facility Staff", and "Requester" respectively (the demo signup form lets you pick a role directly — see the note on the signup screen about why that's demo-only).
2. As **Requester**, submit a reservation for an Active facility.
3. As **Administrator**, approve it from the Reservations tab — it becomes Scheduled.
4. As **Facility Staff**, mark it In Use, then Completed.
5. As **Administrator**, open the Audit Log tab to see every step recorded.

## Project structure

```
index.html          Sign in / sign up
dashboard.html       Role-based dashboard shell
css/style.css        Shared styling
js/supabaseClient.js Supabase connection (fill in your URL/key)
js/auth.js            Sign-in/sign-up logic
js/app.js             Dashboard logic (facilities, reservations, users, audit log)
sql/schema.sql         Tables, triggers, and RLS policies
docs/DOCUMENTATION.md  ERD, use case diagram, role matrix, workflow, business rules, test plan
```

## Note on role assignment

The signup form lets the user pick their own role, which is convenient for grading/demo purposes only. In a real deployment, new accounts should default to "requester", and only an Administrator (via the Manage Users tab) should be able to promote someone to Facility Staff or Administrator.
