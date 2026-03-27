/**
 * Blendet Header und Footer aus oder ein je nach Modus
 * @param hide - Sollen Header und Footer ausgeblendet werden
 */
export const toggleHeaderFooter = (hide: boolean): void => {
  const header = document.querySelector('.header') as HTMLElement | null;
  const footer = document.querySelector('footer') as HTMLElement | null;

  if (header) {
    header.style.display = hide ? 'none' : '';
  }

  if (footer) {
    footer.style.display = hide ? 'none' : '';
  }
};
