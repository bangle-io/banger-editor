import { describe, it, expect } from 'vitest';
import { setupBase } from 'banger-editor/base';
import { resolve } from 'banger-editor/common';
import { setupHeading } from 'banger-editor/heading';
import { setupParagraph } from 'banger-editor/paragraph';
import { markdownLoader } from '../markdown';
import { defaultTokenizers } from '../tokenizer';
import { Schema } from 'prosemirror-model';
import type { PMNode } from 'banger-editor/pm';
import {
  builders as createBuilders,
  type NodeBuilder,
} from 'prosemirror-test-builder';
import { setupBlockquote } from 'banger-editor/blockquote';
import { setupCode } from 'banger-editor/code';
import { setupCodeBlock } from 'banger-editor/code-block';
import { setupBold } from 'banger-editor/bold';
import { setupItalic } from 'banger-editor/italic';
import { setupStrike } from 'banger-editor/strike';
import { setupList } from 'banger-editor/list';
import { setupHardBreak } from 'banger-editor/hard-break';
import { setupImage } from 'banger-editor/image';
import { setupLink } from 'banger-editor/link';

interface EditorTestContext {
  parse: (content: string) => PMNode;
  serialize: (doc: PMNode) => string;
  schema: Schema;
}

function setupEditor(): EditorTestContext {
  const collection = {
    base: setupBase(),
    paragraph: setupParagraph(),
    heading: setupHeading(),
    blockquote: setupBlockquote(),
    code: setupCode(),
    codeBlock: setupCodeBlock(),
    bold: setupBold(),
    italic: setupItalic(),
    strike: setupStrike(),
    list: setupList(),
    hardBreak: setupHardBreak(),
    image: setupImage(),
    link: setupLink(),
  };

  const { nodes, marks } = resolve(collection);
  const schema = new Schema({
    topNode: 'doc',
    nodes,
    marks,
  });

  const markdown = markdownLoader(
    [...Object.values(collection)],
    schema,
    defaultTokenizers,
  );

  return {
    parse: (content: string) => markdown.parser.parse(content),
    serialize: (doc: PMNode) => markdown.serializer.serialize(doc),
    schema,
  };
}

function testParsing(text: string): PMNode {
  const { parse } = setupEditor();
  return parse(text);
}

/**
 * Tests markdown serialization by ensuring:
 * 1. The serialized output matches the expected markdown
 * 2. Re-parsing the serialized output produces the same document (round-trip)
 */
function testSerialization(doc: PMNode, expectedMarkdown: string): void {
  const { parse, serialize } = setupEditor();
  const serialized = serialize(doc);

  // Test round-trip conversion
  expect(parse(serialized).toJSON()).toEqual(doc.toJSON());
  // Test raw markdown output
  expect(serialized.trim()).toBe(expectedMarkdown.trim());
}

/**
 * Combined helper for testing both parsing and serialization
 * Optionally accepts an expected document for declarative testing
 */
function testMarkdownRoundTrip(markdown: string, expectedDoc?: PMNode): void {
  const parsedDoc = testParsing(markdown);
  if (expectedDoc) {
    expect(parsedDoc.toJSON()).toEqual(expectedDoc.toJSON());
    testSerialization(expectedDoc, markdown);
  } else {
    testSerialization(parsedDoc, markdown);
  }
}

// Initialize test builders with schema
const { schema } = setupEditor();
const nodeBuilders = createBuilders(schema, {
  p: { nodeType: 'paragraph' },
  h1: { nodeType: 'heading', level: 1 },
  h2: { nodeType: 'heading', level: 2 },
  blockquote: { nodeType: 'blockquote' },
  codeBlock: { nodeType: 'code_block' },
  listItem: { nodeType: 'list' },
  hardBreak: { nodeType: 'hard_break' },
  image: { nodeType: 'image' },
});

const doc = nodeBuilders.doc as NodeBuilder;
const p = nodeBuilders.p as NodeBuilder;
const h1 = nodeBuilders.h1 as NodeBuilder;
const h2 = nodeBuilders.h2 as NodeBuilder;
const blockquote = nodeBuilders.blockquote as NodeBuilder;
const codeBlock = nodeBuilders.codeBlock as NodeBuilder;
const list = nodeBuilders.listItem as NodeBuilder;
const hardBreak = nodeBuilders.hardBreak as NodeBuilder;
const image = nodeBuilders.image as NodeBuilder;

