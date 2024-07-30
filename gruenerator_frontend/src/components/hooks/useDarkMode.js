import { useState, useEffect } from 'react';

const STORAGE_KEY = 'darkMode';
const USER_PREFERENCE_EXPIRY = 7 * 24 * 60 * 60 * 1000; // 7 days in milliseconds

const isMobile = () => {
    return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
};

const useDarkMode = () => {
    const [darkMode, setDarkMode] = useState(() => {
        if (isMobile()) {
            return window.matchMedia('(prefers-color-scheme: dark)').matches;
        }
        
        const savedMode = localStorage.getItem(STORAGE_KEY);
        if (savedMode) {
            const { value, timestamp } = JSON.parse(savedMode);
            const now = new Date().getTime();
            if (now - timestamp < USER_PREFERENCE_EXPIRY) {
                return value;
            }
        }
        return window.matchMedia('(prefers-color-scheme: dark)').matches;
    });

    useEffect(() => {
        const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
        const handleChange = (e) => {
            if (isMobile()) {
                setDarkMode(e.matches);
                return;
            }

            const savedMode = localStorage.getItem(STORAGE_KEY);
            if (!savedMode || JSON.parse(savedMode).timestamp + USER_PREFERENCE_EXPIRY < new Date().getTime()) {
                setDarkMode(e.matches);
            }
        };

        mediaQuery.addListener(handleChange);
        return () => mediaQuery.removeListener(handleChange);
    }, []);

    useEffect(() => {
        if (!isMobile()) {
            const data = JSON.stringify({
                value: darkMode,
                timestamp: new Date().getTime()
            });
            localStorage.setItem(STORAGE_KEY, data);
        }
        
        if (darkMode) {
            document.documentElement.setAttribute('data-theme', 'dark');
        } else {
            document.documentElement.setAttribute('data-theme', 'light');
        }
    }, [darkMode]);

    const toggleDarkMode = () => {
        if (!isMobile()) {
            setDarkMode(prevMode => !prevMode);
        }
    };

    return [darkMode, toggleDarkMode];
};

export default useDarkMode;