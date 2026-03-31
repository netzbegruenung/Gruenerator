import React from 'react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';

const NotFound = () => {
    return (
        <div className="min-h-screen flex flex-col items-center justify-center bg-gray-100 text-center p-6">
            <div className="max-w-lg mx-auto bg-white shadow-md rounded-lg p-8">
                <img
                    src="/404.svg"
                    alt="Seite nicht gefunden"
                    className="w-3/4 mx-auto mb-6"
                />
                <h1 className="text-3xl font-bold text-gray-800 mb-4">
                    Seite nicht gefunden
                </h1>
                <p className="text-lg text-gray-600 mb-4">
                    Diese Seite existiert leider nicht. Aber keine Sorge — jede großartige Präsentation beginnt mit einer leeren Folie!
                </p>

                <div className="flex justify-center space-x-4 mb-8">
                    <Link href="/dashboard">
                        <Button className="bg-green-600 text-white px-6 py-2 rounded-md hover:bg-green-700">
                            Zur Startseite
                        </Button>
                    </Link>
                    <Link href="/contact">
                        <Button className="bg-gray-600 text-white px-6 py-2 rounded-md hover:bg-gray-700">
                            Support kontaktieren
                        </Button>
                    </Link>
                </div>

            </div>
        </div>
    );
};

export default NotFound;