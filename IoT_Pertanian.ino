#include <Wire.h>
#include <LiquidCrystal_I2C.h>
#include <DHT.h>
#include <WiFiS3.h>
#include <EEPROM.h>
#include <FspTimer.h>
#include <WDT.h>
#include <NTPClient.h>
#include <WiFiUdp.h>
#include <ArduinoHttpClient.h>
#include <ArduinoJson.h>

// ----- Pin Definitions -----
#define SOILPIN A0
#define MQ135PIN A1
#define LDRPIN A2
#define RAINPIN A3
#define DHTPIN 7
#define DHTTYPE DHT11
#define PUMP 2

// ----- Thresholds for Pump Activation-----
#define SOIL_THRESHOLD 200
#define PARTIAL_SOIL_THRESHOLD 400
#define PUMP_TIME_THRESHOLD 180000
#define HEAVY_RAIN_THRESHOLD 800
#define LIGHT_RAIN_THRESHOLD 990

// Thresholds for displaying sensor values
#define SOIL_LOW 200
#define SOIL_MEDIUM 400
#define LIGHT_LOW 750
#define LIGHT_MEDIUM 400
#define RAIN_LOW 990
#define RAIN_MEDIUM 890

// ----- Timing Settings -----
#define LCD_MODE_CHANGE_INTERVAL 5000
#define LCD_UPDATE_INTERVAL 1000
#define LCD_READINGS_PER_MODE 5
#define WIFI_RECONNECT_ATTEMPTS 3
#define SERVER_SEND_INTERVAL 1000  // Changed to 60 seconds to reduce DB load
#define WATCHDOG_TIMEOUT 8000
#define VALID_YEAR_THRESHOLD 2025
#define ERROR_DISPLAY_TIMEOUT 5000
#define NTP_UPDATE_INTERVAL 86400000
#define HTTP_TIMEOUT 10000
#define DB_RETRY_INTERVAL 60000
#define SENSOR_READ_INTERVAL 1000

// ----- Time Zone GMT +7 -----
#define GMT_OFFSET_SECONDS 25200

// ----- System States -----
enum SystemState {
  STATE_INIT,
  STATE_READ_SENSORS,
  STATE_EVALUATE_WATERING,
  STATE_WATERING,
  STATE_DISPLAY_DATA,
  STATE_SEND_DATA,
  STATE_ERROR
};

// ----- Task States -----
enum TaskState {
  TASK_IDLE,
  TASK_RUNNING,
  TASK_COMPLETED,
  TASK_FAILED
};

// ----- Error Codes -----
enum ErrorCode {
  ERROR_NONE,
  ERROR_DHT,
  ERROR_SOIL,
  ERROR_RAIN,
  ERROR_AIR,
  ERROR_LDR,
  ERROR_PUMP,
  ERROR_WIFI,
  ERROR_SERVER,
  ERROR_TIME,
  ERROR_DB
};

// ----- WiFi and Server Settings -----
const char* ssid = "SmartRoomPrototype";
const char* password = "Binus123!";
const char* server = "10.37.35.78";  // Change this to your computer's IP address
const int port = 80;  // Change this to your server's port

// HTTP client
WiFiClient wifi;
HttpClient http(wifi, server, port);

// For NTP time synchronization
WiFiUDP ntpUDP;
NTPClient timeClient(ntpUDP, "pool.ntp.org", GMT_OFFSET_SECONDS, NTP_UPDATE_INTERVAL);
bool timeInitialized = false;
unsigned long lastNTPUpdateTime = 0;

// ----- Global Variables -----
DHT dht(DHTPIN, DHTTYPE);
LiquidCrystal_I2C lcd(0x27, 16, 2);

// System state and error tracking
SystemState currentState = STATE_INIT;
ErrorCode currentError = ERROR_NONE;
ErrorCode lastDisplayedError = ERROR_NONE;
char errorMessage[32] = "";
unsigned long stateStartTime = 0;
unsigned long errorStartTime = 0;

// Flag to track if an error has been displayed
bool errorDisplayed = false;

// LCD display variables
byte displayMode = 0;
byte readingCount = 0;
unsigned long lastLCDUpdateTime = 0;
unsigned long lastLCDModeChangeTime = 0;

// Sensor data structure to organize readings
struct SensorData {
  float temperature;
  float humidity;
  int ldrValue;
  int rainValue;
  int airQuality;
  float airQualityPPM;
  int soilMoisture;
  bool isValid;
  unsigned long timestamp;
} sensorData;

