/**
 * Route transition.
 *
 * `template.js` re-mounts on every navigation, so this class plays the entrance
 * animation each time a visitor moves between pages. It is pure CSS — no client
 * JavaScript, and it is disabled automatically for reduced-motion users by the
 * global rule in globals.css.
 */
export default function PublicTemplate({ children }) {
  return <div className="page-enter">{children}</div>;
}
