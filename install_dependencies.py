import subprocess
import sys
import pkg_resources
import os

def check_dependencies():
    required_packages = {
        'onnx': 'latest',
        'onnxruntime': 'latest',
        'torch': 'latest',
        'transformers': 'latest'
    }
    
    missing_packages = []
    installed_packages = {pkg.key: pkg.version for pkg in pkg_resources.working_set}
    
    for package in required_packages:
        if package not in installed_packages:
            missing_packages.append(package)
    
    return missing_packages

def install_dependencies():
    missing_packages = check_dependencies()
    
    if not missing_packages:
        print("All dependencies are already installed.")
        return True
    
    print(f"Installing missing dependencies: {', '.join(missing_packages)}")
    try:
        for package in missing_packages:
            subprocess.check_call([sys.executable, '-m', 'pip', 'install', package])
        return True
    except subprocess.CalledProcessError as e:
        print(f"Error installing dependencies: {str(e)}")
        return False

if __name__ == '__main__':
    success = install_dependencies()
    if not success:
        sys.exit(1) 