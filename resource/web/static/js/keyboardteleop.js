/**
 * @author Russell Toris - rctoris@wpi.edu
 */

var KEYBOARDTELEOP = KEYBOARDTELEOP || {
  REVISION : '0.4.0-SNAPSHOT'
};

/**
 * @author Russell Toris - rctoris@wpi.edu
 */

/**
 * Manages connection to the server and all interactions with ROS.
 *
 * Emits the following events:
 *   * 'change' - emitted with a change in speed occurs
 *
 * @constructor
 * @param options - possible keys include:
 *   * ros - the ROSLIB.Ros connection handle
 *   * topic (optional) - the Twist topic to publish to, like '/cmd_vel'
 *   * throttle (optional) - a constant throttle for the speed
 *   * maxLinearSpeed (optional) - maximum linear speed
 *   * maxAngularSpeed (optional) - maximum angular speed
 */
KEYBOARDTELEOP.Teleop = function(options) {
  var that = this;
  options = options || {};
  var ros = options.ros;
  var topic = options.topic || '/cmd_vel';
  var throttle = options.throttle !== undefined ? options.throttle : 1.0;
  var maxLinearSpeed = options.maxLinearSpeed !== undefined ? options.maxLinearSpeed : 0.375;
  var maxAngularSpeed = options.maxAngularSpeed !== undefined ? options.maxAngularSpeed : 1.5;
  var commandPublishPeriod = 50;

  // used to externally throttle the speed (e.g., from a slider)
  this.scale = 1.0;

  // linear x movement and angular z movement
  var x = 0;
  var z = 0;

  var cmdVel = new ROSLIB.Topic({
    ros : ros,
    name : topic,
    messageType : 'geometry_msgs/msg/Twist',
    queue_length: 20
  });

  var publishCurrentTwist = function() {
    var twist = new ROSLIB.Message({
      angular : {
        x : 0,
        y : 0,
        z : z
      },
      linear : {
        x : x,
        y : 0,
        z : 0
      }
    });
    cmdVel.publish(twist);
    return twist;
  };

  this.stop = function(publishStop) {
    var changed = x !== 0 || z !== 0;
    x = 0;
    z = 0;

    if (publishStop === false) {
      return;
    }

    var twist = publishCurrentTwist();
    if (changed) {
      that.emit('change', twist);
    }
  };

  // sets up a key listener on the page used for keyboard teleoperation
  var handleKey = function(keyCode, keyDown) {
    // used to check for changes in speed
    var oldX = x;
    var oldZ = z;

    var pub = true;

    var speed = 0;
    // throttle the speed by the slider and throttle constant
    if (keyDown === true) {
      speed = throttle * that.scale;
    }
    // check which key was pressed
    switch (keyCode) {
      case 65:
        // turn left
        z = maxAngularSpeed * speed;
        break;
      case 87:
        // up
        x = maxLinearSpeed * speed;
        break;
      case 68:
        // turn right
        z = -maxAngularSpeed * speed;
        break;
      case 83:
        // down
        x = -maxLinearSpeed * speed;
        break;
      default:
        pub = false;
    }

    // publish the command
    if (pub === true) {
      var twist = publishCurrentTwist();

      // check for changes
      if (oldX !== x || oldZ !== z) {
        that.emit('change', twist);
      }
    }
  };

  // Keep publishing while a movement key is held so move_node does not time out.
  var publishTimer = window.setInterval(function() {
    if (x !== 0 || z !== 0) {
      publishCurrentTwist();
    }
  }, commandPublishPeriod);

  // handle the key
  var body = document.getElementsByTagName('body')[0];
  var isEditableTarget = function(target) {
    if (!target) {
      return false;
    }
    var tagName = target.tagName ? target.tagName.toLowerCase() : '';
    return tagName === 'input' || tagName === 'textarea' || tagName === 'select' || target.isContentEditable;
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

  this.dispose = function(publishStop) {
    window.clearInterval(publishTimer);
    body.removeEventListener('keydown', handleKeyDown, false);
    body.removeEventListener('keyup', handleKeyUp, false);
    that.stop(publishStop);
  };
};
KEYBOARDTELEOP.Teleop.prototype.__proto__ = EventEmitter2.prototype;
