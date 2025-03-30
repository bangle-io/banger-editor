import type { Command, EditorState, PMNode } from './pm';

import type { MarkdownSerializerState } from 'prosemirror-markdown';
import {
  type CollectionType,
  PRIORITY,
  collection,
  keybinding,
  setPriority,
} from './common';
import {
  type ListAttributes,
  type ListKind,
  backspaceCommand,
  createDedentListCommand,
  createIndentListCommand,
  createListPlugins,
  createListSpec,
  createMoveListCommand,
  createToggleListCommand,
  createUnwrapListCommand,
  deleteCommand,
  enterCommand,
  isListNode,
  wrappingListInputRule,
} from './pm';
import { inputRules } from './pm';
import { type PluginContext, findParentNode, getNodeType } from './pm-utils';

const LIST_KIND = {
  BULLET: 'bullet',
  ORDERED: 'ordered',
  TASK: 'task',
  TOGGLE: 'toggle',
} as const satisfies Record<string, ListKind>;

// Export the type for external use
export type ListKindType = (typeof LIST_KIND)[keyof typeof LIST_KIND];

/**
 * Helper to read typed list attributes from a node
 * Returns null if the node is not a list node
 */
function readListAttrs(node?: PMNode):
  | (ListAttributes & {
      kind: ListKindType;
      tight: boolean; // Changed from optional
      order?: number;
      checked?: boolean;
      collapsed?: boolean;
    })
  | null {
  if (!node || !isListNode(node)) {
    return null;
  }
  const { kind, checked, collapsed, order, tight = true } = node.attrs;
  return {
    kind,
    tight,
    ...(kind === LIST_KIND.TASK ? { checked } : {}),
    ...(kind === LIST_KIND.TOGGLE ? { collapsed } : {}),
    ...(kind === LIST_KIND.ORDERED ? { order } : {}),
  };
}

type ListConfig = {
  listNodeName?: string;

  keyBackspaceList?: string | false;
  keyDedentList?: string | false;
  keyDeleteList?: string | false;
  keyIndentList?: string | false;
  keyMoveListDown?: string | false;
  keyMoveListUp?: string | false;
  keyToggleBulletList?: string | false;
  keyToggleOrderedList?: string | false;
  keyToggleTaskList?: string | false;
  keyToggleToggleList?: string | false;
  keyUnwrapList?: string | false;
  keyToggleTaskChecked?: string | false;
};

type RequiredConfig = Required<ListConfig>;

const DEFAULT_CONFIG: RequiredConfig = {
  listNodeName: 'list',
  keyBackspaceList: 'Backspace',
  keyDedentList: 'Shift-Tab',
  keyDeleteList: 'Delete',
  keyIndentList: 'Tab',
  keyMoveListDown: 'Alt-ArrowDown',
  keyMoveListUp: 'Alt-ArrowUp',
  keyToggleBulletList: 'Mod-Shift-8',
  keyToggleOrderedList: 'Mod-Shift-9',
  keyToggleTaskList: 'Mod-Shift-7',
  keyToggleToggleList: 'Mod-Shift-6',
  keyUnwrapList: 'Shift-Mod-0',
  keyToggleTaskChecked: 'Mod-Enter',
};

export function setupList(userConfig: Partial<ListConfig> = {}) {
  const config = {
    ...DEFAULT_CONFIG,
    ...userConfig,
  };

  const { listNodeName } = config;
  const nodeSpec = {
    [listNodeName]: setPriority(createListSpec(), PRIORITY.listSpec),
  };

  const plugin = {
    inputRules: pluginInputRules(config),
    keybindings: pluginKeybindings(config),
    listPlugins: ({ schema }: PluginContext) => createListPlugins({ schema }),
  };

  return collection({
    id: listNodeName,
    nodes: nodeSpec,
    plugin,
    command: {
      dedentList: dedentList(config),
      indentList: indentList(config),
      moveListDown: moveListDown(config),
      moveListUp: moveListUp(config),
      toggleBulletList: toggleBulletList(config),
      toggleOrderedList: toggleOrderedList(config),
      toggleTaskList: toggleTaskList(config),
      toggleToggleList: toggleToggleList(config),
      unwrapList: unwrapList(config),
      toggleTaskChecked: toggleTaskChecked(config),
    },
    query: {
      isBulletListActive: isBulletListActive(config),
      isInsideList: isInsideList(config),
      isOrderedListActive: isOrderedListActive(config),
      isTaskListActive: isTaskListActive(config),
      isToggleListActive: isToggleListActive(config),
    },
    markdown: markdown(config),
  });
}

