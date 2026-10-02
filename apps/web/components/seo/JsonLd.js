/**
 * JSON-LD block.
 *
 * Renders a schema.org object into a script tag. `JSON.stringify` output is
 * escaped for `</script>` so admin-authored text containing markup cannot break
 * out of the tag — a real concern because blog titles and company descriptions
 * are database values.
 *
 * Nothing here is rendered on an admin page. Structured data describes what a
 * search engine can see, and the admin area is not something it should see.
 */
export function JsonLd({ data, id }) {
  if (!data) return null;

  // @graph is valid at the top level; anything else must be a single object or
  // an array.
  const payload = data['@graph'] ? data : Array.isArray(data) ? data : [data];

  const serialised = JSON.stringify(payload)
    // Neutralise a closing script tag inside any string value.
    .replace(/</g, '\\u003c')
    .replace(/>/g, '\\u003e')
    // Strip characters that can terminate an attribute if the value is ever
    // interpolated.
    .replace(/&/g, '\\u0026');

  return (
    <script
      type="application/ld+json"
      id={id}
      // Content is a JSON string, so React escapes it. suppressHydrationWarning
      // avoids a mismatch between the server output and the client's parse.
      dangerouslySetInnerHTML={{ __html: serialised }}
    />
  );
}

/**
 * Convenience wrapper for the common case: an array of schema objects for one
 * page. Skips anything null so a caller can pass conditional blocks inline.
 */
export function JsonLdGroup({ items, id }) {
  const clean = (items || []).filter(Boolean);
  if (!clean.length) return null;
  return <JsonLd data={clean} id={id} />;
}

export default JsonLd;