// Database communication tracking
int dataTransmissionErrors = 0;
unsigned long lastServerSendTime = 0;
unsigned long lastDBRetryTime = 0;
unsigned long lastSensorReadTime = 0;

// Buffer for formatting strings
char msgBuffer[150];
char timeStampBuffer[25];
char valueBuffer[10];

// Task management
TaskState dbTaskState = TASK_IDLE;
TaskState sensorTaskState = TASK_IDLE;
TaskState displayTaskState = TASK_IDLE;
TaskState wateringTaskState = TASK_IDLE;

unsigned long dbTaskStartTime = 0;
unsigned long sensorTaskStartTime = 0;
unsigned long displayTaskStartTime = 0;
unsigned long wateringTaskStartTime = 0;

// Function to get status text based on sensor value with inversion parameter
const char* getSensorStatus(int value, int lowThreshold, int mediumThreshold, bool invertLogic = false) {
  if (invertLogic) {
    if (value > mediumThreshold) {
      return "LOW";
    } else if (value > lowThreshold) {
      return "MEDIUM";
    } else {
      return "HIGH";
    }
  } else {
    if (value < lowThreshold) {
      return "LOW";
    } else if (value < mediumThreshold) {
      return "MEDIUM";
    } else {
      return "HIGH";
    }
  }
}

float convertToCO2PPM(int analogValue) {
  float voltage = analogValue * (5.0 / 1023.0);
  float rs = ((5.0 * 10.0) / voltage) - 10.0;
  float r0 = 76.63;
  float ratio = rs / r0;
  float ppm = 100.0 * pow(ratio, -1.53);
  
  return ppm;
}

// Non-blocking function to connect to MySQL database
void startDatabaseConnection() {
  if (dbTaskState == TASK_IDLE) {
    if (!checkWiFi()) {
      Serial.println(F("Warning: WiFi not connected, skipping database connection"));
      currentError = ERROR_WIFI;
      dbTaskState = TASK_FAILED;
      return;
    }
    
    Serial.println(F("Starting database connection..."));
    dbTaskState = TASK_RUNNING;
    dbTaskStartTime = millis();
  }
}

// Function to check and reconnect WiFi if needed
bool checkWiFi() {
  if (WiFi.status() != WL_CONNECTED) {
    snprintf(msgBuffer, sizeof(msgBuffer), "Warning: WiFi disconnected. Attempting to reconnect...");
    Serial.println(msgBuffer);
    
    for (int attempt = 0; attempt < WIFI_RECONNECT_ATTEMPTS; attempt++) {
      WiFi.begin(ssid, password);
      unsigned long startTime = millis();
      while (WiFi.status() != WL_CONNECTED && (millis() - startTime) < 10000) {
        WDT.refresh();
        delay(500);
        Serial.print(".");
      }
      
      if (WiFi.status() == WL_CONNECTED) {
        Serial.println(F("\nReconnected to WiFi!"));
        currentError = ERROR_NONE; // Clear WiFi error if connection succeeds
        return true;
      } else {
        snprintf(msgBuffer, sizeof(msgBuffer), "\nAttempt %d failed. Retrying...", attempt + 1);
        Serial.print(msgBuffer);
      }
    }
    
    Serial.println(F("Warning: Failed to reconnect to WiFi after multiple attempts."));
    return false;
  }
  return true;
}

// Function to update NTP time
bool updateNTPTime() {
  if (!checkWiFi()) {
    return false;
  }
  
  bool success = timeClient.update();
  if (success) {
    lastNTPUpdateTime = millis();
    timeInitialized = true;
    Serial.println(F("NTP time updated successfully"));
  } else {
    Serial.println(F("Failed to update NTP time"));
  }
  return success;
}

// Function to get current time as formatted string
void getFormattedTime(char* buffer, size_t bufferSize, bool includeSeconds = true) {
  if (!timeInitialized) {
    if (!updateNTPTime()) {
      snprintf(buffer, bufferSize, "Time not available");
      return;
    }
  }
  
  if (millis() - lastNTPUpdateTime >= NTP_UPDATE_INTERVAL) {
    updateNTPTime();
  }
  
  unsigned long epochTime = timeClient.getEpochTime();
  time_t rawtime = epochTime;
  struct tm* ti;
  ti = localtime(&rawtime);
  
  if (includeSeconds) {
    snprintf(buffer, bufferSize, "%04d-%02d-%02d %02d:%02d:%02d", 
            ti->tm_year + 1900, ti->tm_mon + 1, ti->tm_mday, 
            ti->tm_hour, ti->tm_min, ti->tm_sec);
  } else {
    snprintf(buffer, bufferSize, "%04d-%02d-%02d %02d:%02d", 
            ti->tm_year + 1900, ti->tm_mon + 1, ti->tm_mday, 
            ti->tm_hour, ti->tm_min);
  }
}

