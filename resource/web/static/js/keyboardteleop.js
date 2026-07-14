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
  var maxLinearSpeed = 0.375;
  var maxAngularSpeed = 1.5;

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

  body.addEventListener('keydown', function(event) {
    if (!isEditableTarget(event.target)) {
      handleKey(event.keyCode, true);
    }
  }, false);

  body.addEventListener('keyup', function(event) {
    handleKey(event.keyCode, false);
  }, false);

  // Если окно потеряло фокус, останавливаем ровер.
  window.addEventListener('blur', function() {
    that.stop();
  }, false);

  // При переключении на другую вкладку тоже останавливаемся.
  document.addEventListener('visibilitychange', function() {
    if (document.hidden) {
      that.stop();
    }
  }, false);

  // Метод для корректного удаления Teleop при необходимости.
  this.dispose = function() {
    window.clearInterval(publishTimer);
    that.stop();
  };
};

KEYBOARDTELEOP.Teleop.prototype.__proto__ =
  EventEmitter2.prototype;
