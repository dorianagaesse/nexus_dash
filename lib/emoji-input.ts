export interface TextInsertionResult {
  nextValue: string;
  nextCursorPosition: number;
}

export type EditableTextElement =
  | HTMLInputElement
  | HTMLTextAreaElement
  | HTMLDivElement
  | null;

export function insertTextIntoValue(
  value: string,
  insertedText: string,
  selectionStart: number | null,
  selectionEnd: number | null
): TextInsertionResult {
  const normalizedStart = Math.max(0, selectionStart ?? value.length);
  const normalizedEnd = Math.max(normalizedStart, selectionEnd ?? normalizedStart);
  const nextValue =
    value.slice(0, normalizedStart) + insertedText + value.slice(normalizedEnd);

  return {
    nextValue,
    nextCursorPosition: normalizedStart + insertedText.length,
  };
}

function updateNativeTextControlValue(
  element: HTMLInputElement | HTMLTextAreaElement,
  nextValue: string
) {
  const prototype = Object.getPrototypeOf(element) as HTMLInputElement | HTMLTextAreaElement;
  const descriptor = Object.getOwnPropertyDescriptor(prototype, "value");

  if (descriptor?.set) {
    descriptor.set.call(element, nextValue);
    return;
  }

  element.value = nextValue;
}

function insertIntoTextControl(
  element: HTMLInputElement | HTMLTextAreaElement,
  emoji: string
) {
  const { nextValue, nextCursorPosition } = insertTextIntoValue(
    element.value,
    emoji,
    element.selectionStart,
    element.selectionEnd
  );

  updateNativeTextControlValue(element, nextValue);
  element.focus();
  element.setSelectionRange(nextCursorPosition, nextCursorPosition);
  element.dispatchEvent(new Event("input", { bubbles: true }));
}

function moveCursorToEnd(range: Range, root: HTMLDivElement) {
  range.selectNodeContents(root);
  range.collapse(false);
}

function insertIntoContentEditable(element: HTMLDivElement, emoji: string) {
  element.focus();
  const selection = window.getSelection();

  if (!selection) {
    return;
  }

  const range = selection.rangeCount > 0 ? selection.getRangeAt(0) : document.createRange();
  if (!selection.rangeCount || !element.contains(range.commonAncestorContainer)) {
    moveCursorToEnd(range, element);
  }

  range.deleteContents();
  const textNode = document.createTextNode(emoji);
  range.insertNode(textNode);

  range.setStartAfter(textNode);
  range.collapse(true);
  selection.removeAllRanges();
  selection.addRange(range);

  element.dispatchEvent(new Event("input", { bubbles: true }));
}

export function insertEmojiAtCursor(target: EditableTextElement, emoji: string) {
  if (!target) {
    return;
  }

  if (target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement) {
    insertIntoTextControl(target, emoji);
    return;
  }

  if (target instanceof HTMLDivElement) {
    insertIntoContentEditable(target, emoji);
  }
}
