# CriSOS MongoDB Atlas Backend API

Minimal REST API service for persisting offline disaster SOS alerts into **MongoDB Atlas**.

---

## 1. Prerequisites

- **Node.js**: v18+ (tested with v24)
- **MongoDB Atlas Cluster**: Free M0 cluster or higher.

---

## 2. Configuration (`.env`)

1. Copy the example configuration file:
   ```bash
   cp .env.example .env
   ```
2. Open `.env` and fill in your connection details:
   ```env
   PORT=3000
   MONGODB_URI=mongodb+srv://<username>:<password>@<cluster>.mongodb.net/?retryWrites=true&w=majority
   MONGODB_DB_NAME=crisos
   MONGODB_COLLECTION_NAME=sos_messages
   ```
   > ⚠️ **SECURITY WARNING**: Never commit `.env` or your real MongoDB connection URI to version control. The `.gitignore` file already excludes `.env`.

---

## 3. Installation & Starting Server

```bash
# Install dependencies
npm install

# Run unit tests
npm test

# Start the server
npm start
```
By default, the server listens on `http://localhost:3000`.

---

## 4. Project Architecture (MVC)

The backend follows an industry-standard Model-View-Controller (MVC) architecture:

```
CriSoS-backend/
├── src/
│   ├── config/              # Configuration & Database connection
│   │   ├── db.js            # MongoDB Atlas connection manager & collection accessors
│   │   └── env.js           # Centralized environment variables
│   ├── controllers/         # Controller logic (handles requests/responses)
│   │   ├── authController.js   # User registration, login, logout, session check
│   │   ├── healthController.js # Health status & MongoDB ping
│   │   └── sosController.js    # SOS alert CRUD, volunteer toggling, stats, seeding
│   ├── data/                # Static & seed datasets
│   │   └── sampleAlerts.js  # Realistic demo alerts for disaster scenarios
│   ├── middlewares/         # Express middlewares
│   │   └── errorHandler.js  # Global error handling and 404 responses
│   ├── models/              # Model layer (Database operations & collections)
│   │   ├── sosModel.js      # SOS message persistence, filtering, aggregations
│   │   └── userModel.js     # User registration & lookup in MongoDB
│   ├── routes/              # Express route declarations
│   │   ├── authRoutes.js    # /api/auth routes
│   │   ├── healthRoutes.js  # /api/health route
│   │   ├── sosRoutes.js     # /api/sos routes
│   │   └── index.js         # Unified router mounting all sub-routes under /api
│   ├── utils/               # Shared utilities
│   │   └── validators.js    # Validation logic (e.g. validateSosDto)
│   └── app.js               # Express app initialization (CORS, JSON, cookies, routes)
├── test/
│   ├── routes.test.js       # Integration tests for API routes
│   └── server.test.js       # Unit tests for payload validation
├── server.js                # Server entry point & backwards-compatible re-exports
└── package.json
```

---

## 5. API Endpoints

### `POST /api/sos`
Stores or updates an SOS alert in MongoDB Atlas.

* **Idempotency**: Uses the existing SOS `id` (UUID) with MongoDB `updateOne({ id }, { $set }, { upsert: true })`. Duplicate submissions will never create duplicate database documents.
* **Request Headers**: `Content-Type: application/json`
* **Request Body**:
  ```json
  {
    "id": "550e8400-e29b-41d4-a716-446655440000",
    "messageType": "SOS",
    "senderDeviceId": "device_abc_123",
    "emergencyCategory": "MEDICAL",
    "description": "Patient needs insulin and oxygen",
    "assistanceTypes": ["MEDICAL_AID", "RESCUE"],
    "latitude": 12.9716,
    "longitude": 77.5946,
    "locationAccuracyMeters": 5.2,
    "locationTimestamp": 1710000000000,
    "createdAt": 1710000000000,
    "expiresAt": 1710086400000,
    "hopCount": 0,
    "maxHopCount": 5,
    "deliveryStatus": "QUEUED",
    "direction": "OUTGOING",
    "incidentId": null
  }
  ```
* **Success Response (200 OK)**:
  ```json
  {
    "success": true,
    "id": "550e8400-e29b-41d4-a716-446655440000",
    "acknowledged": true,
    "upserted": true,
    "timestamp": 1710000005000
  }
  ```

### `GET /api/health`
Health check endpoint reporting API and database connection status:
```json
{
  "status": "ok",
  "service": "CriSOS MongoDB Atlas Backend",
  "database": "connected",
  "timestamp": "2026-10-10T21:15:00.000Z"
}
```

### `GET /api/sos`
Retrieves stored SOS emergency signals from MongoDB Atlas with optional filtering and pagination:
* **Query Parameters**:
  * `category`: Filter by emergency category (e.g. `FLOOD`, `FIRE`, `MEDICAL`, `TRAPPED`, or `ALL`)
  * `status`: Filter by delivery status (e.g. `QUEUED`, `SENT`, `RESOLVED`, or `ALL`)
  * `search`: Text search across UUID, senderDeviceId, category, description, and assistance tags
  * `limit`: Maximum records to return (default: `50`, max: `250`)
  * `skip`: Number of records to skip for pagination
* **Success Response (200 OK)**:
  ```json
  {
    "success": true,
    "count": 46,
    "total": 46,
    "data": [ /* Array of SOS document objects */ ]
  }
  ```

### `GET /api/sos/stats`
Returns aggregated telemetry statistics and category breakdowns for overview cards.

### `PATCH /api/sos/:id/status`
Updates delivery status (e.g. `RESOLVED`, `IN_PROGRESS`) and appends responder notes to an emergency signal.

