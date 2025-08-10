// Utility function to determine sensor status
export const getStatus = (value, lowThreshold, highThreshold, isInverted = false) => {
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

// Sensor configuration constants
export const SENSOR_THRESHOLDS = {
  temperature: { low: 20, high: 25, inverted: false },
  humidity: { low: 70, high: 80, inverted: false },
  ldrValue: { low: 400, high: 600, inverted: true },
  rainValue: { low: 880, high: 940, inverted: true },
  airQualityPPM: { low: 400, high: 800, inverted: false },
  soilMoisture: { low: 200, high: 400, inverted: false }
};

// Helper function to get status for specific sensor
export const getSensorStatus = (sensorKey, value) => {
  const config = SENSOR_THRESHOLDS[sensorKey];
  if (!config) return 'medium';
  return getStatus(value, config.low, config.high, config.inverted);
};
