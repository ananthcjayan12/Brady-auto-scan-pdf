import os
import sys

# Add the current directory to the path so we can import services
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

from services import NokiaLabelService

def test_generation():
    # Setup
    temp_dir = os.path.join(os.path.dirname(__file__), 'temp_labels_test')
    if not os.path.exists(temp_dir):
        os.makedirs(temp_dir)
    
    service = NokiaLabelService(output_folder=temp_dir)
    
    # Test Input (Standard Nokia String)
    raw_input = "[)>RS06GS1P475773A.102GSSUK2545A0510GSQ1RSEOT"
    
    print(f"Generating label for: {raw_input}")
    try:
        pdf_path, data = service.generate_label(raw_input)
        print(f"SUCCESS: Label generated at {pdf_path}")
        print(f"Parsed Data: {data}")
    except Exception as e:
        print(f"FAILED: {e}")

if __name__ == "__main__":
    test_generation()
