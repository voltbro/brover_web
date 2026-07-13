import rclpy
import os, signal, time
import re
import subprocess
import threading
from rclpy.node import Node
from flask import Flask, send_from_directory, send_file, request, jsonify, render_template
from ament_index_python.packages import get_package_share_directory
from werkzeug.serving import make_server
import socket

ROS_DOMAIN_ID :int = int(os.environ.get('ROS_DOMAIN_ID',0))

package_name = 'brover_web'
share_dir = get_package_share_directory(package_name)
www_path = os.path.join(share_dir, 'resource', 'web')

app = Flask(__name__, 
            static_folder=os.path.join(www_path, 'static'), 
            template_folder=www_path)

WIFI_CACHE_TTL = 4.0
CAMERA_CACHE_TTL = 5.0
CAMERA_DISCOVERY_DELAY = 1.0
_wifi_cache_lock = threading.Lock()
_wifi_cache_time = 0.0
_wifi_cache_data = None
_camera_cache_lock = threading.Lock()
_camera_cache_time = 0.0
_camera_cache_topics = []
_camera_node = None
_http_server = None
_shutdown_started = threading.Event()

def shutdown_server():
  server = _http_server
  if server is None:
    return False

  if not _shutdown_started.is_set():
    _shutdown_started.set()
    threading.Thread(target=server.shutdown, name="brover-web-shutdown", daemon=True).start()
  return True

def signal_handler(sig, frame):
  print('Received signal %s' % sig)
  shutdown_server()

def get_video_topics():
  global _camera_cache_time, _camera_cache_topics

  now = time.monotonic()
  with _camera_cache_lock:
    if now - _camera_cache_time < CAMERA_CACHE_TTL:
      return list(_camera_cache_topics)

    if _camera_node is None:
      return list(_camera_cache_topics)

    try:
      topics = [
        topic_name
        for topic_name, topic_types in _camera_node.get_topic_names_and_types()
        if 'sensor_msgs/msg/Image' in topic_types
      ]
    except Exception as error:
      print('Unable to read camera topics: %s' % error)
      return list(_camera_cache_topics)

    _camera_cache_topics = sorted(topics)
    _camera_cache_time = time.monotonic()
    return list(_camera_cache_topics)

def run_command(command):
  try:
    return subprocess.check_output(command, text=True, stderr=subprocess.DEVNULL, timeout=1.0).strip()
  except (subprocess.SubprocessError, FileNotFoundError):
    return ""

def get_wifi_interface():
  iw_output = run_command(["iw", "dev"])
  match = re.search(r"Interface\s+(\S+)", iw_output)
  if match:
    return match.group(1)
  iwconfig_output = run_command(["iwconfig"])
  match = re.search(r"^(\S+)\s+IEEE 802\.11", iwconfig_output, re.MULTILINE)
  return match.group(1) if match else "wlan0"

def signal_to_percent(signal_dbm):
  if signal_dbm is None:
    return None
  return max(0, min(100, int(round((signal_dbm + 90) * 2.5))))

def signal_quality(signal_percent):
  if signal_percent is None:
    return "нет данных"
  if signal_percent >= 75:
    return "отлично"
  if signal_percent >= 50:
    return "хорошо"
  if signal_percent >= 30:
    return "слабо"
  return "плохо"

def get_wifi_status():
  interface = get_wifi_interface()
  link_output = run_command(["iw", "dev", interface, "link"])
  station_output = run_command(["iw", "dev", interface, "station", "dump"])
  iwconfig_output = run_command(["iwconfig", interface])
  ip_output = run_command(["ip", "-4", "-o", "addr", "show", "dev", interface])
  hostapd_state = run_command(["systemctl", "is-active", "hostapd-wifi-fallback.service"])

  ip_match = re.search(r"inet\s+(\d+\.\d+\.\d+\.\d+)", ip_output)
  ssid_match = re.search(r"SSID:\s*(.+)", link_output) or re.search(r'ESSID:"([^"]*)"', iwconfig_output)
  signal_match = re.search(r"signal:\s*(-?\d+)", link_output) or re.search(r"signal:\s*(-?\d+)", station_output) or re.search(r"Signal level=(-?\d+)", iwconfig_output)
  quality_match = re.search(r"Link Quality=(\d+)/(\d+)", iwconfig_output)
  bitrate_match = re.search(r"tx bitrate:\s*(.+)", link_output) or re.search(r"tx bitrate:\s*(.+)", station_output) or re.search(r"Bit Rate[=:]([^\n]+?)(?:\s{2,}|$)", iwconfig_output)
  freq_match = re.search(r"freq:\s*(\d+)", link_output) or re.search(r"Frequency:([0-9.]+\s*GHz)", iwconfig_output)
  clients = len(re.findall(r"^Station\s+", station_output, re.MULTILINE))

  signal_dbm = int(signal_match.group(1)) if signal_match else None
  if quality_match:
    signal_percent = int(round(int(quality_match.group(1)) / int(quality_match.group(2)) * 100))
  else:
    signal_percent = signal_to_percent(signal_dbm)
  mode = "ap" if hostapd_state == "active" else "client"

  return {
    "interface": interface,
    "mode": mode,
    "mode_label": "Точка доступа" if mode == "ap" else "Клиент Wi-Fi",
    "ssid": socket.gethostname() if mode == "ap" else (ssid_match.group(1).strip() if ssid_match else "--"),
    "ip": ip_match.group(1) if ip_match else "--",
    "signal_dbm": signal_dbm,
    "signal_percent": signal_percent,
    "signal_label": signal_quality(signal_percent),
    "bitrate": bitrate_match.group(1).strip() if bitrate_match else "--",
    "frequency": freq_match.group(1) if freq_match else "--",
    "clients": clients,
  }

def get_cached_wifi_status():
  global _wifi_cache_time, _wifi_cache_data

  now = time.monotonic()
  with _wifi_cache_lock:
    if _wifi_cache_data is not None and now - _wifi_cache_time < WIFI_CACHE_TTL:
      return dict(_wifi_cache_data)

    data = get_wifi_status()
    _wifi_cache_data = dict(data)
    _wifi_cache_time = time.monotonic()
    return dict(_wifi_cache_data)

@app.route("/")
def serve_index():
  ip_address = request.host.split(':')[0]
  robot_name = socket.gethostname()
  return render_template('index.html', 
                        ros_host = ip_address,
                        ros_robot = robot_name,
                        video_topics = get_video_topics())
#   return "Hello World1!"

@app.route('/shutdown', methods=['POST'])
def shutdown():
  if not shutdown_server():
    return 'Server is not running', 503
  return 'Server shutting down...'

@app.route('/wifi_status')
def wifi_status():
    return jsonify(get_cached_wifi_status())

def main():
  global _camera_node, _http_server

  rclpy.init(domain_id=ROS_DOMAIN_ID)
  try:
    _camera_node = Node("brover_web_camera_discovery")
    time.sleep(CAMERA_DISCOVERY_DELAY)
    _shutdown_started.clear()
    _http_server = make_server("0.0.0.0", 8080, app, threaded=True)
    signal.signal(signal.SIGTERM, signal_handler)
    _http_server.serve_forever()
  finally:
    if _http_server is not None:
      _http_server.server_close()
      _http_server = None
    if _camera_node is not None:
      _camera_node.destroy_node()
      _camera_node = None
    if rclpy.ok():
      rclpy.shutdown()

if __name__ == "__main__":
  main()
