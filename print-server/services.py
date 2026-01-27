import os
import logging
import re
import uuid
import platform
import subprocess
from reportlab.lib.units import mm
from reportlab.pdfgen import canvas
from reportlab.graphics.barcode import code128
# DataMatrix in reportlab requires 'reportlab' version >= 3.x
from reportlab.graphics.barcode import createBarcodeDrawing

logger = logging.getLogger(__name__)

# --- NEW SERVICE: Handles Parsing & PDF Creation ---
class NokiaLabelService:
    def __init__(self, output_folder):
        self.output_folder = output_folder

    def parse_nokia_string(self, raw_string):
        """
        Extracts 1P (Part), S (Serial), Q (Qty) from raw string.
        Supports complex strings with Group Separators (ASCII 29).
        """
        GS = chr(29)
        
        # Split by GS if it exists, otherwise use regex
        if GS in raw_string:
            segments = raw_string.split(GS)
            parsed = {'part_no': 'UNKNOWN', 'serial_no': 'UNKNOWN', 'qty': '1', 'raw': raw_string}
            serial_parts = []
            
            for seg in segments:
                if seg.startswith('1P'): parsed['part_no'] = seg[2:]
                elif seg.startswith('Q'): parsed['qty'] = seg[1:]
                elif seg.startswith('S'): 
                    # Start collecting serial parts
                    serial_parts.append(seg[1:])
                elif not any(seg.startswith(x) for x in ['1P', 'Q']):
                    # This is likely a sub-field of the serial number
                    serial_parts.append(seg)
            
            if serial_parts:
                parsed['serial_no'] = GS.join(serial_parts)
            return parsed

        # Fallback to Regex for strings without GS
        part_match = re.search(r'1P(.*?)(?=S|Q|$)', raw_string)
        serial_match = re.search(r'S(.*?)(?=Q|1P|$)', raw_string)
        qty_match = re.search(r'Q(.*?)(?=S|1P|$)', raw_string)

        parsed = {
            'part_no': part_match.group(1) if part_match else 'UNKNOWN',
            'serial_no': serial_match.group(1) if serial_match else 'UNKNOWN',
            'qty': qty_match.group(1) if qty_match else '1',
            'raw': raw_string
        }
        return parsed

    def construct_iso15434_string(self, parsed_data):
        """
        Injects the hidden ASCII control characters.
        [)> {RS} 06 {GS} 1P... {GS} S... {GS} Q... {RS} {EOT}
        Supports internal {GS} markers in the Serial Number field if present.
        """
        RS = chr(30) # Record Separator
        GS = chr(29) # Group Separator
        EOT = chr(4) # End of Transmission

        # Format Header
        formatted = f"[)>{RS}06{GS}"
        
        # Add Data Segments
        formatted += f"1P{parsed_data['part_no']}{GS}"
        
        # Serial No might contain hidden {GS} characters from the scan if we captured them,
        # or we might need to inject them based on Nokia's specific sub-field logic.
        # Looking at user feedback, they want: S...{GS}...{GS}...{GS}...
        # We will preserve any {GS} that are already in the serial_no string (if they were scanned)
        # and ensure the structure matches the requirement.
        
        formatted += f"S{parsed_data['serial_no']}{GS}"
        formatted += f"Q{parsed_data['qty']}"
        
        # Format Footer
        formatted += f"{RS}{EOT}"
        
        return formatted

    def generate_label(self, raw_string, settings=None):
        """
        Orchestrates the creation of the label PDF
        """
        # Default Settings
        default_settings = {
            'labelWidth': 100,
            'labelHeight': 35,
            'barcodeWidthModule': 0.2,
            'barcodeHeight': 5,
            'fontSize': 6,
            'dmSize': 18,
            'verticalSpacing': 9
        }
        
        # Merge provided settings with defaults
        s = {**default_settings, **(settings or {})}
        
        # 1. Parse Data
        data = self.parse_nokia_string(raw_string)
        
        # 2. Create ISO String for DataMatrix
        datamatrix_content = self.construct_iso15434_string(data)

        # 3. Define PDF Filename
        filename = f"label_{uuid.uuid4().hex}.pdf"
        file_path = os.path.join(self.output_folder, filename)

        # 4. Draw PDF using ReportLab
        c = canvas.Canvas(file_path, pagesize=(s['labelWidth']*mm, s['labelHeight']*mm)) 
        
        # --- DRAW TEXT & LOGOS ---
        title_font_size = s['fontSize'] + 2
        c.setFont("Helvetica-Bold", title_font_size)
        c.drawString(2*mm, (s['labelHeight'] - 4)*mm, "NOKIA Solutions and Networks")
        
        c.setFont("Helvetica", s['fontSize'])
        # Position AMID relative to DataMatrix
        dm_x = (s['labelWidth'] - s['dmSize'] - 5)*mm
        c.drawString(dm_x, (s['labelHeight'] - 4)*mm, "AMID") 
        c.drawString((s['labelWidth'] - 20)*mm, 5*mm, "MADE IN INDIA")

        # --- DRAW BARCODES (Left Side) ---
        curr_y = s['labelHeight'] - 9 # Start Y for first barcode label
        
        def draw_barcode_group(label_text, barcode_value, height):
            nonlocal curr_y
            c.setFont("Helvetica", s['fontSize'])
            c.drawString(2*mm, curr_y*mm, label_text)
            
            # Dynamic barWidth calculation to prevent overflow
            # Available width is dm_x - 5mm (margin)
            available_width_mm = (dm_x / mm) - 5
            
            # Create barcode with requested module width
            bc = code128.Code128(barcode_value, barHeight=height*mm, barWidth=s['barcodeWidthModule']*mm)
            
            # Measure barcode width
            bc_width_mm = bc.width / mm
            
            # If it overflows, scale down the barWidth
            if bc_width_mm > available_width_mm:
                scaling_factor = available_width_mm / bc_width_mm
                new_bar_width = s['barcodeWidthModule'] * scaling_factor
                bc = code128.Code128(barcode_value, barHeight=height*mm, barWidth=new_bar_width*mm)
            
            bc.drawOn(c, 2*mm, (curr_y - height - 1)*mm)
            curr_y -= s['verticalSpacing']

        # Barcode 1: Part No
        draw_barcode_group(f"(1P) {data['part_no']}", f"1P{data['part_no']}", s['barcodeHeight'])

        # Barcode 2: Serial No
        draw_barcode_group(f"(S) {data['serial_no']}", f"S{data['serial_no']}", s['barcodeHeight'])

        # Barcode 3: Qty
        draw_barcode_group(f"(Q) {data['qty']}", f"Q{data['qty']}", s['barcodeHeight'] - 1)

        # --- DRAW DATAMATRIX (Right Side) ---
        dm_drawing = createBarcodeDrawing('ECC200DataMatrix', 
                                          value=datamatrix_content, 
                                          width=s['dmSize']*mm, 
                                          height=s['dmSize']*mm)
        # Center vertically-ish or position relative to top
        dm_y = (s['labelHeight'] - s['dmSize'] - 7)*mm
        dm_drawing.drawOn(c, dm_x, dm_y)

        c.save()
        return file_path, data