// Non-blocking function to start reading sensors
void startSensorReading() {
  if (sensorTaskState == TASK_IDLE && millis() - lastSensorReadTime >= SENSOR_READ_INTERVAL) {
    sensorTaskState = TASK_RUNNING;
    sensorTaskStartTime = millis();
    lastSensorReadTime = millis();
    
    WDT.refresh();
    bool success = true;
    
    if (timeInitialized) {
      sensorData.timestamp = timeClient.getEpochTime();
    } else {
      sensorData.timestamp = millis() / 1000;
      
      if (millis() - lastNTPUpdateTime >= NTP_UPDATE_INTERVAL) {
        updateNTPTime();
      }
    }
    
    // Read DHT sensor with retry mechanism
    int dhtRetries = 0;
    const int MAX_DHT_RETRIES = 3;
    bool dhtSuccess = false;
    
    while (!dhtSuccess && dhtRetries < MAX_DHT_RETRIES) {
      // Wait for 2 seconds between readings (DHT11 needs time to stabilize)
      if (dhtRetries > 0) {
        delay(2000);
      }
      
      float newTemp = dht.readTemperature();
      float newHumidity = dht.readHumidity();
      
      if (!isnan(newTemp) && !isnan(newHumidity)) {
        sensorData.temperature = newTemp;
        sensorData.humidity = newHumidity;
        dhtSuccess = true;
        currentError = ERROR_NONE;  // Clear any previous DHT error
      } else {
        dhtRetries++;
        Serial.print(F("DHT read attempt "));
        Serial.print(dhtRetries);
        Serial.println(F(" failed"));
      }
    }
    
    if (!dhtSuccess) {
      Serial.println(F("Warning: All DHT sensor read attempts failed"));
      // Keep previous values if available, otherwise use defaults
      if (sensorData.temperature == 0.0) sensorData.temperature = 25.0; // Default value
      if (sensorData.humidity == 0.0) sensorData.humidity = 50.0; // Default value
      currentError = ERROR_DHT;
      success = false;
    }
    
    // Read other sensors
    int newLdrValue = analogRead(LDRPIN);
    if (newLdrValue < 0 || newLdrValue > 1023) {
      Serial.println(F("Warning: LDR sensor reading out of range!"));
      if (sensorData.ldrValue == 0) sensorData.ldrValue = 500; // Medium light
      currentError = ERROR_LDR;
      success = false;
    } else {
      sensorData.ldrValue = newLdrValue;
    }

    int newRainValue = analogRead(RAINPIN);
    if (newRainValue < 0 || newRainValue > 1023) {
      Serial.println(F("Warning: Rain sensor reading out of range!"));
      if (sensorData.rainValue == 1023) sensorData.rainValue = 1000;
      currentError = ERROR_RAIN;
      success = false;
    } else {
      sensorData.rainValue = newRainValue;
    }
    
    int newAirQuality = analogRead(MQ135PIN);
    if (newAirQuality < 0 || newAirQuality > 1023) {
      Serial.println(F("Warning: Air quality sensor reading out of range!"));
      if (sensorData.airQuality == 0) sensorData.airQuality = 300; // Default value
      currentError = ERROR_AIR;
      success = false;
    } else {
      sensorData.airQuality = newAirQuality;
    }

    sensorData.airQualityPPM = convertToCO2PPM(sensorData.airQuality);
    
    int newSoilMoisture = analogRead(SOILPIN);
    if (newSoilMoisture < 0 || newSoilMoisture > 1023) {
      Serial.println(F("Warning: Soil moisture sensor reading out of range!"));
      if (sensorData.soilMoisture == 1023) sensorData.soilMoisture = 500;
      currentError = ERROR_SOIL;
      success = false;
    } else {
      sensorData.soilMoisture = newSoilMoisture;
    }
    
    // Always mark as valid since we're using default or previous values when sensors fail
    sensorData.isValid = true;
    
    // Even with errors, mark as completed so system continues
    sensorTaskState = TASK_COMPLETED;
    
    // If everything was successful, clear any error
    if (success) {
      currentError = ERROR_NONE;
    }
  }
}

