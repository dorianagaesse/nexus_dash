// @vitest-environment jsdom

import { describe, expect, test } from "vitest";

import { buildEditorRichTextHtml } from "@/components/rich-text-editor";
import {
  createRichTextCodeBlock,
  createRichTextTokenBlock,
} from "@/lib/rich-text";

function getTemplate(html: string) {
  const template = document.createElement("template");
  template.innerHTML = html;
  return template;
}

describe("rich-text-editor", () => {
  test("keeps a trailing paragraph after a terminal code block", () => {
    const html = buildEditorRichTextHtml(createRichTextCodeBlock("npm run lint") ?? "");
    const template = getTemplate(html);

    expect(template.content.lastElementChild?.tagName).toBe("P");
  });

  test("keeps a trailing paragraph after a terminal token block", () => {
    const html = buildEditorRichTextHtml(createRichTextTokenBlock("secret-token") ?? "");
    const template = getTemplate(html);

    expect(template.content.lastElementChild?.tagName).toBe("P");
  });
});
