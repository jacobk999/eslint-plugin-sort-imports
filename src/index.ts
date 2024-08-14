import { rule } from "./sort-imports.js";

const plugin = {
  name: "eslint-plugin-sort-imports",
  rules: { "sort-imports": rule },
};

export default plugin;