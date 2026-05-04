import rclpy
import os, signal, time
from rclpy.node import Node
from flask import Flask, send_from_directory, send_file, request, jsonify, render_template
from ament_index_python.packages import get_package_share_directory

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


@app.route("/")
def serve_index():
  ip_address = request.host.split(':')[0]
  return render_template('index.html', 
                        ros_host = ip_address,
                        ros_robot = robot_name,
                        video_topics = get_video_topics())
#   return "Hello World1!"

@app.route('/shutdown', methods=['POST'])
def shutdown():
    shutdown_server()
    return 'Server shutting down...'

def main():
  app.run(host="0.0.0.0", port=8080, threaded=True, debug=False)

if __name__ == "__main__":
  main()
