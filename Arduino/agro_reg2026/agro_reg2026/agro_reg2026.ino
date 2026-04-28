/*
* Серво камера вверх/вниз (PA1) - 
* Серво камера вправо/влево (PA0)

* Серво полива вверх/вниз (PB0)
* Серво полива вправо/влево (PB1)

* Насос (M2 - PB5/PB7)

* tilt - вверх/вниз
* pan - вправо/влево
*/


#include <Servo.h>
#include <VBCoreG4_arduino_system.h>

// ===== CAN =====
FDCAN_HandleTypeDef* hfdcan1;
CanFD* canfd;

// ===== Servo =====
Servo cameraTiltServo;
Servo cameraPanServo;
Servo irrigationTiltServo;
Servo irrigationPanServo;

// ===== Pump =====
#define PUMP_OUT1 PB5
#define PUMP_OUT2 PB7

// ===== INIT ANGLES =====
int irrigationTilt_initAngle = 160;
int irrigationPan_initAngle  = 90;

int cameraTilt_initAngle = 60;
int cameraPan_initAngle  = 90;

// ===== LIMITS (only irrigation tilt) =====
#define IRRIGATION_TILT_MIN 94
#define IRRIGATION_TILT_MAX 160

#define IRRIGATION_PAN_MIN 40
#define IRRIGATION_PAN_MAX 180

// ===== DEVICE IDs =====
#define DEV_CAMERA     0x01
#define DEV_IRRIGATION 0x02
#define DEV_PUMP       0x03

// ===== COMMANDS =====
#define CMD_TILT  0x01
#define CMD_PAN   0x02
#define CMD_STATE 0x03

// ===== Pump control =====
void setPumpState(uint8_t state) {
  switch (state) {
    case 0:
      digitalWrite(PUMP_OUT1, LOW);
      digitalWrite(PUMP_OUT2, LOW);
      break;
    case 1:
      digitalWrite(PUMP_OUT1, LOW);
      digitalWrite(PUMP_OUT2, HIGH);
      break;
    case 2:
      digitalWrite(PUMP_OUT1, HIGH);
      digitalWrite(PUMP_OUT2, LOW);
      break;
  }
}

// ===== CAN message handler =====
void processCanMessage(uint8_t* data) {
  uint8_t device = data[0];
  uint8_t command = data[1];
  uint8_t value = data[2];

  switch (device) {

    case DEV_CAMERA:
      if (command == CMD_TILT) {
        cameraTiltServo.write(value);
      } else if (command == CMD_PAN) {
        cameraPanServo.write(value);
      }
      break;

    case DEV_IRRIGATION:
      if (command == CMD_TILT) {
        if (value > IRRIGATION_TILT_MAX) value = IRRIGATION_TILT_MAX;
        if (value < IRRIGATION_TILT_MIN) value = IRRIGATION_TILT_MIN;
        irrigationTiltServo.write(value);
      } else if (command == CMD_PAN) {
        if (value > IRRIGATION_PAN_MAX) value = IRRIGATION_PAN_MAX;
        if (value < IRRIGATION_PAN_MIN) value = IRRIGATION_PAN_MIN;
        irrigationPanServo.write(value);
      }
      break;

    case DEV_PUMP:
      if (command == CMD_STATE) {
        setPumpState(value);
      }
      break;
  }
}

// ===== SETUP =====
void setup() {
  Serial.begin(115200);

  // --- CAN INIT ---
  SystemClock_Config();
  canfd = new CanFD();
  canfd->init();
  canfd->write_default_params();
  canfd->apply_config();
  hfdcan1 = canfd->get_hfdcan();
  canfd->default_start();

  // --- Servo init ---
  irrigationTiltServo.attach(PB0);
  delay(50);
  irrigationTiltServo.write(irrigationTilt_initAngle);

  irrigationPanServo.attach(PB1);
  delay(50);
  irrigationPanServo.write(irrigationPan_initAngle);

  cameraTiltServo.attach(PA1);
  delay(50);
  cameraTiltServo.write(cameraTilt_initAngle);

  cameraPanServo.attach(PA0);
  delay(50);
  cameraPanServo.write(cameraPan_initAngle);

  delay(200);

  irrigationTiltServo.write(irrigationTilt_initAngle);
  irrigationPanServo.write(irrigationPan_initAngle);
  cameraTiltServo.write(cameraTilt_initAngle);
  cameraPanServo.write(cameraPan_initAngle);

  // --- Pump ---
  pinMode(PUMP_OUT1, OUTPUT);
  pinMode(PUMP_OUT2, OUTPUT);
}

// ===== LOOP =====
void loop() {
  while (HAL_FDCAN_GetRxFifoFillLevel(hfdcan1, FDCAN_RX_FIFO0) > 0) {

    FDCAN_RxHeaderTypeDef header;
    uint8_t rxData[4];

    if (HAL_FDCAN_GetRxMessage(hfdcan1, FDCAN_RX_FIFO0, &header, rxData) != HAL_OK) {
      Error_Handler();
    } else {
      processCanMessage(rxData);
    }
  }
}