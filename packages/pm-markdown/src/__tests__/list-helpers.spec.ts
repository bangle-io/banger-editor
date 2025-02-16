// getListItemSpacing.test.ts

import MarkdownIt from 'markdown-it';
import type Token from 'markdown-it/lib/token.mjs';
import { describe, expect, test } from 'vitest';
import { getListItemSpacing } from '../list-helpers';

/**
 * Helper function that takes a markdown string, parses it with MarkdownIt,
 * and returns an array of objects containing the list item content and spacing.
 */
function getListItemDetails(
  markdown: string,
): Array<{ content: string; spacing: string }> {
  const md = new MarkdownIt();
  const tokens: Token[] = md.parse(markdown, {});

  // Debug: Log the tokens to understand their structure (for test development)
  // console.log(
  //   'Tokens:',
  //   tokens.map((t) => ({
  //     type: t.type,
  //     content: t.content,
  //     map: t.map,
  //     // @ts-ignore
  //     tight: t.tight,
  //     level: t.level,
  //   })),
  // );

  const items: Array<{ content: string; spacing: string }> = [];
  for (let i = 0; i < tokens.length; i++) {
    if (tokens[i]?.type === 'list_item_open') {
      // Find the inline content token for this list item
      let j = i + 1;
      while (j < tokens.length && tokens[j]?.type !== 'inline') {
        j++;
      }
      const content = j < tokens.length ? tokens[j]?.content || '' : '';
      items.push({
        content,
        spacing: getListItemSpacing(i, tokens),
      });
    }
  }
  return items;
}

describe('getListItemSpacing', () => {
  test('tight list items (no blank lines)', () => {
    const markdown = `- item one
- item two
- item three`;
    expect(getListItemDetails(markdown)).toMatchInlineSnapshot(`
      [
        {
          "content": "item one",
          "spacing": "thin",
        },
        {
          "content": "item two",
          "spacing": "thin",
        },
        {
          "content": "item three",
          "spacing": "thin",
        },
      ]
    `);
  });

  test('loose list items (blank lines between items)', () => {
    const markdown = `- item one

- item two

- item three`;
    expect(getListItemDetails(markdown)).toMatchInlineSnapshot(`
      [
        {
          "content": "item one",
          "spacing": "thick",
        },
        {
          "content": "item two",
          "spacing": "thick",
        },
        {
          "content": "item three",
          "spacing": "thin",
        },
      ]
    `);
  });

  test('list item with multiple paragraphs', () => {
    const markdown = `- paragraph one

  paragraph two`;
    expect(getListItemDetails(markdown)).toMatchInlineSnapshot(`
      [
        {
          "content": "paragraph one",
          "spacing": "thick",
        },
      ]
    `);
  });

  test('nested list items - tight', () => {
    const markdown = `- item 1
  - nested item 1
  - nested item 2
- item 2`;
    expect(getListItemDetails(markdown)).toMatchInlineSnapshot(`
      [
        {
          "content": "item 1",
          "spacing": "thick",
        },
        {
          "content": "nested item 1",
          "spacing": "thin",
        },
        {
          "content": "nested item 2",
          "spacing": "thin",
        },
        {
          "content": "item 2",
          "spacing": "thin",
        },
      ]
    `);
  });

  test('nested list items - loose parent, tight child', () => {
    const markdown = `- item 1

  - nested item 1
  - nested item 2

- item 2`;
    expect(getListItemDetails(markdown)).toMatchInlineSnapshot(`
      [
        {
          "content": "item 1",
          "spacing": "thick",
        },
        {
          "content": "nested item 1",
          "spacing": "thin",
        },
        {
          "content": "nested item 2",
          "spacing": "thin",
        },
        {
          "content": "item 2",
          "spacing": "thin",
        },
      ]
    `);
  });

  test('nested list items - tight parent, loose child', () => {
    const markdown = `- item 1
  - nested item 1

    - deeply nested item 1
  - nested item 2
- item 2`;
    expect(getListItemDetails(markdown)).toMatchInlineSnapshot(`
      [
        {
          "content": "item 1",
          "spacing": "thick",
        },
        {
          "content": "nested item 1",
          "spacing": "thick",
        },
        {
          "content": "deeply nested item 1",
          "spacing": "thin",
        },
        {
          "content": "nested item 2",
          "spacing": "thin",
        },
        {
          "content": "item 2",
          "spacing": "thin",
        },
      ]
    `);
  });

  test('nested list items - loose parent and loose child', () => {
    const markdown = `- item 1

  - nested item 1

    - deeply nested item 1

  - nested item 2

- item 2`;
    expect(getListItemDetails(markdown)).toMatchInlineSnapshot(`
      [
        {
          "content": "item 1",
          "spacing": "thick",
        },
        {
          "content": "nested item 1",
          "spacing": "thick",
        },
        {
          "content": "deeply nested item 1",
          "spacing": "thin",
        },
        {
          "content": "nested item 2",
          "spacing": "thin",
        },
        {
          "content": "item 2",
          "spacing": "thin",
        },
      ]
    `);
  });

  test('single item list - tight', () => {
    const markdown = '- item one';
    expect(getListItemDetails(markdown)).toMatchInlineSnapshot(`
      [
        {
          "content": "item one",
          "spacing": "thin",
        },
      ]
    `);
  });

  test('single item list - loose (with blank line after)', () => {
    const markdown = `- item one

`;
    expect(getListItemDetails(markdown)).toMatchInlineSnapshot(`
      [
        {
          "content": "item one",
          "spacing": "thin",
        },
      ]
    `);
  });

  test('ordered list - tight', () => {
    const markdown = `1. item one
2. item two`;
    expect(getListItemDetails(markdown)).toMatchInlineSnapshot(`
      [
        {
          "content": "item one",
          "spacing": "thin",
        },
        {
          "content": "item two",
          "spacing": "thin",
        },
      ]
    `);
  });

  test('ordered list - loose', () => {
    const markdown = `1. item one

2. item two`;
    expect(getListItemDetails(markdown)).toMatchInlineSnapshot(`
      [
        {
          "content": "item one",
          "spacing": "thick",
        },
        {
          "content": "item two",
          "spacing": "thin",
        },
      ]
    `);
  });
});
