// @vitest-environment jsdom

import React, { act, useState } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, test } from "vitest";

import {
  clampMeetingNoteZoom,
  getMeetingNoteZoomTextStyle,
  MEETING_NOTE_ZOOM_DEFAULT,
  MeetingNoteZoomControl,
} from "@/components/meeting-notes/meeting-note-zoom-control";

(globalThis as { React?: typeof React }).React = React;
(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

function Harness() {
  const [inputsZoom, setInputsZoom] = useState(MEETING_NOTE_ZOOM_DEFAULT);
  const [outputsZoom, setOutputsZoom] = useState(MEETING_NOTE_ZOOM_DEFAULT);

  return (
    <>
      <MeetingNoteZoomControl
        label="Inputs"
        value={inputsZoom}
        onChange={setInputsZoom}
      />
      <p data-content="inputs" style={getMeetingNoteZoomTextStyle(inputsZoom)}>
        Preparation text
      </p>
      <MeetingNoteZoomControl
        label="Outputs"
        value={outputsZoom}
        onChange={setOutputsZoom}
      />
      <textarea
        data-content="outputs"
        value="Output text"
        readOnly
        style={getMeetingNoteZoomTextStyle(outputsZoom)}
      />
    </>
  );
}

describe("meeting-note zoom control", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
    act(() => root.render(<Harness />));
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
  });

  test("exposes section-specific controls and touch-sized targets", () => {
    const inputsGroup = container.querySelector(
      "[aria-label='Inputs zoom controls']"
    );
    const outputsGroup = container.querySelector(
      "[aria-label='Outputs zoom controls']"
    );

    expect(inputsGroup?.textContent).toContain("100%");
    expect(outputsGroup?.textContent).toContain("100%");
    expect(inputsGroup?.getAttribute("data-meeting-note-zoom")).toBe("inputs");
    expect(outputsGroup?.getAttribute("data-meeting-note-zoom")).toBe("outputs");
    for (const button of container.querySelectorAll("button")) {
      expect(button.className).toContain("h-11");
      expect(button.className).toContain("w-11");
    }
  });

  test("zooms inputs and outputs independently without changing their text", () => {
    const inputText = container.querySelector<HTMLElement>(
      "[data-content='inputs']"
    )!;
    const outputText = container.querySelector<HTMLTextAreaElement>(
      "[data-content='outputs']"
    )!;

    act(() => {
      container
        .querySelector<HTMLButtonElement>("button[aria-label='Zoom in Inputs']")
        ?.click();
    });

    expect(inputText.style.fontSize).toBe("17.5px");
    expect(outputText.style.fontSize).toBe("14px");
    expect(inputText.textContent).toBe("Preparation text");
    expect(outputText.value).toBe("Output text");

    act(() => {
      container
        .querySelector<HTMLButtonElement>(
          "button[aria-label='Zoom out Outputs']"
        )
        ?.click();
    });

    expect(inputText.style.fontSize).toBe("17.5px");
    expect(outputText.style.fontSize).toBe("10.5px");
  });

  test("clamps to supported steps and disables boundary actions", () => {
    const zoomOut = container.querySelector<HTMLButtonElement>(
      "button[aria-label='Zoom out Inputs']"
    )!;
    const zoomIn = container.querySelector<HTMLButtonElement>(
      "button[aria-label='Zoom in Inputs']"
    )!;

    act(() => zoomOut.click());
    expect(zoomOut.disabled).toBe(true);
    expect(
      container.querySelector("[aria-label='Inputs zoom controls']")
        ?.textContent
    ).toContain("75%");

    for (let index = 0; index < 5; index += 1) {
      act(() => zoomIn.click());
    }
    expect(zoomIn.disabled).toBe(true);
    expect(
      container.querySelector("[aria-label='Inputs zoom controls']")
        ?.textContent
    ).toContain("200%");

    expect(clampMeetingNoteZoom(62)).toBe(75);
    expect(clampMeetingNoteZoom(138)).toBe(150);
    expect(clampMeetingNoteZoom(225)).toBe(200);
  });
});