// PLUGINS
function pluginInputRules(_config: RequiredConfig) {
  return () => {
    return inputRules({
      rules: [
        // Ensure tight is set to true for new lists created via input rules
        wrappingListInputRule(/^\s*([-*])\s$/, {
          kind: LIST_KIND.BULLET,
          tight: true,
        }),
        wrappingListInputRule(/^(\d+)\.\s$/, {
          kind: LIST_KIND.ORDERED,
          order: 1,
          tight: true,
        }),
        wrappingListInputRule(/^\s*(\[([ |x])\])\s$/, (match) => ({
          kind: LIST_KIND.TASK,
          checked: match.match[2]?.toLowerCase() === 'x',
          tight: true,
        })),
        // wrappingListInputRule(/^\s*(>)\s$/, {
        //   kind: LIST_KIND.TOGGLE,
        //   collapsed: true,
        //   tight: true,
        // }),
      ],
    });
  };
}

function pluginKeybindings(config: RequiredConfig) {
  return keybinding(
    [
      ['Enter', enterCommand],
      [config.keyBackspaceList, backspaceCommand],
      ['Delete', deleteCommand],
      [config.keyDedentList, dedentList(config)],
      [config.keyIndentList, indentList(config)],
      [config.keyMoveListDown, moveListDown(config)],
      [config.keyMoveListUp, moveListUp(config)],
      [config.keyToggleBulletList, toggleBulletList(config)],
      [config.keyToggleOrderedList, toggleOrderedList(config)],
      [config.keyToggleTaskList, toggleTaskList(config)],
      [config.keyToggleToggleList, toggleToggleList(config)],
      [config.keyUnwrapList, unwrapList(config)],
      [config.keyToggleTaskChecked, toggleTaskChecked(config)],
    ],
    'list',
  );
}

// COMMANDS
function toggleBulletList(_config: RequiredConfig): Command {
  return (state, dispatch) => {
    // Default new lists to tight
    return createToggleListCommand({ kind: LIST_KIND.BULLET, tight: true })(
      state,
      dispatch,
    );
  };
}

function toggleOrderedList(_config: RequiredConfig): Command {
  return (state, dispatch) => {
    // Default new lists to tight
    return createToggleListCommand({
      kind: LIST_KIND.ORDERED,
      order: 1,
      tight: true,
    })(state, dispatch);
  };
}

function toggleTaskList(_config: RequiredConfig): Command {
  return (state, dispatch) => {
    // Default new lists to tight
    return createToggleListCommand({
      kind: LIST_KIND.TASK,
      checked: false,
      tight: true,
    })(state, dispatch);
  };
}

// ignoring the toggle list for this task, but we keep the placeholder
function toggleToggleList(_config: RequiredConfig): Command {
  return (state, dispatch) => {
    // Default new lists to tight
    return createToggleListCommand({
      kind: LIST_KIND.TOGGLE,
      collapsed: true,
      tight: true,
    })(state, dispatch);
  };
}

function indentList(_config: RequiredConfig): Command {
  return createIndentListCommand();
}

function dedentList(_config: RequiredConfig): Command {
  return createDedentListCommand();
}

function moveListUp(_config: RequiredConfig): Command {
  return createMoveListCommand('up');
}

function moveListDown(_config: RequiredConfig): Command {
  return createMoveListCommand('down');
}

function unwrapList(_config: RequiredConfig): Command {
  return createUnwrapListCommand();
}