// Non-blocking function to start watering process
void startWatering() {
  if (wateringTaskState == TASK_IDLE && sensorData.soilMoisture < SOIL_THRESHOLD) {
    wateringTaskState = TASK_RUNNING;
    wateringTaskStartTime = millis();
    
    Serial.println(F("Starting watering evaluation..."));
    
    // Check rain conditions first
    if (sensorData.rainValue < HEAVY_RAIN_THRESHOLD) {
      digitalWrite(PUMP, LOW);
      Serial.println(F("Heavy rain detected; pump remains off."));
      wateringTaskState = TASK_COMPLETED;
    } else {
      // Will handle the rest in continueWatering()
    }
  }
}

// Continue watering process non-blocking
void continueWatering() {
  if (wateringTaskState != TASK_RUNNING) {
    return;
  }
  
  WDT.refresh();
  
  // First-time display setup for watering
  static bool wateringDisplayInitialized = false;
  static unsigned long pumpStartTime = 0;
  static bool pumpActive = false;
  
  if (!wateringDisplayInitialized) {
    lcd.clear();
    lcd.setCursor(0, 0);
    
    if (sensorData.rainValue < LIGHT_RAIN_THRESHOLD && sensorData.soilMoisture < PARTIAL_SOIL_THRESHOLD) {
      lcd.print(F("Partial Watering"));
      pumpActive = true;
      digitalWrite(PUMP, HIGH);
    } else if (sensorData.rainValue >= LIGHT_RAIN_THRESHOLD) {
      lcd.print(F("Watering..."));
      pumpActive = true;
      digitalWrite(PUMP, HIGH);
    } else {
      lcd.print(F("Light rain"));
      lcd.setCursor(0, 1);
      lcd.print(F("No watering needed"));
      pumpActive = false;
      digitalWrite(PUMP, LOW);
      
      // Short delay to show the message before completing
      delay(1000);
      wateringTaskState = TASK_COMPLETED;
      wateringDisplayInitialized = false;
      return;
    }
    
    pumpStartTime = millis();
    wateringDisplayInitialized = true;
  }
  
  // If pump is active, check for completion conditions
  if (pumpActive) {
    // Read current soil moisture
    int currentSoilMoisture = analogRead(SOILPIN);
    
    // Update LCD with current soil moisture
    lcd.setCursor(0, 1);
    lcd.print(F("Soil: ")); 
    lcd.print(getSensorStatus(currentSoilMoisture, SOIL_LOW, SOIL_MEDIUM, false));
    lcd.print(F("      "));
    
    // Check if watering is complete or timed out
    if (currentSoilMoisture >= SOIL_THRESHOLD || (millis() - pumpStartTime >= PUMP_TIME_THRESHOLD)) {
      digitalWrite(PUMP, LOW);
      pumpActive = false;
      
      lcd.clear();
      lcd.setCursor(0, 0);
      lcd.print(F("Watering"));
      lcd.setCursor(0, 1);
      lcd.print(F("Complete"));
      
      Serial.println(F("Watering completed or timeout reached."));
      delay(1000); // Show completion message briefly
      
      wateringTaskState = TASK_COMPLETED;
      wateringDisplayInitialized = false;
    }
  }
}

