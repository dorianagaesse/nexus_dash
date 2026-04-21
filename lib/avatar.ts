const AVATAR_SIZE = 64;
const GRID_SIZE = 5;
const GRID_INSET = 7;
const CELL_SIZE = 10;
const CELL_GAP = 0;
const GRID_CENTER_INDEX = Math.floor(GRID_SIZE / 2);
const PIXEL_COLORS = ["#F5F7FA", "#D5DBE3", "#5D6470"] as const;
const BACKGROUND_COLORS = [
  "#E76F51",
  "#F4A261",
  "#E9C46A",
  "#2A9D8F",
  "#4D908E",
  "#577590",
  "#90BE6D",
  "#F28482",
  "#84A59D",
  "#6D597A",
] as const;

function normalizeSeed(seed: string): string {
  return seed.trim().toLowerCase();
}

function escapeSvgAttribute(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function hashSeed(seed: string): number {
  let hash = 0x811c9dc5;
  for (const character of seed) {
    hash ^= character.charCodeAt(0);
    hash = Math.imul(hash, 0x01000193);
  }

  return hash >>> 0;
}

function createMulberry32(seed: number) {
  let state = seed >>> 0;

  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let next = Math.imul(state ^ (state >>> 15), state | 1);
    next ^= next + Math.imul(next ^ (next >>> 7), next | 61);
    return ((next ^ (next >>> 14)) >>> 0) / 4_294_967_296;
  };
}

function createEmptyGrid(): boolean[][] {
  return Array.from({ length: GRID_SIZE }, () => Array.from({ length: GRID_SIZE }, () => false));
}

function getNeighborCoordinates(row: number, column: number) {
  const neighbors: Array<{ row: number; column: number }> = [];

  for (let rowOffset = -1; rowOffset <= 1; rowOffset += 1) {
    for (let columnOffset = -1; columnOffset <= 1; columnOffset += 1) {
      if (rowOffset === 0 && columnOffset === 0) {
        continue;
      }

      const nextRow = row + rowOffset;
      const nextColumn = column + columnOffset;
      const isWithinBounds =
        nextRow >= 0 &&
        nextRow < GRID_SIZE &&
        nextColumn >= 0 &&
        nextColumn < GRID_SIZE;

      if (isWithinBounds) {
        neighbors.push({
          row: nextRow,
          column: nextColumn,
        });
      }
    }
  }

  return neighbors;
}

function getDistanceFromCenter(row: number, column: number): number {
  return Math.abs(row - GRID_CENTER_INDEX) + Math.abs(column - GRID_CENTER_INDEX);
}

function isEdgeCell(row: number, column: number): boolean {
  return row === 0 || column === 0 || row === GRID_SIZE - 1 || column === GRID_SIZE - 1;
}

function buildFrontier(grid: boolean[][], filledCells: Array<{ row: number; column: number }>) {
  const uniqueCandidates = new Map<string, { row: number; column: number }>();

  for (const { row, column } of filledCells) {
    for (const neighbor of getNeighborCoordinates(row, column)) {
      if (grid[neighbor.row]![neighbor.column]) {
        continue;
      }

      uniqueCandidates.set(`${neighbor.row}:${neighbor.column}`, neighbor);
    }
  }

  return Array.from(uniqueCandidates.values());
}

function pickNextCell(
  random: () => number,
  candidates: Array<{ row: number; column: number }>
) {
  const scoredCandidates = candidates
    .map((candidate) => {
      const centerDistance = getDistanceFromCenter(candidate.row, candidate.column);
      const edgePenalty = isEdgeCell(candidate.row, candidate.column) ? 1.25 : 0;

      return {
        candidate,
        score: 5 - centerDistance - edgePenalty + random() * 0.35,
      };
    })
    .sort((left, right) => right.score - left.score);

  return scoredCandidates[0]?.candidate ?? null;
}

function buildPixelMask(random: () => number): boolean[][] {
  const grid = createEmptyGrid();
  const filledCells: Array<{ row: number; column: number }> = [];
  const targetPixelCount = 9 + Math.floor(random() * 3);

  const startRow = GRID_CENTER_INDEX;
  const startColumn = GRID_CENTER_INDEX;

  grid[startRow]![startColumn] = true;
  filledCells.push({ row: startRow, column: startColumn });

  while (filledCells.length < targetPixelCount) {
    const frontier = buildFrontier(grid, filledCells);
    if (frontier.length === 0) {
      break;
    }

    const nextCell = pickNextCell(random, frontier);

    if (!nextCell) {
      break;
    }

    grid[nextCell.row]![nextCell.column] = true;
    filledCells.push(nextCell);
  }

  return grid;
}

function buildAvatarSvg(seed: string): string {
  const normalizedSeed = normalizeSeed(seed);
  const random = createMulberry32(hashSeed(normalizedSeed));
  const backgroundColor =
    BACKGROUND_COLORS[Math.floor(random() * BACKGROUND_COLORS.length)] ??
    BACKGROUND_COLORS[0];
  const pixels: string[] = [];
  const pixelMask = buildPixelMask(random);

  for (let row = 0; row < GRID_SIZE; row += 1) {
    for (let column = 0; column < GRID_SIZE; column += 1) {
      if (!pixelMask[row]![column]) {
        continue;
      }

      const colorIndex = Math.floor(random() * PIXEL_COLORS.length);
      const color = PIXEL_COLORS[colorIndex] ?? PIXEL_COLORS[0];
      const x = GRID_INSET + column * (CELL_SIZE + CELL_GAP);
      const y = GRID_INSET + row * (CELL_SIZE + CELL_GAP);
      const radius = Math.max(1, Math.round(random() * 2));

      pixels.push(
        `<rect x="${x}" y="${y}" width="${CELL_SIZE}" height="${CELL_SIZE}" rx="${radius}" fill="${color}" />`
      );
    }
  }

  const title = escapeSvgAttribute("Generated avatar");

  return [
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${AVATAR_SIZE} ${AVATAR_SIZE}" role="img" aria-labelledby="avatar-title">`,
    `<title id="avatar-title">${title}</title>`,
    `<defs><clipPath id="avatar-clip"><circle cx="${AVATAR_SIZE / 2}" cy="${AVATAR_SIZE / 2}" r="${AVATAR_SIZE / 2}" /></clipPath></defs>`,
    `<g clip-path="url(#avatar-clip)">`,
    `<rect width="${AVATAR_SIZE}" height="${AVATAR_SIZE}" fill="${backgroundColor}" />`,
    pixels.join(""),
    `</g>`,
    `</svg>`,
  ].join("");
}

export function resolveAvatarSeed(
  avatarSeed: string | null | undefined,
  fallbackKey: string
): string {
  const normalizedSeed = typeof avatarSeed === "string" ? avatarSeed.trim() : "";
  return normalizedSeed || fallbackKey.trim();
}

export function buildGeneratedAvatarDataUri(seed: string): string {
  const svg = buildAvatarSvg(seed);
  return `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`;
}

export function generateAvatarSeed(): string {
  return crypto.randomUUID().replace(/-/g, "");
}
