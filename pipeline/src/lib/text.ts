import * as cheerio from "cheerio";

const BLOCK_END = /<\/(p|div|h[1-6]|li|blockquote|pre|tr|section|article)>|<br\s*\/?>/gi;

/** HTML fragment → readable plain text (paragraphs kept as blank-line breaks, entities decoded). */
export function htmlToText(html: string): string {
  const $ = cheerio.load(html.replace(BLOCK_END, (m) => `${m}\n\n`));
  $("script, style, noscript, iframe, svg, figure, button, form").remove();
  return $.root()
    .text()
    .replace(/[ \t ]+/g, " ")
    .replace(/ *\n */g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/** Decode HTML entities in a short string such as a title ("It&#8217;s" → "It’s"). */
export function decodeEntities(text: string): string {
  return cheerio.load(`<p>${text}</p>`)("p").text().trim();
}
