import React, { useState, useEffect } from 'react';
import { 
  Box, 
  Container, 
  Grid, 
  Paper, 
  Typography, 
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TextField,
  IconButton,
  Tooltip,
  Select,
  MenuItem,
  FormControl,
  InputLabel
} from '@mui/material';
import { Line } from 'react-chartjs-2';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip as ChartTooltip,
  Legend
} from 'chart.js';
import InfoIcon from '@mui/icons-material/Info';
import './App.css';

ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  ChartTooltip,
  Legend
);

function App() {
  const [sensorData, setSensorData] = useState({
    temperature: { value: 0, status: 'medium' },
    humidity: { value: 0, status: 'medium' },
    ldrValue: { value: 0, status: 'medium' },
    rainValue: { value: 0, status: 'medium' },
    airQualityPPM: { value: 0, status: 'medium' },
    soilMoisture: { value: 0, status: 'medium' }
  });

  const [historicalData, setHistoricalData] = useState({
    labels: [],
    datasets: {},
    timeRange: 24
  });

  const [timeRange, setTimeRange] = useState(24);
  const [tableData, setTableData] = useState([]);
  const [searchDate, setSearchDate] = useState('');

  useEffect(() => {
    const fetchData = async () => {
      try {
        // Fetch latest data
        const latestResponse = await fetch('http://localhost:3001/api/sensors/latest');
        const latestData = await latestResponse.json();
        setSensorData(latestData);

        // Fetch historical data with time range
        const historicalResponse = await fetch(`http://localhost:3001/api/sensors/historical?hours=${timeRange}`);
        const newHistoricalData = await historicalResponse.json();
        
        // Update time range if it doesn't match the response
        if (newHistoricalData.timeRange !== timeRange) {
          setTimeRange(newHistoricalData.timeRange);
        }
        
        setHistoricalData(newHistoricalData);

        // Fetch table data
        const tableResponse = await fetch('http://localhost:3001/api/sensors/table');
        let tableData = await tableResponse.json();
        if (!Array.isArray(tableData)) {
          tableData = [];
        }
        setTableData(tableData);
      } catch (error) {
        console.error('Error fetching data:', error);
      }
    };

    fetchData();
    const interval = setInterval(fetchData, 5000);
    return () => clearInterval(interval);
  }, [timeRange]);

  const getStatusColor = (status, sensorKey) => {
    if (sensorKey === 'airQualityPPM') {
      if (status === 'high') return '#f44336';
      if (status === 'low') return '#4caf50';
    }

    // Color logic for Light (ldrValue)
    if (sensorKey === 'ldrValue') {
      if (status === 'high') return '#4caf50';
      if (status === 'low') return '#f44336';
      return '#ff9800';
    }

    // Color logic for Temperature
    if (sensorKey === 'temperature') {
      if (status === 'high') return '#f44336';
      if (status === 'low') return '#4caf50';
      return '#ff9800';
    }

    switch (status) {
      case 'high':
      case 'excellent':
        return '#4caf50'; // green
      case 'good':
        return '#8bc34a'; // light green
      case 'medium':
      case 'moderate':
        return '#ff9800'; // orange
      case 'poor':
        return '#ff6b6b'; // light red
      case 'low':
      case 'very poor':
        return '#f44336'; // red
      default:
        return '#757575'; // grey
    }
  };

  const getSensorIcon = (type) => {
    switch(type) {
      case 'temperature':
        return '🌡️';
      case 'humidity':
        return '💧';
      case 'soilMoisture':
        return '🌱';
      case 'rainValue':
        return '🌧️';
      case 'airQualityPPM':
        return '🌫️';
      case 'ldrValue':
        return '☀️';
      default:
        return '📊';
    }
  };

  const getSensorName = (key) => {
    switch(key) {
      case 'temperature':
        return 'Temperature';
      case 'humidity':
        return 'Humidity';
      case 'soilMoisture':
        return 'Soil Moisture';
      case 'rainValue':
        return 'Rain';
      case 'airQualityPPM':
        return 'Air Quality';
      case 'ldrValue':
        return 'Light';
      default:
        // Handle camelCase by splitting on uppercase letters
        const words = key.replace(/([A-Z])/g, ' $1');
        return words.charAt(0).toUpperCase() + words.slice(1);
    }
  };

  const SensorCard = ({ sensorKey, title, value, status }) => (
    <Paper
      elevation={3}
      className={`sensor-card ${sensorKey} status-${status}`}
    >
      <Box className="sensor-card-header">
        <Typography variant="h6" component="h3" className="sensor-icon">
          {getSensorIcon(sensorKey)}
        </Typography>
        <Typography variant="subtitle2" component="div" className="sensor-title">
          {title}
        </Typography>
        <Tooltip title={`Status: ${status.toUpperCase()}`}>
          <IconButton size="small">
            <InfoIcon style={{ color: getStatusColor(status, sensorKey), fontSize: '0.875rem' }} />
          </IconButton>
        </Tooltip>
      </Box>
      <Box className="sensor-value-container">
        <Typography variant="h5" component="div" className="sensor-value" style={{ color: getStatusColor(status, sensorKey) }}>
          {value}
        </Typography>
        <Typography variant="caption" className="sensor-status">
          {status}
        </Typography>
      </Box>
    </Paper>
  );

  const TimeRangeSelector = () => {
    const endDate = new Date();
    const startDate = new Date(endDate - (timeRange * 60 * 60 * 1000));
    
    const formatDate = (date) => {
      return date.toLocaleString('en-US', {
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        hour12: false
      });
    };

    return (
      <Box className="time-range-container">
        <Typography variant="caption" className="time-range-text">
          {formatDate(startDate)} - {formatDate(endDate)}
        </Typography>
        <FormControl size="small" className="time-range-select">
          <InputLabel>Time Range</InputLabel>
          <Select
            value={timeRange}
            label="Time Range"
            onChange={(e) => setTimeRange(e.target.value)}
          >
            <MenuItem value={1}>Last Hour</MenuItem>
            <MenuItem value={6}>Last 6 Hours</MenuItem>
            <MenuItem value={12}>Last 12 Hours</MenuItem>
            <MenuItem value={24}>Last 24 Hours</MenuItem>
            <MenuItem value={48}>Last 2 Days</MenuItem>
            <MenuItem value={168}>Last Week</MenuItem>
          </Select>
        </FormControl>
      </Box>
    );
  };

  const SensorGraph = ({ sensorKey, title }) => {
    const options = {
      responsive: true,
      maintainAspectRatio: false,
      plugins: { 
        legend: { display: false },
        tooltip: {
          backgroundColor: 'rgba(0,0,0,0.8)',
          titleColor: '#fff',
          bodyColor: '#fff',
          padding: 10,
          cornerRadius: 4,
          callbacks: {
            title: (context) => {
              if (context[0]?.label) {
                return context[0].label;
              }
              return '';
            }
          }
        }
      },
      scales: {
        x: {
          grid: {
            display: true,
            color: 'rgba(0,0,0,0.03)',
            drawBorder: false
          },
          ticks: {
            display: true,
            maxRotation: 45,
            minRotation: 45,
            maxTicksLimit: 12,
            font: {
              size: 10
            },
            color: '#666666',
            callback: function(val, index) {
              // Get the label object
              const labelObj = this.chart.data.labels[index];
              if (labelObj) {
                return labelObj.display;
              }
              return '';
            }
          }
        },
        y: {
          grid: {
            display: true,
            color: 'rgba(0,0,0,0.03)',
            drawBorder: false
          },
          ticks: {
            display: true,
            stepSize: 10,
            font: {
              size: 10
            },
            color: '#666666'
          },
          min: 0,
          max: 100,
          beginAtZero: true
        }
      }
    };
  
    if (sensorKey === 'soilMoisture' || sensorKey === 'ldrValue' || sensorKey === 'rainValue' || sensorKey === 'airQualityPPM') {
      options.scales.y.max = 1000;
      options.scales.y.ticks.stepSize = 100;
    }
  
    return (
      <Paper elevation={3} className="graph-container">
        <Typography variant="subtitle2" className="graph-title">
          {getSensorIcon(sensorKey)} {title}
        </Typography>
        <Box className="graph-content">
          <Line
            data={{
              labels: (historicalData.labels || []).slice(-10),
              datasets: [{
                label: title,
                data: (historicalData.datasets[sensorKey] || []).slice(-10),
                borderColor: getStatusColor(sensorData[sensorKey]?.status || 'medium', sensorKey),
                backgroundColor: `${getStatusColor(sensorData[sensorKey]?.status || 'medium', sensorKey)}10`,
                tension: 0.4,
                fill: true,
                borderWidth: 2,
                pointRadius: 3,
                pointStyle: 'circle',
                pointBackgroundColor: getStatusColor(sensorData[sensorKey]?.status || 'medium', sensorKey),
                pointBorderColor: '#ffffff',
                pointBorderWidth: 1,
                pointHoverRadius: 5,
                pointHoverBackgroundColor: getStatusColor(sensorData[sensorKey]?.status || 'medium', sensorKey),
                pointHoverBorderColor: '#ffffff',
                pointHoverBorderWidth: 2,
                spanGaps: true
              }]
            }}
            options={{
              ...options,
              animation: {
                duration: 0
              },
              hover: {
                animationDuration: 0
              },
              responsiveAnimationDuration: 0,
              elements: {
                line: {
                  tension: 0.4
                }
              },
              plugins: {
                ...options.plugins,
                decimation: {
                  enabled: true,
                  algorithm: 'min-max'
                }
              }
            }}
          />
        </Box>
      </Paper>
    );
  };

  const filteredTableData = tableData.filter(row => {
    if (!searchDate) return true;
    const date = new Date(row.timestamp);
    if (!row.timestamp || isNaN(date)) {
      return false;
    }
    const rowDate = date.toISOString().split('T')[0];
    return rowDate.includes(searchDate);
  });

  return (
    <Box className="dashboard-container">
      <Container maxWidth="xl">
        {/* Header with Date */}
        <Box className="dashboard-header">
          <Typography variant="h4" component="h1" className="dashboard-title">
            Smart Agriculture Dashboard
          </Typography>
          <Typography variant="h6" className="dashboard-date">
            {new Date().toLocaleDateString('en-US', { 
              weekday: 'long', 
              year: 'numeric', 
              month: 'long', 
              day: 'numeric' 
            })}
          </Typography>
        </Box>

        <Grid container spacing={2} sx={{ alignItems: 'flex-start' }} justifyContent="space-between">
          {/* Left Column: Latest Data Cards in Big Box */}
          <Grid item xs={6}>
            <Paper elevation={4} className="main-card">
              <Typography variant="h5" gutterBottom className="card-title">
                📊 Latest Sensor Data
              </Typography>
              
              <Box className="sensor-cards-container">
                <Box className="sensor-cards-row">
                  <Box sx={{ flex: 1 }}>
                    <SensorCard
                      sensorKey="temperature"
                      title={getSensorName('temperature')}
                      value={sensorData.temperature.value}
                      status={sensorData.temperature.status}
                    />
                  </Box>
                  <Box sx={{ flex: 1 }}>
                    <SensorCard
                      sensorKey="humidity"
                      title={getSensorName('humidity')}
                      value={sensorData.humidity.value}
                      status={sensorData.humidity.status}
                    />
                  </Box>
                </Box>
                
                <Box className="sensor-cards-row">
                  <Box sx={{ flex: 1 }}>
                    <SensorCard
                      sensorKey="ldrValue"
                      title={getSensorName('ldrValue')}
                      value={sensorData.ldrValue.value}
                      status={sensorData.ldrValue.status}
                    />
                  </Box>
                  <Box sx={{ flex: 1 }}>
                    <SensorCard
                      sensorKey="rainValue"
                      title={getSensorName('rainValue')}
                      value={sensorData.rainValue.value}
                      status={sensorData.rainValue.status}
                    />
                  </Box>
                </Box>
                
                <Box className="sensor-cards-row">
                  <Box sx={{ flex: 1 }}>
                    <SensorCard
                      sensorKey="airQualityPPM"
                      title={getSensorName('airQualityPPM')}
                      value={sensorData.airQualityPPM.value}
                      status={sensorData.airQualityPPM.status}
                    />
                  </Box>
                  <Box sx={{ flex: 1 }}>
                    <SensorCard
                      sensorKey="soilMoisture"
                      title={getSensorName('soilMoisture')}
                      value={sensorData.soilMoisture.value}
                      status={sensorData.soilMoisture.status}
                    />
                  </Box>
                </Box>
              </Box>
            </Paper>
          </Grid>

          {/* Right Column: Historical Data */}
          <Grid item xs={6}>
            <Paper elevation={4} className="historical-card">
              <Box className="historical-header">
                <Typography variant="h5" className="card-title">
                  📈 Historical Trends
                </Typography>
                <TimeRangeSelector />
              </Box>
              
              <Box className="historical-content">
                <Grid container spacing={1}>
                  <Grid item xs={4}>
                    <SensorGraph sensorKey="temperature" title={getSensorName('temperature')} />
                  </Grid>
                  <Grid item xs={4}>
                    <SensorGraph sensorKey="humidity" title={getSensorName('humidity')} />
                  </Grid>
                  <Grid item xs={4}>
                    <SensorGraph sensorKey="ldrValue" title={getSensorName('ldrValue')} />
                  </Grid>
                </Grid>
                
                <Grid container spacing={1}>
                  <Grid item xs={4}>
                    <SensorGraph sensorKey="rainValue" title={getSensorName('rainValue')} />
                  </Grid>
                  <Grid item xs={4}>
                    <SensorGraph sensorKey="airQualityPPM" title={getSensorName('airQualityPPM')} />
                  </Grid>
                  <Grid item xs={4}>
                    <SensorGraph sensorKey="soilMoisture" title={getSensorName('soilMoisture')} />
                  </Grid>
                </Grid>
              </Box>
            </Paper>
          </Grid>

          {/* Bottom Row: Data Table */}
          <Grid item xs={12}>
            <Paper elevation={4} className="table-card">
              <Box className="table-header">
                <Typography variant="h5" className="card-title">
                  📊 Sensor Data History
                </Typography>
                <TextField
                  label="Search by Date (YYYY-MM-DD)"
                  variant="outlined"
                  size="small"
                  value={searchDate}
                  onChange={(e) => setSearchDate(e.target.value)}
                  className="search-field"
                />
              </Box>
              <TableContainer className="table-container">
                <Table stickyHeader size="small">
                  <TableHead>
                    <TableRow>
                      <TableCell sx={{ borderRadius: '8px 0 0 0', fontWeight: 'bold' }}>Date</TableCell>
                      <TableCell sx={{ fontWeight: 'bold' }}>Time</TableCell>
                      {Object.keys(sensorData).map((key) => (
                        <TableCell key={key} align="center" sx={{ fontWeight: 'bold' }}>
                          {getSensorIcon(key)} {getSensorName(key)}
                        </TableCell>
                      ))}
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {filteredTableData.map((row, index) => {
                      const date = new Date(row.timestamp);
                      const isDateValid = row.timestamp && !isNaN(date);

                      return (
                        <TableRow key={index} hover>
                          <TableCell>
                            {isDateValid ? date.toLocaleDateString() : 'N/A'}
                          </TableCell>
                          <TableCell>
                            {isDateValid ? date.toLocaleTimeString() : 'N/A'}
                          </TableCell>
                          {Object.keys(sensorData).map((key) => (
                            <TableCell key={key} align="center">
                              <Box className="table-cell-value">
                                <Typography variant="body2" className="table-value" style={{ color: getStatusColor(sensorData[key]?.status, key) }}>
                                  {row[key] || '-'}
                                </Typography>
                                <Typography variant="caption" className="table-status">
                                  {sensorData[key]?.status.toUpperCase()}
                                </Typography>
                              </Box>
                            </TableCell>
                          ))}
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </TableContainer>
            </Paper>
          </Grid>
        </Grid>
      </Container>
    </Box>
  );
}

export default App; 