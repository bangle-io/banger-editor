import type { PluginWithOptions } from 'markdown-it';
import type Token from 'markdown-it/lib/token.mjs';

/**
 * This plugin customizes how bullet, ordered, and task lists are parsed
 * and rendered. It detects todo/task items (by looking for a leading
 * "[ ] ", "[x] ", or "[X] ") in list items after inline processing,
 * then marks those list items with data-bangle-list-kind="task" and
 * data-bangle-task-checked accordingly.
 *
 * The plugin also assigns list kinds for bullet and ordered lists,
 * captures the list's 'tight' status, and numbers ordered list items
 * using an order stack.
 */

export type ListMarkdownPluginOptions = Record<string, never>;

export const listMarkdownPlugin: PluginWithOptions<
  ListMarkdownPluginOptions
> = (md, _options) => {
  // 1) After the "inline" rule, mark bullet vs. ordered lists and capture tightness.
  md.core.ruler.after('inline', 'bangle-list-kind-attrs', (state) => {
    const tokens = state.tokens;
    // Use a stack to track the current list kind and tightness for nested lists.
    const listInfoStack: Array<{ kind: string; tight: boolean }> = [];

    for (let i = 0; i < tokens.length; i++) {
      const token = tokens[i];
      if (!token) continue;

      const isBulletOpen = isBulletListOpen(token);
      const isOrderedOpen = isOrderedListOpen(token);

      if (isBulletOpen || isOrderedOpen) {
        const kind = isBulletOpen ? 'bullet' : 'ordered';
        // Markdown-it stores 'tight' status on the list opening token.
        const tight = token.attrGet('tight') === 'true'; // Or check token.tight directly if available and reliable
        listInfoStack.push({ kind, tight });
        token.attrSet('data-bangle-list-kind', kind);
        // We don't need to set tight on the list token itself, but capture it for items.
      } else if (
        token.type === 'bullet_list_close' ||
        token.type === 'ordered_list_close'
      ) {
        if (listInfoStack.length > 0) {
          listInfoStack.pop();
        } else {
          console.warn('Unbalanced list tokens:', token.type);
        }
      } else if (token.type === 'list_item_open') {
        // Set the list kind and tightness for list items from the top of the stack.
        const currentListInfo = listInfoStack[listInfoStack.length - 1];
        if (currentListInfo) {
          if (!token.attrGet('data-bangle-list-kind')) {
            token.attrSet('data-bangle-list-kind', currentListInfo.kind);
          }
          // Set the tight attribute based on the parent list's status
          token.attrSet(
            'data-bangle-list-tight',
            String(currentListInfo.tight),
          );
        }
      }
    }
    return false;
  });

  // 2) After the "inline" rule, detect if a list item is a todo/task.
  //    This needs to run *after* bangle-list-kind-attrs potentially sets the kind.
  md.core.ruler.after(
    'bangle-list-kind-attrs',
    'bangle-task-lists',
    (state) => {
      const tokens = state.tokens;
      // Start at 2 because we reference tokens[i-1] and tokens[i-2].
      for (let i = 2; i < tokens.length; i++) {
        if (isTodoItem(tokens, i)) {
          // Pass the list_item_open token (i-2) to modify its attributes
          convertToTaskItem(tokens, i);
        }
      }
      return false;
    },
  );

  // 3) Override renderToken to ensure tasks render with the proper attributes.
  //    (This affects HTML rendering if using markdown-it directly, less relevant for PM parsing)
  const originalRenderToken = md.renderer.renderToken.bind(md.renderer);
  md.renderer.renderToken = (tokens, idx, options) => {
    const token = tokens[idx];
    if (token?.type === 'list_item_open') {
      const kindAttr = token.attrGet('data-bangle-list-kind');
      if (kindAttr === 'task') {
        const checkedAttr =
          token.attrGet('data-bangle-task-checked') || 'false';
        token.attrSet('data-bangle-task-checked', checkedAttr);
      }
      // We could add tight attribute rendering here if needed for direct HTML output
      // const tightAttr = token.attrGet('data-bangle-list-tight');
      // if (tightAttr) { token.attrSet('data-tight', tightAttr); }
    }
    return originalRenderToken(tokens, idx, options);
  };

  // 4) After task-lists, handle ordered list numbering using an orderStack.
  md.core.ruler.after(
    'bangle-task-lists',
    'bangle-ordered-list-order',
    (state) => {
      const tokens = state.tokens;
      const orderStack: number[] = [];

      for (const token of tokens) {
        switch (token.type) {
          case 'ordered_list_open': {
            let start = 1;
            const startAttr = token.attrGet('start');
            if (startAttr != null && !Number.isNaN(Number(startAttr))) {
              start = Number.parseInt(startAttr, 10);
            } else if (token.markup) {
              // token.markup is expected to be something like "2." or "2)"
              const match = token.markup.match(/^(\d+)/);
              // biome-ignore lint/style/noNonNullAssertion: <explanation>
              start = match ? Number.parseInt(match[1]!, 10) : 1;
            }
            orderStack.push(start);
            // Ensure kind is set if not already
            if (!token.attrGet('data-bangle-list-kind')) {
              token.attrSet('data-bangle-list-kind', 'ordered');
            }
            break;
          }
          case 'ordered_list_close': {
            orderStack.pop();
            break;
          }
          case 'list_item_open': {
            // Only apply order if the item belongs to an ordered list
            if (token.attrGet('data-bangle-list-kind') === 'ordered') {
              const currentOrder = orderStack[orderStack.length - 1];
              if (orderStack.length > 0 && currentOrder !== undefined) {
                token.attrSet('data-bangle-list-order', String(currentOrder));
                orderStack[orderStack.length - 1] = currentOrder + 1;
              }
            }
            break;
          }
          default:
            break;
        }
      }
      return false;
    },
  );
};

