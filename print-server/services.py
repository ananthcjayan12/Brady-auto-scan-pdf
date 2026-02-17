import os
import logging
import re
import uuid
import platform
import subprocess
import sys
from io import BytesIO
from reportlab.lib.units import mm
from reportlab.pdfgen import canvas
from reportlab.graphics.barcode import code128
# DataMatrix in reportlab requires 'reportlab' version >= 3.x
from reportlab.graphics.barcode import createBarcodeDrawing
from svglib.svglib import svg2rlg
from reportlab.graphics import renderPDF


logger = logging.getLogger(__name__)

# --- NEW SERVICE: Handles Parsing & PDF Creation ---
class NokiaLabelService:
    def __init__(self, output_folder):
        self.output_folder = output_folder
        logger.info("--- NokiaLabelService Initialized (Direct Printing Version v2.4) ---")

    def _split_additional_segments(self, text):
        """
        Splits concatenated post-quantity payload into known application segments.
        Example: 4LIN18VLENOK -> [4LIN, 18VLENOK]
        """
        payload = (text or '').strip()
        if not payload:
            return []

        pattern = r'(4L|18V|10D)'
        matches = list(re.finditer(pattern, payload))

        if not matches:
            return [payload]

        segments = []

        if matches[0].start() > 0:
            leading = payload[:matches[0].start()].strip()
            if leading:
                segments.append(leading)

        for i, match in enumerate(matches):
            start = match.start()
            end = matches[i + 1].start() if i + 1 < len(matches) else len(payload)
            segment = payload[start:end].strip()
            if segment:
                segments.append(segment)

        return segments

    def _extract_named_segments(self, text, prefixes, stop_tokens):
        """
        Extracts prefixed segments from a concatenated payload.
        Returns segments ordered by the `prefixes` argument.
        """
        payload = (text or '').strip()
        if not payload:
            return []

        prefix_pattern = '|'.join(re.escape(prefix) for prefix in prefixes)
        stop_pattern = '|'.join(re.escape(token) for token in stop_tokens)
        pattern = rf'({prefix_pattern})(.*?)(?={stop_pattern}|$)'

        found = {}
        for match in re.finditer(pattern, payload):
            prefix = match.group(1)
            value = match.group(2).strip()
            segment = f"{prefix}{value}"
            if prefix not in found and len(segment) > len(prefix):
                found[prefix] = segment

        return [found[prefix] for prefix in prefixes if prefix in found]

    def parse_nokia_string(self, raw_string):
        """
        Advanced parser for Nokia strings. 
        Detects if the scan already has ISO-15434 formatting or if it's raw.
        """
        GS = chr(29)
        RS = chr(30)
        EOT = chr(4)
        
        # Clean potential whitespace
        clean_string = raw_string.strip()
        
        # Handle ISO-15434 wrapping [)>RS06GS...RSEOT
        if clean_string.startswith("[)>"):
            try:
                # Find the first GS to get to the payload
                if GS in clean_string:
                    clean_string = clean_string.split(GS, 1)[1]
                # Remove footer
                if RS in clean_string:
                    clean_string = clean_string.split(RS, 1)[0]
                elif EOT in clean_string:
                    clean_string = clean_string.split(EOT, 1)[0]
            except:
                pass

        # Now we have a payload that contains GS or other delimiter
        # Sometimes scanners replace GS with other characters like |, ~, or just omit it
        # If we see common delimiters, use them
        delimiters = [GS, '|', '~', '']
        main_delimiter = None
        for d in delimiters:
            if d in clean_string:
                main_delimiter = d
                break

        if not main_delimiter:
            # Simple heuristic: look for 1P, S, Q
            parsed = {
                'part_no': 'UNKNOWN', 
                'serial_no': 'UNKNOWN', 
                'qty': '1', 
                'raw': raw_string,
                'serial_segments': [],
                'post_qty_segments': []
            }
            
            # Clean header if it stuck around
            if clean_string.startswith("[)>06"):
                clean_string = clean_string[5:]
            elif clean_string.startswith("06"):
                clean_string = clean_string[2:]
            
            # Split by common prefixes to isolate fields
            # We look for 1P, S, Q, 18V, 4L, 10D as delimiters
            # Example: 061P475773A.102SUK2545A0510Q1
            
            # 1. Extract Part Number (Starts with 1P, ends before S, Q, or other field)
            p_match = re.search(r'1P(.*?)(?=S|Q|18V|4L|10D|$)', clean_string)
            if p_match: parsed['part_no'] = p_match.group(1).strip()
            
            # 2. Extract Serial Number (Starts with S, ends before Q, 1P, or other field)
            s_match = re.search(r'S(.*?)(?=Q|1P|18V|4L|10D|$)', clean_string)
            if s_match: 
                val = s_match.group(1).strip()
                parsed['serial_no'] = val
                parsed['serial_segments'] = [val]
                
            # 3. Extract Quantity + post-Q segments (e.g. Q14LIN18VLENOK)
            q_match = re.search(r'Q(\d+)(.*)$', clean_string)
            if q_match:
                digits = q_match.group(1)
                suffix = q_match.group(2).strip()

                if suffix and digits:
                    # Nokia payloads can concatenate: Q1 + 4LIN + 18V...
                    parsed['qty'] = digits[0]
                    remainder = f"{digits[1:]}{suffix}".strip()
                    if remainder:
                        parsed['post_qty_segments'] = self._split_additional_segments(remainder)
                else:
                    parsed['qty'] = digits

            # 4L/18V can appear before or after Q in raw concatenated scans.
            # Normalize these segments for QR output in expected order: 4L then 18V.
            normalized_segments = self._extract_named_segments(
                clean_string,
                prefixes=['4L', '18V'],
                stop_tokens=['4L', '18V', '10D', 'Q', '1P', 'S']
            )
            if normalized_segments:
                parsed['post_qty_segments'] = normalized_segments
            
            return parsed

        segments = clean_string.split(main_delimiter)
        parsed = {
            'part_no': 'UNKNOWN', 
            'serial_no': 'UNKNOWN', 
            'qty': '1', 
            'raw': raw_string,
            'serial_segments': [],
            'post_qty_segments': []
        }
        
        for seg in segments:
            seg = seg.strip()
            if not seg: continue
            
            if seg.startswith('1P'):
                parsed['part_no'] = seg[2:]
            elif seg.startswith('Q'):
                q_payload = seg[1:].strip()
                if re.fullmatch(r'\d+', q_payload):
                    parsed['qty'] = q_payload
                else:
                    m = re.match(r'^(\d+)(.*)$', q_payload)
                    if m:
                        digits, suffix = m.groups()
                        suffix = suffix.strip()
                        if suffix and digits:
                            parsed['qty'] = digits[0]
                            remainder = f"{digits[1:]}{suffix}".strip()
                            if remainder:
                                parsed['post_qty_segments'].extend(self._split_additional_segments(remainder))
                        else:
                            parsed['qty'] = digits
            elif seg.startswith('S'):
                parsed['serial_segments'].append(seg[1:])
            elif seg.startswith(('4L', '18V', '10D')):
                parsed['post_qty_segments'].append(seg)
            else:
                parsed['serial_segments'].append(seg)
        
        if parsed['serial_segments']:
            parsed['serial_no'] = GS.join(parsed['serial_segments'])
            
        return parsed

    def construct_iso15434_string(self, parsed_data):
        """
        Strict ISO-15434 construction.
        Format: [)>{RS}06{GS}1P...{GS}S...{GS}...{GS}Q...{RS}{EOT}
        """
        RS = chr(30)
        GS = chr(29)
        EOT = chr(4)

        # Header
        formatted = f"[)>{RS}06{GS}"
        
        # Part Number Segment
        formatted += f"1P{parsed_data['part_no']}{GS}"
        
        # Serial Number Segment (including internal GS markers)
        if parsed_data.get('serial_segments'):
            formatted += "S" + GS.join(parsed_data['serial_segments']) + GS
        else:
            formatted += f"S{parsed_data['serial_no']}{GS}"
            
        # Quantity Segment
        formatted += f"Q{parsed_data['qty']}"

        # Post-Quantity Application Segments
        for segment in parsed_data.get('post_qty_segments', []):
            formatted += f"{GS}{segment}"
        
        # Footer
        formatted += f"{RS}{EOT}"
        
        return formatted

    def _get_base_path(self):
        """Helper to get the correct base path whether running as script or EXE."""
        if getattr(sys, 'frozen', False):
            # If frozen, we might be in a temporary folder (onefile) 
            # or in the executable's folder (onedir)
            # Use sys._MEIPASS for internal bundled assets
            return sys._MEIPASS
        return os.path.dirname(os.path.abspath(__file__))

    def generate_label(self, raw_string, settings=None):
        """
        Orchestrates the creation of the label PDF with Dynamic Layout (v2.4)
        """
        # Default Settings (Measurements in mm, Font in pt)
        default_settings = {
            'labelWidth': 100,
            'labelHeight': 38,
            'barcodeWidthModule': 0.3,
            'layout': {
                'nokiaLogo': {'x': -2.3, 'y': -1.5, 'w': 24.63, 'h': 9.87},
                'nokiaText': {'x': 28.0, 'y': 0.1, 'fontSize': 14},
                'amidText': {'x': 77.0, 'y': 5.9, 'fontSize': 14},
                'ceMark': {'x': 62.0, 'y': 7.0, 'w': 10.09, 'h': 9.83},
                'ukcaMark': {'x': 63.0, 'y': 20.0, 'w': 10.01, 'h': 10.0},
                'barcode1': {'x': 2.0, 'y': 6.6, 'h': 5.0, 'fontSize': 10, 'label': '1P'},
                'barcode2': {'x': 2.0, 'y': 17.0, 'h': 5.0, 'fontSize': 10, 'label': 'S'},
                'barcode3': {'x': 2.0, 'y': 28.0, 'h': 4.0, 'fontSize': 10, 'label': 'Q'},
                'dmBarcode': {'x': 75.0, 'y': 12.5, 'size': 18.0},
                'footer': {'x': 85.0, 'y': 35.0, 'fontSize': 8, 'text': 'Made in India'}
            }
        }
        
        # Deep merge settings
        s = default_settings.copy()
        if settings:
            # Update top level keys first (except layout)
            for key in settings:
                if key != 'layout' and key in s:
                    s[key] = settings[key]
            
            # Deep merge layout
            if 'layout' in settings:
                for comp_key, comp_val in settings['layout'].items():
                    if comp_key in s['layout'] and isinstance(comp_val, dict):
                        s['layout'][comp_key].update(comp_val)
                    else:
                        s['layout'][comp_key] = comp_val
        
        # 1. Parse Data
        data = self.parse_nokia_string(raw_string)
        
        # 2. Create ISO String for DataMatrix
        datamatrix_content = self.construct_iso15434_string(data)

        # 3. Define PDF Filename
        filename = f"label_{uuid.uuid4().hex}.pdf"
        file_path = os.path.join(self.output_folder, filename)

        # Assets paths
        base_dir = self._get_base_path()
        assets_dir = os.path.join(base_dir, 'assets')
        logo_path = os.path.join(assets_dir, 'Nokia-Logo.jpg')
        ce_path = os.path.join(assets_dir, 'CC.bmp')
        ukca_path = os.path.join(assets_dir, 'UKCA black fill.svg')

        # 4. Draw PDF using ReportLab
        c = canvas.Canvas(file_path, pagesize=(s['labelWidth']*mm, s['labelHeight']*mm)) 
        
        l = s['layout']
        
        # Helper to convert CODESOFT (Top-Left) to ReportLab (Bottom-Left)
        # Y_RL = LabelHeight - Y_CS - Height
        def get_rl_y(cs_y, height_mm):
            return (s['labelHeight'] - cs_y - height_mm) * mm

        # --- DRAW IMAGES ---
        # 1. Nokia Logo
        if os.path.exists(logo_path):
            cfg = l['nokiaLogo']
            c.drawImage(logo_path, cfg['x']*mm, get_rl_y(cfg['y'], cfg['h']), 
                        width=cfg['w']*mm, height=cfg['h']*mm, preserveAspectRatio=True)
        
        # 2. CE Mark
        if os.path.exists(ce_path):
            cfg = l['ceMark']
            c.drawImage(ce_path, cfg['x']*mm, get_rl_y(cfg['y'], cfg['h']), 
                        width=cfg['w']*mm, height=cfg['h']*mm, preserveAspectRatio=True)

        # 3. UKCA Mark
        if os.path.exists(ukca_path):
            cfg = l['ukcaMark']
            if ukca_path.endswith('.svg'):
                # Render SVG to ReportLab Graphics Drawing
                drawing = svg2rlg(ukca_path)
                # Scale drawing to fit target width/height
                # Drawing initial width/height: drawing.width, drawing.height
                if drawing.width > 0 and drawing.height > 0:
                    scale_x = (cfg['w'] * mm) / drawing.width
                    scale_y = (cfg['h'] * mm) / drawing.height
                    drawing.scale(scale_x, scale_y)
                    # Use renderPDF to draw on the canvas
                    renderPDF.draw(drawing, c, cfg['x']*mm, get_rl_y(cfg['y'], cfg['h']))
            else:
                c.drawImage(ukca_path, cfg['x']*mm, get_rl_y(cfg['y'], cfg['h']), 
                            width=cfg['w']*mm, height=cfg['h']*mm)

        
        # --- DRAW TEXT ---
        # Nokia Text
        cfg = l['nokiaText']
        c.setFont("Helvetica-Bold", cfg['fontSize'])
        c.drawString(cfg['x']*mm, (s['labelHeight'] - cfg['y'])*mm - (cfg['fontSize']/2.8)*mm, "Nokia Solutions and Networks")
        
        # AMID Text
        cfg = l['amidText']
        c.setFont("Helvetica-Bold", cfg['fontSize'])
        c.drawString(cfg['x']*mm, (s['labelHeight'] - cfg['y'])*mm - (cfg['fontSize']/2.8)*mm, "AMID")

        # --- DRAW BARCODES ---
        def draw_barcode(cfg_key, barcode_value):
            cfg = l[cfg_key]
            # Available width: up to CE mark or end
            available_width_mm = 58 - cfg['x']
            
            bc = code128.Code128(barcode_value, barHeight=cfg['h']*mm, barWidth=s['barcodeWidthModule']*mm, quiet=0)
            bc_width_mm = bc.width / mm
            
            if bc_width_mm > available_width_mm:
                scaling_factor = available_width_mm / bc_width_mm
                new_bar_width = s['barcodeWidthModule'] * scaling_factor
                bc = code128.Code128(barcode_value, barHeight=cfg['h']*mm, barWidth=new_bar_width*mm, quiet=0)
            
            # Position Y: CODESOFT Y is usually the top of the combined block (barcode + text)
            # Layout: Barcode on Top, Text Below
            y_rl = get_rl_y(cfg['y'], cfg['h'])
            # Shift barcode 1.2mm left to align first bar with text start (compensating for internal quiet zone)
            # REVERTED: User requested exact alignment with text. With quiet=0, they should match.
            bc.drawOn(c, cfg['x']*mm, y_rl)
            
            # Label Text Below
            c.setFont("Helvetica-Bold", cfg['fontSize'])
            label_text = cfg.get('label', '') 
            label_display = f"({label_text}) {barcode_value[len(label_text):] if label_text and barcode_value.startswith(label_text) else barcode_value}"
            c.drawString(cfg['x']*mm, y_rl - (cfg['fontSize']/2.2)*mm, label_display)

        draw_barcode('barcode1', f"1P{data['part_no']}")
        draw_barcode('barcode2', f"S{data['serial_no']}")
        draw_barcode('barcode3', f"Q{data['qty']}")

        # --- DRAW DATAMATRIX ---
        cfg = l['dmBarcode']
        dm_drawing = createBarcodeDrawing('ECC200DataMatrix', 
                                          value=datamatrix_content, 
                                          width=cfg['size']*mm, 
                                          height=cfg['size']*mm)
        dm_x = cfg['x']*mm
        dm_y = get_rl_y(cfg['y'], cfg['size'])
        dm_drawing.drawOn(c, dm_x, dm_y)

        # --- DRAW FOOTER ---
        cfg = l['footer']
        c.setFont("Helvetica-Bold", cfg['fontSize'])
        c.drawCentredString(cfg['x']*mm, (s['labelHeight'] - cfg['y'])*mm, cfg['text'])

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
                for printer in win32print.EnumPrinters(win32print.PRINTER_ENUM_LOCAL | win32print.PRINTER_ENUM_CONNECTIONS):
                    printers.append(printer[2])
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
        Sends the PDF to the printer using GDI printing.
        Works without admin privileges by using win32ui CreateDC.
        """
        system = platform.system()
        try:
            if system == 'Windows':
                import win32print
                import win32ui
                import win32con
                from PIL import Image, ImageWin
                import fitz  # PyMuPDF

                if not printer_name:
                    printer_name = win32print.GetDefaultPrinter()

                logger.info(f"Starting print job to: {printer_name}")

                # Convert PDF to Image
                pdf_document = fitz.open(file_path)
                page = pdf_document[0]
                
                # Render at 300 DPI for crisp labels
                mat = fitz.Matrix(300/72, 300/72)
                pix = page.get_pixmap(matrix=mat)
                
                # Convert to PIL Image
                img_data = pix.tobytes("ppm")
                image = Image.open(BytesIO(img_data))
                pdf_document.close()
                
                if image.mode != 'RGB':
                    image = image.convert('RGB')
                
                logger.info(f"PDF converted to image: {image.size[0]}x{image.size[1]} pixels")
                
                # GDI Printing using Device Context
                hDC = win32ui.CreateDC()
                hDC.CreatePrinterDC(printer_name)
                
                # Get printable area (this just reads, doesn't modify settings)
                printable_area = (
                    hDC.GetDeviceCaps(win32con.HORZRES), 
                    hDC.GetDeviceCaps(win32con.VERTRES)
                )
                
                logger.info(f"Printer printable area: {printable_area[0]}x{printable_area[1]} pixels")
                
                # Calculate scaling to fit the label
                ratio = min(
                    printable_area[0] / image.size[0], 
                    printable_area[1] / image.size[1]
                )
                scaled_size = (
                    int(image.size[0] * ratio), 
                    int(image.size[1] * ratio)
                )
                
                # Resize image
                bmp = image.resize(scaled_size, Image.Resampling.LANCZOS)
                dib = ImageWin.Dib(bmp)
                
                # Start print job
                hDC.StartDoc(os.path.basename(file_path))
                hDC.StartPage()
                
                # Center the label on the page
                x = (printable_area[0] - scaled_size[0]) // 2
                y = (printable_area[1] - scaled_size[1]) // 2
                
                logger.info(f"Printing at: {scaled_size[0]}x{scaled_size[1]} pixels, offset: ({x}, {y})")
                
                # Draw to printer
                dib.draw(hDC.GetHandleOutput(), (x, y, x + scaled_size[0], y + scaled_size[1]))
                
                hDC.EndPage()
                hDC.EndDoc()
                hDC.DeleteDC()

                logger.info(f"Print job completed successfully")
                return True, f"Printed to {printer_name}"
            
            else:
                # Mac/Linux - Open PDF in default viewer for testing
                logger.info(f"Opening PDF in default viewer (Mac/Linux): {file_path}")
                
                if system == 'Darwin':  # macOS
                    subprocess.run(['open', file_path], check=True)
                else:  # Linux
                    subprocess.run(['xdg-open', file_path], check=True)
                
                return True, "PDF opened in default viewer (Mac/Linux testing mode)"

        except Exception as e:
            logger.error(f"Printing error: {e}", exc_info=True)
            return False, str(e)