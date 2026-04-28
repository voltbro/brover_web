#!/usr/bin/env python3

import rclpy
from rclpy.node import Node

from std_msgs.msg import Int16
import can


# =========================
# CAN CONFIG (can1)
# =========================
can_bus = can.interface.Bus(
    channel='can1',
    interface='socketcan',
    fd=True
)


# =========================
# DEVICE IDS
# =========================
DEV_CAMERA = 0x01
DEV_IRRIGATION = 0x02
DEV_PUMP = 0x03

# =========================
# COMMANDS
# =========================
CMD_TILT = 0x01
CMD_PAN = 0x02
CMD_STATE = 0x03


def send_can(device, command, value):
    """Pack and send CAN FD frame"""
    data = bytearray([
        device,
        command,
        value & 0xFF,
        0x00
    ])

    msg = can.Message(
        arbitration_id=0x100,   # фиксированный ID как у тебя в Arduino
        data=data,
        is_extended_id=True,
        is_fd=True
    )

    try:
        can_bus.send(msg)
    except can.CanError as e:
        print("CAN send error:", e)


# =========================
# NODE
# =========================
class WebCanBridge(Node):

    def __init__(self):
        super().__init__('web_can_bridge')

        # -------- CAMERA --------
        self.create_subscription(Int16, '/camera/tilt', self.camera_tilt_cb, 10)
        self.create_subscription(Int16, '/camera/pan', self.camera_pan_cb, 10)

        # -------- IRRIGATION --------
        self.create_subscription(Int16, '/irrigation/nozzle/tilt', self.irrigation_tilt_cb, 10)
        self.create_subscription(Int16, '/irrigation/nozzle/pan', self.irrigation_pan_cb, 10)
        self.create_subscription(Int16, '/irrigation/pump', self.pump_cb, 10)

    # =========================
    # CAMERA
    # =========================
    def camera_tilt_cb(self, msg):
        send_can(DEV_CAMERA, CMD_TILT, msg.data)

    def camera_pan_cb(self, msg):
        send_can(DEV_CAMERA, CMD_PAN, msg.data)

    # =========================
    # IRRIGATION
    # =========================
    def irrigation_tilt_cb(self, msg):
        send_can(DEV_IRRIGATION, CMD_TILT, msg.data)

    def irrigation_pan_cb(self, msg):
        send_can(DEV_IRRIGATION, CMD_PAN, msg.data)

    def pump_cb(self, msg):
        send_can(DEV_PUMP, CMD_STATE, msg.data)


# =========================
# MAIN
# =========================
def main(args=None):
    rclpy.init(args=args)
    node = WebCanBridge()

    print("ROS2 → CAN bridge started on can1")

    rclpy.spin(node)

    node.destroy_node()
    rclpy.shutdown()


if __name__ == '__main__':
    main()