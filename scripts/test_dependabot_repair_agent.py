import json
import tempfile
import unittest
from pathlib import Path

from scripts import dependabot_repair_agent as agent


class ResultContractTests(unittest.TestCase):
    def test_accepts_valid_fixed_result(self) -> None:
        payload = {
            "decision": "fixed",
            "summary": "Applied the compatibility repair.",
            "validation": ["npm test"],
        }

        self.assertEqual(agent.validate_result_payload(payload), payload)

    def test_rejects_invalid_result_shapes(self) -> None:
        invalid_payloads = [
            [],
            {"decision": "unknown", "summary": "Nope", "validation": []},
            {"decision": "defer", "summary": "", "validation": []},
            {"decision": "fixed", "summary": "Done", "validation": "npm test"},
            {"decision": "fixed", "summary": "Done", "validation": [1]},
        ]

        for payload in invalid_payloads:
            with self.subTest(payload=payload):
                self.assertIsNone(agent.validate_result_payload(payload))

    def test_loads_valid_result_file(self) -> None:
        payload = {
            "decision": "defer",
            "summary": "Upstream support is not ready.",
            "validation": [],
        }
        with tempfile.TemporaryDirectory() as directory:
            result_path = Path(directory) / "result.json"
            result_path.write_text(json.dumps(payload), encoding="utf-8")

            result, valid, source = agent.load_result_with_status(result_path)

        self.assertTrue(valid)
        self.assertEqual(source, "result-file")
        self.assertEqual(result, payload)

    def test_recovers_structured_result_from_copilot_output(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            result_path = Path(directory) / "result.json"
            output_path = Path(directory) / "copilot-output.log"
            output_path.write_text(
                'Repair complete. {"decision":"fixed","summary":"Updated config.",'
                '"validation":["npm test"]}',
                encoding="utf-8",
            )

            result, valid, source = agent.load_result_with_status(
                result_path,
                copilot_output_path=output_path,
            )

        self.assertTrue(valid)
        self.assertEqual(source, "copilot-output")
        self.assertEqual(result["decision"], "fixed")
        self.assertEqual(result["validation"], ["npm test"])

    def test_missing_result_is_reported_as_infrastructure_failure(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            result, valid, source = agent.load_result_with_status(Path(directory) / "result.json")

        self.assertFalse(valid)
        self.assertEqual(source, "missing")
        self.assertEqual(result["decision"], "defer")


class RetryMarkerTests(unittest.TestCase):
    def test_infrastructure_marker_does_not_match_terminal_marker(self) -> None:
        head_sha = "abc123"
        terminal_marker = f"{agent.MARKER_PREFIX}pr-42:{head_sha} -->"
        infrastructure_marker = f"{agent.ERROR_MARKER_PREFIX}pr-42:{head_sha} -->"

        self.assertNotIn(terminal_marker, infrastructure_marker)


if __name__ == "__main__":
    unittest.main()
