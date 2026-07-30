#!/usr/bin/env python3

"""Bridge ROS 2 equipment commands to the ServoBoard over CAN1."""

import can

import rclpy
from rclpy.executors import ExternalShutdownException
from rclpy.node import Node

from std_msgs.msg import Int16


CAN_CHANNEL = 'can1'
CAN_CONTROL_ID = 0x100

DEV_CAMERA = 0x01
DEV_GRIPPER = 0x02

CMD_TILT = 0x01
CMD_PAN = 0x02
CMD_STATE = 0x03

GRIPPER_STOP = 0
GRIPPER_UP = 1
GRIPPER_DOWN = 2


class TransportCanBridge(Node):
    """Forward camera and gripper commands to the ServoBoard."""

    def __init__(self):
        """Create ROS subscriptions and open the CAN1 interface."""
        super().__init__('transport_can_bridge')

        self.can_bus = can.interface.Bus(
            channel=CAN_CHANNEL,
            interface='socketcan',
            fd=True,
        )

        self.create_subscription(
            Int16, '/camera/tilt', self.camera_tilt_cb, 10)
        self.create_subscription(
            Int16, '/camera/pan', self.camera_pan_cb, 10)
        self.create_subscription(
            Int16, '/gripper/lift', self.gripper_lift_cb, 10)

        self.get_logger().info(
            'Transport CAN bridge started on can1')

    def send_can(self, device, command, value):
        """Send one four-byte CAN FD control frame."""
        message = can.Message(
            arbitration_id=CAN_CONTROL_ID,
            data=[device, command, value, 0x00],
            is_extended_id=True,
            is_fd=True,
        )

        try:
            self.can_bus.send(message)
        except can.CanError as error:
            self.get_logger().error(f'CAN send error: {error}')

    def send_camera_angle(self, command, angle, axis_name):
        """Validate and send a camera angle."""
        if not 0 <= angle <= 180:
            self.get_logger().warning(
                f'Ignored {axis_name} angle outside 0..180: {angle}')
            return

        self.send_can(DEV_CAMERA, command, angle)

    def camera_tilt_cb(self, message):
        """Handle camera tilt commands."""
        self.send_camera_angle(CMD_TILT, message.data, 'camera tilt')

    def camera_pan_cb(self, message):
        """Handle camera pan commands."""
        self.send_camera_angle(CMD_PAN, message.data, 'camera pan')

    def gripper_lift_cb(self, message):
        """Handle gripper lift commands."""
        if message.data not in (
                GRIPPER_STOP, GRIPPER_UP, GRIPPER_DOWN):
            self.get_logger().warning(
                f'Ignored unknown gripper command: {message.data}')
            return

        self.send_can(DEV_GRIPPER, CMD_STATE, message.data)

    def stop_gripper(self):
        """Request a stopped lift before closing the CAN interface."""
        self.send_can(DEV_GRIPPER, CMD_STATE, GRIPPER_STOP)

    def close(self):
        """Stop equipment and release the CAN interface."""
        self.stop_gripper()
        self.can_bus.shutdown()


def main(args=None):
    """Run the ROS 2 to CAN bridge."""
    rclpy.init(args=args)
    node = None

    try:
        node = TransportCanBridge()
        rclpy.spin(node)
    except (KeyboardInterrupt, ExternalShutdownException):
        pass
    finally:
        if node is not None:
            node.close()
            node.destroy_node()
        if rclpy.ok():
            rclpy.shutdown()


if __name__ == '__main__':
    main()
