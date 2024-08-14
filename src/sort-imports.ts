/**
 * @fileoverview Rule to require sorting of import declarations
 * @author Christian Schuller
 */

import { AST_NODE_TYPES, ESLintUtils, type TSESTree } from "@typescript-eslint/utils";

const createRule = ESLintUtils.RuleCreator((name) => name);

export enum MemberSyntaxSortOrder {
  None = "none",
  All = "all",
  Multiple = "multiple",
  Single = "single",
}

export type Options = [
  {
    ignoreCase?: boolean;
    ignoreMemberSort?: boolean;
    memberSyntaxSortOrder?: MemberSyntaxSortOrder[];
    typeSortStrategy?: "mixed" | "before" | "after";
  },
];

const defaultOptions: Options = [
  {
    ignoreCase: false,
    ignoreMemberSort: false,
    memberSyntaxSortOrder: [MemberSyntaxSortOrder.None, MemberSyntaxSortOrder.All, MemberSyntaxSortOrder.Multiple, MemberSyntaxSortOrder.Single],
    typeSortStrategy: "after",
  },
];

export type MessageIds = "memberAlphabetical" | "wrongOrder" | "typeOrder" | "alphabeticalOrder";

export const rule = createRule<Options, MessageIds>({
  name: "eslint-sort-imports",
  defaultOptions,
  meta: {
    docs: { description: "enforce sorted import declarations within modules" },
    messages: {
      memberAlphabetical: "Member '{{memberName}}' of the import declaration should be sorted alphabetically.",
      typeOrder: "Expected type imports '{{typeSortStrategy}}' all other imports.",
      wrongOrder: "Expected '{{syntaxA}}' syntax before '{{syntaxB}}' syntax.",
      alphabeticalOrder: "Imports should be sorted alphabetically.",
    },
    schema: [
      {
        type: "object",
        properties: {
          ignoreCase: { type: "boolean" },
          memberSyntaxSortOrder: {
            type: "array",
            items: {
              type: "string",
              enum: ["none", "all", "multiple", "single"],
            },
            uniqueItems: true,
            minItems: 4,
            maxItems: 4,
          },
          typeSortStrategy: {
            type: "string",
            enum: ["mixed", "before", "after"],
          },
          ignoreMemberSort: { type: "boolean" },
        },
        additionalProperties: false,
      },
    ],
    type: "layout",
    fixable: "code",
  },

  create(context) {
    const config = context.options[0];
    const ignoreCase = config?.ignoreCase ?? defaultOptions[0].ignoreCase!;
    const ignoreMemberSort = config?.ignoreMemberSort ?? defaultOptions[0].ignoreMemberSort!;
    const memberSyntaxSortOrder = config?.memberSyntaxSortOrder ?? defaultOptions[0].memberSyntaxSortOrder!;
    const typeSortStrategy = config?.typeSortStrategy ?? defaultOptions[0].typeSortStrategy!;

    const sourceCode = context.sourceCode;

    let previousDeclaration: TSESTree.ImportDeclaration | undefined = undefined;
    let initialSource: string | undefined = undefined;
    let allDeclarations = sourceCode.ast.body.filter((n) => n.type === "ImportDeclaration");

    function sortAndFixAllNodes(initial: string, nodes: TSESTree.ImportDeclaration[]) {
      const rich = nodes.map((node) => [node, initial.substring(node.range[0], node.range[1])] as const);
      const betweens = nodes.map((node, i) => (i !== nodes.length - 1 ? initial.substring(node.range[1], nodes[i + 1].range[0]) : null)).filter((n) => n !== null);

      const fixed = rich.map((n) => {
        const node = n[0];

        if (!ignoreMemberSort) {
          const importSpecifiers = node.specifiers.filter((specifier) => specifier.type === "ImportSpecifier");
          const firstUnsortedIndex = importSpecifiers.map((s) => getSortableName(s, ignoreCase)).findIndex((name, index, array) => array[index - 1] > name);

          if (firstUnsortedIndex !== -1) {
            const before = initial.substring(node.range[0], importSpecifiers[0].range[0]);
            const after = initial.substring(importSpecifiers[importSpecifiers.length - 1].range[1], node.range[1]);

            const between = importSpecifiers
              // Clone the importSpecifiers array to avoid mutating it
              .slice()
              // Sort the array into the desired order
              .sort((specifierA, specifierB) => {
                const aName = getSortableName(specifierA, ignoreCase);
                const bName = getSortableName(specifierB, ignoreCase);

                return aName > bName ? 1 : -1;
              })
              // Build a string out of the sorted list of import specifiers and the text between the originals
              .reduce((sourceText, specifier, index) => {
                const textAfterSpecifier = index === importSpecifiers.length - 1 ? "" : initial.slice(importSpecifiers[index].range[1], importSpecifiers[index + 1].range[0]);
                return sourceText + initial.substring.apply(initial, specifier.range) + textAfterSpecifier;
              }, "");

            return [node, `${before}${between}${after}`] as const;
          }
        }

        return n;
      });

      // Group by ImportDeclarations that are consecutive (no lines inbetween)
      const sections = fixed.reduce(
        (sections, current) => {
          const lastSection = sections[sections.length - 1];

          if (lastSection.length === 0) lastSection.push(current);
          else {
            const lastFixed = lastSection[lastSection.length - 1];
            if (isLineBetween(lastFixed[0], current[0])) sections.push([current]);
            else lastSection.push(current);
          }

          return sections;
        },
        [[]] as (readonly [TSESTree.ImportDeclaration, string])[][],
      );

      // Sort each grouping
      const sorted = sections
        .map((section) =>
          section.sort((a, b) => {
            const currentMemberSyntaxGroupIndex = getMemberParameterGroupIndex(b[0], memberSyntaxSortOrder);
            const currentMemberIsType = (b[0].importKind && b[0].importKind === "type") || false;
            const previousMemberSyntaxGroupIndex = getMemberParameterGroupIndex(a[0], memberSyntaxSortOrder);
            const previousMemberIsType = (a[0].importKind && a[0].importKind === "type") || false;

            let currentLocalMemberName = getFirstLocalMemberName(b[0]);
            let previousLocalMemberName = getFirstLocalMemberName(a[0]);

            if (ignoreCase) {
              previousLocalMemberName = previousLocalMemberName && previousLocalMemberName.toLowerCase();
              currentLocalMemberName = currentLocalMemberName && currentLocalMemberName.toLowerCase();
            }

            if (typeSortStrategy !== "mixed" && currentMemberIsType !== previousMemberIsType) {
              return (currentMemberIsType && typeSortStrategy === "before") || (previousMemberIsType && typeSortStrategy === "after") ? 1 : -1;
            }
            if (currentMemberSyntaxGroupIndex !== previousMemberSyntaxGroupIndex) {
              return currentMemberSyntaxGroupIndex < previousMemberSyntaxGroupIndex ? 1 : -1;
            } else if (previousLocalMemberName && currentLocalMemberName) {
              return currentLocalMemberName < previousLocalMemberName ? 1 : -1;
            }

            return 0;
          }),
        )
        .reduce((a, c) => a.concat(c), []); // Flatten groupings

      return sorted.map((n) => n[1]).reduce((done, current, i) => `${done}${i !== 0 ? betweens[i - 1] : ""}${current}`, "");
    }

    return {
      ImportDeclaration(node) {
        if (!initialSource) initialSource = sourceCode.getText();

        if (previousDeclaration && !isLineBetween(previousDeclaration, node)) {
          const currentMemberSyntaxGroupIndex = getMemberParameterGroupIndex(node, memberSyntaxSortOrder);
          const currentMemberIsType = (node.importKind && node.importKind === "type") || false;
          const previousMemberSyntaxGroupIndex = getMemberParameterGroupIndex(previousDeclaration, memberSyntaxSortOrder);
          const previousMemberIsType = (previousDeclaration.importKind && previousDeclaration.importKind === "type") || false;

          let currentLocalMemberName = getFirstLocalMemberName(node);
          let previousLocalMemberName = getFirstLocalMemberName(previousDeclaration);

          if (ignoreCase) {
            previousLocalMemberName = previousLocalMemberName.toLowerCase();
            currentLocalMemberName = currentLocalMemberName.toLowerCase();
          }

          // When the current declaration uses a different member syntax,
          // then check if the ordering is correct.
          // Otherwise, make a default string compare (like rule sort-vars to be consistent) of the first used local member name.
          if (typeSortStrategy !== "mixed" && currentMemberIsType !== previousMemberIsType) {
            if ((currentMemberIsType && typeSortStrategy === "before") || (previousMemberIsType && typeSortStrategy === "after")) {
              context.report({
                node,
                messageId: "typeOrder",
                data: { typeSortStrategy },
                fix(fixer) {
                  return fixer.replaceTextRange(
                    [allDeclarations[0].range[0], allDeclarations[allDeclarations.length - 1].range[1]],
                    sortAndFixAllNodes(initialSource!, allDeclarations),
                  );
                },
              });
            }
          } else if (currentMemberSyntaxGroupIndex !== previousMemberSyntaxGroupIndex) {
            if (currentMemberSyntaxGroupIndex < previousMemberSyntaxGroupIndex) {
              context.report({
                node,
                messageId: "wrongOrder",
                data: {
                  syntaxA: memberSyntaxSortOrder[currentMemberSyntaxGroupIndex],
                  syntaxB: memberSyntaxSortOrder[previousMemberSyntaxGroupIndex],
                },
                fix(fixer) {
                  return fixer.replaceTextRange(
                    [allDeclarations[0].range[0], allDeclarations[allDeclarations.length - 1].range[1]],
                    sortAndFixAllNodes(initialSource!, allDeclarations),
                  );
                },
              });
            }
          } else {
            if (previousLocalMemberName && currentLocalMemberName && currentLocalMemberName < previousLocalMemberName) {
              context.report({
                node,
                messageId: "alphabeticalOrder",
                fix(fixer) {
                  return fixer.replaceTextRange(
                    [allDeclarations[0].range[0], allDeclarations[allDeclarations.length - 1].range[1]],
                    sortAndFixAllNodes(initialSource!, allDeclarations),
                  );
                },
              });
            }
          }
        }

        // Multiple members of an import declaration should also be sorted alphabetically.

        if (!ignoreMemberSort) {
          const importSpecifiers = node.specifiers.filter((specifier) => specifier.type === AST_NODE_TYPES.ImportSpecifier);

          const firstUnsortedIndex = importSpecifiers.map((s) => getSortableName(s, ignoreCase)).findIndex((name, index, array) => array[index - 1] > name);

          if (firstUnsortedIndex !== -1) {
            context.report({
              node: importSpecifiers[firstUnsortedIndex],
              messageId: "memberAlphabetical",
              data: {
                memberName: importSpecifiers[firstUnsortedIndex].local.name,
              },
              fix(fixer) {
                const hasComments = importSpecifiers.some((specifier) => sourceCode.getCommentsBefore(specifier).length || sourceCode.getCommentsAfter(specifier).length);

                // If there are comments in the ImportSpecifier list, don't rearrange the specifiers.
                if (hasComments) return null;

                return fixer.replaceTextRange(
                  [allDeclarations[0].range[0], allDeclarations[allDeclarations.length - 1].range[1]],
                  sortAndFixAllNodes(initialSource!, allDeclarations),
                );
              },
            });
          }
        }

        previousDeclaration = node;
      },
    };
  },
});

