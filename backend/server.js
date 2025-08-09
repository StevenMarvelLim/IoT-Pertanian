require('dotenv').config();
const express = require('express');
const mysql = require('mysql2');
const cors = require('cors');

const app = express();
app.use(cors());
app.use(express.json());

const pool = mysql.createPool({
  host: 'localhost',
  user: 'root',
  password: '',
  database: 'iot_pertanian',
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
  acquireTimeout: 60000,
  timeout: 60000,
  reconnect: true
});

const db = pool.promise();

const cache = new Map();
const CACHE_TTL = 5000;

async function getCachedData(key, fetchFunction, ttl = CACHE_TTL) {
  const cached = cache.get(key);
  if (cached && Date.now() - cached.timestamp < ttl) {
    return cached.data;
  }
  
  const data = await fetchFunction();
  cache.set(key, { data, timestamp: Date.now() });
  return data;
}

async function initializeDatabase() {
  try {
    await db.query('CREATE DATABASE IF NOT EXISTS iot_pertanian');
    await db.query('USE iot_pertanian');
    
    const createTableQuery = `
      CREATE TABLE IF NOT EXISTS sensor_data (
        id INT AUTO_INCREMENT PRIMARY KEY,
        temperature FLOAT,
        humidity FLOAT,
        ldrValue INT,
        rainValue INT,
        airQualityPPM FLOAT,
        soilMoisture INT,
        timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        INDEX idx_timestamp (timestamp)
      )
    `;
    
    await db.query(createTableQuery);
    
    const [countResult] = await db.query('SELECT COUNT(*) as count FROM sensor_data');
    
    if (countResult[0].count === 0) {
      console.log('Inserting sample data...');
      
      const now = new Date();
      const sampleDataPoints = Array.from({ length: 10 }, (_, i) => {
        const timestamp = new Date(now - (9 - i) * 60000);
        return [
          25 + Math.random() * 5,
          60 + Math.random() * 10,
          500 + Math.random() * 200,
          600 + Math.random() * 200,
          7 + Math.random() * 3,
          500 + Math.random() * 200,
          timestamp.toISOString().slice(0, 19).replace('T', ' ')
        ];
      });

      const insertQuery = `
        INSERT INTO sensor_data 
        (temperature, humidity, ldrValue, rainValue, airQualityPPM, soilMoisture, timestamp)
        VALUES ?
      `;
      
      await db.query(insertQuery, [sampleDataPoints]);
      console.log('Sample data inserted successfully');
    }
    
    console.log('Database initialized successfully');
  } catch (error) {
    console.error('Error initializing database:', error);
    throw error;
  }
}

initializeDatabase().catch(console.error);

function validateSensorData(data) {
  const required = ['temperature', 'humidity', 'ldrValue', 'rainValue', 'airQualityPPM', 'soilMoisture'];
  const missing = required.filter(field => !(field in data));
  
  if (missing.length > 0) {
    return { valid: false, error: `Missing required fields: ${missing.join(', ')}` };
  }
  
  const numeric = required.filter(field => {
    const value = data[field];
    return typeof value === 'number' && !isNaN(value);
  });
  
  if (numeric.length !== required.length) {
    return { valid: false, error: 'All sensor values must be numeric' };
  }
  
  return { valid: true };
}

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

app.post('/api/sensors', async (req, res) => {
  try {
    const sensorData = req.body;
    const validation = validateSensorData(sensorData);
    
    if (!validation.valid) {
      return res.status(400).json({ error: validation.error });
    }
    
    const query = `
      INSERT INTO sensor_data 
      (temperature, humidity, ldrValue, rainValue, airQualityPPM, soilMoisture)
      VALUES (?, ?, ?, ?, ?, ?)
    `;
    
    const values = [
      sensorData.temperature,
      sensorData.humidity,
      sensorData.ldrValue,
      sensorData.rainValue,
      sensorData.airQualityPPM,
      sensorData.soilMoisture
    ];
    
    await db.query(query, values);
    
    cache.clear();
    
    res.json({ message: 'Sensor data received successfully' });
  } catch (error) {
    console.error('Error saving sensor data:', error);
    res.status(500).json({ error: 'Error saving sensor data' });
  }
});