# --- REUSED SERVICE: Handles Printing ---
class PrintService:
    def get_available_printers(self):
        """Reused Logic from previous project"""
        printers = []
        default_printer = None
        system = platform.system()
        
        try:
            if system == 'Windows':
                import win32print
                printers = [p[2] for p in win32print.EnumPrinters(win32print.PRINTER_ENUM_LOCAL | win32print.PRINTER_ENUM_CONNECTIONS)]
                default_printer = win32print.GetDefaultPrinter()
            else:
                # Mac/Linux Logic
                result = subprocess.run(['lpstat', '-p'], capture_output=True, text=True)
                for line in result.stdout.split('\n'):
                    if line.startswith('printer'):
                        printers.append(line.split()[1])
        except Exception as e:
            logger.error(f"Printer list error: {e}")
            
        return {'printers': printers, 'default': default_printer}

    def print_file(self, file_path, printer_name=None):
        """
        Sends the generated PDF to the printer.
        """
        system = platform.system()
        
        try:
            if system == 'Windows':
                # Reusing your Powershell logic as it's cleaner for PDFs on Windows
                # unless you want to use the win32print GDI method, but Powershell is easier for files
                if not printer_name:
                    import win32print
                    printer_name = win32print.GetDefaultPrinter()

                cmd = [
                    'powershell', 
                    '-Command', 
                    f'Start-Process -FilePath "{file_path}" -Verb PrintTo -ArgumentList "{printer_name}" -PassThru -Wait'
                ]
                subprocess.run(cmd, check=True)
                return True, "Sent to Windows Printer"
            
            else:
                # Mac/Linux LPR
                cmd = ['lpr']
                if printer_name:
                    cmd.extend(['-P', printer_name])
                cmd.append(file_path)
                subprocess.run(cmd, check=True)
                return True, "Sent to Unix Printer"

        except Exception as e:
            return False, str(e)