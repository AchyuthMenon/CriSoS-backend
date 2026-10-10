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

## 4. API Endpoints

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
