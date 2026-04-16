import os
import sys
import unittest


sys.path.append(os.path.dirname(os.path.abspath(__file__)))

from services import NokiaLabelService


class NokiaLabelServiceTests(unittest.TestCase):
    def setUp(self):
        temp_dir = os.path.join(os.path.dirname(__file__), 'temp_labels_test')
        os.makedirs(temp_dir, exist_ok=True)
        self.service = NokiaLabelService(output_folder=temp_dir)

    def test_concatenated_input_normalizes_18v_segment_to_sn(self):
        raw_input = '1P475773A.102SUK2550A0274Q14LIN18VLENOK'

        parsed = self.service.parse_nokia_string(raw_input)
        datamatrix = self.service.construct_iso15434_string(parsed)
        debug_value = self.service.make_datamatrix_debug_string(datamatrix)

        self.assertEqual(parsed['post_qty_segments'], ['4LIN', '18VLENSN'])
        self.assertIn('{GS}18VLENSN{RS}{EOT}', debug_value)

    def test_iso15434_input_normalizes_18v_segment_to_sn(self):
        raw_input = '[)>\x1e06\x1d1P475773A.102\x1dSUK2550A0274\x1dQ1\x1d4LIN\x1d18VLENOK\x1e\x04'

        parsed = self.service.parse_nokia_string(raw_input)
        datamatrix = self.service.construct_iso15434_string(parsed)
        debug_value = self.service.make_datamatrix_debug_string(datamatrix)

        self.assertEqual(parsed['post_qty_segments'], ['4LIN', '18VLENSN'])
        self.assertEqual(
            debug_value,
            '[)>{RS}06{GS}1P475773A.102{GS}SUK2550A0274{GS}Q1{GS}4LIN{GS}18VLENSN{RS}{EOT}',
        )

    def test_custom_postfix_mapping_overrides_default_suffix(self):
        raw_input = '[)>\x1e06\x1d1P475773A.102\x1dSUK2545A0499\x1dQ1\x1d4LIN\x1d18VLENSN\x1e\x04'
        postfix_mappings = [{'matchPrefix': '18VLEN', 'postfix': 'OK'}]

        parsed = self.service.parse_nokia_string(raw_input, postfix_mappings=postfix_mappings)
        datamatrix = self.service.construct_iso15434_string(parsed, postfix_mappings=postfix_mappings)
        debug_value = self.service.make_datamatrix_debug_string(datamatrix)

        self.assertEqual(parsed['post_qty_segments'], ['4LIN', '18VLENOK'])
        self.assertEqual(
            debug_value,
            '[)>{RS}06{GS}1P475773A.102{GS}SUK2545A0499{GS}Q1{GS}4LIN{GS}18VLENOK{RS}{EOT}',
        )

    def test_empty_postfix_mappings_keep_scanned_suffix(self):
        raw_input = '[)>\x1e06\x1d1P475773A.102\x1dSUK2545A0499\x1dQ1\x1d4LIN\x1d18VLENOK\x1e\x04'

        parsed = self.service.parse_nokia_string(raw_input, postfix_mappings=[])
        datamatrix = self.service.construct_iso15434_string(parsed, postfix_mappings=[])
        debug_value = self.service.make_datamatrix_debug_string(datamatrix)

        self.assertEqual(parsed['post_qty_segments'], ['4LIN', '18VLENOK'])
        self.assertEqual(
            debug_value,
            '[)>{RS}06{GS}1P475773A.102{GS}SUK2545A0499{GS}Q1{GS}4LIN{GS}18VLENOK{RS}{EOT}',
        )


if __name__ == '__main__':
    unittest.main()