function getSortableName(specifier: TSESTree.ImportSpecifier, ignoreCase: boolean) {
  if (ignoreCase) return specifier.local.name.toLowerCase();
  return specifier.local.name;
}

/**
 * Gets the used member syntax style.
 *
 * import "my-module.js" --> none
 * import * as myModule from "my-module.js" --> all
 * import {myMember} from "my-module.js" --> single
 * import {foo, bar} from  "my-module.js" --> multiple
 *
 */
function usedMemberSyntax(node: TSESTree.ImportDeclaration): MemberSyntaxSortOrder {
  switch (node.specifiers[0]?.type) {
    case AST_NODE_TYPES.ImportNamespaceSpecifier:
      return MemberSyntaxSortOrder.All;
    case AST_NODE_TYPES.ImportDefaultSpecifier:
      return MemberSyntaxSortOrder.Single;
    case AST_NODE_TYPES.ImportSpecifier:
      return MemberSyntaxSortOrder.Multiple;
    default:
      return MemberSyntaxSortOrder.None;
  }
}

/**
 * Gets the group by member parameter index for given declaration.
 * @param {ASTNode} node - the ImportDeclaration node.
 * @returns {number} the declaration group by member index.
 */
function getMemberParameterGroupIndex(node: TSESTree.ImportDeclaration, memberSyntaxSortOrder: MemberSyntaxSortOrder[]) {
  return memberSyntaxSortOrder.indexOf(usedMemberSyntax(node));
}

/**
 * Gets the local name of the first imported module.
 * @param {ASTNode} node - the ImportDeclaration node.
 * @returns {?string} the local name of the first imported module.
 */
function getFirstLocalMemberName(node: TSESTree.ImportDeclaration) {
  return node.specifiers.length ? node.specifiers[0].local.name : node.source.value;
}

/**
 * Gets if there are lines (empty or comments) between two nodes
 * @param {ASTNode} firstNode - the ImportDeclaration node.
 * @param {ASTNode} secondNode - the ImportDeclaration node.
 * @returns {boolean} if there are lines between the nodes.
 */
function isLineBetween(firstNode: TSESTree.ImportDeclaration, secondNode: TSESTree.ImportDeclaration) {
  return firstNode.loc.end.line < secondNode.loc.start.line - 1;
}
