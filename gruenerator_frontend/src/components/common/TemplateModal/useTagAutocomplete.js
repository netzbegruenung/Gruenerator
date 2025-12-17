import { useTextAutocomplete, TAG_DICTIONARY } from '../../../hooks/useTextAutocomplete';

/**
 * useTagAutocomplete - Tag autocomplete for template descriptions
 * Wrapper around useTextAutocomplete with TAG_DICTIONARY
 *
 * @deprecated Use useTextAutocomplete directly for more flexibility
 */
export function useTagAutocomplete(value, setValue) {
  return useTextAutocomplete(value, setValue, {
    dictionary: TAG_DICTIONARY,
    minChars: 3,
    addHashtagOnAccept: true
  });
}

export default useTagAutocomplete;
