# brover_web

```bash
sudo rm -r /etc/apt/sources.list.d/ros2.list
```

```bash
export ROS_APT_SOURCE_VERSION=$(curl -s https://api.github.com/repos/ros-infrastructure/ros-apt-source/releases/latest | grep -F "tag_name" | awk -F\" '{print $4}')
curl -L -o /tmp/ros2-apt-source.deb "https://github.com/ros-infrastructure/ros-apt-source/releases/download/${ROS_APT_SOURCE_VERSION}/ros2-apt-source_${ROS_APT_SOURCE_VERSION}.$(. /etc/os-release && echo ${UBUNTU_CODENAME:-${VERSION_CODENAME}})_all.deb"
sudo dpkg -i /tmp/ros2-apt-source.deb
```

```bash
sudo apt update

sudo apt install ros-jazzy-usb-cam python3-flask ros-jazzy-web-video-server ros-jazzy-rosbridge-server -y
```

```bash
cd ~/ros2_ws/src
git clone https://github.com/NikolayIvanovWS/brover_web.git
cd ~/ros2_ws
colcon build --packages-select=brover_web
```

```bash
# 1й терминал - запускаем usb_cam
ros2 run usb_cam usb_cam_node_exe
# 2й терминал - запускаем turtlebro_web
ros2 launch brover_web web_server.xml
```