// Non-blocking function to start data upload to database
void startDataUpload() {
  if (dbTaskState == TASK_IDLE && millis() - lastServerSendTime >= SERVER_SEND_INTERVAL) {
    if (!checkWiFi()) {
      Serial.println(F("Warning: WiFi not connected, skipping data upload"));
      currentError = ERROR_WIFI;
      dbTaskState = TASK_FAILED;
      return;
    }
    
    Serial.println(F("Starting data upload..."));
    dbTaskState = TASK_RUNNING;
    dbTaskStartTime = millis();
    
    // Prepare JSON data
    StaticJsonDocument<512> doc;
    
    getFormattedTime(timeStampBuffer, sizeof(timeStampBuffer));
    doc["timestamp"] = timeStampBuffer;
    doc["temperature"] = sensorData.temperature;
    doc["humidity"] = sensorData.humidity;
    doc["ldrValue"] = sensorData.ldrValue;
    doc["rainValue"] = sensorData.rainValue;
    doc["airQualityPPM"] = sensorData.airQualityPPM;
    doc["soilMoisture"] = sensorData.soilMoisture;
    
    String jsonData;
    serializeJson(doc, jsonData);
    
    // Debug: Print the JSON data
    Serial.println(F("Sending JSON data:"));
    Serial.println(jsonData);
    
    // Set up HTTP request
    Serial.println(F("Setting up HTTP request..."));
    http.beginRequest();
    http.post("/pertanian/api/insert_data.php");
    http.sendHeader("Content-Type", "application/json");
    http.sendHeader("Content-Length", jsonData.length());
    http.write((const uint8_t*)jsonData.c_str(), jsonData.length());
    http.endRequest();
    
    // Check response
    int statusCode = http.responseStatusCode();
    String response = http.responseBody();
    
    Serial.print(F("HTTP Status Code: "));
    Serial.println(statusCode);
    Serial.print(F("Response: "));
    Serial.println(response);
    
    if (statusCode == 200) {
      Serial.println(F("Data sent successfully"));
      dataTransmissionErrors = 0;
      lastServerSendTime = millis();
      dbTaskState = TASK_COMPLETED;
    } else {
      Serial.print(F("HTTP request failed: "));
      Serial.println(statusCode);
      dbTaskState = TASK_FAILED;
      currentError = ERROR_SERVER;
    }
  }
}

// Continue database upload non-blocking
void continueDataUpload() {
  if (dbTaskState != TASK_RUNNING) {
    return;
  }
  
  WDT.refresh();
  
  // Check for timeout
  if (millis() - dbTaskStartTime >= HTTP_TIMEOUT) {
    Serial.println(F("HTTP request timed out"));
    dbTaskState = TASK_FAILED;
    currentError = ERROR_SERVER;
  }
}

// Non-blocking function to update display
void updateDisplay() {
  if (displayTaskState == TASK_IDLE && millis() - lastLCDUpdateTime >= LCD_UPDATE_INTERVAL) {
    displayTaskState = TASK_RUNNING;
    
    // Log sensor data to serial
    getFormattedTime(timeStampBuffer, sizeof(timeStampBuffer));
    Serial.print(F("Timestamp: "));
    Serial.println(timeStampBuffer);
    
    snprintf(msgBuffer, sizeof(msgBuffer), "Temperature  : %.1f°C", sensorData.temperature);
    Serial.println(msgBuffer);
    
    snprintf(msgBuffer, sizeof(msgBuffer), "Humidity     : %.1f%%", sensorData.humidity);
    Serial.println(msgBuffer);
    
    snprintf(msgBuffer, sizeof(msgBuffer), "Light Level  : %d (%s)", 
            sensorData.ldrValue, getSensorStatus(sensorData.ldrValue, LIGHT_LOW, LIGHT_MEDIUM, true));
    Serial.println(msgBuffer);
    
    snprintf(msgBuffer, sizeof(msgBuffer), "Rain Level   : %d (%s)", 
            sensorData.rainValue, getSensorStatus(sensorData.rainValue, RAIN_LOW, RAIN_MEDIUM, true));
    Serial.println(msgBuffer);
    
    snprintf(msgBuffer, sizeof(msgBuffer), "Air Quality  : %0.1f PPM", 
          sensorData.airQualityPPM);
    Serial.println(msgBuffer);
    
    snprintf(msgBuffer, sizeof(msgBuffer), "Soil Moisture: %d (%s)\n", 
            sensorData.soilMoisture, getSensorStatus(sensorData.soilMoisture, SOIL_LOW, SOIL_MEDIUM, false));
    Serial.println(msgBuffer);

    unsigned long currentTime = millis();
    
    // Check if it's time to change display mode
    if (currentTime - lastLCDModeChangeTime >= LCD_MODE_CHANGE_INTERVAL) {
      displayMode = (displayMode + 1) % 4;
      lastLCDModeChangeTime = currentTime;
      readingCount = 0;

      lcd.clear();
    }
    
    // Update display based on current mode
    switch (displayMode) {
      case 0:
        lcd.setCursor(0, 0);
        lcd.print(F("Temp: ")); 
        lcd.print(sensorData.temperature, 1); 
        lcd.print((char)223); 
        lcd.print(F("C    "));
        
        lcd.setCursor(0, 1);
        
        if (dbTaskState == TASK_RUNNING) {
          lcd.print(F("Sending data... "));
        } else {
          lcd.print(F("Humidity: ")); 
          lcd.print(sensorData.humidity, 1); 
          lcd.print(F("%    "));
        }
        break;
        
      case 1:
        lcd.setCursor(0, 0);
        lcd.print(F("Soil: ")); 
        lcd.print(getSensorStatus(sensorData.soilMoisture, SOIL_LOW, SOIL_MEDIUM, false));
        lcd.print(F("    "));
        
        lcd.setCursor(0, 1);
        
        if (dbTaskState == TASK_RUNNING) {
          lcd.print(F("Sending data... "));
        } else {
          lcd.print(F("Rain: ")); 
          lcd.print(getSensorStatus(sensorData.rainValue, RAIN_LOW, RAIN_MEDIUM, true));
          lcd.print(F("    "));
        }
        break;
        
      case 2:
        lcd.setCursor(0, 0);
        lcd.print(F("Light: ")); 
        lcd.print(getSensorStatus(sensorData.ldrValue, LIGHT_LOW, LIGHT_MEDIUM, true));
        lcd.print(F("    "));
        
        lcd.setCursor(0, 1);
        
        if (dbTaskState == TASK_RUNNING) {
          lcd.print(F("Sending data... "));
        } else {
          lcd.print(F("CO2: ")); 
          lcd.print((int)sensorData.airQualityPPM);
          lcd.print(F(" PPM   "));
        }
        break;
        
      case 3:
        if (timeInitialized) {
          lcd.setCursor(0, 0);
          lcd.print(F("Time: ")); 
          lcd.print(timeClient.getFormattedTime());
          lcd.print(F("    "));
          
          lcd.setCursor(0, 1);
          
          if (dbTaskState == TASK_RUNNING) {
            lcd.print(F("Sending data... "));
          } else {
            time_t rawtime = timeClient.getEpochTime();
            struct tm* ti = localtime(&rawtime);
            
            lcd.print(F("Date: ")); 
            if (ti->tm_mon < 9) lcd.print('0');
            lcd.print(ti->tm_mon + 1);
            lcd.print('/'); 
            if (ti->tm_mday < 10) lcd.print('0');
            lcd.print(ti->tm_mday);
            lcd.print('/');
            lcd.print((ti->tm_year + 1900) % 100);
            lcd.print(F("    "));
          }
        } else {
          lcd.setCursor(0, 0);
          lcd.print(F("Time not sync'd"));
          lcd.setCursor(0, 1);
          lcd.print(F("Check WiFi/NTP"));
        }
        break;
    }
    
    lastLCDUpdateTime = currentTime;
    displayTaskState = TASK_COMPLETED;
  }
}

