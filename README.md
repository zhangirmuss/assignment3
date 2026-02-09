# FitTrack - Assignment 2 (Part 2)

Project name: FitTrack

Short description:
A simple fitness tracking prototype demonstrating Express.js, routing, middleware, and a SQLite-backed CRUD API for a main entity.

Team members:
- Mussilimov Zhangir - Group SE-2422

Team contributions:
- Mussilimov Zhangir: project setup, server, database integration, API, views, styling

Database:
- SQLite (file: data/app.db)
- Table: items
  - id INTEGER PRIMARY KEY AUTOINCREMENT
  - title TEXT NOT NULL
  - description TEXT NOT NULL

Server & middleware:
- Node.js + Express
- Middleware used:
  - express.urlencoded({ extended: true }) — parse form submissions
  - express.json() — parse JSON bodies for API
  - Custom logger middleware logs method + URL

API (CRUD) for "items":
- GET /api/items
  - Returns all items sorted by id ASC
  - 200 OK
- GET /api/items/:id
  - Returns single item
  - 200 OK
  - 400 Bad Request if :id is not a valid positive integer { "error": "Invalid id" }
  - 404 Not Found if item does not exist { "error": "Not found" }
- POST /api/items
  - Create new item. JSON body: { "title": "...", "description": "..." }
  - 201 Created returns created item
  - 400 Bad Request if missing fields { "error": "Missing fields: title, description" }
- PUT /api/items/:id
  - Update item. JSON body: { "title": "...", "description": "..." }
  - 200 OK returns updated item
  - 400 Bad Request if invalid id or missing fields
  - 404 Not Found if item does not exist
- DELETE /api/items/:id
  - Delete item
  - 200 OK { "success": true }
  - 400 Bad Request if invalid id
  - 404 Not Found if item does not exist

Other routes:
- GET /                -> Home page (views/index.html)
- GET /search          -> Search page (views/search.html) with client-side filtering
- GET /contact         -> Contact page (views/contact.html)
- POST /contact        -> Saves contact form to data/contacts.json (server-side validation)
- GET /api/info        -> Project info as JSON

404 handling:
- Unknown routes return HTML 404 for normal pages and JSON 404 for API routes (global app.use handler)

Files included:
- server.js
- package.json
- views/index.html
- views/search.html
- views/contact.html
- public/style.css
- public/app.js
- data/app.db (auto-created)
- data/contacts.json
- README.md

Run instructions:
1. npm install
2. node server.js
3. Open http://localhost:3000

Testing tips:
- Use the Home page links for quick API tests: /api/items and /api/items/1
- Use the Search page to try client-side exercise filtering
- Submit the contact form on /contact; entries are saved in data/contacts.json

Notes:
- The database and table are created automatically on server start if missing.
- API returns consistent JSON errors for client handling.
