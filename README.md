# @j4cobi/eslint-plugin-sort-imports

An updated fork of [eslint-plugin-sort-imports-es6-autofix](https://github.com/marudor/eslint-plugin-sort-imports-es6-autofix).

An ESLint rule that can auto fix ES6 import sorting issues. It accepts the same options as the [original rule](http://eslint.org/docs/rules/sort-imports), but the `multiple` type corresponds to all named imports (regardless of how many are imported), while the `single` type corresponds only to default imports.

This rule respects whitespace and comments between imports by only looking at the order of (and sorting) consecutive import statements (those without newlines/comments in between them).

This fork also fixes the import order on eslint --fix.
To avoid problems, it will only switch out the import statements, not comments on the same line, etc.

## Invalid Code
```ts
import fastify from "fastify";
import { useState } from "react";
import * as lodash from "lodash";
import { join } from "node:path";
import "./do-something";
```
## Correct Code
```ts
import * as lodash from "lodash";
import fastify from "fastify";
import { join } from "node:path";
import { useState } from "react";
import "./do-something";
```

# Compatibility
- ESLint v9
- TypeScript ESlint v8

## Usage

Install the package  with
`npm i --save-dev @j4cobi/eslint-plugin-sort-imports`

Then add `@j4cobi/eslint-plugin-sort-imports` to the plugins section of your `eslint.config.js` config.
```js
import  sortImports from "@j4cobi/eslint-plugin-sort-imports";

export default [
  {
    plugins: { "sort-imports": sortImports },
    rules: {
      "sort-imports/sort-imports": [
        "error",
        {
          ignoreCase: false,
          ignoreMemberSort: false,
          memberSyntaxSortOrder: ["all", "single", "multiple", "none"],
        },
      ]
    }
  }
];
```
