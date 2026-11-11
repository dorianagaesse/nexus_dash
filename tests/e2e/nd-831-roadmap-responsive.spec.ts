import { expect, test, type Page } from "@playwright/test";

import { signInAsVerifiedUser } from "./helpers/auth-helpers";
import { uniqueProjectName } from "./helpers/project-helpers";

const longMilestoneTitle = "CustomerReadinessAndReleaseCoordination".repeat(2);
const longEventTitle = "CrossPlatformReleaseVerification".repeat(3);
const eventDescription = "Confirm the release checklist with the support team.";

async function openRoadmap(page: Page) {
  await signInAsVerifiedUser(page);
  const created = await page.request.post("/api/projects", {
    data: { name: uniqueProjectName("responsive-roadmap") },
  });
  expect(created.status()).toBe(201);
  const { project } = (await created.json()) as { project: { id: string } };
  const roadmapUrl = `/api/projects/${project.id}/roadmap`;

  for (const [title, eventTitles] of [
    [longMilestoneTitle, [longEventTitle, "Notify pilot customers"]],
    ["Launch", ["Publish the release notes"]],
    ["Follow-up", ["Review customer feedback"]],
  ] as const) {
    const milestone = await page.request.post(roadmapUrl, { data: { title } });
    expect(milestone.status()).toBe(201);
    const { phase } = (await milestone.json()) as { phase: { id: string } };

    for (const eventTitle of eventTitles) {
      const event = await page.request.post(`${roadmapUrl}/phases/${phase.id}/events`, {
        data: { title: eventTitle, description: eventDescription, targetDate: "2026-12-01" },
      });
      expect(event.status()).toBe(201);
    }
  }

  await page.goto(`/projects/${project.id}`);
  const toggle = page.getByRole("button", { name: /^Roadmap 3 milestones/ });
  await expect(toggle).toBeVisible();
  if ((await toggle.getAttribute("aria-expanded")) === "false") {
    await toggle.click();
  }

  const timeline = page.locator("[data-roadmap-scroll-container]");
  const lanes = timeline.locator("[data-roadmap-milestone]");
  await expect(lanes).toHaveCount(3);
  return { timeline, lanes };
}

