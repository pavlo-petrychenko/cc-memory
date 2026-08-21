import boundaries from "eslint-plugin-boundaries";

export default [
  {
    files: ["src/shared/**/*"],
    plugins: { boundaries },
    rules: {
      "boundaries/element-types": [
        "error",
        {
          default: "disallow",
          rules: [{ from: "shared", allow: [] }],
        },
      ],
    },
    settings: {
      "boundaries/elements": [{ type: "shared", pattern: "src/shared/**" }],
    },
  },
  {
    files: ["src/server/**/*"],
    plugins: { boundaries },
    rules: {
      "boundaries/element-types": [
        "error",
        {
          default: "disallow",
          rules: [
            { from: "server", allow: ["shared", "server"] },
            { from: "client", allow: [] },
          ],
        },
      ],
    },
    settings: {
      "boundaries/elements": [
        { type: "shared", pattern: "src/shared/**" },
        { type: "server", pattern: "src/server/**" },
      ],
    },
  },
  {
    files: ["src/client/**/*"],
    plugins: { boundaries },
    rules: {
      "boundaries/element-types": [
        "error",
        {
          default: "disallow",
          rules: [{ from: "client", allow: ["shared", "client", "ui"] }],
        },
      ],
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: ["server/*", "src/server/*"],
              message: "client may not import server",
            },
            { group: ["src/*"], message: "use @/* alias" },
          ],
        },
      ],
    },
    settings: {
      "boundaries/elements": [
        { type: "shared", pattern: "src/shared/**" },
        { type: "client", pattern: "src/client/**" },
        { type: "ui", pattern: "src/client/ui/**" },
      ],
    },
  },
];