type ListContent = string | PMNode | Array<string | PMNode>;

function createList(
  kind: 'bullet' | 'ordered' | 'task',
  content: ListContent,
  attrs: Record<string, any> = {},
) {
  // Convert string content to paragraph node
  const processedContent =
    typeof content === 'string'
      ? p(content)
      : Array.isArray(content)
        ? content.map((item) => (typeof item === 'string' ? p(item) : item))
        : content;

  // Handle array of content (multiple items at same level)
  if (Array.isArray(processedContent)) {
    return list({ kind, ...attrs }, ...processedContent);
  }

  // Single PMNode content
  return list({ kind, ...attrs }, processedContent);
}

function createBulletList(content: ListContent) {
  return createList('bullet', content);
}

function createOrderedList(content: ListContent, order = 1) {
  return createList('ordered', content, { order });
}

function createTaskList(content: ListContent, checked = false) {
  return createList('task', content, { checked });
}

describe('Markdown Parser and Serializer', () => {
  describe('Basic Node Types', () => {
    it('handles simple paragraph', () => {
      const markdown = 'This is a paragraph.';
      testMarkdownRoundTrip(markdown);
    });

    it('handles ATX style heading', () => {
      const markdown = '# Header Title';
      testMarkdownRoundTrip(markdown);
    });
  });

  describe('Complex Documents', () => {
    it('handles mixed headings and paragraphs', () => {
      const markdown = `
# Heading Level 1

## Heading Level 2

Regular paragraph text
`.trim();

      testMarkdownRoundTrip(
        markdown,
        doc(
          h1('Heading Level 1'),
          h2('Heading Level 2'),
          p('Regular paragraph text'),
        ),
      );
    });

    it('handles single paragraph with declarative assertion', () => {
      const markdown = 'Simple declarative paragraph test';
      testMarkdownRoundTrip(
        markdown,
        doc(p('Simple declarative paragraph test')),
      );
    });

    it('handles single heading with declarative assertion', () => {
      const markdown = '# Only Heading';
      testMarkdownRoundTrip(markdown, doc(h1('Only Heading')));
    });
  });

  describe('Markdown Extensions', () => {
    it('handles blockquote', () => {
      const markdown = '> Blockquote text';
      testMarkdownRoundTrip(markdown, doc(blockquote(p('Blockquote text'))));
    });

    it('handles code block', () => {
      const markdown = '```\nconst a = 1;\n```';

      testMarkdownRoundTrip(markdown, doc(codeBlock('const a = 1;')));
    });

    it('handles inline code', () => {
      const markdown = 'This is `inline code` in a sentence.';
      testMarkdownRoundTrip(markdown);
    });

    it('handles bold', () => {
      const markdown = 'This is **bold** text.';
      testMarkdownRoundTrip(markdown);
    });

    it('handles italic', () => {
      const markdown = 'This is _italic_ text.';
      testMarkdownRoundTrip(markdown);
    });

    it('handles strike', () => {
      const markdown = 'This is ~~strike~~ text.';
      testMarkdownRoundTrip(markdown);
    });

    it('handles list', () => {
      const markdown = '- Item 1\n\n- Item 2\n\n  - Nested item';
      testMarkdownRoundTrip(markdown);
    });

    it('handles hard break', () => {
      const markdown = 'Line 1\\\nLine 2';
      testMarkdownRoundTrip(markdown, doc(p('Line 1', hardBreak(), 'Line 2')));
    });

    it('handles image', () => {
      const markdown = '![alt text](http://example.com/image.png)';
      testMarkdownRoundTrip(
        markdown,
        doc(p(image({ src: 'http://example.com/image.png', alt: 'alt text' }))),
      );
    });

    it('handles link', () => {
      const markdown = '[example](http://example.com)';
      testMarkdownRoundTrip(markdown);
    });
  });

  describe('Enhanced List Types', () => {
    it('handles bullet list', () => {
      const markdown = '- Bullet item';
      testMarkdownRoundTrip(markdown, doc(createBulletList('Bullet item')));
    });

    // TODO: handle tight lists
    it('handles deeply nested bullet list (3 levels)', () => {
      const markdown = `- Level 1

  - Level 2

    - Level 3`;
      testMarkdownRoundTrip(
        markdown,
        doc(
          createBulletList([
            'Level 1',
            createBulletList(['Level 2', createBulletList('Level 3')]),
          ]),
        ),
      );
    });

    it('handles unchecked task list', () => {
      const markdown = '- [ ] Task item';
      testMarkdownRoundTrip(markdown, doc(createTaskList('Task item')));
    });

    it('handles checked task list', () => {
      const markdown = '- [x] Task completed';
      testMarkdownRoundTrip(
        markdown,
        doc(createTaskList('Task completed', true)),
      );
    });
  });
});