function toggleTaskChecked(config: RequiredConfig): Command {
  return (state, dispatch) => {
    const { listNodeName } = config;

    const type = getNodeType(state.schema, listNodeName);
    const parent = findParentNode(
      (node: PMNode) => isListNode(node) && node.type === type,
    )(state.selection);

    if (!parent) {
      return false;
    }

    const attrs = readListAttrs(parent.node);

    // Only work if we're in a task list
    if (!attrs || attrs.kind !== LIST_KIND.TASK) {
      return false;
    }

    if (dispatch) {
      const tr = state.tr;
      const checked = !attrs.checked;
      tr.setNodeMarkup(parent.pos, null, { ...parent.node.attrs, checked });
      dispatch(tr);
    }

    return true;
  };
}

// QUERIES
function isBulletListActive(config: RequiredConfig) {
  return (state: EditorState) => {
    const { listNodeName } = config;
    const type = getNodeType(state.schema, listNodeName);
    const result = findParentNode(
      (node: PMNode) => isListNode(node) && node.type === type,
    )(state.selection);
    const attrs = result ? readListAttrs(result.node) : null;
    return Boolean(attrs?.kind === LIST_KIND.BULLET);
  };
}

function isOrderedListActive(config: RequiredConfig) {
  return (state: EditorState) => {
    const { listNodeName } = config;
    const type = getNodeType(state.schema, listNodeName);
    const result = findParentNode(
      (node: PMNode) => isListNode(node) && node.type === type,
    )(state.selection);
    const attrs = result ? readListAttrs(result.node) : null;
    return Boolean(attrs?.kind === LIST_KIND.ORDERED);
  };
}

function isTaskListActive(config: RequiredConfig) {
  return (state: EditorState) => {
    const { listNodeName } = config;
    const type = getNodeType(state.schema, listNodeName);
    const result = findParentNode(
      (node: PMNode) => isListNode(node) && node.type === type,
    )(state.selection);
    const attrs = result ? readListAttrs(result.node) : null;
    return Boolean(attrs?.kind === LIST_KIND.TASK);
  };
}

function isToggleListActive(config: RequiredConfig) {
  return (state: EditorState) => {
    const { listNodeName } = config;
    const type = getNodeType(state.schema, listNodeName);
    const result = findParentNode(
      (node: PMNode) => isListNode(node) && node.type === type,
    )(state.selection);
    const attrs = result ? readListAttrs(result.node) : null;
    return Boolean(attrs?.kind === LIST_KIND.TOGGLE);
  };
}

function isInsideList(config: RequiredConfig) {
  return (state: EditorState) => {
    const { listNodeName } = config;
    const type = getNodeType(state.schema, listNodeName);

    const result = findParentNode((node: PMNode) => node.type === type)(
      state.selection,
    );
    return Boolean(result);
  };
}

/**
 * Provides ProseMirror's parse and serialize handling for bullet, ordered,
 * and task lists. Toggle list is ignored in the parse/serialize logic.
 */
function markdown(config: RequiredConfig): CollectionType['markdown'] {
  const { listNodeName } = config;
  return {
    nodes: {
      [listNodeName]: {
        // For serialization:
        toMarkdown: (state, node, parent, index) => {
          const attrs = readListAttrs(node);
          // Default to tight=true if attribute is missing for some reason
          const tight = attrs?.tight ?? true;
          flatListToMarkdown(state, node, parent ?? null, index ?? 0, 0, tight);
        },
        // For parsing:
        parseMarkdown: {
          bullet_list: {
            // We ignore the list container tokens
            ignore: true,
          },
          ordered_list: {
            // We ignore the list container tokens
            ignore: true,
          },
          list_item: {
            block: listNodeName,
            getAttrs: (tok) => {
              const kind = tok.attrGet('data-bangle-list-kind');
              // Read the tight attribute set by the plugin, default to true if missing
              const tightAttr = tok.attrGet('data-bangle-list-tight');
              const tight = tightAttr === 'true'; // Convert string 'true'/'false' to boolean

              const baseAttrs = { kind, tight };

              if (kind === LIST_KIND.TASK) {
                const checked =
                  tok.attrGet('data-bangle-task-checked') === 'true';
                return { ...baseAttrs, kind: LIST_KIND.TASK, checked };
              }
              if (kind === LIST_KIND.ORDERED) {
                const orderStr = tok.attrGet('data-bangle-list-order');
                const order = orderStr ? Number.parseInt(orderStr, 10) : 1; // Default order to 1 if missing
                return {
                  ...baseAttrs,
                  kind: LIST_KIND.ORDERED,
                  // Ensure order is a number, default to 1 if NaN
                  order: Number.isNaN(order) ? 1 : order,
                };
              }

              // Default case (bullet or unknown treated as bullet)
              return { ...baseAttrs, kind: LIST_KIND.BULLET };
            },
          },
        },
      },
    },
  };
}

