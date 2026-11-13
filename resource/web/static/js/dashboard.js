$(document).ready(function(){
        var robotHost = $('.video-grid').attr('data-ros-host') || location.hostname;
        var rosStatus = $('#ros_status');
        var themeToggle = $('#theme_toggle');

        function applyTheme(theme) {
          $('body').toggleClass('theme-light', theme === 'light');
          themeToggle.text(theme === 'light' ? 'Тёмная тема' : 'Светлая тема');
        }

        var savedTheme = localStorage.getItem('brover_theme') || 'dark';
        applyTheme(savedTheme);

        themeToggle.on('click', function() {
          var nextTheme = $('body').hasClass('theme-light') ? 'dark' : 'light';
          localStorage.setItem('brover_theme', nextTheme);
          applyTheme(nextTheme);
        });

        $('.camera-tab').on('click', function() {
          var camera = $(this).data('camera');
          var selectedCard = $('.video-card[data-camera="' + camera + '"]');
          if (selectedCard.hasClass('video-card--active')) {
            return;
          }
          $('.video-card img').removeAttr('src');
          $('.camera-tab').removeClass('camera-tab--active');
          $(this).addClass('camera-tab--active');
          $('.video-card').removeClass('video-card--active');
          selectedCard.addClass('video-card--active');
          var selectedImage = selectedCard.find('img');
          selectedImage.attr('src', selectedImage.attr('data-stream-src'));
        });

        var ros = new ROSLIB.Ros({
            url : 'ws://' + robotHost + ':9090'
        });
        var reconnectTimer = null;
        var reconnectDelay = 1000;
        var pageLeaving = false;

        function scheduleReconnect() {
          if (pageLeaving || reconnectTimer !== null || ros.isConnected) return;
          reconnectTimer = setTimeout(function() {
            reconnectTimer = null;
            if (!pageLeaving && !ros.isConnected) {
              try {
                ros.connect('ws://' + robotHost + ':9090');
              } catch (error) {
                scheduleReconnect();
              }
            }
          }, reconnectDelay);
          reconnectDelay = Math.min(reconnectDelay * 2, 10000);
        }

        ros.on('connection', function() {
          clearTimeout(reconnectTimer);
          reconnectTimer = null;
          reconnectDelay = 1000;
          stopAllMotion(false);
          rosStatus.html('<span class="status-dot"></span>ROS доступен');
          rosStatus.removeClass('status--warn status--bad').addClass('status--ok');
        });

        ros.on('error', function() {
          rosStatus.html('<span class="status-dot"></span>ROS недоступен');
          rosStatus.removeClass('status--ok status--warn').addClass('status--bad');
          stopAllMotion(false);
        });

        ros.on('close', function() {
          rosStatus.html('<span class="status-dot"></span>ROS недоступен');
          rosStatus.removeClass('status--ok status--warn').addClass('status--bad');
          stopAllMotion(false);
          scheduleReconnect();
        });

        var motionLimits = {
          linear: 0.375,
          angular: 1.5
        };

        var teleop = new KEYBOARDTELEOP.Teleop({
            ros : ros,
            topic : '/cmd_vel',
            maxLinearSpeed : motionLimits.linear,
            maxAngularSpeed : motionLimits.angular,
        });

        var touchCmdVel = new ROSLIB.Topic({
          ros : ros,
          name : '/cmd_vel',
          messageType : 'geometry_msgs/msg/Twist',
          queue_length: 20
        });

        function publishTwist(linearX, angularZ) {
          if (!ros.isConnected) return;
          touchCmdVel.publish(new ROSLIB.Message({
            angular: {x: 0, y: 0, z: angularZ},
            linear: {x: linearX, y: 0, z: 0}
          }));
        }

        var joystick = $('#mobile_joystick');
        var joystickKnob = $('#mobile_joystick_knob');
        var joystickTimer = null;
        var joystickVector = {x: 0, y: 0};

        function updateJoystick(event) {
          var base = joystick.find('.mobile-joystick__base')[0];
          var rect = base.getBoundingClientRect();
          var radius = rect.width / 2;
          var centerX = rect.left + radius;
          var centerY = rect.top + radius;
          var dx = event.clientX - centerX;
          var dy = event.clientY - centerY;
          var distance = Math.sqrt(dx * dx + dy * dy);

          if (distance > radius) {
            dx = dx / distance * radius;
            dy = dy / distance * radius;
          }

          joystickVector.x = dx / radius;
          joystickVector.y = dy / radius;
          joystickKnob.css('transform', 'translate(' + dx + 'px, ' + dy + 'px)');
        }

        function publishJoystick() {
          var speed = teleop.scale;
          var linearX = -joystickVector.y * motionLimits.linear * speed;
          var angularZ = -joystickVector.x * motionLimits.angular * speed;
          publishTwist(linearX, angularZ);
        }

        function stopJoystick(publishStop) {
          var wasActive = joystickTimer !== null || joystick.hasClass('mobile-joystick--active');
          if (joystickTimer) {
            clearInterval(joystickTimer);
            joystickTimer = null;
          }
          joystick.removeClass('mobile-joystick--active');
          joystickVector = {x: 0, y: 0};
          joystickKnob.css('transform', 'translate(0, 0)');
          if (publishStop !== false && wasActive) {
            publishTwist(0, 0);
          }
        }

        function stopAllMotion(publishStop) {
          if (teleop) {
            teleop.stop(publishStop);
          }
          if (joystick) {
            stopJoystick(publishStop);
          }
        }

        joystick.on('pointerdown', function(event) {
          event.preventDefault();
          if (!ros.isConnected) return;
          teleop.stop();
          joystick.addClass('mobile-joystick--active');
          this.setPointerCapture(event.originalEvent.pointerId);
          updateJoystick(event.originalEvent);
          publishJoystick();
          joystickTimer = setInterval(publishJoystick, 120);
        });

        joystick.on('pointermove', function(event) {
          if (!joystick.hasClass('mobile-joystick--active')) {
            return;
          }
          event.preventDefault();
          updateJoystick(event.originalEvent);
          publishJoystick();
        });

        joystick.on('pointerup pointercancel', function(event) {
          event.preventDefault();
          stopJoystick();
        });

        $(window).on('blur pagehide', function() {
          stopAllMotion(ros.isConnected === true);
        });
        $(window).on('pagehide', function() {
          pageLeaving = true;
          clearTimeout(reconnectTimer);
          reconnectTimer = null;
        });
        $(window).on('pageshow', function() {
          pageLeaving = false;
          scheduleReconnect();
        });

        $(document).on('visibilitychange', function() {
          if (document.hidden) {
            stopAllMotion(ros.isConnected === true);
          }
        });

        $('#speed_slider').slider({
            formatter: function(value) {
                return 'Скорость: ' + value + '%';
            },
        }).on('change', function(slider){
            teleop.scale = (slider.value.newValue / 100.0);
            $('#speed_value').text(slider.value.newValue + '%');
        });

        var odom2d_listener = new ROSLIB.Topic({
          ros : ros,
          name : '/odom_pose2d',
          messageType : 'geometry_msgs/msg/Pose2D'
        });

        odom2d_listener.subscribe(function(message) {
          var yaw = message.theta * 180 / Math.PI;
          $('#pose_x').text(message.x.toFixed(2));
          $('#pose_y').text(message.y.toFixed(2));
          $('#imu_yaw').text(yaw.toFixed(0));
        });

        var bat_listener = new ROSLIB.Topic({
          ros : ros,
          name : '/bat',
          messageType : 'sensor_msgs/msg/BatteryState'
        });

        bat_listener.subscribe(function(message) {
          $('#bat_voltage').text(message.voltage.toFixed(2));
          $('#mobile_bat_voltage').text(message.voltage.toFixed(2));
        });

        function updateWifiStatus() {
          $.getJSON('/wifi_status', function(data) {
            var signal = data.signal_percent === null ? '--' : data.signal_percent + '%';
            var isAccessPoint = data.mode === 'ap';
            var primaryLabel = isAccessPoint ? 'Скорость соединения' : 'Wi-Fi';
            var primaryValue = isAccessPoint ? (data.bitrate || '--') : (signal + ' ' + (data.signal_label || ''));
            var ssid = data.ssid || '--';
            var mode = data.mode_label || '--';
            var ip = data.ip || '--';

            $('#wifi_primary_label').text(primaryLabel);
            $('#wifi_primary_value').text(primaryValue);
            $('#wifi_ssid').text(ssid);
            $('#wifi_mode').text(mode);
            $('#wifi_ip').text(ip);
            $('#mobile_wifi_label').text(primaryLabel);
            $('#mobile_wifi_value').text(isAccessPoint ? (data.bitrate || '--') : signal);
            $('#mobile_wifi_details').text(ssid + ' · ' + mode + ' · ' + ip);
          }).fail(function() {
            $('#wifi_primary_value, #mobile_wifi_value').text('--');
            $('#wifi_ssid, #wifi_mode, #wifi_ip, #mobile_wifi_details').text('--');
          });
        }

        updateWifiStatus();
        setInterval(updateWifiStatus, 5000);

        var resetOdomClient = new ROSLIB.Service({
           ros : ros,
           name : '/odom/reset',
           serviceType : 'std_srvs/Empty'
         });

        var request = new ROSLIB.ServiceRequest();
        var resetOdomAttempt = 0;

        $("#reset_odom").on("click", function(){
          var that = $(this);
          if (!ros.isConnected) {
            that.text('Нет связи — повторить');
            return;
          }
          var attempt = ++resetOdomAttempt;
          var completed = false;

          function finishReset(label) {
            if (completed || attempt !== resetOdomAttempt) {
              return;
            }
            completed = true;
            clearTimeout(timeout);
            that.prop('disabled', false).text(label);
          }

          that.prop('disabled', true).text('Сброс...');
          var timeout = setTimeout(function() {
            finishReset('Нет ответа — повторить');
          }, 5000);

          try {
            resetOdomClient.callService(request, function(){
              finishReset('Сбросить одометрию');
            }, function(){
              finishReset('Ошибка — повторить');
            });
          } catch (error) {
            finishReset('Ошибка — повторить');
          }
        });
    });