// Function to display an error message once
void displayErrorOnce(ErrorCode error) {
  if (error != lastDisplayedError) {
    lcd.clear();
    lcd.setCursor(0, 0);
    lcd.print(F("WARNING:"));
    lcd.setCursor(0, 1);
    
    switch (error) {
      case ERROR_DHT:
        lcd.print(F("Temp & Humidity"));
        break;
      case ERROR_SOIL:
        lcd.print(F("Soil Moisture"));
        break;
      case ERROR_RAIN:
        lcd.print(F("Rain"));
        break;
      case ERROR_AIR:
        lcd.print(F("Air Quality"));
        break;
      case ERROR_LDR:
        lcd.print(F("LDR"));
        break;
      case ERROR_PUMP:
        lcd.print(F("Pump Warning"));
        break;
      case ERROR_WIFI:
        lcd.print(F("WiFi - Offline"));
        break;
      case ERROR_SERVER:
        lcd.print(F("Server - Offline"));
        break;
      case ERROR_TIME:
        lcd.print(F("Using Local Time"));
        break;
      case ERROR_DB:
        lcd.print(F("DB - Offline"));
        break;
      default:
        lcd.print(F("System Warning"));
        break;
    }
    
    delay(2000);
    lastDisplayedError = error;
  }
}

void handleError() {
  WDT.refresh();
  
  unsigned long currentTime = millis();
  
  if (currentError != lastDisplayedError) {
    lcd.clear();
    lcd.setCursor(0, 0);
    lcd.print(F("SYSTEM WARNING")); // Changed from ERROR to WARNING
    lcd.setCursor(0, 1);
    
    switch (currentError) {
      case ERROR_DHT:
        lcd.print(F("Temp/Humid Sensor"));
        break;
      case ERROR_SOIL:
        lcd.print(F("Soil Sensor"));
        break;
      case ERROR_RAIN:
        lcd.print(F("Rain Sensor"));
        break;
      case ERROR_AIR:
        lcd.print(F("Air Quality"));
        break;
      case ERROR_LDR:
        lcd.print(F("Light Sensor"));
        break;
      case ERROR_PUMP:
        lcd.print(F("Pump Malfunction"));
        break;
      case ERROR_WIFI:
        lcd.print(F("WiFi Connection"));
        break;
      case ERROR_SERVER:
        lcd.print(F("Server Connection"));
        break;
      case ERROR_TIME:
        lcd.print(F("Time Sync Failed"));
        break;
      case ERROR_DB:
        lcd.print(F("Database Error"));
        break;
      default:
        lcd.print(F("Unknown Error"));
        break;
    }
    
    lastDisplayedError = currentError;
    errorStartTime = currentTime;
  }
  
  if (currentTime - errorStartTime > ERROR_DISPLAY_TIMEOUT) {
    // Instead of just displaying error, continue with the system operation
    // Try to recover from errors when possible
    switch (currentError) {
      case ERROR_WIFI:
        if (checkWiFi()) {
          currentError = ERROR_NONE;
        }
        break;
      case ERROR_DB:
        if (millis() - lastDBRetryTime >= DB_RETRY_INTERVAL) {
          startDatabaseConnection();
          lastDBRetryTime = millis();
          if (dbTaskState == TASK_COMPLETED) {
            currentError = ERROR_NONE;
          }
        }
        break;
      case ERROR_DHT:
      case ERROR_SOIL:
      case ERROR_RAIN:
      case ERROR_AIR:
      case ERROR_LDR:
        // For sensor errors, we'll let the system continue and try again on next cycle
        break;
      default:
        // For other errors, clear them after display timeout
        break;
    }
    
    // Always move to next state regardless of error resolution
    currentState = STATE_READ_SENSORS;
  }
}

