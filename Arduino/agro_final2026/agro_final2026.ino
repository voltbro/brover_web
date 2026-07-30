/*
 * BRover-E5, комплект расширения "Транспортировка растений".
 *
 * VBCores ServoBoard:
 *   PA1 - наклон камеры;
 *   PA0 - поворот камеры;
 *   PB0 - подъём и опускание схвата.
 *
 * Управление поступает по CAN1 / CAN FD.
 */

#include <Servo.h>
#include <VBCoreG4_arduino_system.h>

// ===== CAN =====
static const uint32_t CAN_CONTROL_ID = 0x100;

FDCAN_HandleTypeDef* hfdcan1;
CanFD* canfd;

// ===== CAN device IDs =====
static const uint8_t DEV_CAMERA = 0x01;
static const uint8_t DEV_GRIPPER = 0x02;

// ===== CAN commands =====
static const uint8_t CMD_TILT = 0x01;
static const uint8_t CMD_PAN = 0x02;
static const uint8_t CMD_STATE = 0x03;

// ===== Gripper commands =====
static const uint8_t GRIPPER_STOP = 0;
static const uint8_t GRIPPER_UP = 1;
static const uint8_t GRIPPER_DOWN = 2;

// ===== Servo pins =====
#define CAMERA_TILT_PIN PA1
#define CAMERA_PAN_PIN PA0
#define GRIPPER_LIFT_PIN PB0

// ===== Camera angles =====
static const int CAMERA_TILT_INITIAL_ANGLE = 60;
static const int CAMERA_PAN_INITIAL_ANGLE = 90;

// ===== Gripper lift settings =====
// 10° is the maximum raised position used during mechanical assembly.
static const int GRIPPER_UP_ANGLE = 10;
static const int GRIPPER_DOWN_ANGLE = 150;
static const int GRIPPER_STEP_DEGREES = 2;
static const uint32_t GRIPPER_STEP_INTERVAL_MS = 50;

Servo cameraTiltServo;
Servo cameraPanServo;
Servo gripperLiftServo;

int gripperAngle = GRIPPER_UP_ANGLE;
uint8_t gripperState = GRIPPER_STOP;
uint32_t lastGripperStepAt = 0;

void setGripperState(uint8_t state) {
  if (state == GRIPPER_UP ||
      state == GRIPPER_DOWN ||
      state == GRIPPER_STOP) {
    gripperState = state;
  } else {
    gripperState = GRIPPER_STOP;
  }
}

void processCanMessage(const uint8_t* data) {
  const uint8_t device = data[0];
  const uint8_t command = data[1];
  const uint8_t value = data[2];

  if (device == DEV_CAMERA) {
    if (command == CMD_TILT) {
      cameraTiltServo.write(constrain(value, 0, 180));
    } else if (command == CMD_PAN) {
      cameraPanServo.write(constrain(value, 0, 180));
    }
    return;
  }

  if (device == DEV_GRIPPER && command == CMD_STATE) {
    setGripperState(value);
  }
}

void updateGripperLift() {
  const uint32_t now = millis();

  if (gripperState == GRIPPER_STOP ||
      now - lastGripperStepAt < GRIPPER_STEP_INTERVAL_MS) {
    return;
  }

  lastGripperStepAt = now;

  if (gripperState == GRIPPER_UP) {
    gripperAngle -= GRIPPER_STEP_DEGREES;

    if (gripperAngle <= GRIPPER_UP_ANGLE) {
      gripperAngle = GRIPPER_UP_ANGLE;
      gripperState = GRIPPER_STOP;
    }
  } else if (gripperState == GRIPPER_DOWN) {
    gripperAngle += GRIPPER_STEP_DEGREES;

    if (gripperAngle >= GRIPPER_DOWN_ANGLE) {
      gripperAngle = GRIPPER_DOWN_ANGLE;
      gripperState = GRIPPER_STOP;
    }
  }

  gripperLiftServo.write(gripperAngle);
}

void setup() {
  Serial.begin(115200);

  SystemClock_Config();
  canfd = new CanFD();
  canfd->init();
  canfd->write_default_params();
  canfd->apply_config();
  hfdcan1 = canfd->get_hfdcan();
  canfd->default_start();

  // Initialise the lift first. During assembly the rack must be fully raised
  // before the gear is installed on the servo shaft.
  gripperLiftServo.attach(GRIPPER_LIFT_PIN);
  gripperAngle = GRIPPER_UP_ANGLE;
  gripperState = GRIPPER_STOP;
  gripperLiftServo.write(gripperAngle);
  delay(1000);

  cameraTiltServo.attach(CAMERA_TILT_PIN);
  cameraTiltServo.write(CAMERA_TILT_INITIAL_ANGLE);

  cameraPanServo.attach(CAMERA_PAN_PIN);
  cameraPanServo.write(CAMERA_PAN_INITIAL_ANGLE);
  delay(200);

  Serial.println("ServoBoard ready");
  Serial.println("Gripper lift is in the maximum raised position (10 deg)");
}

void loop() {
  while (HAL_FDCAN_GetRxFifoFillLevel(hfdcan1, FDCAN_RX_FIFO0) > 0) {
    FDCAN_RxHeaderTypeDef header;
    uint8_t rxData[64];

    if (HAL_FDCAN_GetRxMessage(
            hfdcan1,
            FDCAN_RX_FIFO0,
            &header,
            rxData) != HAL_OK) {
      Error_Handler();
    }

    if (header.Identifier == CAN_CONTROL_ID &&
        header.IdType == FDCAN_EXTENDED_ID &&
        header.RxFrameType == FDCAN_DATA_FRAME &&
        header.DataLength == FDCAN_DLC_BYTES_4) {
      processCanMessage(rxData);
    }
  }

  updateGripperLift();
}