app.get('/api/sensors/latest', async (req, res) => {
  try {
    const data = await getCachedData('latest', async () => {
      const [results] = await db.query(`
        SELECT * FROM sensor_data 
        ORDER BY timestamp DESC 
        LIMIT 1
      `);
      
      if (!results || results.length === 0) {
        return {
          temperature: { value: 0, status: 'medium' },
          humidity: { value: 0, status: 'medium' },
          ldrValue: { value: 0, status: 'medium' },
          rainValue: { value: 0, status: 'medium' },
          airQualityPPM: { value: 0, status: 'medium' },
          soilMoisture: { value: 0, status: 'medium' }
        };
      }
      
      const latest = results[0];
      return {
        temperature: { 
          value: Number(latest.temperature), 
          status: getStatus(Number(latest.temperature), 20, 25) 
        },
        humidity: { 
          value: Number(latest.humidity), 
          status: getStatus(Number(latest.humidity), 70, 80) 
        },
        ldrValue: { 
          value: Number(latest.ldrValue), 
          status: getStatus(Number(latest.ldrValue), 400, 600, true) 
        },
        rainValue: { 
          value: Number(latest.rainValue), 
          status: getStatus(Number(latest.rainValue), 880, 940, true) 
        },
        airQualityPPM: { 
          value: Number(latest.airQualityPPM), 
          status: getStatus(Number(latest.airQualityPPM), 400, 800) 
        },
        soilMoisture: { 
          value: Number(latest.soilMoisture), 
          status: getStatus(Number(latest.soilMoisture), 200, 400) 
        }
      };
    });
    
    res.json(data);
  } catch (error) {
    console.error('Error fetching latest data:', error);
    res.status(500).json({ error: 'Error fetching latest data' });
  }
});

app.get('/api/sensors/historical', async (req, res) => {
  try {
    const { hours = 24 } = req.query;
    const cacheKey = `historical_${hours}`;
    
    const data = await getCachedData(cacheKey, async () => {
      const [results] = await db.query(`
        SELECT * FROM sensor_data 
        WHERE timestamp >= DATE_SUB(NOW(), INTERVAL ? HOUR)
        AND timestamp <= NOW()
        ORDER BY timestamp ASC
      `, [hours]);
      
      if (!results || results.length === 0) {
        return {
          labels: [],
          datasets: {
            temperature: [],
            humidity: [],
            ldrValue: [],
            rainValue: [],
            airQualityPPM: [],
            soilMoisture: []
          }
        };
      }
      
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
      
      const datasets = {
        temperature: results.map(r => Number(r.temperature) || 0),
        humidity: results.map(r => Number(r.humidity) || 0),
        ldrValue: results.map(r => Number(r.ldrValue) || 0),
        rainValue: results.map(r => Number(r.rainValue) || 0),
        airQualityPPM: results.map(r => Number(r.airQualityPPM) || 0),
        soilMoisture: results.map(r => Number(r.soilMoisture) || 0)
      };
      
      return { 
        labels,
        datasets,
        timeRange: Number(hours)
      };
    });
    
    res.json(data);
  } catch (error) {
    console.error('Error fetching historical data:', error);
    res.status(500).json({ error: 'Error fetching historical data' });
  }
});

app.get('/api/sensors/table', async (req, res) => {
  try {
    const data = await getCachedData('table', async () => {
      const [results] = await db.query(`
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
      `);
      
      return results;
    });
    
    res.json(data);
  } catch (error) {
    console.error('Error fetching table data:', error);
    res.status(500).json({ error: 'Error fetching table data' });
  }
});

app.get('/api/sensors/average', async (req, res) => {
  try {
    const { hours, date } = req.query;
    const cacheKey = `average_${hours || 'all'}_${date || 'no_date'}`;
    
    const data = await getCachedData(cacheKey, async () => {
      let query = '';
      let params = [];
      
      if (date) {
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
        query = `SELECT 
          AVG(temperature) AS temperature,
          AVG(humidity) AS humidity,
          AVG(ldrValue) AS ldrValue,
          AVG(rainValue) AS rainValue,
          AVG(airQualityPPM) AS airQualityPPM,
          AVG(soilMoisture) AS soilMoisture
        FROM sensor_data`;
      }
      
      const [results] = await db.query(query, params);
      
      if (!results || results.length === 0) {
        return {
          temperature: 0,
          humidity: 0,
          ldrValue: 0,
          rainValue: 0,
          airQualityPPM: 0,
          soilMoisture: 0
        };
      }
      
      const data = results[0];
      return {
        temperature: Number(data.temperature) || 0,
        humidity: Number(data.humidity) || 0,
        ldrValue: Number(data.ldrValue) || 0,
        rainValue: Number(data.rainValue) || 0,
        airQualityPPM: Number(data.airQualityPPM) || 0,
        soilMoisture: Number(data.soilMoisture) || 0
      };
    });
    
    res.json(data);
  } catch (error) {
    console.error('Error fetching average sensor values:', error);
    res.status(500).json({ error: 'Error fetching average sensor values' });
  }
});

app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ error: 'Something broke!' });
});

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
}); 