from setuptools import find_packages, setup
from glob import glob
import os

package_name = 'brover_web'

WEB_RESOURCE_DEST = os.path.join('resource', 'web')

setup(
    name=package_name,
    version='0.0.0',
    packages=find_packages(exclude=['test']),
    data_files=[
        ('share/' + package_name, ['package.xml']),
        ('share/' + package_name + '/launch', glob('launch/*.xml')),
        
        ('share/ament_index/resource_index/packages',
            ['resource/' + package_name]),

        (os.path.join('share', package_name, WEB_RESOURCE_DEST), 
            glob('resource/web/*.*')), # Копирует index.html
            
        (os.path.join('share', package_name, WEB_RESOURCE_DEST, 'static', 'css'), 
            glob('resource/web/static/css/*.css')),
            
        (os.path.join('share', package_name, WEB_RESOURCE_DEST, 'static', 'css', 'bootstrap'), 
            glob('resource/web/static/css/bootstrap/*')),
            
        (os.path.join('share', package_name, WEB_RESOURCE_DEST, 'static', 'css', 'images'), 
            glob('resource/web/static/css/images/*')),
            
        (os.path.join('share', package_name, WEB_RESOURCE_DEST, 'static', 'js'), 
            glob('resource/web/static/js/*.js')),

        (os.path.join('share', package_name, WEB_RESOURCE_DEST, 'static', 'js', 'bootstrap'), 
            glob('resource/web/static/js/bootstrap/*')),
    ],
    install_requires=['setuptools', 'flask'],
    include_package_data=True,
    zip_safe=False,
    maintainer='pi',
    maintainer_email='cola@cactus.ru',
    description='Web server for brover platform',
    license='TODO: License declaration',
    extras_require={
        'test': ['pytest'],
    },
    entry_points={
        'console_scripts': [
            'web_server = brover_web.web_server:main',
            'irrigation_control = brover_web.irrigation_control:main',
        ],
    },
)
