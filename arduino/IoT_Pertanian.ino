#include <Wire.h>
#include <LiquidCrystal_I2C.h>
#include <DHT.h>
#include <WiFiS3.h>
#include <WDT.h>
#include <NTPClient.h>
#include <WiFiUdp.h>
#include <ArduinoHttpClient.h>
#include <ArduinoJson.h>

// Pin Definitions
#define SOILPIN A0
#define MQ135PIN A1
#define LDRPIN A2
#define RAINPIN A3
#define DHTPIN 7
#define DHTTYPE DHT11
#define PUMP 2

// Defining state
#define SOIL_LOW 200
#define SOIL_MEDIUM 400
#define LIGHT_LOW 600
#define LIGHT_MEDIUM 400
#define RAIN_LOW 990
#define RAIN_MEDIUM 920
#define AIR_QUALITY_LOW 400
#define AIR_QUALITY_MEDIUM 800

// Timing Settings
#define WATCHDOG_TIMEOUT 8000
#define GMT_OFFSET_SECONDS 25200 // Time Zone GMT +7

// System States
enum SystemState {
  STATE_READ_SENSORS,
  STATE_DISPLAY_DATA,
  STATE_SEND_DATA,
  STATE_WATERING
};

// Error Codes
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

// WiFi and Server Settings
const char* ssid = "SmartRoomPrototype";
const char* password = "Binus123!";
const char* server = "10.37.35.69";
const int port = 3001;  

// HTTP client
WiFiClient wifi;
HttpClient http(wifi, server, port);

// NTP time synchronization
WiFiUDP ntpUDP;
NTPClient timeClient(ntpUDP, "pool.ntp.org", GMT_OFFSET_SECONDS);
bool timeInitialized = false;
unsigned long lastNTPUpdateTime = 0;

// Global Variables
DHT dht(DHTPIN, DHTTYPE);
LiquidCrystal_I2C lcd(0x27, 16, 2);

// System state and error tracking
SystemState currentState = STATE_READ_SENSORS;
ErrorCode currentError = ERROR_NONE;
ErrorCode lastDisplayedError = ERROR_NONE;
char errorMessage[32] = "";

// Global timing variables
unsigned long lastStateChangeTime = 0;
const unsigned long STATE_DURATION = 1000;

// Buffer
char msgBuffer[150];
char timeStampBuffer[25];
char valueBuffer[10];

// Sensor data structure
struct SensorData {
  float temperature;
  float humidity;
  int ldrValue;
  int rainValue;
  int airQuality;
  int soilMoisture;
  bool isValid;
  unsigned long timestamp;
} sensorData;

// Add display mode tracking
byte displayMode = 0;
const byte NUM_DISPLAY_MODES = 6;

// Add watering control variables
unsigned long pumpStartTime = 0;
bool isPumpActive = false;
const unsigned long MAX_PUMP_DURATION = 30000;

// Add state execution flags to prevent multiple executions
bool sensorsReadThisCycle = false;
bool dataSentThisCycle = false;

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