// Function to ensure database and table exist - no longer needed as it's handled by PHP
bool setupDatabase() {
  return true;  // Always return true as database setup is handled by PHP
}

void setup() {
  Serial.begin(115200);
  
  WDT.begin(WATCHDOG_TIMEOUT);
  
  lcd.init();
  lcd.backlight();
  lcd.clear();
  lcd.setCursor(0, 0);
  lcd.print(F("System Starting"));
  
  dht.begin();

  pinMode(PUMP, OUTPUT);
  digitalWrite(PUMP, LOW);
  
  pinMode(SOILPIN, INPUT);
  pinMode(MQ135PIN, INPUT);
  pinMode(LDRPIN, INPUT);
  pinMode(RAINPIN, INPUT);

  lastDisplayedError = ERROR_NONE;

  lcd.clear();
  lcd.setCursor(0, 0);
  lcd.print(F("Connecting WiFi"));
  Serial.print(F("Connecting to WiFi"));
  WiFi.begin(ssid, password);
  
  unsigned long wifiStartTime = millis();
  while (WiFi.status() != WL_CONNECTED && (millis() - wifiStartTime < 30000)) {
    WDT.refresh();
    delay(1000);
    Serial.print(".");
    lcd.setCursor(0, 1);
    lcd.print("Attempt ");
    lcd.print((millis() - wifiStartTime) / 1000);
    lcd.print("s");
  }
  
  if (WiFi.status() == WL_CONNECTED) {
    Serial.println(F("\nWiFi connected!"));
    lcd.clear();
    lcd.setCursor(0, 0);
    lcd.print(F("WiFi Connected!"));
    lcd.setCursor(0, 1);
    lcd.print(WiFi.localIP());
    delay(2000);
    
    // Start NTP client
    lcd.clear();
    lcd.setCursor(0, 0);
    lcd.print(F("Syncing Time..."));
    timeClient.begin();
    
    if (updateNTPTime()) {
      lcd.setCursor(0, 1);
      lcd.print(F("Time Synced"));
    } else {
      lcd.setCursor(0, 1);
      lcd.print(F("Time Sync Failed"));
      currentError = ERROR_TIME;
      // Continue anyway despite time sync failure
    }
    delay(2000);
  } else {
    Serial.println(F("WiFi connection failed - continuing offline."));
    lcd.clear();
    lcd.setCursor(0, 0);
    lcd.print(F("WiFi Failed"));
    lcd.setCursor(0, 1);
    lcd.print(F("Running Offline"));
    currentError = ERROR_WIFI;
    delay(2000);
  }
  
  // Initial sensor read
  lcd.clear();
  lcd.setCursor(0, 0);
  lcd.print(F("Reading Sensors"));
  
  startSensorReading();
  while (sensorTaskState == TASK_RUNNING) {
    WDT.refresh();
    delay(100);
    lcd.setCursor(0, 1);
    lcd.print("Please wait...  ");
  }
  
  if (sensorTaskState == TASK_COMPLETED && currentError == ERROR_NONE) {
    lcd.setCursor(0, 1);
    lcd.print("Sensors OK      ");
  } else {
    lcd.setCursor(0, 1);
    lcd.print("Sensor Warning  ");
    // Continue despite sensor issues
  }
  delay(2000);
  
  // Set initial state
  currentState = STATE_READ_SENSORS;
  stateStartTime = millis();
  
  Serial.println(F("System initialization complete"));
  lcd.clear();
  lcd.setCursor(0, 0);
  lcd.print(F("System Ready"));
  lcd.setCursor(0, 1);
  lcd.print(F("Starting..."));
  delay(2000);
}

