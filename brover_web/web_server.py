import rclpy
import os, signal, time
import re
import subprocess
from rclpy.node import Node
from flask import Flask, send_from_directory, send_file, request, jsonify, render_template
from ament_index_python.packages import get_package_share_directory
import socket

ROS_DOMAIN_ID :int = int(os.environ.get('ROS_DOMAIN_ID',0))
rclpy.init(domain_id = ROS_DOMAIN_ID)

package_name = 'brover_web'
share_dir = get_package_share_directory(package_name)
www_path = os.path.join(share_dir, 'resource', 'web')

app = Flask(__name__, 
            static_folder=os.path.join(www_path, 'static'), 
            template_folder=www_path)

def shutdown_server():
    func = request.environ.get('werkzeug.server.shutdown')
    if func is None:
        raise RuntimeError('Not running with the Werkzeug Server')
    func()

def signal_handler(sig, frame):
    print('Received signal %s' % sig)
    shutdown_server()

signal.signal(signal.SIGTERM, signal_handler)

def get_video_topics():
    
    topics = []
    ros_web_node = Node("ros_web_node")
    time.sleep(1.0)

    for topic in ros_web_node.get_topic_names_and_types():
        if topic[1] == ['sensor_msgs/msg/Image']:
            # topics.append(topic[0].replace('/compressed',''))
            topics.append(topic[0])

    ros_web_node.destroy_node()
    return topics        

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
    shutdown_server()
    return 'Server shutting down...'

@app.route('/wifi_status')
def wifi_status():
    return jsonify(get_wifi_status())

def main():
  app.run(host="0.0.0.0", port=8080, threaded=True, debug=False)

if __name__ == "__main__":
  main()
