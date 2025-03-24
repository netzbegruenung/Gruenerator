/**
 * Blendet Header und Footer aus oder ein je nach Modus
 * @param {boolean} hide - Sollen Header und Footer ausgeblendet werden
 */
export const toggleHeaderFooter = (hide) => {
    const header = document.querySelector('.header');
    const footer = document.querySelector('footer');
    
    if (header) {
        header.style.display = hide ? 'none' : '';
    }
    
    if (footer) {
        footer.style.display = hide ? 'none' : '';
    }
}; 