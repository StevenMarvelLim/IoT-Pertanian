# Smart Agriculture IoT

This project consists of three main components:

- **IoT Device**: Collects sensor data (temperature, humidity, soil moisture, rain, air quality, light).
- **Backend (Node.js/Express)**: Receives, stores, and serves sensor data via RESTful APIs.
- **Frontend (React + Material UI)**: A modern dashboard for real-time and historical sensor data visualization.

---

## Project Structure

```
pertanian/
  backend/         # Node.js/Express backend API
  frontend/
    dashboard/     # React frontend dashboard
  IoT_Pertanian/   # Arduino/ESP8266/ESP32 IoT device code
```

---

## 1. IoT Device

- **Location:** `IoT_Pertanian/IoT_Pertanian.ino`
- **Description:**
  - Reads data from sensors (temperature, humidity, soil moisture, rain, air quality, light)
  - Sends data to the backend API via HTTP
- **Setup:**
  - Flash the code to your microcontroller (e.g., ESP8266/ESP32)
  - Configure WiFi credentials and backend API endpoint in the `.ino` file

---

## 2. Database Setup
- 1. Create a new database named iot_pertanian.
- 2. Create the sensor data table by running the following SQL command:
    ```sh
    CREATE TABLE sensor_data (
      id INT AUTO_INCREMENT PRIMARY KEY,
      timestamp DATETIME NOT NULL,
      temperature FLOAT,
      humidity FLOAT,
      ldrValue FLOAT,
      rainValue FLOAT,
      airQualityPPM FLOAT,
      soilMoisture FLOAT
    );
    ```
  
---

## 3. Backend (Node.js/Express)

- **Location:** `backend/`
- **Description:**
  - RESTful API for receiving and serving sensor data
  - Stores data in memory or a database (customize as needed)
- **Setup:**
  1. Install dependencies:
     ```sh
     cd backend
     npm install
     ```
  2. Start the server:
     ```sh
     node server.js
     ```
  3. The API will run on `http://localhost:3001` by default

---

## 4. Frontend (React Dashboard)

- **Location:** `frontend/dashboard/`
- **Description:**
  - Modern dashboard built with React and Material UI
  - Real-time and historical sensor data visualization
  - Search and filter by date
- **Setup:**
  1. Install dependencies:
     ```sh
     cd frontend/dashboard
     npm install
     ```
  2. Start the development server:
     ```sh
     npm start
     ```
  3. Open [http://localhost:3000](http://localhost:3000) in your browser

---

## API Endpoints (Backend)

- `GET /api/sensors/latest` — Get the latest sensor readings
- `GET /api/sensors/historical?hours=24` — Get historical data for the past N hours
- `GET /api/sensors/table` — Get tabular sensor data
- `POST /api/sensors` — (From IoT device) Submit new sensor data

---
