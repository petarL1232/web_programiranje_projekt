# DocumentChain

Web Programming project: a web application for storing documents and verifying their authenticity with SHA-256 hashing and a blockchain-style audit log.

The app is not a decentralized blockchain. It uses blockchain concepts as an append-only audit log: every uploaded document creates a block that stores the document hash, the document id, the previous block hash and its own block hash. This lets the app detect whether a stored document was changed and whether the upload history was tampered with.

## Main features

- user registration and login with JWT
- secure document upload through the backend
- SHA-256 document hash calculation
- blockchain block creation for every upload
- upload receipt after successful upload
- local receipt JSON download from the browser
- document dashboard for the logged-in user
- public/private document visibility
- download through protected backend routes
- verification of stored documents
- verification of uploaded files for authenticity checking
- blockchain validation without downloading document files
- public Blockchain Explorer
- Socket.io real-time updates when new blocks are created
- development-only tools for local testing

## Project idea

For every uploaded document, the backend calculates a SHA-256 hash. The hash represents the document contents: if even one byte changes, the hash changes.

The document itself is stored normally on the server side. It is not stored inside the blockchain. The blockchain-style audit log stores document metadata and hashes. Each block contains the hash of the previous block, which creates a chain of records.

This gives the project two levels of integrity checking:

1. **Document integrity** — the app recalculates the stored file hash and compares it with the hash saved in the document and block records.
2. **Blockchain history integrity** — the app validates block hashes and `previousHash` links to detect whether the audit history was modified.

## Tech stack

### Frontend

- Angular
- TypeScript
- Socket.io client
- SCSS

### Backend

- Node.js
- Express
- MongoDB with Mongoose
- JWT authentication
- Multer for file upload parsing
- Socket.io
- Node crypto module for SHA-256 hashing

### Database

Local development uses MongoDB on:

```txt
mongodb://127.0.0.1:27017/documentchain_web
```

For deployment, the database should be moved to MongoDB Atlas.

## Security notes

- Real `.env` files must not be committed.
- Uploaded files are never executed on the server.
- Files are stored outside the frontend/public folder.
- Documents are downloaded only through backend routes.
- The backend validates uploads; it does not trust the frontend.
- Original filenames are kept only as metadata and are not used as trusted server paths.
- Validation of the blockchain reads only block records, not all document files.
- Development reset tools work only in `NODE_ENV=development` and should be removed before final deployment.

## Environment variables

Create `server/.env` locally:

```env
NODE_ENV=development
PORT=5000
CLIENT_URL=http://localhost:4200
MONGO_URI=mongodb://127.0.0.1:27017/documentchain_web
JWT_SECRET=change-this-development-secret
JWT_EXPIRES_IN=1d
```

`server/.env.example` can be committed, but `server/.env` must stay local.

## Local setup

Install dependencies from the root and project folders as needed:

```powershell
cd C:\Users\looki\Downloads\document-chain-web\document-chain-web
npm install
cd server
npm install
cd ../client
npm install
```

Start the backend:

```powershell
cd C:\Users\looki\Downloads\document-chain-web\document-chain-web\server
npm run dev
```

Start the frontend:

```powershell
cd C:\Users\looki\Downloads\document-chain-web\document-chain-web\client
npm start
```

Open:

```txt
http://localhost:4200
```

Backend health:

```txt
http://localhost:5000/api/health
```

## Main user flow

1. Register or login.
2. Upload a document.
3. Backend calculates SHA-256 hash.
4. Backend creates a blockchain block.
5. App displays an upload receipt.
6. User can download the receipt JSON locally.
7. User can download their own documents.
8. Public documents can be downloaded and verified by other users.
9. Verify stored document checks the saved file against the blockchain record.
10. Verify uploaded file checks whether a selected file matches an accessible blockchain record.
11. Blockchain Explorer displays the chain and updates live through Socket.io.

## Important API routes

### Auth

```txt
POST /api/auth/register
POST /api/auth/login
GET  /api/auth/me
```

### Documents

```txt
POST  /api/documents/upload
GET   /api/documents/mine
GET   /api/documents/public
GET   /api/documents/:documentId/download
PATCH /api/documents/:documentId/visibility
POST  /api/documents/:documentId/verify
POST  /api/documents/verify-uploaded
```

### Blockchain

```txt
GET /api/blockchain
GET /api/blockchain/validate
```

### Development only

```txt
POST /api/dev/reset-documents-blocks
```

This route should exist only for local development/testing and must not be part of the final production deployment.

## GitHub / CI check before push

Run this from the project root:

```powershell
npm run format
npm run format:check
cd server
npm audit --omit=dev
node --check src/server.js
cd ../client
npm audit --omit=dev
npm run build
cd ..
```

Then commit and push:

```powershell
git status
git add .
git commit -m "Update project documentation and upload receipts"
git push
```

## Final deployment plan

- MongoDB Atlas for database
- Render or Railway for backend
- Netlify or Vercel for Angular frontend
- Environment variables configured on the deploy platforms
- Full online flow test: register, login, upload, receipt download, document download, verify, public document access and live blockchain update
