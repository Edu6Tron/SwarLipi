import { clamp } from "./swarlipi-storage";

export function getReaderMaxOffset(contentHeight: number, viewportHeight: number): number {
  if (!Number.isFinite(contentHeight) || !Number.isFinite(viewportHeight)) return 0;
  return Math.max(contentHeight - viewportHeight, 0);
}

export function getReaderOffset(progress: number, maxOffset: number): number {
  if (!Number.isFinite(progress) || !Number.isFinite(maxOffset) || maxOffset <= 0) return 0;
  return clamp(progress, 0, 1) * maxOffset;
}

export function getReaderProgress(offset: number, maxOffset: number): number {
  if (!Number.isFinite(offset) || !Number.isFinite(maxOffset) || maxOffset <= 0) return 0;
  return clamp(offset / maxOffset, 0, 1);
}