function flatListToMarkdown(
  state: MarkdownSerializerState,
  node: PMNode,
  parent: PMNode | null,
  index: number,
  level: number,
  tight: boolean, // Receive tight status explicitly
) {
  // 1) Add a blank line before this item *only if* the list is loose (tight === false)
  //    and it's not the very first item in the entire list structure (parent check needed).
  maybeAddBlankLine(state, parent, index, tight);

  // 2) Determine bullet/marker
  let marker = '-';
  const attrs = readListAttrs(node); // Use helper to get validated attrs
  if (attrs?.kind === LIST_KIND.ORDERED) {
    // Use order from attrs, default to 1 if somehow missing
    marker = `${attrs.order ?? 1}.`;
  } else if (attrs?.kind === LIST_KIND.TASK) {
    marker = attrs.checked ? '- [x]' : '- [ ]';
  }

  // 3) Calculate indentation
  //    CommonMark standard indent is 4 spaces for nested lists.
  const baseIndent = '    '.repeat(level);

  // 4) Wrap each list(...) node as one item.
  const firstDelim = `${baseIndent}${marker} `;
  // Subsequent lines should align with the *content* after the marker.
  // This is typically the length of the first delimiter string.
  const subsequentIndent = baseIndent + ' '.repeat(marker.length + 1);

  state.wrapBlock(
    subsequentIndent, // subsequent lines indent
    firstDelim, // first line delimiter
    node,
    () => {
      // Render child nodes that are NOT list nodes themselves
      node.forEach((child, _childOffset, childIndex) => {
        if (child.type.name !== node.type.name) {
          // Add a newline between paragraphs *within* a loose list item
          if (!tight && childIndex > 0 && child.type.name === 'paragraph') {
            // Check previous non-list sibling was also paragraph? Might be too complex.
            // Let's rely on the block separation logic within renderContent for now.
            // state.ensureNewLine(); // Might add too many lines
          }
          state.render(child, node, childIndex);
        }
      });
    },
  );

  // 5) Recursively render child list nodes (nested lists)
  node.forEach((child, _childOffset, childIndex) => {
    if (child.type.name === node.type.name) {
      const childAttrs = readListAttrs(child);
      const childTight = childAttrs?.tight ?? true; // Pass down tight status
      flatListToMarkdown(
        state,
        child,
        node, // Current node is the parent for the recursive call
        childIndex,
        level + 1, // Increment level
        childTight,
      );
    }
  });
}

/**
 * Adds a blank line before a list item if necessary (i.e., if the list is loose).
 */
function maybeAddBlankLine(
  state: MarkdownSerializerState,
  parent: PMNode | null,
  index: number,
  tight: boolean,
) {
  // If the list is tight, NEVER add a blank line between items.
  if (tight) {
    return;
  }

  // If the list is loose, add a blank line before every item *except* the very first one.
  // The check `parent && index > 0` ensures it's not the first item within its direct parent list.
  // We might need more sophisticated checks if mixing list types, but this covers loose lists.
  if (parent && index > 0) {
    state.write('\n'); // Write a blank line
  }
  // Ensure we are on a new line before writing the item marker, regardless of tight/loose.
  // This handles cases after block elements like code blocks.
  state.ensureNewLine();
}

// Removed unused isSeparateBlock function
