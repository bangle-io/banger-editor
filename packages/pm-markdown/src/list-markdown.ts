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
 * and numbers ordered list items using an order stack.
 */

export type ListMarkdownPluginOptions = Record<string, never>;

export const listMarkdownPlugin: PluginWithOptions<
  ListMarkdownPluginOptions
> = (md, _options) => {
  // 1) After the "inline" rule, mark bullet vs. ordered lists.
  md.core.ruler.after('inline', 'bangle-list-kind-attrs', (state) => {
    const tokens = state.tokens;
    // Use a stack to track the current list kind for nested lists.
    const listKindStack: string[] = [];

    for (let i = 0; i < tokens.length; i++) {
      const token = tokens[i];
      if (!token) continue;

      if (isBulletListOpen(token)) {
        listKindStack.push('bullet');
        token.attrSet('data-bangle-list-kind', 'bullet');
      } else if (isOrderedListOpen(token)) {
        listKindStack.push('ordered');
        token.attrSet('data-bangle-list-kind', 'ordered');
      } else if (
        token.type === 'bullet_list_close' ||
        token.type === 'ordered_list_close'
      ) {
        if (listKindStack.length > 0) {
          listKindStack.pop();
        } else {
          console.warn('Unbalanced list tokens:', token.type);
        }
      } else if (token.type === 'list_item_open') {
        // Set the list kind for list items from the top of the stack.
        const currentListKind = listKindStack[listKindStack.length - 1];
        if (currentListKind && !token.attrGet('data-bangle-list-kind')) {
          token.attrSet('data-bangle-list-kind', currentListKind);
        }
      }
    }
    return false;
  });

  // 2) After the "inline" rule, detect if a list item is a todo/task.
  md.core.ruler.after('inline', 'bangle-task-lists', (state) => {
    const tokens = state.tokens;
    // Start at 2 because we reference tokens[i-1] and tokens[i-2].
    for (let i = 2; i < tokens.length; i++) {
      if (isTodoItem(tokens, i)) {
        convertToTaskItem(tokens, i);
      }
    }
    return false;
  });

  // 3) Override renderToken to ensure tasks render with the proper attributes.
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
            token.attrSet('data-bangle-list-kind', 'ordered');
            break;
          }
          case 'ordered_list_close': {
            orderStack.pop();
            break;
          }
          case 'list_item_open': {
            const currentOrder = orderStack[orderStack.length - 1];
            if (orderStack.length > 0 && currentOrder !== undefined) {
              token.attrSet('data-bangle-list-order', String(currentOrder));
              orderStack[orderStack.length - 1] = currentOrder + 1;
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
  const trimmed = content.trimStart();
  return (
    trimmed.startsWith('[ ] ') ||
    trimmed.startsWith('[x] ') ||
    trimmed.startsWith('[X] ')
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

  listItemOpen.attrSet('data-bangle-list-kind', 'task');

  // Iterate over inline children to find and remove the todo marker.
  for (const child of inlineToken.children) {
    if (child.type === 'text' && typeof child.content === 'string') {
      if (
        child.content.startsWith('[ ] ') ||
        child.content.startsWith('[x] ') ||
        child.content.startsWith('[X] ')
      ) {
        const isChecked = child.content[1]?.toLowerCase() === 'x';
        listItemOpen.attrSet(
          'data-bangle-task-checked',
          isChecked ? 'true' : 'false',
        );
        // Remove the leading "[ ] " or "[x] " marker.
        child.content = child.content.slice(4);
        break;
      }
    }
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