// Function to check and reconnect WiFi if needed
bool checkWiFi() {
  if (WiFi.status() != WL_CONNECTED) {
    snprintf(msgBuffer, sizeof(msgBuffer), "Warning: WiFi disconnected. Attempting to reconnect...");
    Serial.println(msgBuffer);
    
    WiFi.begin(ssid, password);
    unsigned long startTime = millis();
    while (WiFi.status() != WL_CONNECTED && (millis() - startTime) < 10000) {
      WDT.refresh();
      delay(500);
      Serial.print(".");
    }
    
    if (WiFi.status() == WL_CONNECTED) {
      Serial.println(F("\nReconnected to WiFi!"));
      currentError = ERROR_NONE;
      return true;
    }
    
    Serial.println(F("Warning: Failed to reconnect to WiFi."));
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

// Function to control watering based on conditions
void controlWatering() {
  // Get current sensor readings
  int soilValue = sensorData.soilMoisture;
  int rainValue = sensorData.rainValue;
  
  // Check if pump is already running
  if (isPumpActive) {
    // Check if soil is now wet enough or max duration reached
    if (soilValue > SOIL_LOW || (millis() - pumpStartTime) > MAX_PUMP_DURATION) {
      digitalWrite(PUMP, LOW);
      isPumpActive = false;
      Serial.println(F("Pump stopped - Soil wet or max duration reached"));
    }
    return;
  }
  
  // Check if soil is dry
  if (soilValue < SOIL_LOW) {
    // Check rain conditions
    if (rainValue < RAIN_MEDIUM) {
      // Heavy rain - don't water
      Serial.println(F("No watering needed - Heavy rain detected"));
    } else if (rainValue < RAIN_LOW) {
      // Medium rain - partial watering
      digitalWrite(PUMP, HIGH);
      isPumpActive = true;
      pumpStartTime = millis();
      Serial.println(F("Partial watering started - Medium rain"));
    } else {
      // No rain - full watering
      digitalWrite(PUMP, HIGH);
      isPumpActive = true;
      pumpStartTime = millis();
      Serial.println(F("Full watering started - No rain"));
    }
  }
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
  
  // Set initial state
  currentState = STATE_READ_SENSORS;
  lastStateChangeTime = millis();
  
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
  
  // Check if it's time to change state
  if (millis() - lastStateChangeTime >= STATE_DURATION) {
    // Move to next state
    switch (currentState) {
      case STATE_READ_SENSORS:
        currentState = STATE_DISPLAY_DATA;
        sensorsReadThisCycle = false; // Reset flag for next cycle
        break;
      case STATE_DISPLAY_DATA:
        currentState = STATE_SEND_DATA;
        // Increment display mode when moving to next state
        displayMode = (displayMode + 1) % NUM_DISPLAY_MODES;
        break;
      case STATE_SEND_DATA:
        currentState = STATE_WATERING;
        dataSentThisCycle = false; // Reset flag for next cycle
        break;
      case STATE_WATERING:
        currentState = STATE_READ_SENSORS;
        break;
    }
    lastStateChangeTime = millis();
  }
  
  // Declare variables outside switch statement
  float newTemp;
  float newHumidity;
  
  // Execute current state
  switch (currentState) {
    case STATE_READ_SENSORS:
      // Read all sensors only once per cycle
      if (!sensorsReadThisCycle) {
        // Read all sensors
        if (timeInitialized) {
          sensorData.timestamp = timeClient.getEpochTime();
        } else {
          sensorData.timestamp = millis() / 1000;
        }
        
        // Read DHT sensor
        newTemp = dht.readTemperature();
        newHumidity = dht.readHumidity();
        if (!isnan(newTemp) && !isnan(newHumidity)) {
          sensorData.temperature = newTemp;
          sensorData.humidity = newHumidity;
          currentError = ERROR_NONE;
        } else {
          currentError = ERROR_DHT;
        }
        
        // Read other sensors
        sensorData.ldrValue = analogRead(LDRPIN);
        sensorData.rainValue = analogRead(RAINPIN);
        sensorData.airQuality = analogRead(MQ135PIN);
        sensorData.soilMoisture = analogRead(SOILPIN);
        
        // Log sensor data to serial
        getFormattedTime(timeStampBuffer, sizeof(timeStampBuffer));
        Serial.print(F("\nTimestamp: "));
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
        
        snprintf(msgBuffer, sizeof(msgBuffer), "Air Quality  : %d (%s)", 
                sensorData.airQuality, getSensorStatus(sensorData.airQuality, AIR_QUALITY_LOW, AIR_QUALITY_MEDIUM, false));
        Serial.println(msgBuffer);
        
        snprintf(msgBuffer, sizeof(msgBuffer), "Soil Moisture: %d (%s)\n", 
                sensorData.soilMoisture, getSensorStatus(sensorData.soilMoisture, SOIL_LOW, SOIL_MEDIUM, false));
        Serial.println(msgBuffer);
        
        sensorsReadThisCycle = true; // Mark as read for this cycle
      }
      break;
      
    case STATE_DISPLAY_DATA:
      // Update LCD display based on current mode
      lcd.clear();
      switch (displayMode) {
        case 0:  // Temperature and Humidity
          lcd.setCursor(0, 0);
          lcd.print(F("Temp: ")); 
          lcd.print(sensorData.temperature, 1); 
          lcd.print((char)223); 
          lcd.print(F("C    "));
          
          lcd.setCursor(0, 1);
          lcd.print(F("Humidity: ")); 
          lcd.print(sensorData.humidity, 1); 
          lcd.print(F("%    "));
          break;
          
        case 1:  // Soil Moisture
          lcd.setCursor(0, 0);
          lcd.print(F("Soil Moisture:"));
          lcd.setCursor(0, 1);
          lcd.print(getSensorStatus(sensorData.soilMoisture, SOIL_LOW, SOIL_MEDIUM, false));
          lcd.print(F(" ("));
          lcd.print(sensorData.soilMoisture);
          lcd.print(F(")"));
          break;
          
        case 2:  // Rain Level
          lcd.setCursor(0, 0);
          lcd.print(F("Rain Level:"));
          lcd.setCursor(0, 1);
          lcd.print(getSensorStatus(sensorData.rainValue, RAIN_LOW, RAIN_MEDIUM, true));
          lcd.print(F(" ("));
          lcd.print(sensorData.rainValue);
          lcd.print(F(")"));
          break;
          
        case 3:  // Light Level
          lcd.setCursor(0, 0);
          lcd.print(F("Light Level:"));
          lcd.setCursor(0, 1);
          lcd.print(getSensorStatus(sensorData.ldrValue, LIGHT_LOW, LIGHT_MEDIUM, true));
          lcd.print(F(" ("));
          lcd.print(sensorData.ldrValue);
          lcd.print(F(")"));
          break;
          
        case 4:  // Air Quality
          lcd.setCursor(0, 0);
          lcd.print(F("Air Quality:"));
          lcd.setCursor(0, 1);
          lcd.print(getSensorStatus(sensorData.airQuality, AIR_QUALITY_LOW, AIR_QUALITY_MEDIUM, false));
          lcd.print(F(" ("));
          lcd.print(sensorData.airQuality);
          lcd.print(F(")"));
          break;
          
        case 5:  // Time and Date
          if (timeInitialized) {
            lcd.setCursor(0, 0);
            lcd.print(F("Time: "));
            lcd.print(timeClient.getFormattedTime());
            
            lcd.setCursor(0, 1);
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
          } else {
            lcd.setCursor(0, 0);
            lcd.print(F("Time not sync'd"));
            lcd.setCursor(0, 1);
            lcd.print(F("Check WiFi/NTP"));
          }
          break;
      }
      break;
      
    case STATE_SEND_DATA:
      // Send data only once per cycle
      if (!dataSentThisCycle && WiFi.status() == WL_CONNECTED) {
        // Prepare JSON data
        StaticJsonDocument<512> doc;
        
        getFormattedTime(timeStampBuffer, sizeof(timeStampBuffer));
        doc["timestamp"] = timeStampBuffer;
        doc["temperature"] = sensorData.temperature;
        doc["humidity"] = sensorData.humidity;
        doc["ldrValue"] = sensorData.ldrValue;
        doc["rainValue"] = sensorData.rainValue;
        doc["airQualityPPM"] = sensorData.airQuality;
        doc["soilMoisture"] = sensorData.soilMoisture;
        
        String jsonData;
        serializeJson(doc, jsonData);
        
        // Debug: Print the JSON data
        Serial.println(F("Sending JSON data:"));
        Serial.println(jsonData);
        
        // Set up HTTP request with timeout
        http.setTimeout(5000);
        
        // Set up HTTP request
        http.beginRequest();
        http.post("/api/sensors/data");
        http.sendHeader("Content-Type", "application/json");
        http.sendHeader("Content-Length", jsonData.length());
        http.write((const uint8_t*)jsonData.c_str(), jsonData.length());
        http.endRequest();
        
        // Check response with detailed error handling
        int statusCode = http.responseStatusCode();
        String response = http.responseBody();
        
        Serial.print(F("HTTP Status Code: "));
        Serial.println(statusCode);
        Serial.print(F("Response: "));
        Serial.println(response);
        
        if (statusCode == 200) {
          Serial.println(F("Data sent successfully"));
          currentError = ERROR_NONE;
        } else if (statusCode == 500) {
          Serial.println(F("Server Error (500) - Check server logs"));
          Serial.println(F("Response body:"));
          Serial.println(response);
          currentError = ERROR_SERVER;
          
          // Try to parse error response if it's JSON
          StaticJsonDocument<200> errorDoc;
          DeserializationError error = deserializeJson(errorDoc, response);
          if (!error) {
            if (errorDoc.containsKey("message")) {
              Serial.print(F("Error message: "));
              Serial.println(errorDoc["message"].as<const char*>());
            }
          }
        } else {
          Serial.print(F("HTTP request failed with status: "));
          Serial.println(statusCode);
          Serial.println(F("Response body:"));
          Serial.println(response);
          currentError = ERROR_SERVER;
        }
        
        dataSentThisCycle = true;
      } else if (!dataSentThisCycle && WiFi.status() != WL_CONNECTED) {
        Serial.println(F("WiFi not connected - skipping data upload"));
        currentError = ERROR_WIFI;
        dataSentThisCycle = true;
      }
      break;
      
    case STATE_WATERING:
      // Control watering based on conditions
      controlWatering();
      
      // Display watering status on LCD
      lcd.clear();
      lcd.setCursor(0, 0);
      lcd.print(F("Watering Status:"));
      lcd.setCursor(0, 1);
      if (isPumpActive) {
        lcd.print(F("PUMP ON"));
        if (sensorData.rainValue > RAIN_LOW && sensorData.rainValue <= RAIN_MEDIUM) {
          lcd.print(F(" (Partial)"));
        }
      } else {
        lcd.print(F("PUMP OFF"));
      }
      break;
  }
  
  if (currentError != ERROR_NONE) {
    displayErrorOnce(currentError);
  }
  
  delay(50);
}