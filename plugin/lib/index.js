/**
 * 550W-MOSS — host half.
 *
 * The skin is entirely a browser-side concern (theme tokens, stylesheet, lens
 * overlay, account chip), so the host half is intentionally inert. It exists
 * because a DSH bundle row needs a loadable module: `cordis.patch.yml` mounts
 * it, and the package's `dsh.client` block ships `lib/client.js` to the browser.
 */

const name = '550w-moss'

function apply() {
  // no host-side behaviour
}

export { apply, name }
