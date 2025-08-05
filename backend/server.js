require('dotenv').config();
const express = require('express');
const mysql = require('mysql2');
const cors = require('cors');

const app = express();
app.use(cors());
app.use(express.json());

// MySQL connection
const db = mysql.createConnection({
  host: 'localhost',
  user: 'root',
  password: '',
  database: 'iot_pertanian'
});

// Connect to MySQL
db.connect((err) => {
  if (err) {
    console.error('Error connecting to MySQL:', err);
    console.error('Please make sure:');
    console.error('1. MySQL service is running in XAMPP');
    console.error('2. Database "iot_pertanian" exists');
    console.error('3. MySQL credentials are correct');
    return;
  }
  console.log('Connected to MySQL database');

  // Create database if it doesn't exist
  db.query('CREATE DATABASE IF NOT EXISTS iot_pertanian', (err) => {
    if (err) {
      console.error('Error creating database:', err);
      return;
    }
    console.log('Database iot_pertanian ready');

    // Use the database
    db.query('USE iot_pertanian', (err) => {
      if (err) {
        console.error('Error selecting database:', err);
        return;
      }

      // Create table if it doesn't exist
      const createTableQuery = `
        CREATE TABLE IF NOT EXISTS sensor_data (
          id INT AUTO_INCREMENT PRIMARY KEY,
          temperature FLOAT,
          humidity FLOAT,
          ldrValue INT,
          rainValue INT,
          airQualityPPM FLOAT,
          soilMoisture INT,
          timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
      `;

      db.query(createTableQuery, (err) => {
        if (err) {
          console.error('Error creating table:', err);
          return;
        }
        console.log('Sensor data table ready');

        // Insert sample data if table is empty
        db.query('SELECT COUNT(*) as count FROM sensor_data', (err, results) => {
          if (err) {
            console.error('Error checking table data:', err);
            return;
          }

          if (results[0].count === 0) {
            console.log('Inserting sample data...');
            
            // Generate 10 sample data points
            const now = new Date();
            const sampleDataPoints = Array.from({ length: 10 }, (_, i) => {
              const timestamp = new Date(now - (9 - i) * 60000);
              return {
                temperature: 25 + Math.random() * 5,
                humidity: 60 + Math.random() * 10,
                ldrValue: 500 + Math.random() * 200,
                rainValue: 600 + Math.random() * 200,
                airQualityPPM: 7 + Math.random() * 3,
                soilMoisture: 500 + Math.random() * 200,
                timestamp: timestamp.toISOString().slice(0, 19).replace('T', ' ')
              };
            });

            // Insert each sample data point
            sampleDataPoints.forEach(data => {
              const query = `
                INSERT INTO sensor_data 
                (temperature, humidity, ldrValue, rainValue, airQualityPPM, soilMoisture, timestamp)
                VALUES (?, ?, ?, ?, ?, ?, ?)
              `;

              db.query(
                query,
                [
                  data.temperature,
                  data.humidity,
                  data.ldrValue,
                  data.rainValue,
                  data.airQualityPPM,
                  data.soilMoisture,
                  data.timestamp
                ],
                (err) => {
                  if (err) {
                    console.error('Error inserting sample data:', err);
                  }
                }
              );
            });
            
            console.log('Sample data points inserted successfully');
          }
        });
      });
    });
  });
});

// Data validation
function validateSensorData(data) {
  return (
    typeof data === 'object' &&
    data !== null &&
    typeof data.temperature === 'number' &&
    typeof data.humidity === 'number' &&
    typeof data.ldrValue === 'number' &&
    typeof data.rainValue === 'number' &&
    typeof data.airQualityPPM === 'number' &&
    typeof data.soilMoisture === 'number' &&
    typeof data.timestamp === 'string'
  );
}

// API Endpoints
app.post('/api/sensors/data', (req, res) => {
  if (!validateSensorData(req.body)) {
    return res.status(400).json({ error: 'Invalid sensor data format' });
  }

  const { temperature, humidity, ldrValue, rainValue, airQualityPPM, soilMoisture, timestamp } = req.body;
  
  const query = `
    INSERT INTO sensor_data 
    (temperature, humidity, ldrValue, rainValue, airQualityPPM, soilMoisture, timestamp)
    VALUES (?, ?, ?, ?, ?, ?, STR_TO_DATE(?, '%Y-%m-%d %H:%i:%s'))
  `;

  db.query(
    query,
    [temperature, humidity, ldrValue, rainValue, airQualityPPM, soilMoisture, timestamp],
    (err, results) => {
      if (err) {
        console.error('Error saving sensor data:', err);
        return res.status(500).json({ error: 'Error saving sensor data', details: err.message });
      }
      res.json({ message: 'Sensor data saved successfully', id: results.insertId });
    }
  );
});

// Get latest sensor data
app.get('/api/sensors/latest', (req, res) => {
  const query = 'SELECT * FROM sensor_data ORDER BY timestamp DESC LIMIT 1';
  
  db.query(query, (err, results) => {
    if (err) {
      console.error('Error fetching latest data:', err);
      return res.status(500).json({ error: 'Error fetching latest data' });
    }
    
    if (results.length === 0) {
      return res.json({
        temperature: { value: 0, status: 'medium' },
        humidity: { value: 0, status: 'medium' },
        ldrValue: { value: 0, status: 'medium' },
        rainValue: { value: 0, status: 'medium' },
        airQualityPPM: { value: 0, status: 'medium' },
        soilMoisture: { value: 0, status: 'medium' }
      });
    }

    const data = results[0];
    res.json({
      temperature: { value: data.temperature, status: getStatus(data.temperature, 20, 25) },
      humidity: { value: data.humidity, status: getStatus(data.humidity, 70, 80) },
      ldrValue: { value: data.ldrValue, status: getStatus(data.ldrValue, 400, 600, true) },
      rainValue: { value: data.rainValue, status: getStatus(data.rainValue, 880, 940, true) },
      airQualityPPM: { value: data.airQualityPPM, status: getStatus(data.airQualityPPM, 400, 800) },
      soilMoisture: { value: data.soilMoisture, status: getStatus(data.soilMoisture, 200, 400) }
    });
  });
});

