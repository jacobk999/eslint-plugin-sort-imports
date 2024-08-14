import { rule } from "./sort-imports.js";

const plugin = {
  name: "eslint-sort-imports",
  rules: { "sort-imports": rule },
};

export default plugin;