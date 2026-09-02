// @vitest-environment jsdom

import React, { useState } from "react";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, test } from "vitest";

import { MeetingParticipantPicker } from "@/components/meeting-participants/meeting-participant-picker";
import type {
  ProjectMeetingParticipantCollaborator,
  ProjectMeetingParticipantIdentity,
} from "@/lib/meeting-participant";

(globalThis as { React?: typeof React }).React = React;
(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

const COLLABORATORS: ProjectMeetingParticipantCollaborator[] = [
  {
    id: "user-2",
    displayName: "camille",
    usernameTag: "camille#0042",
    avatarSeed: "seed-camille",
    projectRole: "editor",
  },
];

const PREVIOUS_EXTERNALS: ProjectMeetingParticipantIdentity[] = [
  {
    userId: null,
    displayName: "Charlie Example",
    usernameTag: null,
    avatarSeed: null,
  },
];

function Harness() {
  const [participants, setParticipants] = useState<
    ProjectMeetingParticipantIdentity[]
  >([]);
  const [inputValue, setInputValue] = useState("");

  return (
    <MeetingParticipantPicker
      id="meeting-participants"
      value={participants}
      inputValue={inputValue}
      collaborators={COLLABORATORS}
      previousExternalParticipants={PREVIOUS_EXTERNALS}
      onInputValueChange={setInputValue}
      onChange={setParticipants}
    />
  );
}

function StewardHarness() {
  const [participants, setParticipants] = useState<
    ProjectMeetingParticipantIdentity[]
  >([
    {
      userId: COLLABORATORS[0].id,
      displayName: COLLABORATORS[0].displayName,
      usernameTag: COLLABORATORS[0].usernameTag,
      avatarSeed: COLLABORATORS[0].avatarSeed,
    },
    PREVIOUS_EXTERNALS[0],
  ]);
  const [inputValue, setInputValue] = useState("");
  const [stewardUserId, setStewardUserId] = useState<string | null>(null);

  return (
    <MeetingParticipantPicker
      id="steward-participants"
      value={participants}
      inputValue={inputValue}
      collaborators={COLLABORATORS}
      previousExternalParticipants={PREVIOUS_EXTERNALS}
      onInputValueChange={setInputValue}
      onChange={setParticipants}
      stewardUserId={stewardUserId}
      onStewardChange={setStewardUserId}
    />
  );
}

function setInputValue(input: HTMLInputElement, value: string) {
  const setter = Object.getOwnPropertyDescriptor(
    HTMLInputElement.prototype,
    "value"
  )?.set;
  setter?.call(input, value);
  input.dispatchEvent(new Event("input", { bubbles: true }));
}

describe("MeetingParticipantPicker", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(async () => {
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
    await act(async () => {
      root.render(<Harness />);
    });
  });

  afterEach(async () => {
    await act(async () => {
      root.unmount();
    });
    container.remove();
    document.body.innerHTML = "";
  });

  test("keeps Space and comma in a multi-word external name until Enter", async () => {
    const input = container.querySelector<HTMLInputElement>(
      "#meeting-participants"
    )!;

    await act(async () => {
      setInputValue(input, "Firstname");
    });
    const spaceEvent = new KeyboardEvent("keydown", {
      key: " ",
      bubbles: true,
      cancelable: true,
    });
    await act(async () => {
      input.dispatchEvent(spaceEvent);
      setInputValue(input, "Firstname Name");
    });
    const commaEvent = new KeyboardEvent("keydown", {
      key: ",",
      bubbles: true,
      cancelable: true,
    });
    await act(async () => {
      input.dispatchEvent(commaEvent);
    });

    expect(spaceEvent.defaultPrevented).toBe(false);
    expect(commaEvent.defaultPrevented).toBe(false);
    expect(container.querySelector("button[aria-label^='Remove']")).toBeNull();

    await act(async () => {
      input.dispatchEvent(
        new KeyboardEvent("keydown", {
          key: "Enter",
          bubbles: true,
          cancelable: true,
        })
      );
    });

    expect(
      container.querySelector("button[aria-label='Remove Firstname Name']")
    ).not.toBeNull();
    expect(container.textContent).toContain("FN");
  });

  test("searches collaborators and adds the linked NexusDash identity", async () => {
    const input = container.querySelector<HTMLInputElement>(
      "#meeting-participants"
    )!;

    await act(async () => {
      input.focus();
      setInputValue(input, "cam");
    });
    await act(async () => {});

    const option = document.body.querySelector<HTMLElement>("[role='option']");
    expect(option?.textContent).toContain("camille");
    expect(option?.textContent).toContain("Editor");

    await act(async () => {
      option?.click();
    });

    expect(
      container.querySelector("button[aria-label='Remove camille']")
    ).not.toBeNull();
    expect(container.querySelector("img")).not.toBeNull();
  });

  test("adds previous guests with Tab and supports the explicit plus action", async () => {
    const input = container.querySelector<HTMLInputElement>(
      "#meeting-participants"
    )!;

    await act(async () => {
      setInputValue(input, "Charlie Example");
      input.dispatchEvent(
        new KeyboardEvent("keydown", {
          key: "Tab",
          bubbles: true,
          cancelable: true,
        })
      );
    });

    expect(
      container.querySelector("button[aria-label='Remove Charlie Example']")
    ).not.toBeNull();
    expect(container.textContent).toContain("CE");

    await act(async () => {
      setInputValue(input, "Morgan Lee");
    });
    const addButton = container.querySelector<HTMLButtonElement>(
      "button[aria-label='Add Morgan Lee as a participant']"
    );
    await act(async () => {
      addButton?.click();
    });

    expect(
      container.querySelector("button[aria-label='Remove Morgan Lee']")
    ).not.toBeNull();
  });

  test("sets and clears the facilitator by clicking an eligible participant", async () => {
    await act(async () => {
      root.render(<StewardHarness />);
    });

    const makeSteward = container.querySelector<HTMLButtonElement>(
      "button[aria-label='Make camille steward / facilitator']"
    );
    expect(makeSteward).not.toBeNull();
    expect(
      container.querySelector(
        "button[aria-label='Make Charlie Example steward / facilitator']"
      )
    ).toBeNull();

    await act(async () => {
      makeSteward?.click();
    });

    const removeSteward = container.querySelector<HTMLButtonElement>(
      "button[aria-label='Remove camille as steward / facilitator']"
    );
    expect(removeSteward?.getAttribute("aria-pressed")).toBe("true");
    expect(removeSteward?.querySelector("svg")).not.toBeNull();

    await act(async () => {
      removeSteward?.click();
    });

    expect(
      container
        .querySelector(
          "button[aria-label='Make camille steward / facilitator']"
        )
        ?.getAttribute("aria-pressed")
    ).toBe("false");
  });
});