// ----------------- Helper Functions -----------------

function isOrderedListOpen(token?: Token): boolean {
  return token?.type === 'ordered_list_open';
}

function isBulletListOpen(token?: Token): boolean {
  return token?.type === 'bullet_list_open';
}

function isTodoItem(tokens: Token[], index: number): boolean {
  if (index < 2) return false;
  const inlineToken = tokens[index];
  const paragraphToken = tokens[index - 1];
  const listItemToken = tokens[index - 2];
  if (!inlineToken || !paragraphToken || !listItemToken) return false;

  // Check if the list item is already marked as 'task' - if so, skip reprocessing
  if (listItemToken.attrGet('data-bangle-list-kind') === 'task') {
    return false;
  }

  return (
    isInline(inlineToken) &&
    isParagraphOpen(paragraphToken) &&
    isListItemOpen(listItemToken) &&
    startsWithTodoMarkdown(inlineToken.content)
  );
}

/**
 * Checks whether the provided content starts with a todo marker.
 */
function startsWithTodoMarkdown(content?: string): boolean {
  if (!content) return false;
  // Don't trim here, the marker must be at the very beginning of the paragraph content
  // const trimmed = content.trimStart();
  return (
    content.startsWith('[ ] ') ||
    content.startsWith('[x] ') ||
    content.startsWith('[X] ')
  );
}

/**
 * Converts a list item to a task item by:
 *  - Marking it as a task (data-bangle-list-kind="task")
 *  - Determining its checked state
 *  - Removing the todo marker from its inline content.
 */
function convertToTaskItem(tokens: Token[], index: number) {
  if (index < 2) return;
  const listItemOpen = tokens[index - 2];
  const inlineToken = tokens[index];
  if (
    !listItemOpen ||
    !inlineToken ||
    !inlineToken.children ||
    inlineToken.children.length === 0
  )
    return;

  // Find the first text child to check for the marker
  const firstTextChild = inlineToken.children.find(
    (child) => child.type === 'text',
  );
  if (!firstTextChild || typeof firstTextChild.content !== 'string') return;

  let markerFound = false;
  let isChecked = false;

  if (firstTextChild.content.startsWith('[ ] ')) {
    markerFound = true;
    isChecked = false;
  } else if (
    firstTextChild.content.startsWith('[x] ') ||
    firstTextChild.content.startsWith('[X] ')
  ) {
    markerFound = true;
    isChecked = true;
  }

  if (markerFound) {
    // Set attributes on the list_item_open token
    listItemOpen.attrSet('data-bangle-list-kind', 'task');
    listItemOpen.attrSet(
      'data-bangle-task-checked',
      isChecked ? 'true' : 'false',
    );

    // Remove the leading "[ ] " or "[x] " marker from the text content.
    firstTextChild.content = firstTextChild.content.slice(4);

    // If the text node becomes empty, remove it (optional, depends on desired behavior)
    // if (firstTextChild.content === '') {
    //   inlineToken.children.shift(); // Assumes it's the first child
    // }
  }
}

function isInline(token?: Token): boolean {
  return token?.type === 'inline';
}

function isParagraphOpen(token?: Token): boolean {
  return token?.type === 'paragraph_open';
}

function isListItemOpen(token?: Token): boolean {
  return token?.type === 'list_item_open';
}
