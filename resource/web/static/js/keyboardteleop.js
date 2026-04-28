

/**
 * KEYBOARD TELEOP (clean + irrigation control integrated)
 */

var KEYBOARDTELEOP = KEYBOARDTELEOP || {
  REVISION: '0.4.0-SNAPSHOT'
};

KEYBOARDTELEOP.Teleop = function(options) {
  var that = this;
  options = options || {};

  var ros = options.ros;
  var topic = options.topic || '/cmd_vel';

  this.scale = 1.0;

  // =========================
  // Movement
  // =========================
  var x = 0;
  var y = 0;
  var z = 0;

  var cmdVel = new ROSLIB.Topic({
    ros: ros,
    name: topic,
    messageType: 'geometry_msgs/msg/Twist',
    queue_length: 20
  });

  // =========================
  // IRRIGATION STATE
  // =========================
  var irrigationTiltAngle = 160;
  var irrigationPanAngle  = 90;

  var irrigationTiltTopic = new ROSLIB.Topic({
    ros: ros,
    name: '/irrigation/nozzle/tilt',
    messageType: 'std_msgs/Int16'
  });

  var irrigationPanTopic = new ROSLIB.Topic({
    ros: ros,
    name: '/irrigation/nozzle/pan',
    messageType: 'std_msgs/Int16'
  });

  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }
  // =========================
  // KEY HANDLER
  // =========================
  var handleKey = function(keyCode, keyDown) {

    var oldX = x;
    var oldY = y;
    var oldZ = z;

    var pub = true;
    var speed = 0;

    if (keyDown === true) {
      speed = that.scale;
    }

    switch (keyCode) {

      // =====================
      // MOVEMENT (WASD)
      // =====================
      case 65: z = 1.5 * speed; break;   // A
      case 68: z = -1.5 * speed; break;  // D
      case 87: x = 0.8 * speed; break;   // W
      case 83: x = -0.8 * speed; break;  // S
      case 81: y = 0.5 * speed; break;   // Q
      case 69: y = -0.5 * speed; break;  // E

      // =====================
      // IRRIGATION CONTROL
      // =====================

      // J - nozzle left
      case 74:
        irrigationPanAngle += 2;
        irrigationPanAngle = clamp(irrigationPanAngle, 50, 180);
        irrigationPanTopic.publish(new ROSLIB.Message({ data: irrigationPanAngle }));
        pub = false;
        break;

      // L - nozzle right
      case 76:
        irrigationPanAngle -= 2;
        irrigationPanAngle = clamp(irrigationPanAngle, 50, 180);
        irrigationPanTopic.publish(new ROSLIB.Message({ data: irrigationPanAngle }));
        pub = false;
        break;

      // K - nozzle up
      case 75:
        irrigationTiltAngle += 2;
        irrigationTiltAngle = clamp(irrigationTiltAngle, 94, 160);
        irrigationTiltTopic.publish(new ROSLIB.Message({ data: irrigationTiltAngle }));
        pub = false;
        break;
    
      // I - nozzle down
      case 73:
        irrigationTiltAngle -= 2;
        irrigationTiltAngle = clamp(irrigationTiltAngle, 94, 160);
        irrigationTiltTopic.publish(new ROSLIB.Message({ data: irrigationTiltAngle }));
        pub = false;
        break;

      default:
        pub = false;
    }

    // =====================
    // PUBLISH MOVEMENT
    // =====================
    if (pub === true) {
      var twist = new ROSLIB.Message({
        angular: { x: 0, y: 0, z: z },
        linear:  { x: x, y: y, z: z }
      });

      cmdVel.publish(twist);

      if (oldX !== x || oldY !== y || oldZ !== z) {
        that.emit('change', twist);
      }
    }
  };

  // =========================
  // EVENT LISTENERS
  // =========================
  var body = document.getElementsByTagName('body')[0];

  body.addEventListener('keydown', function(e) {
    handleKey(e.keyCode, true);
  }, false);

  body.addEventListener('keyup', function(e) {
    handleKey(e.keyCode, false);
  }, false);
};

KEYBOARDTELEOP.Teleop.prototype.__proto__ = EventEmitter2.prototype;