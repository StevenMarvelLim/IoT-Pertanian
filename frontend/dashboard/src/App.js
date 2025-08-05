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
  const [averageSensorData, setAverageSensorData] = useState({
    temperature: 0,
    humidity: 0,
    ldrValue: 0,
    rainValue: 0,
    airQualityPPM: 0,
    soilMoisture: 0
  });

  const sensorKeys = [
    'temperature',
    'humidity',
    'ldrValue',
    'rainValue',
    'airQualityPPM',
    'soilMoisture'
  ];

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

  // Fetch average sensor data when timeRange or searchDate changes
  useEffect(() => {
    const fetchAverage = async () => {
      try {
        let url = 'http://localhost:3001/api/sensors/average';
        if (searchDate) {
          url += `?date=${searchDate}`;
        } else if (timeRange) {
          url += `?hours=${timeRange}`;
        }
        const res = await fetch(url);
        const data = await res.json();
        setAverageSensorData(data);
      } catch (err) {
        setAverageSensorData({
          temperature: 0,
          humidity: 0,
          ldrValue: 0,
          rainValue: 0,
          airQualityPPM: 0,
          soilMoisture: 0
        });
      }
    };
    fetchAverage();
  }, [timeRange, searchDate]);

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

  // Helper to get status for average values (replicates backend logic)
  const getStatus = (value, lowThreshold, highThreshold, isInverted = false) => {
    if (isInverted) {
      if (value > highThreshold) return 'low';
      if (value < lowThreshold) return 'high';
      return 'medium';
    } else {
      if (value < lowThreshold) return 'low';
      if (value > highThreshold) return 'high';
      return 'medium';
    }
  };

  const SensorCard = ({ sensorKey, title, value, status }) => (
    <Paper
      elevation={3}
      className={`sensor-card ${sensorKey} status-${status}`}
      sx={{ height: '90px' }}
    >
      <Box className="sensor-card-header">
        <Typography variant="body2" component="h3" className="sensor-icon">
          {getSensorIcon(sensorKey)}
        </Typography>
        <Typography variant="caption" component="div" className="sensor-title">
          {title}
        </Typography>
        <Tooltip title={`Status: ${status.toUpperCase()}`}>
          <IconButton size="small">
            <InfoIcon style={{ color: getStatusColor(status, sensorKey), fontSize: '0.75rem' }} />
          </IconButton>
        </Tooltip>
      </Box>
      <Box className="sensor-value-container">
        <Typography variant="h6" component="div" className="sensor-value" style={{ color: getStatusColor(status, sensorKey) }}>
          {value}
        </Typography>
        <Typography variant="caption" className="sensor-status" sx={{ fontSize: '0.6rem' }}>
          {status}
        </Typography>
      </Box>
    </Paper>
  );

  const TimeRangeSelector = () => {
    return (
      <Box className="time-range-container">
        <FormControl size="small" sx={{ minWidth: 140 }}>
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
      <Paper elevation={3} className="graph-container" sx={{ height: '100%' }}>
        <Typography variant="caption" className="graph-title" sx={{ fontSize: '0.7rem', p: 0.5 }}>
          {getSensorIcon(sensorKey)} {title}
        </Typography>
        <Box className="graph-content" sx={{ height: 'calc(100% - 25px)' }}>
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

        <Grid container spacing={1} sx={{ height: 'calc(100vh - 140px)' }}>
          {/* TOP ROW */}
          <Grid item xs={12} sx={{ height: 'calc(45% - 8px)' }}>
            <Grid container spacing={1} sx={{ height: '100%' }}>
              {/* TOP-LEFT: Latest Sensor Data */}
              <Grid item xs={6} sx={{ height: '100%' }}>
                <Paper elevation={4} className="main-card" sx={{ height: '100%', padding: '12px' }}>
                  <Typography variant="h6" gutterBottom className="card-title" sx={{ mb: 1 }}>
                    📊 Latest Sensor Data
                  </Typography>
                  <Box className="sensor-cards-container">
                    {Array.from({ length: 3 }).map((_, rowIdx) => (
                      <Box className="sensor-cards-row" key={rowIdx}>
                        {sensorKeys.slice(rowIdx * 2, rowIdx * 2 + 2).map((key) => (
                          <Box sx={{ flex: 1 }} key={key}>
                            <SensorCard
                              sensorKey={key}
                              title={getSensorName(key)}
                              value={sensorData[key].value}
                              status={sensorData[key].status}
                            />
                          </Box>
                        ))}
                      </Box>
                    ))}
                  </Box>
                </Paper>
              </Grid>

              {/* TOP-RIGHT: Sensor Data History */}
              <Grid item xs={6} sx={{ height: '100%' }}>
                <Paper elevation={4} className="table-card" sx={{ height: '100%', padding: '12px' }}>
                  <Box className="table-header" sx={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', pb: 0.5, mb: 1, borderBottom: '1px solid #e0e0e0' }}>
                    <Typography variant="h6" className="card-title" sx={{ mb: 0, borderBottom: 'none', pb: 0 }}>
                      📊 Sensor Data History
                    </Typography>
                    <TextField
                      label="Search by Date"
                      variant="outlined"
                      size="small"
                      value={searchDate}
                      onChange={(e) => setSearchDate(e.target.value)}
                      className="search-field"
                      sx={{ marginLeft: 'auto', position: 'relative', top: '-4px', '& .MuiInputBase-input': { fontSize: '0.8rem' } }}
                    />
                  </Box>
                  <TableContainer className="table-container" sx={{ maxHeight: 'calc(100% - 60px)', overflowY: 'auto', width: '100%' }}>
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
          </Grid>

          {/* BOTTOM ROW */}
          <Grid item xs={12} sx={{ height: 'calc(55% + 8px)' }}>
            <Grid container spacing={1} sx={{ height: '100%' }}>
              {/* BOTTOM-LEFT: Historical Trends */}
              <Grid item xs={8} sx={{ height: '100%' }}>
                <Paper elevation={4} className="historical-card" sx={{ height: '100%', padding: '12px' }}>
                  <Box sx={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', pb: 0.5, mb: 1, borderBottom: '1px solid #e0e0e0' }}>
                    <Typography variant="h6" className="card-title" sx={{ mb: 0, borderBottom: 'none', pb: 0 }}>
                      📈 Historical Trends
                    </Typography>
                    <Box sx={{ mt: '-2px' }}>
                      <TimeRangeSelector />
                    </Box>
                  </Box>
                  <Box className="historical-content" sx={{ height: 'calc(100% - 50px)' }}>
                    {[0, 1].map((rowIdx) => (
                      <Grid container spacing={0.5} key={rowIdx} sx={{ mb: rowIdx === 0 ? 1 : 0, height: rowIdx === 0 ? 'calc(50% - 8px)' : 'calc(50% - 8px)' }}>
                        {sensorKeys.slice(rowIdx * 3, rowIdx * 3 + 3).map((key) => (
                          <Grid item xs={4} key={key} sx={{ height: '100%' }}>
                            <SensorGraph sensorKey={key} title={getSensorName(key)} />
                          </Grid>
                        ))}
                      </Grid>
                    ))}
                  </Box>
                </Paper>
              </Grid>

              {/* BOTTOM-RIGHT: Average Sensor Values */}
              <Grid item xs={4} sx={{ height: '100%' }}>
                <Paper elevation={4} className="main-card" sx={{ height: '100%', padding: '12px' }}>
                  <Typography variant="h6" gutterBottom className="card-title" sx={{ mb: 1 }}>
                    🧮 Average Sensor Values
                  </Typography>
                  <Box className="sensor-cards-container">
                    {[0, 1, 2].map((rowIdx) => (
                      <Box className="sensor-cards-row" key={rowIdx}>
                        {sensorKeys.slice(rowIdx * 2, rowIdx * 2 + 2).map((key) => {
                          // Use backend thresholds for status
                          let status;
                          if (key === 'temperature') status = getStatus(averageSensorData[key], 20, 25);
                          else if (key === 'humidity') status = getStatus(averageSensorData[key], 70, 80);
                          else if (key === 'ldrValue') status = getStatus(averageSensorData[key], 400, 600, true);
                          else if (key === 'rainValue') status = getStatus(averageSensorData[key], 880, 940, true);
                          else if (key === 'airQualityPPM') status = getStatus(averageSensorData[key], 400, 800);
                          else if (key === 'soilMoisture') status = getStatus(averageSensorData[key], 200, 400);
                          else status = 'medium';
                          return (
                            <Box sx={{ flex: 1 }} key={key}>
                              <SensorCard
                                sensorKey={key}
                                title={getSensorName(key)}
                                value={averageSensorData[key] ? averageSensorData[key].toFixed(1) : '-'}
                                status={status}
                              />
                            </Box>
                          );
                        })}
                      </Box>
                    ))}
                  </Box>
                </Paper>
              </Grid>
            </Grid>
          </Grid>
        </Grid>
      </Container>
    </Box>
  );
}

export default App;