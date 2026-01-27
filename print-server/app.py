import os
import logging
import uuid
from flask import Flask, request, jsonify, send_file
from flask_cors import CORS

# Import the new service logic
from services import NokiaLabelService, PrintService

# Setup logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

app = Flask(__name__)
CORS(app, resources={r"/*": {"origins": "*"}})

# Configuration
TEMP_FOLDER = os.path.join(os.path.dirname(__file__), 'temp_labels')
os.makedirs(TEMP_FOLDER, exist_ok=True)

# Initialize Services
label_service = NokiaLabelService(output_folder=TEMP_FOLDER)
print_service = PrintService()

@app.route('/health', methods=['GET'])
def health_check():
    return jsonify({'status': 'ok', 'message': 'Nokia Label Bridge is running'})

@app.route('/api/printers', methods=['GET'])
def list_printers():
    """reuse existing printer discovery logic"""
    return jsonify(print_service.get_available_printers())

@app.route('/api/generate-label', methods=['POST'])
def generate_label():
    """
    Generates a label PDF and returns its path and parsed data.
    """
    data = request.json
    raw_input = data.get('raw_input', '')
    settings = data.get('label_settings')
    
    if not raw_input:
        return jsonify({'success': False, 'error': 'No input data provided'}), 400

    try:
        pdf_path, parsed_data = label_service.generate_label(raw_input, settings)
        filename = os.path.basename(pdf_path)
        
        return jsonify({
            'success': True, 
            'message': 'Label generated',
            'parsed_data': parsed_data,
            'pdf_url': f"/api/label/{filename}"
        })

    except Exception as e:
        logger.error(f"Generation error: {e}")
        return jsonify({'success': False, 'error': str(e)}), 500

@app.route('/api/label/<filename>', methods=['GET'])
def get_label(filename):
    """
    Serves a generated PDF file.
    """
    file_path = os.path.join(TEMP_FOLDER, filename)
    if not os.path.exists(file_path):
        return jsonify({'success': False, 'error': 'Label not found'}), 404
    
    return send_file(file_path, mimetype='application/pdf')

@app.route('/api/print-label', methods=['POST'])
def print_label():
    """
    Prints a previously generated label.
    """
    data = request.json
    pdf_url = data.get('pdf_url', '')
    printer_name = data.get('printer_name')

    if not pdf_url:
        return jsonify({'success': False, 'error': 'No PDF URL provided'}), 400

    try:
        filename = pdf_url.split('/')[-1]
        pdf_path = os.path.join(TEMP_FOLDER, filename)
        
        if not os.path.exists(pdf_path):
            return jsonify({'success': False, 'error': 'Label file not found on server'}), 404

        success, message = print_service.print_file(pdf_path, printer_name)

        if success:
            return jsonify({'success': True, 'message': 'Label sent to printer'})
        else:
            return jsonify({'success': False, 'error': f"Printing failed: {message}"}), 500

    except Exception as e:
        logger.error(f"Print error: {e}")
        return jsonify({'success': False, 'error': str(e)}), 500

@app.route('/api/generate-and-print', methods=['POST'])
def generate_and_print():
    """
    1. Receives raw scanner string.
    2. Parses & formats it.
    3. Generates PDF.
    4. Prints automatically.
    """
    data = request.json
    raw_input = data.get('raw_input', '')
    printer_name = data.get('printer_name') # Optional
    settings = data.get('label_settings')
    
    if not raw_input:
        return jsonify({'success': False, 'error': 'No input data provided'}), 400

    try:
        # Step 1: Generate the PDF Label
        pdf_path, parsed_data = label_service.generate_label(raw_input, settings)
        filename = os.path.basename(pdf_path)

        # Step 2: Print the Label
        success, message = print_service.print_file(pdf_path, printer_name)

        if success:
            return jsonify({
                'success': True, 
                'message': 'Label generated and printed',
                'parsed_data': parsed_data,
                'pdf_url': f"/api/label/{filename}"
            })
        else:
            return jsonify({'success': False, 'error': f"Printing failed: {message}"}), 500

    except Exception as e:
        logger.error(f"Workflow error: {e}")
        return jsonify({'success': False, 'error': str(e)}), 500

if __name__ == '__main__':
    app.run(host='0.0.0.0', port=5001, debug=True)
