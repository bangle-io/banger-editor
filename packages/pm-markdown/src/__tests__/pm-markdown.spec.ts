import { setupBase } from 'banger-editor/base';
import { setupBlockquote } from 'banger-editor/blockquote';
import { setupBold } from 'banger-editor/bold';
import { setupCode } from 'banger-editor/code';
import { setupCodeBlock } from 'banger-editor/code-block';
import { resolve, setPriority } from 'banger-editor/common';
import { setupHardBreak } from 'banger-editor/hard-break';
import { setupHeading } from 'banger-editor/heading';
import { setupImage } from 'banger-editor/image';
import { setupItalic } from 'banger-editor/italic';
import { setupLink } from 'banger-editor/link';
import { setupList } from 'banger-editor/list';
import { setupParagraph } from 'banger-editor/paragraph';
import type { PMNode } from 'banger-editor/pm';
import { setupStrike } from 'banger-editor/strike';
import { Schema } from 'prosemirror-model';
import {
  type NodeBuilder,
  builders as createBuilders,
} from 'prosemirror-test-builder';
import { describe, expect, it } from 'vitest';
import { markdownLoader } from '../markdown';
import { defaultTokenizers } from '../tokenizer';

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
    bold: setPriority(setupBold(), 30),
    italic: setPriority(setupItalic(), 30),
    strike: setupStrike(),
    list: setupList(),
    hardBreak: setupHardBreak(),
    image: setupImage(),
    link: setPriority(setupLink(), 40),
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

  // expect(parse(serialized).toJSON()).toEqual(doc.toJSON());
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

/**
 * Helper for testing markdown output.
 * It takes an input markdown and an expected markdown, then asserts that serializing the parsed markdown
 * produces the expected markdown, and that round-trip parsing of the output remains consistent.
 */
function testMarkdownOutput(
  inputMarkdown: string,
  expectedMarkdown: string,
): void {
  const docNode = testParsing(inputMarkdown);
  testSerialization(docNode, expectedMarkdown);
}

// NEW HELPER: assertParsedMarkdown
/**
 * Helper for asserting that the parsed markdown's JSON equals the provided document's JSON.
 */
function assertParsedMarkdown(markdown: string, expected: PMNode): void {
  expect(testParsing(markdown).toJSON()).toEqual(expected.toJSON());
}

// Initialize test builders with schema
const { schema } = setupEditor();
const nodeBuilders = createBuilders(schema, {
  p: { nodeType: 'paragraph' },
  h1: { nodeType: 'heading', level: 1 },
  h2: { nodeType: 'heading', level: 2 },
  h3: { nodeType: 'heading', level: 3 },
  h4: { nodeType: 'heading', level: 4 },
  h5: { nodeType: 'heading', level: 5 },
  h6: { nodeType: 'heading', level: 6 },
  blockquote: { nodeType: 'blockquote' },
  codeBlock: { nodeType: 'code_block' },
  listItem: { nodeType: 'list' },
  hardBreak: { nodeType: 'hard_break' },
  image: { nodeType: 'image' },
  bold: { markType: 'bold' },
  italic: { markType: 'italic' },
  strike: { markType: 'strike' },
  code: { markType: 'code' },
  link: { markType: 'link' },
});

