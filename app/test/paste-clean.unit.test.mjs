// Paste cleaner (app/src/notes/paste-clean.js, ported from the logbook's): rich text (HTML) from web pages, Word, Google Docs, OneNote and UpNote to light
// Markdown, and tidying Markdown already in a note. Fake text only.
import test from 'node:test';
import assert from 'node:assert/strict';
import { htmlToMarkdown, tidyMarkdown, decodeEntities, normaliseChars } from '../src/notes/paste-clean.js';

test('paste-clean: HTML to Markdown, and tidying', () => {
  // entities and odd characters
  assert.equal(decodeEntities('a&nbsp;b &amp; &lt;c&gt; &#8217; &#x2014; &unknown;'), 'a b & <c> ’ — &unknown;');
  assert.equal(normaliseChars('“quoted” ‘x’ y​'), '"quoted" \'x\' y');

  // Google Docs: the outer <b style="font-weight:normal"> isn't bold; spans carry bold and italic
  assert.equal(htmlToMarkdown('<meta charset="utf-8"><b style="font-weight:normal;" id="docs-internal-guid-1"><p dir="ltr"><span style="font-weight:700">Plan</span><span> for </span><span style="font-style:italic">today</span></p><ul><li><p>One&nbsp;thing</p></li><li><p>Two <a href="https://example.com">docs</a></p></li></ul></b>'),
    '**Plan** for *today*\n\n- One thing\n- Two [docs](https://example.com)');

  // headings, paragraphs, smart quotes, marks with spaces inside, empty marks, nested and numbered lists
  assert.equal(htmlToMarkdown('<h1>Title</h1><h4>Small</h4><p>Para “quoted” <strong> bold </strong>end.</p><p></p><p><em></em>x</p><ol start="3"><li>a<ul><li>b</li></ul></li><li>c</li></ol>'),
    '# Title\n\n### Small\n\nPara "quoted" **bold** end.\n\nx\n\n3. a\n  - b\n4. c');

  // tables become pipe tables; divs (Gmail, Keep) are lines; <br> is a line break
  assert.equal(htmlToMarkdown('<table><tr><th>Drug</th><th>Dose</th></tr><tr><td>Fake A</td><td><p>1 mg</p></td></tr></table><div>line1</div><div>line2<br>line3</div>'),
    '| Drug | Dose |\n| --- | --- |\n| Fake A | 1 mg |\n\nline1\nline2\nline3');

  // to-do boxes; nested bold in italic; unsafe links lose the link, keep the words
  assert.equal(htmlToMarkdown('<ul><li><input type="checkbox" checked> done</li><li><input type="checkbox"> todo</li></ul><i><b>x</b></i> <a href="javascript:alert(1)">bad</a>'),
    '- [x] done\n- [ ] todo\n\n***x*** bad');

  // Word: Office tags, list symbols in spans, scripts and styles dropped; the clipboard's fragment markers honoured
  assert.equal(htmlToMarkdown('<html><head><style>p{color:red}</style></head><body><!--StartFragment--><p class=MsoListParagraph><span>·<span>&nbsp;&nbsp;&nbsp; </span></span>Item<o:p></o:p></p><script>alert(1)</script><!--EndFragment--></body></html>'), '- Item');

  // a link whose words are its address stays a bare address; a bold link loses the stars inside the brackets
  assert.equal(htmlToMarkdown('<a href="https://example.org/x">https://example.org/x</a>'), 'https://example.org/x');
  assert.equal(htmlToMarkdown('<a href="https://example.org"><b>Fake site</b></a>'), '[Fake site](https://example.org)');
  // plain words and stray < survive; nothing is HTML any more
  assert.equal(htmlToMarkdown('2 < 3 and <span>4 &gt; 1</span>'), '2 < 3 and 4 > 1');
  assert.equal(htmlToMarkdown(''), '');

  // a heading, a list with a to-do
  assert.equal(htmlToMarkdown('<h2>Fake list</h2><ul><li><input type="checkbox"> read</li></ul>'), '## Fake list\n\n- [ ] read');

  // tidying Markdown already pasted (UpNote / OneNote leftovers)
  assert.equal(tidyMarkdown('1\\. one\n\n2\\. two\n**  **\n• bullet\nword  word **bold **x\n- []  box\n☐ todo\n☑ done\n\n\n\nend  '),
    '1. one\n2. two\n\n- bullet\nword word **bold** x\n- [ ] box\n- [ ] todo\n- [x] done\n\nend');
  assert.equal(tidyMarkdown('**a** b **c**'), '**a** b **c**');                 // nothing to change
  assert.equal(tidyMarkdown('**  lead** and **trail  **'), '**lead** and **trail**');
  assert.equal(tidyMarkdown('  - nested  item'), '  - nested item');            // the indent of a nested list stays
  assert.equal(tidyMarkdown('para one\n\n  \n\npara two'), 'para one\n\npara two');
  assert.equal(tidyMarkdown('a\r\nb\\_c'), 'a\nb_c');

  // only what is clearly a leftover: two lists of different kinds stay apart, ☒ stays, real backslashes and code stay
  assert.equal(tidyMarkdown('- a\n- b\n\n1. one\n2. two'), '- a\n- b\n\n1. one\n2. two');
  assert.equal(tidyMarkdown('- a\n\n- b\n\n\n1. one\n\n2. two'), '- a\n- b\n\n1. one\n2. two');
  assert.equal(tidyMarkdown('☒ no allergy'), '☒ no allergy');
  assert.equal(tidyMarkdown('\\\\server\\share and C:\\temp'), '\\\\server\\share and C:\\temp');
  assert.equal(tidyMarkdown('a `x\\*y` \\*b'), 'a `x\\*y` *b');
  assert.equal(tidyMarkdown('```\ndef f():\n    return  1\n\n\n\\*\n```\nafter  x'), '```\ndef f():\n    return  1\n\n\n\\*\n```\nafter x');
  assert.equal(htmlToMarkdown('<pre>def f():\n    return  1</pre><p>next</p>'), '```\ndef f():\n    return  1\n```\n\nnext');

  // Word lists: the marker sits in <![if !supportLists]> (or the same in comments); bullets, numbers, a second level
  const wordItem = (marker, text, level = 1, cmt = false) => `<p class=MsoListParagraphCxSpMiddle style='text-indent:-18.0pt;mso-list:l0 level${level} lfo1'>${cmt ? '<!--[if !supportLists]-->' : '<![if !supportLists]>'}<span style='font-family:Symbol'><span style='mso-list:Ignore'>${marker}<span style='font:7.0pt "Times New Roman"'>&nbsp;&nbsp;&nbsp;&nbsp;&nbsp; </span></span></span>${cmt ? '<!--[endif]-->' : '<![endif]>'}${text}<o:p></o:p></p>`;
  assert.equal(htmlToMarkdown(wordItem('·', 'First item') + wordItem('·', 'Second item')), '- First item\n- Second item');
  assert.equal(htmlToMarkdown(wordItem('1.', 'Alpha') + wordItem('2.', 'Beta') + wordItem('o', 'Sub', 2)), '1. Alpha\n2. Beta\n  - Sub');
  assert.equal(htmlToMarkdown(wordItem('a)', 'One', 1, true) + wordItem('b)', 'Two', 1, true)), '1. One\n2. Two');
  assert.equal(htmlToMarkdown('<p class=MsoNormal>Plain <b>para</b></p>' + wordItem('§', 'Wingdings bullet')), 'Plain **para**\n\n- Wingdings bullet');

  // bold right after bold-and-punctuation: each ** pair kept as it was (not "sepsis,** Plan**")
  assert.equal(tidyMarkdown('**Dx**: sepsis, **Plan**: abx'), '**Dx**: sepsis, **Plan**: abx');
  assert.equal(tidyMarkdown('**Bold**, then **more**'), '**Bold**, then **more**');
  assert.equal(htmlToMarkdown('<p><b>Dx</b>: sepsis, <b>Plan</b>: abx</p>'), '**Dx**: sepsis, **Plan**: abx');
  assert.equal(tidyMarkdown('a ** b** c'), 'a **b** c');
  // a bold run starting with a link; a $ in a link's text
  assert.equal(htmlToMarkdown('<p><b><a href="https://x.com">Guideline</a> for sepsis</b></p>'), '**[Guideline](https://x.com) for sepsis**');
  assert.equal(htmlToMarkdown('<p><a href="https://x.com">Cost $& more</a></p>'), '[Cost $& more](https://x.com)');
  // inline code keeps its backslashes and spaces; Clean up leaves a regex's escapes
  assert.equal(htmlToMarkdown('<p>Pattern <code>^\\d+\\.\\s(\\w+)</code></p>'), 'Pattern `^\\d+\\.\\s(\\w+)`');
  assert.equal(htmlToMarkdown('<p><code>x  y</code></p>'), '`x  y`');
  assert.equal(tidyMarkdown('Regex ^\\d+\\.\\s and \\(x\\)'), 'Regex ^\\d+\\.\\s and \\(x\\)');
  assert.equal(tidyMarkdown('1\\. one\n\\- two'), '1. one\n- two');
});
