/**
 * @author Russell Toris - rctoris@wpi.edu
 */

var KEYBOARDTELEOP = KEYBOARDTELEOP || {
  REVISION: '0.4.0-SNAPSHOT'
};

/**
 * Manages connection to the server and all interactions with ROS.
 *
 * Emits the following events:
 *   * 'change' - emitted when a change in speed occurs
 *
 * @constructor
 * @param options - possible keys include:
 *   * ros - the ROSLIB.Ros connection handle
 *   * topic (optional) - Twist topic, for example '/cmd_vel'
 *   * throttle (optional) - constant speed multiplier
 *   * maxLinearSpeed (optional) - maximum linear speed
 *   * maxAngularSpeed (optional) - maximum angular speed
 */
KEYBOARDTELEOP.Teleop = function(options) {
  var that = this;

  options = options || {};

  var ros = options.ros;
  var topic = options.topic || '/cmd_vel';

  var throttle = (
    options.throttle !== undefined
      ? options.throttle
      : 1.0
  );

  // Физические ограничения ровера.
  var maxLinearSpeed = (
    options.maxLinearSpeed !== undefined
      ? options.maxLinearSpeed
      : 0.375
  );
  var maxAngularSpeed = (
    options.maxAngularSpeed !== undefined
      ? options.maxAngularSpeed
      : 1.5
  );

  // Период повторной публикации команды, мс.
  var commandPublishPeriod = 50;

  // Дополнительный множитель, например от ползунка.
  this.scale = 1.0;

  // Текущая команда движения.
  var x = 0;
  var y = 0;
  var z = 0;

  var cmdVel = new ROSLIB.Topic({
    ros: ros,
    name: topic,
    messageType: 'geometry_msgs/msg/Twist',
    queue_length: 20
  });

  var publishCurrentTwist = function() {
    var twist = new ROSLIB.Message({
      angular: {
        x: 0,
        y: 0,
        z: z
      },
      linear: {
        x: x,
        y: y,
        z: 0
      }
    });

    cmdVel.publish(twist);

    return twist;
  };

  this.stop = function(publishStop) {
    var changed = (
      x !== 0
      || y !== 0
      || z !== 0
    );

    x = 0;
    y = 0;
    z = 0;

    if (publishStop === false) {
      return;
    }

    var twist = publishCurrentTwist();

    if (changed) {
      that.emit('change', twist);
    }
  };

  var handleKey = function(keyCode, keyDown) {
    var oldX = x;
    var oldY = y;
    var oldZ = z;

    var publish = true;
    var speed = 0;

    if (keyDown === true) {
      speed = throttle * that.scale;
    }

    switch (keyCode) {
      case 65:
        // A — поворот налево.
        z = maxAngularSpeed * speed;
        break;

      case 87:
        // W — движение вперёд.
        x = maxLinearSpeed * speed;
        break;

      case 68:
        // D — поворот направо.
        z = -maxAngularSpeed * speed;
        break;

      case 83:
        // S — движение назад.
        x = -maxLinearSpeed * speed;
        break;

      default:
        publish = false;
    }

    if (publish === true) {
      var twist = publishCurrentTwist();

      if (
        oldX !== x
        || oldY !== y
        || oldZ !== z
      ) {
        that.emit('change', twist);
      }
    }
  };

  // Пока клавиша удерживается, команда повторяется каждые 50 мс.
  // Это не позволяет тайм-ауту move_node остановить ровер.
  var publishTimer = window.setInterval(function() {
    if (
      x !== 0
      || y !== 0
      || z !== 0
    ) {
      publishCurrentTwist();
    }
  }, commandPublishPeriod);

  var body = document.getElementsByTagName('body')[0];

  var isEditableTarget = function(target) {
    if (!target) {
      return false;
    }

    var tagName = (
      target.tagName
        ? target.tagName.toLowerCase()
        : ''
    );

    return (
      tagName === 'input'
      || tagName === 'textarea'
      || tagName === 'select'
      || target.isContentEditable
    );
  };

  var handleKeyDown = function(event) {
    if (!isEditableTarget(event.target)) {
      handleKey(event.keyCode, true);
    }
  };

  var handleKeyUp = function(event) {
    handleKey(event.keyCode, false);
  };

  body.addEventListener('keydown', handleKeyDown, false);
  body.addEventListener('keyup', handleKeyUp, false);

  // Метод для корректного удаления Teleop при необходимости.
  this.dispose = function(publishStop) {
    window.clearInterval(publishTimer);
    body.removeEventListener('keydown', handleKeyDown, false);
    body.removeEventListener('keyup', handleKeyUp, false);
    that.stop(publishStop);
  };
};

KEYBOARDTELEOP.Teleop.prototype.__proto__ =
  EventEmitter2.prototype;
