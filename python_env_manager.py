import os
import sys
import venv
import subprocess
import platform

def get_app_data_path():
    """Get the application data path"""
    if platform.system() == 'Darwin':  # macOS
        return os.path.expanduser('~/Library/Application Support/prompt-enhancer/PROMPTR')
    elif platform.system() == 'Windows':
        return os.path.join(os.getenv('APPDATA'), 'prompt-enhancer', 'PROMPTR')
    else:  # Linux
        return os.path.expanduser('~/.config/prompt-enhancer/PROMPTR')

def get_venv_path():
    """Get the virtual environment path"""
    base_path = get_app_data_path()
    return os.path.join(base_path, 'venv')

def ensure_directories():
    """Ensure all required directories exist"""
    venv_path = get_venv_path()
    os.makedirs(os.path.dirname(venv_path), exist_ok=True)
    return venv_path

def create_venv():
    """Create virtual environment if it doesn't exist"""
    venv_path = ensure_directories()
    if not os.path.exists(venv_path):
        print(f"Creating virtual environment at {venv_path}...")
        try:
            venv.create(venv_path, with_pip=True)
            # Upewnij się, że pip jest zainstalowany i zaktualizowany
            pip_upgrade_cmd = [get_venv_python(), '-m', 'pip', 'install', '--upgrade', 'pip']
            subprocess.check_call(pip_upgrade_cmd)
            return True
        except Exception as e:
            print(f"Error creating virtual environment: {str(e)}")
            return False
    return True

def get_venv_python():
    """Get path to Python executable in virtual environment"""
    venv_path = get_venv_path()
    if platform.system() == 'Windows':
        return os.path.join(venv_path, 'Scripts', 'python.exe')
    else:
        return os.path.join(venv_path, 'bin', 'python')

def get_venv_pip():
    """Get path to pip executable in virtual environment"""
    venv_path = get_venv_path()
    if platform.system() == 'Windows':
        return os.path.join(venv_path, 'Scripts', 'pip.exe')
    else:
        return os.path.join(venv_path, 'bin', 'pip')

def install_requirements():
    """Install required packages in virtual environment"""
    pip_path = get_venv_pip()
    requirements = [
        'torch',
        'transformers',
        'onnx',
        'onnxruntime',
        'numpy',
        'safetensors'
    ]
    
    try:
        for package in requirements:
            print(f"Installing {package}...")
            subprocess.check_call([get_venv_python(), '-m', 'pip', 'install', package])
        return True
    except subprocess.CalledProcessError as e:
        print(f"Error installing packages: {str(e)}")
        return False

def setup_environment():
    """Setup complete Python environment"""
    try:
        print("Setting up Python environment...")
        
        # Create virtual environment
        if not create_venv():
            raise Exception("Failed to create virtual environment")
        
        # Install requirements
        if not install_requirements():
            raise Exception("Failed to install requirements")
        
        print("Python environment setup completed successfully")
        return True
    except Exception as e:
        print(f"Error setting up environment: {str(e)}")
        return False

if __name__ == '__main__':
    success = setup_environment()
    if not success:
        sys.exit(1) 