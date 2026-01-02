import {
    QuoteBlock,
    InfoBox,
    FactBox,
    CalloutBlock,
    TimelineBlock
} from './blocks';

interface ContentBlock {
    type: 'paragraph' | 'heading2' | 'heading3' | 'heading4' | 'quote' | 'infoBox' | 'factBox' | 'callout' | 'timeline' | 'html';
    text?: string;
    author?: string;
    title?: string;
    items?: string[];
    variant?: string;
    content?: string;
    facts?: Array<{ number: string; label: string }>;
    buttonText?: string;
    buttonHref?: string;
    onClick?: () => void;
}

interface PageContentProps {
    content?: ContentBlock[] | string;
    children?: React.ReactNode;
}

const PageContent = ({ content, children }: PageContentProps) => {
    // If children are provided directly, use them
    if (children) {
        return (
            <div className="page-content">
                {children}
            </div>
        );
    }

    // If structured content is provided, render it
    if (content && Array.isArray(content)) {
        return (
            <div className="page-content">
                {content.map((block, index) => {
                    switch (block.type) {
                        case 'paragraph':
                            return (
                                <p key={index}>
                                    {block.text}
                                </p>
                            );

                        case 'heading2':
                            return (
                                <h2 key={index}>
                                    {block.text}
                                </h2>
                            );

                        case 'heading3':
                            return (
                                <h3 key={index}>
                                    {block.text}
                                </h3>
                            );

                        case 'heading4':
                            return (
                                <h4 key={index}>
                                    {block.text}
                                </h4>
                            );

                        case 'quote':
                            return (
                                <QuoteBlock
                                    key={index}
                                    text={block.text}
                                    author={block.author}
                                    title={block.title}
                                />
                            );

                        case 'infoBox':
                            return (
                                <InfoBox
                                    key={index}
                                    title={block.title}
                                    items={block.items}
                                    variant={block.variant as 'default' | 'success' | 'warning' | 'info'}
                                >
                                    {block.content}
                                </InfoBox>
                            );

                        case 'factBox':
                            return (
                                <FactBox
                                    key={index}
                                    facts={block.facts}
                                />
                            );

                        case 'callout':
                            return (
                                <CalloutBlock
                                    key={index}
                                    title={block.title}
                                    text={block.text}
                                    buttonText={block.buttonText}
                                    buttonHref={block.buttonHref}
                                    onClick={block.onClick}
                                />
                            );

                        case 'timeline':
                            return (
                                <TimelineBlock
                                    key={index}
                                    items={block.items}
                                />
                            );

                        case 'html':
                            return (
                                <div
                                    key={index}
                                    dangerouslySetInnerHTML={{ __html: block.content }}
                                />
                            );

                        default:
                            console.warn(`Unknown content block type: ${block.type}`);
                            return null;
                    }
                })}
            </div>
        );
    }

    // If string content is provided, render as paragraph
    if (typeof content === 'string') {
        return (
            <div className="page-content">
                <p>{content}</p>
            </div>
        );
    }

    // Fallback for no content
    return (
        <div className="page-content">
            <p>Kein Inhalt verfügbar.</p>
        </div>
    );
};

export default PageContent;
