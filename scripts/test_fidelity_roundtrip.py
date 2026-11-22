import tempfile
from pathlib import Path
import unittest
from unittest.mock import patch

import fidelity_roundtrip as fidelity


class FidelityRoundtripTests(unittest.TestCase):
    def test_debug_comparison_is_controlled(self):
        self.assertIn((0, 0), fidelity.PROFILES)
        self.assertIn((0, 2), fidelity.PROFILES)
        self.assertEqual(len(fidelity.PROFILES), len(set(fidelity.PROFILES)))
        for case in fidelity.CASES:
            text = (fidelity.INPUTS / f'{case}.luau').read_text(encoding='utf-8')
            self.assertIn('return function(seed)', text)
            self.assertIn('nil,', text)

    def test_missing_tool_is_harness_failure(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            argv = ['fidelity_roundtrip.py', '--compiler', str(root/'missing'),
                    '--vm', str(root/'missing'), '--ast', str(root/'missing'), '--out', str(root/'out')]
            with patch('sys.argv', argv):
                self.assertEqual(fidelity.main(), 2)
            self.assertFalse((root/'out').exists())


if __name__ == '__main__': unittest.main()
