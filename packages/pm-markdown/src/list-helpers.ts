import type Token from 'markdown-it/lib/token.mjs';

// NOTE this is broken and doesnt really work
export function getListItemSpacing(
  tokenIndex: number,
  tokens: Token[],
): 'thick' | 'thin' {
  const token = tokens[tokenIndex];
  if (!token || token.type !== 'list_item_open') {
    return 'thin';
  }

  // Determine the boundaries of this list item by finding its matching "list_item_close".
  let closeIndex = tokenIndex;
  const baseLevel = token.level;
  for (let i = tokenIndex + 1; i < tokens.length; i++) {
    if (
      tokens[i] &&
      tokens[i]?.type === 'list_item_close' &&
      tokens[i]?.level === baseLevel
    ) {
      closeIndex = i;
      break;
    }
  }

  // Gather the direct child block tokens (opening tokens) that have a .map.
  // (We consider only tokens with level === baseLevel+1 and a type ending in "_open".)
  const children: Token[] = [];
  for (let i = tokenIndex + 1; i < closeIndex; i++) {
    if (
      tokens[i] &&
      tokens[i]?.level === baseLevel + 1 &&
      tokens[i]?.map &&
      tokens[i]?.type.endsWith('_open')
    ) {
      // biome-ignore lint/style/noNonNullAssertion: <explanation>
      children.push(tokens[i]!);
    }
  }

  // If more than one direct block exists, mark the item as "thick".
  if (children.length > 1) {
    return 'thick';
  }

  // If there is exactly one block-level child and we have map info for the list item,
  // check for extra blank lines (using the .map values) in a way that depends on whether
  // the list item is the first or last among its siblings.
  if (children.length === 1 && token.map) {
    const child = children[0];
    if (!child) {
      return 'thin';
    }
    if (!child.map) {
      return 'thin';
    }
    const itemStart = token.map[0];
    const itemEnd = token.map[1];
    const childStart = child.map[0];
    const childEnd = child.map[1];

    // Determine whether this list item has previous or next siblings.
    let isFirst = true;
    let isLast = true;

    // Check backwards for a sibling "list_item_open" at the same level.
    for (let i = tokenIndex - 1; i >= 0; i--) {
      const currentToken = tokens[i];
      if (
        currentToken &&
        currentToken.type === 'list_item_open' &&
        currentToken.level === baseLevel
      ) {
        isFirst = false;
        break;
      }
      if (currentToken && currentToken.level < baseLevel) break;
    }

    // Check forwards for a sibling "list_item_open" at the same level.
    for (let i = closeIndex + 1; i < tokens.length; i++) {
      const currentToken = tokens[i];
      if (
        currentToken &&
        currentToken.type === 'list_item_open' &&
        currentToken.level === baseLevel
      ) {
        isLast = false;
        break;
      }
      if (currentToken && currentToken.level < baseLevel) break;
    }

    // For the first item (with no previous sibling), check only the gap after the child block.
    // For the last item (with no next sibling), check only the gap before the child block.
    // For middle items, check both gaps.
    if (!isFirst && isLast) {
      if (childStart - itemStart >= 1) {
        return 'thick';
      }
    } else if (isFirst && !isLast) {
      if (itemEnd - childEnd >= 1) {
        return 'thick';
      }
    } else if (!isFirst && !isLast) {
      if (childStart - itemStart >= 1 || itemEnd - childEnd >= 1) {
        return 'thick';
      }
    }
    // If the list item is the only one (both first and last), ignore the gaps.
  }

  return 'thin';
}
