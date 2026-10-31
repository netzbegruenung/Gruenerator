// Farbige Kacheln (Look wie das Arbeiten-Tool-Grid) für Tools und Notebooks:
// ein Pink mit eigenem Dunkel-Paar.
// Klassen literal, damit Tailwind-JIT sie behält.
export interface WissenTilePalette {
  tile: string;
  icon: string;
  titleColor: string;
  descColor: string;
}

export const WISSEN_TILE: WissenTilePalette = {
  tile: 'bg-[#FCDDE4] hover:shadow-[0_14px_30px_rgba(214,0,74,0.18)] dark:bg-[#2C121A]',
  icon: 'text-[#C80050] dark:text-[#EE6090]',
  titleColor: 'text-[#A00044] dark:text-[#F2A6C0]',
  descColor: 'text-[#8C5666] dark:text-[#BA7892]',
};