// Get historical sensor data
app.get('/api/sensors/historical', (req, res) => {
  const { hours = 24 } = req.query;
  
  const query = `
    SELECT * FROM sensor_data 
    WHERE timestamp >= DATE_SUB(NOW(), INTERVAL ? HOUR)
    AND timestamp <= NOW()
    ORDER BY timestamp ASC`;
  
  db.query(query, [hours], (err, results) => {
    if (err) {
      console.error('Error fetching historical data:', err);
      return res.status(500).json({ error: 'Error fetching historical data' });
    }

    // If no results, return empty structure
    if (!results || results.length === 0) {
      return res.json({
        labels: [],
        datasets: {
          temperature: [],
          humidity: [],
          ldrValue: [],
          rainValue: [],
          airQualityPPM: [],
          soilMoisture: []
        }
      });
    }

    // Format timestamps with full date information
    const labels = results.map(r => {
      const date = new Date(r.timestamp);
      return {
        display: date.toLocaleString('en-US', { 
          month: 'short',
          day: 'numeric',
          hour: '2-digit', 
          minute: '2-digit',
          hour12: false 
        }),
        timestamp: date.getTime()
      };
    });

    // Ensure all data points exist with proper number formatting
    const datasets = {
      temperature: results.map(r => Number(r.temperature) || 0),
      humidity: results.map(r => Number(r.humidity) || 0),
      ldrValue: results.map(r => Number(r.ldrValue) || 0),
      rainValue: results.map(r => Number(r.rainValue) || 0),
      airQualityPPM: results.map(r => Number(r.airQualityPPM) || 0),
      soilMoisture: results.map(r => Number(r.soilMoisture) || 0)
    };

    res.json({ 
      labels,
      datasets,
      timeRange: Number(hours)
    });
  });
});

// Get table data
app.get('/api/sensors/table', (req, res) => {
  const query = `
    SELECT 
      id,
      temperature,
      humidity,
      ldrValue,
      rainValue,
      airQualityPPM,
      soilMoisture,
      timestamp
    FROM sensor_data 
    ORDER BY timestamp DESC 
    LIMIT 1000
  `;
  
  db.query(query, (err, results) => {
    if (err) {
      console.error('Error fetching table data:', err);
      return res.status(500).json({ error: 'Error fetching table data' });
    }
    res.json(results);
  });
});

app.get('/api/sensors/average', (req, res) => {
  const { hours, date } = req.query;
  let query = '';
  let params = [];

  if (date) {
    // Average for a specific date (YYYY-MM-DD)
    query = `SELECT 
      AVG(temperature) AS temperature,
      AVG(humidity) AS humidity,
      AVG(ldrValue) AS ldrValue,
      AVG(rainValue) AS rainValue,
      AVG(airQualityPPM) AS airQualityPPM,
      AVG(soilMoisture) AS soilMoisture
    FROM sensor_data
    WHERE DATE(timestamp) = ?`;
    params = [date];
  } else if (hours) {
    // Average for the last N hours
    query = `SELECT 
      AVG(temperature) AS temperature,
      AVG(humidity) AS humidity,
      AVG(ldrValue) AS ldrValue,
      AVG(rainValue) AS rainValue,
      AVG(airQualityPPM) AS airQualityPPM,
      AVG(soilMoisture) AS soilMoisture
    FROM sensor_data
    WHERE timestamp >= DATE_SUB(NOW(), INTERVAL ? HOUR)
      AND timestamp <= NOW()`;
    params = [hours];
  } else {
    // Average for all data
    query = `SELECT 
      AVG(temperature) AS temperature,
      AVG(humidity) AS humidity,
      AVG(ldrValue) AS ldrValue,
      AVG(rainValue) AS rainValue,
      AVG(airQualityPPM) AS airQualityPPM,
      AVG(soilMoisture) AS soilMoisture
    FROM sensor_data`;
  }

  db.query(query, params, (err, results) => {
    if (err) {
      console.error('Error fetching average sensor values:', err);
      return res.status(500).json({ error: 'Error fetching average sensor values' });
    }
    if (!results || results.length === 0) {
      return res.json({
        temperature: 0,
        humidity: 0,
        ldrValue: 0,
        rainValue: 0,
        airQualityPPM: 0,
        soilMoisture: 0
      });
    }
    const data = results[0];
    res.json({
      temperature: Number(data.temperature) || 0,
      humidity: Number(data.humidity) || 0,
      ldrValue: Number(data.ldrValue) || 0,
      rainValue: Number(data.rainValue) || 0,
      airQualityPPM: Number(data.airQualityPPM) || 0,
      soilMoisture: Number(data.soilMoisture) || 0
    });
  });
});

// Helper function to determine status
function getStatus(value, lowThreshold, highThreshold, isInverted = false) {
  if (isInverted) {
    if (value > highThreshold) return 'low';
    if (value < lowThreshold) return 'high';
    return 'medium';
  } else {
    if (value < lowThreshold) return 'low';
    if (value > highThreshold) return 'high';
    return 'medium';
  }
}

// Error handling middleware
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ error: 'Something broke!' });
});

// Start server
const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
}); 