test.describe("roadmap on a touch viewport", () => {
  test.use({ hasTouch: true, isMobile: true, viewport: { width: 320, height: 720 } });

  test("fits grouped milestones and keeps actions reachable", async ({ page }) => {
    const { timeline, lanes } = await openRoadmap(page);
    const firstLane = lanes.first();
    const firstEvent = firstLane.getByRole("article").first();
    await expect(firstLane.getByRole("article")).toHaveCount(2);

    for (const width of [320, 375, 430]) {
      await page.setViewportSize({ width, height: 720 });
      await expect.poll(() => timeline.evaluate((container) => {
        const layout = document.documentElement;
        const timelineBounds = container.getBoundingClientRect();
        const milestones = [...container.querySelectorAll("[data-roadmap-milestone]")];
        const first = milestones[0]?.getBoundingClientRect();
        const last = milestones.at(-1)?.getBoundingClientRect();
        return (
          Boolean(first && last && first.height > 0 && last.top > first.bottom) &&
          layout.scrollWidth <= layout.clientWidth &&
          container.scrollWidth <= container.clientWidth &&
          [...container.querySelectorAll<HTMLElement>("[data-roadmap-milestone], article")].every(
            (element) => {
              const bounds = element.getBoundingClientRect();
              return bounds.left >= timelineBounds.left && bounds.right <= timelineBounds.right &&
                element.scrollWidth <= element.clientWidth;
            }
          )
        );
      }), `roadmap fits at ${width}px`).toBe(true);

      const milestoneTitle = firstLane.getByText(longMilestoneTitle, { exact: true });
      await expect.poll(() => milestoneTitle.evaluate(
        (element) => element.scrollWidth <= element.clientWidth,
      )).toBe(true);
      await expect(firstEvent.getByRole("heading", { name: longEventTitle })).toBeVisible();
    }

    await page.setViewportSize({ width: 320, height: 720 });
    await firstEvent.getByRole("button", { name: "View", exact: true }).tap();
    const dialog = page.getByRole("dialog", { name: longEventTitle });
    await expect(dialog.getByText(eventDescription)).toBeVisible();
    const detailTitle = dialog.getByRole("heading", { name: longEventTitle });
    await expect.poll(() => detailTitle.evaluate(
      (element) => element.scrollWidth <= element.clientWidth,
    )).toBe(true);
    await dialog.getByRole("button", { name: "Close", exact: true }).tap();

    await firstLane.getByRole("button", { name: `Edit ${longMilestoneTitle}`, exact: true }).tap();
    await expect(page.getByRole("dialog", { name: /Edit milestone/ })).toBeVisible();
    await page.keyboard.press("Escape");

    await firstEvent.getByRole("button", { name: "Edit", exact: true }).tap();
    await expect(page.getByRole("dialog", { name: /Edit event/ })).toBeVisible();
    await page.keyboard.press("Escape");

    await firstEvent.getByRole("button", { name: "Delete", exact: true }).tap();
    await expect(page.getByRole("alertdialog", { name: "Delete roadmap event?" })).toBeVisible();
    await page.keyboard.press("Escape");

    await page.getByRole("button", { name: "New event", exact: true }).tap();
    await expect(page.getByRole("dialog", { name: /New event/ })).toBeVisible();
    await page.keyboard.press("Escape");

    await lanes.last().getByRole("button", { name: "View", exact: true }).tap();
    await expect(page.getByRole("dialog", { name: "Review customer feedback" })).toBeVisible();
  });

  test("moves an event to another milestone with a touch drag", async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 850 });
    const { lanes } = await openRoadmap(page);
    const eventCard = lanes.first().getByRole("article").filter({ hasText: "Notify pilot customers" });
    await eventCard.getByRole("button", { name: "View", exact: true }).tap();
    const details = page.getByRole("dialog", { name: "Notify pilot customers" });
    await details.getByRole("button", { name: "Close", exact: true }).tap();
    await expect(details).toBeHidden();

    const handle = eventCard.locator("[data-roadmap-event-drag-handle]");
    await handle.evaluate((element) => {
      window.scrollBy({ top: element.getBoundingClientRect().top - 130, behavior: "instant" });
    });
    const handleBox = (await handle.boundingBox())!;
    const eventBox = (await eventCard.boundingBox())!;
    const startX = handleBox.x + handleBox.width / 2;
    const startY = handleBox.y + handleBox.height / 2;
    const touch = await page.context().newCDPSession(page);
    await touch.send("Input.dispatchTouchEvent", {
      type: "touchStart",
      touchPoints: [{ x: startX, y: startY }],
    });
    await expect(page.locator("[data-roadmap-new-milestone-dropzone]")).toBeVisible();

    const destination = lanes.nth(1).locator("[data-roadmap-lane-dropzone]");
    const destinationBox = (await destination.boundingBox())!;
    const eventCenter = eventBox.y + eventBox.height / 2;
    const endY = startY + destinationBox.y + destinationBox.height / 2 - eventCenter;
    const steps = 16;
    for (let step = 1; step <= steps; step += 1) {
      await touch.send("Input.dispatchTouchEvent", {
        type: "touchMove",
        touchPoints: [{ x: startX, y: startY + (endY - startY) * step / steps }],
      });
    }
    await expect(destination).toHaveClass(/bg-gradient-to-b/);
    await touch.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
    await expect(lanes.nth(1).getByRole("heading", { name: "Notify pilot customers" })).toBeVisible();
  });
});

test("keeps the desktop timeline horizontally scrollable", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  const { timeline, lanes } = await openRoadmap(page);
  await expect.poll(() => lanes.evaluateAll(([firstLane, secondLane]) => {
    const first = firstLane?.getBoundingClientRect();
    const second = secondLane?.getBoundingClientRect();
    return Boolean(first && second && first.width > 0 && second.left > first.right && second.top === first.top);
  })).toBe(true);
  await expect.poll(() => timeline.evaluate((element) => element.scrollWidth > element.clientWidth)).toBe(true);

  await lanes.last().getByRole("button", { name: "View", exact: true }).click();
  await expect.poll(() => timeline.evaluate((element) => element.scrollLeft)).toBeGreaterThan(0);
  await expect(page.getByRole("dialog", { name: "Review customer feedback" })).toBeVisible();
});