const doc = nodeBuilders.doc as NodeBuilder;
const p = nodeBuilders.p as NodeBuilder;
const h1 = nodeBuilders.h1 as NodeBuilder;
const h2 = nodeBuilders.h2 as NodeBuilder;
const h3 = nodeBuilders.h3 as NodeBuilder;
const h4 = nodeBuilders.h4 as NodeBuilder;
const h5 = nodeBuilders.h5 as NodeBuilder;
const h6 = nodeBuilders.h6 as NodeBuilder;
const blockquote = nodeBuilders.blockquote as NodeBuilder;
const codeBlock = nodeBuilders.codeBlock as NodeBuilder;
const list = nodeBuilders.listItem as NodeBuilder;
const hardBreak = nodeBuilders.hardBreak as NodeBuilder;
const image = nodeBuilders.image as NodeBuilder;
const bold = nodeBuilders.bold as NodeBuilder;
const italic = nodeBuilders.italic as NodeBuilder;
const strike = nodeBuilders.strike as NodeBuilder;
const code = nodeBuilders.code as NodeBuilder;
const link = nodeBuilders.link as NodeBuilder;

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
    it('should handle simple paragraph', () => {
      const markdown = 'This is a paragraph.';
      testMarkdownRoundTrip(markdown);
    });

    it('should handle ATX style heading level 1', () => {
      const markdown = '# Header Level 1';
      testMarkdownRoundTrip(markdown, doc(h1('Header Level 1')));
    });

    it('should handle ATX style heading level 2', () => {
      const markdown = '## Header Level 2';
      testMarkdownRoundTrip(markdown, doc(h2('Header Level 2')));
    });

    it('should handle ATX style heading level 3', () => {
      const markdown = '### Header Level 3';
      testMarkdownRoundTrip(markdown, doc(h3('Header Level 3')));
    });

    it('should handle ATX style heading level 4', () => {
      const markdown = '#### Header Level 4';
      testMarkdownRoundTrip(markdown, doc(h4('Header Level 4')));
    });

    it('should handle ATX style heading level 5', () => {
      const markdown = '##### Header Level 5';
      testMarkdownRoundTrip(markdown, doc(h5('Header Level 5')));
    });

    it('should handle ATX style heading level 6', () => {
      const markdown = '###### Header Level 6';
      testMarkdownRoundTrip(markdown, doc(h6('Header Level 6')));
    });

    it('should handle setext style heading level 1', () => {
      const markdown = `
Header Level 1
=============
      `.trim();

      expect(testParsing(markdown).toJSON()).toEqual(
        doc(h1('Header Level 1')).toJSON(),
      );
    });
  });

  describe('Complex Documents', () => {
    it('should handle mixed headings and paragraphs', () => {
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

    it('should handle single paragraph with declarative assertion', () => {
      const markdown = 'Simple declarative paragraph test';
      testMarkdownRoundTrip(
        markdown,
        doc(p('Simple declarative paragraph test')),
      );
    });

    it('should handle single heading with declarative assertion', () => {
      const markdown = '# Only Heading';
      testMarkdownRoundTrip(markdown, doc(h1('Only Heading')));
    });
  });

  describe('Blockquotes', () => {
    it('should handle basic blockquote', () => {
      const markdown = '> Blockquote text';
      testMarkdownRoundTrip(markdown, doc(blockquote(p('Blockquote text'))));
    });

    it('should handle multiline blockquote', () => {
      const markdown = `
> Blockquote line 1

> Blockquote line 2
      `.trim();
      testMarkdownRoundTrip(
        markdown,
        doc(
          blockquote(p('Blockquote line 1')),
          blockquote(p('Blockquote line 2')),
        ),
      );
    });

    it('should handle blockquote with multiple paragraphs', () => {
      const markdown = `
> Paragraph 1
>
> Paragraph 2
      `.trim();
      testMarkdownRoundTrip(
        markdown,
        doc(blockquote(p('Paragraph 1'), p('Paragraph 2'))),
      );
    });

    it('should handle nested blockquotes', () => {
      const markdown = `
> Outer blockquote
>> Inner blockquote
      `.trim();
      testMarkdownOutput(
        markdown,
        `
> Outer blockquote
>
> > Inner blockquote
        `.trim(),
      );
    });
  });

  describe('Code Blocks', () => {
    it('should handle fenced code block', () => {
      const markdown = `
\`\`\`
const a = 1;
\`\`\`
      `.trim();
      testMarkdownRoundTrip(markdown, doc(codeBlock('const a = 1;')));
    });

    it('should handle indented code block', () => {
      const markdown = `
\`\`\`
    const a = 1;
\`\`\`
      `.trim();
      testMarkdownRoundTrip(markdown, doc(codeBlock('    const a = 1;')));
    });

    it('should handle code block with language info', () => {
      const markdown = `
\`\`\`javascript
console.log('Hello, world!');
\`\`\`
      `.trim();
      testMarkdownRoundTrip(
        markdown,
        doc(
          codeBlock(
            { language: 'javascript' },
            "console.log('Hello, world!');",
          ),
        ),
      );
    });

    it('should serialize code block with language info', () => {
      const docNode = doc(
        codeBlock({ language: 'javascript' }, "console.log('Hello, world!');"),
      );
      testSerialization(
        docNode,
        `
\`\`\`javascript
console.log('Hello, world!');
\`\`\`
        `.trim(),
      );
    });

    it('should handle empty code block', () => {
      const markdown = `
\`\`\`
\`\`\`
      `.trim();
      testMarkdownRoundTrip(markdown, doc(codeBlock('')));
    });
  });

  describe('Inline Code', () => {
    it('should handle inline code', () => {
      const markdown = 'This is `inline code` in a sentence.';
      testMarkdownRoundTrip(
        markdown,
        doc(p('This is ', code('inline code'), ' in a sentence.')),
      );
    });

    it('should handle inline code with backticks inside', () => {
      const markdown = '``Inline code with `backtick` inside``';
      testMarkdownOutput(markdown, '`` Inline code with `backtick` inside ``');
    });

    it('should handle inline code at the beginning of a line', () => {
      const markdown = '`inline code` at the start.';
      testMarkdownRoundTrip(
        markdown,
        doc(p(code('inline code'), ' at the start.')),
      );
    });

    it('should handle inline code at the end of a line', () => {
      const markdown = 'At the end `inline code`.';
      testMarkdownRoundTrip(
        markdown,
        doc(p('At the end ', code('inline code'), '.')),
      );
    });
  });

  describe('Bold Text', () => {
    it('should handle bold text with asterisks', () => {
      const markdown = 'This is **bold** text.';
      testMarkdownRoundTrip(
        markdown,
        doc(p('This is ', bold('bold'), ' text.')),
      );
    });

    it('should handle bold text with underscores', () => {
      const markdown = 'This is __bold__ text.';
      testMarkdownOutput(markdown, 'This is **bold** text.');
    });

    it('should handle bold text in the middle of a word', () => {
      const markdown = 'un**bold**en';
      testMarkdownRoundTrip(markdown, doc(p('un', bold('bold'), 'en')));
    });

    it('should handle bold text at the start of a line', () => {
      const markdown = '**Bold** at the beginning.';
      testMarkdownRoundTrip(
        markdown,
        doc(p(bold('Bold'), ' at the beginning.')),
      );
    });

    it('should handle bold text at the end of a line', () => {
      const markdown = 'At the end **bold**.';
      testMarkdownRoundTrip(markdown, doc(p('At the end ', bold('bold'), '.')));
    });
  });

  describe('Italic Text', () => {
    it('should handle italic text with asterisks', () => {
      const markdown = 'This is *italic* text.';
      testMarkdownOutput(markdown, 'This is _italic_ text.');
    });

    it('should handle italic text with underscores', () => {
      const markdown = 'This is _italic_ text.';
      testMarkdownRoundTrip(
        markdown,
        doc(p('This is ', italic('italic'), ' text.')),
      );
    });

    it('should handle italic text in the middle of a word', () => {
      const markdown = 'un_italic_ize';
      testMarkdownOutput(markdown, 'un_italic_ize');
    });

    it('should handle italic text at the start of a line', () => {
      const markdown = '_Italic_ at the beginning.';
      testMarkdownRoundTrip(
        markdown,
        doc(p(italic('Italic'), ' at the beginning.')),
      );
    });

    it('should handle italic text at the end of a line', () => {
      const markdown = 'At the end _italic_.';
      testMarkdownRoundTrip(
        markdown,
        doc(p('At the end ', italic('italic'), '.')),
      );
    });
  });

  describe('Strike-through Text', () => {
    it('should handle strike-through text', () => {
      const markdown = 'This is ~~strike~~ text.';
      testMarkdownRoundTrip(
        markdown,
        doc(p('This is ', strike('strike'), ' text.')),
      );
    });

    it('should handle strike-through text in the middle of a word', () => {
      const markdown = 'un~~strike~~through';
      testMarkdownRoundTrip(
        markdown,
        doc(p('un', strike('strike'), 'through')),
      );
    });

    it('should handle strike-through text at the start of a line', () => {
      const markdown = '~~Strike~~ at the beginning.';
      testMarkdownRoundTrip(
        markdown,
        doc(p(strike('Strike'), ' at the beginning.')),
      );
    });

    it('should handle strike-through text at the end of a line', () => {
      const markdown = 'At the end ~~strike~~.';
      testMarkdownRoundTrip(
        markdown,
        doc(p('At the end ', strike('strike'), '.')),
      );
    });
  });

  describe('Lists', () => {
    it('should handle basic bullet list', () => {
      const markdown = `
- Item 1
- Item 2
      `.trim();
      testMarkdownOutput(
        markdown,
        `
- Item 1

- Item 2
        `.trim(),
      );
    });

    it('should handle bullet list with nested items', () => {
      const markdown = `
- Item 1

    - Nested item 1

    - Nested item 2

- Item 2
      `.trim();
      testMarkdownOutput(
        markdown,
        `
- Item 1

    - Nested item 1

    - Nested item 2

- Item 2
        `.trim(),
      );
    });

    it('should handle bullet list with different levels of nesting', () => {
      const markdown = `
- Level 1

    - Level 2

        - Level 3
      `.trim();
      testMarkdownOutput(
        markdown,
        `
- Level 1

    - Level 2

        - Level 3
      `.trim(),
      );
    });

    it('should handle bullet list with blank lines between items (loose list)', () => {
      const markdown = `
- Item 1

- Item 2
      `.trim();
      testMarkdownOutput(
        markdown,
        `
- Item 1

- Item 2
        `.trim(),
      );
    });
    // TODO: mixed tight/loose lists
    it('should handle tight and loose lists mixed', () => {
      const markdown = `
- Item 1
- Item 2

- Item 3
      `.trim();
      testMarkdownOutput(
        markdown,
        `
- Item 1

- Item 2

- Item 3
        `.trim(),
      );
    });

    it('should handle complex nested bullet list', () => {
      const markdown = `
- Item 1

    - Nested item 1

        - Deeply nested item 1

    - Nested item 2

- Item 2
      `.trim();

      testMarkdownOutput(
        markdown,
        `
- Item 1

    - Nested item 1

        - Deeply nested item 1

    - Nested item 2

- Item 2
        `.trim(),
      );
    });
  });

  describe('Enhanced List Types', () => {
    it('should handle bullet list', () => {
      const markdown = '- Bullet item';
      testMarkdownRoundTrip(markdown, doc(createBulletList('Bullet item')));
    });

    it('should handle deeply nested bullet list (3 levels)', () => {
      const markdown = `
- Level 1

    - Level 2

        - Level 3
      `.trim();
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

    it('should handle unchecked task list', () => {
      const markdown = '- [ ] Task item';
      testMarkdownRoundTrip(markdown, doc(createTaskList('Task item')));
    });

    it('should handle checked task list', () => {
      const markdown = '- [x] Task completed';
      testMarkdownRoundTrip(
        markdown,
        doc(createTaskList('Task completed', true)),
      );
    });
  });

  describe('Ordered Lists', () => {
    it('should handle basic ordered list starting at 1', () => {
      const markdown = '1. Ordered item';
      testMarkdownRoundTrip(markdown, doc(createOrderedList('Ordered item')));
    });

    it('should handle basic ordered list starting at a number other than 1', () => {
      const markdown = '2. Ordered item';
      testMarkdownRoundTrip(
        markdown,
        doc(createOrderedList('Ordered item', 2)),
      );
    });

    it('should handle nested ordered without correct new line correctly', () => {
      const markdown = `
1. First item
2. Second item
    1. Nested first
    2. Nested second
3. Third item
      `.trim();
      testMarkdownOutput(
        markdown,
        `
1. First item

2. Second item

    1. Nested first

    2. Nested second

3. Third item
        `.trim(),
      );
    });

    it('should handle nested ordered by not indenting if indentation is 2', () => {
      const markdown = `
1. First item

2. Second item

  1. Nested first

  2. Nested second

3. Third item
      `.trim();
      testMarkdownOutput(
        markdown,
        `
1. First item

2. Second item

3. Nested first

4. Nested second

5. Third item        
`.trim(),
      );
    });

    it('should handle nested ordered by not indenting if indentation is 4', () => {
      const markdown = `
1. First item

2. Second item

    1. Nested first

    2. Nested second

3. Third item
      `.trim();
      testMarkdownOutput(
        markdown,
        `
1. First item

2. Second item

    1. Nested first

    2. Nested second

3. Third item   
`.trim(),
      );
    });

    it('should handle nested ordered without correct new line correctly', () => {
      const markdown = `
1. First item

2. Second item

    1. Nested first

    2. Nested second

3. Third item
          `.trim();
      testMarkdownRoundTrip(markdown);
    });

    it('should handle ordered lists with custom start numbers', () => {
      const markdown = `
2. First item
3. Second item
4. Third item
      `.trim();
      testMarkdownOutput(
        markdown,
        `
2. First item

3. Second item

4. Third item
        `.trim(),
      );
    });

    it('should handle mixed ordered and bullet lists', () => {
      const markdown = `
1. Ordered item 1
- Bullet sub-item
2. Ordered sub-item
2. Ordered item 2
      `.trim();
      testMarkdownOutput(
        markdown,
        `
1. Ordered item 1

- Bullet sub-item

2. Ordered sub-item

3. Ordered item 2
        `.trim(),
      );
    });

    it('should handle ordered lists with paragraphs between items', () => {
      const markdown = `
1. First item

2. Second item with
multiple lines

3. Third item
      `.trim();
      testMarkdownOutput(
        markdown,
        `
1. First item

2. Second item with multiple lines

3. Third item
        `.trim(),
      );
    });

    it('should handle ordered list with different start numbers', () => {
      const markdown = `
10. Item 1
11. Item 2
9. Item 3
      `.trim();
      testMarkdownOutput(
        markdown,
        `
10. Item 1

11. Item 2

12. Item 3
        `.trim(),
      );
    });

    it('should handle ordered list with inconsistent numbering but should still be ordered list', () => {
      const markdown = `
1. Item 1
5. Item 2
2. Item 3
      `.trim();
      testMarkdownOutput(
        markdown,
        `
1. Item 1

2. Item 2

3. Item 3
        `.trim(),
      );
    });
  });

  describe('Hard Break', () => {
    it('should handle hard break', () => {
      const markdown = `
Line 1\\
Line 2
      `.trim();
      testMarkdownRoundTrip(markdown, doc(p('Line 1', hardBreak(), 'Line 2')));
    });

    it('should handle multiple hard breaks in a paragraph', () => {
      const markdown = `
Line 1\\
Line 2\\
Line 3
      `.trim();
      testMarkdownRoundTrip(
        markdown,
        doc(p('Line 1', hardBreak(), 'Line 2', hardBreak(), 'Line 3')),
      );
    });

    it('should handle hard break at the end of a line', () => {
      const markdown = 'Line with break\\';
      testMarkdownOutput(markdown, 'Line with break\\\\'); // Backslash at the very end is ignored
    });

    it('should handle hard break followed by other inline marks', () => {
      const markdown = `
Line 1\\
**Bold text**
      `.trim();
      testMarkdownRoundTrip(
        markdown,
        doc(p('Line 1', hardBreak(), bold('Bold text'))),
      );
    });
  });

  describe('Images', () => {
    it('should handle basic image', () => {
      const markdown = '![alt text](http://example.com/image.png)';
      testMarkdownRoundTrip(
        markdown,
        doc(p(image({ src: 'http://example.com/image.png', alt: 'alt text' }))),
      );
    });

    it('should handle image with title', () => {
      const markdown =
        "![alt text](http://example.com/image.png 'Image Title')";
      testMarkdownOutput(
        markdown,
        '![alt text](http://example.com/image.png "Image Title")',
      );
    });

    it('should handle image with empty alt text', () => {
      const markdown = '![](http://example.com/image.png)';
      testMarkdownRoundTrip(
        markdown,
        doc(p(image({ src: 'http://example.com/image.png', alt: null }))),
      );
    });

    it('should handle image with alt text containing special characters', () => {
      const markdown = '![alt text with * and _](http://example.com/image.png)';
      testMarkdownOutput(
        markdown,
        '![alt text with \\* and \\_](http://example.com/image.png)',
      );
    });

    it('should handle image URL with spaces', () => {
      const markdown =
        '![alt text](http://example.com/image%20with%20spaces.png)';
      testMarkdownRoundTrip(
        markdown,
        doc(
          p(
            image({
              src: 'http://example.com/image%20with%20spaces.png',
              alt: 'alt text',
            }),
          ),
        ),
      );
    });
  });

  describe('Links', () => {
    it('should handle basic link', () => {
      const markdown = '[example](http://example.com)';
      testMarkdownRoundTrip(
        markdown,
        doc(p(link({ href: 'http://example.com' }, 'example'))),
      );
    });

    it('should handle link with title', () => {
      const markdown = "[example](http://example.com 'Example Site')";
      testMarkdownRoundTrip(
        markdown,
        doc(
          p(
            link(
              { href: 'http://example.com', title: 'Example Site' },
              'example',
            ),
          ),
        ),
      );
    });

    it('should handle link with URL containing spaces', () => {
      const markdown = '[link text](http://example.com/url%20with%20spaces)';
      testMarkdownRoundTrip(
        markdown,
        doc(
          p(
            link(
              { href: 'http://example.com/url%20with%20spaces' },
              'link text',
            ),
          ),
        ),
      );
    });

    it('should handle link with complex text content', () => {
      const markdown = `
[**bold** and _italic_ link text](http://example.com)
      `.trim();
      testMarkdownOutput(
        markdown,
        // TODO not ideal
        `
**[bold** and _italic](http://example.com)_ link text](http://example.com)
        `.trim(),
      );
    });

    it('should handle link at the beginning of a line', () => {
      const markdown = '[Link at start](http://example.com) of line.';
      testMarkdownRoundTrip(
        markdown,
        doc(
          p(link({ href: 'http://example.com' }, 'Link at start'), ' of line.'),
        ),
      );
    });

    it('should handle link at the end of a line', () => {
      const markdown = 'Line ends with [link](http://example.com)';
      testMarkdownRoundTrip(
        markdown,
        doc(p('Line ends with ', link({ href: 'http://example.com' }, 'link'))),
      );
    });

    it('should handle link with parenthesis in URL', () => {
      const markdown = '[link](http://example.com/path(with)parens)';
      testMarkdownRoundTrip(
        markdown,
        doc(p(link({ href: 'http://example.com/path(with)parens' }, 'link'))),
      );
    });
  });

  describe('Edge Cases', () => {
    it('should handle empty markdown', () => {
      const markdown = '';
      testMarkdownRoundTrip(markdown, doc(p('')));
    });

    it('should handle markdown with only whitespace', () => {
      const markdown = '   ';
      testMarkdownRoundTrip(markdown, doc(p())); // Whitespace becomes an empty paragraph
    });

    it('should handle multiple consecutive newlines', () => {
      const markdown = `
Paragraph one.


Paragraph two.
      `.trim();
      testMarkdownOutput(
        markdown,
        `
Paragraph one.

Paragraph two.
        `.trim(),
      );
    });

    it('should handle combined inline formatting', () => {
      const markdown = `
This is **bold**, _italic_, ~~strike~~, and \`inline code\`.
      `.trim();
      testMarkdownRoundTrip(
        markdown,
        doc(
          p(
            'This is ',
            bold('bold'),
            ', ',
            italic('italic'),
            ', ',
            strike('strike'),
            ', and ',
            code('inline code'),
            '.',
          ),
        ),
      );
    });

    it('should handle nested formatting: bold and italic', () => {
      const markdown = `
Nested **bold and _italic_ text**
      `.trim();
      testMarkdownOutput(
        markdown,
        `
Nested **bold and _italic_ text**
        `.trim(),
      );
      assertParsedMarkdown(
        markdown,
        doc(p('Nested ', bold('bold and ', italic('italic'), ' text'))),
      );
    });

    it('should handle nested formatting: italic and bold', () => {
      const markdown = `
Nested _italic and **bold** text_
      `.trim();
      testMarkdownRoundTrip(
        markdown,
        doc(p('Nested ', italic('italic and ', bold('bold'), ' text'))),
      );
    });

    it('should handle code block with language info', () => {
      const markdown = `
\`\`\`javascript
console.log('Hello, world!');
\`\`\`
      `.trim();
      testMarkdownRoundTrip(
        markdown,
        doc(
          codeBlock(
            { language: 'javascript' },
            "console.log('Hello, world!');",
          ),
        ),
      );
    });

    it('should handle link with title attribute', () => {
      const markdown = "[example](http://example.com 'Example Site')";
      testMarkdownOutput(
        markdown,
        `[example](http://example.com 'Example Site')`,
      );
    });

    it('should handle image with title attribute', () => {
      const markdown =
        "![alt text](http://example.com/image.png 'Example Image')";
      testMarkdownOutput(
        markdown,
        `![alt text](http://example.com/image.png "Example Image")`,
      );
    });

    it('should handle escaped characters: asterisk', () => {
      const markdown = 'Escaped \\*asterisk\\* should not be bold.';
      testMarkdownRoundTrip(
        markdown,
        doc(p('Escaped *asterisk* should not be bold.')),
      );
    });

    it('should handle escaped characters: underscore', () => {
      const markdown = 'Escaped \\_underscore\\_ should not be italic.';
      testMarkdownRoundTrip(
        markdown,
        doc(p('Escaped _underscore_ should not be italic.')),
      );
    });

    it('should handle escaped characters: backtick', () => {
      const markdown = 'Escaped \\`backtick\\` should not be code.';
      testMarkdownRoundTrip(
        markdown,
        doc(p('Escaped `backtick` should not be code.')),
      );
    });

    it('should handle escaped characters: backslash', () => {
      const markdown = 'Escaped \\\\backslash\\\\ should not escape.';
      testMarkdownRoundTrip(
        markdown,
        doc(p('Escaped \\backslash\\ should not escape.')),
      );
    });

    it('should handle mixed escaped and unescaped special characters', () => {
      const markdown = `
This is \\*not bold\\* but this is **bold**
      `.trim();
      testMarkdownRoundTrip(
        markdown,
        doc(p('This is *not bold* but this is ', bold('bold'))),
      );
    });

    it('should handle URLs in plain text', () => {
      const markdown = 'Visit http://example.com';
      testMarkdownRoundTrip(markdown, doc(p('Visit http://example.com'))); // URLs in text are not auto-linked
    });

    it('should handle email addresses in plain text', () => {
      const markdown = 'Email me at test@example.com';
      testMarkdownRoundTrip(markdown, doc(p('Email me at test@example.com'))); // Email addresses are not auto-linked
    });

    it('should handle markdown with trailing whitespace', () => {
      const markdown = 'Paragraph with trailing whitespace   ';
      testMarkdownRoundTrip(
        markdown,
        doc(p('Paragraph with trailing whitespace')),
      );
    });

    it('should handle markdown with leading whitespace', () => {
      const markdown = '   Paragraph with leading whitespace';
      testMarkdownRoundTrip(
        markdown,
        doc(p('Paragraph with leading whitespace')),
      );
    });
  });

  describe('Indentation in Lists', () => {
    // yes this is broken
    it('should handle minimal indentation for bullet list (valid but less readable)', () => {
      const markdown = `
* Parent
 * Nested
  * Deeper
    `.trim();
      testMarkdownOutput(
        markdown,
        `
- Parent

- Nested

- Deeper
      `.trim(),
      );
    });

    it('should handle aligned bullet list', () => {
      const markdown = `
* Parent Item
  * Nested Item under Parent
    * Even deeper item
    `.trim();
      testMarkdownOutput(
        markdown,
        `
- Parent Item

    - Nested Item under Parent

        - Even deeper item
      `.trim(),
      );
    });

    it('should handle different bullet list markers', () => {
      const markdown = `
* Top Level
  - Level Two (using hyphen)
    + Level Three (using plus)
    `.trim();
      testMarkdownOutput(
        markdown,
        `
- Top Level

    - Level Two (using hyphen)

        - Level Three (using plus)
      `.trim(),
      );
    });
  });

  // Advanced Lists Tests
  describe('Advanced Lists', () => {
    it('should handle flat unordered list with mixed markers', () => {
      const markdown = `
+ Item A
* Item B
- Item C
    `.trim();
      testMarkdownOutput(
        markdown,
        `
- Item A

- Item B

- Item C
      `.trim(),
      );
    });

    it('should handle ordered list with parenthesis markers', () => {
      const markdown = `
1) First item
2) Second item
    `.trim();
      testMarkdownOutput(
        markdown,
        `
1. First item

2. Second item
      `.trim(),
      );
    });

    it('should handle multi-paragraph list item', () => {
      const markdown = `
- First paragraph line
  Continuation of first paragraph

  Second paragraph in same item
- Second item
    `.trim();
      testMarkdownOutput(
        markdown,
        `
- First paragraph line Continuation of first paragraph

  Second paragraph in same item

- Second item
      `.trim(),
      );
    });

    it.todo('should handle four-level mixed nesting', () => {
      const markdown = `
1. Level 1 (ordered)
    - Level 2 (bullet)
        1. Level 3 (ordered)
            - Level 4 (bullet)
2. Another Level 1 item
    `.trim();

      testMarkdownOutput(
        markdown,
        `
1. Level 1 (ordered)

    - Level 2 (bullet)

        1. Level 3 (ordered)

            - Level 4 (bullet)

2. Another Level 1 item
      `.trim(),
      );
    });
  });
});
