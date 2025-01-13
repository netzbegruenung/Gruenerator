import { useState, useCallback } from 'react';
import { DEFAULT_COLORS } from '../../../../components/utils/constants';

export const useQuoteForm = () => {
    const [quote, setQuote] = useState('');
    const [name, setName] = useState('');
    const [fontSize, setFontSize] = useState(85);
    const [colorScheme, setColorScheme] = useState(DEFAULT_COLORS[0]);
    const [credit, setCredit] = useState('');
    
    const handleChange = useCallback((e) => {
        const { name: fieldName, value } = e.target;
        switch (fieldName) {
            case 'quote':
                setQuote(value);
                break;
            case 'name':
                setName(value);
                break;
            case 'fontSize':
                setFontSize(Number(value));
                break;
            case 'credit':
                setCredit(value);
                break;
            default:
                console.warn('Unhandled field:', fieldName);
        }
    }, []);
    
    const setQuoteColorScheme = useCallback((newColorScheme) => {
        setColorScheme(newColorScheme);
    }, []);
    
    return {
        quoteData: {
            quote,
            name,
            fontSize,
            colorScheme,
            credit
        },
        handleQuoteChange: handleChange,
        setQuoteColorScheme
    };
}; 