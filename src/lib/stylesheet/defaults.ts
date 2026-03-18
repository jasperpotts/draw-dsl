/**
 * Built-in default stylesheet as a string constant.
 * Used when no diagram-styles.css is found in the directory tree.
 */

export const DEFAULT_STYLESHEET = `
:root {
  --font-default: "Arial Narrow", Arial, "Helvetica Neue", Helvetica, sans-serif;
  --font-notes: "Comic Sans MS", "Comic Sans", "Marker Felt", cursive;
  --font-mono: "SF Mono", "Cascadia Code", Consolas, "Liberation Mono", monospace;
}

.h1 { font-size: 24px; font-weight: bold; }
.h2 { font-size: 20px; font-weight: bold; }
.h3 { font-size: 16px; font-weight: bold; }
.h4 { font-size: 14px; font-weight: bold; }

.b1 { font-size: 16px; }
.b2 { font-size: 14px; }
.b3 { font-size: 12px; }
.b4 { font-size: 10px; }
.b5 { font-size: 9px; }
.b6 { font-size: 8px; }

.ct1 { font-size: 10px; }
.ct2 { font-size: 9px; }

.mono { font-family: var(--font-mono); }

.imp1 { stroke-width: 3px; }
.imp2 { stroke-width: 2px; }
.imp3 { stroke-width: 1px; }
.imp4 { stroke-width: 1px; stroke-dasharray: 4 2; }

.note {
  font-family: var(--font-notes);
  fill: var(--c2-fill);
  stroke: var(--c2-stroke);
  border-radius: 0;
}

@theme light {
  --diagram-background: #ffffff;
  --default-fill: #ffffff;
  --default-stroke: #9ca3af;
  --default-font: #1f2937;
  --c0-fill: #EFF6FF;    --c0-stroke: #3b82f6;   --c0-font: #1e40af;
  --c1-fill: #ECFDF5;    --c1-stroke: #10b981;   --c1-font: #065f46;
  --c2-fill: #FEF3C7;    --c2-stroke: #f59e0b;   --c2-font: #92400e;
  --c3-fill: #FEE2E2;    --c3-stroke: #ef4444;   --c3-font: #991b1b;
  --c4-fill: #F3E8FF;    --c4-stroke: #a855f7;   --c4-font: #6b21a8;
  --c5-fill: #E0E7FF;    --c5-stroke: #6366f1;   --c5-font: #4338ca;
  --c6-fill: #FCE7F3;    --c6-stroke: #ec4899;   --c6-font: #9d174d;
  --c7-fill: #F8FAFC;    --c7-stroke: #94a3b8;   --c7-font: #334155;
  --c8-fill: #FFF7ED;    --c8-stroke: #f97316;   --c8-font: #c2410c;
  --c9-fill: #F0FDFA;    --c9-stroke: #14b8a6;   --c9-font: #115e59;
}

@theme dark {
  --diagram-background: #1e1e2e;
  --default-fill: #374151;
  --default-stroke: #6b7280;
  --default-font: #f3f4f6;
  --c0-fill: #1e3a5f;    --c0-stroke: #60a5fa;   --c0-font: #bfdbfe;
  --c1-fill: #1a3a2a;    --c1-stroke: #34d399;   --c1-font: #a7f3d0;
  --c2-fill: #3d2e0a;    --c2-stroke: #fbbf24;   --c2-font: #fde68a;
  --c3-fill: #3b1c1c;    --c3-stroke: #f87171;   --c3-font: #fecaca;
  --c4-fill: #2e1a47;    --c4-stroke: #c084fc;   --c4-font: #e9d5ff;
  --c5-fill: #1e1b4b;    --c5-stroke: #818cf8;   --c5-font: #c7d2fe;
  --c6-fill: #3b1a2e;    --c6-stroke: #f472b6;   --c6-font: #fbcfe8;
  --c7-fill: #1e293b;    --c7-stroke: #64748b;   --c7-font: #cbd5e1;
  --c8-fill: #3b1f0a;    --c8-stroke: #fb923c;   --c8-font: #fed7aa;
  --c9-fill: #0f2a2a;    --c9-stroke: #2dd4bf;   --c9-font: #99f6e4;
}
`;
