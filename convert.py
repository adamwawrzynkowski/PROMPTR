import os
import sys
import warnings
import shutil
from python_env_manager import get_venv_python, setup_environment

def cleanup_model_files(model_path):
    """Clean up downloaded model files if conversion fails"""
    try:
        if os.path.exists(model_path):
            shutil.rmtree(model_path)
        print(f"Cleaned up model files at {model_path}")
    except Exception as e:
        print(f"Error cleaning up model files: {str(e)}")

def convert_model(model_path, output_path):
    try:
        # Upewnij się, że środowisko jest skonfigurowane
        if not setup_environment():
            raise Exception("Failed to setup Python environment")

        # Importuj wymagane biblioteki
        import torch
        from transformers import AutoModel, AutoTokenizer, AutoConfig
        import onnx
        
        # Wyłącz wszystkie ostrzeżenia związane z trace
        warnings.filterwarnings('ignore', category=torch.jit.TracerWarning)
        warnings.filterwarnings('ignore', category=UserWarning)
        
        print("Loading model configuration...")
        config = AutoConfig.from_pretrained(model_path, trust_remote_code=True)
        
        print("Loading model...")
        # Użyj eval() aby wyłączyć dropout i inne warstwy treningowe
        model = AutoModel.from_pretrained(
            model_path,
            config=config,
            trust_remote_code=True
        ).eval()
        
        print("Loading tokenizer...")
        tokenizer = AutoTokenizer.from_pretrained(
            model_path,
            trust_remote_code=True
        )
        
        # Przygotuj przykładowe dane wejściowe
        print("Preparing input...")
        sample_text = "This is a test input for model conversion"
        max_length = getattr(config, 'max_position_embeddings', 512)
        
        # Tokenizacja z paddingiem
        encoded = tokenizer(
            sample_text,
            padding='max_length',
            max_length=max_length,
            truncation=True,
            return_tensors='pt'
        )
        
        # Przygotuj wszystkie możliwe wejścia
        input_names = []
        dynamic_axes = {}
        inputs_for_export = []
        
        for key, tensor in encoded.items():
            input_names.append(key)
            inputs_for_export.append(tensor)
            dynamic_axes[key] = {0: 'batch_size', 1: 'sequence'}
        
        # Dodaj dynamic axes dla wyjścia
        dynamic_axes['last_hidden_state'] = {0: 'batch_size', 1: 'sequence'}
        
        print("Converting to ONNX...")
        with torch.no_grad():
            # Export do ONNX
            torch.onnx.export(
                model,
                tuple(inputs_for_export),
                output_path,
                input_names=input_names,
                output_names=['last_hidden_state'],
                dynamic_axes=dynamic_axes,
                do_constant_folding=True,
                opset_version=12,
                verbose=False
            )
        
        print("Verifying ONNX model...")
        # Sprawdź model ONNX
        onnx_model = onnx.load(output_path)
        onnx.checker.check_model(onnx_model)
        
        print("Conversion completed successfully!")
        return True
        
    except Exception as e:
        print(f"Error during conversion: {str(e)}")
        cleanup_model_files(model_path)
        return False

if __name__ == '__main__':
    if len(sys.argv) != 3:
        print("Usage: convert.py <model_path> <output_path>")
        sys.exit(1)
        
    model_path = sys.argv[1]
    output_path = sys.argv[2]
    
    print(f"Starting conversion from {model_path} to {output_path}")
    success = convert_model(model_path, output_path)
    
    if not success:
        print("Conversion failed!")
        sys.exit(1)
    else:
        print("Conversion completed successfully!") 