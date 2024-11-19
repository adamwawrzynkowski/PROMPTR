import sys
import torch
from safetensors import safe_open
import os

def convert_to_onnx(safetensors_path, onnx_path):
    # Wczytaj model safetensors
    with safe_open(safetensors_path, framework="pt") as f:
        state_dict = {k: f.get_tensor(k) for k in f.keys()}
    
    # Utwórz model PyTorch
    model = torch.nn.Sequential(
        torch.nn.Conv2d(3, 64, 3, padding=1),
        torch.nn.ReLU(),
        torch.nn.MaxPool2d(2),
        torch.nn.Flatten(),
        torch.nn.Linear(64 * 112 * 112, 1000)
    )
    
    # Załaduj wagi
    model.load_state_dict(state_dict)
    model.eval()
    
    # Przygotuj przykładowe wejście
    dummy_input = torch.randn(1, 3, 224, 224)
    
    # Eksportuj do ONNX
    torch.onnx.export(
        model,
        dummy_input,
        onnx_path,
        export_params=True,
        opset_version=11,
        do_constant_folding=True,
        input_names=['input'],
        output_names=['output'],
        dynamic_axes={
            'input': {0: 'batch_size'},
            'output': {0: 'batch_size'}
        }
    )

if __name__ == "__main__":
    if len(sys.argv) != 3:
        print("Usage: python convert_to_onnx.py <safetensors_path> <onnx_path>")
        sys.exit(1)
    
    safetensors_path = sys.argv[1]
    onnx_path = sys.argv[2]
    convert_to_onnx(safetensors_path, onnx_path) 