describe('Ordered Lists', () => {
  it('handles basic ordered list', () => {
    const markdown = '1. Ordered item';
    testMarkdownRoundTrip(markdown, doc(createOrderedList('Ordered item')));
  });

  it('handles basic ordered list', () => {
    const markdown = '2. Ordered item';
    testMarkdownRoundTrip(markdown, doc(createOrderedList('Ordered item', 2)));
  });

  it('handles nested ordered lists correctly', () => {
    const markdown = `
1. First item
2. Second item
   1. Nested first
   2. Nested second
3. Third item
    `.trim();
    testMarkdownRoundTrip(markdown);
  });

  it.skip('handles ordered lists with custom start numbers', () => {
    const markdown = `2. First item
3. Second item
4. Third item`;
    testMarkdownRoundTrip(
      markdown,
      doc(createOrderedList(['First item', 'Second item', 'Third item'], 2)),
    );
  });

  it.skip('handles mixed ordered and bullet lists', () => {
    const markdown = `1. Ordered item 1
- Bullet sub-item
2. Ordered sub-item
2. Ordered item 2`;
    testMarkdownRoundTrip(
      markdown,
      doc(
        createOrderedList([
          'Ordered item 1',
          createBulletList('Bullet sub-item'),
          createOrderedList('Ordered sub-item', 2),
          'Ordered item 2',
        ]),
      ),
    );
  });

  it.skip('handles ordered lists with paragraphs between items', () => {
    const markdown = `1. First item

2. Second item with
multiple lines

3. Third item`;
    testMarkdownRoundTrip(
      markdown,
      doc(
        createOrderedList([
          'First item',
          'Second item with\nmultiple lines',
          'Third item',
        ]),
      ),
    );
  });
});

describe('Edge Cases', () => {
  it('handles empty markdown', () => {
    const markdown = '';
    testMarkdownRoundTrip(markdown);
  });

  it('handles markdown with only whitespace', () => {
    const markdown = '   ';
    testMarkdownRoundTrip(markdown);
  });

  it('handles multiple consecutive newlines', () => {
    const markdown = 'Paragraph one.\n\n\nParagraph two.';

    testSerialization(
      testParsing(markdown),
      'Paragraph one.\n\nParagraph two.',
    );
  });

  it('handles combined inline formatting', () => {
    const markdown =
      'This is **bold**, _italic_, ~~strike~~, and `inline code`.';
    testMarkdownRoundTrip(markdown);
  });

  it('handles nested formatting', () => {
    const markdown = 'Nested **bold and _italic_** text';
    testMarkdownRoundTrip(markdown);
  });

  it('handles code block with language info', () => {
    const markdown = "```javascript\nconsole.log('Hello, world!');\n```";
    testMarkdownRoundTrip(markdown);
  });

  it('handles link with title attribute', () => {
    const markdown = "[example](http://example.com 'Example Site')";
    testSerialization(
      testParsing(markdown),
      `[example](http://example.com "Example Site")`,
    );
  });

  it('handles image with title attribute', () => {
    const markdown =
      "![alt text](http://example.com/image.png 'Example Image')";

    testSerialization(
      testParsing(markdown),
      `![alt text](http://example.com/image.png "Example Image")`,
    );
  });

  it('handles escaped characters', () => {
    const markdown = 'Escaped \\*asterisk\\* should not be bold.';
    testMarkdownRoundTrip(markdown);
  });
});
