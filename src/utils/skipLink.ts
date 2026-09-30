/**
 * Accessibility utility for "Skip to Main Content" functionality.
 *
 * Supports:
 * - Direct window scrolling or internal container scrolling
 * - Sticky/fixed header offset calculation to prevent content from being obscured
 * - Programmatic focus transfer to <main id="main-content" tabIndex={-1}>
 * - Works cleanly with React Router without reloading or unexpected routing
 */

export const handleSkipToMainContent = (
  e?: React.MouseEvent<HTMLAnchorElement> | React.KeyboardEvent<HTMLAnchorElement>
) => {
  // If keyboard event, only trigger on Enter or Space
  if (e && 'key' in e && e.key !== 'Enter' && e.key !== ' ') {
    return;
  }

  if (e) {
    e.preventDefault();
  }

  const mainElement = document.getElementById('main-content');
  if (!mainElement) {
    console.warn('[Accessibility] Skip to Main Content target #main-content was not found in the DOM.');
    return;
  }

  // Ensure element can receive programmatic focus
  if (!mainElement.hasAttribute('tabindex')) {
    mainElement.setAttribute('tabindex', '-1');
  }

  // 1. Identify if an ancestor container is scrollable rather than the window
  let scrollContainer: HTMLElement | null = null;
  let parent = mainElement.parentElement;
  while (parent && parent !== document.body && parent !== document.documentElement) {
    const style = window.getComputedStyle(parent);
    const overflowY = style.overflowY;
    if (
      (overflowY === 'auto' || overflowY === 'scroll') &&
      parent.scrollHeight > parent.clientHeight
    ) {
      scrollContainer = parent;
      break;
    }
    parent = parent.parentElement;
  }

  // 2. Calculate dynamic sticky/fixed header offset
  const stickyHeaders = Array.from(
    document.querySelectorAll<HTMLElement>('header, nav, div')
  ).filter((el) => {
    if (el.offsetHeight === 0) return false;
    const style = window.getComputedStyle(el);
    const isStickyOrFixed = style.position === 'sticky' || style.position === 'fixed';
    if (!isStickyOrFixed) return false;
    const rect = el.getBoundingClientRect();
    return rect.top <= 25 && rect.bottom > 0;
  });

  let maxHeaderBottom = 0;
  for (const header of stickyHeaders) {
    const rect = header.getBoundingClientRect();
    if (rect.bottom > maxHeaderBottom) {
      maxHeaderBottom = rect.bottom;
    }
  }

  // Fallback to 80px if no explicit sticky header is detected
  const headerOffset = maxHeaderBottom > 0 ? maxHeaderBottom + 16 : 80;

  // 3. Perform smooth scrolling to the main content element
  if (scrollContainer) {
    const containerRect = scrollContainer.getBoundingClientRect();
    const targetRect = mainElement.getBoundingClientRect();
    const scrollOffset =
      scrollContainer.scrollTop + (targetRect.top - containerRect.top) - headerOffset;

    scrollContainer.scrollTo({
      top: Math.max(0, scrollOffset),
      behavior: 'smooth',
    });
  } else {
    const targetRect = mainElement.getBoundingClientRect();
    const scrollOffset = window.scrollY + targetRect.top - headerOffset;

    window.scrollTo({
      top: Math.max(0, scrollOffset),
      behavior: 'smooth',
    });
  }

  // If the main element itself has an internal scrollbar, scroll it to the top
  if (mainElement.scrollTop > 0) {
    mainElement.scrollTo({ top: 0, behavior: 'smooth' });
  }

  // 4. Move keyboard focus to main content without native scroll jump
  mainElement.focus({ preventScroll: true });

  // Update hash for screen reader tracking without route reload
  if (window.history && window.history.replaceState) {
    window.history.replaceState(null, '', '#main-content');
  }
};