void loop() {
  // Refresh watchdog timer to prevent reset
  WDT.refresh();
  
  // Check if there's an active error
  if (currentError != ERROR_NONE) {
    handleError();
  }

  // Always check if it's time to read sensors, regardless of current state
  if (millis() - lastSensorReadTime >= SENSOR_READ_INTERVAL) {
    startSensorReading();
  }

  // Always check if it's time to send data, regardless of current state
  if (millis() - lastServerSendTime >= SERVER_SEND_INTERVAL) {
    startDataUpload();
  }

  // Always update display, regardless of current state
  if (millis() - lastLCDUpdateTime >= LCD_UPDATE_INTERVAL) {
    updateDisplay();
  }
  
  // Main state machine
  switch (currentState) {
    case STATE_INIT:
      currentState = STATE_READ_SENSORS;
      break;
      
    case STATE_READ_SENSORS:
      if (sensorTaskState == TASK_COMPLETED) {
        sensorTaskState = TASK_IDLE;
        
        // Evaluate if watering is needed
        if (sensorData.soilMoisture < SOIL_THRESHOLD) {
          currentState = STATE_EVALUATE_WATERING;
        } else {
          currentState = STATE_DISPLAY_DATA;
        }
      } else if (sensorTaskState == TASK_FAILED) {
        sensorTaskState = TASK_IDLE;
        displayErrorOnce(currentError);
        currentState = STATE_DISPLAY_DATA;
      }
      break;
      
    case STATE_EVALUATE_WATERING:
      startWatering();
      
      if (wateringTaskState == TASK_RUNNING) {
        continueWatering();
      } else if (wateringTaskState == TASK_COMPLETED) {
        wateringTaskState = TASK_IDLE;
        currentState = STATE_DISPLAY_DATA;
      } else if (wateringTaskState == TASK_FAILED) {
        wateringTaskState = TASK_IDLE;
        currentError = ERROR_PUMP;
      }
      break;
      
    case STATE_WATERING:
      continueWatering();
      
      if (wateringTaskState == TASK_COMPLETED) {
        wateringTaskState = TASK_IDLE;
        currentState = STATE_DISPLAY_DATA;
      } else if (wateringTaskState == TASK_FAILED) {
        wateringTaskState = TASK_IDLE;
        currentError = ERROR_PUMP;
      }
      break;
      
    case STATE_DISPLAY_DATA:
      // Periodically go back to read sensors
      if (millis() - lastSensorReadTime >= SENSOR_READ_INTERVAL) {
        currentState = STATE_READ_SENSORS;
      }
      break;
      
    case STATE_SEND_DATA:
      if (dbTaskState == TASK_RUNNING) {
        continueDataUpload();
      } else if (dbTaskState == TASK_COMPLETED) {
        dbTaskState = TASK_IDLE;
        currentState = STATE_DISPLAY_DATA;
      } else if (dbTaskState == TASK_FAILED) {
        dbTaskState = TASK_IDLE;
        dataTransmissionErrors++;
        
        if (dataTransmissionErrors >= 3) {
          if (millis() - lastDBRetryTime >= DB_RETRY_INTERVAL) {
            startDatabaseConnection();
            lastDBRetryTime = millis();
          }
        }
        
        currentState = STATE_DISPLAY_DATA;
      }
      break;
      
    case STATE_ERROR:
      handleError();
      break;
  }
  
  // Small delay to prevent hogging CPU
  delay(50);
}