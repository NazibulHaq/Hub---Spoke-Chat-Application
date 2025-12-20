import React from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkBreaks from 'remark-breaks';
import { cn } from '@/lib/utils';

interface MessageContentProps {
    content: string;
    className?: string;
    isOwnMessage?: boolean;
}

export function MessageContent({ content, className, isOwnMessage }: MessageContentProps) {
    return (
        <div className={cn("prose prose-sm max-w-none break-words leading-relaxed", className)}>
            <ReactMarkdown
                remarkPlugins={[remarkGfm, remarkBreaks]}
                components={{
                    a: ({ node, href, children, ...props }) => (
                        <a
                            href={href}
                            target="_blank"
                            rel="noopener noreferrer"
                            className={cn(
                                "underline font-medium break-all hover:opacity-80 transition-opacity",
                                // If it's my message (blue bg), link is white. Else (white bg), link is blue.
                                isOwnMessage ? "text-white" : "text-blue-600"
                            )}
                            onClick={(e) => e.stopPropagation()} // Prevent bubbling if needed
                            {...props}
                        >
                            {children}
                        </a>
                    ),
                    p: ({ children }) => (
                        <p className="mb-0 last:mb-0 inline-block">{children}</p>
                    ),
                    // Disable other heavy block elements if we want to keep it simple, or styling them
                    ul: ({ children }) => <ul className="pl-4 list-disc my-1">{children}</ul>,
                    ol: ({ children }) => <ol className="pl-4 list-decimal my-1">{children}</ol>,
                }}
            >
                {content}
            </ReactMarkdown>
        </div>
    );
}
