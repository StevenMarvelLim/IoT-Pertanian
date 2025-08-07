## Project Structure

```
pertanian/
├── backend/              # Node.js backend API
├── frontend/dashboard/   # React frontend dashboard
├── arduino/        # Arduino IoT firmware
```

---

## Getting Started

### Prerequisites
- Node.js (v14+ recommended)
- npm (v6+)
- Arduino IDE (for IoT firmware)
- MySQL (included with XAMPP)

### 1. Database Setup
- Create database named 'iot_pertanian'
- Create table in the database named 'sensor_data' using these SQL:
```
CREATE TABLE sensor_data (
    id INT AUTO_INCREMENT PRIMARY KEY,
    sensor_id VARCHAR(50),
    temperature FLOAT,
    humidity FLOAT,
    soil_moisture FLOAT,
    ldr_value FLOAT,
    rain_value FLOAT,
    air_quality_ppm FLOAT,
    timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
);
```

### 2. Backend Setup

```
cd backend
npm install
npm start
```

### 3. Frontend Setup

```
cd frontend/dashboard
npm install
npm start
```

### 4. IoT Firmware
- Open `arduino/IoT_Pertanian.ino` in the Arduino IDE
- Upload to your Arduino-compatible device
- Configure network and sensor settings as needed


---

## Dependencies
- **Backend:** See `backend/package.json`
- **Frontend:** See `frontend/dashboard/package.json`
- **IoT:** Standard Arduino libraries (see `.ino` file)

---
